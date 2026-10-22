-- 014: a leader's WORK AREA (district > upazila > union) instead of an office address. Run AFTER 013. Safe to re-run.
--  * New column union_name (the union(s) the leader works in, typed by hand) on applications and leader profiles.
--  * district / upazila keep their meaning, but now mean "where I work", chosen from lists in the app.
--  * The approval copies the union; the directory, the leader's page and the admin list show it; search finds it.

alter table public.leader_applications add column if not exists union_name text
  check (union_name is null or char_length(union_name) <= 120);
alter table public.leader_profiles add column if not exists union_name text
  check (union_name is null or char_length(union_name) <= 120);

grant insert (agency_name, license_no, doc_path, umrah_license, hajj_license, district, upazila, union_name)
  on public.leader_applications to authenticated;
grant update (district, upazila, union_name, bio) on public.leader_profiles to authenticated;   -- licences still only via admin

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
    insert into public.leader_profiles (user_id, agency_name, umrah_license, hajj_license, district, upazila, union_name)
    values (v_a.user_id, v_a.agency_name, coalesce(v_a.umrah_license, v_a.license_no), v_a.hajj_license, v_a.district, v_a.upazila, v_a.union_name)
    on conflict (user_id) do update set agency_name = excluded.agency_name, umrah_license = excluded.umrah_license,
      hajj_license = excluded.hajj_license, district = coalesce(excluded.district, public.leader_profiles.district),
      upazila = coalesce(excluded.upazila, public.leader_profiles.upazila),
      union_name = coalesce(excluded.union_name, public.leader_profiles.union_name), updated_at = now();
  end if;
  perform public.log_admin(case when p_approve then 'approve_leader' else 'reject_leader' end, v_a.user_id, p_note);
  return 'ok';
end $$;

-- The three lists below get one more column, so they are dropped and made again (same rules as in 007).
drop function if exists public.admin_list_applications();
create function public.admin_list_applications()
returns table (id uuid, user_id uuid, full_name text, phone text, haji_code text, agency_name text, license_no text,
               doc_path text, status text, admin_note text, created_at timestamptz,
               umrah_license text, hajj_license text, district text, upazila text, avatar_path text, union_name text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.user_id, p.full_name, p.phone, p.haji_code, a.agency_name, a.license_no, a.doc_path, a.status, a.admin_note,
         a.created_at, a.umrah_license, a.hajj_license, a.district, a.upazila, p.avatar_path, a.union_name
    from public.leader_applications a join public.profiles p on p.id = a.user_id
   where public.has_perm('applications')
   order by (a.status = 'pending') desc, a.created_at desc
   limit 300;
$$;

drop function if exists public.list_leaders(text, text);
create function public.list_leaders(p_district text default null, p_search text default null)
returns table (id uuid, full_name text, leader_code text, agency_name text, district text, upazila text, avatar_path text,
               umrah_license text, hajj_license text, rating_avg numeric, rating_count int, complaints_verified int, only_mine boolean,
               union_name text)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
       ref as (select public.active_referral_leader((select uid from me)) as lid)
  select p.id, p.full_name, p.haji_code, l.agency_name, l.district, l.upazila, p.avatar_path, l.umrah_license, l.hajj_license,
         round(coalesce((select avg(r.stars) from public.leader_ratings r where r.leader_id = p.id), 0), 1),
         (select count(*)::int from public.leader_ratings r where r.leader_id = p.id),
         (select count(*)::int from public.complaints c where c.leader_id = p.id and c.status = 'verified'),
         (select lid from ref) is not null,
         l.union_name
    from public.profiles p join public.leader_profiles l on l.user_id = p.id
   where (select uid from me) is not null and p.role = 'leader' and p.status = 'active'
     and ((select lid from ref) is null or p.id = (select lid from ref))
     and not exists (select 1 from public.user_blocks b where b.blocker = (select uid from me) and b.blocked = p.id)
     and (p_district is null or p_district = '' or l.district = p_district)
     and (p_search is null or trim(p_search) = '' or p.full_name ilike '%' || trim(p_search) || '%' or l.agency_name ilike '%' || trim(p_search) || '%'
          or p.haji_code ilike trim(p_search) || '%' or l.upazila ilike '%' || trim(p_search) || '%'
          or l.union_name ilike '%' || trim(p_search) || '%')
   order by 10 desc, 11 desc, p.full_name
   limit 200;
$$;

drop function if exists public.leader_public(uuid);
create function public.leader_public(p_leader uuid)
returns table (id uuid, full_name text, leader_code text, agency_name text, district text, upazila text, avatar_path text,
               umrah_license text, hajj_license text, bio text, rating_avg numeric, rating_count int, complaints_verified int,
               member_since timestamptz, blocked_by_me boolean, i_have_contract boolean, union_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.haji_code, l.agency_name, l.district, l.upazila, p.avatar_path, l.umrah_license, l.hajj_license, l.bio,
         round(coalesce((select avg(r.stars) from public.leader_ratings r where r.leader_id = p.id), 0), 1),
         (select count(*)::int from public.leader_ratings r where r.leader_id = p.id),
         (select count(*)::int from public.complaints c where c.leader_id = p.id and c.status = 'verified'),
         p.created_at,
         exists (select 1 from public.user_blocks b where b.blocker = (select auth.uid()) and b.blocked = p.id),
         exists (select 1 from public.haji_contracts c where c.leader_id = p.id and c.haji_id = (select auth.uid()) and c.status in ('accepted', 'completed', 'cancelled')),
         l.union_name
    from public.profiles p join public.leader_profiles l on l.user_id = p.id
   where (select auth.uid()) is not null and p.id = p_leader and p.role = 'leader' and p.status = 'active';
$$;

do $$
declare f text;
begin
  foreach f in array array['public.review_leader_application(uuid, boolean, text)', 'public.admin_list_applications()',
                           'public.list_leaders(text, text)', 'public.leader_public(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
