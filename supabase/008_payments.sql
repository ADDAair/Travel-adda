-- 008: payments through Travel Adda, commission and payouts, and an end date for packages. Run AFTER 007. Safe to re-run.
--
-- Money rule (owner's decision): the haji pays Travel Adda's official account (bank / bKash / Nagad / office) and
-- records it in the app with the transaction number and a receipt photo. Staff with the 'payments' permission check the
-- account and confirm it. Travel Adda keeps the commission and pays the rest to the leader (or refunds the haji);
-- every payout is recorded here. Nobody can change or delete a payment record from the app.

-- 1) Package end date: how long a package is offered -----------------------------------------------------------------
alter table public.offers add column if not exists valid_until date;
do $$ begin
  alter table public.offers add constraint offers_valid_until_check check (valid_until is null or valid_until <= depart_on);
exception when duplicate_object then null; end $$;
grant insert (kind, title, price_bdt, depart_on, return_on, makkah_hotel, makkah_distance_m, madinah_hotel,
              madinah_distance_m, room_share, includes, notes, valid_until) on public.offers to authenticated;

create or replace function public.offer_is_visible(p_offer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.offers o join public.profiles p on p.id = o.leader_id
                  where o.id = p_offer and o.active and not o.hidden_by_admin and o.return_on >= current_date
                    and (o.valid_until is null or o.valid_until >= current_date)
                    and p.role = 'leader' and p.status = 'active');
$$;
drop function if exists public.list_offers(text);
create function public.list_offers(p_kind text)
returns table (id uuid, kind text, title text, price_bdt numeric, depart_on date, return_on date, makkah_hotel text,
               makkah_distance_m int, madinah_hotel text, madinah_distance_m int, room_share int, includes text[],
               notes text, agency_name text, created_at timestamptz, valid_until date)
language sql stable security definer set search_path = '' as $$
  select o.id, o.kind, o.title, o.price_bdt, o.depart_on, o.return_on, o.makkah_hotel, o.makkah_distance_m,
         o.madinah_hotel, o.madinah_distance_m, o.room_share, o.includes, o.notes, lp.agency_name, o.created_at, o.valid_until
    from public.offers o join public.profiles p on p.id = o.leader_id left join public.leader_profiles lp on lp.user_id = o.leader_id
   where (select auth.uid()) is not null
     and o.kind = p_kind and o.active and not o.hidden_by_admin and o.return_on >= current_date
     and (o.valid_until is null or o.valid_until >= current_date)
     and p.role = 'leader' and p.status = 'active'
     and (public.active_referral_leader((select auth.uid())) is null or o.leader_id = public.active_referral_leader((select auth.uid())))
     and not exists (select 1 from public.user_blocks b where b.blocker = (select auth.uid()) and b.blocked = o.leader_id)
   order by o.price_bdt asc, o.depart_on asc
   limit 200;
$$;

-- 2) Staff permission 'payments'; payment instructions shown to hajis -------------------------------------------------
alter table public.admin_staff drop constraint if exists admin_staff_perms_check;
alter table public.admin_staff add constraint admin_staff_perms_check
  check (perms <@ array['applications', 'calls', 'offers', 'complaints', 'reports', 'users', 'payments']::text[]);
create or replace function public.my_perms() returns text[]
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and status = 'active')
      then array['admin', 'applications', 'calls', 'offers', 'complaints', 'reports', 'users', 'payments']
    else coalesce((select s.perms from public.admin_staff s join public.profiles p on p.id = s.user_id
                    where s.user_id = (select auth.uid()) and p.role = 'staff' and p.status = 'active'), '{}'::text[]) end;
$$;

alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check check (key in ('helpline_phone', 'helpline_hours', 'otp_live', 'pay_bank', 'pay_bkash'));
alter table public.app_settings drop constraint if exists app_settings_value_check;
alter table public.app_settings add constraint app_settings_value_check check (char_length(value) <= 400);
create or replace function public.admin_set_setting(p_key text, p_value text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('helpline_phone', 'helpline_hours', 'otp_live', 'pay_bank', 'pay_bkash') then raise exception 'bad key'; end if;
  if p_value is null or trim(p_value) = '' then
    delete from public.app_settings where key = p_key;
  else
    if p_key = 'helpline_phone' and trim(p_value) !~ '^\+?[0-9]{6,15}$' then raise exception 'bad phone'; end if;
    if p_key = 'otp_live' and trim(p_value) <> 'yes' then raise exception 'bad value'; end if;
    insert into public.app_settings (key, value) values (p_key, left(trim(p_value), 400))
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  perform public.log_admin('setting_' || p_key, null, left(p_value, 200));
  return 'ok';
end $$;

-- 3) Commission: a default % per leader, and an exact amount per contract when the admin sets one ------------------
alter table public.haji_contracts add column if not exists commission_bdt numeric(12, 2);
do $$ begin
  alter table public.haji_contracts add constraint haji_contracts_commission_check check (commission_bdt is null or commission_bdt >= 0);
exception when duplicate_object then null; end $$;
create table if not exists public.leader_rates (
  leader_id       uuid primary key references public.profiles(id) on delete cascade,
  commission_pct  numeric(5, 2) not null default 0 check (commission_pct between 0 and 100),
  note            text check (note is null or char_length(note) <= 300),
  updated_at      timestamptz not null default now()
);
alter table public.leader_rates enable row level security;
revoke all on public.leader_rates from anon, authenticated;

-- 4) Payments from hajis (to Travel Adda) and payouts (from Travel Adda to the leader, or a refund to the haji) -------
create table if not exists public.haji_payments (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references public.haji_contracts(id) on delete cascade,
  haji_id       uuid default auth.uid() references public.profiles(id) on delete set null,   -- the money record stays
  amount        numeric(12, 2) not null check (amount > 0 and amount < 100000000),
  method        text not null check (method in ('bank', 'bkash', 'nagad', 'office')),
  txn_ref       text not null check (char_length(trim(txn_ref)) between 3 and 60),
  paid_on       date not null default current_date,
  receipt_path  text check (receipt_path is null or char_length(receipt_path) <= 300),
  status        text not null default 'submitted' check (status in ('submitted', 'confirmed', 'rejected')),
  admin_note    text check (admin_note is null or char_length(admin_note) <= 500),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid references public.profiles(id) on delete set null
);
create unique index if not exists haji_payments_ref_uq on public.haji_payments (method, lower(trim(txn_ref))) where status <> 'rejected';
create index if not exists haji_payments_by_contract on public.haji_payments (contract_id);
alter table public.haji_payments enable row level security;
revoke all on public.haji_payments from anon, authenticated;
grant select on public.haji_payments to authenticated;
grant insert (contract_id, amount, method, txn_ref, paid_on, receipt_path) on public.haji_payments to authenticated;

create table if not exists public.payouts (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references public.haji_contracts(id) on delete cascade,
  payee        text not null default 'leader' check (payee in ('leader', 'haji')),
  amount       numeric(12, 2) not null check (amount > 0 and amount < 100000000),
  txn_ref      text not null check (char_length(trim(txn_ref)) between 3 and 60),
  note         text check (note is null or char_length(note) <= 300),
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists payouts_by_contract on public.payouts (contract_id);
alter table public.payouts enable row level security;
revoke all on public.payouts from anon, authenticated;          -- read through the functions below

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf'];
drop policy if exists "rcpt_insert_own" on storage.objects;
create policy "rcpt_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "rcpt_select" on storage.objects;
create policy "rcpt_select" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.has_perm('payments'))));
drop policy if exists "rcpt_delete_own" on storage.objects;     -- only a receipt that was never attached to a payment
create policy "rcpt_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text
         and not exists (select 1 from public.haji_payments p where p.receipt_path = name));

create or replace function public.is_my_accepted_contract(p_contract uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.haji_contracts where id = p_contract and haji_id = (select auth.uid()) and status = 'accepted');
$$;
create or replace function public.payments_today() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.haji_payments where haji_id = (select auth.uid()) and created_at > now() - interval '1 day';
$$;
drop policy if exists "pay_select" on public.haji_payments;
create policy "pay_select" on public.haji_payments for select to authenticated
  using (haji_id = (select auth.uid()) or (select public.has_perm('payments')));
drop policy if exists "pay_insert" on public.haji_payments;
create policy "pay_insert" on public.haji_payments for insert to authenticated
  with check (haji_id = (select auth.uid()) and public.is_my_accepted_contract(contract_id) and public.payments_today() < 10
              and paid_on between current_date - 400 and current_date
              and (receipt_path is null or receipt_path like (select auth.uid())::text || '/%'));

-- Money summary of one contract, for its haji or its leader. The haji does not see the commission.
create or replace function public.contract_money(p_contract uuid)
returns table (price_bdt numeric, paid_in numeric, pending_in numeric, commission numeric, paid_to_leader numeric, refunded numeric, due_to_leader numeric, still_to_pay numeric)
language sql stable security definer set search_path = '' as $$
  with c as (select k.*, coalesce(k.commission_bdt, round(
                 coalesce((select sum(amount) from public.haji_payments p where p.contract_id = k.id and p.status = 'confirmed'), 0)
                 * coalesce((select commission_pct from public.leader_rates r where r.leader_id = k.leader_id), 0) / 100, 2)) comm
               from public.haji_contracts k where k.id = p_contract),
       m as (select (select coalesce(sum(amount), 0) from public.haji_payments p where p.contract_id = p_contract and p.status = 'confirmed') pin,
                    (select coalesce(sum(amount), 0) from public.haji_payments p where p.contract_id = p_contract and p.status = 'submitted') pend,
                    (select coalesce(sum(amount), 0) from public.payouts o where o.contract_id = p_contract and o.payee = 'leader') pl,
                    (select coalesce(sum(amount), 0) from public.payouts o where o.contract_id = p_contract and o.payee = 'haji') ph)
  select c.price_bdt, m.pin, m.pend,
         case when c.leader_id = (select auth.uid()) or public.has_perm('payments') then c.comm end,
         m.pl, m.ph,
         case when c.leader_id = (select auth.uid()) or public.has_perm('payments') then m.pin - c.comm - m.pl - m.ph end,
         greatest(c.price_bdt - m.pin, 0)
    from c, m
   where c.haji_id = (select auth.uid()) or c.leader_id = (select auth.uid()) or public.has_perm('payments');
$$;
-- The leader sees confirmed payments of their contracts (amount and date only, never the receipt) and their payouts.
create or replace function public.leader_money()
returns table (contract_id uuid, contract_no text, haji_name text, haji_code text, kind text, what text, amount numeric, at timestamptz, ref text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.contract_no, c.haji_name, c.haji_code, 'in', 'হাজীর জমা (নিশ্চিত)', p.amount, p.reviewed_at, null
    from public.haji_payments p join public.haji_contracts c on c.id = p.contract_id
   where c.leader_id = (select auth.uid()) and p.status = 'confirmed' and public.is_leader()
  union all
  select c.id, c.contract_no, c.haji_name, c.haji_code, 'out', case when o.payee = 'leader' then 'আপনাকে পাঠানো' else 'হাজীকে ফেরত' end, o.amount, o.created_at, o.txn_ref
    from public.payouts o join public.haji_contracts c on c.id = o.contract_id
   where c.leader_id = (select auth.uid()) and public.is_leader()
  order by 8 desc
  limit 500;
$$;

create or replace function public.admin_list_payments(p_status text default null)
returns table (id uuid, amount numeric, method text, txn_ref text, paid_on date, receipt_path text, status text, admin_note text, created_at timestamptz,
               contract_id uuid, contract_no text, title text, price_bdt numeric, haji_name text, haji_code text, haji_phone text, leader_name text, leader_code text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.amount, p.method, p.txn_ref, p.paid_on, p.receipt_path, p.status, p.admin_note, p.created_at, c.id, c.contract_no, c.title, c.price_bdt,
         c.haji_name, c.haji_code, h.phone, c.leader_name, c.leader_code
    from public.haji_payments p join public.haji_contracts c on c.id = p.contract_id left join public.profiles h on h.id = p.haji_id
   where public.has_perm('payments') and (p_status is null or p.status = p_status)
   order by (p.status = 'submitted') desc, p.created_at desc limit 500;
$$;
create or replace function public.admin_review_payment(p_id uuid, p_confirm boolean, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_h uuid;
begin
  if not public.has_perm('payments') then raise exception 'not allowed'; end if;
  if not p_confirm and char_length(coalesce(trim(p_note), '')) < 3 then return 'reason'; end if;
  update public.haji_payments set status = case when p_confirm then 'confirmed' else 'rejected' end, admin_note = left(p_note, 500),
         reviewed_at = now(), reviewed_by = (select auth.uid())
   where id = p_id and status = 'submitted' returning haji_id into v_h;
  if not found then return 'not_found'; end if;
  perform public.log_admin(case when p_confirm then 'payment_confirmed' else 'payment_rejected' end, v_h, p_id::text || ' ' || coalesce(p_note, ''));
  return 'ok';
end $$;
create or replace function public.admin_set_commission(p_contract uuid, p_amount numeric)
returns text language plpgsql security definer set search_path = '' as $$
declare v_l uuid;
begin
  if not public.has_perm('payments') then raise exception 'not allowed'; end if;
  if p_amount is not null and p_amount < 0 then raise exception 'bad amount'; end if;
  update public.haji_contracts set commission_bdt = p_amount where id = p_contract returning leader_id into v_l;
  if not found then return 'not_found'; end if;
  perform public.log_admin('commission_set', v_l, p_contract::text || ' ' || coalesce(p_amount::text, 'default'));
  return 'ok';
end $$;
create or replace function public.admin_set_leader_rate(p_leader uuid, p_pct numeric, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('payments') then raise exception 'not allowed'; end if;
  if p_pct is null or p_pct < 0 or p_pct > 100 then raise exception 'bad pct'; end if;
  if not exists (select 1 from public.profiles where id = p_leader and role = 'leader') then return 'not_found'; end if;
  insert into public.leader_rates (leader_id, commission_pct, note) values (p_leader, p_pct, left(p_note, 300))
  on conflict (leader_id) do update set commission_pct = excluded.commission_pct, note = excluded.note, updated_at = now();
  perform public.log_admin('leader_rate', p_leader, p_pct::text || '% ' || coalesce(p_note, ''));
  return 'ok';
end $$;
-- A payout can never be more than what is still held for that contract.
create or replace function public.admin_add_payout(p_contract uuid, p_payee text, p_amount numeric, p_ref text, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_l uuid; v_due numeric; v_held numeric;
begin
  if not public.has_perm('payments') then raise exception 'not allowed'; end if;
  if p_payee not in ('leader', 'haji') or p_amount is null or p_amount <= 0 or char_length(coalesce(trim(p_ref), '')) < 3 then return 'bad'; end if;
  select leader_id into v_l from public.haji_contracts where id = p_contract;
  if not found then return 'not_found'; end if;
  select m.due_to_leader, m.paid_in - m.paid_to_leader - m.refunded into v_due, v_held from public.contract_money(p_contract) m;
  if p_payee = 'leader' and p_amount > v_due + 0.001 then return 'over'; end if;
  if p_payee = 'haji' and p_amount > v_held + 0.001 then return 'over'; end if;
  insert into public.payouts (contract_id, payee, amount, txn_ref, note, created_by) values (p_contract, p_payee, p_amount, trim(p_ref), left(p_note, 300), (select auth.uid()));
  perform public.log_admin('payout_' || p_payee, v_l, p_contract::text || ' ' || p_amount::text || ' ' || trim(p_ref));
  return 'ok';
end $$;
create or replace function public.admin_ledger()
returns table (contract_id uuid, contract_no text, status text, title text, price_bdt numeric, travel_from date, haji_name text, haji_code text,
               leader_id uuid, leader_name text, leader_code text, rate_pct numeric, commission_fixed numeric,
               paid_in numeric, pending_in numeric, commission numeric, paid_to_leader numeric, refunded numeric, due_to_leader numeric, still_to_pay numeric)
language sql stable security definer set search_path = '' as $$
  select c.id, c.contract_no, c.status, c.title, c.price_bdt, c.travel_from, c.haji_name, c.haji_code, c.leader_id, c.leader_name, c.leader_code,
         coalesce(r.commission_pct, 0), c.commission_bdt,
         m.paid_in, m.pending_in, m.commission, m.paid_to_leader, m.refunded, m.due_to_leader, m.still_to_pay
    from public.haji_contracts c
    left join public.leader_rates r on r.leader_id = c.leader_id
    cross join lateral public.contract_money(c.id) m
   where public.has_perm('payments') and c.status in ('accepted', 'completed', 'cancelled') and c.responded_at is not null
   order by (m.due_to_leader <> 0 or m.pending_in > 0) desc, c.travel_from nulls last, c.contract_no
   limit 1000;
$$;
create or replace function public.admin_leader_rates()
returns table (leader_id uuid, full_name text, leader_code text, agency_name text, commission_pct numeric, note text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.haji_code, lp.agency_name, coalesce(r.commission_pct, 0), r.note
    from public.profiles p left join public.leader_profiles lp on lp.user_id = p.id left join public.leader_rates r on r.leader_id = p.id
   where public.has_perm('payments') and p.role = 'leader'
   order by p.full_name limit 1000;
$$;

-- 5) Statistics and spreadsheet export also cover money ---------------------------------------------------------------
create or replace function public.admin_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.has_perm('reports') then null else jsonb_build_object(
    'hajis', (select count(*) from public.profiles where account_type = 'haji' and role in ('haji')),
    'leaders', (select count(*) from public.profiles where role = 'leader' and status = 'active'),
    'leaders_pending', (select count(*) from public.leader_applications where status = 'pending'),
    'suspended', (select count(*) from public.profiles where status = 'suspended'),
    'contracts_active', (select count(*) from public.haji_contracts where status = 'accepted'),
    'contracts_sent', (select count(*) from public.haji_contracts where status = 'sent'),
    'contracts_completed', (select count(*) from public.haji_contracts where status = 'completed'),
    'contracts_cancelled', (select count(*) from public.haji_contracts where status = 'cancelled'),
    'complaints_pending', (select count(*) from public.complaints where status = 'pending'),
    'reports_new', (select count(*) from public.user_reports where status = 'new'),
    'calls_new', (select count(*) from public.offer_interests where status = 'new'),
    'offers_visible', (select count(*) from public.offers where active and not hidden_by_admin and return_on >= current_date and (valid_until is null or valid_until >= current_date)),
    'new_users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'payments_pending', (select count(*) from public.haji_payments where status = 'submitted'),
    'money_in', (select coalesce(sum(amount), 0) from public.haji_payments where status = 'confirmed'),
    'money_out_leaders', (select coalesce(sum(amount), 0) from public.payouts where payee = 'leader'),
    'money_refunded', (select coalesce(sum(amount), 0) from public.payouts where payee = 'haji')) end;
$$;

create or replace function public.admin_export(p_kind text)
returns setof jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_kind = 'users' then
    return query select jsonb_build_object('আইডি', haji_code, 'নাম', full_name, 'মোবাইল', phone, 'ধরন', account_type, 'ভূমিকা', role,
      'অবস্থা', status, 'নম্বর যাচাই', phone_verified, 'যোগদান', created_at) from public.profiles order by created_at;
  elsif p_kind = 'contracts' then
    return query select jsonb_build_object('চুক্তি নম্বর', c.contract_no, 'অবস্থা', c.status, 'ধরন', c.kind, 'প্যাকেজ', c.title, 'দাম', c.price_bdt,
      'যাত্রা', c.travel_from, 'ফেরা', c.travel_to, 'হাজী', c.haji_name, 'হাজী আইডি', c.haji_code, 'লিডার', c.leader_name, 'লিডার আইডি', c.leader_code,
      'তৈরি', c.created_at, 'বাতিলের কারণ', c.cancel_reason)
      from public.haji_contracts c order by c.created_at;
  elsif p_kind = 'complaints' then
    return query select jsonb_build_object('অবস্থা', c.status, 'অভিযোগ', c.body, 'হাজী আইডি', k.haji_code, 'লিডার আইডি', k.leader_code,
      'তারিখ', c.created_at, 'অ্যাডমিন নোট', c.admin_note)
      from public.complaints c join public.haji_contracts k on k.id = c.contract_id order by c.created_at;
  elsif p_kind = 'payments' then
    return query select jsonb_build_object('তারিখ', p.paid_on, 'চুক্তি নম্বর', c.contract_no, 'হাজী', c.haji_name, 'হাজী আইডি', c.haji_code,
      'লিডার আইডি', c.leader_code, 'টাকা', p.amount, 'মাধ্যম', p.method, 'লেনদেন নম্বর', p.txn_ref, 'অবস্থা', p.status, 'নোট', p.admin_note)
      from public.haji_payments p join public.haji_contracts c on c.id = p.contract_id order by p.created_at;
  elsif p_kind = 'ledger' then
    return query select jsonb_build_object('চুক্তি নম্বর', l.contract_no, 'অবস্থা', l.status, 'হাজী আইডি', l.haji_code, 'লিডার আইডি', l.leader_code,
      'দাম', l.price_bdt, 'জমা (নিশ্চিত)', l.paid_in, 'যাচাই বাকি', l.pending_in, 'কমিশন', l.commission, 'লিডারকে দেওয়া', l.paid_to_leader,
      'হাজীকে ফেরত', l.refunded, 'লিডারের পাওনা', l.due_to_leader, 'হাজীর বাকি', l.still_to_pay)
      from public.admin_ledger() l;
  else
    raise exception 'bad kind';
  end if;
  perform public.log_admin('export_' || p_kind, null, null);
end $$;

-- 6) Function permissions --------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.offer_is_visible(uuid)', 'public.list_offers(text)', 'public.my_perms()', 'public.admin_set_setting(text, text)',
    'public.is_my_accepted_contract(uuid)', 'public.payments_today()', 'public.contract_money(uuid)', 'public.leader_money()',
    'public.admin_list_payments(text)', 'public.admin_review_payment(uuid, boolean, text)', 'public.admin_set_commission(uuid, numeric)',
    'public.admin_set_leader_rate(uuid, numeric, text)', 'public.admin_add_payout(uuid, text, numeric, text, text)', 'public.admin_ledger()',
    'public.admin_leader_rates()', 'public.admin_stats()', 'public.admin_export(text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
