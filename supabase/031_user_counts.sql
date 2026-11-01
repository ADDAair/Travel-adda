-- 031: admin panel → "ব্যবহারকারী": in short, how many hajis have registered and how many group leaders there are
-- (owner, Nov 2026). Numbers only, no names or phone numbers. Only the admin and staff with the "users" permission
-- (after 2FA, via has_perm) may see them. Safe to run more than once.

create or replace function public.admin_user_counts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm('users') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'hajis', (select count(*) from public.profiles where account_type = 'haji' and role = 'haji'),
    'leaders', (select count(*) from public.profiles where role = 'leader' and status = 'active'),
    'leaders_pending', (select count(*) from public.leader_applications where status = 'pending'));
end $$;

revoke all on function public.admin_user_counts() from public, anon;
grant execute on function public.admin_user_counts() to authenticated;

notify pgrst, 'reload schema';
