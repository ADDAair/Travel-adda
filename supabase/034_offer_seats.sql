-- 034 (owner, Nov 2026): "⏳ আসন বাকি" — a leader says how many seats are left on his package.
-- Safe to run more than once. Run in the Supabase SQL Editor.
--   * Two new columns on offers: seats_left (0–500, empty = not said) and seats_updated_at (set by the server).
--   * Only the leader who owns the package can change it, only through set_offer_seats(), only while the package is
--     still running. Changing seats does NOT send an approved package back to review (it is not a package detail).
--   * The columns cannot be written directly, so nobody can fake the time; the app hides an old (stale) number.
--   * list_offers() also returns the two columns; every earlier rule (approved only, referral, blocks) stays.

alter table public.offers add column if not exists seats_left int;
alter table public.offers add column if not exists seats_updated_at timestamptz;
do $$ begin
  alter table public.offers add constraint offers_seats_range check (seats_left is null or seats_left between 0 and 500);
exception when duplicate_object then null; end $$;
revoke update (seats_left, seats_updated_at) on public.offers from public, anon, authenticated;

create or replace function public.set_offer_seats(p_offer uuid, p_seats int)
returns text language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if p_seats is not null and (p_seats < 0 or p_seats > 500) then return 'bad_value'; end if;
  update public.offers set seats_left = p_seats, seats_updated_at = case when p_seats is null then null else now() end
   where id = p_offer and leader_id = v_me and return_on >= current_date;
  if not found then return 'not_found'; end if;
  return 'ok';
end $$;

drop function if exists public.list_offers(text);
create function public.list_offers(p_kind text)
returns table (id uuid, kind text, title text, price_bdt numeric, depart_on date, return_on date, makkah_hotel text,
               makkah_distance_m int, madinah_hotel text, madinah_distance_m int, room_share int, includes text[],
               notes text, agency_name text, created_at timestamptz, valid_until date,
               from_airport text, arrive_at text, first_city text, makkah_nights int, madinah_nights int,
               return_from text, return_to text, airline text,
               leader_id uuid, leader_code text, leader_name text, leader_kind text, avatar_path text, district text,
               rating_avg numeric, rating_count int, complaints_verified int, member_since timestamptz,
               seats_left int, seats_updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.kind, o.title, o.price_bdt, o.depart_on, o.return_on, o.makkah_hotel, o.makkah_distance_m,
         o.madinah_hotel, o.madinah_distance_m, o.room_share, o.includes, o.notes, lp.agency_name, o.created_at, o.valid_until,
         o.from_airport, o.arrive_at, o.first_city, o.makkah_nights, o.madinah_nights, o.return_from, o.return_to, o.airline,
         p.id, p.haji_code, p.full_name, lp.leader_kind, p.avatar_path, lp.district,
         round(coalesce((select avg(r.stars) from public.leader_ratings r where r.leader_id = p.id and public.rating_counts(r.contract_id)), 0), 1),
         (select count(*)::int from public.leader_ratings r where r.leader_id = p.id and public.rating_counts(r.contract_id)),
         (select count(*)::int from public.complaints c where c.leader_id = p.id and c.status = 'verified'),
         p.created_at,
         o.seats_left, o.seats_updated_at
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

do $$
declare f text;
begin
  foreach f in array array['public.list_offers(text)', 'public.set_offer_seats(uuid, int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
