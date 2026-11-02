. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 032 (owner, Nov 2026):
#  (2) hajis' Home shows a ROUNDED total ("১২,০০০+ হাজী") only after the admin sets a minimum and the total reaches it;
#      the exact number never leaves the server.
#  (3) a leader sees his OWN numbers: hajis in his groups, his running contracts, call requests this month.
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
$Q "delete from public.app_settings where key='haji_count_min'" >/dev/null 2>&1   # a rerun starts clean (older steps re-check the keys)
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 023_admin_mfa 024_admin_part3 025_readonly_fix 026_admin_part4 027_help_fund 028_fund_access 029_fund_leader 030_group_remove 031_user_counts 032_public_counts 032_public_counts; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
see() { r=$($Q "$2"); if [ "$r" = "$1" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$1/db] $2 -> $r"; fi; }
# ---------- (2) rounding (2 significant figures, always down) ----------
see "0" "select public.round_count(0)"
see "7" "select public.round_count(7)"
see "85" "select public.round_count(85)"
see "870" "select public.round_count(875)"
see "1200" "select public.round_count(1250)"
see "12000" "select public.round_count(12345)"
see "990000" "select public.round_count(999999)"
# no minimum set: nothing is shown to anyone
t "" C "select public.haji_count_public()"
t "" B "select public.haji_count_public()"
t fail anon "select public.haji_count_public()"
# only the admin may set the minimum, and only a sensible whole number
t fail C "select public.admin_set_setting('haji_count_min', '1')"
t fail A "select public.admin_set_setting('haji_count_min', 'many')"
t fail A "select public.admin_set_setting('haji_count_min', '0')"
t fail A "select public.admin_set_setting('haji_count_min', '99999999999')"
# minimum higher than the total: still hidden
t "ok" A "select public.admin_set_setting('haji_count_min', '1000000')"
t "" C "select public.haji_count_public()"
# minimum reached: the rounded total, never the exact one
H=$($Q "select count(*) from public.profiles where account_type = 'haji' and role = 'haji'")
R=$($Q "select public.round_count($H)")
t "ok" A "select public.admin_set_setting('haji_count_min', '1')"
t "$R" C "select public.haji_count_public()"
t "$R" B "select public.haji_count_public()"
# turning it off again
t "ok" A "select public.admin_set_setting('haji_count_min', '')"
t "" C "select public.haji_count_public()"
# other settings still work (no regression)
t "ok" A "select public.admin_set_setting('fund_donate_mode', 'open')"
t "ok" A "select public.admin_set_setting('fund_donate_mode', 'approved')"
# ---------- (3) a leader's own numbers ----------
G=00000000-0000-0000-0000-0000000000e1; G2=00000000-0000-0000-0000-0000000000e2; GD=00000000-0000-0000-0000-0000000000e3
$Q "delete from public.groups where id in ('$G','$G2','$GD')" >/dev/null
$Q "insert into public.groups (id, leader_id, name) values ('$G', '$B', 'দল ক'), ('$G2', '$B', 'দল খ'), ('$GD', '$D', 'দল ঘ')" >/dev/null
# C is in two of B's groups (counted once); F was invited only (not counted); F is in D's group (not B's)
$Q "insert into public.group_members (group_id, user_id, status) values ('$G','$C','active'), ('$G2','$C','active'), ('$G','$F','invited'), ('$GD','$F','active')" >/dev/null
t fail C "select public.leader_my_stats()"
t fail anon "select public.leader_my_stats()"
t "1" B "select public.leader_my_stats()->>'hajis'"
t "1" D "select public.leader_my_stats()->>'hajis'"
CB=$($Q "select count(*) from public.haji_contracts where leader_id='$B' and status='accepted'")
t "$CB" B "select public.leader_my_stats()->>'contracts'"
# call requests this month: for his packages and to him directly; older ones and other leaders' are not counted
$Q "delete from public.offer_interests where leader_id in ('$B','$D') or offer_id in (select id from public.offers where leader_id in ('$B','$D'))" >/dev/null
$Q "insert into public.offer_interests (user_id, leader_id, status) values ('$C', '$B', 'new')" >/dev/null
$Q "insert into public.offer_interests (user_id, leader_id, status, created_at) values ('$F', '$B', 'contacted', now() - interval '40 days')" >/dev/null
$Q "insert into public.offer_interests (user_id, leader_id, status) values ('$F', '$D', 'new')" >/dev/null
t "1" B "select public.leader_my_stats()->>'calls_month'"
t "1" D "select public.leader_my_stats()->>'calls_month'"
# a closed group no longer counts
$Q "update public.groups set active=false where id in ('$G','$G2')" >/dev/null
LEFT=$($Q "select count(distinct m.user_id) from public.group_members m join public.groups g on g.id=m.group_id where g.leader_id='$B' and g.active and m.status='active'")
see "0" "select count(*) from public.group_members m join public.groups g on g.id=m.group_id where g.id in ('$G','$G2') and g.active"
t "$LEFT" B "select public.leader_my_stats()->>'hajis'"
$Q "delete from public.group_members m using public.groups g where g.id=m.group_id and g.leader_id='$B' and g.id not in ('$G','$G2')" >/dev/null
t "0" B "select public.leader_my_stats()->>'hajis'"
echo "t32: pass=$pass fail=$fail"
