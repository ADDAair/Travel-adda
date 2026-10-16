-- 005: Offers & packages. Run AFTER 004_groups.sql. Safe to run more than once.
--  * Only approved leaders publish packages. A published package cannot be edited (no bait-and-switch);
--    the leader can only hide it and publish a new one. The admin can hide any package.
--  * All signed-in users see visible packages with the agency name — never the leader's phone.
--  * Contact goes through the Travel Adda helpline. "Please call me" requests (name + phone) are visible
--    ONLY to the admin; the leader sees just how many people were interested.

-- 1) App settings: helpline number and hours, set by the admin from the app ------------------------------------
create table if not exists public.app_settings (
  key         text primary key check (key in ('helpline_phone', 'helpline_hours')),
  value       text not null check (char_length(value) <= 80),
  updated_at  timestamptz not null default now()
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;
drop policy if exists "settings_read" on public.app_settings;
create policy "settings_read" on public.app_settings for select to authenticated using (true);

create or replace function public.admin_set_setting(p_key text, p_value text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('helpline_phone', 'helpline_hours') then raise exception 'bad key'; end if;
  if p_value is null or trim(p_value) = '' then
    delete from public.app_settings where key = p_key;
  else
    if p_key = 'helpline_phone' and trim(p_value) !~ '^\+?[0-9]{6,15}$' then raise exception 'bad phone'; end if;
    insert into public.app_settings (key, value) values (p_key, left(trim(p_value), 80))
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  return 'ok';
end $$;

-- 2) Packages -------------------------------------------------------------------------------------------------------
create table if not exists public.offers (
  id                 uuid primary key default gen_random_uuid(),
  leader_id          uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind               text not null check (kind in ('hajj', 'umrah')),
  title              text not null check (char_length(title) between 2 and 100),
  price_bdt          numeric(12, 2) not null check (price_bdt > 0 and price_bdt < 100000000),
  depart_on          date not null,
  return_on          date not null,
  makkah_hotel       text check (makkah_hotel is null or char_length(makkah_hotel) <= 100),
  makkah_distance_m  int check (makkah_distance_m is null or makkah_distance_m between 0 and 50000),
  madinah_hotel      text check (madinah_hotel is null or char_length(madinah_hotel) <= 100),
  madinah_distance_m int check (madinah_distance_m is null or madinah_distance_m between 0 and 50000),
  room_share         int check (room_share is null or room_share between 1 and 10),
  includes           text[] not null default '{}' check (includes <@ array['flight','visa','food','transport','ziyarah','qurbani','guide','insurance']::text[]),
  notes              text check (notes is null or char_length(notes) <= 1500),
  active             boolean not null default true,
  hidden_by_admin    boolean not null default false,
  created_at         timestamptz not null default now(),
  check (return_on >= depart_on and return_on <= depart_on + 120)
);
create index if not exists offers_visible on public.offers (kind, price_bdt) where active and not hidden_by_admin;
alter table public.offers enable row level security;
revoke all on public.offers from anon, authenticated;
grant select on public.offers to authenticated;
grant insert (kind, title, price_bdt, depart_on, return_on, makkah_hotel, makkah_distance_m, madinah_hotel,
              madinah_distance_m, room_share, includes, notes) on public.offers to authenticated;
grant update (active) on public.offers to authenticated;      -- the leader can only hide / show again

-- (a policy may not query its own table, so the limit of 20 visible packages per leader is counted here)
create or replace function public.my_active_offer_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.offers where leader_id = (select auth.uid()) and active;
$$;

drop policy if exists "offers_select" on public.offers;
create policy "offers_select" on public.offers for select to authenticated
  using ((active and not hidden_by_admin and return_on >= current_date) or leader_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "offers_insert" on public.offers;
create policy "offers_insert" on public.offers for insert to authenticated
  with check (leader_id = (select auth.uid()) and (select public.is_leader()) and depart_on >= current_date
              and public.my_active_offer_count() < 20);
drop policy if exists "offers_update" on public.offers;
create policy "offers_update" on public.offers for update to authenticated
  using (leader_id = (select auth.uid())) with check (leader_id = (select auth.uid()));

-- Public list: visible packages with the agency name only (no phone, no leader id). Cheapest first.
create or replace function public.list_offers(p_kind text)
returns table (id uuid, kind text, title text, price_bdt numeric, depart_on date, return_on date, makkah_hotel text,
               makkah_distance_m int, madinah_hotel text, madinah_distance_m int, room_share int, includes text[],
               notes text, agency_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.kind, o.title, o.price_bdt, o.depart_on, o.return_on, o.makkah_hotel, o.makkah_distance_m,
         o.madinah_hotel, o.madinah_distance_m, o.room_share, o.includes, o.notes,
         (select a.agency_name from public.leader_applications a
           where a.user_id = o.leader_id and a.status = 'approved' order by a.reviewed_at desc nulls last limit 1),
         o.created_at
    from public.offers o join public.profiles p on p.id = o.leader_id
   where (select auth.uid()) is not null
     and o.kind = p_kind and o.active and not o.hidden_by_admin and o.return_on >= current_date
     and p.role = 'leader' and p.status = 'active'
   order by o.price_bdt asc, o.depart_on asc
   limit 200;
$$;

-- 3) "Please call me" requests (only the admin sees who) --------------------------------------------------------
create table if not exists public.offer_interests (
  id          uuid primary key default gen_random_uuid(),
  offer_id    uuid not null references public.offers(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  status      text not null default 'new' check (status in ('new', 'contacted')),
  admin_note  text check (admin_note is null or char_length(admin_note) <= 300),
  created_at  timestamptz not null default now(),
  contacted_at timestamptz
);
create unique index if not exists offer_interest_one_open on public.offer_interests (offer_id, user_id) where status = 'new';
alter table public.offer_interests enable row level security;
revoke all on public.offer_interests from anon, authenticated;
grant select on public.offer_interests to authenticated;
grant insert (offer_id) on public.offer_interests to authenticated;
grant delete on public.offer_interests to authenticated;

create or replace function public.offer_is_visible(p_offer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.offers o join public.profiles p on p.id = o.leader_id
                  where o.id = p_offer and o.active and not o.hidden_by_admin and o.return_on >= current_date
                    and p.role = 'leader' and p.status = 'active');
$$;
create or replace function public.open_interest_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.offer_interests where user_id = (select auth.uid()) and status = 'new';
$$;

drop policy if exists "oi_select" on public.offer_interests;
create policy "oi_select" on public.offer_interests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "oi_insert" on public.offer_interests;
create policy "oi_insert" on public.offer_interests for insert to authenticated
  with check (user_id = (select auth.uid()) and public.offer_is_visible(offer_id) and public.open_interest_count() < 10);
drop policy if exists "oi_delete" on public.offer_interests;
create policy "oi_delete" on public.offer_interests for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'new');

-- Admin: list requests with the haji's name and phone, and mark them done.
create or replace function public.admin_list_interests()
returns table (id uuid, status text, admin_note text, created_at timestamptz, full_name text, phone text, haji_code text,
               offer_id uuid, offer_title text, offer_kind text, price_bdt numeric, agency_name text, leader_name text, leader_phone text)
language sql stable security definer set search_path = '' as $$
  select i.id, i.status, i.admin_note, i.created_at, p.full_name, p.phone, p.haji_code,
         o.id, o.title, o.kind, o.price_bdt,
         (select a.agency_name from public.leader_applications a where a.user_id = o.leader_id and a.status = 'approved'
           order by a.reviewed_at desc nulls last limit 1),
         l.full_name, l.phone
    from public.offer_interests i
    join public.profiles p on p.id = i.user_id
    join public.offers o on o.id = i.offer_id
    join public.profiles l on l.id = o.leader_id
   where public.is_admin()
   order by (i.status = 'new') desc, i.created_at desc
   limit 300;
$$;
create or replace function public.admin_mark_interest(p_id uuid, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.offer_interests set status = 'contacted', contacted_at = now(), admin_note = left(p_note, 300)
   where id = p_id and status = 'new';
  return case when found then 'ok' else 'not_found' end;
end $$;
create or replace function public.admin_hide_offer(p_offer uuid, p_hide boolean)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.offers set hidden_by_admin = p_hide where id = p_offer;
  return case when found then 'ok' else 'not_found' end;
end $$;

-- Leader: how many people asked about each of my packages (numbers only, no names).
create or replace function public.my_offer_interest_counts()
returns table (offer_id uuid, total int, open int)
language sql stable security definer set search_path = '' as $$
  select o.id, count(i.id)::int, count(i.id) filter (where i.status = 'new')::int
    from public.offers o left join public.offer_interests i on i.offer_id = o.id
   where o.leader_id = (select auth.uid())
   group by o.id;
$$;

-- Function permissions: signed-in users only (each function checks its own rules inside).
do $$
declare f text;
begin
  foreach f in array array['public.admin_set_setting(text, text)', 'public.my_active_offer_count()', 'public.list_offers(text)', 'public.offer_is_visible(uuid)',
                           'public.open_interest_count()', 'public.admin_list_interests()', 'public.admin_mark_interest(uuid, text)',
                           'public.admin_hide_offer(uuid, boolean)', 'public.my_offer_interest_counts()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
