. /var/tmp/pgt/as.sh
NEW="insert into public.offers (kind,title,price_bdt,depart_on,return_on,makkah_hotel,makkah_distance_m,includes) values"
# settings
t ok A "select public.admin_set_setting('helpline_phone','+8801700000000')"
t fail A "select public.admin_set_setting('helpline_phone','call me 123')"
t fail C "select public.admin_set_setting('helpline_phone','01800000000')"
t fail B "select public.admin_set_setting('helpline_phone','01800000000')"
t fail C "insert into public.app_settings values ('helpline_phone','0199')"
t "+8801700000000" C "select value from public.app_settings where key='helpline_phone'"
t fail anon "select value from public.app_settings"
# offers insert
t ok B "$NEW ('umrah','Umrah 14 days',150000,current_date+30,current_date+44,'Hotel X',300,'{flight,visa,food}')"
t ok B "$NEW ('hajj','Hajj',650000,current_date+200,current_date+240,'H',800,'{flight}')"
t ok D "$NEW ('umrah','D cheap',120000,current_date+30,current_date+40,null,null,'{}')"
t fail C "$NEW ('umrah','haji offer',1000,current_date+30,current_date+40,null,null,'{}')"
t fail A "$NEW ('umrah','admin offer',1000,current_date+30,current_date+40,null,null,'{}')"
t fail B "$NEW ('umrah','past',1000,current_date-3,current_date+4,null,null,'{}')"
t fail B "$NEW ('umrah','reverse',1000,current_date+30,current_date+20,null,null,'{}')"
t fail B "$NEW ('umrah','bad inc',1000,current_date+30,current_date+40,null,null,'{casino}')"
t fail B "$NEW ('umrah','zero',0,current_date+30,current_date+40,null,null,'{}')"
t fail B "insert into public.offers (leader_id,kind,title,price_bdt,depart_on,return_on) values ('$D','umrah','spoof',1000,current_date+30,current_date+40)"
t fail B "insert into public.offers (kind,title,price_bdt,depart_on,return_on,hidden_by_admin) values ('umrah','x',1000,current_date+30,current_date+40,false)"
# listing
t "2" C "select count(*) from public.list_offers('umrah')"
t "D cheap" C "select title from public.list_offers('umrah') limit 1"
t "Agency B" C "select agency_name from public.list_offers('umrah') where title like 'Umrah%'"
t fail anon "select count(*) from public.list_offers('umrah')"
OB=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "select id from public.offers where title='Umrah 14 days'")
OD=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "select id from public.offers where title='D cheap'")
# no edit
t fail B "update public.offers set title='x' where id='$OB'"
t fail B "update public.offers set price_bdt=1 where id='$OB'"
t fail B "update public.offers set hidden_by_admin=false where id='$OB'"
t fail B "delete from public.offers where id='$OB'"
t "0" D "with u as (update public.offers set active=false where id='$OB' returning 1) select count(*) from u"
t "0" C "with u as (update public.offers set active=false where id='$OB' returning 1) select count(*) from u"
# interests
t ok C "insert into public.offer_interests (offer_id) values ('$OB')"
t fail C "insert into public.offer_interests (offer_id) values ('$OB')"
t fail C "insert into public.offer_interests (offer_id, user_id) values ('$OD','$A')"
t fail C "insert into public.offer_interests (offer_id, status) values ('$OD','contacted')"
t "1" C "select count(*) from public.offer_interests"
t "0" B "select count(*) from public.offer_interests"
t "1|1" B "select total||'|'||open from public.my_offer_interest_counts() where offer_id='$OB'"
t "0" D "select count(*) from public.my_offer_interest_counts() where offer_id='$OB'"
t "0" B "select count(*) from public.admin_list_interests()"
t "0" C "select count(*) from public.admin_list_interests()"
t "Haji C|01710000003|Agency B|01710000002" A "select full_name||'|'||phone||'|'||agency_name||'|'||leader_phone from public.admin_list_interests()"
IID=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "select id from public.offer_interests limit 1")
t fail C "select public.admin_mark_interest('$IID','x')"
t fail C "update public.offer_interests set status='contacted'"
t ok A "select public.admin_mark_interest('$IID','called, meeting Sunday')"
t "0" C "with d as (delete from public.offer_interests where id='$IID' returning 1) select count(*) from d"
t ok C "insert into public.offer_interests (offer_id) values ('$OB')"
t "1" C "with d as (delete from public.offer_interests where status='new' returning 1) select count(*) from d"
# hide
t ok B "update public.offers set active=false where id='$OB'"
t "1" C "select count(*) from public.list_offers('umrah')"
t fail C "insert into public.offer_interests (offer_id) values ('$OB')"
t "0" C "select count(*) from public.offers where id='$OB'"
t "1" B "select count(*) from public.offers where id='$OB'"
t ok B "update public.offers set active=true where id='$OB'"
t fail B "select public.admin_hide_offer('$OD', true)"
t ok A "select public.admin_hide_offer('$OD', true)"
t "1" C "select count(*) from public.list_offers('umrah')"
t "Umrah 14 days" C "select title from public.list_offers('umrah')"
t ok D "update public.offers set active=true where id='$OD'"
t "1" C "select count(*) from public.list_offers('umrah')"
# demoted / suspended leader disappears
psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qc "update public.profiles set status='suspended' where id='$B'"
t "0" C "select count(*) from public.list_offers('umrah')"
t fail B "$NEW ('umrah','after suspend',1000,current_date+30,current_date+40,null,null,'{}')"
psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qc "update public.profiles set status='active' where id='$B'"
# rate limit of open requests
for i in $(seq 1 11); do psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qc "insert into public.offers (leader_id,kind,title,price_bdt,depart_on,return_on) values ('$B','umrah','bulk$i',1000,current_date+30,current_date+40)"; done
for i in $(seq 1 10); do t ok C "insert into public.offer_interests (offer_id) select id from public.offers where title='bulk$i'"; done
t fail C "insert into public.offer_interests (offer_id) select id from public.offers where title='bulk11'"
# 20 active offers limit
t "13" B "select public.my_active_offer_count()"
for i in $(seq 1 7); do t ok B "$NEW ('umrah','fill$i',1000,current_date+30,current_date+40,null,null,'{}')"; done
t fail B "$NEW ('umrah','over limit',1000,current_date+30,current_date+40,null,null,'{}')"
echo "pass=$pass fail=$fail"
