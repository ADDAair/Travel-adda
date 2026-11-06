. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 037 (owner, Nov 2026, English step 6): notices Travel Adda writes by hand (to everyone, to one person, to a group /
# month / district) can also carry an English title and details. A person who chose English sees and hears those;
# everyone else, and every notice without English, stays exactly as before.
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 023_admin_mfa 024_admin_part3 025_readonly_fix 026_admin_part4 027_help_fund 028_fund_access 029_fund_leader 030_group_remove 031_user_counts 032_public_counts 033_contact_email 034_offer_seats 035_account_pause 036_lang; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
for i in 1 2; do $P -f /home/claude/travel-adda/supabase/037_notice_en_admin.sql 2>&1 | grep -v "NOTICE\|skipping"; done   # safe to run twice
see() { r=$($Q "$2"); if [ "$r" = "$1" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$1/db] $2 -> $r"; fi; }
# Phone alerts are caught in a test table instead of being sent.
$Q "create table if not exists public._pushed (n serial, tokens text[], title text, body text); truncate public._pushed;
    create or replace function public.push_send(p_tokens text[], p_title text, p_body text, p_important boolean default false) returns void
    language sql security definer set search_path = '' as 'insert into public._pushed (tokens, title, body) select p_tokens, p_title, p_body where cardinality(p_tokens) > 0'" >/dev/null
H=00000000-0000-0000-0000-0000000000e1; K=00000000-0000-0000-0000-0000000000e2
for u in $H:01711130001 $K:01711130002; do $Q "insert into auth.users (id, email, raw_user_meta_data) values ('${u%%:*}','${u##*:}@users.traveladda.app','{\"full_name\":\"Lang test\"}') on conflict do nothing" >/dev/null; done
$Q "update public.profiles set lang='en' where id='$H'" >/dev/null       # H chose English, K stays Bengali
$Q "insert into public.push_tokens (token, user_id, platform) values ('ExponentPushToken[hhhhhhhhhhhh]', '$H', 'android'), ('ExponentPushToken[kkkkkkkkkkkk]', '$K', 'android') on conflict do nothing" >/dev/null
HC=$($Q "select haji_code from public.profiles where id='$H'"); KC=$($Q "select haji_code from public.profiles where id='$K'")

# --- the English fields: optional, same length limits, only the server writes them
see "4" "select count(*) from information_schema.columns where table_schema='public' and ((table_name='broadcasts' and column_name in ('title_en','body_en')) or (table_name='user_notifications' and column_name in ('title_en','body_en')))"
t fail H "update public.user_notifications set title_en='x' where user_id='$H'"
see "1" "select count(*) from pg_proc where proname='admin_send_notification'"      # the old one is replaced, not doubled
see "1" "select count(*) from pg_proc where proname='admin_notify_segment'"

# --- a notice to everyone, with English
$Q "truncate public._pushed" >/dev/null
t "ok" A "select public.admin_send_notification('all', 'ঈদ মোবারক', 'সবাইকে শুভেচ্ছা', null, false, 'Eid Mubarak', 'Greetings to everyone')"
B1=$($Q "select id from public.broadcasts where title='ঈদ মোবারক' order by created_at desc limit 1")
t "Eid Mubarak|Greetings to everyone" H "select title||'|'||body from public.my_notices_en(array['$B1']::uuid[])"
t "ঈদ মোবারক|সবাইকে শুভেচ্ছা" H "select title||'|'||body from public.my_notifications(100) where id='$B1'"      # the box itself is unchanged
see "{ExponentPushToken[hhhhhhhhhhhh]}|Eid Mubarak|Greetings to everyone" "select tokens::text||'|'||title||'|'||body from public._pushed where title='Eid Mubarak'"
see "t" "select exists (select 1 from public._pushed where title='ঈদ মোবারক' and 'ExponentPushToken[kkkkkkkkkkkk]' = any(tokens) and not 'ExponentPushToken[hhhhhhhhhhhh]' = any(tokens))"

# --- English title only: the details stay as written
t "ok" A "select public.admin_send_notification('all', 'কাল ছুটি', 'অফিস বন্ধ থাকবে', null, false, 'Holiday tomorrow', null)"
B2=$($Q "select id from public.broadcasts where title='কাল ছুটি' order by created_at desc limit 1")
t "Holiday tomorrow|অফিস বন্ধ থাকবে" H "select title||'|'||body from public.my_notices_en(array['$B2']::uuid[])"

# --- without English: exactly as before (old app versions call with five values)
$Q "truncate public._pushed" >/dev/null
t "ok" A "select public.admin_send_notification(p_audience => 'all', p_title => 'শুধু বাংলা', p_body => null, p_target => null, p_important => false)"
B3=$($Q "select id from public.broadcasts where title='শুধু বাংলা' order by created_at desc limit 1")
t "0" H "select count(*) from public.my_notices_en(array['$B3']::uuid[])"
see "1" "select count(*) from public._pushed where title='শুধু বাংলা' and cardinality(tokens) = 2"
t "ok" A "select public.admin_send_notification('all', 'ফাঁকা ইংরেজি', null, null, false, '   ', '  ')"           # spaces = no English
B5=$($Q "select id from public.broadcasts where title='ফাঁকা ইংরেজি'")
see "" "select title_en from public.broadcasts where id='$B5'"
t "0" H "select count(*) from public.my_notices_en(array['$B5']::uuid[])"

# --- never someone else's: a notice for leaders only, or a withdrawn one, gives nothing
t "ok" A "select public.admin_send_notification('leader', 'লিডারদের জন্য', null, null, false, 'For leaders', null)"
B4=$($Q "select id from public.broadcasts where title='লিডারদের জন্য' order by created_at desc limit 1")
t "0" H "select count(*) from public.my_notices_en(array['$B4']::uuid[])"
t "ok" A "select public.admin_withdraw_broadcast('$B1')"
t "0" H "select count(*) from public.my_notices_en(array['$B1']::uuid[])"
t fail anon "select count(*) from public.my_notices_en(array['$B2']::uuid[])"

# --- to one person, with English
$Q "truncate public._pushed" >/dev/null
t "ok" A "select public.admin_send_notification('one', 'আপনার ভিসা হয়েছে', 'অফিসে আসুন', '$HC', false, 'Your visa is ready', 'Please come to the office')"
N1=$($Q "select id from public.user_notifications where user_id='$H' and title='আপনার ভিসা হয়েছে'")
t "Your visa is ready|Please come to the office" H "select title||'|'||body from public.my_notices_en(array['$N1']::uuid[])"
t "0" K "select count(*) from public.my_notices_en(array['$N1']::uuid[])"
see "Your visa is ready|Open the app to see the details" "select title||'|'||body from public._pushed where 'ExponentPushToken[hhhhhhhhhhhh]' = any(tokens)"
t "ok" A "select public.admin_send_notification('one', 'আপনার টিকিট হয়েছে', null, '$KC', false, 'Your ticket is ready', null)"
see "আপনার টিকিট হয়েছে|বিস্তারিত দেখতে অ্যাপ খুলুন" "select title||'|'||body from public._pushed where 'ExponentPushToken[kkkkkkkkkkkk]' = any(tokens)"   # K chose Bengali

# --- the server's own notices still use the rules from 036
N2=$($Q "select public.notify_user('$H', 'contract', 'নতুন চুক্তির অনুরোধ এসেছে', null, 'MyLeader'); select id from public.user_notifications where user_id='$H' and kind='contract' limit 1" | tail -1)
t "New contract request" H "select title from public.my_notices_en(array['$N2']::uuid[])"

# --- limits and permissions
t "ok" A "select public.admin_send_notification('all', 'লম্বা', null, null, false, repeat('x', 300), repeat('y', 3000))"
see "120|1000" "select char_length(title_en)||'|'||char_length(body_en) from public.broadcasts where title='লম্বা'"
t fail H "select public.admin_send_notification('all', 'হাজী পাঠাচ্ছে', null, null, false, 'Haji sends', null)"
t fail anon "select public.admin_send_notification('all', 'কেউ না', null, null, false, 'Nobody', null)"

# --- to a group / month / district, with English
G=$($Q "insert into public.groups (leader_id, name) select '$B', 'Test group 37' returning id" 2>/dev/null | head -1)
if [ -n "$G" ]; then
  $Q "insert into public.group_members (group_id, user_id, status) values ('$G', '$H', 'active'), ('$G', '$K', 'active') on conflict do nothing" >/dev/null
  $Q "truncate public._pushed" >/dev/null
  t "ok:2" A "select public.admin_notify_segment('group', '$G', 'কাল সকালে বাস', 'সকাল ৮টায়', 'Bus tomorrow morning', 'At 8am')"
  S1=$($Q "select id from public.user_notifications where user_id='$H' and title='কাল সকালে বাস'")
  t "Bus tomorrow morning|At 8am" H "select title||'|'||body from public.my_notices_en(array['$S1']::uuid[])"
  see "Bus tomorrow morning" "select title from public._pushed where 'ExponentPushToken[hhhhhhhhhhhh]' = any(tokens)"
  see "কাল সকালে বাস" "select title from public._pushed where 'ExponentPushToken[kkkkkkkkkkkk]' = any(tokens)"
  t "ok:2" A "select public.admin_notify_segment('group', '$G', 'শুধু বাংলায়', null)"            # old app versions
  t "title" A "select public.admin_notify_segment('group', '$G', 'ক', null, 'Too short', null)"
else
  fail=$((fail+1)); echo "FAIL could not make a test group"
fi
echo "t37: pass=$pass fail=$fail"
