. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 027: Hajj & Umrah help fund (sadaqah only). People who cannot afford it apply; Travel Adda checks by phone and
# approves; donors give into ONE common fund (Travel Adda confirms the money arrived); everyone sees the total and every
# spending; each donor sees their own gifts; names are shown only when the person agreed.
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 023_admin_mfa 024_admin_part3 025_readonly_fix 026_admin_part4 027_help_fund 027_help_fund; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
su() { exp="$1"; out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "$2" 2>&1); if [ "$(echo "$out" | tail -1)" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/su] $2 -> $out"; fi; }
as_user() { eval uid=\$$1; psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -v ON_ERROR_STOP=1 -c "begin; set local role authenticated; set local request.jwt.claim.sub='$uid'; set local request.jwt.claims='{\"aal\":\"aal2\"}'; $2; commit;"; }
S=00000000-0000-0000-0000-0000000000c1   # staff with the payments permission only
$Q "insert into auth.users (id, email, raw_user_meta_data) values ('$S','01710000088@users.traveladda.app','{\"full_name\":\"Staff S\"}')" >/dev/null
$Q "update public.profiles set role='staff' where id='$S'; insert into public.admin_staff (user_id, perms) values ('$S', '{payments}')" >/dev/null
$Q "update public.profiles set full_name='রহিম উদ্দিন' where id='$C'; update public.profiles set full_name='করিম মিয়া' where id='$F'" >/dev/null

# ---------- applying ----------
t fail C "select public.apply_help('umrah', 65, 'নোয়াখালী', 'কৃষক', 'ছোট', false, 'ইমাম সাহেব', '01712345678', false)"
t fail C "select public.apply_help('umrah', 65, 'নোয়াখালী', 'কৃষক', 'আমার ওমরাহ করার খুব ইচ্ছা কিন্তু টাকা নেই', false, 'ইমাম সাহেব', '017123', false)"
t fail C "select public.apply_help('visit', 65, 'নোয়াখালী', 'কৃষক', 'আমার ওমরাহ করার খুব ইচ্ছা কিন্তু টাকা নেই', false, 'ইমাম সাহেব', '01712345678', false)"
t fail C "select public.apply_help('umrah', 12, 'নোয়াখালী', 'কৃষক', 'আমার ওমরাহ করার খুব ইচ্ছা কিন্তু টাকা নেই', false, 'ইমাম সাহেব', '01712345678', false)"
t "ok" C "select public.apply_help('umrah', 65, 'নোয়াখালী', 'কৃষক', 'আমার ওমরাহ করার খুব ইচ্ছা কিন্তু টাকা নেই', false, 'ইমাম সাহেব', '01712345678', false)"
t "exists" C "select public.apply_help('hajj', 65, 'নোয়াখালী', 'কৃষক', 'আবার আবেদন করার চেষ্টা করছি এখানে', false, 'ইমাম সাহেব', '01712345678', false)"
t "pending" C "select status from public.my_help_application()"
t "ok" F "select public.apply_help('hajj', 70, 'ঢাকা', 'অবসরপ্রাপ্ত শিক্ষক', 'সারা জীবন হজের স্বপ্ন দেখেছি, সামর্থ্য হয়নি', false, 'ইউপি সদস্য', '01812345678', true)"
# the tables are closed; others can't see a pending application
t fail C "select count(*) from public.help_applications"
t "0" C "select jsonb_array_length(public.fund_summary()->'waiting')"
# ---------- admin decides (users permission or admin; staff with only payments can't) ----------
CA=$($Q "select id from public.help_applications where user_id='$C'"); FA=$($Q "select id from public.help_applications where user_id='$F'")
t fail S "select count(*) from public.admin_help_applications('pending')"
t fail C "select public.admin_decide_help('$CA', 'approve', null)"
t "2" A "select count(*) from public.admin_help_applications('pending')"
t "01712345678" A "select reference_phone from public.admin_help_applications('pending') where id='$CA'"
t fail A "select public.admin_decide_help('$CA', 'reject', 'ক')"
t "ok" A "select public.admin_decide_help('$CA', 'approve', 'ফোনে কথা হয়েছে, সত্যি')"
t "ok" A "select public.admin_decide_help('$FA', 'approve', null)"
t "not_pending" A "select public.admin_decide_help('$CA', 'approve', null)"
t "1" C "select count(*) from public.user_notifications where user_id='$C' and route='Fund'"
# public list: no name unless agreed; never phone or reason
t "2" B "select jsonb_array_length(public.fund_summary()->'waiting')"
t "1" B "select count(*) from jsonb_array_elements(public.fund_summary()->'waiting') w where w->>'name' is null and w->>'district' = 'নোয়াখালী' and (w->>'age')::int = 65"
t "করিম মিয়া" B "select w->>'name' from jsonb_array_elements(public.fund_summary()->'waiting') w where w->>'kind' = 'hajj'"
t "0" B "select count(*) from jsonb_array_elements(public.fund_summary()->'waiting') w where w::text like '%01712345678%' or w::text like '%ইচ্ছা%' or w::text like '%রহিম%'"
t "0" anon "select jsonb_array_length(public.fund_summary()->'waiting')"
# ---------- donating ----------
t fail B "select public.donate_fund(50, 'bkash', 'TX-1', current_date, false)"
t fail B "select public.donate_fund(5000, 'bkash', 'T', current_date, false)"
t fail B "select public.donate_fund(5000, 'cash', 'TX-1', current_date, false)"
t "ok" B "select public.donate_fund(5000, 'bkash', 'TX-0001', current_date, true)"
t "ok" D "select public.donate_fund(20000, 'bank', 'BANK-777', current_date, false)"
t fail D "select public.donate_fund(1000, 'bank', 'bank-777', current_date, false)"
t "ok" C "select public.donate_fund(300, 'nagad', 'NG-55', current_date, false)"
# not counted until Travel Adda confirms the money arrived
t "0" B "select (public.fund_summary()->>'collected')::numeric::int"
t fail C "select count(*) from public.fund_donations"
t "1|submitted" B "select count(*)||'|'||max(status) from public.my_donations()"
t "0" B "select count(*) from public.my_donations() where amount = 20000"
# staff with payments confirms; admin too; others can't
DB=$($Q "select id from public.fund_donations where txn_ref='TX-0001'"); DD=$($Q "select id from public.fund_donations where txn_ref='BANK-777'"); DC=$($Q "select id from public.fund_donations where txn_ref='NG-55'")
t fail C "select public.admin_review_donation('$DB', true, null)"
t "3" S "select count(*) from public.admin_fund_donations('submitted')"
t "ok" S "select public.admin_review_donation('$DB', true, null)"
t "ok" A "select public.admin_review_donation('$DD', true, null)"
t fail A "select public.admin_review_donation('$DC', false, 'ক')"
t "ok" A "select public.admin_review_donation('$DC', false, 'টাকা পাওয়া যায়নি')"
t "not_found" A "select public.admin_review_donation('$DB', true, null)"
t "1" B "select count(*) from public.user_notifications where user_id='$B' and route='Fund'"
t "25000|2|25000" C "select (s->>'collected')::numeric::int||'|'||(s->>'donors')||'|'||(s->>'balance')::numeric::int from (select public.fund_summary() s) x"
# donor names only when chosen; amounts visible
t "Leader B|5000" C "select (d->>'name')||'|'||(d->>'amount')::numeric::int from jsonb_array_elements(public.fund_summary()->'recent') d where (d->>'amount')::numeric = 5000"
t "null" C "select coalesce(d->>'name','null') from jsonb_array_elements(public.fund_summary()->'recent') d where (d->>'amount')::numeric = 20000"
t "5000" B "select (select sum(amount) from public.my_donations() where status='confirmed')::int"
# ---------- spending (public) ----------
t fail S "select public.admin_spend_fund('$CA', 30000, 'ওমরাহ প্যাকেজ', 'PAY-1')"
t fail C "select public.admin_spend_fund('$CA', 1000, 'ওমরাহ প্যাকেজ', 'PAY-1')"
t fail A "select public.admin_spend_fund('$CA', 1000, 'ক', 'PAY-1')"
t "ok" S "select public.admin_spend_fund('$CA', 15000, 'ওমরাহ প্যাকেজের প্রথম কিস্তি', 'PAY-1')"
t "funded" A "select status from public.admin_help_applications('funded') where id='$CA'"
t "10000|15000|1" C "select (s->>'balance')::numeric::int||'|'||(s->>'spent')::numeric::int||'|'||jsonb_array_length(s->'spends') from (select public.fund_summary() s) x"
t "0" B "select count(*) from jsonb_array_elements(public.fund_summary()->'spends') x where x::text like '%রহিম%' or x::text like '%PAY-1%'"
t "নোয়াখালী" B "select x->>'district' from jsonb_array_elements(public.fund_summary()->'spends') x"
t fail A "select public.admin_spend_fund('$FA', 999999, 'হজ প্যাকেজ', 'PAY-2')"
t "ok" A "select public.admin_help_travelled('$CA')"
t "1" C "select (public.fund_summary()->>'travelled')::int"
# withdraw: own pending application only
G=00000000-0000-0000-0000-0000000000c3
$Q "insert into auth.users (id, email, raw_user_meta_data) values ('$G','01710000090@users.traveladda.app','{\"full_name\":\"Haji G\"}')" >/dev/null
t "ok" G "select public.apply_help('umrah', 55, 'ফেনী', 'দোকানদার', 'ওমরাহ করার জন্য সাহায্য দরকার আমার', false, 'ইমাম সাহেব', '01912345678', false)"
t "not_found" C "select public.withdraw_help()"
t "ok" G "select public.withdraw_help()"
t "withdrawn" G "select status from public.my_help_application()"
t "ok" G "select public.apply_help('umrah', 55, 'ফেনী', 'দোকানদার', 'ওমরাহ করার জন্য সাহায্য দরকার আমার', false, 'ইমাম সাহেব', '01912345678', false)"
# counts for the admin menu
t "1|0" A "select (c->>'help_apps')||'|'||(c->>'donations') from (select public.admin_counts() c) x"
t "0" A "select count(*) from public.admin_list_audit() where action like 'fund%' and detail is null"
t "t" A "select count(*) >= 6 from public.admin_list_audit() where action like 'fund%' or action like 'help%'"
echo "t27: pass=$pass fail=$fail"
