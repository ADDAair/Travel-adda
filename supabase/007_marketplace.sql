-- 007: separate leader accounts, leader directory, referral code ("My leader"), per-haji contracts, ratings,
--      complaints with evidence, report & block, admin staff roles, audit log, terms text, suspend.
-- Run AFTER 006. Safe to re-run.
--
-- Rules from the design that this file enforces in the database:
--  * A person chooses "haji" or "leader" when creating the account; a haji account can never become a leader.
--  * Before a contract is accepted, a haji and a leader never see each other's phone number.
--  * One active (accepted) contract per haji; cancelling needs a written reason.
--  * Only a haji who had a contract with a leader can rate or complain about that leader.
--  * Complaints become public only after the admin verifies them.
--  * A haji who signed up with a leader's referral code sees only that leader until the admin approves a cancel request.

-- 0) Accounts ----------------------------------------------------------------------------------------------------
alter table public.profiles add column if not exists account_type text not null default 'haji';
do $$ begin
  alter table public.profiles add constraint profiles_account_type_check check (account_type in ('haji', 'leader'));
exception when duplicate_object then null; end $$;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('haji', 'leader', 'admin', 'staff'));
create sequence if not exists public.leader_code_seq start 1;
update public.profiles set account_type = 'leader' where role = 'leader' and account_type <> 'leader';   -- leaders from the earlier flow

create or replace function public.protect_profile_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.id is distinct from old.id or new.role is distinct from old.role or
       new.haji_code is distinct from old.haji_code or new.phone is distinct from old.phone or
       new.status is distinct from old.status or new.phone_verified is distinct from old.phone_verified or
       new.account_type is distinct from old.account_type) then
    raise exception 'protected column';
  end if;
  return new;
end $$;

-- New accounts: role is always 'haji' (no rights). A leader account gets a TL- code and must still be approved.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_phone text := split_part(new.email, '@', 1);
        v_leader boolean := coalesce(new.raw_user_meta_data->>'account_type', '') = 'leader';
begin
  insert into public.profiles (id, role, account_type, haji_code, full_name, phone)
  values (new.id, 'haji', case when v_leader then 'leader' else 'haji' end,
          case when v_leader then 'TL-' || lpad(nextval('public.leader_code_seq')::text, 5, '0')
               else 'TA-' || lpad(nextval('public.haji_code_seq')::text, 5, '0') end,
          trim(coalesce(new.raw_user_meta_data->>'full_name', '')), v_phone);
  return new;
end $$;

-- 1) Staff permissions and audit log ----------------------------------------------------------------------------
create table if not exists public.admin_staff (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  perms       text[] not null default '{}' check (perms <@ array['applications', 'calls', 'offers', 'complaints', 'reports', 'users']::text[]),
  updated_at  timestamptz not null default now()
);
alter table public.admin_staff enable row level security;
revoke all on public.admin_staff from anon, authenticated;

create table if not exists public.admin_audit (
  id      bigint generated always as identity primary key,
  actor   uuid references public.profiles(id) on delete set null,
  action  text not null,
  target  uuid,
  detail  text check (detail is null or char_length(detail) <= 500),
  at      timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and status = 'active' and role = 'admin')
      or exists (select 1 from public.profiles pr join public.admin_staff s on s.user_id = pr.id
                  where pr.id = (select auth.uid()) and pr.status = 'active' and pr.role = 'staff' and p = any (s.perms));
$$;
create or replace function public.log_admin(p_action text, p_target uuid, p_detail text) returns void
language sql security definer set search_path = '' as $$
  insert into public.admin_audit (actor, action, target, detail) values ((select auth.uid()), p_action, p_target, left(p_detail, 500));
$$;
revoke all on function public.log_admin(text, uuid, text) from public, anon, authenticated;   -- only other server functions

-- 2) Leader applications and public leader profiles ---------------------------------------------------------------
alter table public.leader_applications add column if not exists umrah_license text check (umrah_license is null or char_length(umrah_license) <= 40);
alter table public.leader_applications add column if not exists hajj_license text check (hajj_license is null or char_length(hajj_license) <= 40);
alter table public.leader_applications add column if not exists district text check (district is null or char_length(district) <= 40);
alter table public.leader_applications add column if not exists upazila text check (upazila is null or char_length(upazila) <= 60);
grant insert (agency_name, license_no, doc_path, umrah_license, hajj_license, district, upazila) on public.leader_applications to authenticated;

drop policy if exists "lapp_insert" on public.leader_applications;
create policy "lapp_insert" on public.leader_applications for insert to authenticated
  with check (user_id = (select auth.uid())
              and (doc_path is null or doc_path like (select auth.uid())::text || '/%')
              and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_type = 'leader' and p.role = 'haji' and p.status = 'active')
              and (not public.otp_live() or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.phone_verified)));
drop policy if exists "lapp_select" on public.leader_applications;
create policy "lapp_select" on public.leader_applications for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_perm('applications')));
drop policy if exists "ldocs_select" on storage.objects;
create policy "ldocs_select" on storage.objects for select to authenticated
  using (bucket_id = 'leader-docs' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.has_perm('applications'))));

create table if not exists public.leader_profiles (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  agency_name    text not null check (char_length(agency_name) between 2 and 120),
  umrah_license  text check (umrah_license is null or char_length(umrah_license) <= 40),
  hajj_license   text check (hajj_license is null or char_length(hajj_license) <= 40),
  district       text check (district is null or char_length(district) <= 40),
  upazila        text check (upazila is null or char_length(upazila) <= 60),
  bio            text check (bio is null or char_length(bio) <= 600),
  updated_at     timestamptz not null default now()
);
alter table public.leader_profiles enable row level security;
revoke all on public.leader_profiles from anon, authenticated;
grant select on public.leader_profiles to authenticated;
grant update (district, upazila, bio) on public.leader_profiles to authenticated;     -- licences change only through the admin
drop policy if exists "lprof_select_own" on public.leader_profiles;
create policy "lprof_select_own" on public.leader_profiles for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "lprof_update_own" on public.leader_profiles;
create policy "lprof_update_own" on public.leader_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Leaders who were approved through the earlier "haji applies" flow keep working.
insert into public.leader_profiles (user_id, agency_name, umrah_license, district, upazila)
select distinct on (a.user_id) a.user_id, a.agency_name, coalesce(a.umrah_license, a.license_no), a.district, a.upazila
  from public.leader_applications a join public.profiles p on p.id = a.user_id
 where a.status = 'approved' and p.role = 'leader'
 order by a.user_id, a.reviewed_at desc nulls last
on conflict (user_id) do nothing;

create or replace function public.review_leader_application(p_app uuid, p_approve boolean, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_a public.leader_applications;
begin
  if not public.has_perm('applications') then raise exception 'not allowed'; end if;
  update public.leader_applications
     set status = case when p_approve then 'approved' else 'rejected' end,
         admin_note = left(p_note, 500), reviewed_at = now(), reviewed_by = (select auth.uid())
   where id = p_app and status = 'pending'
   returning * into v_a;
  if v_a.id is null then return 'not_pending'; end if;
  if p_approve then
    update public.profiles set role = 'leader' where id = v_a.user_id and role = 'haji';
    insert into public.leader_profiles (user_id, agency_name, umrah_license, hajj_license, district, upazila)
    values (v_a.user_id, v_a.agency_name, coalesce(v_a.umrah_license, v_a.license_no), v_a.hajj_license, v_a.district, v_a.upazila)
    on conflict (user_id) do update set agency_name = excluded.agency_name, umrah_license = excluded.umrah_license,
      hajj_license = excluded.hajj_license, district = coalesce(excluded.district, public.leader_profiles.district),
      upazila = coalesce(excluded.upazila, public.leader_profiles.upazila), updated_at = now();
  end if;
  perform public.log_admin(case when p_approve then 'approve_leader' else 'reject_leader' end, v_a.user_id, p_note);
  return 'ok';
end $$;

drop function if exists public.admin_list_applications();
create function public.admin_list_applications()
returns table (id uuid, user_id uuid, full_name text, phone text, haji_code text, agency_name text, license_no text,
               doc_path text, status text, admin_note text, created_at timestamptz,
               umrah_license text, hajj_license text, district text, upazila text, avatar_path text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.user_id, p.full_name, p.phone, p.haji_code, a.agency_name, a.license_no, a.doc_path, a.status, a.admin_note,
         a.created_at, a.umrah_license, a.hajj_license, a.district, a.upazila, p.avatar_path
    from public.leader_applications a join public.profiles p on p.id = a.user_id
   where public.has_perm('applications')
   order by (a.status = 'pending') desc, a.created_at desc
   limit 300;
$$;

create or replace function public.is_public_leader(p_user text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p join public.leader_profiles l on l.user_id = p.id
                  where p.id::text = p_user and p.role = 'leader' and p.status = 'active');
$$;
-- Hajis may see an approved leader's profile photo in the directory, and staff may see an applicant's photo.
drop policy if exists "avatars_select_public_leader" on storage.objects;
create policy "avatars_select_public_leader" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (public.is_public_leader((storage.foldername(name))[1]) or (select public.has_perm('applications'))));

-- 3) Report and block ---------------------------------------------------------------------------------------------
create table if not exists public.user_blocks (
  blocker     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;
grant select, delete on public.user_blocks to authenticated;
grant insert (blocked) on public.user_blocks to authenticated;
drop policy if exists "blocks_own" on public.user_blocks;
create policy "blocks_own" on public.user_blocks for all to authenticated
  using (blocker = (select auth.uid())) with check (blocker = (select auth.uid()));

create table if not exists public.user_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target      uuid not null references public.profiles(id) on delete cascade,
  reason      text not null check (reason in ('fraud', 'abuse', 'fake', 'spam', 'other')),
  details     text check (details is null or char_length(details) <= 1000),
  status      text not null default 'new' check (status in ('new', 'handled')),
  admin_note  text check (admin_note is null or char_length(admin_note) <= 500),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,
  handled_by  uuid references public.profiles(id) on delete set null,
  check (reporter <> target)
);
alter table public.user_reports enable row level security;
revoke all on public.user_reports from anon, authenticated;
grant select on public.user_reports to authenticated;
grant insert (target, reason, details) on public.user_reports to authenticated;
create or replace function public.reports_today() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.user_reports where reporter = (select auth.uid()) and created_at > now() - interval '1 day';
$$;
drop policy if exists "reports_select_own" on public.user_reports;
create policy "reports_select_own" on public.user_reports for select to authenticated using (reporter = (select auth.uid()));
drop policy if exists "reports_insert_own" on public.user_reports;
create policy "reports_insert_own" on public.user_reports for insert to authenticated
  with check (reporter = (select auth.uid()) and public.reports_today() < 10);

create or replace function public.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;

-- 4) Referral code ("My leader") ------------------------------------------------------------------------------
create table if not exists public.leader_referrals (
  haji_id           uuid primary key references public.profiles(id) on delete cascade,
  leader_id         uuid not null references public.profiles(id) on delete cascade,
  status            text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at        timestamptz not null default now(),
  decided_at        timestamptz,
  cancel_requested  boolean not null default false,
  cancel_reason     text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  cancel_at         timestamptz
);
alter table public.leader_referrals enable row level security;
revoke all on public.leader_referrals from anon, authenticated;     -- only through the functions below

create or replace function public.active_referral_leader(p_haji uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select leader_id from public.leader_referrals where haji_id = p_haji and status in ('pending', 'confirmed');
$$;

-- 5) Contracts between one haji and one leader --------------------------------------------------------------------
create sequence if not exists public.contract_no_seq start 1;
create table if not exists public.haji_contracts (
  id             uuid primary key default gen_random_uuid(),
  contract_no    text not null unique default ('TC-' || lpad(nextval('public.contract_no_seq')::text, 6, '0')),
  -- the record stays even if one side later deletes their account; names and IDs are kept as they were at signing
  leader_id      uuid references public.profiles(id) on delete set null,
  haji_id        uuid references public.profiles(id) on delete set null,
  leader_name    text not null,
  leader_code    text not null,
  agency_name    text,
  haji_name      text not null,
  haji_code      text not null,
  offer_id       uuid references public.offers(id) on delete set null,
  kind           text not null check (kind in ('hajj', 'umrah')),
  title          text not null check (char_length(title) between 2 and 120),
  price_bdt      numeric(12, 2) not null check (price_bdt > 0 and price_bdt < 100000000),
  includes       text not null check (char_length(includes) between 2 and 3000),
  excludes       text check (excludes is null or char_length(excludes) <= 3000),
  travel_from    date,
  travel_to      date,
  refund_policy  text not null check (char_length(refund_policy) between 2 and 3000),
  extra_terms    text check (extra_terms is null or char_length(extra_terms) <= 3000),
  status         text not null default 'sent' check (status in ('sent', 'accepted', 'declined', 'withdrawn', 'cancelled', 'completed')),
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  cancelled_at   timestamptz,
  cancelled_by   uuid references public.profiles(id) on delete set null,
  cancel_reason  text check (cancel_reason is null or char_length(cancel_reason) <= 1000),
  completed_at   timestamptz,
  check (travel_to is null or travel_from is null or travel_to >= travel_from),
  check (leader_id <> haji_id)
);
create unique index if not exists one_active_contract_per_haji on public.haji_contracts (haji_id) where status = 'accepted';
create index if not exists contracts_by_leader on public.haji_contracts (leader_id, created_at desc);
alter table public.haji_contracts enable row level security;
revoke all on public.haji_contracts from anon, authenticated;       -- only through the functions below

create or replace function public.has_accepted_contract(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.haji_contracts c where c.status = 'accepted'
                  and ((c.leader_id = p_a and c.haji_id = p_b) or (c.leader_id = p_b and c.haji_id = p_a)));
$$;

-- 6) Ratings and complaints --------------------------------------------------------------------------------------
create table if not exists public.leader_ratings (
  contract_id  uuid primary key references public.haji_contracts(id) on delete cascade,
  leader_id    uuid not null references public.profiles(id) on delete cascade,
  haji_id      uuid references public.profiles(id) on delete set null,
  stars        int not null check (stars between 1 and 5),
  comment      text check (comment is null or char_length(comment) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.leader_ratings enable row level security;
revoke all on public.leader_ratings from anon, authenticated;

create table if not exists public.complaints (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references public.haji_contracts(id) on delete cascade,
  haji_id      uuid references public.profiles(id) on delete set null,
  leader_id    uuid not null references public.profiles(id) on delete cascade,
  body         text not null check (char_length(trim(body)) between 10 and 2000),
  status       text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  admin_note   text check (admin_note is null or char_length(admin_note) <= 500),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references public.profiles(id) on delete set null
);
alter table public.complaints enable row level security;
revoke all on public.complaints from anon, authenticated;

create table if not exists public.complaint_files (
  id            uuid primary key default gen_random_uuid(),
  complaint_id  uuid not null references public.complaints(id) on delete cascade,
  path          text not null unique check (char_length(path) between 3 and 300),
  kind          text not null check (kind in ('image', 'audio', 'video')),
  created_at    timestamptz not null default now()
);
alter table public.complaint_files enable row level security;
revoke all on public.complaint_files from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-evidence', 'complaint-evidence', false, 20971520,
        array['image/jpeg', 'image/png', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/ogg', 'audio/amr', 'video/mp4', 'video/3gpp'])
on conflict (id) do update set public = false, file_size_limit = 20971520,
  allowed_mime_types = array['image/jpeg', 'image/png', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/ogg', 'audio/amr', 'video/mp4', 'video/3gpp'];
drop policy if exists "evidence_insert_own" on storage.objects;
create policy "evidence_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'complaint-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "evidence_select" on storage.objects;
create policy "evidence_select" on storage.objects for select to authenticated
  using (bucket_id = 'complaint-evidence' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.has_perm('complaints'))));
drop policy if exists "evidence_delete_own" on storage.objects;
create policy "evidence_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'complaint-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 7) Terms & conditions, editable by the admin; readable before sign-up ------------------------------------------
create table if not exists public.app_texts (
  key         text primary key check (key in ('terms')),
  body        text not null check (char_length(body) between 1 and 20000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);
alter table public.app_texts enable row level security;
revoke all on public.app_texts from anon, authenticated;
grant select (key, body, updated_at) on public.app_texts to anon, authenticated;
drop policy if exists "texts_read" on public.app_texts;
create policy "texts_read" on public.app_texts for select to anon, authenticated using (true);

-- 8) "Please call me" can also be about a leader (from the directory), not only about a package -----------------
alter table public.offer_interests alter column offer_id drop not null;
alter table public.offer_interests add column if not exists leader_id uuid references public.profiles(id) on delete cascade;
do $$ begin
  alter table public.offer_interests add constraint offer_interests_target_check check (offer_id is not null or leader_id is not null);
exception when duplicate_object then null; end $$;
create unique index if not exists leader_interest_one_open on public.offer_interests (leader_id, user_id) where status = 'new' and offer_id is null;
grant insert (offer_id, leader_id) on public.offer_interests to authenticated;
drop policy if exists "oi_insert" on public.offer_interests;
create policy "oi_insert" on public.offer_interests for insert to authenticated
  with check (user_id = (select auth.uid()) and public.open_interest_count() < 10
              and ((offer_id is not null and leader_id is null and public.offer_is_visible(offer_id))
                or (offer_id is null and leader_id is not null and public.is_public_leader(leader_id::text))));
drop policy if exists "oi_select" on public.offer_interests;
create policy "oi_select" on public.offer_interests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_perm('calls')));
drop policy if exists "offers_select" on public.offers;
create policy "offers_select" on public.offers for select to authenticated
  using ((active and not hidden_by_admin and return_on >= current_date) or leader_id = (select auth.uid()) or (select public.has_perm('offers')));

-- ===============================================================================================================
-- Functions (created after all tables, because their bodies are checked when they are created)
-- ===============================================================================================================

-- ---------- Directory ----------
create or replace function public.list_leaders(p_district text default null, p_search text default null)
returns table (id uuid, full_name text, leader_code text, agency_name text, district text, upazila text, avatar_path text,
               umrah_license text, hajj_license text, rating_avg numeric, rating_count int, complaints_verified int, only_mine boolean)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
       ref as (select public.active_referral_leader((select uid from me)) as lid)
  select p.id, p.full_name, p.haji_code, l.agency_name, l.district, l.upazila, p.avatar_path, l.umrah_license, l.hajj_license,
         round(coalesce((select avg(r.stars) from public.leader_ratings r where r.leader_id = p.id), 0), 1),
         (select count(*)::int from public.leader_ratings r where r.leader_id = p.id),
         (select count(*)::int from public.complaints c where c.leader_id = p.id and c.status = 'verified'),
         (select lid from ref) is not null
    from public.profiles p join public.leader_profiles l on l.user_id = p.id
   where (select uid from me) is not null and p.role = 'leader' and p.status = 'active'
     and ((select lid from ref) is null or p.id = (select lid from ref))
     and not exists (select 1 from public.user_blocks b where b.blocker = (select uid from me) and b.blocked = p.id)
     and (p_district is null or p_district = '' or l.district = p_district)
     and (p_search is null or trim(p_search) = '' or p.full_name ilike '%' || trim(p_search) || '%' or l.agency_name ilike '%' || trim(p_search) || '%'
          or p.haji_code ilike trim(p_search) || '%' or l.upazila ilike '%' || trim(p_search) || '%')
   order by 10 desc, 11 desc, p.full_name
   limit 200;
$$;

create or replace function public.leader_public(p_leader uuid)
returns table (id uuid, full_name text, leader_code text, agency_name text, district text, upazila text, avatar_path text,
               umrah_license text, hajj_license text, bio text, rating_avg numeric, rating_count int, complaints_verified int,
               member_since timestamptz, blocked_by_me boolean, i_have_contract boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.haji_code, l.agency_name, l.district, l.upazila, p.avatar_path, l.umrah_license, l.hajj_license, l.bio,
         round(coalesce((select avg(r.stars) from public.leader_ratings r where r.leader_id = p.id), 0), 1),
         (select count(*)::int from public.leader_ratings r where r.leader_id = p.id),
         (select count(*)::int from public.complaints c where c.leader_id = p.id and c.status = 'verified'),
         p.created_at,
         exists (select 1 from public.user_blocks b where b.blocker = (select auth.uid()) and b.blocked = p.id),
         exists (select 1 from public.haji_contracts c where c.leader_id = p.id and c.haji_id = (select auth.uid()) and c.status in ('accepted', 'completed', 'cancelled'))
    from public.profiles p join public.leader_profiles l on l.user_id = p.id
   where (select auth.uid()) is not null and p.id = p_leader and p.role = 'leader' and p.status = 'active';
$$;

create or replace function public.leader_reviews(p_leader uuid)
returns table (kind text, stars int, body text, at timestamptz)
language sql stable security definer set search_path = '' as $$
  (select 'rating', r.stars, r.comment, r.updated_at from public.leader_ratings r
    where (select auth.uid()) is not null and r.leader_id = p_leader and r.comment is not null and trim(r.comment) <> ''
    order by r.updated_at desc limit 50)
  union all
  (select 'complaint', null::int, c.body, c.created_at from public.complaints c
    where (select auth.uid()) is not null and c.leader_id = p_leader and c.status = 'verified'
    order by c.created_at desc limit 50);
$$;

-- ---------- Referral ----------
create or replace function public.set_referral(p_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_leader uuid; v_old public.leader_referrals;
begin
  if not exists (select 1 from public.profiles where id = v_uid and account_type = 'haji' and role = 'haji' and status = 'active') then
    raise exception 'not allowed';
  end if;
  select p.id into v_leader from public.profiles p join public.leader_profiles l on l.user_id = p.id
   where p.haji_code = upper(trim(p_code)) and p.role = 'leader' and p.status = 'active';
  if v_leader is null then return 'bad_code'; end if;
  if public.blocked_between(v_uid, v_leader) then return 'bad_code'; end if;
  select * into v_old from public.leader_referrals where haji_id = v_uid;
  if v_old.haji_id is not null and v_old.status <> 'rejected' then return 'already'; end if;
  insert into public.leader_referrals (haji_id, leader_id) values (v_uid, v_leader)
  on conflict (haji_id) do update set leader_id = excluded.leader_id, status = 'pending', created_at = now(), decided_at = null,
    cancel_requested = false, cancel_reason = null, cancel_at = null;
  return 'ok';
end $$;

create or replace function public.my_referral()
returns table (leader_id uuid, full_name text, leader_code text, agency_name text, avatar_path text, status text, cancel_requested boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.leader_id, p.full_name, p.haji_code, l.agency_name, p.avatar_path, r.status, r.cancel_requested, r.created_at
    from public.leader_referrals r join public.profiles p on p.id = r.leader_id left join public.leader_profiles l on l.user_id = r.leader_id
   where r.haji_id = (select auth.uid());
$$;

create or replace function public.request_referral_cancel(p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if char_length(trim(coalesce(p_reason, ''))) < 5 then return 'need_reason'; end if;
  update public.leader_referrals set cancel_requested = true, cancel_reason = left(trim(p_reason), 500), cancel_at = now()
   where haji_id = (select auth.uid()) and status in ('pending', 'confirmed') and not cancel_requested;
  return case when found then 'ok' else 'not_found' end;
end $$;

create or replace function public.leader_referral_list()
returns table (haji_id uuid, full_name text, haji_code text, status text, created_at timestamptz, cancel_requested boolean)
language sql stable security definer set search_path = '' as $$
  select r.haji_id, p.full_name, p.haji_code, r.status, r.created_at, r.cancel_requested
    from public.leader_referrals r join public.profiles p on p.id = r.haji_id
   where r.leader_id = (select auth.uid()) and public.is_leader() and r.status in ('pending', 'confirmed')
   order by (r.status = 'pending') desc, r.created_at desc;
$$;

create or replace function public.leader_decide_referral(p_haji uuid, p_confirm boolean)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_leader() then raise exception 'not allowed'; end if;
  update public.leader_referrals set status = case when p_confirm then 'confirmed' else 'rejected' end, decided_at = now()
   where haji_id = p_haji and leader_id = (select auth.uid()) and status = 'pending';
  return case when found then 'ok' else 'not_found' end;
end $$;

create or replace function public.admin_referral_cancels()
returns table (haji_id uuid, haji_name text, haji_code text, haji_phone text, leader_name text, leader_code text, status text, cancel_reason text, cancel_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.haji_id, h.full_name, h.haji_code, h.phone, l.full_name, l.haji_code, r.status, r.cancel_reason, r.cancel_at
    from public.leader_referrals r join public.profiles h on h.id = r.haji_id join public.profiles l on l.id = r.leader_id
   where public.has_perm('users') and r.cancel_requested and r.status in ('pending', 'confirmed')
   order by r.cancel_at;
$$;

create or replace function public.admin_decide_referral_cancel(p_haji uuid, p_approve boolean, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('users') then raise exception 'not allowed'; end if;
  if p_approve then
    delete from public.leader_referrals where haji_id = p_haji and cancel_requested;
  else
    update public.leader_referrals set cancel_requested = false where haji_id = p_haji and cancel_requested;
  end if;
  if not found then return 'not_found'; end if;
  perform public.log_admin(case when p_approve then 'referral_cancel_ok' else 'referral_cancel_no' end, p_haji, p_note);
  return 'ok';
end $$;

-- ---------- Contracts ----------
create or replace function public.leader_send_contract(p_haji_code text, p_kind text, p_title text, p_price numeric, p_includes text,
  p_excludes text, p_from date, p_to date, p_refund text, p_extra text, p_offer uuid default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_haji uuid; v_ref uuid;
begin
  if not public.is_leader() then raise exception 'not allowed'; end if;
  select id into v_haji from public.profiles where haji_code = upper(trim(p_haji_code)) and account_type = 'haji' and role = 'haji' and status = 'active';
  if v_haji is null then return 'bad_code'; end if;
  if public.blocked_between(v_uid, v_haji) then return 'blocked'; end if;
  v_ref := public.active_referral_leader(v_haji);
  if v_ref is not null and v_ref <> v_uid then return 'referred_other'; end if;
  if exists (select 1 from public.haji_contracts where haji_id = v_haji and status = 'accepted') then return 'haji_busy'; end if;
  if exists (select 1 from public.haji_contracts where haji_id = v_haji and leader_id = v_uid and status = 'sent') then return 'already_sent'; end if;
  if (select count(*) from public.haji_contracts where leader_id = v_uid and created_at > now() - interval '1 day') >= 50 then return 'too_many'; end if;
  if p_offer is not null and not exists (select 1 from public.offers where id = p_offer and leader_id = v_uid) then p_offer := null; end if;
  insert into public.haji_contracts (leader_id, haji_id, leader_name, leader_code, agency_name, haji_name, haji_code,
                                     offer_id, kind, title, price_bdt, includes, excludes, travel_from, travel_to, refund_policy, extra_terms)
  values (v_uid, v_haji, (select full_name from public.profiles where id = v_uid), (select haji_code from public.profiles where id = v_uid),
          (select agency_name from public.leader_profiles where user_id = v_uid),
          (select full_name from public.profiles where id = v_haji), (select haji_code from public.profiles where id = v_haji),
          p_offer, p_kind, trim(p_title), p_price, trim(p_includes), nullif(trim(coalesce(p_excludes, '')), ''), p_from, p_to,
          trim(p_refund), nullif(trim(coalesce(p_extra, '')), ''));
  return 'sent';
end $$;

create or replace function public.leader_withdraw_contract(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  update public.haji_contracts set status = 'withdrawn', responded_at = now()
   where id = p_id and leader_id = (select auth.uid()) and status = 'sent';
  return case when found then 'ok' else 'not_found' end;
end $$;

create or replace function public.haji_respond_contract(p_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_c public.haji_contracts;
begin
  select * into v_c from public.haji_contracts where id = p_id and haji_id = v_uid for update;
  if v_c.id is null or v_c.status <> 'sent' then return 'not_found'; end if;
  if p_accept then
    if exists (select 1 from public.haji_contracts where haji_id = v_uid and status = 'accepted') then return 'have_active'; end if;
    if not exists (select 1 from public.profiles where id = v_c.leader_id and role = 'leader' and status = 'active') then return 'leader_inactive'; end if;
    update public.haji_contracts set status = 'accepted', responded_at = now() where id = p_id;
  else
    update public.haji_contracts set status = 'declined', responded_at = now() where id = p_id;
  end if;
  return 'ok';
end $$;

create or replace function public.cancel_contract(p_id uuid, p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if char_length(trim(coalesce(p_reason, ''))) < 10 then return 'need_reason'; end if;
  update public.haji_contracts set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()), cancel_reason = left(trim(p_reason), 1000)
   where id = p_id and status = 'accepted' and (haji_id = (select auth.uid()) or leader_id = (select auth.uid()));
  return case when found then 'ok' else 'not_found' end;
end $$;

create or replace function public.leader_complete_contract(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  update public.haji_contracts set status = 'completed', completed_at = now()
   where id = p_id and leader_id = (select auth.uid()) and status = 'accepted';
  return case when found then 'ok' else 'not_found' end;
end $$;

-- What the haji sees: the leader's phone only while a contract is accepted.
create or replace function public.my_contracts()
returns table (id uuid, contract_no text, status text, kind text, title text, price_bdt numeric, includes text, excludes text,
               travel_from date, travel_to date, refund_policy text, extra_terms text, created_at timestamptz, responded_at timestamptz,
               cancelled_at timestamptz, cancel_reason text, cancelled_by_me boolean, completed_at timestamptz,
               leader_id uuid, leader_name text, leader_code text, agency_name text, leader_phone text, my_stars int, my_comment text,
               haji_name text, haji_code text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.contract_no, c.status, c.kind, c.title, c.price_bdt, c.includes, c.excludes, c.travel_from, c.travel_to, c.refund_policy,
         c.extra_terms, c.created_at, c.responded_at, c.cancelled_at, c.cancel_reason, coalesce(c.cancelled_by = c.haji_id, false), c.completed_at,
         c.leader_id, c.leader_name, c.leader_code, c.agency_name, case when c.status = 'accepted' then l.phone end,
         r.stars, r.comment, c.haji_name, c.haji_code
    from public.haji_contracts c
    left join public.profiles l on l.id = c.leader_id
    left join public.leader_ratings r on r.contract_id = c.id
   where c.haji_id = (select auth.uid()) and c.status <> 'withdrawn'
   order by (c.status = 'accepted') desc, (c.status = 'sent') desc, c.created_at desc
   limit 50;
$$;

create or replace function public.leader_contracts()
returns table (id uuid, contract_no text, status text, kind text, title text, price_bdt numeric, includes text, excludes text,
               travel_from date, travel_to date, refund_policy text, extra_terms text, created_at timestamptz, responded_at timestamptz,
               cancelled_at timestamptz, cancel_reason text, cancelled_by_me boolean, completed_at timestamptz,
               haji_id uuid, haji_name text, haji_code text, haji_phone text, agency_name text, leader_name text, leader_code text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.contract_no, c.status, c.kind, c.title, c.price_bdt, c.includes, c.excludes, c.travel_from, c.travel_to, c.refund_policy,
         c.extra_terms, c.created_at, c.responded_at, c.cancelled_at, c.cancel_reason, coalesce(c.cancelled_by = c.leader_id, false), c.completed_at,
         c.haji_id, c.haji_name, c.haji_code, case when c.status = 'accepted' then h.phone end, c.agency_name, c.leader_name, c.leader_code
    from public.haji_contracts c
    left join public.profiles h on h.id = c.haji_id
   where c.leader_id = (select auth.uid()) and public.is_leader()
   order by (c.status = 'accepted') desc, (c.status = 'sent') desc, c.created_at desc
   limit 300;
$$;

-- ---------- Ratings & complaints ----------
create or replace function public.rate_leader(p_contract uuid, p_stars int, p_comment text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_c public.haji_contracts;
begin
  select * into v_c from public.haji_contracts where id = p_contract and haji_id = (select auth.uid()) and status in ('accepted', 'completed', 'cancelled');
  if v_c.id is null then return 'not_allowed'; end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then return 'bad_stars'; end if;
  insert into public.leader_ratings (contract_id, leader_id, haji_id, stars, comment)
  values (v_c.id, v_c.leader_id, v_c.haji_id, p_stars, nullif(left(trim(coalesce(p_comment, '')), 500), ''))
  on conflict (contract_id) do update set stars = excluded.stars, comment = excluded.comment, updated_at = now();
  return 'ok';
end $$;

create or replace function public.file_complaint(p_contract uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_c public.haji_contracts; v_id uuid;
begin
  select * into v_c from public.haji_contracts where id = p_contract and haji_id = (select auth.uid()) and status in ('accepted', 'completed', 'cancelled');
  if v_c.id is null then raise exception 'not allowed'; end if;
  if (select count(*) from public.complaints where haji_id = v_c.haji_id and created_at > now() - interval '1 day') >= 5 then raise exception 'too many'; end if;
  insert into public.complaints (contract_id, haji_id, leader_id, body) values (v_c.id, v_c.haji_id, v_c.leader_id, trim(p_body)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.add_complaint_file(p_complaint uuid, p_path text, p_kind text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if not exists (select 1 from public.complaints where id = p_complaint and haji_id = v_uid and status = 'pending') then raise exception 'not allowed'; end if;
  if p_path not like v_uid::text || '/%' then raise exception 'bad path'; end if;
  if (select count(*) from public.complaint_files where complaint_id = p_complaint) >= 5 then return 'too_many'; end if;
  insert into public.complaint_files (complaint_id, path, kind) values (p_complaint, p_path, p_kind);
  return 'ok';
end $$;

create or replace function public.my_complaints()
returns table (id uuid, contract_no text, leader_name text, body text, status text, admin_note text, created_at timestamptz, files int)
language sql stable security definer set search_path = '' as $$
  select c.id, k.contract_no, k.leader_name, c.body, c.status, c.admin_note, c.created_at,
         (select count(*)::int from public.complaint_files f where f.complaint_id = c.id)
    from public.complaints c join public.haji_contracts k on k.id = c.contract_id
   where c.haji_id = (select auth.uid())
   order by c.created_at desc;
$$;

-- ---------- Admin ----------
create or replace function public.admin_list_complaints()
returns table (id uuid, status text, body text, admin_note text, created_at timestamptz, contract_no text,
               haji_name text, haji_code text, haji_phone text, leader_id uuid, leader_name text, leader_code text, leader_phone text, files jsonb)
language sql stable security definer set search_path = '' as $$
  select c.id, c.status, c.body, c.admin_note, c.created_at, k.contract_no, k.haji_name, k.haji_code, h.phone,
         l.id, l.full_name, l.haji_code, l.phone,
         coalesce((select jsonb_agg(jsonb_build_object('path', f.path, 'kind', f.kind) order by f.created_at) from public.complaint_files f where f.complaint_id = c.id), '[]'::jsonb)
    from public.complaints c join public.haji_contracts k on k.id = c.contract_id
    left join public.profiles h on h.id = c.haji_id join public.profiles l on l.id = c.leader_id
   where public.has_perm('complaints')
   order by (c.status = 'pending') desc, c.created_at desc
   limit 300;
$$;
create or replace function public.admin_decide_complaint(p_id uuid, p_verify boolean, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_leader uuid;
begin
  if not public.has_perm('complaints') then raise exception 'not allowed'; end if;
  update public.complaints set status = case when p_verify then 'verified' else 'rejected' end, admin_note = left(p_note, 500),
         decided_at = now(), decided_by = (select auth.uid())
   where id = p_id and status = 'pending' returning leader_id into v_leader;
  if v_leader is null then return 'not_pending'; end if;
  perform public.log_admin(case when p_verify then 'complaint_verified' else 'complaint_rejected' end, v_leader, p_note);
  return 'ok';
end $$;

create or replace function public.admin_list_reports()
returns table (id uuid, status text, reason text, details text, admin_note text, created_at timestamptz,
               reporter_name text, reporter_code text, target_id uuid, target_name text, target_code text, target_type text, target_status text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.status, r.reason, r.details, r.admin_note, r.created_at, a.full_name, a.haji_code, t.id, t.full_name, t.haji_code, t.account_type, t.status
    from public.user_reports r join public.profiles a on a.id = r.reporter join public.profiles t on t.id = r.target
   where public.has_perm('reports')
   order by (r.status = 'new') desc, r.created_at desc
   limit 300;
$$;
create or replace function public.admin_handle_report(p_id uuid, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_t uuid;
begin
  if not public.has_perm('reports') then raise exception 'not allowed'; end if;
  update public.user_reports set status = 'handled', admin_note = left(p_note, 500), handled_at = now(), handled_by = (select auth.uid())
   where id = p_id and status = 'new' returning target into v_t;
  if v_t is null then return 'not_found'; end if;
  perform public.log_admin('report_handled', v_t, p_note);
  return 'ok';
end $$;

create or replace function public.admin_find_users(p_query text)
returns table (id uuid, full_name text, haji_code text, phone text, role text, account_type text, status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.haji_code, p.phone, p.role, p.account_type, p.status, p.created_at
    from public.profiles p
   where public.has_perm('users') and char_length(trim(coalesce(p_query, ''))) >= 3
     and (p.phone like '%' || trim(p_query) || '%' or p.haji_code ilike trim(p_query) || '%' or p.full_name ilike '%' || trim(p_query) || '%')
   order by p.created_at desc
   limit 30;
$$;
create or replace function public.admin_set_user_status(p_user uuid, p_status text, p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_t public.profiles;
begin
  if not public.has_perm('users') then raise exception 'not allowed'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'bad status'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then return 'need_reason'; end if;
  select * into v_t from public.profiles where id = p_user;
  if v_t.id is null or v_t.id = (select auth.uid()) then return 'not_allowed'; end if;
  if v_t.role in ('admin', 'staff') and not public.is_admin() then return 'not_allowed'; end if;
  if v_t.role = 'admin' then return 'not_allowed'; end if;
  update public.profiles set status = p_status where id = p_user;
  if p_status = 'suspended' then update public.offers set active = false where leader_id = p_user and active; end if;
  perform public.log_admin(case when p_status = 'suspended' then 'suspend_user' else 'reactivate_user' end, p_user, p_reason);
  return 'ok';
end $$;

create or replace function public.admin_set_staff(p_phone text, p_perms text[])
returns text language plpgsql security definer set search_path = '' as $$
declare v_t public.profiles;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into v_t from public.profiles where phone = trim(p_phone);
  if v_t.id is null then return 'not_found'; end if;
  if v_t.account_type <> 'haji' or v_t.role not in ('haji', 'staff') then return 'not_allowed'; end if;
  if p_perms is null or cardinality(p_perms) = 0 then
    delete from public.admin_staff where user_id = v_t.id;
    update public.profiles set role = 'haji' where id = v_t.id and role = 'staff';
    perform public.log_admin('staff_removed', v_t.id, null);
  else
    insert into public.admin_staff (user_id, perms) values (v_t.id, p_perms)
    on conflict (user_id) do update set perms = excluded.perms, updated_at = now();
    update public.profiles set role = 'staff' where id = v_t.id;
    perform public.log_admin('staff_set', v_t.id, array_to_string(p_perms, ','));
  end if;
  return 'ok';
end $$;
create or replace function public.admin_list_staff()
returns table (user_id uuid, full_name text, phone text, perms text[], updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.user_id, p.full_name, p.phone, s.perms, s.updated_at from public.admin_staff s join public.profiles p on p.id = s.user_id
   where public.is_admin() order by p.full_name;
$$;
create or replace function public.my_perms() returns text[]
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and status = 'active')
      then array['admin', 'applications', 'calls', 'offers', 'complaints', 'reports', 'users']
    else coalesce((select s.perms from public.admin_staff s join public.profiles p on p.id = s.user_id
                    where s.user_id = (select auth.uid()) and p.role = 'staff' and p.status = 'active'), '{}'::text[]) end;
$$;

create or replace function public.admin_list_audit()
returns table (id bigint, at timestamptz, actor_name text, action text, target_name text, target_code text, detail text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.at, p.full_name, a.action, t.full_name, t.haji_code, a.detail
    from public.admin_audit a left join public.profiles p on p.id = a.actor left join public.profiles t on t.id = a.target
   where public.is_admin()
   order by a.at desc limit 300;
$$;

create or replace function public.admin_set_text(p_key text, p_body text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('terms') then raise exception 'bad key'; end if;
  if p_body is null or trim(p_body) = '' then
    delete from public.app_texts where key = p_key;
  else
    insert into public.app_texts (key, body, updated_by) values (p_key, left(p_body, 20000), (select auth.uid()))
    on conflict (key) do update set body = excluded.body, updated_at = now(), updated_by = excluded.updated_by;
  end if;
  perform public.log_admin('text_' || p_key, null, null);
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
    'offers_visible', (select count(*) from public.offers where active and not hidden_by_admin and return_on >= current_date),
    'new_users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days')) end;
$$;

-- Spreadsheet export (full admin only, because it includes phone numbers).
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
  else
    raise exception 'bad kind';
  end if;
  perform public.log_admin('export_' || p_kind, null, null);
end $$;

-- ---------- Existing functions updated for staff permissions and the "no phone before contract" rule ----------
create or replace function public.admin_list_interests()
returns table (id uuid, status text, admin_note text, created_at timestamptz, full_name text, phone text, haji_code text,
               offer_id uuid, offer_title text, offer_kind text, price_bdt numeric, agency_name text, leader_name text, leader_phone text)
language sql stable security definer set search_path = '' as $$
  select i.id, i.status, i.admin_note, i.created_at, p.full_name, p.phone, p.haji_code,
         o.id, o.title, o.kind, o.price_bdt, lp.agency_name, l.full_name, l.phone
    from public.offer_interests i
    join public.profiles p on p.id = i.user_id
    left join public.offers o on o.id = i.offer_id
    join public.profiles l on l.id = coalesce(o.leader_id, i.leader_id)
    left join public.leader_profiles lp on lp.user_id = l.id
   where public.has_perm('calls')
   order by (i.status = 'new') desc, i.created_at desc
   limit 300;
$$;
create or replace function public.admin_mark_interest(p_id uuid, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('calls') then raise exception 'not allowed'; end if;
  update public.offer_interests set status = 'contacted', contacted_at = now(), admin_note = left(p_note, 300)
   where id = p_id and status = 'new';
  if found then perform public.log_admin('call_done', null, p_note); return 'ok'; end if;
  return 'not_found';
end $$;
create or replace function public.admin_hide_offer(p_offer uuid, p_hide boolean)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('offers') then raise exception 'not allowed'; end if;
  update public.offers set hidden_by_admin = p_hide where id = p_offer;
  if found then perform public.log_admin(case when p_hide then 'offer_hidden' else 'offer_shown' end, p_offer, null); return 'ok'; end if;
  return 'not_found';
end $$;
create or replace function public.list_offers(p_kind text)
returns table (id uuid, kind text, title text, price_bdt numeric, depart_on date, return_on date, makkah_hotel text,
               makkah_distance_m int, madinah_hotel text, madinah_distance_m int, room_share int, includes text[],
               notes text, agency_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.kind, o.title, o.price_bdt, o.depart_on, o.return_on, o.makkah_hotel, o.makkah_distance_m,
         o.madinah_hotel, o.madinah_distance_m, o.room_share, o.includes, o.notes, lp.agency_name, o.created_at
    from public.offers o join public.profiles p on p.id = o.leader_id left join public.leader_profiles lp on lp.user_id = o.leader_id
   where (select auth.uid()) is not null
     and o.kind = p_kind and o.active and not o.hidden_by_admin and o.return_on >= current_date
     and p.role = 'leader' and p.status = 'active'
     and (public.active_referral_leader((select auth.uid())) is null or o.leader_id = public.active_referral_leader((select auth.uid())))
     and not exists (select 1 from public.user_blocks b where b.blocker = (select auth.uid()) and b.blocked = o.leader_id)
   order by o.price_bdt asc, o.depart_on asc
   limit 200;
$$;

create or replace function public.my_groups()
returns table (group_id uuid, group_name text, season text, status text, leader_name text, leader_phone text, agency_name text)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, g.season, m.status, lp.full_name,
         case when public.has_accepted_contract(g.leader_id, m.user_id) then lp.phone end,
         lpr.agency_name
    from public.group_members m
    join public.groups g on g.id = m.group_id
    join public.profiles lp on lp.id = g.leader_id
    left join public.leader_profiles lpr on lpr.user_id = g.leader_id
   where m.user_id = (select auth.uid()) and m.status in ('invited', 'active') and g.active
   order by m.status, g.created_at desc;
$$;
create or replace function public.group_members_for_leader(p_group uuid)
returns table (user_id uuid, full_name text, haji_code text, phone text, avatar_path text, status text, joined_at timestamptz, phone_verified boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.haji_code, case when public.has_accepted_contract(g.leader_id, p.id) then p.phone end,
         p.avatar_path, m.status, m.joined_at, p.phone_verified
    from public.group_members m
    join public.groups g on g.id = m.group_id
    join public.profiles p on p.id = m.user_id
   where m.group_id = p_group and g.leader_id = (select auth.uid()) and m.status in ('active', 'invited')
   order by m.status, p.full_name;
$$;
-- Invitations by phone go only to haji accounts that did not block the leader (same answer either way).
create or replace function public.invite_by_phone(p_group uuid, p_phone text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_target uuid;
begin
  if not exists (select 1 from public.groups g where g.id = p_group and g.leader_id = v_uid and g.active) or not public.is_leader() then
    raise exception 'not allowed';
  end if;
  select id into v_target from public.profiles
   where phone = trim(p_phone) and status = 'active' and account_type = 'haji' and (phone_verified or not public.otp_live());
  if v_target is not null and v_target <> v_uid and not public.blocked_between(v_uid, v_target) then
    insert into public.group_members (group_id, user_id, status) values (p_group, v_target, 'invited')
    on conflict (group_id, user_id) do update set status = 'invited'
      where public.group_members.status in ('left', 'declined');
  end if;
  return 'sent';
end $$;

-- Function permissions: signed-in users only (each function checks its own rules inside).
do $$
declare f text;
begin
  foreach f in array array[
    'public.has_perm(text)', 'public.is_public_leader(text)', 'public.reports_today()', 'public.blocked_between(uuid, uuid)',
    'public.active_referral_leader(uuid)', 'public.has_accepted_contract(uuid, uuid)', 'public.review_leader_application(uuid, boolean, text)',
    'public.admin_list_applications()', 'public.list_leaders(text, text)', 'public.leader_public(uuid)', 'public.leader_reviews(uuid)',
    'public.set_referral(text)', 'public.my_referral()', 'public.request_referral_cancel(text)', 'public.leader_referral_list()',
    'public.leader_decide_referral(uuid, boolean)', 'public.admin_referral_cancels()', 'public.admin_decide_referral_cancel(uuid, boolean, text)',
    'public.leader_send_contract(text, text, text, numeric, text, text, date, date, text, text, uuid)', 'public.leader_withdraw_contract(uuid)',
    'public.haji_respond_contract(uuid, boolean)', 'public.cancel_contract(uuid, text)', 'public.leader_complete_contract(uuid)',
    'public.my_contracts()', 'public.leader_contracts()', 'public.rate_leader(uuid, integer, text)', 'public.file_complaint(uuid, text)',
    'public.add_complaint_file(uuid, text, text)', 'public.my_complaints()', 'public.admin_list_complaints()',
    'public.admin_decide_complaint(uuid, boolean, text)', 'public.admin_list_reports()', 'public.admin_handle_report(uuid, text)',
    'public.admin_find_users(text)', 'public.admin_set_user_status(uuid, text, text)', 'public.admin_set_staff(text, text[])',
    'public.admin_list_staff()', 'public.my_perms()', 'public.admin_list_audit()', 'public.admin_set_text(text, text)', 'public.admin_stats()',
    'public.admin_export(text)', 'public.admin_list_interests()', 'public.admin_mark_interest(uuid, text)', 'public.admin_hide_offer(uuid, boolean)',
    'public.list_offers(text)', 'public.my_groups()', 'public.group_members_for_leader(uuid)', 'public.invite_by_phone(uuid, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
