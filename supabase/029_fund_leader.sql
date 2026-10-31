-- 029: leaders may give to the help fund and see the account, but may not apply for help themselves (owner, Oct 2026).
-- apply_help as in 027, with one more check: a leader account (approved or still applying) gets 'leader'.
-- Safe to run more than once.

create or replace function public.apply_help(p_kind text, p_age int, p_district text, p_profession text, p_reason text,
  p_went_before boolean, p_ref_name text, p_ref_phone text, p_show_name boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); r record;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.profiles where id = v_uid and (role = 'leader' or account_type = 'leader')) then return 'leader'; end if;
  if exists (select 1 from public.help_applications where user_id = v_uid and status in ('pending', 'approved', 'funded')) then return 'exists'; end if;
  if (select count(*) from public.help_applications where user_id = v_uid and created_at > now() - interval '1 day') >= 3 then return 'limit'; end if;
  insert into public.help_applications (user_id, kind, age, district, profession, reason, went_before, reference_name, reference_phone, show_name)
  values (v_uid, p_kind, p_age, trim(p_district), trim(p_profession), trim(p_reason), coalesce(p_went_before, false), trim(p_ref_name),
          regexp_replace(coalesce(p_ref_phone, ''), '[^0-9]', '', 'g'), coalesce(p_show_name, false));
  for r in select p.id from public.profiles p left join public.admin_staff s on s.user_id = p.id
            where p.status = 'active' and (p.role = 'admin' or (p.role = 'staff' and 'users' = any (s.perms))) loop
    perform public.notify_user(r.id, 'admin', 'সহায়তা তহবিলে নতুন আবেদন', 'অ্যাডমিন প্যানেলে "সহায়তা তহবিল" দেখুন।', 'Admin');
  end loop;
  return 'ok';
end $$;

revoke all on function public.apply_help(text, int, text, text, text, boolean, text, text, boolean) from public, anon;
grant execute on function public.apply_help(text, int, text, text, text, boolean, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
