. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 036 (owner, Nov 2026, English step 5): the server's own notices and phone alerts in the language each person chose.
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 023_admin_mfa 024_admin_part3 025_readonly_fix 026_admin_part4 027_help_fund 028_fund_access 029_fund_leader 030_group_remove 031_user_counts 032_public_counts 033_contact_email 034_offer_seats 035_account_pause; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
for i in 1 2; do $P -f /home/claude/travel-adda/supabase/036_lang.sql 2>&1 | grep -v "NOTICE\|skipping"; done   # safe to run twice
see() { r=$($Q "$2"); if [ "$r" = "$1" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$1/db] $2 -> $r"; fi; }
H=00000000-0000-0000-0000-0000000000d1; L=00000000-0000-0000-0000-0000000000d2
for u in $H:01711120001 $L:01711120002; do $Q "insert into auth.users (id, email, raw_user_meta_data) values ('${u%%:*}','${u##*:}@users.traveladda.app','{\"full_name\":\"Lang test\"}') on conflict do nothing" >/dev/null; done

# --- the language column: Bengali by default, only set_my_lang() changes it
see "bn" "select lang from public.profiles where id='$H'"
t fail H "update public.profiles set lang='en' where id='$H'"
t fail anon "select public.set_my_lang('en')"
t "bad" H "select public.set_my_lang('xx')"
t "bad" H "select public.set_my_lang(null)"
t "ok" H "select public.set_my_lang('en')"
see "en" "select lang from public.profiles where id='$H'"
see "bn" "select lang from public.profiles where id='$L'"
t fail H "insert into public.profiles (id, lang) values (gen_random_uuid(), 'en')"
see "1" "select count(*) from pg_constraint where conname='profiles_lang_check'"

# --- the rules are for the server only
t fail H "select count(*) from public.notice_en"
t fail H "select public.notice_to_en('নতুন চুক্তির অনুরোধ এসেছে')"
t fail H "select public.push_text_for('$H', 'x')"
see "t" "select relrowsecurity from pg_class where relname='notice_en'"

# --- each kind of server notice, built exactly as the server builds it
en() { see "$1" "select coalesce(public.notice_to_en($2), 'NULL')"; }
en "New contract request" "'নতুন চুক্তির অনুরোধ এসেছে'"
en 'Karim (TL-00012) sent you the contract "Hajj 2027 (standard)". Read it; the contract starts when you agree.' "'Karim' || ' (' || 'TL-00012' || ') আপনাকে \"' || 'Hajj 2027 (standard)' || '\" চুক্তি পাঠিয়েছেন। পড়ে রাজি হলে চুক্তি চালু হবে।'"
en 'রহিম (TA-00042) agreed to the contract "Umrah". Contract no. C-0007.' "'রহিম' || ' (' || 'TA-00042' || ') \"' || 'Umrah' || '\" চুক্তিতে রাজি হয়েছেন। চুক্তি নম্বর ' || 'C-0007' || '।'"
en 'Contract C-0007. Reason: visa late For money already paid, contact the Travel Adda helpline.' "'চুক্তি ' || 'C-0007' || '। কারণ: ' || 'visa late' || ' জমা দেওয়া টাকার বিষয়ে Travel Adda হেল্পলাইনে যোগাযোগ করুন।'"
en 'Contract C-0007. Reason: ব্যক্তিগত' "'চুক্তি ' || 'C-0007' || '। কারণ: ' || coalesce('ব্যক্তিগত', '')"
en 'Travel Adda has confirmed your Tk 50000 (transaction no. 9A7B).' "'Travel Adda আপনার ' || 50000::text || ' টাকা (লেনদেন নম্বর ' || '9A7B' || ') নিশ্চিত করেছে।'"
en 'Travel Adda received Tk 50000 from Rahim (TA-1). Contract C-1.' "'Rahim' || ' (' || 'TA-1' || ')-এর ' || 50000::text || ' টাকা Travel Adda পেয়েছে। চুক্তি ' || 'C-1' || '।'"
en 'Transaction no. 9A7B. Reason: wrong amount Contact the helpline if needed.' "'লেনদেন নম্বর ' || '9A7B' || '। কারণ: ' || coalesce('wrong amount', '') || ' প্রয়োজনে হেল্পলাইনে যোগাযোগ করুন।'"
en 'Tk 20000, transaction no. P-5. Contract C-1.' "20000::text || ' টাকা, লেনদেন নম্বর ' || 'P-5' || '। চুক্তি ' || 'C-1' || '।'"
en "Admin's note: licence unclear" "coalesce('অ্যাডমিনের নোট: ' || 'licence unclear', null)"
en 'You have been invited to the group "Hajj 2027".' "'\"' || 'Hajj 2027' || '\" দলে আপনাকে আমন্ত্রণ জানানো হয়েছে।'"
en "📢 Hajj 2027: leader's announcement" "'📢 ' || left(coalesce('Hajj 2027', 'দল'), 60) || ': লিডারের ঘোষণা'"
en "📢 Group: leader's announcement" "'📢 ' || left(coalesce(null, 'দল'), 60) || ': লিডারের ঘোষণা'"
en 'New question: a haji' "'নতুন প্রশ্ন: ' || coalesce(null, 'হাজী')"
en 'New question: Karim' "'নতুন প্রশ্ন: ' || coalesce('Karim', 'হাজী')"
en 'A khadem answered your question' "case when 'khadem' = 'leader' then 'লিডার' else 'খাদেম' end || ' আপনার প্রশ্নের উত্তর দিয়েছেন'"
en 'Someone agreed to be a khadem of the group "Hajj 2027"' "coalesce(null, 'একজন') || ' \"' || 'Hajj 2027' || '\" দলের খাদেম হতে রাজি হয়েছেন'"
en 'Karim agreed to be a khadem of the group "Hajj 2027"' "coalesce('Karim', 'একজন') || ' \"' || 'Hajj 2027' || '\" দলের খাদেম হতে রাজি হয়েছেন'"
en 'Package approved: Umrah 15 days' "'প্যাকেজ অনুমোদন হয়েছে: ' || left('Umrah 15 days', 60)"
en 'Reason: hotel distance missing. Fix it and submit again.' "'কারণ: ' || left('hotel distance missing', 300) || '। ঠিক করে আবার জমা দিন।'"
en '🆘 Emergency: a haji called 997' "left('🆘 জরুরি: ' || coalesce(null, 'একজন হাজী') || ' ' || '997' || '-এ ফোন করেছেন', 120)"
en '🆘 Emergency: Karim Uddin called 911' "left('🆘 জরুরি: ' || coalesce('Karim Uddin', 'একজন হাজী') || ' ' || '911' || '-এ ফোন করেছেন', 120)"
en 'Your gift has been added to the fund. May Allah accept it.' "'আপনার দান তহবিলে জমা হয়েছে। আল্লাহ কবুল করুন।'"
en 'NULL' "'একটি নতুন অজানা বার্তা'"                  # no rule: stays Bengali (null here)
en 'Hello' "'Hello'"                                     # already English
en 'NULL' "null::text"

# --- every rule's pattern is valid and gives text without Bengali (except names kept from the notice)
see "0" "select count(*) from public.notice_en where en ~ '[ঀ-৿]'"
see "0" "select count(*) from public.notice_en where is_re and not (bn like '^%' and bn like '%\$')"

# --- the notification box: my own notices in English, never another person's
N=$($Q "select public.notify_user('$H', 'contract', 'নতুন চুক্তির অনুরোধ এসেছে', 'Karim (TL-1) আপনাকে \"Umrah\" চুক্তি পাঠিয়েছেন। পড়ে রাজি হলে চুক্তি চালু হবে।', 'MyLeader'); select id from public.user_notifications where user_id='$H' order by created_at desc limit 1" | tail -1)
N2=$($Q "select public.notify_user('$H', 'info', 'একটি নতুন অজানা বার্তা', null, null); select id from public.user_notifications where user_id='$H' and kind='info' order by created_at desc limit 1" | tail -1)
t "New contract request|Karim (TL-1) sent you the contract \"Umrah\". Read it; the contract starts when you agree." H "select title||'|'||body from public.my_notices_en(array['$N']::uuid[])"
t "একটি নতুন অজানা বার্তা|" H "select title||'|'||coalesce(body,'') from public.my_notices_en(array['$N2']::uuid[])"
t "0" L "select count(*) from public.my_notices_en(array['$N','$N2']::uuid[])"
t fail anon "select count(*) from public.my_notices_en(array['$N']::uuid[])"
t "0" H "select count(*) from public.my_notices_en(null)"
see "নতুন চুক্তির অনুরোধ এসেছে" "select title from public.user_notifications where id='$N'"   # the Bengali notice itself is unchanged

# --- phone alerts: English for a person who chose English, Bengali for the others
see "New contract request|Open the app to see the details" "select array_to_string(public.push_text_for('$H', 'নতুন চুক্তির অনুরোধ এসেছে'), '|')"
see "একটি নতুন অজানা বার্তা|Open the app to see the details" "select array_to_string(public.push_text_for('$H', 'একটি নতুন অজানা বার্তা'), '|')"
see "নতুন চুক্তির অনুরোধ এসেছে|বিস্তারিত দেখতে অ্যাপ খুলুন" "select array_to_string(public.push_text_for('$L', 'নতুন চুক্তির অনুরোধ এসেছে'), '|')"
see "1" "select count(*) from pg_trigger where tgname='push_user_notice'"
t "ok" H "select public.set_my_lang('bn')"
see "নতুন চুক্তির অনুরোধ এসেছে|বিস্তারিত দেখতে অ্যাপ খুলুন" "select array_to_string(public.push_text_for('$H', 'নতুন চুক্তির অনুরোধ এসেছে'), '|')"
echo "t36: pass=$pass fail=$fail"
