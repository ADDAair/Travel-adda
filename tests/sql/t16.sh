. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
su() { exp="$1"; out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "$2" 2>&1); if [ "$(echo "$out" | tail -1)" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/su] $2 -> $out"; fi; }
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 016_email_login; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
CK=$($Q "select login_key from public.profiles where id='$C'")
# --- existing accounts moved to a private login key; login address no longer contains the phone
su "6" "select count(*) from public.profiles p join auth.users u on u.id=p.id where p.login_key ~ '^u[0-9a-f]{20}$' and u.email = p.login_key||'@users.traveladda.app'"
su "0" "select count(*) from auth.users where email ~ '^01'"
# --- login_id: phone -> the real login address; unknown -> a made-up one that looks the same
t "$CK@users.traveladda.app" anon "select public.login_id('01710000003')"
t "$CK@users.traveladda.app" anon "select public.login_id('০১৭১০০০০০০৩')"
t "$CK@users.traveladda.app" anon "select public.login_id('+8801710000003')"
U1=$($Q "set role anon; select public.login_id('01799999999')")
t "$U1" anon "select public.login_id('01799999999')"
t "t" anon "select public.login_id('01799999999') ~ '^u[0-9a-f]{20}@users\\.traveladda\\.app$'"
t "t" anon "select public.login_id('01799999999') <> public.login_id('01799999998')"
t "" anon "select coalesce(public.login_id('hello'), '')"
t "" anon "select coalesce(public.login_id('12345678901'), '')"
# e-mail: only a VERIFIED e-mail logs in
$Q "update public.profiles set email='karim@example.com', email_verified=false where id='$C'" >/dev/null
t "f" anon "select public.login_id('karim@example.com') = '$CK@users.traveladda.app'"
$Q "update public.profiles set email_verified=true where id='$C'" >/dev/null
t "$CK@users.traveladda.app" anon "select public.login_id('  KARIM@Example.com ')"
t "t" anon "select public.login_id('nobody@example.com') ~ '^u[0-9a-f]{20}@'"
# --- nobody can set e-mail / verified / login key themselves; the secret is unreadable
t fail C "update public.profiles set email='x@y.com' where id='$C'"
t fail C "update public.profiles set email_verified=true where id='$C'"
t fail C "update public.profiles set login_key='u00000000000000000000' where id='$C'"
t "karim@example.com|true|true" C "select email||'|'||email_verified||'|'||verified from public.profiles"
t fail C "select * from public.app_private"
t fail anon "select * from public.app_private"
t fail C "select * from public.phone_otps"
# e-mail unique, lower-case only
$Q "update public.profiles set email='karim@example.com' where id='$F'" 2>&1 | grep -q duplicate && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL duplicate e-mail allowed"; }
$Q "update public.profiles set email='Upper@Example.com' where id='$F'" 2>&1 | grep -q check && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL upper-case e-mail allowed"; }
# --- sign-up: new style (private login address + phone in the sign-up data) and old style both work
$Q "insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(),'u1234567890abcdef1234@users.traveladda.app','{\"full_name\":\"New Haji\",\"phone\":\"01910000001\"}')" >/dev/null
su "01910000001|u1234567890abcdef1234|TA" "select phone||'|'||login_key||'|'||left(haji_code,2) from public.profiles where phone='01910000001'"
t "u1234567890abcdef1234@users.traveladda.app" anon "select public.login_id('01910000001')"
$Q "insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(),'01910000002@users.traveladda.app','{\"full_name\":\"Old App\"}')" >/dev/null
su "01910000002" "select login_key from public.profiles where phone='01910000002'"
# same phone twice: refused
$Q "insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(),'uaaaaaaaaaaaaaaaaaaaa@users.traveladda.app','{\"full_name\":\"Dup\",\"phone\":\"01910000001\"}')" 2>&1 | grep -q duplicate && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL duplicate phone sign-up allowed"; }
# bad phone in sign-up data: refused
$Q "insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(),'ubbbbbbbbbbbbbbbbbbbb@users.traveladda.app','{\"full_name\":\"Bad\",\"phone\":\"12345\"}')" 2>&1 | grep -q "check" && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL bad phone sign-up allowed"; }
# --- "verified" = phone OR e-mail: invitations and leader applications with mandatory OTP on
$Q "insert into public.app_settings (key, value) values ('otp_live','yes') on conflict (key) do update set value='yes'" >/dev/null
GID=$($Q "insert into public.groups (leader_id, name) values ('$B', 'OTP দল') returning id" | head -1)
t "sent" B "select public.invite_by_phone('$GID', '01710000003')"
su "invited" "select status from public.group_members where group_id='$GID' and user_id='$C'"
t "sent" B "select public.invite_by_phone('$GID', '01710000006')"
su "0" "select count(*) from public.group_members where group_id='$GID' and user_id='$F'"     # F: nothing verified
t "t" B "select phone_verified from public.group_members_for_leader('$GID') where user_id='$C'"
t ok E "select public.agree_terms('terms_leader')"
t fail E "insert into public.leader_applications (agency_name, license_no, umrah_license, district) values ('Agency E','U-1','U-1','সিলেট')"
$Q "update public.profiles set email='e@example.com', email_verified=true where id='$E'" >/dev/null
t ok E "insert into public.leader_applications (agency_name, license_no, umrah_license, district) values ('Agency E','U-1','U-1','সিলেট')"
$Q "update public.app_settings set value='no' where key='otp_live'" >/dev/null
echo "t16: pass=$pass fail=$fail"
