-- 016: log in with mobile number OR e-mail; verify the account with an SMS code OR an e-mail code. Run AFTER 015. Safe to re-run.
--
-- How login works now (and why):
--  * Every account gets a private "login key" (random, e.g. u3f9a1c0d2e4b6a8c0d1e2). The login itself uses
--    <login key>@users.traveladda.app, so the hidden login address no longer contains the phone number.
--  * The app asks login_id(<phone or e-mail>) for the login address, then signs in with the password.
--    For a number / e-mail that has NO account the answer looks exactly the same (a made-up key), so nobody can
--    find out who uses the app, and an e-mail never reveals a phone number (or the other way round).
--  * Only a VERIFIED e-mail can be used to log in (proved with a code sent to that e-mail).
--  * "Verified account" = phone verified OR e-mail verified. Leader applications and group invitations accept either.
--  * Existing accounts are moved to a login key here; their passwords and sessions stay the same.
--    (Old test APKs that still build the login from the phone number must be updated to the new APK.)

-- 1) columns -----------------------------------------------------------------------------------------------------------
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists email_verified boolean not null default false;
alter table public.profiles add column if not exists login_key text;
alter table public.profiles drop constraint if exists profiles_email_check;
alter table public.profiles add constraint profiles_email_check
  check (email is null or (char_length(email) between 6 and 254 and email = lower(email) and email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'));
alter table public.profiles drop constraint if exists profiles_login_key_check;
alter table public.profiles add constraint profiles_login_key_check
  check (login_key is null or login_key ~ '^(u[0-9a-f]{20}|01[3-9][0-9]{8})$');
create unique index if not exists profiles_email_unique on public.profiles (email) where email is not null;
create unique index if not exists profiles_login_key_unique on public.profiles (login_key) where login_key is not null;
do $$ begin
  alter table public.profiles add column verified boolean generated always as (phone_verified or email_verified) stored;
exception when duplicate_column then null;
end $$;

-- Users can never change these themselves (column grants already forbid it; the trigger is a second lock).
create or replace function public.protect_profile_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.id is distinct from old.id or new.role is distinct from old.role or
       new.haji_code is distinct from old.haji_code or new.phone is distinct from old.phone or
       new.status is distinct from old.status or new.phone_verified is distinct from old.phone_verified or
       new.account_type is distinct from old.account_type or new.email is distinct from old.email or
       new.email_verified is distinct from old.email_verified or new.login_key is distinct from old.login_key) then
    raise exception 'protected column';
  end if;
  return new;
end $$;
revoke all on function public.protect_profile_columns() from public, anon, authenticated;

-- 2) phone codes table also carries e-mail codes ---------------------------------------------------------------------------
alter table public.phone_otps alter column phone drop not null;
alter table public.phone_otps add column if not exists email text check (email is null or char_length(email) <= 254);
alter table public.phone_otps add column if not exists user_id uuid;
alter table public.phone_otps drop constraint if exists phone_otps_one_target;
alter table public.phone_otps add constraint phone_otps_one_target check ((phone is null) <> (email is null));
create index if not exists phone_otps_email_lookup on public.phone_otps (email, created_at desc) where email is not null;

-- 3) secret used to make the "no account" answers look real (never readable by anyone) ------------------------------------
create table if not exists public.app_private (key text primary key, value text not null);
alter table public.app_private enable row level security;
revoke all on public.app_private from anon, authenticated;
insert into public.app_private (key, value)
values ('login_pepper', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- 4) new sign-ups: phone from the sign-up data, login key from the login address ---------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_local text := split_part(new.email, '@', 1);
        v_phone text := coalesce(nullif(trim(new.raw_user_meta_data->>'phone'), ''), v_local);
        v_leader boolean := coalesce(new.raw_user_meta_data->>'account_type', '') = 'leader';
begin
  insert into public.profiles (id, role, account_type, haji_code, full_name, phone, login_key)
  values (new.id, 'haji', case when v_leader then 'leader' else 'haji' end,
          case when v_leader then public.fmt_code('TL-', nextval('public.leader_code_seq'), 5)
               else public.fmt_code('TA-', nextval('public.haji_code_seq'), 5) end,
          trim(coalesce(new.raw_user_meta_data->>'full_name', '')), v_phone, v_local);
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 5) existing accounts: give each a random login key and move the login address to it --------------------------------------
do $$
declare r record; v_key text; n int := 0;
begin
  for r in select p.id from public.profiles p where p.login_key is null or p.login_key !~ '^u' loop
    v_key := 'u' || left(replace(gen_random_uuid()::text, '-', ''), 20);
    begin
      update auth.users set email = v_key || '@users.traveladda.app' where id = r.id;
      begin
        update auth.identities set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_key || '@users.traveladda.app'))
         where user_id = r.id and provider = 'email';
      exception when others then null;                       -- older/newer auth layout: the login address above is what counts
      end;
      update public.profiles set login_key = v_key where id = r.id;
      n := n + 1;
    exception when others then
      -- not allowed to change the login address here: keep the old phone-based one working
      update public.profiles set login_key = split_part((select email from auth.users where id = r.id), '@', 1)
       where id = r.id and login_key is null;
      raise notice 'login address of % not moved: %', r.id, sqlerrm;
    end;
  end loop;
  raise notice 'accounts moved to a private login key: %', n;
end $$;

-- 6) login address for a phone number or a verified e-mail (callable before login) -----------------------------------------
create or replace function public.login_id(p_ident text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v text := lower(trim(coalesce(p_ident, ''))); v_key text;
begin
  if char_length(v) < 5 or char_length(v) > 254 then return null; end if;
  if position('@' in v) > 0 then
    select login_key into v_key from public.profiles where email = v and email_verified;
  else
    v := regexp_replace(translate(v, '০১২৩৪৫৬৭৮৯', '0123456789'), '[^0-9]', '', 'g');
    if v like '880%' then v := '0' || substr(v, 4); end if;
    if v !~ '^01[3-9][0-9]{8}$' then return null; end if;
    select login_key into v_key from public.profiles where phone = v;
  end if;
  if v_key is null then          -- no such account: a made-up key that always looks the same for this input
    v_key := 'u' || left(encode(sha256(convert_to((select value from public.app_private where key = 'login_pepper') || ':' || v, 'UTF8')), 'hex'), 20);
  end if;
  return v_key || '@users.traveladda.app';
end $$;
revoke all on function public.login_id(text) from public;
grant execute on function public.login_id(text) to anon, authenticated;

-- 7) "verified" = phone OR e-mail, wherever it matters -------------------------------------------------------------------
create or replace function public.invite_by_phone(p_group uuid, p_phone text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_target uuid;
begin
  if not exists (select 1 from public.groups g where g.id = p_group and g.leader_id = v_uid and g.active) or not public.is_leader() then
    raise exception 'not allowed';
  end if;
  select id into v_target from public.profiles
   where phone = trim(p_phone) and status = 'active' and account_type = 'haji' and (verified or not public.otp_live());
  if v_target is not null and v_target <> v_uid and not public.blocked_between(v_uid, v_target) then
    insert into public.group_members (group_id, user_id, status) values (p_group, v_target, 'invited')
    on conflict (group_id, user_id) do update set status = 'invited'
      where public.group_members.status in ('left', 'declined');
  end if;
  return 'sent';
end $$;

create or replace function public.group_members_for_leader(p_group uuid)
returns table (user_id uuid, full_name text, haji_code text, phone text, avatar_path text, status text, joined_at timestamptz, phone_verified boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.haji_code, case when public.has_accepted_contract(g.leader_id, p.id) then p.phone end,
         p.avatar_path, m.status, m.joined_at, p.verified           -- column name kept for older apps; means "account verified"
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
              and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_type = 'leader' and p.role = 'haji' and p.status = 'active')
              and (not public.otp_live() or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.verified))
              and (select public.agreed_terms('terms_leader')));

do $$
declare f text;
begin
  foreach f in array array['public.invite_by_phone(uuid, text)', 'public.group_members_for_leader(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- the app reads its own e-mail and status (other columns stay as before)
grant select (email, email_verified, verified) on public.profiles to authenticated;

notify pgrst, 'reload schema';
