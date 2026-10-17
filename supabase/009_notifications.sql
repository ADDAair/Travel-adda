-- 009: notification box for every account. Run AFTER 008. Safe to re-run.
--  * Travel Adda (admin, or staff with the 'notify' permission) can send a notice to everyone, to all hajis,
--    to all leaders, or to one account (by ID or phone).
--  * The app also puts its own notices there automatically: a new contract, an answer to it, a payment checked,
--    money sent, a leader application decided, a complaint checked, a group invitation or announcement.
--  * Each person sees only their own notices and the general ones meant for them, and can mark them read or remove them.

-- 1) Tables ----------------------------------------------------------------------------------------------------------
create table if not exists public.user_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'info' check (kind in ('info', 'contract', 'payment', 'leader', 'complaint', 'group', 'admin')),
  title       text not null check (char_length(title) between 1 and 120),
  body        text check (body is null or char_length(body) <= 1000),
  route       text check (route is null or route in ('MyLeader', 'LeaderContracts', 'Group', 'Leader', 'Admin', 'Offers', 'Docs', 'Account', 'Home', 'Leaders')),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists user_notifications_by_user on public.user_notifications (user_id, created_at desc);
alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from anon, authenticated;
grant select, delete on public.user_notifications to authenticated;
grant update (read_at) on public.user_notifications to authenticated;
drop policy if exists "un_select_own" on public.user_notifications;
create policy "un_select_own" on public.user_notifications for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "un_update_own" on public.user_notifications;
create policy "un_update_own" on public.user_notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "un_delete_own" on public.user_notifications;
create policy "un_delete_own" on public.user_notifications for delete to authenticated using (user_id = (select auth.uid()));

-- Notices to many people are stored once; who read or removed them is stored per person.
create table if not exists public.broadcasts (
  id          uuid primary key default gen_random_uuid(),
  audience    text not null check (audience in ('all', 'haji', 'leader')),
  title       text not null check (char_length(title) between 1 and 120),
  body        text check (body is null or char_length(body) <= 1000),
  important   boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  withdrawn   boolean not null default false
);
alter table public.broadcasts enable row level security;
revoke all on public.broadcasts from anon, authenticated;          -- read through my_notifications()
create table if not exists public.broadcast_reads (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  broadcast_id  uuid not null references public.broadcasts(id) on delete cascade,
  read_at       timestamptz not null default now(),
  hidden        boolean not null default false,
  primary key (user_id, broadcast_id)
);
alter table public.broadcast_reads enable row level security;
revoke all on public.broadcast_reads from anon, authenticated;

-- 2) Permission 'notify' for staff ---------------------------------------------------------------------------------
alter table public.admin_staff drop constraint if exists admin_staff_perms_check;
alter table public.admin_staff add constraint admin_staff_perms_check
  check (perms <@ array['applications', 'calls', 'offers', 'complaints', 'reports', 'users', 'payments', 'notify']::text[]);
create or replace function public.my_perms() returns text[]
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and status = 'active')
      then array['admin', 'applications', 'calls', 'offers', 'complaints', 'reports', 'users', 'payments', 'notify']
    else coalesce((select s.perms from public.admin_staff s join public.profiles p on p.id = s.user_id
                    where s.user_id = (select auth.uid()) and p.role = 'staff' and p.status = 'active'), '{}'::text[]) end;
$$;

-- 3) Reading ---------------------------------------------------------------------------------------------------------
-- Which group of people a broadcast reaches: 'haji' = haji accounts, 'leader' = approved leaders.
create or replace function public.in_audience(p_audience text, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = p_user and p.status = 'active'
                  and (p_audience = 'all'
                    or (p_audience = 'haji' and p.account_type = 'haji' and p.role = 'haji')
                    or (p_audience = 'leader' and p.role = 'leader')));
$$;
revoke all on function public.in_audience(text, uuid) from public, anon, authenticated;

-- My notices, newest first: my own + general ones meant for me (sent after my account was made, last 120 days).
create or replace function public.my_notifications(p_limit int default 100)
returns table (id uuid, source text, kind text, title text, body text, route text, important boolean, created_at timestamptz, is_read boolean)
language sql stable security definer set search_path = '' as $$
  with me as (select p.id, p.created_at from public.profiles p where p.id = (select auth.uid()))
  select * from (
    select n.id, 'me'::text, n.kind, n.title, n.body, n.route, false, n.created_at, n.read_at is not null
      from public.user_notifications n, me where n.user_id = me.id
    union all
    select b.id, 'all'::text, 'admin'::text, b.title, b.body, null::text, b.important, b.created_at, r.user_id is not null
      from public.broadcasts b cross join me
      left join public.broadcast_reads r on r.broadcast_id = b.id and r.user_id = me.id
     where not b.withdrawn and b.created_at >= me.created_at - interval '3 days' and b.created_at > now() - interval '120 days'
       and coalesce(r.hidden, false) = false and public.in_audience(b.audience, me.id)
  ) x
  order by 8 desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;
create or replace function public.my_unread_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.my_notifications(200) where not is_read;
$$;
create or replace function public.mark_notification(p_id uuid, p_source text, p_hide boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_source = 'me' then
    if p_hide then delete from public.user_notifications where id = p_id and user_id = v_uid;
    else update public.user_notifications set read_at = coalesce(read_at, now()) where id = p_id and user_id = v_uid; end if;
  elsif p_source = 'all' then
    if not exists (select 1 from public.broadcasts where id = p_id and not withdrawn) then return 'not_found'; end if;
    insert into public.broadcast_reads (user_id, broadcast_id, hidden) values (v_uid, p_id, coalesce(p_hide, false))
    on conflict (user_id, broadcast_id) do update set hidden = public.broadcast_reads.hidden or excluded.hidden;
  else
    raise exception 'bad source';
  end if;
  return 'ok';
end $$;
create or replace function public.mark_all_notifications_read() returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  update public.user_notifications set read_at = now() where user_id = v_uid and read_at is null;
  insert into public.broadcast_reads (user_id, broadcast_id)
  select v_uid, n.id from public.my_notifications(200) n where n.source = 'all' and not n.is_read
  on conflict do nothing;
  return 'ok';
end $$;

-- 4) Sending (admin / 'notify' staff) ---------------------------------------------------------------------------------
create or replace function public.notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_route text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return; end if;
  insert into public.user_notifications (user_id, kind, title, body, route) values (p_user, p_kind, left(p_title, 120), left(p_body, 1000), p_route);
exception when others then null;     -- a notice must never stop the real action
end $$;
revoke all on function public.notify_user(uuid, text, text, text, text) from public, anon, authenticated;   -- server use only

create or replace function public.admin_audience_size(p_audience text) returns int
language sql stable security definer set search_path = '' as $$
  select case when public.has_perm('notify') then (select count(*)::int from public.profiles p where public.in_audience(p_audience, p.id)) end;
$$;
create or replace function public.admin_send_notification(p_audience text, p_title text, p_body text, p_target text default null, p_important boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_id uuid;
begin
  if not public.has_perm('notify') then raise exception 'not allowed'; end if;
  if char_length(coalesce(trim(p_title), '')) < 2 then return 'title'; end if;
  if (select count(*) from public.broadcasts where created_by = (select auth.uid()) and created_at > now() - interval '1 hour') >= 20 then return 'too_many'; end if;
  if p_audience = 'one' then
    select id into v_user from public.profiles
     where haji_code = upper(trim(coalesce(p_target, ''))) or phone = trim(coalesce(p_target, '')) limit 1;
    if v_user is null then return 'not_found'; end if;
    insert into public.user_notifications (user_id, kind, title, body) values (v_user, 'admin', left(trim(p_title), 120), nullif(left(trim(coalesce(p_body, '')), 1000), ''))
    returning id into v_id;
    perform public.log_admin('notify_one', v_user, left(p_title, 200));
    return 'ok';
  end if;
  if p_audience not in ('all', 'haji', 'leader') then return 'bad'; end if;
  insert into public.broadcasts (audience, title, body, important, created_by)
  values (p_audience, left(trim(p_title), 120), nullif(left(trim(coalesce(p_body, '')), 1000), ''), coalesce(p_important, false), (select auth.uid()))
  returning id into v_id;
  perform public.log_admin('notify_' || p_audience, null, left(p_title, 200));
  return 'ok';
end $$;
create or replace function public.admin_list_broadcasts()
returns table (id uuid, audience text, title text, body text, important boolean, created_at timestamptz, withdrawn boolean, sender text, reads int)
language sql stable security definer set search_path = '' as $$
  select b.id, b.audience, b.title, b.body, b.important, b.created_at, b.withdrawn, p.full_name,
         (select count(*)::int from public.broadcast_reads r where r.broadcast_id = b.id)
    from public.broadcasts b left join public.profiles p on p.id = b.created_by
   where public.has_perm('notify') order by b.created_at desc limit 100;
$$;
create or replace function public.admin_withdraw_broadcast(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_perm('notify') then raise exception 'not allowed'; end if;
  update public.broadcasts set withdrawn = true where id = p_id and not withdrawn;
  if not found then return 'not_found'; end if;
  perform public.log_admin('notify_withdrawn', null, p_id::text);
  return 'ok';
end $$;

-- 5) Automatic notices ------------------------------------------------------------------------------------------------
create or replace function public.trg_contract_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_user(new.haji_id, 'contract', 'নতুন চুক্তির অনুরোধ এসেছে',
      new.leader_name || ' (' || new.leader_code || ') আপনাকে "' || new.title || '" চুক্তি পাঠিয়েছেন। পড়ে রাজি হলে চুক্তি চালু হবে।', 'MyLeader');
  elsif new.status is distinct from old.status then
    if new.status = 'accepted' then
      perform public.notify_user(new.leader_id, 'contract', 'হাজী চুক্তিতে রাজি হয়েছেন',
        new.haji_name || ' (' || new.haji_code || ') "' || new.title || '" চুক্তিতে রাজি হয়েছেন। চুক্তি নম্বর ' || new.contract_no || '।', 'LeaderContracts');
    elsif new.status = 'declined' then
      perform public.notify_user(new.leader_id, 'contract', 'হাজী চুক্তিতে রাজি হননি', new.haji_name || ' (' || new.haji_code || ') "' || new.title || '" চুক্তি নেননি।', 'LeaderContracts');
    elsif new.status = 'cancelled' then
      if new.cancelled_by = new.haji_id then
        perform public.notify_user(new.leader_id, 'contract', 'হাজী চুক্তি বাতিল করেছেন', 'চুক্তি ' || new.contract_no || '। কারণ: ' || coalesce(new.cancel_reason, ''), 'LeaderContracts');
      else
        perform public.notify_user(new.haji_id, 'contract', 'লিডার চুক্তি বাতিল করেছেন', 'চুক্তি ' || new.contract_no || '। কারণ: ' || coalesce(new.cancel_reason, '') || ' জমা দেওয়া টাকার বিষয়ে Travel Adda হেল্পলাইনে যোগাযোগ করুন।', 'MyLeader');
      end if;
    elsif new.status = 'completed' then
      perform public.notify_user(new.haji_id, 'contract', 'সফর সম্পন্ন হিসেবে চিহ্নিত হয়েছে', 'আপনার অভিজ্ঞতা জানাতে লিডারকে রেটিং দিতে পারেন।', 'MyLeader');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists contract_notify on public.haji_contracts;
create trigger contract_notify after insert or update of status on public.haji_contracts
  for each row execute function public.trg_contract_notify();

create or replace function public.trg_payment_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_c public.haji_contracts;
begin
  if new.status is distinct from old.status then
    select * into v_c from public.haji_contracts where id = new.contract_id;
    if new.status = 'confirmed' then
      perform public.notify_user(new.haji_id, 'payment', 'আপনার টাকা পাওয়া গেছে',
        'Travel Adda আপনার ' || new.amount::text || ' টাকা (লেনদেন নম্বর ' || new.txn_ref || ') নিশ্চিত করেছে।', 'MyLeader');
      perform public.notify_user(v_c.leader_id, 'payment', 'হাজীর টাকা নিশ্চিত হয়েছে',
        v_c.haji_name || ' (' || v_c.haji_code || ')-এর ' || new.amount::text || ' টাকা Travel Adda পেয়েছে। চুক্তি ' || v_c.contract_no || '।', 'LeaderContracts');
    elsif new.status = 'rejected' then
      perform public.notify_user(new.haji_id, 'payment', 'টাকার জমা মেলেনি',
        'লেনদেন নম্বর ' || new.txn_ref || '। কারণ: ' || coalesce(new.admin_note, '') || ' প্রয়োজনে হেল্পলাইনে যোগাযোগ করুন।', 'MyLeader');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists payment_notify on public.haji_payments;
create trigger payment_notify after update of status on public.haji_payments
  for each row execute function public.trg_payment_notify();

create or replace function public.trg_payout_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_c public.haji_contracts;
begin
  select * into v_c from public.haji_contracts where id = new.contract_id;
  if new.payee = 'leader' then
    perform public.notify_user(v_c.leader_id, 'payment', 'Travel Adda আপনাকে টাকা পাঠিয়েছে',
      new.amount::text || ' টাকা, লেনদেন নম্বর ' || new.txn_ref || '। চুক্তি ' || v_c.contract_no || '।', 'LeaderContracts');
  else
    perform public.notify_user(v_c.haji_id, 'payment', 'Travel Adda আপনাকে টাকা ফেরত পাঠিয়েছে',
      new.amount::text || ' টাকা, লেনদেন নম্বর ' || new.txn_ref || '। চুক্তি ' || v_c.contract_no || '।', 'MyLeader');
  end if;
  return new;
end $$;
drop trigger if exists payout_notify on public.payouts;
create trigger payout_notify after insert on public.payouts
  for each row execute function public.trg_payout_notify();

create or replace function public.trg_application_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform public.notify_user(new.user_id, 'leader',
      case when new.status = 'approved' then 'অভিনন্দন! আপনি এখন যাচাই করা গ্রুপ লিডার' else 'লিডার নিবন্ধন অনুমোদন হয়নি' end,
      case when new.status = 'approved' then 'লিডার তালিকায় আপনাকে দেখা যাবে। এখন প্যাকেজ দিতে ও হাজীদের চুক্তি পাঠাতে পারবেন।'
           else coalesce('অ্যাডমিনের নোট: ' || new.admin_note, 'সঠিক তথ্য দিয়ে আবার চেষ্টা করুন।') end, 'Leader');
  end if;
  return new;
end $$;
drop trigger if exists application_notify on public.leader_applications;
create trigger application_notify after update of status on public.leader_applications
  for each row execute function public.trg_application_notify();

create or replace function public.trg_complaint_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status and new.status in ('verified', 'rejected') then
    perform public.notify_user(new.haji_id, 'complaint',
      case when new.status = 'verified' then 'আপনার অভিযোগ যাচাই হয়েছে' else 'আপনার অভিযোগের প্রমাণ পাওয়া যায়নি' end,
      coalesce('অ্যাডমিনের নোট: ' || new.admin_note, null), 'MyLeader');
    if new.status = 'verified' then
      perform public.notify_user(new.leader_id, 'complaint', 'আপনার বিরুদ্ধে একটি অভিযোগ যাচাই হয়েছে',
        'অভিযোগটি আপনার প্রোফাইলে দেখা যাবে। কিছু জানাতে চাইলে Travel Adda হেল্পলাইনে যোগাযোগ করুন।', 'Leader');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists complaint_notify on public.complaints;
create trigger complaint_notify after update of status on public.complaints
  for each row execute function public.trg_complaint_notify();

create or replace function public.trg_referral_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_user(new.leader_id, 'leader', 'একজন হাজী আপনার রেফারেল কোডে যুক্ত হয়েছেন', 'নিশ্চিত করতে "চুক্তি ও রেফারেল হাজী" পাতা খুলুন।', 'LeaderContracts');
  elsif new.status is distinct from old.status and new.status in ('confirmed', 'rejected') then
    perform public.notify_user(new.haji_id, 'leader',
      case when new.status = 'confirmed' then 'লিডার আপনার রেফারেল নিশ্চিত করেছেন' else 'লিডার রেফারেল নিশ্চিত করেননি' end, null, 'MyLeader');
  end if;
  return new;
end $$;
drop trigger if exists referral_notify on public.leader_referrals;
create trigger referral_notify after insert or update of status on public.leader_referrals
  for each row execute function public.trg_referral_notify();

create or replace function public.trg_member_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_g public.groups;
begin
  if new.status = 'invited' and (tg_op = 'INSERT' or old.status is distinct from 'invited') then
    select * into v_g from public.groups where id = new.group_id;
    perform public.notify_user(new.user_id, 'group', 'দলে যোগ দেওয়ার আমন্ত্রণ', '"' || v_g.name || '" দলে আপনাকে আমন্ত্রণ জানানো হয়েছে।', 'Group');
  end if;
  return new;
end $$;
drop trigger if exists member_notify on public.group_members;
create trigger member_notify after insert or update of status on public.group_members
  for each row execute function public.trg_member_notify();

create or replace function public.trg_announcement_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  select name into v_name from public.groups where id = new.group_id;
  insert into public.user_notifications (user_id, kind, title, body, route)
  select m.user_id, 'group', '📢 ' || left(coalesce(v_name, 'দল'), 60) || ': লিডারের ঘোষণা', left(new.body, 1000), 'Group'
    from public.group_members m where m.group_id = new.group_id and m.status = 'active';
  return new;
exception when others then return new;
end $$;
drop trigger if exists announcement_notify on public.group_announcements;
create trigger announcement_notify after insert on public.group_announcements
  for each row execute function public.trg_announcement_notify();

-- Trigger functions are never called directly.
do $$
declare f text;
begin
  foreach f in array array['public.trg_contract_notify()', 'public.trg_payment_notify()', 'public.trg_payout_notify()', 'public.trg_application_notify()',
                           'public.trg_complaint_notify()', 'public.trg_referral_notify()', 'public.trg_member_notify()', 'public.trg_announcement_notify()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.my_perms()', 'public.my_notifications(int)', 'public.my_unread_count()', 'public.mark_notification(uuid, text, boolean)',
                           'public.mark_all_notifications_read()', 'public.admin_audience_size(text)', 'public.admin_send_notification(text, text, text, text, boolean)',
                           'public.admin_list_broadcasts()', 'public.admin_withdraw_broadcast(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
