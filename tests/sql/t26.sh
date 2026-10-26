. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 026: admin part 4 —
#  1) money alerts: haji's money still due close to travel, leader's share still to pay, trip over but money not closed
#  2) service costs for Travel Adda's own leaders (visa, ticket, hotel ...): per contract or for the whole group,
#     taken off what is paid to the leader; only staff with the payments permission see the details
#  3) work record filtered by staff member / action
#  4) notifications to one group, one travel month, or leaders of one district
#  5) SOS record: a call from the emergency page is noted (with location only if the haji allowed it), staff are told
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 023_admin_mfa 024_admin_part3 025_readonly_fix 026_admin_part4 026_admin_part4; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
su() { exp="$1"; out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "$2" 2>&1); if [ "$(echo "$out" | tail -1)" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/su] $2 -> $out"; fi; }
code() { $Q "select haji_code from public.profiles where id='$1'"; }
BC=$(code $B); CC=$(code $C); DC=$(code $D); FC=$(code $F)
# D is one of Travel Adda's own leaders; B has an own agency
$Q "update public.leader_profiles set leader_kind='travel_adda' where user_id='$D'; update public.leader_profiles set district='ঢাকা' where user_id='$B'" >/dev/null
$Q "insert into public.leader_rates (leader_id, commission_pct) values ('$D', 10) on conflict (leader_id) do update set commission_pct = 10" >/dev/null
mk() { $Q "insert into public.haji_contracts (leader_id, haji_id, leader_name, leader_code, haji_name, haji_code, kind, title, price_bdt, includes, refund_policy, status, travel_from, travel_to, responded_at) values ('$1','$2','L','$3','H','$4','umrah','চুক্তি',$5,'বিমান','নিয়ম','accepted',current_date+$6,current_date+$7,now()) returning id" | head -1; }
CT1=$(mk $B $C $BC $CC 150000 10 20)     # haji still owes 100000, travel in 10 days
CT2=$(mk $D $F $DC $FC 100000 3 13)      # fully paid, leader D's share not paid, travel in 3 days
H3=00000000-0000-0000-0000-0000000000c3   # a haji has only one active contract, so a third haji
$Q "insert into auth.users (id, email, raw_user_meta_data) values ('$H3','01710000090@users.traveladda.app','{\"full_name\":\"Haji H\"}')" >/dev/null
CT3=$(mk $D $H3 $DC $(code $H3) 80000 -20 -5)     # trip over, nothing settled
$Q "insert into public.haji_payments (contract_id, haji_id, amount, method, txn_ref, status) values ('$CT1','$C',50000,'bank','P-1','confirmed'), ('$CT2','$F',100000,'bank','P-2','confirmed')" >/dev/null
S=00000000-0000-0000-0000-0000000000c1; U=00000000-0000-0000-0000-0000000000c2
$Q "insert into auth.users (id, email, raw_user_meta_data) values ('$S','01710000088@users.traveladda.app','{\"full_name\":\"Staff S\"}'), ('$U','01710000089@users.traveladda.app','{\"full_name\":\"Staff U\"}')" >/dev/null
$Q "update public.profiles set role='staff' where id in ('$S','$U'); insert into public.admin_staff (user_id, perms) values ('$S', '{payments}'), ('$U', '{users,notify}')" >/dev/null

# ---------- 1) money alerts ----------
t "haji_due|100000.00" A "select kind||'|'||amount from public.admin_money_alerts() where contract_id='$CT1'"
t "leader_due|90000.00" A "select kind||'|'||amount from public.admin_money_alerts() where contract_id='$CT2'"
t "not_closed" A "select kind from public.admin_money_alerts() where contract_id='$CT3'"
t "3" S "select count(*) from public.admin_money_alerts()"
t fail U "select count(*) from public.admin_money_alerts()"
t fail C "select count(*) from public.admin_money_alerts()"
t "3" A "select public.admin_counts()->>'money_alerts'"
t "" U "select public.admin_counts()->>'money_alerts'"

# ---------- 2) service costs (own leaders only) ----------
t "ok" S "select public.admin_add_service_cost('$D', '$CT2', 'visa', 20000, 'ভিসা ফি')"
t "ok" A "select public.admin_add_service_cost('$D', null, 'ticket', 30000, 'গ্রুপ টিকিট ৪০ জন')"
t "not_own" A "select public.admin_add_service_cost('$B', '$CT1', 'visa', 1000, 'ভিসা ফি')"
t "mismatch" A "select public.admin_add_service_cost('$D', '$CT1', 'visa', 1000, 'অন্য লিডারের চুক্তি')"
t fail A "select public.admin_add_service_cost('$D', null, 'gift', 1000, 'ভুল ধরন')"
t fail A "select public.admin_add_service_cost('$D', null, 'hotel', 0, 'শূন্য টাকা')"
t fail A "select public.admin_add_service_cost('$D', null, 'hotel', 1000, '')"
t fail U "select public.admin_add_service_cost('$D', null, 'hotel', 1000, 'অনুমতি নেই')"
t fail D "select public.admin_add_service_cost('$D', null, 'hotel', 1000, 'লিডার নিজে')"
# contract cost comes off this contract's share
t "70000.00" A "select due_to_leader from public.contract_money('$CT2')"
t "leader_due|70000.00" A "select kind||'|'||amount from public.admin_money_alerts() where contract_id='$CT2'"
# the leader sees only the total, never the cost list
t "70000.00" D "select due_to_leader from public.contract_money('$CT2')"
t fail D "select count(*) from public.service_costs"
t fail D "select count(*) from public.admin_service_costs('$D')"
t "2" A "select count(*) from public.admin_service_costs('$D')"
# whole-group cost comes off the leader's total
t "70000.00|30000.00|40000.00" A "select due_total||'|'||group_costs||'|'||net from public.admin_leader_balance('$D')"
t "over" A "select public.admin_add_payout('$CT2', 'leader', 50000, 'PAY-X', null)"
t "ok" S "select public.admin_add_payout('$CT2', 'leader', 40000, 'PAY-Y', null)"
t "0.00" A "select net from public.admin_leader_balance('$D')"
# a wrong entry can be removed (logged)
SC=$($Q "select id from public.service_costs where kind='ticket'")
t "ok" A "select public.admin_delete_service_cost('$SC', 'ভুল করে দুবার লেখা')"
t fail A "select public.admin_delete_service_cost('$SC', 'ক')"
t "30000.00" A "select net from public.admin_leader_balance('$D')"
t "3" A "select count(*) from public.admin_list_audit() where action like 'service_cost%'"

# ---------- 3) work record by staff member ----------
t "t" A "select bool_and(actor_id='$S') and count(*) >= 2 from public.admin_audit_search('$S', null, 30)"
t "1" A "select count(*) from public.admin_audit_search(null, 'service_cost_deleted', 30)"
t fail S "select count(*) from public.admin_audit_search(null, null, 30)"
t "t" A "select count(*) >= 2 from public.admin_audit_actors()"

# ---------- 4) notifications to a group / month / district ----------
G=$($Q "insert into public.groups (leader_id, name) values ('$B', 'ওমরাহ দল ক') returning id" | head -1)
$Q "insert into public.group_members (group_id, user_id, status, joined_at) values ('$G','$C','active',now())" >/dev/null
t "1" U "select public.admin_segment_size('group', '$G')"
t "ok:1" U "select public.admin_notify_segment('group', '$G', 'দলের জন্য খবর', 'কাল সকাল ৮টায় বাস')"
t "1" C "select count(*) from public.user_notifications where user_id='$C' and title='দলের জন্য খবর'"
t "0" F "select count(*) from public.user_notifications where user_id='$F' and title='দলের জন্য খবর'"
M=$($Q "select to_char(current_date+10, 'YYYY-MM')")
EXP=$($Q "select count(distinct haji_id) from public.haji_contracts where status='accepted' and to_char(travel_from,'YYYY-MM')='$M'")
t "$EXP" U "select public.admin_segment_size('month', '$M')"
t "1" U "select public.admin_segment_size('district', 'ঢাকা')"
t "ok:1" U "select public.admin_notify_segment('district', 'ঢাকা', 'ঢাকার লিডারদের সভা', null)"
t "1" B "select count(*) from public.user_notifications where user_id='$B' and title='ঢাকার লিডারদের সভা'"
t "title" U "select public.admin_notify_segment('group', '$G', 'ক', null)"
t fail U "select public.admin_notify_segment('everyone', 'x', 'সবার জন্য', null)"
t fail U "select public.admin_segment_size('month', '2026-13')"
t fail S "select public.admin_notify_segment('group', '$G', 'অনুমতি নেই', null)"
t fail C "select public.admin_notify_segment('group', '$G', 'হাজী পাঠাচ্ছে', null)"
t "1" A "select count(*) from public.admin_list_audit() where action='notify_segment' and detail like '%district%'"

# ---------- 5) SOS record ----------
t "ok" C "select public.log_sos('997', 'অ্যাম্বুলেন্স', null, null, null)"
t "ok" C "select public.log_sos('911', 'জরুরি', 21.4225, 39.8262, 30)"
t fail C "select public.log_sos('911', 'জরুরি', 200, 39.8, 30)"
t fail C "select public.log_sos('', 'জরুরি', null, null, null)"
t fail anon "select public.log_sos('911', 'জরুরি', null, null, null)"
t fail C "select count(*) from public.sos_events"
t "2" A "select count(*) from public.admin_sos_list(7)"
t "1" U "select count(*) from public.admin_sos_list(7) where lat is not null"
t fail S "select count(*) from public.admin_sos_list(7)"
t "t" A "select count(*) >= 1 from public.user_notifications where user_id='$A' and route='Admin' and title like '%জরুরি%'"
t "t" U "select count(*) >= 1 from public.user_notifications where user_id='$U' and route='Admin'"
t "0" S "select count(*) from public.user_notifications where user_id='$S' and route='Admin' and title like '%জরুরি%'"
# a flood of presses is cut off (20 an hour), the call itself is never blocked by the app
for i in $(seq 1 18); do $Q "select 1" >/dev/null; as=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "begin; set local role authenticated; set local request.jwt.claim.sub='$C'; select public.log_sos('999', 'পুলিশ', null, null, null); commit;" 2>&1); done
t "limit" C "select public.log_sos('999', 'পুলিশ', null, null, null)"
echo "t26: pass=$pass fail=$fail"
