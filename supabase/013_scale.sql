-- 013: ready for 1 lakh+ users. Run AFTER 012. Safe to re-run.
--  * BUG FIX: IDs were made with lpad(number, 5), which CUTS numbers longer than 5 digits. The 1,00,000th haji would have
--    got "TA-10000" (already used by the 10,000th), and from then on every new sign-up would fail.
--    Now IDs keep at least 5 digits and grow when needed: TA-00042, TA-99999, TA-100000, TA-1234567 (old IDs do not change).
--    Same for leader IDs (TL-) and contract numbers (TC-, 6 digits).

create or replace function public.fmt_code(p_prefix text, p_n bigint, p_width int) returns text
language sql immutable set search_path = '' as $$
  select p_prefix || lpad(p_n::text, greatest(p_width, length(p_n::text)), '0');
$$;
revoke all on function public.fmt_code(text, bigint, int) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_phone text := split_part(new.email, '@', 1);
        v_leader boolean := coalesce(new.raw_user_meta_data->>'account_type', '') = 'leader';
begin
  insert into public.profiles (id, role, account_type, haji_code, full_name, phone)
  values (new.id, 'haji', case when v_leader then 'leader' else 'haji' end,
          case when v_leader then public.fmt_code('TL-', nextval('public.leader_code_seq'), 5)
               else public.fmt_code('TA-', nextval('public.haji_code_seq'), 5) end,
          trim(coalesce(new.raw_user_meta_data->>'full_name', '')), v_phone);
  return new;
end $$;

alter table public.haji_contracts alter column contract_no set default public.fmt_code('TC-', nextval('public.contract_no_seq'), 6);

-- 2) Indexes for "everything of one person / one leader" -------------------------------------------------------------
-- Measured with 1 lakh hajis: "my groups" took 10.7 ms because every member row was read; with the index < 1 ms.
-- They also keep "delete my account" fast (each linked table is checked through these).
create index if not exists group_members_by_user      on public.group_members (user_id);
create index if not exists groups_by_leader            on public.groups (leader_id);
create index if not exists contracts_by_group          on public.contracts (group_id);
create index if not exists contract_acc_by_user        on public.contract_acceptances (user_id);
create index if not exists user_documents_by_user      on public.user_documents (user_id);
create index if not exists haji_payments_by_haji       on public.haji_payments (haji_id);
create index if not exists haji_contracts_by_offer     on public.haji_contracts (offer_id);
create index if not exists leader_ratings_by_leader    on public.leader_ratings (leader_id);
create index if not exists leader_ratings_by_haji      on public.leader_ratings (haji_id);
create index if not exists leader_referrals_by_leader  on public.leader_referrals (leader_id);
create index if not exists offers_by_leader            on public.offers (leader_id);
create index if not exists offer_interests_by_user     on public.offer_interests (user_id);
create index if not exists complaints_by_haji          on public.complaints (haji_id);
create index if not exists complaints_by_leader        on public.complaints (leader_id);
create index if not exists complaints_by_contract      on public.complaints (contract_id);
create index if not exists complaint_files_by_complaint on public.complaint_files (complaint_id);
create index if not exists user_blocks_by_blocked      on public.user_blocks (blocked);
create index if not exists user_reports_by_reporter    on public.user_reports (reporter);
create index if not exists user_reports_by_target      on public.user_reports (target);
create index if not exists broadcast_reads_by_bc       on public.broadcast_reads (broadcast_id);
create index if not exists group_ann_by_creator        on public.group_announcements (created_by);
create index if not exists admin_audit_by_actor        on public.admin_audit (actor);

-- 3) Phone alerts for many people: a queue that sends 500 per second ---------------------------------------------------
-- Expo accepts at most 600 notifications per second per project; a notice to 1 lakh people sent at once would mostly fail.
-- With the queue a notice to everyone reaches 1 lakh phones in about 3–4 minutes. A personal notice goes out within ~1 second.
-- The queue is used only when its 1-second job exists (pg_cron); otherwise sending stays as in 011.
create table if not exists public.push_outbox (
  id          bigserial primary key,
  msg         jsonb not null,
  attempts    int not null default 0,
  send_after  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists push_outbox_due on public.push_outbox (send_after, id);
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;
alter table public.push_log add column if not exists msgs jsonb;
alter table public.push_log add column if not exists attempts int not null default 0;

create or replace function public.push_queue_on() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v boolean;
begin
  execute 'select exists (select 1 from cron.job where jobname = ''travel-adda-push'' and active)' into v;
  return coalesce(v, false);
exception when others then return false;      -- pg_cron not installed
end $$;

-- Sends one batch (max 100 messages) and remembers it, so dead phones can be removed and refused batches retried.
create or replace function public.push_post(p_msgs jsonb, p_attempts int) returns void
language plpgsql security definer set search_path = '' as $$
declare v_req bigint;
begin
  select net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := p_msgs,
                       headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
                       timeout_milliseconds := 10000) into v_req;
  insert into public.push_log (request_id, tokens, msgs, attempts)
  values (v_req, array(select m ->> 'to' from jsonb_array_elements(p_msgs) m), p_msgs, p_attempts)
  on conflict do nothing;
end $$;

-- Reads Expo's answers: removes uninstalled phones; puts refused or failed batches back in the queue (max 3 tries).
create or replace function public.push_cleanup() returns void
language plpgsql security definer set search_path = '' as $$
declare r record; v_body jsonb; v_data jsonb; i int; v_retry boolean;
begin
  for r in select l.request_id, l.tokens, l.msgs, l.attempts, x.status_code, x.content
             from public.push_log l join net._http_response x on x.id = l.request_id
            order by l.request_id limit 100 loop
    begin
      v_retry := r.status_code is null or r.status_code = 429 or r.status_code >= 500;
      begin v_body := r.content::jsonb; exception when others then v_body := null; end;
      if v_body ? 'errors' and v_body::text like '%TOO_MANY_REQUESTS%' then v_retry := true; end if;
      v_data := v_body -> 'data';
      if not v_retry and jsonb_typeof(v_data) = 'array' then
        for i in 0 .. jsonb_array_length(v_data) - 1 loop
          if v_data -> i ->> 'status' = 'error' then
            if v_data -> i -> 'details' ->> 'error' = 'DeviceNotRegistered' then
              delete from public.push_tokens where token = r.tokens[i + 1];
            elsif v_data -> i -> 'details' ->> 'error' = 'MessageRateExceeded' and r.msgs is not null and r.attempts < 3 and public.push_queue_on() then
              insert into public.push_outbox (msg, attempts, send_after) values (r.msgs -> i, r.attempts + 1, now() + interval '30 seconds');
            end if;
          end if;
        end loop;
      end if;
      if v_retry and r.msgs is not null and r.attempts < 3 and public.push_queue_on() then
        insert into public.push_outbox (msg, attempts, send_after)
        select m, r.attempts + 1, now() + (r.attempts + 1) * interval '15 seconds' from jsonb_array_elements(r.msgs) m;
      end if;
    exception when others then null;
    end;
    delete from public.push_log where request_id = r.request_id;
  end loop;
  delete from public.push_log where created_at < now() - interval '2 days';
  delete from public.push_outbox where created_at < now() - interval '1 day';      -- never send day-old alerts
exception when others then null;
end $$;

-- Messages for many phones: into the queue when it runs, otherwise straight out (as in 011).
create or replace function public.push_send(p_tokens text[], p_title text, p_body text, p_important boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare v_msgs jsonb; n int; i int := 1;
begin
  if p_tokens is null or cardinality(p_tokens) = 0 then return; end if;
  if public.push_queue_on() then
    insert into public.push_outbox (msg)
    select jsonb_build_object('to', t, 'title', left(p_title, 120), 'body', left(coalesce(p_body, ''), 178), 'sound', 'default',
                              'priority', 'high', 'channelId', case when p_important then 'important' else 'notices' end,
                              'data', jsonb_build_object('route', 'Notifications'))
      from unnest(p_tokens) t;
    return;
  end if;
  perform public.push_cleanup();
  n := cardinality(p_tokens);
  while i <= n loop
    select jsonb_agg(jsonb_build_object(
             'to', t, 'title', left(p_title, 120), 'body', left(coalesce(p_body, ''), 178), 'sound', 'default',
             'priority', 'high', 'channelId', case when p_important then 'important' else 'notices' end,
             'data', jsonb_build_object('route', 'Notifications')))
      into v_msgs from unnest(p_tokens[i : least(i + 99, n)]) t;
    perform public.push_post(v_msgs, 0);
    i := i + 100;
  end loop;
exception when others then null;
end $$;

-- Runs every second: up to 5 batches = 500 messages (under Expo's 600 per second).
create or replace function public.push_drain() returns int
language plpgsql security definer set search_path = '' as $$
declare v_rows jsonb; v_n int := 0; b int;
begin
  perform public.push_cleanup();
  for b in 1 .. 5 loop
    with picked as (
      select id from public.push_outbox where send_after <= now() order by send_after, id limit 100 for update skip locked
    ), gone as (
      delete from public.push_outbox o using picked where o.id = picked.id returning o.msg, o.attempts
    )
    select jsonb_agg(msg), coalesce(max(attempts), 0) into v_rows, v_n from gone;
    exit when v_rows is null;
    perform public.push_post(v_rows, v_n);
  end loop;
  return (select count(*)::int from public.push_outbox);
exception when others then return -1;
end $$;
revoke all on function public.push_queue_on() from public, anon, authenticated;
revoke all on function public.push_post(jsonb, int) from public, anon, authenticated;
revoke all on function public.push_cleanup() from public, anon, authenticated;
revoke all on function public.push_send(text[], text, text, boolean) from public, anon, authenticated;
revoke all on function public.push_drain() from public, anon, authenticated;

-- The 1-second job, and a nightly clean-up of the job history. Needs pg_cron (Supabase: Integrations > Cron).
do $$ begin
  create extension if not exists pg_cron;
exception when others then raise notice 'pg_cron not available: phone alerts are sent directly (fine for small groups)';
end $$;
do $$ begin
  perform cron.schedule('travel-adda-push', '1 seconds', 'select public.push_drain()');
  perform cron.schedule('travel-adda-cron-history', '17 21 * * *', $c$delete from cron.job_run_details where end_time < now() - interval '2 days'$c$);
exception when others then raise notice 'push queue not scheduled (%): alerts are sent directly', sqlerrm;
end $$;
