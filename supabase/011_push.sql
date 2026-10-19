-- 011: push notifications (the phone shows the notice even when the app is closed). Run AFTER 009 (and 010). Safe to re-run.
--  * Each phone that allows notifications registers its Expo push token here (only through register_push_token()).
--  * Every new notice in the notification box (009) is also sent to that person's phones; a general notice goes to
--    every phone in its audience. Sending uses the pg_net extension and Expo's push service; no secret key is needed.
--  * Lock screen privacy: a personal notice shows only its title ("details: open the app"); general notices show title + short text.
--  * A token belongs to one account: if another account logs in on the same phone, the token moves to that account.
--  * Phones that uninstalled the app are removed automatically (Expo answers "DeviceNotRegistered").
--  * If pg_net is missing, nothing breaks: the notice still lands in the box, only the phone alert is skipped.

do $$ begin
  create extension if not exists pg_net;
exception when others then raise notice 'pg_net not available; push alerts stay off until it is enabled (Database > Extensions > pg_net)';
end $$;

-- 1) Tokens -----------------------------------------------------------------------------------------------------------
create table if not exists public.push_tokens (
  token       text primary key check (token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$'),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  platform    text not null default 'android' check (platform in ('android', 'ios')),
  created_at  timestamptz not null default now(),
  seen_at     timestamptz not null default now()
);
create index if not exists push_tokens_by_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;        -- only through the functions below

-- Which requests carried which tokens (to remove dead tokens from Expo's answer). Kept 2 days.
create table if not exists public.push_log (
  request_id  bigint primary key,
  tokens      text[] not null,
  created_at  timestamptz not null default now()
);
alter table public.push_log enable row level security;
revoke all on public.push_log from anon, authenticated;

create or replace function public.register_push_token(p_token text, p_platform text default 'android') returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$' then return 'bad'; end if;
  insert into public.push_tokens (token, user_id, platform) values (p_token, v_uid, case when p_platform = 'ios' then 'ios' else 'android' end)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, seen_at = now(),
    created_at = case when public.push_tokens.user_id = excluded.user_id then public.push_tokens.created_at else now() end;
  -- at most 5 phones per account (oldest dropped)
  delete from public.push_tokens where user_id = v_uid and token in (
    select token from public.push_tokens where user_id = v_uid order by seen_at desc offset 5);
  return 'ok';
end $$;
create or replace function public.unregister_push_token(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.push_tokens where token = p_token and user_id = (select auth.uid());
  return 'ok';
end $$;
create or replace function public.my_push_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.push_tokens where user_id = (select auth.uid());
$$;
revoke all on function public.register_push_token(text, text) from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
revoke all on function public.my_push_count() from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.my_push_count() to authenticated;

-- 2) Sending ----------------------------------------------------------------------------------------------------------
-- Removes tokens Expo reported as uninstalled, from answers that have arrived. Never throws.
create or replace function public.push_cleanup() returns void
language plpgsql security definer set search_path = '' as $$
declare r record; v_data jsonb; i int;
begin
  for r in select l.request_id, l.tokens, x.content from public.push_log l
             join net._http_response x on x.id = l.request_id order by l.request_id limit 50 loop
    begin
      v_data := (r.content::jsonb) -> 'data';
      if jsonb_typeof(v_data) = 'array' then
        for i in 0 .. jsonb_array_length(v_data) - 1 loop
          if v_data -> i ->> 'status' = 'error' and v_data -> i -> 'details' ->> 'error' = 'DeviceNotRegistered' then
            delete from public.push_tokens where token = r.tokens[i + 1];
          end if;
        end loop;
      end if;
    exception when others then null;
    end;
    delete from public.push_log where request_id = r.request_id;
  end loop;
  delete from public.push_log where created_at < now() - interval '2 days';
exception when others then null;
end $$;

-- Sends one message to many tokens, 100 per request (Expo's limit). Never throws: a phone alert must never stop the real action.
create or replace function public.push_send(p_tokens text[], p_title text, p_body text, p_important boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare v_batch text[]; v_msgs jsonb; v_req bigint; n int; i int := 1;
begin
  if p_tokens is null or cardinality(p_tokens) = 0 then return; end if;
  perform public.push_cleanup();
  n := cardinality(p_tokens);
  while i <= n loop
    v_batch := p_tokens[i : least(i + 99, n)];
    select jsonb_agg(jsonb_build_object(
             'to', t, 'title', left(p_title, 120), 'body', left(coalesce(p_body, ''), 178), 'sound', 'default',
             'priority', 'high', 'channelId', case when p_important then 'important' else 'notices' end,
             'data', jsonb_build_object('route', 'Notifications')))
      into v_msgs from unnest(v_batch) t;
    select net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := v_msgs,
                         headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
                         timeout_milliseconds := 10000) into v_req;
    insert into public.push_log (request_id, tokens) values (v_req, v_batch) on conflict do nothing;
    i := i + 100;
  end loop;
exception when others then null;
end $$;
revoke all on function public.push_cleanup() from public, anon, authenticated;
revoke all on function public.push_send(text[], text, text, boolean) from public, anon, authenticated;

-- A personal notice: only the title on the lock screen.
create or replace function public.trg_push_user_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.push_send(array(select t.token from public.push_tokens t join public.profiles p on p.id = t.user_id
                                  where t.user_id = new.user_id and p.status = 'active'),
                           new.title, 'বিস্তারিত দেখতে অ্যাপ খুলুন', false);
  return new;
exception when others then return new;
end $$;
drop trigger if exists push_user_notice on public.user_notifications;
create trigger push_user_notice after insert on public.user_notifications for each row execute function public.trg_push_user_notice();

-- A general notice: every phone in its audience.
create or replace function public.trg_push_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.push_send(array(select t.token from public.push_tokens t where public.in_audience(new.audience, t.user_id)),
                           new.title, new.body, new.important);
  return new;
exception when others then return new;
end $$;
drop trigger if exists push_broadcast on public.broadcasts;
create trigger push_broadcast after insert on public.broadcasts for each row execute function public.trg_push_broadcast();
revoke all on function public.trg_push_user_notice() from public, anon, authenticated;
revoke all on function public.trg_push_broadcast() from public, anon, authenticated;
