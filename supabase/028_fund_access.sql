-- 028: giving to the help fund needs Travel Adda's permission (owner rule, Oct 2026).
--   The admin picks one of three modes (app_settings key fund_donate_mode):
--     approved (default) – only IDs that Travel Adda allowed may give
--     open               – everyone may give, except IDs that were blocked
--     closed             – nobody may give, not even allowed IDs
--   The admin (or staff with the "payments" permission) finds a person by ID / phone / name and turns them on or off.
--   A person without permission can ask for it once a day; admins and payments staff get a notification.
-- Safe to run more than once.

create table if not exists public.fund_donor_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'none' check (status in ('none', 'requested', 'allowed', 'blocked')),
  note text check (note is null or char_length(note) <= 300),
  requested_at timestamptz,
  set_by uuid references public.profiles(id) on delete set null,
  set_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.fund_donor_access enable row level security;
revoke all on public.fund_donor_access from anon, authenticated;
create index if not exists fund_donor_access_status on public.fund_donor_access (status) where status <> 'none';

-- current mode; anything unexpected counts as the safe default
create or replace function public.fund_donate_mode() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when value in ('open', 'closed', 'approved') then value end
                     from public.app_settings where key = 'fund_donate_mode'), 'approved');
$$;
revoke all on function public.fund_donate_mode() from public, anon, authenticated;   -- internal helper

create or replace function public.fund_can_donate(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case public.fund_donate_mode()
    when 'open' then coalesce((select status from public.fund_donor_access where user_id = p_uid), 'none') <> 'blocked'
    when 'approved' then coalesce((select status from public.fund_donor_access where user_id = p_uid), 'none') = 'allowed'
    else false end;
$$;
revoke all on function public.fund_can_donate(uuid) from public, anon, authenticated;   -- internal helper

-- What the Give tab shows: mode, my own status and whether I may give now.
create or replace function public.my_donate_access() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  return jsonb_build_object('mode', public.fund_donate_mode(),
    'status', coalesce((select status from public.fund_donor_access where user_id = v_uid), 'none'),
    'can', public.fund_can_donate(v_uid));
end $$;

-- "অনুমতি চাই": returns requested / already / allowed / blocked / closed / limit
create or replace function public.request_donate_access() returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v public.fund_donor_access; r record;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if public.fund_donate_mode() = 'closed' then return 'closed'; end if;
  select * into v from public.fund_donor_access where user_id = v_uid for update;
  if v.status = 'blocked' then return 'blocked'; end if;
  if public.fund_can_donate(v_uid) then return 'allowed'; end if;
  if v.status = 'requested' then return 'already'; end if;
  if v.requested_at > now() - interval '1 day' then return 'limit'; end if;   -- asked, was turned off, asks again at once
  insert into public.fund_donor_access (user_id, status, requested_at) values (v_uid, 'requested', now())
  on conflict (user_id) do update set status = 'requested', requested_at = now();
  for r in select p.id from public.profiles p left join public.admin_staff s on s.user_id = p.id
            where p.status = 'active' and (p.role = 'admin' or (p.role = 'staff' and 'payments' = any (s.perms))) loop
    perform public.notify_user(r.id, 'admin', 'সহায়তা তহবিলে দানের অনুমতি চেয়েছেন', 'অ্যাডমিন প্যানেলে "সহায়তা তহবিল" → "অনুমতি" দেখুন।', 'Admin');
  end loop;
  return 'requested';
end $$;

-- Donating now checks permission first; everything else as in 027.
create or replace function public.donate_fund(p_amount numeric, p_method text, p_ref text, p_paid_on date, p_show_name boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); r record;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not public.fund_can_donate(v_uid) then return 'not_allowed'; end if;
  if (select count(*) from public.fund_donations where donor_id = v_uid and created_at > now() - interval '1 day') >= 10 then return 'limit'; end if;
  if p_paid_on is null or p_paid_on > current_date or p_paid_on < current_date - 60 then raise exception 'bad date'; end if;
  insert into public.fund_donations (donor_id, amount, method, txn_ref, paid_on, show_name)
  values (v_uid, p_amount, p_method, trim(p_ref), p_paid_on, coalesce(p_show_name, false));
  for r in select p.id from public.profiles p left join public.admin_staff s on s.user_id = p.id
            where p.status = 'active' and (p.role = 'admin' or (p.role = 'staff' and 'payments' = any (s.perms))) loop
    perform public.notify_user(r.id, 'admin', 'সহায়তা তহবিলে নতুন দান যাচাই বাকি', 'অ্যাডমিন প্যানেলে "সহায়তা তহবিল" দেখুন।', 'Admin');
  end loop;
  return 'ok';
end $$;

-- Admin: with a search text, find people by ID (TA-00012 or just 12), phone or name (at least 3 letters); without, list everyone who
-- asked, was allowed or was blocked (asks first).
create or replace function public.admin_donor_access(p_query text)
returns table (user_id uuid, full_name text, haji_code text, phone text, status text, note text, requested_at timestamptz, set_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare q text := trim(coalesce(p_query, '')); d text;
begin
  if not public.has_perm('payments') then raise exception 'not allowed'; end if;
  if q = '' then
    return query select p.id, p.full_name, p.haji_code, p.phone, a.status, a.note, a.requested_at, a.set_at
      from public.fund_donor_access a join public.profiles p on p.id = a.user_id
     where a.status <> 'none'
     order by (a.status = 'requested') desc, coalesce(a.set_at, a.requested_at) desc nulls last limit 200;
    return;
  end if;
  d := regexp_replace(q, '[^0-9]', '', 'g');
  if char_length(q) < 3 and q !~ '^[0-9]+$' then return; end if;
  if d like '880%' then d := substr(d, 3); end if;
  return query select p.id, p.full_name, p.haji_code, p.phone, coalesce(a.status, 'none'), a.note, a.requested_at, a.set_at
    from public.profiles p left join public.fund_donor_access a on a.user_id = p.id
   where p.status = 'active'
     and (upper(replace(p.haji_code, '-', '')) = upper(replace(replace(q, '-', ''), ' ', ''))   -- TA-00012, ta00012
          or (q ~ '^[0-9]{1,5}$' and p.haji_code = 'TA-' || lpad(q, 5, '0'))                       -- just the number: 12
          or (char_length(d) >= 6 and p.phone like '%' || d || '%')
          or p.full_name ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
   order by (upper(p.haji_code) = upper(q)) desc, p.full_name limit 20;
end $$;

-- Admin: turn one person on ('allowed'), off ('blocked') or back to the plain state (null).
create or replace function public.admin_set_donor_access(p_user uuid, p_status text, p_note text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  if not public.has_perm('payments') then raise exception 'not allowed'; end if;
  if p_status is not null and p_status not in ('allowed', 'blocked') then raise exception 'bad status'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'not found'; end if;
  select status into v_old from public.fund_donor_access where user_id = p_user;
  insert into public.fund_donor_access (user_id, status, note, set_by, set_at)
  values (p_user, coalesce(p_status, 'none'), nullif(left(trim(coalesce(p_note, '')), 300), ''), (select auth.uid()), now())
  on conflict (user_id) do update set status = excluded.status, note = excluded.note, set_by = excluded.set_by, set_at = now();
  if p_status = 'allowed' and coalesce(v_old, 'none') <> 'allowed' then
    perform public.notify_user(p_user, 'info', 'সহায়তা তহবিলে দান করার অনুমতি পেয়েছেন',
      'এখন "সহায়তা তহবিল" → "দান করুন" থেকে দান করতে পারবেন।', 'Fund');
  end if;
  perform public.log_admin('donor_access_' || coalesce(p_status, 'cleared'), p_user, p_note);
  return 'ok';
end $$;

-- Pending counts (027) + permission requests.
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
  if public.has_perm('payments') then
    r := r || jsonb_build_object('payments', (select count(*) from public.haji_payments where status = 'submitted'),
                                 'money_alerts', (select count(*) from public.admin_money_alerts()),
                                 'donations', (select count(*) from public.fund_donations where status = 'submitted'),
                                 'donor_requests', (select count(*) from public.fund_donor_access where status = 'requested')); end if;
  if public.has_perm('offers') then r := r || jsonb_build_object('offers', (select count(*) from public.offers where review = 'pending' and return_on >= current_date)); end if;
  if public.has_perm('users') then r := r || jsonb_build_object('sos', (select count(*) from public.sos_events where created_at > now() - interval '24 hours'),
                                                                'help_apps', (select count(*) from public.help_applications where status = 'pending')); end if;
  return r;
end $$;

-- 027 added fund_bank / fund_bkash to admin_set_setting but not to the table's allowed keys, so saving them failed.
alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check
  check (key in ('helpline_phone', 'helpline_hours', 'otp_live', 'pay_bank', 'pay_bkash', 'min_app_version', 'store_url',
                 'fund_bank', 'fund_bkash', 'fund_donate_mode'));

-- Settings (027) + the donation mode (admin only, three values).
create or replace function public.admin_set_setting(p_key text, p_value text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('helpline_phone', 'helpline_hours', 'otp_live', 'pay_bank', 'pay_bkash', 'min_app_version', 'store_url', 'fund_bank', 'fund_bkash', 'fund_donate_mode') then raise exception 'bad key'; end if;
  if p_value is null or trim(p_value) = '' then
    delete from public.app_settings where key = p_key;
  else
    if p_key = 'helpline_phone' and trim(p_value) !~ '^\+?[0-9]{6,15}$' then raise exception 'bad phone'; end if;
    if p_key = 'otp_live' and trim(p_value) <> 'yes' then raise exception 'bad value'; end if;
    if p_key = 'min_app_version' and trim(p_value) !~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' then raise exception 'bad version'; end if;
    if p_key = 'store_url' and trim(p_value) !~ '^https://[^[:space:]]+$' then raise exception 'bad url'; end if;
    if p_key = 'fund_donate_mode' and trim(p_value) not in ('open', 'closed', 'approved') then raise exception 'bad value'; end if;
    insert into public.app_settings (key, value) values (p_key, left(trim(p_value), 400))
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  perform public.log_admin('setting_' || p_key, null, left(p_value, 200));
  return 'ok';
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.my_donate_access()', 'public.request_donate_access()',
    'public.donate_fund(numeric, text, text, date, boolean)', 'public.admin_donor_access(text)',
    'public.admin_set_donor_access(uuid, text, text)', 'public.admin_counts()', 'public.admin_set_setting(text, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
