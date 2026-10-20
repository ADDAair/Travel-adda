. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
su() { exp="$1"; out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "$2" 2>&1); if [ "$(echo "$out" | tail -1)" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/su] $2 -> $out"; fi; }
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create table if not exists net.sent (id bigserial primary key, url text, body jsonb); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as \$\$ insert into net.sent (url, body) values (url, body) returning id \$\$" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 013_scale; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|^psql.*not available\|not scheduled"; done
# --- 1) IDs keep growing past 99999 (before: the 1,00,000th sign-up failed for good)
$Q "select setval('public.haji_code_seq', 99997); select setval('public.leader_code_seq', 99998)" >/dev/null
$Q "insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(),'01810000001@users.traveladda.app','{\"full_name\":\"Haji One\"}'),(gen_random_uuid(),'01810000002@users.traveladda.app','{\"full_name\":\"Haji Two\"}'),(gen_random_uuid(),'01810000003@users.traveladda.app','{\"full_name\":\"Haji Three\"}'),(gen_random_uuid(),'01810000004@users.traveladda.app','{\"full_name\":\"Leader One\",\"account_type\":\"leader\"}'),(gen_random_uuid(),'01810000005@users.traveladda.app','{\"full_name\":\"Leader Two\",\"account_type\":\"leader\"}')" >/dev/null
su "TA-99998,TA-99999,TA-100000" "select string_agg(haji_code, ',' order by phone) from public.profiles where phone in ('01810000001','01810000002','01810000003')"
su "TL-99999,TL-100000" "select string_agg(haji_code, ',' order by phone) from public.profiles where phone in ('01810000004','01810000005')"
su "TA-00042" "select public.fmt_code('TA-', 42, 5)"
su "TC-1234567" "select public.fmt_code('TC-', 1234567, 6)"
t fail C "select public.fmt_code('TA-', 1, 5)"
# --- 2) indexes
su "22" "select count(*) from pg_indexes where schemaname='public' and indexname in ('group_members_by_user','groups_by_leader','contracts_by_group','contract_acc_by_user','user_documents_by_user','haji_payments_by_haji','haji_contracts_by_offer','leader_ratings_by_leader','leader_ratings_by_haji','leader_referrals_by_leader','offers_by_leader','offer_interests_by_user','complaints_by_haji','complaints_by_leader','complaints_by_contract','complaint_files_by_complaint','user_blocks_by_blocked','user_reports_by_reporter','user_reports_by_target','broadcast_reads_by_bc','group_ann_by_creator','admin_audit_by_actor')"
# --- 3) queue off (no pg_cron): alerts go straight out as before
CC=$($Q "select haji_code from public.profiles where id='$C'")
$Q "insert into public.push_tokens (token, user_id) values ('ExponentPushToken[cccccccccccccccccccc]','$C')" >/dev/null
su "f" "select public.push_queue_on()"
t "ok" A "select public.admin_send_notification('one','সরাসরি','x','$CC',false)"
su "1" "select count(*) from net.sent"
su "0" "select count(*) from public.push_outbox"
# --- 4) queue on: a notice to 1,203 phones is queued and leaves 500 per run
$Q "create schema if not exists cron; create table if not exists cron.job (jobid serial, jobname text, active boolean default true); insert into cron.job (jobname) values ('travel-adda-push')" >/dev/null
su "t" "select public.push_queue_on()"
$Q "insert into public.push_tokens (token, user_id) select 'ExponentPushToken[q' || lpad(g::text, 19, '0') || ']', '$C' from generate_series(1, 1202) g" >/dev/null
$Q "delete from net.sent" >/dev/null
t "ok" A "select public.admin_send_notification('all','সবাইকে','x',null,false)"
su "0" "select count(*) from net.sent"
su "1203" "select count(*) from public.push_outbox"
su "703" "select public.push_drain()"
su "5" "select count(*) from net.sent"
su "100,100,100,100,100" "select string_agg(jsonb_array_length(body)::text, ',' order by id) from net.sent"
su "203" "select public.push_drain()"
su "0" "select public.push_drain()"
su "13" "select count(*) from net.sent"
su "1203" "select sum(jsonb_array_length(body)) from net.sent"
su "0" "select public.push_drain()"
# a personal notice also goes through the queue and leaves on the next run
$Q "delete from net.sent" >/dev/null
t "ok" A "select public.admin_send_notification('one','ব্যক্তিগত','গোপন','$CC',false)"
su "1203" "select count(*) from public.push_outbox"
su "0" "select public.push_drain() * 0"
su "0" "select count(*) from net.sent, jsonb_array_elements(body) m where m->>'body' like '%গোপন%'"
# --- 5) Expo says "too many": the batch comes back later; after 3 tries it is dropped
$Q "delete from net.sent; delete from public.push_outbox; delete from public.push_log" >/dev/null
$Q "delete from public.push_tokens where token like 'ExponentPushToken[q%'" >/dev/null
t "ok" A "select public.admin_send_notification('one','আবার চেষ্টা','x','$CC',false)"
su "0" "select public.push_drain()"
RID=$($Q "select max(request_id) from public.push_log")
$Q "insert into net._http_response (id, status_code, content) values ($RID, 429, '{\"errors\":[{\"code\":\"TOO_MANY_REQUESTS\",\"message\":\"x\"}]}')" >/dev/null
su "1" "select public.push_drain()"
su "1" "select count(*) from public.push_outbox where attempts = 1 and send_after > now()"
su "1" "select public.push_drain()"
$Q "update public.push_outbox set send_after = now() - interval '1 second'" >/dev/null
su "0" "select public.push_drain()"
su "1" "select count(*) from public.push_log where attempts = 1"
for k in 2 3; do RID=$($Q "select max(request_id) from public.push_log"); $Q "insert into net._http_response (id, status_code, content) values ($RID, 503, 'down')" >/dev/null; $Q "select public.push_drain()" >/dev/null; $Q "update public.push_outbox set send_after = now() - interval '1 second'" >/dev/null; $Q "select public.push_drain()" >/dev/null; done
su "3" "select max(attempts) from public.push_log"
RID=$($Q "select max(request_id) from public.push_log"); $Q "insert into net._http_response (id, status_code, content) values ($RID, 503, 'down')" >/dev/null
su "0" "select public.push_drain()"
su "0" "select count(*) from public.push_outbox"
# --- 6) uninstalled phones are still removed
t "ok" A "select public.admin_send_notification('one','শেষ','x','$CC',false)"
$Q "select public.push_drain()" >/dev/null
RID=$($Q "select max(request_id) from public.push_log")
$Q "insert into net._http_response (id, status_code, content) values ($RID, 200, '{\"data\":[{\"status\":\"error\",\"details\":{\"error\":\"DeviceNotRegistered\"}}]}')" >/dev/null
$Q "select public.push_drain()" >/dev/null
su "0" "select count(*) from public.push_tokens where user_id='$C'"
# --- 7) nobody can touch the queue from the app
t fail C "select public.push_drain()"
t fail C "select public.push_queue_on()"
t fail C "select public.push_post('[]'::jsonb, 0)"
t fail C "select * from public.push_outbox"
t fail C "insert into public.push_outbox (msg) values ('{}')"
# --- 8) notices still land when sending breaks
$Q "create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language plpgsql as \$\$ begin raise exception 'down'; end \$\$" >/dev/null
$Q "insert into public.push_tokens (token, user_id) values ('ExponentPushToken[cccccccccccccccccccc]','$C')" >/dev/null
t "ok" A "select public.admin_send_notification('one','নেট বন্ধ','x','$CC',false)"
su "-1" "select public.push_drain()"
t "1" C "select count(*) from public.my_notifications(100) where title='নেট বন্ধ'"
echo "pass=$pass fail=$fail"
