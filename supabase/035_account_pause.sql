-- 035 (owner, Nov 2026): "অ্যাকাউন্ট বন্ধ রাখা" — pause and resume an account; deletion waits 30 days.
-- Safe to run more than once. Run in the Supabase SQL Editor.
--   * New status 'paused'. Everything that already shows only 'active' people (leader list, packages, invites,
--     phone alerts, admin/leader checks) hides a paused person automatically, and he cannot act until he resumes.
--   * pause_my_account(): needs the password from the last 10 minutes; not while a contract is accepted.
--   * request_account_deletion(): needs the password; pauses the account now and removes it after 30 days.
--     Logging in and resume_my_account() cancels it. delete_my_account() (older app builds) does the same.
--   * purge_deleted_accounts(): run every night by pg_cron; only the server can run it. Contract, payment and
--     complaint records stay without the person (their links are set to empty), as the privacy policy says.
--   * An account suspended by the admin cannot resume itself; it may still ask for (or cancel) deletion.

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check check (status in ('active', 'suspended', 'paused'));
alter table public.profiles add column if not exists paused_at timestamptz;
alter table public.profiles add column if not exists delete_after timestamptz;
create index if not exists profiles_delete_due on public.profiles (delete_after) where delete_after is not null;

-- the password was typed in the last 10 minutes (same rule as account deletion since 021)
create or replace function public.recent_password() returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
                  where a ->> 'method' in ('password', 'otp')
                    and (a ->> 'timestamp')::bigint > extract(epoch from now())::bigint - 600);
$$;
revoke all on function public.recent_password() from public, anon, authenticated;

create or replace function public.pause_my_account() returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not public.recent_password() then return 'password_needed'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and status = 'active') then return 'not_active'; end if;
  if exists (select 1 from public.haji_contracts where status = 'accepted' and (haji_id = v_uid or leader_id = v_uid)) then return 'has_contract'; end if;
  update public.profiles set status = 'paused', paused_at = now() where id = v_uid;
  return 'ok';
end $$;

create or replace function public.resume_my_account() returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_status text; v_del timestamptz;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select status, delete_after into v_status, v_del from public.profiles where id = v_uid;
  if v_status = 'paused' then
    update public.profiles set status = 'active', paused_at = null, delete_after = null where id = v_uid;
    return 'ok';
  end if;
  if v_del is not null then                       -- e.g. suspended: only the deletion is cancelled
    update public.profiles set delete_after = null where id = v_uid;
    return 'ok';
  end if;
  return 'not_paused';
end $$;

create or replace function public.request_account_deletion() returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not public.recent_password() then return 'password_needed'; end if;
  update public.profiles
     set status = case when status = 'active' then 'paused' else status end,
         paused_at = case when status = 'active' then now() else paused_at end,
         delete_after = coalesce(delete_after, now() + interval '30 days')     -- asking again keeps the first date
   where id = v_uid;
  return 'ok';
end $$;

-- Older app builds call this; it now waits 30 days too (and still refuses without a fresh password).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  if public.request_account_deletion() = 'password_needed' then raise exception 'password needed'; end if;
end $$;

create or replace function public.purge_deleted_accounts() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with gone as (
    delete from auth.users u using public.profiles p
     where p.id = u.id and p.delete_after is not null and p.delete_after <= now()
    returning u.id)
  select count(*) into n from gone;
  return n;
end $$;
revoke all on function public.purge_deleted_accounts() from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array['public.pause_my_account()', 'public.resume_my_account()', 'public.request_account_deletion()', 'public.delete_my_account()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- every night (Bangladesh 3:41 am): remove the accounts whose 30 days are over
do $$ begin
  perform cron.schedule('ami-haji-purge-accounts', '41 21 * * *', 'select public.purge_deleted_accounts()');
exception when others then raise notice 'account removal not scheduled (%): run select public.purge_deleted_accounts() by hand', sqlerrm;
end $$;

notify pgrst, 'reload schema';
