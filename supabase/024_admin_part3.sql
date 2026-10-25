-- 024: admin panel part 3. Run AFTER 023. Safe to run more than once.
--  1) During a dispute the admin (or staff with the "complaints" permission) may read the help chat between the
--     haji and that contract's leader ONLY after the haji agrees in the app. The permission ends after 7 days or
--     when the haji takes it back. Every reading is written to the work record (admin_audit).
--  2) The admin can correct guide and dua text without an app update. Only existing text can be changed — the app
--     ignores a correction whose place does not exist — and an empty correction returns to the app's own text.

-- 1) Help chat consent ------------------------------------------------------------------------------------------------
create table if not exists public.chat_consents (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references public.haji_contracts(id) on delete cascade,
  haji_id       uuid not null references public.profiles(id) on delete cascade,
  leader_id     uuid not null references public.profiles(id) on delete cascade,
  requested_by  uuid references public.profiles(id) on delete set null,
  reason        text not null check (char_length(trim(reason)) between 5 and 300),
  status        text not null default 'asked' check (status in ('asked', 'granted', 'declined', 'revoked')),
  created_at    timestamptz not null default now(),
  answered_at   timestamptz,
  expires_at    timestamptz
);
alter table public.user_notifications drop constraint if exists user_notifications_route_check;
alter table public.user_notifications add constraint user_notifications_route_check check (route is null or route in
  ('MyLeader', 'LeaderContracts', 'Group', 'Leader', 'Admin', 'Offers', 'Docs', 'Account', 'Home', 'Leaders', 'HelpChat', 'HelpInbox',
   'KhademHome', 'LeaderOffers', 'GroupStaff', 'ChatConsent'));
create index if not exists chat_consents_by_contract on public.chat_consents (contract_id, created_at desc);
create index if not exists chat_consents_by_haji on public.chat_consents (haji_id, created_at desc);
alter table public.chat_consents enable row level security;
revoke all on public.chat_consents from anon, authenticated;

create or replace function public.admin_request_chat_consent(p_contract uuid, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_c public.haji_contracts; v_r text := trim(coalesce(p_reason, ''));
begin
  if not public.has_perm('complaints') then raise exception 'not allowed'; end if;
  if char_length(v_r) < 5 or char_length(v_r) > 300 then raise exception 'reason needed'; end if;
  select * into v_c from public.haji_contracts where id = p_contract;
  if v_c.id is null then raise exception 'not found'; end if;
  if exists (select 1 from public.chat_consents where contract_id = p_contract
              and (status = 'asked' or (status = 'granted' and expires_at > now()))) then return 'exists'; end if;
  insert into public.chat_consents (contract_id, haji_id, leader_id, requested_by, reason)
  values (p_contract, v_c.haji_id, v_c.leader_id, (select auth.uid()), v_r);
  perform public.notify_user(v_c.haji_id, 'group', 'Travel Adda আপনার অনুমতি চাইছে',
    'বিরোধ মেটাতে লিডারের সাথে আপনার প্রশ্ন-উত্তর দেখার অনুমতি চাওয়া হয়েছে। আপনি রাজি না হলে কেউ দেখবে না।', 'ChatConsent');
  perform public.log_admin('chat_consent_asked', v_c.haji_id, v_c.contract_no || ': ' || left(v_r, 200));
  return 'sent';
end $$;

create or replace function public.admin_chat_consents(p_contract uuid)
returns table (id uuid, status text, reason text, created_at timestamptz, answered_at timestamptz, expires_at timestamptz, active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm('complaints') then raise exception 'not allowed'; end if;
  return query select k.id, k.status, k.reason, k.created_at, k.answered_at, k.expires_at, (k.status = 'granted' and k.expires_at > now())
    from public.chat_consents k where k.contract_id = p_contract order by k.created_at desc limit 20;
end $$;

-- The haji's own open requests and active permissions
create or replace function public.my_chat_consents()
returns table (id uuid, contract_no text, leader_name text, reason text, status text, created_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select k.id, c.contract_no, c.leader_name, k.reason, k.status, k.created_at, k.expires_at
    from public.chat_consents k join public.haji_contracts c on c.id = k.contract_id
   where k.haji_id = (select auth.uid())
     and (k.status = 'asked' or (k.status = 'granted' and k.expires_at > now()))
   order by k.created_at desc limit 20;
$$;

create or replace function public.chat_consent_respond(p_id uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare v_k public.chat_consents;
begin
  select * into v_k from public.chat_consents where id = p_id and haji_id = (select auth.uid()) and status = 'asked';
  if v_k.id is null then return 'not_found'; end if;
  update public.chat_consents set status = case when p_accept then 'granted' else 'declined' end, answered_at = now(),
         expires_at = case when p_accept then now() + interval '7 days' end
   where id = p_id;
  return 'ok';
end $$;

create or replace function public.chat_consent_revoke(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  update public.chat_consents set status = 'revoked', answered_at = now()
   where id = p_id and haji_id = (select auth.uid()) and status = 'granted' and expires_at > now();
  return case when found then 'ok' else 'not_found' end;
end $$;

-- Read the chat (only with an active permission). Every call is logged.
create or replace function public.admin_view_help_chat(p_consent uuid)
returns table (group_name text, sender_role text, sender_name text, body text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_k public.chat_consents;
begin
  if not public.has_perm('complaints') then raise exception 'not allowed'; end if;
  select * into v_k from public.chat_consents where id = p_consent and status = 'granted' and expires_at > now();
  if v_k.id is null then raise exception 'no consent'; end if;
  perform public.log_admin('chat_viewed', v_k.haji_id, (select contract_no from public.haji_contracts where id = v_k.contract_id));
  return query
  select g.name, m.sender_role, coalesce(p.full_name, ''), m.body, m.created_at
    from public.help_threads t join public.groups g on g.id = t.group_id
    join public.help_messages m on m.thread_id = t.id left join public.profiles p on p.id = m.sender_id
   where t.haji_id = v_k.haji_id and g.leader_id = v_k.leader_id
   order by m.created_at
   limit 1000;
end $$;

-- 2) Guide & dua text corrections ---------------------------------------------------------------------------------------
create table if not exists public.content_overrides (
  kind        text not null check (kind in ('guide', 'dua')),
  item_id     text not null check (item_id ~ '^[a-z0-9_-]{1,40}$'),
  path        text not null check (path ~ '^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+){0,7}$' and char_length(path) <= 120),
  body        text not null check (char_length(trim(body)) between 1 and 4000),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (kind, item_id, path)
);
alter table public.content_overrides enable row level security;
revoke all on public.content_overrides from anon, authenticated;
grant select on public.content_overrides to anon, authenticated;
drop policy if exists content_overrides_read on public.content_overrides;
create policy content_overrides_read on public.content_overrides for select to anon, authenticated using (true);

create or replace function public.admin_set_content(p_kind text, p_item text, p_path text, p_body text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_b text := nullif(trim(coalesce(p_body, '')), '');
begin
  if not public.has_perm('admin') then raise exception 'not allowed'; end if;
  if p_kind not in ('guide', 'dua') or p_item !~ '^[a-z0-9_-]{1,40}$'
     or p_path !~ '^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+){0,7}$' or char_length(p_path) > 120 then raise exception 'bad place'; end if;
  if p_body is not null and v_b is null then raise exception 'empty text'; end if;
  if char_length(v_b) > 4000 then raise exception 'too long'; end if;
  if v_b is null then
    delete from public.content_overrides where kind = p_kind and item_id = p_item and path = p_path;
  else
    insert into public.content_overrides (kind, item_id, path, body, updated_by) values (p_kind, p_item, p_path, v_b, (select auth.uid()))
    on conflict (kind, item_id, path) do update set body = excluded.body, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform public.log_admin('content_edit', null, p_kind || '/' || p_item || '/' || p_path || case when v_b is null then ' (আগের লেখায় ফেরত)' else '' end);
  return 'ok';
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_request_chat_consent(uuid, text)', 'public.admin_chat_consents(uuid)', 'public.my_chat_consents()',
    'public.chat_consent_respond(uuid, boolean)', 'public.chat_consent_revoke(uuid)', 'public.admin_view_help_chat(uuid)',
    'public.admin_set_content(text, text, text, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
