. /var/tmp/pgt/as.sh
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
F=00000000-0000-0000-0000-00000000000f; E=00000000-0000-0000-0000-00000000000e
CC=$($Q "select haji_code from public.profiles where id='$C'"); FC=$($Q "select haji_code from public.profiles where id='$F'")
$Q "update public.profiles set created_at = now() - interval '10 days'" >/dev/null
# --- sending: only admin / notify staff
t fail C "select public.admin_send_notification('all','hack','x',null,false)"
t fail B "select public.admin_send_notification('all','hack','x',null,false)"
t "ok" A "select public.admin_send_notification('all','সবাইকে নোটিশ','হজ নিবন্ধনের শেষ তারিখ ৩০ নভেম্বর',null,true)"
t "ok" A "select public.admin_send_notification('haji','শুধু হাজীদের','x',null,false)"
t "ok" A "select public.admin_send_notification('leader','শুধু লিডারদের','x',null,false)"
t "ok" A "select public.admin_send_notification('one','শুধু আপনাকে','x','$CC',false)"
t "not_found" A "select public.admin_send_notification('one','কেউ নেই','x','TA-99999',false)"
t "title" A "select public.admin_send_notification('all',' ','x',null,false)"
t "bad" A "select public.admin_send_notification('everyone','x y','x',null,false)"
# --- who sees what
t "3" C "select count(*) from public.my_notifications(100)"
t "শুধু আপনাকে|শুধু হাজীদের|সবাইকে নোটিশ" C "select string_agg(title, '|' order by title) from public.my_notifications(100)"
t "2" B "select count(*) from public.my_notifications(100)"
t "0" B "select count(*) from public.my_notifications(100) where title in ('শুধু হাজীদের','শুধু আপনাকে')"
t "1" E "select count(*) from public.my_notifications(100)"
t "2" F "select count(*) from public.my_notifications(100)"
t fail C "select * from public.broadcasts"
t fail anon "select * from public.my_notifications(100)"
t "3" C "select public.my_unread_count()"
# --- reading / hiding is per person
BID=$($Q "select id from public.broadcasts where title='সবাইকে নোটিশ'")
NID=$($Q "select id from public.user_notifications where title='শুধু আপনাকে'")
t "ok" C "select public.mark_notification('$BID','all',false)"
t "2" C "select public.my_unread_count()"
t "2" F "select public.my_unread_count()"
t "ok" C "select public.mark_notification('$NID','me',false)"
t "0" F "with u as (update public.user_notifications set read_at=now() where id='$NID' returning 1) select count(*) from u"
t fail C "update public.user_notifications set title='changed' where id='$NID'"
t fail C "insert into public.user_notifications (user_id,title) values ('$F','fake from C')"
t "0" F "with d as (delete from public.user_notifications where id='$NID' returning 1) select count(*) from d"
t "ok" C "select public.mark_notification('$BID','all',true)"
t "2" C "select count(*) from public.my_notifications(100)"
t "2" F "select count(*) from public.my_notifications(100)"
t "ok" C "select public.mark_all_notifications_read()"
t "0" C "select public.my_unread_count()"
# --- withdraw
t fail C "select public.admin_withdraw_broadcast('$BID')"
t "ok" A "select public.admin_withdraw_broadcast('$BID')"
t "0" F "select count(*) from public.my_notifications(100) where title='সবাইকে নোটিশ'"
# --- staff permission
$Q "insert into auth.users (id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a4','01710000014@users.traveladda.app','{\"full_name\":\"Staff N\"}')" >/dev/null
N=00000000-0000-0000-0000-0000000000a4
t ok A "select public.admin_set_staff('01710000014', array['notify'])"
t "ok" N "select public.admin_send_notification('leader','স্টাফের নোটিশ','x',null,false)"
t "2" N "select public.admin_audience_size('leader')"
t "" C "select public.admin_audience_size('all')"
t "1" A "select count(*) from public.admin_list_audit() where action='notify_leader' and actor_name='Staff N'"
# --- automatic notices
t "sent" B "select public.leader_send_contract('$CC','umrah','Umrah 15d',150000,'flight visa hotel','',current_date+30,current_date+45,'refund rules here','',null)"
t "1" C "select count(*) from public.my_notifications(100) where title='নতুন চুক্তির অনুরোধ এসেছে' and route='MyLeader'"
K=$($Q "select id from public.haji_contracts where haji_code='$CC'")
t "ok" C "select public.haji_respond_contract('$K', true)"
t "1" B "select count(*) from public.my_notifications(100) where title='হাজী চুক্তিতে রাজি হয়েছেন'"
t ok C "insert into public.haji_payments (contract_id, amount, method, txn_ref) values ('$K', 50000, 'bkash', 'TXN1')"
P1=$($Q "select id from public.haji_payments where txn_ref='TXN1'")
t "ok" A "select public.admin_review_payment('$P1', true, 'ok')"
t "1" C "select count(*) from public.my_notifications(100) where title='আপনার টাকা পাওয়া গেছে'"
t "1" B "select count(*) from public.my_notifications(100) where title='হাজীর টাকা নিশ্চিত হয়েছে'"
t "ok" A "select public.admin_add_payout('$K', 'leader', 10000, 'BANK-9', null)"
t "1" B "select count(*) from public.my_notifications(100) where title='Travel Adda আপনাকে টাকা পাঠিয়েছে'"
t "0" C "select count(*) from public.my_notifications(100) where title='Travel Adda আপনাকে টাকা পাঠিয়েছে'"
t "ok" C "select public.cancel_contract('$K', 'লিডার ভিসার কাজ শুরু করেননি')"
t "1" B "select count(*) from public.my_notifications(100) where title='হাজী চুক্তি বাতিল করেছেন'"
# leader application decided
$Q "update public.profiles set created_at = now() - interval '10 days' where id='$E'" >/dev/null
t ok E "insert into public.leader_applications (agency_name, license_no, umrah_license, district) values ('Agency E','U-1','U-1','সিলেট')"
APP=$($Q "select id from public.leader_applications where user_id='$E'")
t "ok" A "select public.review_leader_application('$APP', true, 'license checked')"
t "1" E "select count(*) from public.my_notifications(100) where title like 'অভিনন্দন%'"
# group invite + announcement
G=$($Q "insert into public.groups (leader_id,name) values ('$B','দল ক') returning id" | head -1)
t "sent" B "select public.invite_by_phone('$G','01710000006')"
t "1" F "select count(*) from public.my_notifications(100) where title='দলে যোগ দেওয়ার আমন্ত্রণ'"
t "ok" F "select public.respond_invite('$G', true)"
t ok B "insert into public.group_announcements (group_id, body) values ('$G','কাল ভোর ৫টায় বাস')"
t "1" F "select count(*) from public.my_notifications(100) where body='কাল ভোর ৫টায় বাস'"
t "0" C "select count(*) from public.my_notifications(100) where body='কাল ভোর ৫টায় বাস'"
# --- a person cannot read someone else's notices
t "0" F "select count(*) from public.user_notifications where user_id='$C'"
t "0" B "select count(*) from public.user_notifications where user_id='$F'"
echo "pass=$pass fail=$fail"
