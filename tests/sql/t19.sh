. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
su() { exp="$1"; out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "$2" 2>&1); if [ "$(echo "$out" | tail -1)" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/su] $2 -> $out"; fi; }
# 019: a leader's package waits for admin approval; it can be changed only until it is approved; no qurbani in umrah.
# B = approved leader, D = other leader, C = haji, A = admin
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 019_offer_review 020_offer_route; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|skipping\|not available\|not scheduled\|accounts moved"; done
D1=$($Q "select (current_date + 30)::text"); D2=$($Q "select (current_date + 44)::text"); OLD=$($Q "select (current_date - 1)::text")
as_user() { eval uid=\$$1; psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -v ON_ERROR_STOP=1 -c "begin; set local role authenticated; set local request.jwt.claim.sub='$uid'; $2; commit;"; }
S=$(date +%s%N | tail -c 7)   # unique per run
ins() { echo "insert into public.offers (kind, title, price_bdt, depart_on, return_on, includes, from_airport,arrive_at,first_city,makkah_nights,madinah_nights,return_from,return_to) values ('$1', '$2', 150000, '$D1', '$D2', '$3', 'DAC','JED','makkah',3,2,'JED','DAC') returning id"; }

# --- a new package waits for approval; hajis do not see it
O1=$(as_user B "$(ins umrah "রমজান প্যাকেজ $S" '{flight,visa}')" | head -1)
t "pending" B "select review from public.offers where id='$O1'"
t "0" C "select count(*) from public.list_offers('umrah') where id='$O1'"
t "0" C "select count(*) from public.offers where id='$O1'"
t "f" C "select public.offer_is_visible('$O1')"
t fail B "insert into public.offers (kind, title, price_bdt, depart_on, return_on, review, from_airport,arrive_at,first_city,makkah_nights,madinah_nights,return_from,return_to) values ('umrah','x y',1000,'$D1','$D2','approved', 'DAC','JED','makkah',3,2,'JED','DAC')"
t "t" A "select (public.admin_stats()->>'offers_pending')::int >= 1"

# --- while waiting, the leader can change it; nobody else can
t ok B "update public.offers set title='রমজান ১৫ দিন $S', price_bdt=160000 where id='$O1'"
t "রমজান ১৫ দিন $S|160000.00|pending" B "select title||'|'||price_bdt||'|'||review from public.offers where id='$O1'"
t fail B "update public.offers set review='approved' where id='$O1'"
t fail B "update public.offers set review_note='x' where id='$O1'"
t "0" D "with u as (update public.offers set title='হ্যাক' where id='$O1' returning 1) select count(*) from u"
t "0" C "with u as (update public.offers set title='হ্যাক' where id='$O1' returning 1) select count(*) from u"
t fail B "update public.offers set depart_on='$OLD' where id='$O1'"

# --- no qurbani in an umrah package (new, edited, or switched kind); hajj may have it
t fail B "$(ins umrah 'ওমরাহ কুরবানি' '{flight,qurbani}')"
t fail B "update public.offers set includes='{flight,qurbani}' where id='$O1'"
O2=$(as_user B "$(ins hajj "হজ প্যাকেজ $S" '{flight,qurbani}')" | head -1)
t "hajj" B "select kind from public.offers where id='$O2'"
t fail B "update public.offers set kind='umrah' where id='$O2'"

# --- only admin (or staff with the 'offers' permission) decides
t fail B "select public.admin_review_offer('$O1', 'approve', null)"
t fail C "select public.admin_review_offer('$O1', 'approve', null)"
t fail anon "select public.admin_review_offer('$O1', 'approve', null)"
t fail A "select public.admin_review_offer('$O1', 'maybe', null)"
t "ok" A "select public.admin_review_offer('$O1', 'approve', null)"
t "approved" B "select review from public.offers where id='$O1'"
t "not_pending" A "select public.admin_review_offer('$O1', 'approve', null)"
t "1" C "select count(*) from public.list_offers('umrah') where id='$O1'"
t "t" C "select public.offer_is_visible('$O1')"
t "1" B "select count(*) from public.user_notifications where user_id='$B' and route='LeaderOffers' and title like '%অনুমোদন%$S%'"

# --- after approval the content is locked (no bait-and-switch); hiding still works
t fail B "update public.offers set price_bdt=99000 where id='$O1'"
t fail B "update public.offers set title='অন্য নাম' where id='$O1'"
t "160000.00" B "select price_bdt from public.offers where id='$O1'"
t ok B "update public.offers set active=false where id='$O1'"
t ok B "update public.offers set active=true where id='$O1'"

# --- rejection needs a reason; the leader fixes it and it goes back to waiting
t fail A "select public.admin_review_offer('$O2', 'reject', null)"
t fail A "select public.admin_review_offer('$O2', 'reject', ' ')"
t "ok" A "select public.admin_review_offer('$O2', 'reject', 'হোটেলের নাম দিন $S')"
t "rejected|হোটেলের নাম দিন $S" B "select review||'|'||review_note from public.offers where id='$O2'"
t "0" C "select count(*) from public.list_offers('hajj') where id='$O2'"
t "1" B "select count(*) from public.user_notifications where user_id='$B' and route='LeaderOffers' and body like '%হোটেলের নাম দিন $S%'"
t ok B "update public.offers set makkah_hotel='আল সাফা' where id='$O2'"
t "pending|" B "select review||'|'||coalesce(review_note,'') from public.offers where id='$O2'"

# --- admin sees waiting packages first
t "$O2" A "select id from public.admin_offers_review() limit 1"
t fail B "select count(*) from public.admin_offers_review()"
t fail C "select count(*) from public.admin_offers_review()"
echo "t19: pass=$pass fail=$fail"
