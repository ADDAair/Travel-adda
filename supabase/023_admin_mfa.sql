-- 023: admin & staff powers need 2FA (authenticator app code). Run AFTER 022. Safe to run more than once.
--  Every admin / staff check in the database goes through is_admin() or has_perm(); both now also require that the
--  current session passed 2FA ("aal2" in the login token). A stolen password alone can no longer do admin work.
--  Leaders and hajis are not affected.
--  BEFORE running: the owner sets up 2FA in the new app (Admin panel asks for it), so nobody is locked out.
--  If the authenticator phone is lost: Supabase dashboard > Authentication > Users > the admin > remove MFA factor.

create or replace function public.mfa_ok() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
revoke all on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.mfa_ok() and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and status = 'active');
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.mfa_ok() and (
         exists (select 1 from public.profiles where id = (select auth.uid()) and status = 'active' and role = 'admin')
      or exists (select 1 from public.profiles pr join public.admin_staff s on s.user_id = pr.id
                  where pr.id = (select auth.uid()) and pr.status = 'active' and pr.role = 'staff' and p = any (s.perms)));
$$;

-- The app's admin menu (which sections to show) is empty until 2FA is done.
create or replace function public.my_perms() returns text[]
language sql stable security definer set search_path = '' as $$
  select case
    when not public.mfa_ok() then '{}'::text[]
    when exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and status = 'active')
      then array['admin', 'applications', 'calls', 'offers', 'complaints', 'reports', 'users', 'payments', 'notify']
    else coalesce((select s.perms from public.admin_staff s join public.profiles p on p.id = s.user_id
                    where s.user_id = (select auth.uid()) and p.role = 'staff' and p.status = 'active'), '{}'::text[]) end;
$$;

-- For the app's own screen: is this an admin/staff account, and did this session pass 2FA?
create or replace function public.my_mfa_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  return jsonb_build_object(
    'staff', exists (select 1 from public.profiles where id = v_uid and status = 'active' and role in ('admin', 'staff')),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'));
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.is_admin()', 'public.has_perm(text)', 'public.my_perms()', 'public.my_mfa_state()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
