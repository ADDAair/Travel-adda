-- 030: a leader can remove a group made by mistake (owner request, Nov 2026).
--   * An empty group (nobody joined or was invited, no khadem, no questions, no terms, no announcements) is deleted for good.
--   * A group with any history is closed instead: it leaves the leader's list of open groups and nobody can join it,
--     but members, chats and terms stay (they may be needed to settle a dispute). It can be opened again.
-- Answers: 'deleted' | 'closed' | 'already_closed' | 'not_found'. Safe to run more than once.

create or replace function public.leader_remove_group(p_group uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v public.groups;
begin
  if v_uid is null or not public.is_leader() then raise exception 'not allowed'; end if;
  select * into v from public.groups where id = p_group for update;
  if v.id is null then return 'not_found'; end if;
  if v.leader_id <> v_uid then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.group_members where group_id = p_group)
     and not exists (select 1 from public.leader_invites where group_id = p_group)
     and not exists (select 1 from public.khadem_invites where group_id = p_group)
     and not exists (select 1 from public.group_staff where group_id = p_group)
     and not exists (select 1 from public.help_threads where group_id = p_group)
     and not exists (select 1 from public.contracts where group_id = p_group)
     and not exists (select 1 from public.group_announcements where group_id = p_group) then
    delete from public.group_faq where group_id = p_group;          -- the leader's own ready answers only
    delete from public.groups where id = p_group;
    return 'deleted';
  end if;
  if not v.active then return 'already_closed'; end if;
  update public.groups set active = false where id = p_group;
  return 'closed';
end $$;

create or replace function public.leader_reopen_group(p_group uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not public.is_leader() then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.groups where id = p_group and leader_id = v_uid) then raise exception 'not allowed'; end if;
  update public.groups set active = true where id = p_group;
  return 'ok';
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.leader_remove_group(uuid)', 'public.leader_reopen_group(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
