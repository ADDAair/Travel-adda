. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
su() { exp="$1"; out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "$2" 2>&1); if [ "$(echo "$out" | tail -1)" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/su] $2 -> $out"; fi; }
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 018_khadem_help; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
# K = a khadem (normal account); G = leader B's group; C = haji member of G; F = haji outside G; D = another leader
K=00000000-0000-0000-0000-0000000000a1
$Q "insert into auth.users (id, email, raw_user_meta_data) values ('$K','01710000077@users.traveladda.app','{\"full_name\":\"Khadem K\"}')" >/dev/null
KC=$($Q "select haji_code from public.profiles where id='$K'")
G=$($Q "insert into public.groups (leader_id, name) values ('$B', 'ওমরাহ দল ক') returning id" | head -1)
$Q "insert into public.group_members (group_id, user_id, status, joined_at) values ('$G', '$C', 'active', now())" >/dev/null
GD=$($Q "insert into public.groups (leader_id, name) values ('$D', 'অন্য দল') returning id" | head -1)

# --- 1) the leader adds khadems by ID or mobile number
t "ok" B "select public.leader_add_khadem('$G', '$KC')"
t "already" B "select public.leader_add_khadem('$G', '01710000077')"
t "not_found" B "select public.leader_add_khadem('$G', 'TA-99999')"
t "self" B "select public.leader_add_khadem('$G', '01710000002')"
t fail C "select public.leader_add_khadem('$G', '$KC')"
t fail D "select public.leader_add_khadem('$G', '$KC')"
t fail K "select public.leader_add_khadem('$G', '01710000006')"
t fail C "insert into public.group_staff (group_id, user_id) values ('$G', '$C')"
# at most 10 khadems per group
for i in 1 2 3 4 5 6 7 8 9; do $Q "insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(),'0171000010$i@users.traveladda.app','{\"full_name\":\"Khadem $i\"}')" >/dev/null; t "ok" B "select public.leader_add_khadem('$G', '0171000010$i')"; done
$Q "insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(),'01710000200@users.traveladda.app','{\"full_name\":\"Khadem 11\"}')" >/dev/null
t "limit" B "select public.leader_add_khadem('$G', '01710000200')"
K9=$($Q "select id from public.profiles where phone='01710000109'")
t "ok" B "select public.leader_remove_khadem('$G', '$K9')"
t "not_found" B "select public.leader_remove_khadem('$G', '$K9')"
t "not_found" B "select public.leader_remove_khadem('$G', '$F')"
# a suspended account cannot become a khadem
$Q "update public.profiles set status='suspended' where phone='01710000200'" >/dev/null
t "not_found" B "select public.leader_add_khadem('$G', '01710000200')"

# --- 2) who sees the khadems: the leader, the khadems and the group's members — nobody else
t "Khadem K" C "select full_name from public.group_khadems('$G') where user_id='$K'"
t "0" F "select count(*) from public.group_khadems('$G')"
t "9" K "select count(*) from public.group_khadems('$G')"
t "1" K "select count(*) from public.my_khadem_groups()"
t "0" C "select count(*) from public.my_khadem_groups()"
# khadem's phone only for members with an accepted contract with the leader
t "" C "select coalesce(phone,'') from public.group_khadems('$G') where user_id='$K'"

# --- 3) the khadem sees the group's hajis; the phone only after the haji's contract with the leader is accepted
t "Haji C|" K "select full_name||'|'||coalesce(phone,'') from public.khadem_group_members('$G') where user_id='$C'"
t "0" F "select count(*) from public.khadem_group_members('$G')"
t "0" K "select count(*) from public.khadem_group_members('$GD')"
$Q "set session_replication_role = replica; insert into public.haji_contracts (leader_id, haji_id, leader_name, leader_code, haji_name, haji_code, kind, title, price_bdt, includes, refund_policy, status) values ('$B', '$C', 'Leader B', 'TL-1', 'Haji C', 'TA-3', 'umrah', 'ওমরাহ চুক্তি', 100000, 'সব', 'নিয়ম অনুযায়ী', 'accepted')" >/dev/null 2>&1 || echo "(contract insert needs columns)"
t "Haji C|01710000003" K "select full_name||'|'||coalesce(phone,'') from public.khadem_group_members('$G') where user_id='$C'"
t "01710000077" C "select coalesce(phone,'') from public.group_khadems('$G') where user_id='$K'"
# no direct table reading
t fail C "select count(*) from public.group_staff"
t fail F "select count(*) from public.group_staff"

# --- 4) help chat: each haji's own private conversation with the leader and khadems
t fail F "select public.help_send('$G', 'আমি দলে নেই কিন্তু লিখছি')"
t fail C "select public.help_send('$G', ' ')"
t fail C "select public.help_send('$G', '$(printf 'ক%.0s' $(seq 1 1001))')"
t ok C "select public.help_send('$G', 'আমার রুমের চাবি কাজ করছে না')"
t "1" C "select count(*) from public.help_my_messages('$G')"
t "0" F "select count(*) from public.help_my_messages('$G')"
t "1|Haji C|true" B "select count(*) over ()||'|'||haji_name||'|'||last_from_haji from public.help_inbox('$G')"
t "Haji C" K "select haji_name from public.help_inbox('$G')"
t fail D "select count(*) from public.help_inbox('$G')"
t fail C "select count(*) from public.help_inbox('$G')"
TH=$($Q "select id from public.help_threads where group_id='$G' and haji_id='$C'")
t ok K "select public.help_reply('$TH', 'রিসেপশনে বলেছি, ১০ মিনিটে ঠিক হবে')"
t fail F "select public.help_reply('$TH', 'হ্যাক')"
t fail D "select public.help_reply('$TH', 'হ্যাক')"
t fail C "select public.help_reply('$TH', 'নিজেই উত্তর')"
t "haji|khadem" C "select string_agg(sender_role, '|' order by created_at) from public.help_my_messages('$G')"
t "Khadem K" C "select sender_name from public.help_my_messages('$G') where sender_role='khadem'"
t "2" B "select count(*) from public.help_thread('$TH')"
t fail F "select count(*) from public.help_thread('$TH')"
# nobody reads the chat tables directly
t fail C "select count(*) from public.help_messages"
t fail B "select count(*) from public.help_threads"
t fail C "insert into public.help_messages (thread_id, sender_id, body) values ('$TH', '$C', 'x')"
# notices: the leader and khadems learn about the question; the haji about the answer
su "1" "select count(*) from public.user_notifications where user_id='$B' and kind='group' and route='HelpInbox'"
su "1" "select count(*) from public.user_notifications where user_id='$K' and kind='group' and route='HelpInbox'"
su "1" "select count(*) from public.user_notifications where user_id='$C' and kind='group' and route='HelpChat'"
# closing / reopening by staff
t ok B "select public.help_set_status('$TH', 'closed')"
t "closed" K "select status from public.help_inbox('$G')"
t ok C "select public.help_send('$G', 'আবার সমস্যা')"
t "open" B "select status from public.help_inbox('$G')"
t fail C "select public.help_set_status('$TH', 'closed')"
# too many messages in an hour are refused (spam)
for i in $(seq 1 18); do $Q "set local role authenticated; set local request.jwt.claim.sub='$C'; select public.help_send('$G', 'বার্তা $i')" >/dev/null 2>&1; done
t fail C "select public.help_send('$G', 'একুশ নম্বর বার্তা')"
# a removed khadem loses access immediately
t ok B "select public.leader_remove_khadem('$G', '$K')"
t fail K "select count(*) from public.help_inbox('$G')"
t fail K "select public.help_reply('$TH', 'এখনো আছি?')"
t "0" K "select count(*) from public.khadem_group_members('$G')"
# a haji who left the group cannot write
$Q "update public.group_members set status='left' where group_id='$G' and user_id='$C'" >/dev/null
$Q "delete from public.help_messages where sender_id='$C' and created_at > now() - interval '1 hour'" >/dev/null
t fail C "select public.help_send('$G', 'দল ছেড়ে দিয়েছি')"
$Q "update public.group_members set status='active' where group_id='$G' and user_id='$C'" >/dev/null

# --- 5) ready answers (FAQ): written by the leader, read by members and khadems
t ok B "select public.leader_faq_save('$G', null, 'হোটেল কোথায়?', 'মক্কা: হোটেল আল-সাফা, হারাম থেকে ৩০০ মিটার')"
t "হোটেল কোথায়?" C "select question from public.faq_list('$G')"
t "0" F "select count(*) from public.faq_list('$G')"
t fail C "select public.leader_faq_save('$G', null, 'ভুয়া প্রশ্ন', 'ভুয়া উত্তর')"
t fail D "select public.leader_faq_save('$G', null, 'ভুয়া প্রশ্ন', 'ভুয়া উত্তর')"
t fail B "select public.leader_faq_save('$G', null, 'ক', 'উত্তর')"
FQ=$($Q "select id from public.group_faq where group_id='$G' limit 1")
t ok B "select public.leader_faq_save('$G', '$FQ', 'হোটেল কোথায় আছে?', 'হোটেল আল-সাফা')"
t "হোটেল কোথায় আছে?" C "select question from public.faq_list('$G')"
t fail D "select public.leader_faq_delete('$FQ')"
t ok B "select public.leader_faq_delete('$FQ')"
t "0" C "select count(*) from public.faq_list('$G')"
t fail C "select count(*) from public.group_faq"
# functions are not open to people who are not logged in
t fail anon "select count(*) from public.help_inbox('$G')"
t fail anon "select count(*) from public.faq_list('$G')"
echo "t18: pass=$pass fail=$fail"
