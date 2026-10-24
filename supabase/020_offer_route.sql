-- 020: every package states its journey, and the package list shows who the leader is. Run AFTER 019. Safe to re-run.
--  * Journey: departure airport in Bangladesh, arrival city in Saudi Arabia, which holy city first, nights in Makkah
--    and Madinah, return airport in Saudi Arabia and in Bangladesh, airline (optional).
--  * New packages must state the journey. Old packages without it still show (the app says "not stated"), but when
--    a leader changes one, the journey must be filled in.
--  * The package list now carries the leader's ID, name, photo, badge, rating and verified complaints — never a phone.

-- 1) Journey columns
alter table public.offers add column if not exists from_airport   text check (from_airport is null or from_airport in ('DAC', 'CGP', 'ZYL'));
alter table public.offers add column if not exists arrive_at      text check (arrive_at is null or arrive_at in ('JED', 'MED'));
alter table public.offers add column if not exists first_city     text check (first_city is null or first_city in ('makkah', 'madinah'));
alter table public.offers add column if not exists makkah_nights  int  check (makkah_nights is null or makkah_nights between 1 and 60);
alter table public.offers add column if not exists madinah_nights int  check (madinah_nights is null or madinah_nights between 0 and 60);
alter table public.offers add column if not exists return_from    text check (return_from is null or return_from in ('JED', 'MED'));
alter table public.offers add column if not exists return_to      text check (return_to is null or return_to in ('DAC', 'CGP', 'ZYL'));
alter table public.offers add column if not exists airline        text check (airline is null or char_length(airline) between 2 and 60);
-- all or nothing, and the nights fit inside the trip
do $$ begin
  alter table public.offers add constraint offers_route_whole check (
    (from_airport is null and arrive_at is null and first_city is null and makkah_nights is null and madinah_nights is null
       and return_from is null and return_to is null)
    or (from_airport is not null and arrive_at is not null and first_city is not null and makkah_nights is not null
       and madinah_nights is not null and return_from is not null and return_to is not null));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.offers add constraint offers_route_nights check (makkah_nights is null or makkah_nights + madinah_nights <= return_on - depart_on);
exception when duplicate_object then null; end $$;
create index if not exists offers_by_from_airport on public.offers (from_airport) where review = 'approved';

grant insert (kind, title, price_bdt, depart_on, return_on, makkah_hotel, makkah_distance_m, madinah_hotel, madinah_distance_m,
              room_share, includes, notes, valid_until, from_airport, arrive_at, first_city, makkah_nights, madinah_nights,
              return_from, return_to, airline) on public.offers to authenticated;
grant update (kind, title, price_bdt, depart_on, return_on, makkah_hotel, makkah_distance_m, madinah_hotel, madinah_distance_m,
              room_share, includes, notes, valid_until, active, from_airport, arrive_at, first_city, makkah_nights, madinah_nights,
              return_from, return_to, airline) on public.offers to authenticated;

-- 2) The guard (from 019) now also covers the journey, and a leader's new or changed package must state it
create or replace function public.offers_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;            -- SQL editor / server jobs
  if tg_op = 'INSERT' then
    if new.from_airport is null then raise exception 'journey required'; end if;
    return new;
  end if;
  if (new.kind, new.title, new.price_bdt, new.depart_on, new.return_on, new.makkah_hotel, new.makkah_distance_m,
      new.madinah_hotel, new.madinah_distance_m, new.room_share, new.includes, new.notes, new.valid_until,
      new.from_airport, new.arrive_at, new.first_city, new.makkah_nights, new.madinah_nights, new.return_from, new.return_to, new.airline)
     is distinct from
     (old.kind, old.title, old.price_bdt, old.depart_on, old.return_on, old.makkah_hotel, old.makkah_distance_m,
      old.madinah_hotel, old.madinah_distance_m, old.room_share, old.includes, old.notes, old.valid_until,
      old.from_airport, old.arrive_at, old.first_city, old.makkah_nights, old.madinah_nights, old.return_from, old.return_to, old.airline) then
    if old.review = 'approved' then raise exception 'approved package cannot be changed'; end if;
    if new.depart_on < current_date then raise exception 'departure date has passed'; end if;
    if new.from_airport is null then raise exception 'journey required'; end if;
    new.review := 'pending'; new.review_note := null; new.reviewed_at := null; new.reviewed_by := null;
  end if;
  return new;
end $$;
revoke all on function public.offers_guard() from public, anon, authenticated;
drop trigger if exists offers_guard on public.offers;
create trigger offers_guard before insert or update on public.offers for each row execute function public.offers_guard();

-- 3) Package list for hajis: journey + who the leader is. Same rules as before (approved, visible, referral, blocks).
drop function if exists public.list_offers(text);
create function public.list_offers(p_kind text)
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
         round(coalesce((select avg(r.stars) from public.leader_ratings r where r.leader_id = p.id), 0), 1),
         (select count(*)::int from public.leader_ratings r where r.leader_id = p.id),
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

-- 4) Admin check list also shows the journey
drop function if exists public.admin_offers_review();
create function public.admin_offers_review()
returns table (id uuid, kind text, title text, price_bdt numeric, depart_on date, return_on date, valid_until date,
               makkah_hotel text, makkah_distance_m int, madinah_hotel text, madinah_distance_m int, room_share int,
               includes text[], notes text, active boolean, hidden_by_admin boolean, review text, review_note text,
               created_at timestamptz, leader_name text, leader_code text, agency_name text,
               from_airport text, arrive_at text, first_city text, makkah_nights int, madinah_nights int,
               return_from text, return_to text, airline text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm('offers') then raise exception 'not allowed'; end if;
  return query
    select o.id, o.kind, o.title, o.price_bdt, o.depart_on, o.return_on, o.valid_until, o.makkah_hotel, o.makkah_distance_m,
           o.madinah_hotel, o.madinah_distance_m, o.room_share, o.includes, o.notes, o.active, o.hidden_by_admin, o.review,
           o.review_note, o.created_at, p.full_name, p.haji_code, lp.agency_name,
           o.from_airport, o.arrive_at, o.first_city, o.makkah_nights, o.madinah_nights, o.return_from, o.return_to, o.airline
      from public.offers o join public.profiles p on p.id = o.leader_id left join public.leader_profiles lp on lp.user_id = o.leader_id
     order by (o.review = 'pending') desc, o.created_at desc
     limit 300;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.list_offers(text)', 'public.admin_offers_review()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
