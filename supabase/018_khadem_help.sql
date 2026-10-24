-- 018: khadems (helpers in Makkah/Madinah) and each group's private help chat with ready answers. Run AFTER 017. Safe to re-run.
--  * A leader adds khadems to a group (by ID or mobile number, max 10). Khadems have their own normal account.
--    They see the group's hajis (phone only of hajis whose contract with the leader is accepted), answer questions,
--    and are shown with a "khadem" mark. The leader can remove them any time; access ends at once.
--  * Help chat: every haji has ONE private conversation per group with the leader and khadems. Other hajis never see it.
--    Max 20 messages per hour per haji. Leader and khadems get a notice for a new question, the haji for an answer.
--  * Ready answers (FAQ): the leader writes common questions and answers; members and khadems read them first.
--  * Nobody reads these tables directly: everything goes through the functions below, which check who is asking.

-- 1) tables --------------------------------------------------------------------------------------------------------------
create table if not exists public.group_staff (
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  added_by    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_staff_by_user on public.group_staff (user_id);

create table if not exists public.help_threads (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  haji_id     uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'open' check (status in ('open', 'closed')),
  last_at     timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (group_id, haji_id)
);
create index if not exists help_threads_by_group on public.help_threads (group_id, last_at desc);

create table if not exists public.help_messages (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.help_threads(id) on delete cascade,
  sender_id    uuid references public.profiles(id) on delete set null,
  sender_role  text not null check (sender_role in ('haji', 'leader', 'khadem')),
  body         text not null check (char_length(trim(body)) between 1 and 1000),
  created_at   timestamptz not null default now()
);
create index if not exists help_messages_by_thread on public.help_messages (thread_id, created_at);
create index if not exists help_messages_by_sender on public.help_messages (sender_id, created_at desc);

create table if not exists public.group_faq (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  question    text not null check (char_length(trim(question)) between 2 and 150),
  answer      text not null check (char_length(trim(answer)) between 2 and 1000),
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists group_faq_by_group on public.group_faq (group_id, sort, created_at);

do $$
declare t text;
begin
  foreach t in array array['group_staff', 'help_threads', 'help_messages', 'group_faq'] loop
    execute format('alter table public.%I enable row level security', t);       -- no policies: functions only
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- notices may now open the help screens
alter table public.user_notifications drop constraint if exists user_notifications_route_check;
alter table public.user_notifications add constraint user_notifications_route_check check (route is null or route in
  ('MyLeader', 'LeaderContracts', 'Group', 'Leader', 'Admin', 'Offers', 'Docs', 'Account', 'Home', 'Leaders', 'HelpChat', 'HelpInbox', 'KhademHome'));

-- 2) who is the caller in a group (internal) ---------------------------------------------------------------------------
create or replace function public.group_role(p_group uuid, p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.groups g join public.profiles p on p.id = g.leader_id
                  where g.id = p_group and g.leader_id = p_user and p.role = 'leader' and p.status = 'active') then 'leader'
    when exists (select 1 from public.group_staff s join public.profiles p on p.id = s.user_id
                  where s.group_id = p_group and s.user_id = p_user and p.status = 'active') then 'khadem'
    when exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = p_user and m.status = 'active') then 'member'
  end;
$$;
revoke all on function public.group_role(uuid, uuid) from public, anon, authenticated;

-- 3) khadems ---------------------------------------------------------------------------------------------------------
create or replace function public.leader_add_khadem(p_group uuid, p_ident text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id text := upper(trim(coalesce(p_ident, ''))); v_t public.profiles; v_g text;
begin
  if coalesce(public.group_role(p_group, v_uid), '') <> 'leader' then raise exception 'not allowed'; end if;
  v_id := translate(v_id, '০১২৩৪৫৬৭৮৯', '0123456789');
  if v_id ~ '^T[AL]-?[0-9]+$' then
    select * into v_t from public.profiles where haji_code = regexp_replace(v_id, '^(T[AL])-?', '\1-');
  else
    v_id := regexp_replace(v_id, '[^0-9]', '', 'g');
    if v_id like '880%' then v_id := '0' || substr(v_id, 4); end if;
    select * into v_t from public.profiles where phone = v_id;
  end if;
  if v_t.id is null or v_t.status <> 'active' then return 'not_found'; end if;
  if v_t.id = v_uid then return 'self'; end if;
  if exists (select 1 from public.group_staff where group_id = p_group and user_id = v_t.id) then return 'already'; end if;
  if (select count(*) from public.group_staff where group_id = p_group) >= 10 then return 'limit'; end if;
  insert into public.group_staff (group_id, user_id, added_by) values (p_group, v_t.id, v_uid);
  select name into v_g from public.groups where id = p_group;
  perform public.notify_user(v_t.id, 'group', 'আপনাকে "' || v_g || '" দলের খাদেম করা হয়েছে',
                             'খাদেমের পাতায় দলের হাজী আর তাঁদের প্রশ্ন দেখতে পাবেন।', 'KhademHome');
  return 'ok';
end $$;

create or replace function public.leader_remove_khadem(p_group uuid, p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.group_role(p_group, (select auth.uid())), '') <> 'leader' then raise exception 'not allowed'; end if;
  delete from public.group_staff where group_id = p_group and user_id = p_user;
  return case when found then 'ok' else 'not_found' end;
end $$;

-- Khadems of a group: for its leader, its khadems and its active members.
-- A khadem's phone: for the leader and other khadems, and for members whose contract with the leader is accepted.
create or replace function public.group_khadems(p_group uuid)
returns table (user_id uuid, full_name text, code text, avatar_path text, phone text)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid, public.group_role(p_group, (select auth.uid())) as role),
       g as (select leader_id from public.groups where id = p_group)
  select p.id, p.full_name, p.haji_code, p.avatar_path,
         case when (select role from me) in ('leader', 'khadem')
                or ((select role from me) = 'member' and public.has_accepted_contract((select leader_id from g), (select uid from me)))
              then p.phone end
    from public.group_staff s join public.profiles p on p.id = s.user_id
   where s.group_id = p_group and (select role from me) is not null and p.status = 'active'
   order by s.created_at;
$$;

create or replace function public.my_khadem_groups()
returns table (group_id uuid, group_name text, season text, leader_name text, member_count int, waiting int)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, g.season, lp.full_name,
         (select count(*)::int from public.group_members m where m.group_id = g.id and m.status = 'active'),
         (select count(*)::int from public.help_threads t
           where t.group_id = g.id and t.status = 'open'
             and (select m.sender_role from public.help_messages m where m.thread_id = t.id order by m.created_at desc limit 1) = 'haji')
    from public.group_staff s join public.groups g on g.id = s.group_id join public.profiles lp on lp.id = g.leader_id
   where s.user_id = (select auth.uid()) and g.active
     and exists (select 1 from public.profiles me where me.id = s.user_id and me.status = 'active')
   order by g.created_at desc;
$$;

create or replace function public.khadem_group_members(p_group uuid)
returns table (user_id uuid, full_name text, haji_code text, phone text, avatar_path text, status text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.haji_code, case when public.has_accepted_contract(g.leader_id, p.id) then p.phone end,
         p.avatar_path, m.status, m.joined_at
    from public.group_members m join public.groups g on g.id = m.group_id join public.profiles p on p.id = m.user_id
   where m.group_id = p_group and m.status in ('active', 'invited')
     and public.group_role(p_group, (select auth.uid())) = 'khadem'
   order by m.status, p.full_name;
$$;

-- 4) help chat ---------------------------------------------------------------------------------------------------------
create or replace function public.help_send(p_group uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_body text := trim(coalesce(p_body, '')); v_th uuid; v_last text; v_name text; r record;
begin
  if coalesce(public.group_role(p_group, v_uid), '') <> 'member'
     or not exists (select 1 from public.groups where id = p_group and active) then raise exception 'not a member'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 1000 then raise exception 'bad message'; end if;
  if (select count(*) from public.help_messages where sender_id = v_uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too many messages';
  end if;
  insert into public.help_threads (group_id, haji_id) values (p_group, v_uid)
  on conflict (group_id, haji_id) do update set status = 'open', last_at = now()
  returning id into v_th;
  select sender_role into v_last from public.help_messages where thread_id = v_th order by created_at desc limit 1;
  insert into public.help_messages (thread_id, sender_id, sender_role, body) values (v_th, v_uid, 'haji', v_body);
  update public.help_threads set last_at = now(), status = 'open' where id = v_th;
  if v_last is distinct from 'haji' then          -- one notice per waiting question, not per message
    select full_name into v_name from public.profiles where id = v_uid;
    for r in select g.leader_id as uid from public.groups g where g.id = p_group
             union select s.user_id from public.group_staff s where s.group_id = p_group loop
      perform public.notify_user(r.uid, 'group', 'নতুন প্রশ্ন: ' || coalesce(v_name, 'হাজী'), left(v_body, 120), 'HelpInbox');
    end loop;
  end if;
  return v_th;
end $$;

create or replace function public.help_reply(p_thread uuid, p_body text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_body text := trim(coalesce(p_body, '')); v_t public.help_threads; v_role text; v_g text;
begin
  select * into v_t from public.help_threads where id = p_thread;
  if v_t.id is null then raise exception 'not allowed'; end if;
  v_role := public.group_role(v_t.group_id, v_uid);
  if coalesce(v_role, '') not in ('leader', 'khadem') then raise exception 'not allowed'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 1000 then raise exception 'bad message'; end if;
  if (select count(*) from public.help_messages where sender_id = v_uid and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'too many messages';
  end if;
  insert into public.help_messages (thread_id, sender_id, sender_role, body) values (p_thread, v_uid, v_role, v_body);
  update public.help_threads set last_at = now() where id = p_thread;
  select name into v_g from public.groups where id = v_t.group_id;
  perform public.notify_user(v_t.haji_id, 'group', case when v_role = 'leader' then 'লিডার' else 'খাদেম' end || ' আপনার প্রশ্নের উত্তর দিয়েছেন',
                             left(v_body, 120), 'HelpChat');
  return 'ok';
end $$;

create or replace function public.help_my_messages(p_group uuid)
returns table (id uuid, sender_role text, sender_name text, body text, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = '' as $$
  select m.id, m.sender_role, coalesce(p.full_name, ''), m.body, m.created_at, m.sender_id = (select auth.uid())
    from public.help_threads t join public.help_messages m on m.thread_id = t.id left join public.profiles p on p.id = m.sender_id
   where t.group_id = p_group and t.haji_id = (select auth.uid())
   order by m.created_at
   limit 500;
$$;

create or replace function public.help_inbox(p_group uuid)
returns table (thread_id uuid, haji_id uuid, haji_name text, haji_code text, avatar_path text, last_body text,
               last_at timestamptz, last_from_haji boolean, status text, msg_count int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.group_role(p_group, (select auth.uid())), '') not in ('leader', 'khadem') then raise exception 'not allowed'; end if;
  return query
  select t.id, t.haji_id, p.full_name, p.haji_code, p.avatar_path, l.body, t.last_at, l.sender_role = 'haji', t.status,
         (select count(*)::int from public.help_messages c where c.thread_id = t.id)
    from public.help_threads t join public.profiles p on p.id = t.haji_id
    left join lateral (select m.body, m.sender_role from public.help_messages m where m.thread_id = t.id order by m.created_at desc limit 1) l on true
   where t.group_id = p_group
   order by t.last_at desc
   limit 300;
end $$;

create or replace function public.help_thread(p_thread uuid)
returns table (id uuid, sender_role text, sender_name text, body text, created_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_g uuid;
begin
  select ht.group_id into v_g from public.help_threads ht where ht.id = p_thread;
  if v_g is null or coalesce(public.group_role(v_g, (select auth.uid())), '') not in ('leader', 'khadem') then raise exception 'not allowed'; end if;
  return query
  select m.id, m.sender_role, coalesce(p.full_name, ''), m.body, m.created_at, m.sender_id = (select auth.uid())
    from public.help_messages m left join public.profiles p on p.id = m.sender_id
   where m.thread_id = p_thread
   order by m.created_at
   limit 500;
end $$;

create or replace function public.help_set_status(p_thread uuid, p_status text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_g uuid;
begin
  select ht.group_id into v_g from public.help_threads ht where ht.id = p_thread;
  if v_g is null or coalesce(public.group_role(v_g, (select auth.uid())), '') not in ('leader', 'khadem') then raise exception 'not allowed'; end if;
  if p_status not in ('open', 'closed') then raise exception 'bad status'; end if;
  update public.help_threads ht set status = p_status where ht.id = p_thread;
  return 'ok';
end $$;

-- 5) ready answers ------------------------------------------------------------------------------------------------------
create or replace function public.faq_list(p_group uuid)
returns table (id uuid, question text, answer text, sort int)
language sql stable security definer set search_path = '' as $$
  select f.id, f.question, f.answer, f.sort from public.group_faq f
   where f.group_id = p_group and public.group_role(p_group, (select auth.uid())) is not null
   order by f.sort, f.created_at
   limit 50;
$$;

create or replace function public.leader_faq_save(p_group uuid, p_id uuid, p_q text, p_a text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if coalesce(public.group_role(p_group, (select auth.uid())), '') <> 'leader' then raise exception 'not allowed'; end if;
  if char_length(trim(coalesce(p_q, ''))) not between 2 and 150 or char_length(trim(coalesce(p_a, ''))) not between 2 and 1000 then
    raise exception 'bad faq';
  end if;
  if p_id is null then
    if (select count(*) from public.group_faq where group_id = p_group) >= 30 then raise exception 'faq limit'; end if;
    insert into public.group_faq (group_id, question, answer, sort)
    values (p_group, trim(p_q), trim(p_a), coalesce((select max(sort) + 1 from public.group_faq where group_id = p_group), 0))
    returning id into v_id;
  else
    update public.group_faq set question = trim(p_q), answer = trim(p_a), updated_at = now()
     where id = p_id and group_id = p_group returning id into v_id;
    if v_id is null then raise exception 'not found'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.leader_faq_delete(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_g uuid;
begin
  select group_id into v_g from public.group_faq where id = p_id;
  if v_g is null or coalesce(public.group_role(v_g, (select auth.uid())), '') <> 'leader' then raise exception 'not allowed'; end if;
  delete from public.group_faq where id = p_id;
  return 'ok';
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.leader_add_khadem(uuid, text)', 'public.leader_remove_khadem(uuid, uuid)', 'public.group_khadems(uuid)',
    'public.my_khadem_groups()', 'public.khadem_group_members(uuid)', 'public.help_send(uuid, text)', 'public.help_reply(uuid, text)',
    'public.help_my_messages(uuid)', 'public.help_inbox(uuid)', 'public.help_thread(uuid)', 'public.help_set_status(uuid, text)',
    'public.faq_list(uuid)', 'public.leader_faq_save(uuid, uuid, text, text)', 'public.leader_faq_delete(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
