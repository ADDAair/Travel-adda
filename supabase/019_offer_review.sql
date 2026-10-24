-- 019: leader packages are checked by the admin before hajis see them. Run AFTER 018. Safe to run more than once.
--  * A new package waits ("pending"). Until the admin approves it, the leader can change it.
--  * After approval the price and details are locked (no bait-and-switch); the leader can only hide it.
--  * If the admin sends it back ("rejected", with a reason), the leader fixes it and it waits again.
--  * Packages that were already published before this step stay published (counted as approved).
--  * An umrah package can never include qurbani.

-- 1) Review columns. Existing rows become 'approved'; new rows start as 'pending'.
alter table public.offers add column if not exists review text not null default 'approved' check (review in ('pending', 'approved', 'rejected'));
alter table public.offers alter column review set default 'pending';
alter table public.offers add column if not exists review_note text check (review_note is null or char_length(review_note) <= 300);
alter table public.offers add column if not exists reviewed_at timestamptz;
alter table public.offers add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
create index if not exists offers_waiting on public.offers (created_at) where review = 'pending';

-- 2) No qurbani in umrah (old rows cleaned first, before the guard below exists)
update public.offers set includes = array_remove(includes, 'qurbani') where kind = 'umrah' and 'qurbani' = any(includes);
do $$ begin
  alter table public.offers add constraint offers_umrah_no_qurbani check (kind = 'hajj' or not ('qurbani' = any(includes)));
exception when duplicate_object then null; end $$;

-- 3) The leader may change the details (not the review columns) while the package is not approved
grant update (kind, title, price_bdt, depart_on, return_on, makkah_hotel, makkah_distance_m, madinah_hotel,
              madinah_distance_m, room_share, includes, notes, valid_until, active) on public.offers to authenticated;

create or replace function public.offers_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;            -- SQL editor / server jobs
  if (new.kind, new.title, new.price_bdt, new.depart_on, new.return_on, new.makkah_hotel, new.makkah_distance_m,
      new.madinah_hotel, new.madinah_distance_m, new.room_share, new.includes, new.notes, new.valid_until)
     is distinct from
     (old.kind, old.title, old.price_bdt, old.depart_on, old.return_on, old.makkah_hotel, old.makkah_distance_m,
      old.madinah_hotel, old.madinah_distance_m, old.room_share, old.includes, old.notes, old.valid_until) then
    if old.review = 'approved' then raise exception 'approved package cannot be changed'; end if;
    if new.depart_on < current_date then raise exception 'departure date has passed'; end if;
    new.review := 'pending'; new.review_note := null; new.reviewed_at := null; new.reviewed_by := null;
  end if;
  return new;
end $$;
revoke all on function public.offers_guard() from public, anon, authenticated;
drop trigger if exists offers_guard on public.offers;
create trigger offers_guard before update on public.offers for each row execute function public.offers_guard();

-- 4) Hajis see only approved packages
drop policy if exists "offers_select" on public.offers;
create policy "offers_select" on public.offers for select to authenticated
  using ((active and not hidden_by_admin and review = 'approved' and return_on >= current_date)
         or leader_id = (select auth.uid()) or (select public.has_perm('offers')));

create or replace function public.offer_is_visible(p_offer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.offers o join public.profiles p on p.id = o.leader_id
                  where o.id = p_offer and o.active and not o.hidden_by_admin and o.review = 'approved' and o.return_on >= current_date
                    and (o.valid_until is null or o.valid_until >= current_date)
                    and p.role = 'leader' and p.status = 'active');
$$;

drop function if exists public.list_offers(text);   -- 020 widens it; re-running this file must not clash
create function public.list_offers(p_kind text)
returns table (id uuid, kind text, title text, price_bdt numeric, depart_on date, return_on date, makkah_hotel text,
               makkah_distance_m int, madinah_hotel text, madinah_distance_m int, room_share int, includes text[],
               notes text, agency_name text, created_at timestamptz, valid_until date)
language sql stable security definer set search_path = '' as $$
  select o.id, o.kind, o.title, o.price_bdt, o.depart_on, o.return_on, o.makkah_hotel, o.makkah_distance_m,
         o.madinah_hotel, o.madinah_distance_m, o.room_share, o.includes, o.notes, lp.agency_name, o.created_at, o.valid_until
    from public.offers o join public.profiles p on p.id = o.leader_id left join public.leader_profiles lp on lp.user_id = o.leader_id
   where (select auth.uid()) is not null
     and o.kind = p_kind and o.review = 'approved' and o.active and not o.hidden_by_admin and o.return_on >= current_date
     and (o.valid_until is null or o.valid_until >= current_date)
     and p.role = 'leader' and p.status = 'active'
     and (public.active_referral_leader((select auth.uid())) is null or o.leader_id = public.active_referral_leader((select auth.uid())))
     and not exists (select 1 from public.user_blocks b where b.blocker = (select auth.uid()) and b.blocked = o.leader_id)
   order by o.price_bdt asc, o.depart_on asc
   limit 200;
$$;

-- 5) Admin: list (waiting first) and decide. The leader gets a notification.
alter table public.user_notifications drop constraint if exists user_notifications_route_check;
alter table public.user_notifications add constraint user_notifications_route_check check (route is null or route in
  ('MyLeader', 'LeaderContracts', 'Group', 'Leader', 'Admin', 'Offers', 'Docs', 'Account', 'Home', 'Leaders', 'HelpChat', 'HelpInbox', 'KhademHome', 'LeaderOffers'));

drop function if exists public.admin_offers_review();
create function public.admin_offers_review()
returns table (id uuid, kind text, title text, price_bdt numeric, depart_on date, return_on date, valid_until date,
               makkah_hotel text, makkah_distance_m int, madinah_hotel text, madinah_distance_m int, room_share int,
               includes text[], notes text, active boolean, hidden_by_admin boolean, review text, review_note text,
               created_at timestamptz, leader_name text, leader_code text, agency_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm('offers') then raise exception 'not allowed'; end if;
  return query
    select o.id, o.kind, o.title, o.price_bdt, o.depart_on, o.return_on, o.valid_until, o.makkah_hotel, o.makkah_distance_m,
           o.madinah_hotel, o.madinah_distance_m, o.room_share, o.includes, o.notes, o.active, o.hidden_by_admin, o.review,
           o.review_note, o.created_at, p.full_name, p.haji_code, lp.agency_name
      from public.offers o join public.profiles p on p.id = o.leader_id left join public.leader_profiles lp on lp.user_id = o.leader_id
     order by (o.review = 'pending') desc, o.created_at desc
     limit 300;
end $$;

create or replace function public.admin_review_offer(p_offer uuid, p_decision text, p_note text)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.offers%rowtype; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.has_perm('offers') then raise exception 'not allowed'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'bad decision'; end if;
  if p_decision = 'reject' and (v_note is null or char_length(v_note) < 2) then raise exception 'reason needed'; end if;
  select * into v from public.offers where id = p_offer for update;
  if not found then return 'not_found'; end if;
  if v.review <> 'pending' then return 'not_pending'; end if;
  update public.offers set review = case when p_decision = 'approve' then 'approved' else 'rejected' end,
         review_note = case when p_decision = 'reject' then left(v_note, 300) end,
         reviewed_at = now(), reviewed_by = (select auth.uid())
   where id = p_offer;
  perform public.log_admin(case when p_decision = 'approve' then 'offer_approved' else 'offer_rejected' end, p_offer, v_note);
  if p_decision = 'approve' then
    perform public.notify_user(v.leader_id, 'admin', 'প্যাকেজ অনুমোদন হয়েছে: ' || left(v.title, 60),
      'হাজীরা এখন "অফার" পাতায় প্যাকেজটি দেখতে পাচ্ছেন।', 'LeaderOffers');
  else
    perform public.notify_user(v.leader_id, 'admin', 'প্যাকেজ ঠিক করতে হবে: ' || left(v.title, 60),
      'কারণ: ' || left(v_note, 300) || '। ঠিক করে আবার জমা দিন।', 'LeaderOffers');
  end if;
  return 'ok';
end $$;

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
    'offers_visible', (select count(*) from public.offers where active and not hidden_by_admin and review = 'approved' and return_on >= current_date and (valid_until is null or valid_until >= current_date)),
    'offers_pending', (select count(*) from public.offers where review = 'pending' and return_on >= current_date),
    'new_users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'payments_pending', (select count(*) from public.haji_payments where status = 'submitted'),
    'money_in', (select coalesce(sum(amount), 0) from public.haji_payments where status = 'confirmed'),
    'money_out_leaders', (select coalesce(sum(amount), 0) from public.payouts where payee = 'leader'),
    'money_refunded', (select coalesce(sum(amount), 0) from public.payouts where payee = 'haji')) end;
$$;

-- 6) Function permissions
do $$
declare f text;
begin
  foreach f in array array['public.offer_is_visible(uuid)', 'public.list_offers(text)', 'public.admin_offers_review()',
    'public.admin_review_offer(uuid, text, text)', 'public.admin_stats()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
