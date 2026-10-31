. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 028: giving to the help fund needs Travel Adda's permission (owner rule, Oct 2026). The admin sets one of three modes:
#   open (everyone may give, except IDs that were blocked), closed (nobody), approved (only IDs that were allowed; default).
# The admin finds a person by ID / phone / name and turns them on or off. A person without permission can ask for it.
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 023_admin_mfa 024_admin_part3 025_readonly_fix 026_admin_part4 027_help_fund 028_fund_access 028_fund_access; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
S=00000000-0000-0000-0000-0000000000c1   # staff with payments
$Q "insert into auth.users (id, email, raw_user_meta_data) values ('$S','01710000088@users.traveladda.app','{\"full_name\":\"Staff S\"}')" >/dev/null
$Q "update public.profiles set role='staff' where id='$S'; insert into public.admin_staff (user_id, perms) values ('$S', '{payments}')" >/dev/null
CC=$($Q "select haji_code from public.profiles where id='$C'")
give() { t "$1" $2 "select public.donate_fund(500, 'bkash', 'TX-$3', current_date, false)"; }

# default: only allowed IDs may give
t "approved|none|false" C "select (a->>'mode')||'|'||(a->>'status')||'|'||(a->>'can') from (select public.my_donate_access() a) x"
give "not_allowed" C 1
# asking for permission
t "requested" C "select public.request_donate_access()"
t "already" C "select public.request_donate_access()"
t "1" A "select count(*) from public.user_notifications where user_id='$A' and title like '%দানের অনুমতি%'"
t "requested" A "select status from public.admin_donor_access('$CC')"
t "1" A "select count(*) from public.admin_donor_access(null) where status='requested'"
# only admin / staff with payments may turn someone on or off
t fail C "select public.admin_set_donor_access('$C', 'allowed', null)"
t fail B "select count(*) from public.admin_donor_access(null)"
t "ok" S "select public.admin_set_donor_access('$C', 'allowed', 'ফোনে কথা হয়েছে')"
t fail S "select public.admin_set_donor_access('$C', 'maybe', null)"
t "1" C "select count(*) from public.user_notifications where user_id='$C' and route='Fund'"
t "approved|allowed|true" C "select (a->>'mode')||'|'||(a->>'status')||'|'||(a->>'can') from (select public.my_donate_access() a) x"
give "ok" C 2
t "allowed" C "select public.request_donate_access()"
# search by ID, phone and name
t "1" A "select count(*) from public.admin_donor_access('$CC')"
t "1" A "select count(*) from public.admin_donor_access('01710000003')"
t "1" A "select count(*) from public.admin_donor_access('Haji C')"
# blocked person can't give
t "ok" A "select public.admin_set_donor_access('$C', 'blocked', 'ভুয়া লেনদেন নম্বর দিয়েছেন')"
give "not_allowed" C 3
t "blocked" C "select public.request_donate_access()"
# fund payment details (027) can really be saved now
t "ok" A "select public.admin_set_setting('fund_bkash', '01710000000 (পার্সোনাল)')"
t "ok" A "select public.admin_set_setting('fund_bank', 'ব্যাংক: পরীক্ষা')"
# open: everyone except blocked
t fail S "select public.admin_set_setting('fund_donate_mode', 'open')"
t fail A "select public.admin_set_setting('fund_donate_mode', 'everyone')"
t "ok" A "select public.admin_set_setting('fund_donate_mode', 'open')"
give "ok" F 4
give "not_allowed" C 5
t "open|none|true" F "select (a->>'mode')||'|'||(a->>'status')||'|'||(a->>'can') from (select public.my_donate_access() a) x"
# closed: nobody, not even allowed IDs
t "ok" A "select public.admin_set_donor_access('$C', 'allowed', null)"
t "ok" A "select public.admin_set_setting('fund_donate_mode', 'closed')"
give "not_allowed" C 6
give "not_allowed" F 7
t "closed" F "select public.request_donate_access()"
t "closed|allowed|false" C "select (a->>'mode')||'|'||(a->>'status')||'|'||(a->>'can') from (select public.my_donate_access() a) x"
# remove a person's setting
t "ok" A "select public.admin_set_setting('fund_donate_mode', 'approved')"
t "ok" A "select public.admin_set_donor_access('$C', null, null)"
t "none" C "select public.my_donate_access()->>'status'"
t "limit" C "select public.request_donate_access()"
t "0" A "select count(*) from public.admin_donor_access(null) where user_id='$C'"
t "0" A "select count(*) from public.admin_donor_access('ha')"
N=${CC#TA-}; t "1" A "select count(*) from public.admin_donor_access('$((10#$N))')"
t "1" A "select count(*) from public.admin_donor_access('ta$N')"
t "1" A "select count(*) from public.admin_donor_access('+8801710000003')"
t "0" A "select count(*) from public.admin_donor_access('%%%')"
# the access table is closed; everything is in the work record
t fail C "select count(*) from public.fund_donor_access"
t fail C "insert into public.fund_donor_access (user_id, status) values ('$C', 'allowed')"
t "t" A "select count(*) >= 4 from public.admin_list_audit() where action like 'donor_access%'"
t "t" A "select count(*) >= 3 from public.admin_list_audit() where action = 'setting_fund_donate_mode'"
t fail anon "select public.my_donate_access()"
# admin menu count
$Q "insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000c4','01710000091@users.traveladda.app','{\"full_name\":\"Donor X\"}')" >/dev/null
X=00000000-0000-0000-0000-0000000000c4
t "requested" X "select public.request_donate_access()"
t "1" A "select public.admin_counts()->>'donor_requests'"   # X only (C was cleared)
echo "t28: pass=$pass fail=$fail"
