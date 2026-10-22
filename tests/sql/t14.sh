. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
su() { exp="$1"; out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "$2" 2>&1); if [ "$(echo "$out" | tail -1)" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/su] $2 -> $out"; fi; }
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 014_work_area; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled"; done
# --- the pending leader E applies with a work area (district > upazila > union)
t ok E "select public.agree_terms('terms_leader')"
t fail E "insert into public.leader_applications (agency_name, license_no, umrah_license, district, upazila, union_name) values ('Agency E','U-1','U-1','নোয়াখালী','কোম্পানীগঞ্জ','$(printf 'ক%.0s' $(seq 1 121))')"
t ok E "insert into public.leader_applications (agency_name, license_no, umrah_license, district, upazila, union_name) values ('Agency E','U-1','U-1','নোয়াখালী','কোম্পানীগঞ্জ','চরহাজারী, চরএলাহী')"
t "চরহাজারী, চরএলাহী" E "select union_name from public.leader_applications where user_id='$E'"
# a haji account can never apply, with or without a union
t fail C "insert into public.leader_applications (agency_name, license_no, district, upazila, union_name) values ('X','1','ঢাকা','সাভার','আশুলিয়া')"
# admin sees the union; others see nothing
t "চরহাজারী, চরএলাহী" A "select union_name from public.admin_list_applications() where user_id='$E'"
t "0" C "select count(*) from public.admin_list_applications()"
APP=$($Q "select id from public.leader_applications where user_id='$E' and status='pending'")
t fail C "select public.review_leader_application('$APP', true, null)"
t "ok" A "select public.review_leader_application('$APP', true, 'ok')"
su "নোয়াখালী|কোম্পানীগঞ্জ|চরহাজারী, চরএলাহী" "select district||'|'||upazila||'|'||union_name from public.leader_profiles where user_id='$E'"
# directory: hajis find the leader by union; the leader page shows it
t "1" C "select count(*) from public.list_leaders(null, 'চরহাজারী')"
t "চরহাজারী, চরএলাহী" C "select union_name from public.list_leaders('নোয়াখালী', null)"
t "চরহাজারী, চরএলাহী" C "select union_name from public.leader_public('$E')"
t fail anon "select count(*) from public.list_leaders(null, null)"
t fail anon "select * from public.leader_public('$E')"
t fail anon "select * from public.admin_list_applications()"
# the leader edits his own work area; nobody else can
t "1" E "with x as (update public.leader_profiles set district='ফেনী', upazila='সোনাগাজী', union_name='চর চান্দিয়া' where user_id='$E' returning 1) select count(*) from x"
su "ফেনী|সোনাগাজী|চর চান্দিয়া" "select district||'|'||upazila||'|'||union_name from public.leader_profiles where user_id='$E'"
t "0" B "with x as (update public.leader_profiles set union_name='hack' where user_id='$E' returning 1) select count(*) from x"
t "0" C "with x as (update public.leader_profiles set union_name='hack' where user_id='$E' returning 1) select count(*) from x"
t fail E "update public.leader_profiles set agency_name='Other' where user_id='$E'"
t fail E "update public.leader_profiles set union_name='$(printf 'ক%.0s' $(seq 1 121))' where user_id='$E'"
# earlier leaders without a union keep working
t "1" C "select count(*) from public.list_leaders('ঢাকা', null) where union_name is null"
echo "t14: pass=$pass fail=$fail"
