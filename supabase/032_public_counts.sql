-- 032 (owner, Nov 2026). Run after 031. Safe to run more than once.
--  (2) Hajis' Home can show "১২,০০০+ হাজী Travel Adda ব্যবহার করছেন". It stays hidden until the admin sets a minimum
--      (setting haji_count_min) and the total reaches it. Only a ROUNDED number (2 figures, always down) leaves the
--      server, never the exact one.
--  (3) A leader sees his OWN numbers on the leader panel: hajis in his open groups, running contracts, call requests
--      this month. Nothing about other leaders.

-- ---------- (2) ----------
create or replace function public.round_count(n bigint) returns bigint
language sql immutable set search_path = '' as $$
  select case when n < 100 then greatest(n, 0)
              else (n / (10 ^ (length(n::text) - 2))::bigint) * (10 ^ (length(n::text) - 2))::bigint end;
$$;

alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check
  check (key in ('helpline_phone', 'helpline_hours', 'otp_live', 'pay_bank', 'pay_bkash', 'min_app_version', 'store_url',
                 'fund_bank', 'fund_bkash', 'fund_donate_mode', 'haji_count_min'));

-- Settings (027, 028) + the minimum for showing the total to hajis (admin only, a whole number 1 … 100,000,000).
create or replace function public.admin_set_setting(p_key text, p_value text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('helpline_phone', 'helpline_hours', 'otp_live', 'pay_bank', 'pay_bkash', 'min_app_version', 'store_url', 'fund_bank', 'fund_bkash', 'fund_donate_mode', 'haji_count_min') then raise exception 'bad key'; end if;
  if p_value is null or trim(p_value) = '' then
    delete from public.app_settings where key = p_key;
  else
    if p_key = 'helpline_phone' and trim(p_value) !~ '^\+?[0-9]{6,15}$' then raise exception 'bad phone'; end if;
    if p_key = 'otp_live' and trim(p_value) <> 'yes' then raise exception 'bad value'; end if;
    if p_key = 'min_app_version' and trim(p_value) !~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' then raise exception 'bad version'; end if;
    if p_key = 'store_url' and trim(p_value) !~ '^https://[^[:space:]]+$' then raise exception 'bad url'; end if;
    if p_key = 'fund_donate_mode' and trim(p_value) not in ('open', 'closed', 'approved') then raise exception 'bad value'; end if;
    if p_key = 'haji_count_min' and (trim(p_value) !~ '^[0-9]{1,9}$' or trim(p_value)::bigint < 1 or trim(p_value)::bigint > 100000000) then raise exception 'bad value'; end if;
    insert into public.app_settings (key, value) values (p_key, left(trim(p_value), 400))
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  perform public.log_admin('setting_' || p_key, null, left(p_value, 200));
  return 'ok';
end $$;

-- For any signed-in person: the rounded total, or null while it is hidden.
create or replace function public.haji_count_public() returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare v_min bigint; v_n bigint;
begin
  if (select auth.uid()) is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select nullif(value, '')::bigint into v_min from public.app_settings where key = 'haji_count_min';
  if v_min is null then return null; end if;
  select count(*) into v_n from public.profiles where account_type = 'haji' and role = 'haji';
  if v_n < v_min then return null; end if;
  return public.round_count(v_n);
end $$;

-- ---------- (3) ----------
create or replace function public.leader_my_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if not public.is_leader() then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'hajis', (select count(distinct m.user_id) from public.group_members m join public.groups g on g.id = m.group_id
               where g.leader_id = me and g.active and m.status = 'active'),
    'contracts', (select count(*) from public.haji_contracts where leader_id = me and status = 'accepted'),
    'calls_month', (select count(*) from public.offer_interests i left join public.offers o on o.id = i.offer_id
                     where (i.leader_id = me or o.leader_id = me) and i.created_at >= date_trunc('month', now())));
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_set_setting(text, text)', 'public.haji_count_public()', 'public.leader_my_stats()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function public.round_count(bigint) from public, anon;
grant execute on function public.round_count(bigint) to authenticated;

notify pgrst, 'reload schema';
