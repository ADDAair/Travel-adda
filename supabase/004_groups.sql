-- Travel Adda: group leaders, groups, members, package terms (contracts) and agreement.
-- Run once in Supabase Dashboard > SQL Editor, AFTER 001, 002 and 003. Safe to re-run.
--
-- Security model
--  * Only an ADMIN can turn a user into a leader (after reviewing their application).
--  * A leader sees ONLY the name, Haji ID, phone and photo of ACTIVE members of the leader's OWN groups.
--  * A member sees only the groups they belong to, the leader's name and phone, and that group's package terms.
--  * Package terms can never be edited or deleted after creation (new terms = new row), so an agreement can't be
--    changed behind anyone's back.
--  * Everything that crosses user boundaries goes through SECURITY DEFINER functions that check the caller.

-- 0) Role changes: users still can't change their own role/status; only these server functions can.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.id is distinct from old.id or new.role is distinct from old.role or
       new.haji_code is distinct from old.haji_code or new.phone is distinct from old.phone or
       new.status is distinct from old.status) then
    raise exception 'protected column';
  end if;
  return new;
end $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and status = 'active');
$$;
create or replace function public.is_leader() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'leader' and status = 'active');
$$;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_leader() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_leader() to authenticated;

-- 1) Leader applications -----------------------------------------------------------------------------------------
create table if not exists public.leader_applications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  agency_name  text not null check (char_length(agency_name) between 2 and 120),
  license_no   text not null check (char_length(license_no) between 1 and 40),
  doc_path     text check (doc_path is null or char_length(doc_path) between 3 and 300),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note   text check (admin_note is null or char_length(admin_note) <= 500),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid references public.profiles(id) on delete set null
);
create unique index if not exists leader_app_one_pending on public.leader_applications(user_id) where status = 'pending';
alter table public.leader_applications enable row level security;
revoke all on public.leader_applications from anon, authenticated;
grant select on public.leader_applications to authenticated;
grant insert (agency_name, license_no, doc_path) on public.leader_applications to authenticated;

drop policy if exists "lapp_select" on public.leader_applications;
create policy "lapp_select" on public.leader_applications for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "lapp_insert" on public.leader_applications;
create policy "lapp_insert" on public.leader_applications for insert to authenticated
  with check (user_id = (select auth.uid())
              and (doc_path is null or doc_path like (select auth.uid())::text || '/%')
              and not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role <> 'haji'));

-- Private bucket for the licence / ID picture of an application. Owner and admins can read it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leader-docs', 'leader-docs', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf'];
drop policy if exists "ldocs_insert_own" on storage.objects;
create policy "ldocs_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'leader-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "ldocs_select" on storage.objects;
create policy "ldocs_select" on storage.objects for select to authenticated
  using (bucket_id = 'leader-docs' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
drop policy if exists "ldocs_delete_own" on storage.objects;
create policy "ldocs_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'leader-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Admin decides. Approving makes the applicant a leader.
create or replace function public.review_leader_application(p_app uuid, p_approve boolean, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.leader_applications
     set status = case when p_approve then 'approved' else 'rejected' end,
         admin_note = left(p_note, 500), reviewed_at = now(), reviewed_by = (select auth.uid())
   where id = p_app and status = 'pending'
   returning user_id into v_user;
  if v_user is null then return 'not_pending'; end if;
  if p_approve then
    update public.profiles set role = 'leader' where id = v_user and role = 'haji';
  end if;
  return 'ok';
end $$;
revoke all on function public.review_leader_application(uuid, boolean, text) from public, anon;
grant execute on function public.review_leader_application(uuid, boolean, text) to authenticated;

-- Admin list of applications with the applicant's name and phone.
create or replace function public.admin_list_applications()
returns table (id uuid, user_id uuid, full_name text, phone text, haji_code text, agency_name text, license_no text,
               doc_path text, status text, admin_note text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.user_id, p.full_name, p.phone, p.haji_code, a.agency_name, a.license_no, a.doc_path, a.status, a.admin_note, a.created_at
    from public.leader_applications a join public.profiles p on p.id = a.user_id
   where public.is_admin()
   order by (a.status = 'pending') desc, a.created_at desc
   limit 200;
$$;
revoke all on function public.admin_list_applications() from public, anon;
grant execute on function public.admin_list_applications() to authenticated;

-- 2) Groups -------------------------------------------------------------------------------------------------------
-- 8-character join code without look-alike letters (no 0/O, 1/I/L), from cryptographically random bytes.
create or replace function public.gen_join_code() returns text
language plpgsql volatile set search_path = '' as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := uuid_send(gen_random_uuid()); r text := ''; i int;
begin
  foreach i in array array[0,1,2,3,4,5,9,10] loop
    r := r || substr(a, 1 + (get_byte(b, i) % 31), 1);
  end loop;
  return r;
end $$;

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  leader_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 80),
  season      text check (season is null or char_length(season) <= 40),
  join_code   text not null unique default public.gen_join_code(),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.groups enable row level security;
revoke all on public.groups from anon, authenticated;
grant select on public.groups to authenticated;
grant insert (name, season) on public.groups to authenticated;
grant update (name, season, active) on public.groups to authenticated;

drop policy if exists "groups_select" on public.groups;
create policy "groups_select" on public.groups for select to authenticated
  using (leader_id = (select auth.uid()));
drop policy if exists "groups_insert" on public.groups;
create policy "groups_insert" on public.groups for insert to authenticated
  with check (leader_id = (select auth.uid()) and (select public.is_leader()));
drop policy if exists "groups_update" on public.groups;
create policy "groups_update" on public.groups for update to authenticated
  using (leader_id = (select auth.uid()) and (select public.is_leader()))
  with check (leader_id = (select auth.uid()));

-- 3) Members (no direct client access; only through the functions below) ---------------------------------------
create table if not exists public.group_members (
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  status      text not null check (status in ('invited', 'active', 'left', 'removed', 'declined')),
  created_at  timestamptz not null default now(),
  joined_at   timestamptz,
  primary key (group_id, user_id)
);
alter table public.group_members enable row level security;
revoke all on public.group_members from anon, authenticated;

-- Helper checks used inside policies (policies run as the caller, who has no direct access to group_members).
create or replace function public.is_group_leader(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.groups where id = p_group and leader_id = (select auth.uid()));
$$;
create or replace function public.is_active_member(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = p_group and user_id = (select auth.uid()) and status = 'active');
$$;
create or replace function public.leader_sees_user(p_user text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m join public.groups g on g.id = m.group_id
                  where g.leader_id = (select auth.uid()) and m.status = 'active' and m.user_id::text = p_user);
$$;

-- Haji: join with a code (the leader cannot be a member of their own group).
create or replace function public.join_group(p_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_g public.groups;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into v_g from public.groups where join_code = upper(trim(p_code)) and active;
  if v_g.id is null then return 'bad_code'; end if;
  if v_g.leader_id = v_uid then return 'own_group'; end if;
  insert into public.group_members (group_id, user_id, status, joined_at) values (v_g.id, v_uid, 'active', now())
  on conflict (group_id, user_id) do update set status = 'active', joined_at = now()
    where public.group_members.status <> 'removed';
  if exists (select 1 from public.group_members where group_id = v_g.id and user_id = v_uid and status = 'removed') then
    return 'removed';
  end if;
  return 'ok';
end $$;

-- Leader: invite by phone. Always answers the same way, so it can't be used to find out who has an account.
create or replace function public.invite_by_phone(p_group uuid, p_phone text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_target uuid;
begin
  if not exists (select 1 from public.groups g where g.id = p_group and g.leader_id = v_uid and g.active) or not public.is_leader() then
    raise exception 'not allowed';
  end if;
  select id into v_target from public.profiles where phone = trim(p_phone) and status = 'active';
  if v_target is not null and v_target <> v_uid then
    insert into public.group_members (group_id, user_id, status) values (p_group, v_target, 'invited')
    on conflict (group_id, user_id) do update set status = 'invited'
      where public.group_members.status in ('left', 'declined');
  end if;
  return 'sent';
end $$;

-- Haji: accept / decline an invitation, or leave a group.
create or replace function public.respond_invite(p_group uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
begin
  update public.group_members
     set status = case when p_accept then 'active' else 'declined' end,
         joined_at = case when p_accept then now() else joined_at end
   where group_id = p_group and user_id = (select auth.uid()) and status = 'invited';
  return case when found then 'ok' else 'not_found' end;
end $$;

create or replace function public.leave_group(p_group uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  update public.group_members set status = 'left'
   where group_id = p_group and user_id = (select auth.uid()) and status = 'active';
  return case when found then 'ok' else 'not_found' end;
end $$;

-- Leader: remove a member from their own group.
create or replace function public.remove_member(p_group uuid, p_user uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.groups where id = p_group and leader_id = (select auth.uid())) then
    raise exception 'not allowed';
  end if;
  update public.group_members set status = 'removed' where group_id = p_group and user_id = p_user and status in ('active', 'invited');
  return case when found then 'ok' else 'not_found' end;
end $$;

-- Haji: my groups and invitations, with the leader's name, phone and agency.
create or replace function public.my_groups()
returns table (group_id uuid, group_name text, season text, status text, leader_name text, leader_phone text, agency_name text)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, g.season, m.status, lp.full_name, lp.phone,
         (select a.agency_name from public.leader_applications a where a.user_id = g.leader_id and a.status = 'approved' order by a.reviewed_at desc limit 1)
    from public.group_members m
    join public.groups g on g.id = m.group_id
    join public.profiles lp on lp.id = g.leader_id
   where m.user_id = (select auth.uid()) and m.status in ('invited', 'active') and g.active
   order by m.status, g.created_at desc;
$$;

-- Leader: members of one of their own groups. Only name, Haji ID, phone and photo path, as decided.
create or replace function public.group_members_for_leader(p_group uuid)
returns table (user_id uuid, full_name text, haji_code text, phone text, avatar_path text, status text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.haji_code, p.phone, p.avatar_path, m.status, m.joined_at
    from public.group_members m
    join public.groups g on g.id = m.group_id
    join public.profiles p on p.id = m.user_id
   where m.group_id = p_group and g.leader_id = (select auth.uid()) and m.status in ('active', 'invited')
   order by m.status, p.full_name;
$$;

-- A leader may view the profile photo of active members of their own groups.
drop policy if exists "avatars_select_leader" on storage.objects;
create policy "avatars_select_leader" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.leader_sees_user((storage.foldername(name))[1]));

-- 4) Package terms (contracts) and agreement ------------------------------------------------------------------
create table if not exists public.contracts (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  title          text not null check (char_length(title) between 2 and 120),
  price_bdt      numeric(12, 2) not null check (price_bdt >= 0 and price_bdt < 100000000),
  includes       text not null check (char_length(includes) between 2 and 3000),
  excludes       text check (excludes is null or char_length(excludes) <= 3000),
  travel_from    date,
  travel_to      date,
  refund_policy  text not null check (char_length(refund_policy) between 2 and 3000),
  created_by     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  check (travel_to is null or travel_from is null or travel_to >= travel_from)
);
alter table public.contracts enable row level security;

create or replace function public.is_contract_leader(p_contract uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.contracts c join public.groups g on g.id = c.group_id
                  where c.id = p_contract and g.leader_id = (select auth.uid()));
$$;
create or replace function public.is_contract_member(p_contract uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.contracts c join public.group_members m on m.group_id = c.group_id
                  where c.id = p_contract and m.user_id = (select auth.uid()) and m.status = 'active');
$$;
revoke all on public.contracts from anon, authenticated;
grant select on public.contracts to authenticated;
grant insert (group_id, title, price_bdt, includes, excludes, travel_from, travel_to, refund_policy) on public.contracts to authenticated;
-- no UPDATE / DELETE grants at all: terms are permanent once written.

drop policy if exists "contracts_select" on public.contracts;
create policy "contracts_select" on public.contracts for select to authenticated
  using (public.is_group_leader(group_id) or public.is_active_member(group_id));
drop policy if exists "contracts_insert" on public.contracts;
create policy "contracts_insert" on public.contracts for insert to authenticated
  with check (created_by = (select auth.uid()) and (select public.is_leader())
              and public.is_group_leader(group_id));

create table if not exists public.contract_acceptances (
  contract_id  uuid not null references public.contracts(id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  accepted_at  timestamptz not null default now(),
  primary key (contract_id, user_id)
);
alter table public.contract_acceptances enable row level security;
revoke all on public.contract_acceptances from anon, authenticated;
grant select on public.contract_acceptances to authenticated;
grant insert (contract_id) on public.contract_acceptances to authenticated;

drop policy if exists "acc_select" on public.contract_acceptances;
create policy "acc_select" on public.contract_acceptances for select to authenticated
  using (user_id = (select auth.uid()) or public.is_contract_leader(contract_id));
drop policy if exists "acc_insert" on public.contract_acceptances;
create policy "acc_insert" on public.contract_acceptances for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_contract_member(contract_id));

-- Function permissions: signed-in users only.
do $$
declare f text;
begin
  foreach f in array array['public.join_group(text)', 'public.invite_by_phone(uuid, text)', 'public.respond_invite(uuid, boolean)',
                           'public.leave_group(uuid)', 'public.remove_member(uuid, uuid)', 'public.my_groups()',
                           'public.group_members_for_leader(uuid)', 'public.is_group_leader(uuid)', 'public.is_active_member(uuid)',
                           'public.leader_sees_user(text)', 'public.is_contract_leader(uuid)', 'public.is_contract_member(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function public.gen_join_code() from public, anon;
grant execute on function public.gen_join_code() to authenticated;   -- needed for the column default
