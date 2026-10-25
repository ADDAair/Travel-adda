. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 023: admin & staff powers only work in a session that passed 2FA (authenticator code, "aal2").
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 023_admin_mfa 023_admin_mfa; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
# t1 = like t, but the session has only a password (aal1); t0 = no aal claim at all
t1() { exp="$1"; who="$2"; sql="$3"; eval uid=\$$who
  out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -v ON_ERROR_STOP=1 -c "begin; set local role authenticated; set local request.jwt.claim.sub='$uid'; set local request.jwt.claims='{\"aal\":\"$4\"}'; $sql; commit;" 2>&1); rc=$?
  if [ "$exp" = ok ]; then [ $rc = 0 ] && r=1 || r=0; elif [ "$exp" = fail ]; then [ $rc != 0 ] && r=1 || r=0; else [ "$(echo "$out" | tail -1)" = "$exp" ] && r=1 || r=0; fi
  if [ $r = 1 ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/$who/$4] $sql -> $out"; fi; }
# staff S with the payments permission
S=00000000-0000-0000-0000-0000000000c1
$Q "insert into auth.users (id, email, raw_user_meta_data) values ('$S','01710000088@users.traveladda.app','{\"full_name\":\"Staff S\"}')" >/dev/null
$Q "update public.profiles set role='staff' where id='$S'; insert into public.admin_staff (user_id, perms) values ('$S', '{payments}') on conflict (user_id) do update set perms = excluded.perms" >/dev/null

# with 2FA: works
t1 "t" A "select public.is_admin()" aal2
t1 ok A "select public.admin_counts()" aal2
t1 ok S "select count(*) from public.admin_find_contracts('')" aal2
t1 "ok" A "select public.admin_set_setting('helpline_hours', 'সকাল ১০টা – রাত ৮টা')" aal2
# password only: every admin / staff power is refused
t1 "f" A "select public.is_admin()" aal1
t1 fail A "select public.admin_counts()" aal1
t1 fail A "select public.admin_set_setting('helpline_hours', 'হ্যাক')" aal1
t1 fail A "select count(*) from public.admin_find_contracts('')" aal1
t1 fail A "select public.admin_user_detail('$C')" aal1
t1 fail S "select count(*) from public.admin_find_contracts('')" aal1
t1 "" A "select public.admin_stats()" aal1
t1 fail A "select count(*) from public.admin_export('users')" aal1
# the app's menu is empty too until 2FA is done
t1 "0" A "select coalesce(array_length(public.my_perms(), 1), 0)" aal1
t1 "0" S "select coalesce(array_length(public.my_perms(), 1), 0)" aal1
t1 "1" S "select array_length(public.my_perms(), 1)" aal2
# a missing claim is treated as "no 2FA"
t1 "f" A "select public.is_admin()" ""
# the app can ask whether 2FA is still needed (for its own screen)
t1 "true|aal1" A "select (s->>'staff')||'|'||(s->>'aal') from (select public.my_mfa_state() s) x" aal1
t1 "false|aal1" C "select (s->>'staff')||'|'||(s->>'aal') from (select public.my_mfa_state() s) x" aal1
# leaders and hajis are not affected
t1 ok B "select count(*) from public.list_offers('umrah')" aal1
t1 ok C "select count(*) from public.list_leaders(null, null)" aal1
t1 "t" B "select public.is_leader()" aal1
t1 fail anon "select public.my_mfa_state()" aal1
echo "t23: pass=$pass fail=$fail"
