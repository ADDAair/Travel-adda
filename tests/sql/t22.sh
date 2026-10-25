. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
su() { exp="$1"; out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "$2" 2>&1); if [ "$(echo "$out" | tail -1)" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/su] $2 -> $out"; fi; }
# 022: admin panel part 1 — contracts & disputes, full user view, pending counts, hide rating comments,
#      unlist a leader, forced app update, video links, groups & khadems overview. Only staff with the right permission.
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 022_admin_tools; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
BC=$($Q "select haji_code from public.profiles where id='$B'"); CC=$($Q "select haji_code from public.profiles where id='$C'")
CT=$($Q "insert into public.haji_contracts (leader_id, haji_id, leader_name, leader_code, haji_name, haji_code, kind, title, price_bdt, includes, refund_policy, status) values ('$B','$C','Leader B','$BC','Haji C','$CC','umrah','রমজান চুক্তি',150000,'বিমান','নিয়ম','accepted') returning id" | head -1)
CNO=$($Q "select contract_no from public.haji_contracts where id='$CT'")
$Q "insert into public.haji_payments (contract_id, haji_id, amount, method, txn_ref, status) values ('$CT','$C',50000,'bank','PAY-1','confirmed'), ('$CT','$C',20000,'bkash','PAY-2','submitted')" >/dev/null
$Q "insert into public.complaints (contract_id, haji_id, leader_id, body) values ('$CT','$C','$B','হোটেল প্যাকেজের চেয়ে অনেক দূরে দিয়েছে')" >/dev/null
$Q "insert into public.leader_ratings (contract_id, leader_id, haji_id, stars, comment) values ('$CT','$B','$C',1,'খারাপ গালি দেওয়া মন্তব্য')" >/dev/null
G=$($Q "insert into public.groups (leader_id, name) values ('$B', 'ওমরাহ দল ক') returning id" | head -1)
$Q "insert into public.group_members (group_id, user_id, status, joined_at) values ('$G','$C','active',now())" >/dev/null
$Q "insert into public.group_staff (group_id, user_id) values ('$G','$F')" >/dev/null

# ---------- 1) contracts & disputes ----------
t "1" A "select count(*) from public.admin_find_contracts('$CNO')"
t "1" A "select count(*) from public.admin_find_contracts('$CC')"
t "1" A "select count(*) from public.admin_find_contracts('$BC')"
t "50000.00|1" A "select paid_confirmed||'|'||open_complaints from public.admin_find_contracts('$CNO')"
t fail C "select count(*) from public.admin_find_contracts('$CNO')"
t fail B "select count(*) from public.admin_find_contracts('$CNO')"
t "$CNO|2|1|নিয়ম" A "select d->>'contract_no' || '|' || jsonb_array_length(d->'payments') || '|' || jsonb_array_length(d->'complaints') || '|' || (d->>'refund_policy') from (select public.admin_contract_detail('$CT') d) x"
t "ok" A "select public.admin_add_contract_note('$CT', 'দুই পক্ষের সাথে কথা হয়েছে')"
t fail A "select public.admin_add_contract_note('$CT', 'ক')"
t fail C "select public.admin_add_contract_note('$CT', 'আমি অ্যাডমিন নই কিন্তু লিখছি')"
t "1" A "select jsonb_array_length(public.admin_contract_detail('$CT')->'notes')"
t "1" A "select count(*) from public.admin_list_audit() where action='contract_note'"

# ---------- 2) full user view ----------
t "Haji C|1|1|2" A "select (d->>'full_name')||'|'||jsonb_array_length(d->'contracts')||'|'||jsonb_array_length(d->'groups')||'|'||jsonb_array_length(d->'payments') from (select public.admin_user_detail('$C') d) x"
t "1|1" A "select jsonb_array_length(d->'leads_groups')||'|'||jsonb_array_length(d->'complaints_against') from (select public.admin_user_detail('$B') d) x"
t "1" A "select jsonb_array_length(public.admin_user_detail('$F')->'khadem_of')"
t "null" A "select coalesce(public.admin_user_detail('$C')->>'documents', 'null')"
t fail C "select public.admin_user_detail('$C')"

# ---------- 3) pending counts ----------
t "1|1" A "select (c->>'payments')||'|'||(c->>'complaints') from (select public.admin_counts() c) x"
t fail C "select public.admin_counts()"

# ---------- 4) hide a rating comment (stars still count) ----------
t "1" C "select count(*) from public.leader_reviews('$B') where kind='rating'"
t fail A "select public.admin_hide_rating('$CT', true, 'ক')"
t fail C "select public.admin_hide_rating('$CT', true, 'আমার ইচ্ছা')"
t "ok" A "select public.admin_hide_rating('$CT', true, 'গালি দেওয়া মন্তব্য')"
t "0" C "select count(*) from public.leader_reviews('$B') where kind='rating'"
t "1" C "select rating_count from public.leader_public('$B')"
t "t" A "select comment_hidden from public.admin_list_ratings(null) where contract_id='$CT'"
t "ok" A "select public.admin_hide_rating('$CT', false, 'ভুল করে লুকানো হয়েছিল')"
t "1" C "select count(*) from public.leader_reviews('$B') where kind='rating'"

# ---------- 5) unlist a leader (account stays active) ----------
O=$($Q "insert into public.offers (leader_id,kind,title,price_bdt,depart_on,return_on,review,from_airport,arrive_at,first_city,makkah_nights,madinah_nights,return_from,return_to) values ('$B','umrah','প্যাকেজ',1000,current_date+30,current_date+40,'approved','DAC','JED','makkah',3,2,'JED','DAC') returning id" | head -1)
t "1" C "select count(*) from public.list_leaders(null, null) where id='$B'"
t "1" C "select count(*) from public.list_offers('umrah') where id='$O'"
t "ok" A "select public.admin_set_leader_listed('$B', false, 'পরীক্ষার লিডার')"
t "0" C "select count(*) from public.list_leaders(null, null) where id='$B'"
t "0" C "select count(*) from public.list_offers('umrah') where id='$O'"
t "1" C "select count(*) from public.leader_public('$B')"
su "active" "select status from public.profiles where id='$B'"
t fail C "select public.admin_set_leader_listed('$B', true, 'আবার দেখাও')"
t "ok" A "select public.admin_set_leader_listed('$B', true, 'পরীক্ষা শেষ')"
t "1" C "select count(*) from public.list_leaders(null, null) where id='$B'"

# ---------- 6) forced update ----------
t "ok" A "select public.admin_set_setting('min_app_version', '0.2.0')"
t fail A "select public.admin_set_setting('min_app_version', '1.x')"
t "ok" A "select public.admin_set_setting('store_url', 'https://play.google.com/store/apps/details?id=app.traveladda.hajumrah')"
t fail A "select public.admin_set_setting('store_url', 'http://evil.example/app.apk')"
t "0.2.0" C "select value from public.app_settings where key='min_app_version'"
t fail C "select public.admin_set_setting('min_app_version', '9.9.9')"

# ---------- 7) video links ----------
t "ok" A "select public.admin_set_video('Umrah', 'https://videos.traveladda.app/umrah.mp4')"
t fail A "select public.admin_set_video('Umrah', 'http://videos.traveladda.app/umrah.mp4')"
t fail A "select public.admin_set_video('Bad Route!', 'https://x.example/a.mp4')"
t fail C "select public.admin_set_video('Umrah', 'https://x.example/a.mp4')"
t "https://videos.traveladda.app/umrah.mp4" C "select url from public.app_videos where route='Umrah'"
t fail C "insert into public.app_videos (route, url) values ('Hajj','https://evil.example/x.mp4')"
t "ok" A "select public.admin_set_video('Umrah', null)"
t "0" C "select count(*) from public.app_videos where route='Umrah'"

# ---------- 8) groups & khadems overview ----------
t "ওমরাহ দল ক|1|1" A "select name||'|'||members||'|'||khadems from public.admin_groups(null) where id='$G'"
t "1" A "select count(*) from public.admin_groups('$BC')"
t fail C "select count(*) from public.admin_groups(null)"
t fail anon "select count(*) from public.admin_groups(null)"
echo "t22: pass=$pass fail=$fail"
