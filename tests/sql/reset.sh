bash /var/tmp/pgt/start.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists t" -c "create database t" && $P -d t -f /var/tmp/pgt/stub.sql && for f in /home/claude/travel-adda/supabase/00[1-4]*.sql; do $P -d t -f $f 2>&1 | grep -v NOTICE; done
$P -d t -f /home/claude/travel-adda/supabase/005_offers.sql 2>&1 | grep -v NOTICE; $P -d t -f /home/claude/travel-adda/supabase/006_announce_expiry_otp.sql 2>&1 | grep -v NOTICE; $P -d t -f /home/claude/travel-adda/supabase/007_marketplace.sql 2>&1 | grep -v NOTICE; $P -d t -f /home/claude/travel-adda/supabase/007_marketplace.sql 2>&1 | grep -v NOTICE
$P -d t <<'Q'
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','01710000001@users.traveladda.app','{"full_name":"Admin"}'),
 ('00000000-0000-0000-0000-00000000000b','01710000002@users.traveladda.app','{"full_name":"Leader B"}'),
 ('00000000-0000-0000-0000-00000000000c','01710000003@users.traveladda.app','{"full_name":"Haji C"}'),
 ('00000000-0000-0000-0000-00000000000d','01710000004@users.traveladda.app','{"full_name":"Leader D"}');
update public.profiles set role='admin' where id='00000000-0000-0000-0000-00000000000a';
update public.profiles set role='leader' where id in ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000d');
insert into public.leader_applications (user_id, agency_name, license_no, status, reviewed_at) values ('00000000-0000-0000-0000-00000000000b','Agency B','L1','approved', now());
insert into public.leader_profiles (user_id, agency_name, umrah_license, district) values ('00000000-0000-0000-0000-00000000000b','Agency B','L1','ঢাকা'), ('00000000-0000-0000-0000-00000000000d','Agency D','L2','চট্টগ্রাম');
update public.profiles set account_type='leader' where id in ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000d');
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000e','01710000005@users.traveladda.app','{"full_name":"Leader E pending","account_type":"leader"}'),
 ('00000000-0000-0000-0000-00000000000f','01710000006@users.traveladda.app','{"full_name":"Haji F"}');
Q
