-- 021: fixes from the security audit (Oct 2026). Run AFTER 020. Safe to run more than once.
--  1) A rating counts (and its comment shows) only when Travel Adda has confirmed a payment on that contract,
--     so fake accounts and fake contracts cannot pump a leader's rating. Old ratings stay; they count once paid.
--  2) A phone number or ID never tells a leader who the person is. Inviting to a group or as khadem gives the same
--     answer whether or not the account exists; the leader sees only a masked hint ("017••••••77") until the person
--     agrees. Khadems must agree. At most 50 invitations per leader per day (cancelled ones count too).
--  3) Deleting an account needs the password typed again in the last 10 minutes (a stolen, unlocked phone is not enough).

-- 1) Ratings -------------------------------------------------------------------------------------------------------
create or replace function public.rating_counts(p_contract uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.haji_payments p where p.contract_id = p_contract and p.status = 'confirmed');
$$;
revoke all on function public.rating_counts(uuid) from public, anon, authenticated;

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
     and ((select lid from ref) is null or p.id = (select lid from ref))
     and not exists (select 1 from public.user_blocks b where b.blocker = (select uid from me) and b.blocked = p.id)
     and (p_district is null or p_district = '' or l.district = p_district)
     and (p_search is null or trim(p_search) = '' or p.full_name ilike '%' || trim(p_search) || '%' or l.agency_name ilike '%' || trim(p_search) || '%'
          or p.haji_code ilike trim(p_search) || '%' or l.upazila ilike '%' || trim(p_search) || '%'
          or l.union_name ilike '%' || trim(p_search) || '%' or l.profession ilike '%' || trim(p_search) || '%')
   order by 10 desc, 11 desc, p.full_name
   limit 200;
$$;

create or replace function public.leader_public(p_leader uuid)
returns table (id uuid, full_name text, leader_code text, agency_name text, district text, upazila text, avatar_path text,
               umrah_license text, hajj_license text, bio text, rating_avg numeric, rating_count int, complaints_verified int,
               member_since timestamptz, blocked_by_me boolean, i_have_contract boolean, union_name text, leader_kind text, profession text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.haji_code, l.agency_name, l.district, l.upazila, p.avatar_path, l.umrah_license, l.hajj_license, l.bio,
         round(coalesce((select avg(r.stars) from public.leader_ratings r where r.leader_id = p.id and public.rating_counts(r.contract_id)), 0), 1),
         (select count(*)::int from public.leader_ratings r where r.leader_id = p.id and public.rating_counts(r.contract_id)),
         (select count(*)::int from public.complaints c where c.leader_id = p.id and c.status = 'verified'),
         p.created_at,
         exists (select 1 from public.user_blocks b where b.blocker = (select auth.uid()) and b.blocked = p.id),
         exists (select 1 from public.haji_contracts c where c.leader_id = p.id and c.haji_id = (select auth.uid()) and c.status in ('accepted', 'completed', 'cancelled')),
         l.union_name, l.leader_kind, l.profession
    from public.profiles p join public.leader_profiles l on l.user_id = p.id
   where (select auth.uid()) is not null and p.id = p_leader and p.role = 'leader' and p.status = 'active';
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
     and (public.active_referral_leader((select auth.uid())) is null or o.leader_id = public.active_referral_leader((select auth.uid())))
     and not exists (select 1 from public.user_blocks b where b.blocker = (select auth.uid()) and b.blocked = o.leader_id)
   order by o.price_bdt asc, o.depart_on asc
   limit 300;
$$;

create or replace function public.leader_reviews(p_leader uuid)
returns table (kind text, stars int, body text, at timestamptz)
language sql stable security definer set search_path = '' as $$
  (select 'rating', r.stars, r.comment, r.updated_at from public.leader_ratings r
    where (select auth.uid()) is not null and r.leader_id = p_leader and public.rating_counts(r.contract_id) and r.comment is not null and trim(r.comment) <> ''
    order by r.updated_at desc limit 50)
  union all
  (select 'complaint', null::int, c.body, c.created_at from public.complaints c
    where (select auth.uid()) is not null and c.leader_id = p_leader and c.status = 'verified'
    order by c.created_at desc limit 50);
$$;

-- 2) Invitations ---------------------------------------------------------------------------------------------------
create table if not exists public.leader_invites (
  id           uuid primary key default gen_random_uuid(),
  leader_id    uuid not null references public.profiles(id) on delete cascade,
  group_id     uuid not null references public.groups(id) on delete cascade,
  kind         text not null check (kind in ('member', 'khadem')),
  hint         text not null check (char_length(hint) <= 20),
  target_user  uuid references public.profiles(id) on delete set null,   -- internal; never shown to the leader
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz
);
create index if not exists leader_invites_by_leader on public.leader_invites (leader_id, created_at);
alter table public.leader_invites enable row level security;
revoke all on public.leader_invites from anon, authenticated;

create table if not exists public.khadem_invites (
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  invited_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.khadem_invites enable row level security;
revoke all on public.khadem_invites from anon, authenticated;

alter table public.user_notifications drop constraint if exists user_notifications_route_check;
alter table public.user_notifications add constraint user_notifications_route_check check (route is null or route in
  ('MyLeader', 'LeaderContracts', 'Group', 'Leader', 'Admin', 'Offers', 'Docs', 'Account', 'Home', 'Leaders', 'HelpChat', 'HelpInbox',
   'KhademHome', 'LeaderOffers', 'GroupStaff'));

-- "01710000077" -> "017••••••77"; "TA-00042" -> "TA-•••42"
create or replace function public.invite_hint(p_ident text) returns text
language sql immutable set search_path = '' as $$
  select case when p_ident ~ '^T[AL]-[0-9]+$' then substr(p_ident, 1, 3) || '•••' || right(p_ident, 2)
              else left(p_ident, 3) || '••••••' || right(p_ident, 2) end;
$$;
revoke all on function public.invite_hint(text) from public, anon, authenticated;

-- Normalises what the leader typed and finds the account (internal). ident = cleaned phone or ID.
create or replace function public.invite_target(p_ident text, out ident text, out target uuid)
language plpgsql stable security definer set search_path = '' as $$
declare v text := upper(trim(coalesce(p_ident, '')));
begin
  v := translate(v, '০১২৩৪৫৬৭৮৯', '0123456789');
  if v ~ '^T[AL]-?[0-9]+$' then
    ident := regexp_replace(v, '^(T[AL])-?', '\1-');
    select id into target from public.profiles where haji_code = ident and status = 'active';
  else
    v := regexp_replace(v, '[^0-9]', '', 'g');
    if v like '880%' then v := '0' || substr(v, 4); end if;
    ident := v;
    if v ~ '^01[3-9][0-9]{8}$' then
      select id into target from public.profiles where phone = v and status = 'active';
    else ident := null; end if;
  end if;
end $$;
revoke all on function public.invite_target(text) from public, anon, authenticated;

create or replace function public.invites_today(p_leader uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.leader_invites where leader_id = p_leader and created_at > now() - interval '1 day';
$$;
revoke all on function public.invites_today(uuid) from public, anon, authenticated;

-- Khadem: an invitation, never a direct add. Same answer for every number / ID.
create or replace function public.leader_add_khadem(p_group uuid, p_ident text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); t record; v_g text;
begin
  if coalesce(public.group_role(p_group, v_uid), '') <> 'leader' then raise exception 'not allowed'; end if;
  select * into t from public.invite_target(p_ident);
  if t.ident is null then return 'bad'; end if;
  if t.target = v_uid then return 'self'; end if;
  if public.invites_today(v_uid) >= 50 then return 'limit'; end if;
  insert into public.leader_invites (leader_id, group_id, kind, hint, target_user)
  values (v_uid, p_group, 'khadem', public.invite_hint(t.ident), t.target);
  if t.target is not null and not exists (select 1 from public.group_staff where group_id = p_group and user_id = t.target)
     and not public.blocked_between(v_uid, t.target) then
    insert into public.khadem_invites (group_id, user_id, invited_by) values (p_group, t.target, v_uid) on conflict do nothing;
    if found then
      select name into v_g from public.groups where id = p_group;
      perform public.notify_user(t.target, 'group', '"' || v_g || '" দলের খাদেম হওয়ার অনুরোধ',
                                 'রাজি থাকলে খাদেমের পাতায় গিয়ে "রাজি" চাপুন। না চাইলে "না" চাপুন।', 'KhademHome');
    end if;
  end if;
  return 'sent';
end $$;

-- Group member: same uniform answer, logged, limited; the invited person still accepts from "My group".
create or replace function public.invite_by_phone(p_group uuid, p_phone text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); t record; v_ok boolean;
begin
  if not exists (select 1 from public.groups g where g.id = p_group and g.leader_id = v_uid and g.active) or not public.is_leader() then
    raise exception 'not allowed';
  end if;
  select * into t from public.invite_target(p_phone);
  if t.ident is null or t.ident like 'T%' then return 'bad'; end if;
  if public.invites_today(v_uid) >= 50 then return 'limit'; end if;
  select exists (select 1 from public.profiles where id = t.target and account_type = 'haji'
                  and (verified or not public.otp_live())) into v_ok;
  insert into public.leader_invites (leader_id, group_id, kind, hint, target_user)
  values (v_uid, p_group, 'member', public.invite_hint(t.ident), case when v_ok then t.target end);
  if v_ok and t.target <> v_uid and not public.blocked_between(v_uid, t.target) then
    insert into public.group_members (group_id, user_id, status) values (p_group, t.target, 'invited')
    on conflict (group_id, user_id) do update set status = 'invited'
      where public.group_members.status in ('left', 'declined');
  end if;
  return 'sent';
end $$;

-- What the leader sent (masked), newest first, last 14 days. "joined" only once the person agreed.
drop function if exists public.my_sent_invites(uuid);
create function public.my_sent_invites(p_group uuid)
returns table (id uuid, kind text, hint text, created_at timestamptz, joined boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.group_role(p_group, (select auth.uid())), '') <> 'leader' then raise exception 'not allowed'; end if;
  return query
    select i.id, i.kind, i.hint, i.created_at,
           case when i.kind = 'khadem' then exists (select 1 from public.group_staff s where s.group_id = i.group_id and s.user_id = i.target_user)
                else exists (select 1 from public.group_members m where m.group_id = i.group_id and m.user_id = i.target_user and m.status = 'active') end
      from public.leader_invites i
     where i.group_id = p_group and i.leader_id = (select auth.uid()) and i.cancelled_at is null and i.created_at > now() - interval '14 days'
     order by i.created_at desc limit 100;
end $$;

create or replace function public.leader_cancel_invite(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v public.leader_invites;
begin
  update public.leader_invites set cancelled_at = now()
   where id = p_id and leader_id = (select auth.uid()) and cancelled_at is null returning * into v;
  if v.id is null then return 'not_found'; end if;
  if v.target_user is not null then
    if v.kind = 'khadem' then delete from public.khadem_invites where group_id = v.group_id and user_id = v.target_user;
    else delete from public.group_members where group_id = v.group_id and user_id = v.target_user and status = 'invited'; end if;
  end if;
  return 'ok';
end $$;

-- The invited person's side
drop function if exists public.my_khadem_invites();
create function public.my_khadem_invites()
returns table (group_id uuid, group_name text, leader_name text, leader_code text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, p.full_name, p.haji_code, k.created_at
    from public.khadem_invites k join public.groups g on g.id = k.group_id join public.profiles p on p.id = g.leader_id
   where k.user_id = (select auth.uid()) and g.active
   order by k.created_at desc;
$$;

create or replace function public.khadem_respond(p_group uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v public.khadem_invites; v_leader uuid; v_name text; v_g text;
begin
  delete from public.khadem_invites where group_id = p_group and user_id = v_uid returning * into v;
  if v.group_id is null then return 'not_found'; end if;
  if not coalesce(p_accept, false) then return 'ok'; end if;
  if (select count(*) from public.group_staff where group_id = p_group) >= 10 then return 'limit'; end if;
  insert into public.group_staff (group_id, user_id, added_by) values (p_group, v_uid, v.invited_by) on conflict do nothing;
  select leader_id, name into v_leader, v_g from public.groups where id = p_group;
  select full_name into v_name from public.profiles where id = v_uid;
  perform public.notify_user(v_leader, 'group', coalesce(v_name, 'একজন') || ' "' || v_g || '" দলের খাদেম হতে রাজি হয়েছেন',
                             'খাদেম ও তৈরি উত্তর পাতায় দেখুন।', 'GroupStaff');
  return 'ok';
end $$;

create or replace function public.group_members_for_leader(p_group uuid)
returns table (user_id uuid, full_name text, haji_code text, phone text, avatar_path text, status text, joined_at timestamptz, phone_verified boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.haji_code, case when public.has_accepted_contract(g.leader_id, p.id) then p.phone end,
         p.avatar_path, m.status, m.joined_at, p.verified           -- column name kept for older apps; means "account verified"
    from public.group_members m
    join public.groups g on g.id = m.group_id
    join public.profiles p on p.id = m.user_id
   where m.group_id = p_group and g.leader_id = (select auth.uid()) and m.status = 'active'   -- 021: invited people stay hidden until they join
   order by m.status, p.full_name;
$$;

-- 3) Deleting an account: the password must have been entered in the last 10 minutes ------------------------------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
                  where a ->> 'method' in ('password', 'otp')
                    and (a ->> 'timestamp')::bigint > extract(epoch from now())::bigint - 600) then
    raise exception 'password needed';
  end if;
  delete from auth.users where id = v_uid;   -- only ever the caller's own account
end $$;

-- 4) Permissions ---------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.list_leaders(text, text)', 'public.leader_public(uuid)', 'public.list_offers(text)', 'public.leader_reviews(uuid)',
    'public.leader_add_khadem(uuid, text)', 'public.invite_by_phone(uuid, text)', 'public.my_sent_invites(uuid)', 'public.leader_cancel_invite(uuid)',
    'public.my_khadem_invites()', 'public.khadem_respond(uuid, boolean)', 'public.group_members_for_leader(uuid)', 'public.delete_my_account()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
