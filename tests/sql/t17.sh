. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
su() { exp="$1"; out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "$2" 2>&1); if [ "$(echo "$out" | tail -1)" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/su] $2 -> $out"; fi; }
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 017_leader_kinds; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
reject_e() { $Q "update public.leader_applications set status='rejected' where user_id='$E' and status='pending'" >/dev/null; }
t ok E "select public.agree_terms('terms_leader')"
# --- Travel Adda's own leader: no office, no licence; NID picture required; profession optional
t fail E "insert into public.leader_applications (leader_kind, profession, district, upazila) values ('travel_adda','ইমাম','নোয়াখালী','কোম্পানীগঞ্জ')"
t ok E "insert into public.leader_applications (leader_kind, profession, district, upazila, union_name, doc_path) values ('travel_adda','ইমাম','নোয়াখালী','কোম্পানীগঞ্জ','চরহাজারী','$E/nid.jpg')"
t "travel_adda|Travel Adda|ইমাম" E "select leader_kind||'|'||agency_name||'|'||profession from public.leader_applications where user_id='$E' and status='pending'"
t "travel_adda|ইমাম" A "select leader_kind||'|'||profession from public.admin_list_applications() where user_id='$E' and status='pending'"
reject_e
# whatever a Travel Adda application sends as office/licence is ignored
t ok E "insert into public.leader_applications (leader_kind, agency_name, license_no, umrah_license, doc_path, district) values ('travel_adda','Fake Agency','X-1','U-9','$E/nid2.jpg','ঢাকা')"
t "Travel Adda||" E "select agency_name||'|'||coalesce(umrah_license,'')||'|'||coalesce(hajj_license,'') from public.leader_applications where user_id='$E' and status='pending'"
reject_e
# --- an agency may NOT call itself Travel Adda (would wrongly get trust)
for n in 'Travel Adda' 'TRAVEL ADDA Ltd' 'traveladda' 'ট্রাভেল আড্ডা' 'Travel-Adda Tours'; do
  t fail E "insert into public.leader_applications (leader_kind, agency_name, license_no, umrah_license, district, doc_path) values ('agency','$n','U-1','U-1','সিলেট','$E/lic.jpg')"
done
# normal agency application, profession optional, kind defaults to agency
t ok E "insert into public.leader_applications (agency_name, license_no, umrah_license, district, profession, doc_path) values ('Al Haramain','U-1','U-1','সিলেট','মাদ্রাসার শিক্ষক','$E/lic.jpg')"
t "agency|Al Haramain|মাদ্রাসার শিক্ষক" E "select leader_kind||'|'||agency_name||'|'||profession from public.leader_applications where user_id='$E' and status='pending'"
reject_e
# bad values
t fail E "insert into public.leader_applications (leader_kind, doc_path) values ('boss','$E/nid.jpg')"
t fail E "insert into public.leader_applications (leader_kind, doc_path, profession) values ('travel_adda','$E/nid.jpg','$(printf 'ক%.0s' $(seq 1 61))')"
# a haji account can never apply
t fail C "insert into public.leader_applications (leader_kind, doc_path) values ('travel_adda','$C/nid.jpg')"
# --- approval copies kind and profession; directory shows them; search finds profession
t ok E "insert into public.leader_applications (leader_kind, profession, district, upazila, doc_path) values ('travel_adda','ইমাম','নোয়াখালী','কোম্পানীগঞ্জ','$E/nid3.jpg')"
APP=$($Q "select id from public.leader_applications where user_id='$E' and status='pending'")
t fail E "update public.leader_applications set leader_kind='agency' where id='$APP'"
t "ok" A "select public.review_leader_application('$APP', true, 'NID checked')"
su "travel_adda|Travel Adda|ইমাম" "select leader_kind||'|'||agency_name||'|'||profession from public.leader_profiles where user_id='$E'"
t "travel_adda|ইমাম" C "select leader_kind||'|'||profession from public.list_leaders(null, null) where id='$E'"
t "1" C "select count(*) from public.list_leaders(null, 'ইমাম')"
t "travel_adda|ইমাম" C "select leader_kind||'|'||profession from public.leader_public('$E')"
t "agency" C "select leader_kind from public.list_leaders(null, null) where id='$B'"
# --- the leader may change the profession, never the kind or the agency name
t "1" E "with x as (update public.leader_profiles set profession='মুয়াজ্জিন' where user_id='$E' returning 1) select count(*) from x"
t fail E "update public.leader_profiles set leader_kind='agency' where user_id='$E'"
t fail B "update public.leader_profiles set leader_kind='travel_adda' where user_id='$B'"
t fail B "update public.leader_profiles set agency_name='Travel Adda' where user_id='$B'"
t "0" B "with x as (update public.leader_profiles set profession='hack' where user_id='$E' returning 1) select count(*) from x"
echo "t17: pass=$pass fail=$fail"
