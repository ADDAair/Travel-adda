. /var/tmp/pgt/as.sh
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
G=$($Q "insert into public.groups (leader_id,name) values ('$B','G1') returning id" | head -1)
G2=$($Q "insert into public.groups (leader_id,name) values ('$D','G2') returning id" | head -1)
$Q "insert into public.group_members (group_id,user_id,status) values ('$G','$C','active')" >/dev/null
# protection
t fail C "update public.profiles set phone_verified=true where id='$C'"
t fail C "update public.profiles set role='leader' where id='$C'"
t ok C "update public.profiles set full_name='Haji C2' where id='$C'"
t "f" C "select phone_verified from public.profiles where id='$C'"
# announcements
t ok B "insert into public.group_announcements (group_id, body) values ('$G','Bus at 5am')"
t fail B "insert into public.group_announcements (group_id, body) values ('$G2','not my group')"
t fail D "insert into public.group_announcements (group_id, body) values ('$G','intruder')"
t fail C "insert into public.group_announcements (group_id, body) values ('$G','haji post')"
t fail B "insert into public.group_announcements (group_id, body) values ('$G',' ')"
t fail B "insert into public.group_announcements (group_id, body, created_by) values ('$G','spoof','$D')"
t "1" C "select count(*) from public.group_announcements"
t "0" D "select count(*) from public.group_announcements"
t "0" A "select count(*) from public.group_announcements"
t "0" C "with d as (delete from public.group_announcements returning 1) select count(*) from d"
t fail C "update public.group_announcements set body='x'"
$Q "update public.group_members set status='left' where user_id='$C'" >/dev/null
t "0" C "select count(*) from public.group_announcements"
t "1" B "with d as (delete from public.group_announcements returning 1) select count(*) from d"
for i in $(seq 1 30); do $Q "insert into public.group_announcements (group_id, body, created_by) values ('$G','bulk $i','$B')" >/dev/null; done
t fail B "insert into public.group_announcements (group_id, body) values ('$G','31st today')"
# document expiry
DOC=$($Q "insert into public.user_documents (user_id, doc_type, file_path) values ('$C','passport','$C/a.jpg') returning id" | head -1)
t ok C "update public.user_documents set expires_on='2027-05-01' where id='$DOC'"
t fail C "update public.user_documents set expires_on='1990-05-01' where id='$DOC'"
t fail C "update public.user_documents set file_path='$D/x.jpg' where id='$DOC'"
t "0" D "with u as (update public.user_documents set expires_on='2027-01-01' where id='$DOC' returning 1) select count(*) from u"
# otp table closed
t fail C "select * from public.phone_otps"
t fail anon "select * from public.phone_otps"
t fail C "insert into public.phone_otps (phone,purpose,code_hash,expires_at) values ('01710000003','verify','x',now())"
# otp_live gating
$Q "update public.group_members set status='left' where user_id='$C'" >/dev/null
t "sent" B "select public.invite_by_phone('$G','01710000003')"
echo invited-check: ; $Q "select status from public.group_members where user_id='$C'" 
$Q "update public.group_members set status='left' where user_id='$C'" >/dev/null
t fail B "select public.admin_set_setting('otp_live','yes')"
t fail A "select public.admin_set_setting('otp_live','maybe')"
t ok A "select public.admin_set_setting('otp_live','yes')"
t "sent" B "select public.invite_by_phone('$G','01710000003')"
echo "status after gated invite: $($Q "select status from public.group_members where user_id='$C'")"
$Q "update public.profiles set phone_verified=true where id='$C'" >/dev/null
t "sent" B "select public.invite_by_phone('$G','01710000003')"
echo "status after verified invite: $($Q "select status from public.group_members where user_id='$C'")"
t "t" B "select phone_verified from public.group_members_for_leader('$G') limit 1"
t fail C "insert into public.leader_applications (agency_name, license_no) values ('XY','1')"
$Q "update public.profiles set phone_verified=true where id='$E'" >/dev/null
t ok E "insert into public.leader_applications (agency_name, license_no) values ('XY','1')" 
$Q "update public.profiles set phone_verified=false where id='$E'" >/dev/null
$Q "delete from public.leader_applications where user_id='$E'" >/dev/null
t fail E "insert into public.leader_applications (agency_name, license_no) values ('Unverified','1')"
t ok A "select public.admin_set_setting('otp_live','')"
t ok E "insert into public.leader_applications (agency_name, license_no) values ('Now ok','1')"
echo "pass=$pass fail=$fail"
