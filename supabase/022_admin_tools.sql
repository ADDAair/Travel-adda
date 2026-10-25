-- 022: admin panel, part 1. Run AFTER 021. Safe to run more than once.
--  1) contracts: search, one page with terms / payments / payouts / complaints / notes; admin notes (logged)
--  2) one page per user: contracts, payments, complaints, reports, groups, khadem roles (documents stay private)
--  3) pending counts for each admin section
--  4) hide a rating comment (stars still count), logged
--  5) unlist a leader from the directory and the Offers page without closing the account
--  6) forced update: minimum app version and the store link (https only)
--  7) video link per page, set by the admin (https only), read by everyone signed in
--  8) groups & khadems overview (no message text)

-- helper: staff who handle disputes (payments or complaints or users)
create or replace function public.can_disputes() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_perm('payments') or public.has_perm('complaints') or public.has_perm('users');
$$;
revoke all on function public.can_disputes() from public, anon, authenticated;

-- 1) Contracts ----------------------------------------------------------------------------------------------------
create table if not exists public.contract_notes (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.haji_contracts(id) on delete cascade,
  author      uuid references public.profiles(id) on delete set null,
  note        text not null check (char_length(trim(note)) between 5 and 1000),
  created_at  timestamptz not null default now()
);
create index if not exists contract_notes_by_contract on public.contract_notes (contract_id, created_at);
alter table public.contract_notes enable row level security;
revoke all on public.contract_notes from anon, authenticated;

drop function if exists public.admin_find_contracts(text);
create function public.admin_find_contracts(p_query text)
returns table (id uuid, contract_no text, status text, kind text, title text, price_bdt numeric, haji_name text, haji_code text,
               leader_name text, leader_code text, created_at timestamptz, paid_confirmed numeric, paid_waiting numeric, open_complaints int)
language plpgsql stable security definer set search_path = '' as $$
declare q text := upper(trim(coalesce(p_query, '')));
begin
  if not public.can_disputes() then raise exception 'not allowed'; end if;
  q := translate(q, '০১২৩৪৫৬৭৮৯', '0123456789');
  return query
    select c.id, c.contract_no, c.status, c.kind, c.title, c.price_bdt, c.haji_name, c.haji_code, c.leader_name, c.leader_code, c.created_at,
           coalesce((select sum(p.amount) from public.haji_payments p where p.contract_id = c.id and p.status = 'confirmed'), 0),
           coalesce((select sum(p.amount) from public.haji_payments p where p.contract_id = c.id and p.status = 'submitted'), 0),
           (select count(*)::int from public.complaints m where m.contract_id = c.id and m.status = 'pending')
      from public.haji_contracts c
     where q = '' or upper(c.contract_no) = q or upper(c.haji_code) = q or upper(c.leader_code) = q
        or c.haji_name ilike '%' || trim(p_query) || '%' or c.leader_name ilike '%' || trim(p_query) || '%'
     order by c.created_at desc limit 100;
end $$;

create or replace function public.admin_contract_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.can_disputes() then raise exception 'not allowed'; end if;
  select to_jsonb(c) || jsonb_build_object(
    'payments', coalesce((select jsonb_agg(jsonb_build_object('amount', p.amount, 'method', p.method, 'txn_ref', p.txn_ref, 'paid_on', p.paid_on,
                  'status', p.status, 'admin_note', p.admin_note, 'created_at', p.created_at) order by p.created_at) from public.haji_payments p where p.contract_id = c.id), '[]'),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('payee', o.payee, 'amount', o.amount, 'txn_ref', o.txn_ref, 'note', o.note, 'created_at', o.created_at)
                  order by o.created_at) from public.payouts o where o.contract_id = c.id), '[]'),
    'complaints', coalesce((select jsonb_agg(jsonb_build_object('body', m.body, 'status', m.status, 'admin_note', m.admin_note, 'created_at', m.created_at)
                  order by m.created_at) from public.complaints m where m.contract_id = c.id), '[]'),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('note', n.note, 'author', a.full_name, 'created_at', n.created_at) order by n.created_at)
                  from public.contract_notes n left join public.profiles a on a.id = n.author where n.contract_id = c.id), '[]'),
    'rating', (select jsonb_build_object('stars', g.stars, 'comment', g.comment, 'hidden', g.comment_hidden) from public.leader_ratings g where g.contract_id = c.id))
    into r from public.haji_contracts c where c.id = p_id;
  return r;
end $$;

create or replace function public.admin_add_contract_note(p_id uuid, p_note text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_disputes() then raise exception 'not allowed'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 5 then raise exception 'note too short'; end if;
  if not exists (select 1 from public.haji_contracts where id = p_id) then return 'not_found'; end if;
  insert into public.contract_notes (contract_id, author, note) values (p_id, (select auth.uid()), left(trim(p_note), 1000));
  perform public.log_admin('contract_note', null, (select contract_no from public.haji_contracts where id = p_id) || ': ' || left(trim(p_note), 200));
  return 'ok';
end $$;

-- 2) One user, everything (documents stay private) ------------------------------------------------------------------
create or replace function public.admin_user_detail(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.has_perm('users') then raise exception 'not allowed'; end if;
  select jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'code', p.haji_code, 'phone', p.phone, 'email', p.email, 'account_type', p.account_type,
    'role', p.role, 'status', p.status, 'verified', p.verified, 'created_at', p.created_at,
    'leader', (select jsonb_build_object('agency', l.agency_name, 'kind', l.leader_kind, 'district', l.district, 'listed', coalesce(l.listed, true),
                 'profession', l.profession) from public.leader_profiles l where l.user_id = p.id),
    'contracts', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'contract_no', c.contract_no, 'status', c.status, 'title', c.title,
                   'price_bdt', c.price_bdt, 'other', case when c.haji_id = p.id then c.leader_name || ' (' || c.leader_code || ')' else c.haji_name || ' (' || c.haji_code || ')' end,
                   'as', case when c.haji_id = p.id then 'haji' else 'leader' end) order by c.created_at desc)
                 from public.haji_contracts c where c.haji_id = p.id or c.leader_id = p.id), '[]'),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('amount', y.amount, 'status', y.status, 'txn_ref', y.txn_ref, 'paid_on', y.paid_on) order by y.created_at desc)
                 from public.haji_payments y join public.haji_contracts c on c.id = y.contract_id where c.haji_id = p.id or c.leader_id = p.id), '[]'),
    'complaints_by', coalesce((select jsonb_agg(jsonb_build_object('body', m.body, 'status', m.status)) from public.complaints m where m.haji_id = p.id), '[]'),
    'complaints_against', coalesce((select jsonb_agg(jsonb_build_object('body', m.body, 'status', m.status)) from public.complaints m where m.leader_id = p.id), '[]'),
    'reports_against', coalesce((select jsonb_agg(jsonb_build_object('reason', u.reason, 'details', u.details, 'status', u.status)) from public.user_reports u where u.target = p.id), '[]'),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('name', g.name, 'status', m.status)) from public.group_members m join public.groups g on g.id = m.group_id where m.user_id = p.id), '[]'),
    'leads_groups', coalesce((select jsonb_agg(jsonb_build_object('name', g.name, 'active', g.active)) from public.groups g where g.leader_id = p.id), '[]'),
    'khadem_of', coalesce((select jsonb_agg(jsonb_build_object('name', g.name)) from public.group_staff s join public.groups g on g.id = s.group_id where s.user_id = p.id), '[]'))
    into r from public.profiles p where p.id = p_user;
  perform public.log_admin('user_viewed', p_user, null);
  return r;
end $$;

-- 3) Pending counts (each number only for staff allowed to act on it) ----------------------------------------------
create or replace function public.admin_counts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb := '{}';
begin
  if coalesce(array_length(public.my_perms(), 1), 0) = 0 then raise exception 'not allowed'; end if;
  if public.has_perm('applications') then r := r || jsonb_build_object('apps', (select count(*) from public.leader_applications where status = 'pending')); end if;
  if public.has_perm('calls') then r := r || jsonb_build_object('calls', (select count(*) from public.offer_interests where status = 'new')); end if;
  if public.has_perm('complaints') then r := r || jsonb_build_object('complaints', (select count(*) from public.complaints where status = 'pending')); end if;
  if public.has_perm('reports') or public.has_perm('users') then
    r := r || jsonb_build_object('reports', (select count(*) from public.user_reports where status = 'new')
                                           + (select count(*) from public.leader_referrals where cancel_requested)); end if;
  if public.has_perm('payments') then r := r || jsonb_build_object('payments', (select count(*) from public.haji_payments where status = 'submitted')); end if;
  if public.has_perm('offers') then r := r || jsonb_build_object('offers', (select count(*) from public.offers where review = 'pending' and return_on >= current_date)); end if;
  return r;
end $$;

-- 4) Rating comments ----------------------------------------------------------------------------------------------
alter table public.leader_ratings add column if not exists comment_hidden boolean not null default false;
alter table public.leader_ratings add column if not exists hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 300);

drop function if exists public.admin_list_ratings(text);
create function public.admin_list_ratings(p_query text)
returns table (contract_id uuid, contract_no text, stars int, comment text, comment_hidden boolean, hidden_reason text, leader_name text, leader_code text,
               haji_name text, counted boolean, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm('complaints') then raise exception 'not allowed'; end if;
  return query
    select r.contract_id, c.contract_no, r.stars, r.comment, r.comment_hidden, r.hidden_reason, c.leader_name, c.leader_code, c.haji_name,
           public.rating_counts(r.contract_id), r.updated_at
      from public.leader_ratings r join public.haji_contracts c on c.id = r.contract_id
     where r.comment is not null and trim(r.comment) <> ''
       and (p_query is null or trim(p_query) = '' or upper(c.leader_code) = upper(trim(p_query)) or c.leader_name ilike '%' || trim(p_query) || '%')
     order by r.updated_at desc limit 200;
end $$;

create or replace function public.admin_hide_rating(p_contract uuid, p_hide boolean, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_leader uuid;
begin
  if not public.has_perm('complaints') then raise exception 'not allowed'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason needed'; end if;
  update public.leader_ratings set comment_hidden = coalesce(p_hide, false), hidden_reason = left(trim(p_reason), 300)
   where contract_id = p_contract returning leader_id into v_leader;
  if v_leader is null then return 'not_found'; end if;
  perform public.log_admin(case when p_hide then 'rating_hidden' else 'rating_shown' end, v_leader, left(trim(p_reason), 200));
  return 'ok';
end $$;

create or replace function public.leader_reviews(p_leader uuid)
returns table (kind text, stars int, body text, at timestamptz)
language sql stable security definer set search_path = '' as $$
  (select 'rating', r.stars, r.comment, r.updated_at from public.leader_ratings r
    where (select auth.uid()) is not null and r.leader_id = p_leader and public.rating_counts(r.contract_id) and not r.comment_hidden and r.comment is not null and trim(r.comment) <> ''
    order by r.updated_at desc limit 50)
  union all
  (select 'complaint', null::int, c.body, c.created_at from public.complaints c
    where (select auth.uid()) is not null and c.leader_id = p_leader and c.status = 'verified'
    order by c.created_at desc limit 50);
$$;

-- 5) Unlist a leader -----------------------------------------------------------------------------------------------
alter table public.leader_profiles add column if not exists listed boolean not null default true;

create or replace function public.admin_set_leader_listed(p_user uuid, p_listed boolean, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('users') then raise exception 'not allowed'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason needed'; end if;
  update public.leader_profiles set listed = coalesce(p_listed, true) where user_id = p_user;
  if not found then return 'not_found'; end if;
  perform public.log_admin(case when p_listed then 'leader_listed' else 'leader_unlisted' end, p_user, left(trim(p_reason), 200));
  return 'ok';
end $$;

create or replace function public.list_leaders(p_district text default null, p_search text default null)
returns table (id uuid, full_name text, leader_code text, agency_name text, district text, upazila text, avatar_path text,
               umrah_license text, hajj_license text, rating_avg numeric, rating_count int, complaints_verified int, only_mine boolean,
               union_name text, leader_kind text, profession text)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
       ref as (select public.active_referral_leader((select uid from me)) as lid)
  select p.id, p.full_name, p.haji_code, l.agency_name, l.district, l.upazila, p.avatar_path, l.umrah_license, l.hajj_license,
         round(coalesce((select avg(r.stars) from public.leader_ratings r where r.leader_id = p.id and public.rating_counts(r.contract_id)), 0), 1),
         (select count(*)::int from public.leader_ratings r where r.leader_id = p.id and public.rating_counts(r.contract_id)),
         (select count(*)::int from public.complaints c where c.leader_id = p.id and c.status = 'verified'),
         (select lid from ref) is not null,
         l.union_name, l.leader_kind, l.profession
    from public.profiles p join public.leader_profiles l on l.user_id = p.id
   where (select uid from me) is not null and p.role = 'leader' and p.status = 'active'
     and (coalesce(l.listed, true) or p.id = (select lid from ref))   -- 022: admin can unlist a leader
     and ((select lid from ref) is null or p.id = (select lid from ref))
     and not exists (select 1 from public.user_blocks b where b.blocker = (select uid from me) and b.blocked = p.id)
     and (p_district is null or p_district = '' or l.district = p_district)
     and (p_search is null or trim(p_search) = '' or p.full_name ilike '%' || trim(p_search) || '%' or l.agency_name ilike '%' || trim(p_search) || '%'
          or p.haji_code ilike trim(p_search) || '%' or l.upazila ilike '%' || trim(p_search) || '%'
          or l.union_name ilike '%' || trim(p_search) || '%' or l.profession ilike '%' || trim(p_search) || '%')
   order by 10 desc, 11 desc, p.full_name
   limit 200;
$$;

create or replace function public.list_offers(p_kind text)
returns table (id uuid, kind text, title text, price_bdt numeric, depart_on date, return_on date, makkah_hotel text,
               makkah_distance_m int, madinah_hotel text, madinah_distance_m int, room_share int, includes text[],
               notes text, agency_name text, created_at timestamptz, valid_until date,
               from_airport text, arrive_at text, first_city text, makkah_nights int, madinah_nights int,
               return_from text, return_to text, airline text,
               leader_id uuid, leader_code text, leader_name text, leader_kind text, avatar_path text, district text,
               rating_avg numeric, rating_count int, complaints_verified int, member_since timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.kind, o.title, o.price_bdt, o.depart_on, o.return_on, o.makkah_hotel, o.makkah_distance_m,
         o.madinah_hotel, o.madinah_distance_m, o.room_share, o.includes, o.notes, lp.agency_name, o.created_at, o.valid_until,
         o.from_airport, o.arrive_at, o.first_city, o.makkah_nights, o.madinah_nights, o.return_from, o.return_to, o.airline,
         p.id, p.haji_code, p.full_name, lp.leader_kind, p.avatar_path, lp.district,
         round(coalesce((select avg(r.stars) from public.leader_ratings r where r.leader_id = p.id and public.rating_counts(r.contract_id)), 0), 1),
         (select count(*)::int from public.leader_ratings r where r.leader_id = p.id and public.rating_counts(r.contract_id)),
         (select count(*)::int from public.complaints c where c.leader_id = p.id and c.status = 'verified'),
         p.created_at
    from public.offers o join public.profiles p on p.id = o.leader_id left join public.leader_profiles lp on lp.user_id = o.leader_id
   where (select auth.uid()) is not null
     and o.kind = p_kind and o.review = 'approved' and o.active and not o.hidden_by_admin and o.return_on >= current_date
     and (o.valid_until is null or o.valid_until >= current_date)
     and p.role = 'leader' and p.status = 'active'
     and (coalesce(lp.listed, true) or o.leader_id = public.active_referral_leader((select auth.uid())))   -- 022
     and (public.active_referral_leader((select auth.uid())) is null or o.leader_id = public.active_referral_leader((select auth.uid())))
     and not exists (select 1 from public.user_blocks b where b.blocker = (select auth.uid()) and b.blocked = o.leader_id)
   order by o.price_bdt asc, o.depart_on asc
   limit 300;
$$;

-- 6) Forced update + 7) settings keys --------------------------------------------------------------------------------
alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check
  check (key in ('helpline_phone', 'helpline_hours', 'otp_live', 'pay_bank', 'pay_bkash', 'min_app_version', 'store_url'));

create or replace function public.admin_set_setting(p_key text, p_value text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('helpline_phone', 'helpline_hours', 'otp_live', 'pay_bank', 'pay_bkash', 'min_app_version', 'store_url') then raise exception 'bad key'; end if;
  if p_value is null or trim(p_value) = '' then
    delete from public.app_settings where key = p_key;
  else
    if p_key = 'helpline_phone' and trim(p_value) !~ '^\+?[0-9]{6,15}$' then raise exception 'bad phone'; end if;
    if p_key = 'otp_live' and trim(p_value) <> 'yes' then raise exception 'bad value'; end if;
    if p_key = 'min_app_version' and trim(p_value) !~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' then raise exception 'bad version'; end if;
    if p_key = 'store_url' and trim(p_value) !~ '^https://[^[:space:]]+$' then raise exception 'bad url'; end if;
    insert into public.app_settings (key, value) values (p_key, left(trim(p_value), 400))
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  perform public.log_admin('setting_' || p_key, null, left(p_value, 200));
  return 'ok';
end $$;

-- 7) Video links ---------------------------------------------------------------------------------------------------
create table if not exists public.app_videos (
  route      text primary key check (route ~ '^[A-Za-z]{2,30}$'),
  url        text not null check (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.app_videos enable row level security;
revoke all on public.app_videos from anon, authenticated;
grant select on public.app_videos to authenticated;
drop policy if exists "videos_read" on public.app_videos;
create policy "videos_read" on public.app_videos for select to authenticated using (true);

create or replace function public.admin_set_video(p_route text, p_url text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if coalesce(p_route, '') !~ '^[A-Za-z]{2,30}$' then raise exception 'bad route'; end if;
  if p_url is null or trim(p_url) = '' then
    delete from public.app_videos where route = p_route;
  else
    if trim(p_url) !~ '^https://[^[:space:]]+$' then raise exception 'bad url'; end if;
    insert into public.app_videos (route, url) values (p_route, trim(p_url))
    on conflict (route) do update set url = excluded.url, updated_at = now();
  end if;
  perform public.log_admin('video_' || p_route, null, left(coalesce(p_url, 'removed'), 200));
  return 'ok';
end $$;

-- 8) Groups & khadems -----------------------------------------------------------------------------------------------
drop function if exists public.admin_groups(text);
create function public.admin_groups(p_query text)
returns table (id uuid, name text, season text, active boolean, leader_name text, leader_code text, members int, invited int, khadems int,
               waiting_questions int, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm('users') then raise exception 'not allowed'; end if;
  return query
    select g.id, g.name, g.season, g.active, p.full_name, p.haji_code,
           (select count(*)::int from public.group_members m where m.group_id = g.id and m.status = 'active'),
           (select count(*)::int from public.group_members m where m.group_id = g.id and m.status = 'invited'),
           (select count(*)::int from public.group_staff s where s.group_id = g.id),
           (select count(*)::int from public.help_threads t where t.group_id = g.id and t.status = 'open'
              and (select hm.sender_role from public.help_messages hm where hm.thread_id = t.id order by hm.created_at desc limit 1) = 'haji'),
           g.created_at
      from public.groups g join public.profiles p on p.id = g.leader_id
     where p_query is null or trim(p_query) = '' or upper(p.haji_code) = upper(trim(p_query))
        or g.name ilike '%' || trim(p_query) || '%' or p.full_name ilike '%' || trim(p_query) || '%'
     order by g.created_at desc limit 200;
end $$;

-- Permissions -------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.admin_find_contracts(text)', 'public.admin_contract_detail(uuid)', 'public.admin_add_contract_note(uuid, text)',
    'public.admin_user_detail(uuid)', 'public.admin_counts()', 'public.admin_list_ratings(text)', 'public.admin_hide_rating(uuid, boolean, text)',
    'public.leader_reviews(uuid)', 'public.admin_set_leader_listed(uuid, boolean, text)', 'public.list_leaders(text, text)', 'public.list_offers(text)',
    'public.admin_set_setting(text, text)', 'public.admin_set_video(text, text)', 'public.admin_groups(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
