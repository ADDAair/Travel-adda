. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 031: the admin "ব্যবহারকারী" tab shows, in short, how many hajis have registered and how many group leaders there are
# (owner, Nov 2026). Only the admin and staff with the "users" permission may see the numbers.
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 023_admin_mfa 024_admin_part3 025_readonly_fix 026_admin_part4 027_help_fund 028_fund_access 029_fund_leader 030_group_remove 031_user_counts 031_user_counts; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
see() { r=$($Q "$2"); if [ "$r" = "$1" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$1/db] $2 -> $r"; fi; }
SU=00000000-0000-0000-0000-0000000000d1   # staff with the users permission
SP=00000000-0000-0000-0000-0000000000d2   # staff without it
$Q "insert into auth.users (id, email, raw_user_meta_data) values ('$SU','01710000091@users.traveladda.app','{\"full_name\":\"Staff U\"}'), ('$SP','01710000092@users.traveladda.app','{\"full_name\":\"Staff P\"}') on conflict do nothing" >/dev/null
$Q "update public.profiles set role='staff' where id in ('$SU','$SP'); insert into public.admin_staff (user_id, perms) values ('$SU', '{users}'), ('$SP', '{payments}') on conflict (user_id) do update set perms = excluded.perms" >/dev/null
NEWH=00000000-0000-0000-0000-0000000000d3
$Q "delete from public.profiles where id='$NEWH'; delete from auth.users where id='$NEWH'" >/dev/null   # a rerun starts clean
HAJIS="select count(*) from public.profiles where account_type = 'haji' and role = 'haji'"
LEADERS="select count(*) from public.profiles where role = 'leader' and status = 'active'"
PEND="select count(*) from public.leader_applications where status = 'pending'"
H=$($Q "$HAJIS"); L=$($Q "$LEADERS"); W=$($Q "$PEND")
# who may see
t fail C "select public.admin_user_counts()"
t fail B "select public.admin_user_counts()"
t fail SP "select public.admin_user_counts()"
t fail anon "select public.admin_user_counts()"
# the numbers are right
t "$H" A "select (public.admin_user_counts()->>'hajis')"
t "$L" A "select (public.admin_user_counts()->>'leaders')"
t "$W" A "select (public.admin_user_counts()->>'leaders_pending')"
t "$H" SU "select (public.admin_user_counts()->>'hajis')"
# a new haji is counted at once; staff and the admin are never counted as hajis
$Q "insert into auth.users (id, email, raw_user_meta_data) values ('$NEWH','01710000093@users.traveladda.app','{\"full_name\":\"New Haji\"}') on conflict do nothing" >/dev/null
see "1" "select count(*) from public.profiles where id='$NEWH' and account_type='haji' and role='haji'"
t "$((H+1))" A "select (public.admin_user_counts()->>'hajis')"
see "0" "select count(*) from public.profiles where id in ('$SU','$SP','$A') and account_type='haji' and role='haji'"
# a suspended leader is not counted as a working leader
$Q "update public.profiles set status='suspended' where id='$D'" >/dev/null
t "$((L-1))" A "select (public.admin_user_counts()->>'leaders')"
$Q "update public.profiles set status='active' where id='$D'" >/dev/null
echo "t31: pass=$pass fail=$fail"
