-- 026: admin panel part 4. Run AFTER 025. Safe to run more than once.
--  1) Money alerts: a haji's money still due close to travel, a leader's share still to pay, a finished trip whose money
--     is not settled.
--  2) Service costs for Travel Adda's own leaders (visa, ticket, hotel ...), either for one contract or for the whole
--     group. They are taken off what is paid to the leader. Only staff with the payments permission see the list;
--     the leader sees only the total still due.
--  3) Work record filtered by staff member or action.
--  4) Notifications to one group, one travel month, or the leaders of one district.
--  5) SOS record: a call from the emergency page is noted (location only if the haji allowed it) and staff are told.

-- 2) Service costs ----------------------------------------------------------------------------------------------------
create table if not exists public.service_costs (
  id           uuid primary key default gen_random_uuid(),
  leader_id    uuid not null references public.profiles(id) on delete cascade,
  contract_id  uuid references public.haji_contracts(id) on delete cascade,      -- null = for the whole group
  kind         text not null check (kind in ('visa', 'ticket', 'hotel', 'transport', 'food', 'ziyarah', 'other')),
  amount       numeric(12, 2) not null check (amount > 0 and amount < 100000000),
  note         text not null check (char_length(trim(note)) between 3 and 300),
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists service_costs_by_leader on public.service_costs (leader_id, created_at desc);
create index if not exists service_costs_by_contract on public.service_costs (contract_id);
alter table public.service_costs enable row level security;
revoke all on public.service_costs from anon, authenticated;

-- Same as step 008, but the contract's service costs also come off the leader's share.
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
                    (select coalesce(sum(amount), 0) from public.payouts o where o.contract_id = p_contract and o.payee = 'haji') ph,
                    (select coalesce(sum(amount), 0) from public.service_costs s where s.contract_id = p_contract) svc)
  select c.price_bdt, m.pin, m.pend,
         case when c.leader_id = (select auth.uid()) or public.has_perm('payments') then c.comm end,
         m.pl, m.ph,
         case when c.leader_id = (select auth.uid()) or public.has_perm('payments') then m.pin - c.comm - m.pl - m.ph - m.svc end,
         greatest(c.price_bdt - m.pin, 0)
    from c, m
   where c.haji_id = (select auth.uid()) or c.leader_id = (select auth.uid()) or public.has_perm('payments');
$$;

create or replace function public.admin_add_service_cost(p_leader uuid, p_contract uuid, p_kind text, p_amount numeric, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('payments') then raise exception 'not allowed'; end if;
  if p_kind not in ('visa', 'ticket', 'hotel', 'transport', 'food', 'ziyarah', 'other') then raise exception 'bad kind'; end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 100000000 then raise exception 'bad amount'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'note needed'; end if;
  if not exists (select 1 from public.leader_profiles where user_id = p_leader and leader_kind = 'travel_adda') then return 'not_own'; end if;
  if p_contract is not null and not exists (select 1 from public.haji_contracts where id = p_contract and leader_id = p_leader) then return 'mismatch'; end if;
  insert into public.service_costs (leader_id, contract_id, kind, amount, note, created_by)
  values (p_leader, p_contract, p_kind, p_amount, left(trim(p_note), 300), (select auth.uid()));
  perform public.log_admin('service_cost_added', p_leader, p_kind || ' ' || p_amount::text || ' ' ||
    coalesce((select contract_no from public.haji_contracts where id = p_contract), 'পুরো দল') || ': ' || left(trim(p_note), 150));
  return 'ok';
end $$;

create or replace function public.admin_delete_service_cost(p_id uuid, p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.service_costs;
begin
  if not public.has_perm('payments') then raise exception 'not allowed'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason needed'; end if;
  delete from public.service_costs where id = p_id returning * into v;
  if v.id is null then return 'not_found'; end if;
  perform public.log_admin('service_cost_deleted', v.leader_id, v.kind || ' ' || v.amount::text || ' (' || left(v.note, 100) || '): ' || left(trim(p_reason), 150));
  return 'ok';
end $$;

create or replace function public.admin_service_costs(p_leader uuid)
returns table (id uuid, contract_id uuid, contract_no text, haji_name text, kind text, amount numeric, note text, created_at timestamptz, created_by_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm('payments') then raise exception 'not allowed'; end if;
  return query select s.id, s.contract_id, c.contract_no, c.haji_name, s.kind, s.amount, s.note, s.created_at, p.full_name
    from public.service_costs s left join public.haji_contracts c on c.id = s.contract_id left join public.profiles p on p.id = s.created_by
   where s.leader_id = p_leader order by s.created_at desc limit 500;
end $$;

-- What is still to be paid to one leader: all contract shares, minus the whole-group costs.
create or replace function public.admin_leader_balance(p_leader uuid)
returns table (due_total numeric, group_costs numeric, net numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_due numeric; v_grp numeric;
begin
  if not public.has_perm('payments') then raise exception 'not allowed'; end if;
  select coalesce(sum(m.due_to_leader), 0) into v_due from public.haji_contracts c cross join lateral public.contract_money(c.id) m
   where c.leader_id = p_leader and c.status in ('accepted', 'completed', 'cancelled') and c.responded_at is not null;
  select coalesce(sum(amount), 0) into v_grp from public.service_costs where leader_id = p_leader and contract_id is null;
  return query select v_due, v_grp, v_due - v_grp;
end $$;

-- Same as step 008, plus: a leader is never paid more than their total after whole-group costs.
create or replace function public.admin_add_payout(p_contract uuid, p_payee text, p_amount numeric, p_ref text, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_l uuid; v_due numeric; v_held numeric; v_net numeric;
begin
  if not public.has_perm('payments') then raise exception 'not allowed'; end if;
  if p_payee not in ('leader', 'haji') or p_amount is null or p_amount <= 0 or char_length(coalesce(trim(p_ref), '')) < 3 then return 'bad'; end if;
  select leader_id into v_l from public.haji_contracts where id = p_contract;
  if not found then return 'not_found'; end if;
  select m.due_to_leader, m.paid_in - m.paid_to_leader - m.refunded into v_due, v_held from public.contract_money(p_contract) m;
  if p_payee = 'leader' then
    if p_amount > v_due + 0.001 then return 'over'; end if;
    select b.net into v_net from public.admin_leader_balance(v_l) b;
    if p_amount > v_net + 0.001 then return 'over'; end if;
  end if;
  if p_payee = 'haji' and p_amount > v_held + 0.001 then return 'over'; end if;
  insert into public.payouts (contract_id, payee, amount, txn_ref, note, created_by) values (p_contract, p_payee, p_amount, trim(p_ref), left(p_note, 300), (select auth.uid()));
  perform public.log_admin('payout_' || p_payee, v_l, p_contract::text || ' ' || p_amount::text || ' ' || trim(p_ref));
  return 'ok';
end $$;

-- 1) Money alerts -----------------------------------------------------------------------------------------------------
create or replace function public.admin_money_alerts()
returns table (kind text, contract_id uuid, contract_no text, haji_name text, haji_code text, leader_name text, leader_code text,
               travel_from date, travel_to date, amount numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm('payments') then raise exception 'not allowed'; end if;
  return query
  with x as (
    select c.*, m.still_to_pay, m.due_to_leader, m.pending_in,
           coalesce(c.travel_to, c.travel_from) < current_date as over
      from public.haji_contracts c cross join lateral public.contract_money(c.id) m
     where c.status in ('accepted', 'completed') and c.responded_at is not null)
  select 'not_closed'::text, x.id, x.contract_no, x.haji_name, x.haji_code, x.leader_name, x.leader_code, x.travel_from, x.travel_to,
         x.still_to_pay + greatest(x.due_to_leader, 0)
    from x where x.over and (x.status = 'accepted' or x.still_to_pay > 0 or x.due_to_leader > 0 or x.pending_in > 0)
  union all
  select 'haji_due', x.id, x.contract_no, x.haji_name, x.haji_code, x.leader_name, x.leader_code, x.travel_from, x.travel_to, x.still_to_pay
    from x where not x.over and x.still_to_pay > 0 and x.travel_from <= current_date + 30
  union all
  select 'leader_due', x.id, x.contract_no, x.haji_name, x.haji_code, x.leader_name, x.leader_code, x.travel_from, x.travel_to, x.due_to_leader
    from x where not x.over and x.due_to_leader > 0 and x.travel_from <= current_date + 7
  order by 8 nulls last
  limit 500;
end $$;

-- Pending counts (step 022) + money alerts and SOS presses of the last day.
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
                                 'money_alerts', (select count(*) from public.admin_money_alerts())); end if;
  if public.has_perm('offers') then r := r || jsonb_build_object('offers', (select count(*) from public.offers where review = 'pending' and return_on >= current_date)); end if;
  if public.has_perm('users') then r := r || jsonb_build_object('sos', (select count(*) from public.sos_events where created_at > now() - interval '24 hours')); end if;
  return r;
end $$;

-- 3) Work record by staff member / action ------------------------------------------------------------------------------
create or replace function public.admin_audit_search(p_actor uuid, p_action text, p_days int)
returns table (id bigint, at timestamptz, actor_id uuid, actor_name text, action text, target_name text, target_code text, detail text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select a.id, a.at, a.actor, p.full_name, a.action, t.full_name, t.haji_code, a.detail
    from public.admin_audit a left join public.profiles p on p.id = a.actor left join public.profiles t on t.id = a.target
   where (p_actor is null or a.actor = p_actor) and (p_action is null or a.action = p_action)
     and a.at > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365))
   order by a.at desc limit 500;
end $$;

create or replace function public.admin_audit_actors()
returns table (actor_id uuid, actor_name text, role text, n bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select a.actor, p.full_name, p.role, count(*)
    from public.admin_audit a join public.profiles p on p.id = a.actor
   group by a.actor, p.full_name, p.role order by count(*) desc limit 100;
end $$;

-- 4) Notifications to one group / travel month / district --------------------------------------------------------------
create or replace function public.segment_users(p_kind text, p_value text)
returns setof uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if p_kind = 'group' then
    if p_value !~ '^[0-9a-fA-F-]{36}$' then raise exception 'bad group'; end if;
    return query select m.user_id from public.group_members m join public.profiles p on p.id = m.user_id
      where m.group_id = p_value::uuid and m.status = 'active' and p.status = 'active';
  elsif p_kind = 'month' then
    if p_value !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'bad month'; end if;
    return query select distinct c.haji_id from public.haji_contracts c join public.profiles p on p.id = c.haji_id
      where c.status = 'accepted' and to_char(c.travel_from, 'YYYY-MM') = p_value and p.status = 'active';
  elsif p_kind = 'district' then
    if char_length(trim(coalesce(p_value, ''))) < 2 then raise exception 'bad district'; end if;
    return query select p.id from public.profiles p join public.leader_profiles l on l.user_id = p.id
      where p.role = 'leader' and p.status = 'active' and l.district = trim(p_value);
  else
    raise exception 'bad kind';
  end if;
end $$;
revoke all on function public.segment_users(text, text) from public, anon, authenticated;   -- server use only

create or replace function public.admin_segment_size(p_kind text, p_value text) returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm('notify') then raise exception 'not allowed'; end if;
  return (select count(*)::int from public.segment_users(p_kind, p_value));
end $$;

create or replace function public.admin_notify_segment(p_kind text, p_value text, p_title text, p_body text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not public.has_perm('notify') then raise exception 'not allowed'; end if;
  perform public.segment_users(p_kind, p_value);        -- checks the kind and value first
  if char_length(trim(coalesce(p_title, ''))) < 2 then return 'title'; end if;
  if (select count(*) from public.admin_audit where actor = (select auth.uid()) and action = 'notify_segment' and at > now() - interval '1 hour') >= 20 then
    return 'too_many'; end if;
  insert into public.user_notifications (user_id, kind, title, body)
  select u, 'admin', left(trim(p_title), 120), nullif(left(trim(coalesce(p_body, '')), 1000), '') from public.segment_users(p_kind, p_value) u limit 20000;
  get diagnostics v_n = row_count;
  perform public.log_admin('notify_segment', null, p_kind || ':' || left(p_value, 40) || ' (' || v_n || ' জন) ' || left(trim(p_title), 120));
  return 'ok:' || v_n;
end $$;

-- 5) SOS record ---------------------------------------------------------------------------------------------------------
create table if not exists public.sos_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  number      text not null check (number ~ '^\+?[0-9]{2,15}$'),
  label       text check (label is null or char_length(label) <= 60),
  lat         numeric(9, 6) check (lat is null or lat between -90 and 90),
  lng         numeric(9, 6) check (lng is null or lng between -180 and 180),
  accuracy    numeric(8, 1) check (accuracy is null or accuracy between 0 and 100000),
  created_at  timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index if not exists sos_events_by_time on public.sos_events (created_at desc);
create index if not exists sos_events_by_user on public.sos_events (user_id, created_at desc);
alter table public.sos_events enable row level security;
revoke all on public.sos_events from anon, authenticated;

create or replace function public.log_sos(p_number text, p_label text, p_lat numeric, p_lng numeric, p_acc numeric)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_name text; v_recent boolean; r record;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if coalesce(p_number, '') !~ '^\+?[0-9]{2,15}$' then raise exception 'bad number'; end if;
  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'bad location'; end if;
  if (select count(*) from public.sos_events where user_id = v_uid and created_at > now() - interval '1 hour') >= 20 then return 'limit'; end if;
  v_recent := exists (select 1 from public.sos_events where user_id = v_uid and created_at > now() - interval '10 minutes');
  insert into public.sos_events (user_id, number, label, lat, lng, accuracy)
  values (v_uid, p_number, left(p_label, 60), p_lat, p_lng, case when p_lat is null then null else least(greatest(coalesce(p_acc, 0), 0), 100000) end);
  if not v_recent then                       -- one notice per emergency, not per press
    select full_name || ' (' || haji_code || ')' into v_name from public.profiles where id = v_uid;
    for r in select p.id from public.profiles p left join public.admin_staff s on s.user_id = p.id
              where p.status = 'active' and (p.role = 'admin' or (p.role = 'staff' and 'users' = any (s.perms))) loop
      perform public.notify_user(r.id, 'admin', left('🆘 জরুরি: ' || coalesce(v_name, 'একজন হাজী') || ' ' || p_number || '-এ ফোন করেছেন', 120),
        case when p_lat is null then 'অবস্থান পাঠানো হয়নি। অ্যাডমিন প্যানেলে "জরুরি রেকর্ড" দেখুন।'
             else 'অবস্থান পাঠানো হয়েছে। অ্যাডমিন প্যানেলে "জরুরি রেকর্ড" দেখুন।' end, 'Admin');
    end loop;
  end if;
  return 'ok';
end $$;

create or replace function public.admin_sos_list(p_days int)
returns table (id uuid, at timestamptz, user_id uuid, full_name text, code text, phone text, number text, label text, lat numeric, lng numeric, accuracy numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm('users') then raise exception 'not allowed'; end if;
  return query select e.id, e.created_at, e.user_id, p.full_name, p.haji_code, p.phone, e.number, e.label, e.lat, e.lng, e.accuracy
    from public.sos_events e join public.profiles p on p.id = e.user_id
   where e.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90))
   order by e.created_at desc limit 500;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.contract_money(uuid)', 'public.admin_add_service_cost(uuid, uuid, text, numeric, text)',
    'public.admin_delete_service_cost(uuid, text)', 'public.admin_service_costs(uuid)', 'public.admin_leader_balance(uuid)',
    'public.admin_add_payout(uuid, text, numeric, text, text)', 'public.admin_money_alerts()', 'public.admin_counts()',
    'public.admin_audit_search(uuid, text, int)', 'public.admin_audit_actors()', 'public.admin_segment_size(text, text)',
    'public.admin_notify_segment(text, text, text, text)', 'public.log_sos(text, text, numeric, numeric, numeric)', 'public.admin_sos_list(int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
