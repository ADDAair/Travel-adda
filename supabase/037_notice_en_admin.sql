-- 037 (owner request, Nov 2026, English step 6): notices Travel Adda writes by hand can also carry English.
-- The admin may add an English title (and details) when sending to everyone / hajis / leaders / one person, or to a
-- group / travel month / district. A person who chose English (036) sees that English in the notification box and on
-- the phone alert; everyone else, and every notice without English, stays exactly as before.
-- Safe to run more than once. Needs 009, 011, 026 and 036.

-- 1) The English fields (optional; same limits as the Bengali ones; only the server writes them) -------------------------
alter table public.broadcasts add column if not exists title_en text;
alter table public.broadcasts add column if not exists body_en text;
alter table public.user_notifications add column if not exists title_en text;
alter table public.user_notifications add column if not exists body_en text;
alter table public.broadcasts drop constraint if exists broadcasts_en_len;
alter table public.broadcasts add constraint broadcasts_en_len
  check ((title_en is null or char_length(title_en) between 1 and 120) and (body_en is null or char_length(body_en) <= 1000));
alter table public.user_notifications drop constraint if exists user_notifications_en_len;
alter table public.user_notifications add constraint user_notifications_en_len
  check ((title_en is null or char_length(title_en) between 1 and 120) and (body_en is null or char_length(body_en) <= 1000));
-- (people may still only change read_at on their own notices: 009 grants nothing else)

-- 2) Sending: the same functions, with two optional English values -----------------------------------------------------
-- The old versions are replaced (not kept beside), so old app versions calling with the first values still work.
drop function if exists public.admin_send_notification(text, text, text, text, boolean);
create or replace function public.admin_send_notification(p_audience text, p_title text, p_body text, p_target text default null,
  p_important boolean default false, p_title_en text default null, p_body_en text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_id uuid;
  v_te text := nullif(left(trim(coalesce(p_title_en, '')), 120), '');
  v_be text := case when nullif(trim(coalesce(p_title_en, '')), '') is null then null else nullif(left(trim(coalesce(p_body_en, '')), 1000), '') end;
begin
  if not public.has_perm('notify') then raise exception 'not allowed'; end if;
  if char_length(coalesce(trim(p_title), '')) < 2 then return 'title'; end if;
  if (select count(*) from public.broadcasts where created_by = (select auth.uid()) and created_at > now() - interval '1 hour') >= 20 then return 'too_many'; end if;
  if p_audience = 'one' then
    select id into v_user from public.profiles
     where haji_code = upper(trim(coalesce(p_target, ''))) or phone = trim(coalesce(p_target, '')) limit 1;
    if v_user is null then return 'not_found'; end if;
    insert into public.user_notifications (user_id, kind, title, body, title_en, body_en)
    values (v_user, 'admin', left(trim(p_title), 120), nullif(left(trim(coalesce(p_body, '')), 1000), ''), v_te, v_be)
    returning id into v_id;
    perform public.log_admin('notify_one', v_user, left(p_title, 200));
    return 'ok';
  end if;
  if p_audience not in ('all', 'haji', 'leader') then return 'bad'; end if;
  insert into public.broadcasts (audience, title, body, important, created_by, title_en, body_en)
  values (p_audience, left(trim(p_title), 120), nullif(left(trim(coalesce(p_body, '')), 1000), ''), coalesce(p_important, false), (select auth.uid()), v_te, v_be)
  returning id into v_id;
  perform public.log_admin('notify_' || p_audience, null, left(p_title, 200));
  return 'ok';
end $$;

drop function if exists public.admin_notify_segment(text, text, text, text);
create or replace function public.admin_notify_segment(p_kind text, p_value text, p_title text, p_body text,
  p_title_en text default null, p_body_en text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_n int;
  v_te text := nullif(left(trim(coalesce(p_title_en, '')), 120), '');
  v_be text := case when nullif(trim(coalesce(p_title_en, '')), '') is null then null else nullif(left(trim(coalesce(p_body_en, '')), 1000), '') end;
begin
  if not public.has_perm('notify') then raise exception 'not allowed'; end if;
  perform public.segment_users(p_kind, p_value);        -- checks the kind and value first
  if char_length(trim(coalesce(p_title, ''))) < 2 then return 'title'; end if;
  if (select count(*) from public.admin_audit where actor = (select auth.uid()) and action = 'notify_segment' and at > now() - interval '1 hour') >= 20 then
    return 'too_many'; end if;
  insert into public.user_notifications (user_id, kind, title, body, title_en, body_en)
  select u, 'admin', left(trim(p_title), 120), nullif(left(trim(coalesce(p_body, '')), 1000), ''), v_te, v_be
    from public.segment_users(p_kind, p_value) u limit 20000;
  get diagnostics v_n = row_count;
  perform public.log_admin('notify_segment', null, p_kind || ':' || left(p_value, 40) || ' (' || v_n || ' জন) ' || left(trim(p_title), 120));
  return 'ok:' || v_n;
end $$;

-- 3) The notification box in English: my own notices, and general notices meant for me that have English ---------------
create or replace function public.my_notices_en(p_ids uuid[]) returns table (id uuid, title text, body text)
language sql stable security definer set search_path = '' as $$
  with ids as (select (coalesce(p_ids, '{}'::uuid[]))[1:200] as a)
  select n.id, coalesce(n.title_en, public.notice_to_en(n.title), n.title),
         case when n.title_en is not null then coalesce(n.body_en, n.body) else coalesce(public.notice_to_en(n.body), n.body) end
    from public.user_notifications n, ids
   where n.user_id = (select auth.uid()) and n.id = any (ids.a)
  union all
  select b.id, b.title_en, coalesce(b.body_en, b.body)
    from public.broadcasts b, ids
   where b.id = any (ids.a) and b.title_en is not null and not b.withdrawn
     and (select auth.uid()) is not null and public.in_audience(b.audience, (select auth.uid()));
$$;
revoke all on function public.my_notices_en(uuid[]) from public, anon;
grant execute on function public.my_notices_en(uuid[]) to authenticated;

-- 4) Phone alerts in the person's language -----------------------------------------------------------------------------
create or replace function public.trg_push_user_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v text[];
begin
  if new.title_en is not null and (select lang from public.profiles where id = new.user_id) = 'en' then
    v := array[new.title_en, 'Open the app to see the details'];
  else
    v := public.push_text_for(new.user_id, new.title);
  end if;
  perform public.push_send(array(select t.token from public.push_tokens t join public.profiles p on p.id = t.user_id
                                  where t.user_id = new.user_id and p.status = 'active'),
                           v[1], v[2], false);
  return new;
exception when others then return new;
end $$;

-- A general notice: people who chose English get the English (when there is English), everyone else the Bengali.
create or replace function public.trg_push_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.title_en is null then
    perform public.push_send(array(select t.token from public.push_tokens t where public.in_audience(new.audience, t.user_id)),
                             new.title, new.body, new.important);
  else
    perform public.push_send(array(select t.token from public.push_tokens t join public.profiles p on p.id = t.user_id
                                    where public.in_audience(new.audience, t.user_id) and p.lang is distinct from 'en'),
                             new.title, new.body, new.important);
    perform public.push_send(array(select t.token from public.push_tokens t join public.profiles p on p.id = t.user_id
                                    where public.in_audience(new.audience, t.user_id) and p.lang = 'en'),
                             new.title_en, coalesce(new.body_en, new.body), new.important);
  end if;
  return new;
exception when others then return new;
end $$;
revoke all on function public.trg_push_user_notice() from public, anon, authenticated;
revoke all on function public.trg_push_broadcast() from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array['public.admin_send_notification(text, text, text, text, boolean, text, text)',
    'public.admin_notify_segment(text, text, text, text, text, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
