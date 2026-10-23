. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
su() { exp="$1"; out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "$2" 2>&1); if [ "$(echo "$out" | tail -1)" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/su] $2 -> $out"; fi; }
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 015_security; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled"; done
# --- 1) helpers about other people are internal
t fail C "select public.active_referral_leader('$F')"
t fail C "select public.has_accepted_contract('$B','$F')"
t fail C "select public.blocked_between('$B','$F')"
t fail anon "select public.blocked_between('$B','$F')"
# ...while the functions that use them still work
t ok C "select count(*) from public.list_offers('umrah')"
t ok C "select count(*) from public.list_leaders(null, null)"
t ok B "select count(*) from public.my_groups()"
# --- 2) triggers / counters
t fail anon "select public.handle_new_user()"
t fail C "select public.protect_profile_columns()"
t fail C "select nextval('public.haji_code_seq')"
t fail anon "select nextval('public.leader_code_seq')"
su "false|false" "select has_function_privilege('authenticated','public.handle_new_user()','execute')||'|'||has_sequence_privilege('authenticated','public.haji_code_seq','usage')"
# sign-up still makes IDs (trigger runs as the owner)
$Q "insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(),'01910000001@users.traveladda.app','{\"full_name\":\"New Haji\"}')" >/dev/null
su "1" "select count(*) from public.profiles where phone='01910000001' and haji_code like 'TA-%'"
# --- 3) file limits per account
t ok C "insert into storage.objects (bucket_id, name) select 'documents', '$C/d'||g||'.jpg' from generate_series(1,59) g"
t ok C "insert into storage.objects (bucket_id, name) values ('documents', '$C/d60.jpg')"
t fail C "insert into storage.objects (bucket_id, name) values ('documents', '$C/d61.jpg')"
t ok F "insert into storage.objects (bucket_id, name) values ('documents', '$F/d1.jpg')"          # others are not affected
t ok C "insert into storage.objects (bucket_id, name) values ('avatars', '$C/profile.jpg'), ('avatars', '$C/a2.jpg')"
t ok C "insert into storage.objects (bucket_id, name) values ('avatars', '$C/a3.jpg')"
t fail C "insert into storage.objects (bucket_id, name) values ('avatars', '$C/a4.jpg')"
t fail C "insert into storage.objects (bucket_id, name) values ('somebucket', '$C/x.jpg')"
t fail C "insert into storage.objects (bucket_id, name) values ('documents', '$F/evil.jpg')"     # someone else's folder (old rule)
t "0" C "select public.my_file_count('documents') - 60"
t "1" F "select public.my_file_count('documents')"
# user_documents rows: max 60
t ok C "insert into public.user_documents (user_id, doc_type, file_path) select '$C', 'other', '$C/r'||g||'.jpg' from generate_series(1,60) g"
t fail C "insert into public.user_documents (user_id, doc_type, file_path) values ('$C', 'other', '$C/r61.jpg')"
# --- 4) proof stays: complaint evidence and receipts
$Q "insert into storage.objects (bucket_id, name) values ('complaint-evidence', '$C/ev1.jpg'), ('complaint-evidence', '$C/ev2.jpg'), ('receipts', '$C/rc1.jpg')" >/dev/null
# (foreign keys switched off only for this test row: complaints need a full contract)
$Q "set session_replication_role = replica; insert into public.complaint_files (complaint_id, path, kind) values (gen_random_uuid(), '$C/ev1.jpg', 'image')" >/dev/null
$Q "set session_replication_role = replica; insert into public.haji_payments (haji_id, contract_id, amount, method, txn_ref, paid_on, receipt_path) values ('$C', gen_random_uuid(), 100, 'bkash', 'TX123', current_date, '$C/rc1.jpg')" >/dev/null
t "0" C "with x as (delete from storage.objects where bucket_id='complaint-evidence' and name='$C/ev1.jpg' returning 1) select count(*) from x"
t "1" C "with x as (delete from storage.objects where bucket_id='complaint-evidence' and name='$C/ev2.jpg' returning 1) select count(*) from x"   # not attached: own choice
t "1" C "with x as (delete from storage.objects where bucket_id='documents' and name='$C/d60.jpg' returning 1) select count(*) from x"           # normal files still deletable
t "0" C "with x as (update storage.objects set name='$C/ev1b.jpg' where bucket_id='complaint-evidence' and name='$C/ev1.jpg' returning 1) select count(*) from x"
t "0" C "with x as (delete from storage.objects where bucket_id='receipts' and name='$C/rc1.jpg' returning 1) select count(*) from x"
t "0" C "with x as (update storage.objects set owner=null where bucket_id='receipts' and name='$C/rc1.jpg' returning 1) select count(*) from x"
echo "t15: pass=$pass fail=$fail"
