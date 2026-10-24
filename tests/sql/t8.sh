. /var/tmp/pgt/as.sh
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
F=00000000-0000-0000-0000-00000000000f
CC=$($Q "select haji_code from public.profiles where id='$C'"); FC=$($Q "select haji_code from public.profiles where id='$F'")
# offers end date
NEW="insert into public.offers (kind,title,price_bdt,depart_on,return_on,valid_until,from_airport,arrive_at,first_city,makkah_nights,madinah_nights,return_from,return_to) values"
t ok B "$NEW ('umrah','Ends soon',100000,current_date+30,current_date+40,current_date+5,'DAC','JED','makkah',3,2,'JED','DAC')"
t ok B "$NEW ('umrah','Expired offer',90000,current_date+30,current_date+40,current_date+1,'DAC','JED','makkah',3,2,'JED','DAC')"
$Q "update public.offers set review='approved' where review='pending'" >/dev/null   # step 019: admin approval
$Q "update public.offers set valid_until=current_date-1 where title='Expired offer'" >/dev/null
t fail B "$NEW ('umrah','Ends after departure',100000,current_date+30,current_date+40,current_date+31,'DAC','JED','makkah',3,2,'JED','DAC')"
t "1" C "select count(*) from public.list_offers('umrah') where title='Ends soon'"
t "0" C "select count(*) from public.list_offers('umrah') where title='Expired offer'"
EO=$($Q "select id from public.offers where title='Expired offer'")
t fail C "insert into public.offer_interests (offer_id) values ('$EO')"
# contract B -> C, accepted
t "sent" B "select public.leader_send_contract('$CC','umrah','Umrah 15d',150000,'flight visa hotel','',current_date+30,current_date+45,'refund rules here','',null)"
K=$($Q "select id from public.haji_contracts where haji_code='$CC'")
t "sent" B "select public.leader_send_contract('$FC','umrah','Umrah F',120000,'flight visa hotel','',current_date+30,current_date+45,'refund rules here','',null)"
KF=$($Q "select id from public.haji_contracts where haji_code='$FC'")
# paying before accepting is refused
t fail C "insert into public.haji_payments (contract_id, amount, method, txn_ref) values ('$K', 50000, 'bkash', 'TX0001')"
t "ok" C "select public.haji_respond_contract('$K', true)"
t ok C "insert into public.haji_payments (contract_id, amount, method, txn_ref, receipt_path) values ('$K', 50000, 'bkash', 'TX0001', '$C/r1.jpg')"
t fail C "insert into public.haji_payments (contract_id, amount, method, txn_ref) values ('$K', 50000, 'bkash', 'tx0001')"
t fail C "insert into public.haji_payments (contract_id, amount, method, txn_ref) values ('$KF', 1000, 'bkash', 'TX0002')"
t fail F "insert into public.haji_payments (contract_id, amount, method, txn_ref) values ('$K', 1000, 'bkash', 'TX0003')"
t fail C "insert into public.haji_payments (contract_id, amount, method, txn_ref, receipt_path) values ('$K', 1000, 'bank', 'TX0004', '$F/x.jpg')"
t fail C "insert into public.haji_payments (contract_id, amount, method, txn_ref, status) values ('$K', 1000, 'bank', 'TX0005', 'confirmed')"
t fail C "insert into public.haji_payments (contract_id, haji_id, amount, method, txn_ref) values ('$K', '$F', 1000, 'bank', 'TX0006')"
t fail C "insert into public.haji_payments (contract_id, amount, method, txn_ref, paid_on) values ('$K', 1000, 'bank', 'TX0007', current_date+3)"
P1=$($Q "select id from public.haji_payments where txn_ref='TX0001'")
t fail C "update public.haji_payments set status='confirmed' where id='$P1'"
t fail C "delete from public.haji_payments where id='$P1'"
t "1" C "select count(*) from public.haji_payments"
t "0" F "select count(*) from public.haji_payments"
t "0" B "select count(*) from public.haji_payments"
t fail C "select public.admin_review_payment('$P1', true, null)"
t fail B "select public.admin_review_payment('$P1', true, null)"
# money view
t "150000.00|0|50000.00||150000.00" C "select price_bdt||'|'||paid_in||'|'||pending_in||'|'||coalesce(commission::text,'')||'|'||still_to_pay from public.contract_money('$K')"
t "0" F "select count(*) from public.contract_money('$K')"
t "0" D "select count(*) from public.contract_money('$K')"
# staff with payments permission
$Q "insert into auth.users (id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a2','01710000012@users.traveladda.app','{\"full_name\":\"Staff P\"}')" >/dev/null
P=00000000-0000-0000-0000-0000000000a2
t ok A "select public.admin_set_staff('01710000012', array['payments'])"
t "1" P "select count(*) from public.admin_list_payments(null)"
t "reason" P "select public.admin_review_payment('$P1', false, '')"
t "ok" P "select public.admin_review_payment('$P1', true, 'bKash statement matched')"
t "not_found" P "select public.admin_review_payment('$P1', false, 'second time')"
t "150000.00|50000.00|0|100000.00" C "select price_bdt||'|'||paid_in||'|'||pending_in||'|'||still_to_pay from public.contract_money('$K')"
t "|" C "select coalesce(commission::text,'')||'|'||coalesce(due_to_leader::text,'') from public.contract_money('$K')"
t "0.00|50000.00" B "select commission||'|'||due_to_leader from public.contract_money('$K')"
# leader rate 10%
t fail B "select public.admin_set_leader_rate('$B', 0, 'self')"
t "ok" P "select public.admin_set_leader_rate('$B', 10, 'standard')"
t "5000.00|45000.00" B "select commission||'|'||due_to_leader from public.contract_money('$K')"
t "ok" P "select public.admin_set_commission('$K', 3000)"
t "3000.00|47000.00" B "select commission||'|'||due_to_leader from public.contract_money('$K')"
t "ok" P "select public.admin_set_commission('$K', 0)"
t "0.00|50000.00" B "select commission||'|'||due_to_leader from public.contract_money('$K')"
t "ok" P "select public.admin_set_commission('$K', null)"
# payouts
t "over" P "select public.admin_add_payout('$K', 'leader', 45001, 'BANK-1', null)"
t "bad" P "select public.admin_add_payout('$K', 'leader', 100, '', null)"
t "ok" P "select public.admin_add_payout('$K', 'leader', 40000, 'BANK-1', 'first part')"
t "0.00|5000.00" B "select paid_to_leader-40000||'|'||due_to_leader from public.contract_money('$K')"
t "over" P "select public.admin_add_payout('$K', 'haji', 10001, 'REF-1', null)"
t "ok" P "select public.admin_add_payout('$K', 'haji', 2000, 'REF-1', 'partial refund')"
t "3000.00" B "select due_to_leader from public.contract_money('$K')"
t fail B "select public.admin_add_payout('$K', 'leader', 1, 'X-123', null)"
t fail C "select * from public.payouts"
t "3" B "select count(*) from public.leader_money()"
t "0" D "select count(*) from public.leader_money()"
t "1" P "select count(*) from public.admin_ledger()"
t "3000.00" P "select due_to_leader from public.admin_ledger()"
t "0" C "select count(*) from public.admin_ledger()"
t fail P "select count(*) from public.admin_export('ledger')"
t "1" A "select count(*) from public.admin_export('ledger')"
t "1" A "select count(*) from public.admin_export('payments')"
t "1" A "select count(*) from public.admin_list_audit() where action='payment_confirmed'"
t "3" A "select count(*) from public.admin_list_audit() where action like 'payout%' or action='leader_rate'"
t "50000.00" A "select public.admin_stats()->>'money_in'" 
t fail C "select public.admin_set_setting('pay_bkash','017XXXXXXXX')"
t fail P "select public.admin_set_setting('pay_bkash','017XXXXXXXX')"
t ok A "select public.admin_set_setting('pay_bkash','বিকাশ মার্চেন্ট: 01XXXXXXXXX (Travel Adda)')"
t "1" C "select count(*) from public.app_settings where key='pay_bkash'"
# staff without payments cannot see receipts or money
$Q "insert into auth.users (id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a3','01710000013@users.traveladda.app','{\"full_name\":\"Staff Q\"}')" >/dev/null
SQ=00000000-0000-0000-0000-0000000000a3
t ok A "select public.admin_set_staff('01710000013', array['calls'])"
t "0" SQ "select count(*) from public.haji_payments"
t "0" SQ "select count(*) from public.admin_list_payments(null)"
t fail SQ "select public.admin_add_payout('$K', 'leader', 1, 'X-123', null)"
$Q "insert into storage.objects (bucket_id, name) values ('receipts', '$C/r1.jpg')" >/dev/null
t "1" C "select count(*) from storage.objects where bucket_id='receipts'"
t "1" P "select count(*) from storage.objects where bucket_id='receipts'"
t "0" SQ "select count(*) from storage.objects where bucket_id='receipts'"
t "0" B "select count(*) from storage.objects where bucket_id='receipts'"
t "0" C "with d as (delete from storage.objects where bucket_id='receipts' and name='$C/r1.jpg' returning 1) select count(*) from d"
echo "pass=$pass fail=$fail"
