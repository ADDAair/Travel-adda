. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 021 (security audit fixes):
#  1) a rating counts only when Travel Adda has confirmed a payment on that contract (fake accounts can't pump ratings)
#  2) a phone number / ID never tells a leader who the person is: invitations look the same whether or not the
#     account exists, the name appears only after the person agrees; khadems must agree; at most 50 invitations a day
#  3) deleting an account needs a password entered in the last 10 minutes
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 021_audit_fixes; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
su() { exp="$1"; out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "$2" 2>&1); if [ "$(echo "$out" | tail -1)" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/su] $2 -> $out"; fi; }
as_user() { eval uid=\$$1; psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -v ON_ERROR_STOP=1 -c "begin; set local role authenticated; set local request.jwt.claim.sub='$uid'; $2; commit;"; }
K=00000000-0000-0000-0000-0000000000a1
$Q "insert into auth.users (id, email, raw_user_meta_data) values ('$K','01710000077@users.traveladda.app','{\"full_name\":\"Khadem K\"}')" >/dev/null
KC=$($Q "select haji_code from public.profiles where id='$K'")
G=$($Q "insert into public.groups (leader_id, name) values ('$B', 'ওমরাহ দল ক') returning id" | head -1)

# ---------- 1) ratings count only after a confirmed payment ----------
CT=$($Q "insert into public.haji_contracts (leader_id, haji_id, leader_name, leader_code, haji_name, haji_code, kind, title, price_bdt, includes, refund_policy, status) select '$B','$C','Leader B',(select haji_code from public.profiles where id='$B'),'Haji C',(select haji_code from public.profiles where id='$C'),'umrah','চুক্তি',150000,'বিমান','নিয়ম','accepted' returning id" | head -1)
t "ok" C "select public.rate_leader('$CT', 5, 'ভালো')"
t "0|0.0" C "select rating_count||'|'||rating_avg from public.leader_public('$B')"
t "0" C "select coalesce(max(rating_count),0) from public.list_leaders(null, null) where id='$B'"
t "0" C "select count(*) from public.leader_reviews('$B') where kind='rating'"
$Q "insert into public.haji_payments (contract_id, haji_id, amount, method, txn_ref, paid_on, status) values ('$CT','$C',50000,'bank','T123',current_date,'submitted')" >/dev/null
t "0" C "select rating_count from public.leader_public('$B')"
$Q "update public.haji_payments set status='confirmed' where contract_id='$CT'" >/dev/null
t "1|5.0" C "select rating_count||'|'||rating_avg from public.leader_public('$B')"
t "1" C "select count(*) from public.leader_reviews('$B') where kind='rating'"
t "1" C "select rating_count from public.list_leaders(null, null) where id='$B'"
# the helper is internal
t fail C "select public.rating_counts('$CT')"

# ---------- 2) invitations never reveal who owns a number ----------
# khadem: the same answer for an existing number, an unknown number, an existing ID and an unknown ID
t "sent" B "select public.leader_add_khadem('$G', '01710000077')"
t "sent" B "select public.leader_add_khadem('$G', '01719999999')"
t "sent" B "select public.leader_add_khadem('$G', 'TA-99999')"
t "self" B "select public.leader_add_khadem('$G', '01710000002')"
# not a khadem until they agree: the leader sees no name, nobody gets khadem powers
t "0" B "select count(*) from public.group_khadems('$G')"
t "0" K "select count(*) from public.my_khadem_groups()"
t fail K "select count(*) from public.help_inbox('$G')"
# the leader sees only masked hints of what was sent (same for existing and unknown numbers)
t "3" B "select count(*) from public.my_sent_invites('$G')"
t "017••••••77" B "select hint from public.my_sent_invites('$G') where kind='khadem' order by created_at limit 1"
t "0" B "select count(*) from public.my_sent_invites('$G') where hint like '%Khadem%'"
t fail C "select count(*) from public.my_sent_invites('$G')"
t fail D "select count(*) from public.my_sent_invites('$G')"
# the invited person sees the request and can agree
t "1" K "select count(*) from public.my_khadem_invites()"
t "ওমরাহ দল ক|Leader B" K "select group_name||'|'||leader_name from public.my_khadem_invites()"
t "0" C "select count(*) from public.my_khadem_invites()"
t "ok" K "select public.khadem_respond('$G', true)"
t "1" K "select count(*) from public.my_khadem_groups()"
t "Khadem K" B "select full_name from public.group_khadems('$G') where user_id='$K'"
t "1" B "select count(*) from public.user_notifications where user_id='$B' and route='GroupStaff'"
t "not_found" K "select public.khadem_respond('$G', true)"
# declining
$Q "insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a2','01710000078@users.traveladda.app','{\"full_name\":\"Khadem L\"}')" >/dev/null
t "sent" B "select public.leader_add_khadem('$G', '01710000078')"
L2=00000000-0000-0000-0000-0000000000a2
t "ok" L2 "select public.khadem_respond('$G', false)"
t "0" L2 "select count(*) from public.my_khadem_invites()"
t "0" B "select count(*) from public.group_khadems('$G') where full_name='Khadem L'"
# group member invitation: 'sent' for any number, and the member list does not show invited people
t "sent" B "select public.invite_by_phone('$G', '01710000006')"
t "sent" B "select public.invite_by_phone('$G', '01719999998')"
t "0" B "select count(*) from public.group_members_for_leader('$G') where status='invited'"
t "0" B "select count(*) from public.group_members_for_leader('$G') where full_name='Haji F'"
t "1" F "select count(*) from public.my_groups() where status='invited'"
# the leader can cancel a sent invitation (by its hint row), which also removes the pending invitation
INV=$(as_user B "select id from public.my_sent_invites('$G') where kind='member' order by created_at limit 1" | head -1)
t "ok" B "select public.leader_cancel_invite('$INV')"
t "0" F "select count(*) from public.my_groups() where status='invited'"
t "not_found" D "select public.leader_cancel_invite('$INV')"
# at most 50 invitations a day per leader
for i in $(seq 1 44); do as_user B "select public.invite_by_phone('$G', '0171555$(printf '%04d' $i)')" >/dev/null 2>&1; done
t "limit" B "select public.invite_by_phone('$G', '01716660000')"
t "limit" B "select public.leader_add_khadem('$G', '01716660001')"

# ---------- 3) deleting an account needs a fresh password ----------
U=00000000-0000-0000-0000-0000000000b9
$Q "insert into auth.users (id, email, raw_user_meta_data) values ('$U','01710000099@users.traveladda.app','{\"full_name\":\"To Delete\"}')" >/dev/null
del() { psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -v ON_ERROR_STOP=1 -c "begin; set local role authenticated; set local request.jwt.claim.sub='$U'; set local request.jwt.claims='$1'; select public.delete_my_account(); commit;" 2>&1 | tr '\n' ' '; }
NOW=$(date +%s); OLD=$((NOW-3600))
r1=$(del '{}'); r2=$(del "{\"amr\":[{\"method\":\"password\",\"timestamp\":$OLD}]}")
if echo "$r1" | grep -q "password needed" && echo "$r2" | grep -q "password needed"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL old/no password must be refused: $r1 / $r2"; fi
su "1" "select count(*) from auth.users where id='$U'"
r3=$(del "{\"amr\":[{\"method\":\"password\",\"timestamp\":$NOW}]}")
su "0" "select count(*) from auth.users where id='$U'"
echo "t21: pass=$pass fail=$fail"
