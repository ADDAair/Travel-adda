. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 020: every new package states its journey (airports, nights in Makkah / Madinah, return), and the package list
# shows who the leader is (ID, rating, verified complaints) — never the leader's phone.
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 020_offer_route; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|skipping\|not available\|not scheduled\|accounts moved"; done
S=$(date +%s%N | tail -c 7)
COLS="kind, title, price_bdt, depart_on, return_on, includes, from_airport, arrive_at, first_city, makkah_nights, madinah_nights, return_from, return_to, airline"
V="current_date+30, current_date+44, '{flight,visa}'"          # 15 days
ok_route="'DAC','JED','makkah',7,5,'MED','DAC','বিমান বাংলাদেশ'"
ins() { echo "insert into public.offers ($COLS) values ('umrah', '$1', 150000, $V, $2) returning id"; }
as_user() { eval uid=\$$1; psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -v ON_ERROR_STOP=1 -c "begin; set local role authenticated; set local request.jwt.claim.sub='$uid'; $2; commit;"; }

# --- the journey is required and must make sense
t fail B "insert into public.offers (kind, title, price_bdt, depart_on, return_on) values ('umrah', 'no route $S', 1000, current_date+30, current_date+40)"
t fail B "$(ins "bad airport $S" "'XXX','JED','makkah',7,5,'MED','DAC',null")"
t fail B "$(ins "bad saudi $S" "'DAC','RUH','makkah',7,5,'MED','DAC',null")"
t fail B "$(ins "bad city $S" "'DAC','JED','taif',7,5,'MED','DAC',null")"
t fail B "$(ins "no makkah $S" "'DAC','JED','madinah',0,5,'MED','DAC',null")"
t fail B "$(ins "neg $S" "'DAC','JED','makkah',7,-1,'MED','DAC',null")"
t fail B "$(ins "too many nights $S" "'DAC','JED','makkah',10,6,'MED','DAC',null")"
t fail B "$(ins "half route $S" "'DAC',null,'makkah',7,5,'MED','DAC',null")"
t fail B "$(ins "long airline $S" "'DAC','JED','makkah',7,5,'MED','DAC','$(printf 'ক%.0s' $(seq 1 61))'")"
O=$(as_user B "$(ins "পূর্ণ প্যাকেজ $S" "$ok_route")" | head -1)
t "DAC|JED|makkah|7|5|MED|DAC|বিমান বাংলাদেশ" B "select concat_ws('|', from_airport, arrive_at, first_city, makkah_nights, madinah_nights, return_from, return_to, airline) from public.offers where id='$O'"
t ok B "$(ins "শুধু মক্কা $S" "'CGP','JED','makkah',12,0,'JED','CGP',null")"

# --- while waiting the journey can be changed; an old package (no journey) must get one when it is changed
t ok B "update public.offers set madinah_nights=4, return_from='JED' where id='$O'"
t fail B "update public.offers set makkah_nights=20 where id='$O'"
OLD=$($Q "insert into public.offers (leader_id, kind, title, price_bdt, depart_on, return_on, review) values ('$B','umrah','old $S',1000,current_date+30,current_date+40,'pending') returning id" | head -1)
t ok B "update public.offers set active=false where id='$OLD'"
t fail B "update public.offers set title='old changed $S' where id='$OLD'"
t ok B "update public.offers set title='old fixed $S', from_airport='ZYL', arrive_at='MED', first_city='madinah', makkah_nights=4, madinah_nights=4, return_from='JED', return_to='ZYL' where id='$OLD'"

# --- hajis see the journey and who the leader is (ID, rating, complaints), never a phone
t ok A "select public.admin_review_offer('$O', 'approve', null)"
t "পূর্ণ প্যাকেজ $S|DAC|7|4|JED" C "select concat_ws('|', title, from_airport, makkah_nights, madinah_nights, return_from) from public.list_offers('umrah') where id='$O'"
LC=$($Q "select haji_code from public.profiles where id='$B'")
t "$B|$LC|Leader B|agency" C "select concat_ws('|', leader_id, leader_code, leader_name, leader_kind) from public.list_offers('umrah') where id='$O'"
t "0.0|0|0" C "select concat_ws('|', rating_avg, rating_count, complaints_verified) from public.list_offers('umrah') where id='$O'"
t "0" C "select count(*) from information_schema.columns where table_schema='public' and table_name='offers' and column_name like '%phone%'"
t fail C "select leader_phone from public.list_offers('umrah') limit 1"
t fail anon "select count(*) from public.list_offers('umrah')"
# admin sees the journey while checking
t "DAC|JED" A "select from_airport||'|'||arrive_at from public.admin_offers_review() where id='$O'"
echo "t20: pass=$pass fail=$fail"
