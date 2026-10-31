-- 027: Hajj & Umrah help fund (sadaqah only — not a zakat fund). Run AFTER 026. Safe to run more than once.
--  * People who cannot afford Hajj/Umrah apply (short form + a reference person Travel Adda phones to check).
--  * Travel Adda (admin, or staff with the "users" permission) approves or rejects.
--  * Donors give into ONE common fund through Travel Adda's account; staff with "payments" confirm the money arrived.
--  * Everyone signed in sees the total collected, every spending and the approved list; names only when the person agreed.
--  * Each donor sees their own gifts. Phone numbers, reasons and references are never public.

alter table public.user_notifications drop constraint if exists user_notifications_route_check;
alter table public.user_notifications add constraint user_notifications_route_check check (route is null or route in
  ('MyLeader', 'LeaderContracts', 'Group', 'Leader', 'Admin', 'Offers', 'Docs', 'Account', 'Home', 'Leaders', 'HelpChat', 'HelpInbox',
   'KhademHome', 'LeaderOffers', 'GroupStaff', 'ChatConsent', 'Fund'));

create table if not exists public.help_applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  kind             text not null check (kind in ('umrah', 'hajj')),
  age              int not null check (age between 18 and 110),
  district         text not null check (char_length(trim(district)) between 2 and 40),
  profession       text not null check (char_length(trim(profession)) between 2 and 60),
  reason           text not null check (char_length(trim(reason)) between 15 and 800),
  went_before      boolean not null default false,
  reference_name   text not null check (char_length(trim(reference_name)) between 2 and 60),
  reference_phone  text not null check (reference_phone ~ '^01[3-9][0-9]{8}$'),
  show_name        boolean not null default false,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'funded', 'travelled', 'withdrawn')),
  admin_note       text check (admin_note is null or char_length(admin_note) <= 500),
  created_at       timestamptz not null default now(),
  decided_at       timestamptz,
  decided_by       uuid references public.profiles(id) on delete set null
);
create unique index if not exists help_one_open on public.help_applications (user_id) where status in ('pending', 'approved', 'funded');
create index if not exists help_by_status on public.help_applications (status, created_at);
alter table public.help_applications enable row level security;
revoke all on public.help_applications from anon, authenticated;

create table if not exists public.fund_donations (
  id           uuid primary key default gen_random_uuid(),
  donor_id     uuid references public.profiles(id) on delete set null,     -- the money record stays
  amount       numeric(12, 2) not null check (amount >= 100 and amount < 100000000),
  method       text not null check (method in ('bank', 'bkash', 'nagad', 'office')),
  txn_ref      text not null check (char_length(trim(txn_ref)) between 3 and 60),
  paid_on      date not null default current_date,
  show_name    boolean not null default false,
  status       text not null default 'submitted' check (status in ('submitted', 'confirmed', 'rejected')),
  admin_note   text check (admin_note is null or char_length(admin_note) <= 500),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references public.profiles(id) on delete set null
);
create unique index if not exists fund_ref_uq on public.fund_donations (method, lower(trim(txn_ref))) where status <> 'rejected';
create index if not exists fund_by_donor on public.fund_donations (donor_id, created_at desc);
alter table public.fund_donations enable row level security;
revoke all on public.fund_donations from anon, authenticated;

create table if not exists public.fund_spends (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.help_applications(id) on delete restrict,
  amount          numeric(12, 2) not null check (amount > 0 and amount < 100000000),
  purpose         text not null check (char_length(trim(purpose)) between 3 and 200),
  txn_ref         text not null check (char_length(trim(txn_ref)) between 3 and 60),
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
alter table public.fund_spends enable row level security;
revoke all on public.fund_spends from anon, authenticated;

-- Who may approve applications: admin, or staff with the "users" permission.
create or replace function public.can_help_review() returns boolean
language sql stable security definer set search_path = '' as $$ select public.has_perm('users'); $$;
revoke all on function public.can_help_review() from public, anon, authenticated;

-- ---------- applicant ----------
create or replace function public.apply_help(p_kind text, p_age int, p_district text, p_profession text, p_reason text,
  p_went_before boolean, p_ref_name text, p_ref_phone text, p_show_name boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); r record;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.help_applications where user_id = v_uid and status in ('pending', 'approved', 'funded')) then return 'exists'; end if;
  if (select count(*) from public.help_applications where user_id = v_uid and created_at > now() - interval '1 day') >= 3 then return 'limit'; end if;
  insert into public.help_applications (user_id, kind, age, district, profession, reason, went_before, reference_name, reference_phone, show_name)
  values (v_uid, p_kind, p_age, trim(p_district), trim(p_profession), trim(p_reason), coalesce(p_went_before, false), trim(p_ref_name),
          regexp_replace(coalesce(p_ref_phone, ''), '[^0-9]', '', 'g'), coalesce(p_show_name, false));
  for r in select p.id from public.profiles p left join public.admin_staff s on s.user_id = p.id
            where p.status = 'active' and (p.role = 'admin' or (p.role = 'staff' and 'users' = any (s.perms))) loop
    perform public.notify_user(r.id, 'admin', 'সহায়তা তহবিলে নতুন আবেদন', 'অ্যাডমিন প্যানেলে "সহায়তা তহবিল" দেখুন।', 'Admin');
  end loop;
  return 'ok';
end $$;

create or replace function public.my_help_application()
returns table (id uuid, kind text, status text, admin_note text, created_at timestamptz, decided_at timestamptz, show_name boolean)
language sql stable security definer set search_path = '' as $$
  select a.id, a.kind, a.status, case when a.status = 'rejected' then a.admin_note end, a.created_at, a.decided_at, a.show_name
    from public.help_applications a where a.user_id = (select auth.uid()) order by a.created_at desc limit 1;
$$;

create or replace function public.withdraw_help() returns text
language plpgsql security definer set search_path = '' as $$
begin
  update public.help_applications set status = 'withdrawn', decided_at = now()
   where user_id = (select auth.uid()) and status = 'pending';
  return case when found then 'ok' else 'not_found' end;
end $$;

-- ---------- donor ----------
create or replace function public.donate_fund(p_amount numeric, p_method text, p_ref text, p_paid_on date, p_show_name boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); r record;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
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

create or replace function public.my_donations()
returns table (id uuid, amount numeric, method text, txn_ref text, paid_on date, status text, admin_note text, show_name boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id, d.amount, d.method, d.txn_ref, d.paid_on, d.status, d.admin_note, d.show_name, d.created_at
    from public.fund_donations d where d.donor_id = (select auth.uid()) order by d.created_at desc limit 500;
$$;

-- ---------- public view (signed in) ----------
-- "নোয়াখালীর ৬৫ বছর বয়সী একজন" unless the person agreed to show the name.
create or replace function public.fund_summary() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is null then jsonb_build_object('collected', 0, 'spent', 0, 'balance', 0, 'donors', 0, 'travelled', 0,
                                                                       'waiting', '[]'::jsonb, 'recent', '[]'::jsonb, 'spends', '[]'::jsonb)
  else jsonb_build_object(
    'collected', (select coalesce(sum(amount), 0) from public.fund_donations where status = 'confirmed'),
    'spent', (select coalesce(sum(amount), 0) from public.fund_spends),
    'balance', (select coalesce(sum(amount), 0) from public.fund_donations where status = 'confirmed') - (select coalesce(sum(amount), 0) from public.fund_spends),
    'donors', (select count(distinct donor_id) from public.fund_donations where status = 'confirmed'),
    'travelled', (select count(*) from public.help_applications where status = 'travelled'),
    'waiting', coalesce((select jsonb_agg(jsonb_build_object('kind', a.kind, 'age', a.age, 'district', a.district, 'status', a.status,
                  'name', case when a.show_name then p.full_name end, 'since', a.decided_at) order by a.decided_at)
                from public.help_applications a join public.profiles p on p.id = a.user_id where a.status in ('approved', 'funded')), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(x order by (x->>'at') desc) from (
                select jsonb_build_object('amount', d.amount, 'name', case when d.show_name then p.full_name end, 'at', d.reviewed_at) x
                  from public.fund_donations d left join public.profiles p on p.id = d.donor_id
                 where d.status = 'confirmed' order by d.reviewed_at desc limit 30) y), '[]'::jsonb),
    'spends', coalesce((select jsonb_agg(jsonb_build_object('amount', s.amount, 'purpose', s.purpose, 'at', s.created_at, 'kind', a.kind,
                  'district', a.district, 'age', a.age, 'name', case when a.show_name then p.full_name end) order by s.created_at desc)
                from public.fund_spends s join public.help_applications a on a.id = s.application_id join public.profiles p on p.id = a.user_id), '[]'::jsonb))
  end;
$$;

-- ---------- Travel Adda ----------
create or replace function public.admin_help_applications(p_status text)
returns table (id uuid, user_id uuid, full_name text, code text, phone text, kind text, age int, district text, profession text, reason text,
               went_before boolean, reference_name text, reference_phone text, show_name boolean, status text, admin_note text,
               created_at timestamptz, spent numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_help_review() then raise exception 'not allowed'; end if;
  return query select a.id, a.user_id, p.full_name, p.haji_code, p.phone, a.kind, a.age, a.district, a.profession, a.reason, a.went_before,
         a.reference_name, a.reference_phone, a.show_name, a.status, a.admin_note, a.created_at,
         (select coalesce(sum(s.amount), 0) from public.fund_spends s where s.application_id = a.id)
    from public.help_applications a join public.profiles p on p.id = a.user_id
   where p_status is null or a.status = p_status order by a.created_at limit 500;
end $$;

create or replace function public.admin_decide_help(p_id uuid, p_decision text, p_note text) returns text
language plpgsql security definer set search_path = '' as $$
declare v public.help_applications;
begin
  if not public.can_help_review() then raise exception 'not allowed'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'bad decision'; end if;
  if p_decision = 'reject' and char_length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason needed'; end if;
  update public.help_applications set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
         admin_note = nullif(left(trim(coalesce(p_note, '')), 500), ''), decided_at = now(), decided_by = (select auth.uid())
   where id = p_id and status = 'pending' returning * into v;
  if v.id is null then return 'not_pending'; end if;
  perform public.notify_user(v.user_id, 'info',
    case when p_decision = 'approve' then 'আপনার সহায়তার আবেদন অনুমোদিত হয়েছে' else 'আপনার সহায়তার আবেদন গ্রহণ করা যায়নি' end,
    case when p_decision = 'approve' then 'তহবিলে টাকা জমা হলে Travel Adda আপনার সাথে যোগাযোগ করবে।' else left(trim(p_note), 300) end, 'Fund');
  perform public.log_admin('help_' || p_decision, v.user_id, v.kind || ' ' || coalesce(nullif(trim(coalesce(p_note, '')), ''), '-'));
  return 'ok';
end $$;

create or replace function public.admin_help_travelled(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v public.help_applications;
begin
  if not public.can_help_review() then raise exception 'not allowed'; end if;
  update public.help_applications set status = 'travelled' where id = p_id and status = 'funded' returning * into v;
  if v.id is null then return 'not_funded'; end if;
  perform public.log_admin('help_travelled', v.user_id, v.kind);
  return 'ok';
end $$;

create or replace function public.admin_fund_donations(p_status text)
returns table (id uuid, donor_name text, donor_code text, amount numeric, method text, txn_ref text, paid_on date, status text,
               admin_note text, show_name boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm('payments') then raise exception 'not allowed'; end if;
  return query select d.id, p.full_name, p.haji_code, d.amount, d.method, d.txn_ref, d.paid_on, d.status, d.admin_note, d.show_name, d.created_at
    from public.fund_donations d left join public.profiles p on p.id = d.donor_id
   where p_status is null or d.status = p_status order by d.created_at desc limit 500;
end $$;

create or replace function public.admin_review_donation(p_id uuid, p_confirm boolean, p_note text) returns text
language plpgsql security definer set search_path = '' as $$
declare v public.fund_donations;
begin
  if not public.has_perm('payments') then raise exception 'not allowed'; end if;
  if not p_confirm and char_length(trim(coalesce(p_note, ''))) < 5 then raise exception 'reason needed'; end if;
  update public.fund_donations set status = case when p_confirm then 'confirmed' else 'rejected' end,
         admin_note = nullif(left(trim(coalesce(p_note, '')), 500), ''), reviewed_at = now(), reviewed_by = (select auth.uid())
   where id = p_id and status = 'submitted' returning * into v;
  if v.id is null then return 'not_found'; end if;
  perform public.notify_user(v.donor_id, 'payment',
    case when p_confirm then 'আপনার দান তহবিলে জমা হয়েছে। আল্লাহ কবুল করুন।' else 'আপনার দানের টাকা মেলানো যায়নি' end,
    case when p_confirm then null else left(trim(p_note), 300) end, 'Fund');
  perform public.log_admin(case when p_confirm then 'fund_confirmed' else 'fund_rejected' end, v.donor_id, v.amount::text || ' ' || v.method || ' ' || v.txn_ref);
  return 'ok';
end $$;

-- A spending can never be more than what is in the fund. It marks the application as funded.
create or replace function public.admin_spend_fund(p_app uuid, p_amount numeric, p_purpose text, p_ref text) returns text
language plpgsql security definer set search_path = '' as $$
declare v public.help_applications; v_balance numeric;
begin
  if not public.has_perm('payments') then raise exception 'not allowed'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  perform pg_advisory_xact_lock(hashtext('fund_spend'));      -- two staff spending at once can't overdraw the fund
  select * into v from public.help_applications where id = p_app and status in ('approved', 'funded');
  if v.id is null then raise exception 'not approved'; end if;
  v_balance := (select coalesce(sum(amount), 0) from public.fund_donations where status = 'confirmed') - (select coalesce(sum(amount), 0) from public.fund_spends);
  if p_amount > v_balance + 0.001 then raise exception 'not enough in the fund'; end if;
  insert into public.fund_spends (application_id, amount, purpose, txn_ref, created_by) values (p_app, p_amount, trim(p_purpose), trim(p_ref), (select auth.uid()));
  update public.help_applications set status = 'funded' where id = p_app and status = 'approved';
  perform public.notify_user(v.user_id, 'info', 'সহায়তা তহবিল থেকে আপনার জন্য টাকা দেওয়া হয়েছে', left(trim(p_purpose), 200), 'Fund');
  perform public.log_admin('fund_spent', v.user_id, p_amount::text || ' ' || trim(p_purpose) || ' ' || trim(p_ref));
  return 'ok';
end $$;

-- Pending counts (026) + help fund.
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
                                 'donations', (select count(*) from public.fund_donations where status = 'submitted')); end if;
  if public.has_perm('offers') then r := r || jsonb_build_object('offers', (select count(*) from public.offers where review = 'pending' and return_on >= current_date)); end if;
  if public.has_perm('users') then r := r || jsonb_build_object('sos', (select count(*) from public.sos_events where created_at > now() - interval '24 hours'),
                                                                'help_apps', (select count(*) from public.help_applications where status = 'pending')); end if;
  return r;
end $$;

-- Payment details for the fund (may be a separate account from package payments).
create or replace function public.admin_set_setting(p_key text, p_value text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('helpline_phone', 'helpline_hours', 'otp_live', 'pay_bank', 'pay_bkash', 'min_app_version', 'store_url', 'fund_bank', 'fund_bkash') then raise exception 'bad key'; end if;
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

do $$
declare f text;
begin
  foreach f in array array['public.apply_help(text, int, text, text, text, boolean, text, text, boolean)', 'public.my_help_application()',
    'public.withdraw_help()', 'public.donate_fund(numeric, text, text, date, boolean)', 'public.my_donations()', 'public.fund_summary()',
    'public.admin_help_applications(text)', 'public.admin_decide_help(uuid, text, text)', 'public.admin_help_travelled(uuid)',
    'public.admin_fund_donations(text)', 'public.admin_review_donation(uuid, boolean, text)', 'public.admin_spend_fund(uuid, numeric, text, text)',
    'public.admin_counts()', 'public.admin_set_setting(text, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function public.fund_summary() to anon;

notify pgrst, 'reload schema';
