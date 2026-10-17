-- 006: leader announcements, document expiry dates, phone-number verification (OTP). Run AFTER 005. Safe to re-run.

-- 0) Profile protection, corrected: the trigger runs with the CALLER's rights (no SECURITY DEFINER), so a signed-in
--    user can never change role / status / phone / phone_verified directly, while trusted server functions can.
alter table public.profiles add column if not exists phone_verified boolean not null default false;
create or replace function public.protect_profile_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.id is distinct from old.id or new.role is distinct from old.role or
       new.haji_code is distinct from old.haji_code or new.phone is distinct from old.phone or
       new.status is distinct from old.status or new.phone_verified is distinct from old.phone_verified) then
    raise exception 'protected column';
  end if;
  return new;
end $$;

-- 1) Leader announcements to the whole group ---------------------------------------------------------------------
create table if not exists public.group_announcements (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  body        text not null check (char_length(trim(body)) between 2 and 500),
  created_by  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists group_ann_by_group on public.group_announcements (group_id, created_at desc);
alter table public.group_announcements enable row level security;
revoke all on public.group_announcements from anon, authenticated;
grant select, delete on public.group_announcements to authenticated;
grant insert (group_id, body) on public.group_announcements to authenticated;

create or replace function public.announcements_today(p_group uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.group_announcements where group_id = p_group and created_at > now() - interval '1 day';
$$;

drop policy if exists "ann_select" on public.group_announcements;
create policy "ann_select" on public.group_announcements for select to authenticated
  using (public.is_group_leader(group_id) or public.is_active_member(group_id));
drop policy if exists "ann_insert" on public.group_announcements;
create policy "ann_insert" on public.group_announcements for insert to authenticated
  with check (created_by = (select auth.uid()) and (select public.is_leader()) and public.is_group_leader(group_id)
              and public.announcements_today(group_id) < 30);
drop policy if exists "ann_delete" on public.group_announcements;
create policy "ann_delete" on public.group_announcements for delete to authenticated
  using (created_by = (select auth.uid()) and public.is_group_leader(group_id));

-- 2) Expiry date on my documents (passport, visa) ---------------------------------------------------------------
alter table public.user_documents add column if not exists expires_on date;
do $$ begin
  alter table public.user_documents add constraint user_documents_expires_check
    check (expires_on is null or expires_on between date '2000-01-01' and date '2100-01-01');
exception when duplicate_object then null; end $$;
grant update (expires_on) on public.user_documents to authenticated;
drop policy if exists "docs_own_update" on public.user_documents;
create policy "docs_own_update" on public.user_documents for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 3) Phone verification codes. Only the server function (service role) touches this table; apps have no access.
create table if not exists public.phone_otps (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null check (phone ~ '^01[3-9][0-9]{8}$'),
  purpose     text not null check (purpose in ('verify', 'reset')),
  code_hash   text not null,
  attempts    int not null default 0,
  used        boolean not null default false,
  sms_sent    boolean not null default true,
  ip          text check (ip is null or char_length(ip) <= 64),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists phone_otps_lookup on public.phone_otps (phone, purpose, created_at desc);
create index if not exists phone_otps_ip on public.phone_otps (ip, created_at desc);
alter table public.phone_otps enable row level security;     -- no policies: nobody but the service role
revoke all on public.phone_otps from anon, authenticated;

-- 'otp_live' = 'yes' is set by the admin once SMS works; from then on invitations and leader applications
-- need a verified number.
alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check check (key in ('helpline_phone', 'helpline_hours', 'otp_live'));
create or replace function public.admin_set_setting(p_key text, p_value text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('helpline_phone', 'helpline_hours', 'otp_live') then raise exception 'bad key'; end if;
  if p_value is null or trim(p_value) = '' then
    delete from public.app_settings where key = p_key;
  else
    if p_key = 'helpline_phone' and trim(p_value) !~ '^\+?[0-9]{6,15}$' then raise exception 'bad phone'; end if;
    if p_key = 'otp_live' and trim(p_value) <> 'yes' then raise exception 'bad value'; end if;
    insert into public.app_settings (key, value) values (p_key, left(trim(p_value), 80))
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  return 'ok';
end $$;
create or replace function public.otp_live() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_settings where key = 'otp_live' and value = 'yes');
$$;

create or replace function public.invite_by_phone(p_group uuid, p_phone text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_target uuid;
begin
  if not exists (select 1 from public.groups g where g.id = p_group and g.leader_id = v_uid and g.active) or not public.is_leader() then
    raise exception 'not allowed';
  end if;
  select id into v_target from public.profiles
   where phone = trim(p_phone) and status = 'active' and (phone_verified or not public.otp_live());
  if v_target is not null and v_target <> v_uid then
    insert into public.group_members (group_id, user_id, status) values (p_group, v_target, 'invited')
    on conflict (group_id, user_id) do update set status = 'invited'
      where public.group_members.status in ('left', 'declined');
  end if;
  return 'sent';
end $$;

drop function if exists public.group_members_for_leader(uuid);
create function public.group_members_for_leader(p_group uuid)
returns table (user_id uuid, full_name text, haji_code text, phone text, avatar_path text, status text, joined_at timestamptz, phone_verified boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.haji_code, p.phone, p.avatar_path, m.status, m.joined_at, p.phone_verified
    from public.group_members m
    join public.groups g on g.id = m.group_id
    join public.profiles p on p.id = m.user_id
   where m.group_id = p_group and g.leader_id = (select auth.uid()) and m.status in ('active', 'invited')
   order by m.status, p.full_name;
$$;

drop policy if exists "lapp_insert" on public.leader_applications;
create policy "lapp_insert" on public.leader_applications for insert to authenticated
  with check (user_id = (select auth.uid())
              and (doc_path is null or doc_path like (select auth.uid())::text || '/%')
              and not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role <> 'haji')
              and (not public.otp_live() or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.phone_verified)));

do $$
declare f text;
begin
  foreach f in array array['public.announcements_today(uuid)', 'public.admin_set_setting(text, text)', 'public.otp_live()',
                           'public.invite_by_phone(uuid, text)', 'public.group_members_for_leader(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
