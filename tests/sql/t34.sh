. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 034 (owner, Nov 2026): a leader says how many seats are left on his package ("⏳ আসন বাকি"). Only the owner leader
# can change it, only through set_offer_seats (the server stamps the time), it never sends the package back to review,
# and hajis see it in list_offers.
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 023_admin_mfa 024_admin_part3 025_readonly_fix 026_admin_part4 027_help_fund 028_fund_access 029_fund_leader 030_group_remove 031_user_counts 032_public_counts 033_contact_email; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
for i in 1 2; do $P -f /home/claude/travel-adda/supabase/034_offer_seats.sql 2>&1 | grep -v "NOTICE\|skipping"; done   # safe to run twice
S=$(date +%s%N | tail -c 7)
as_user() { eval uid=\$$1; psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -v ON_ERROR_STOP=1 -c "begin; set local role authenticated; set local request.jwt.claim.sub='$uid'; set local request.jwt.claims='{\"aal\":\"aal2\"}'; $2; commit;"; }
O=$(as_user B "insert into public.offers (kind, title, price_bdt, depart_on, return_on, includes, from_airport, arrive_at, first_city, makkah_nights, madinah_nights, return_from, return_to) values ('umrah', 'আসন $S', 150000, current_date+30, current_date+44, '{flight}', 'DAC','JED','makkah',7,5,'MED','DAC') returning id" | head -1)
$Q "select public.admin_review_offer('$O', 'approve', null)" >/dev/null 2>&1 || $Q "update public.offers set review='approved' where id='$O'" >/dev/null
OLD=$($Q "insert into public.offers (leader_id, kind, title, price_bdt, depart_on, return_on, review, from_airport, arrive_at, first_city, makkah_nights, madinah_nights, return_from, return_to) values ('$B','umrah','পুরনো $S',1000,current_date-20,current_date-5,'approved','DAC','JED','makkah',7,5,'MED','DAC') returning id" | head -1)

# --- new columns start empty (unknown), with sane limits
t "|" C "select coalesce(seats_left::text,'')||'|'||coalesce(seats_updated_at::text,'') from public.list_offers('umrah') where id='$O'"
see() { r=$($Q "$2"); if [ "$r" = "$1" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$1/db] $2 -> $r"; fi; }
see "2" "select count(*) from information_schema.columns where table_schema='public' and table_name='offers' and column_name in ('seats_left','seats_updated_at')"

# --- the owner leader sets seats; the server stamps the time; review stays approved
t "ok" B "select public.set_offer_seats('$O', 5)"
t "5|true|approved" C "select seats_left||'|'||(seats_updated_at > now() - interval '1 minute')||'|'||(select review from public.offers where id='$O') from public.list_offers('umrah') where id='$O'"
t "ok" B "select public.set_offer_seats('$O', 0)"
t "0" C "select seats_left from public.list_offers('umrah') where id='$O'"
t "ok" B "select public.set_offer_seats('$O', null)"
t "" C "select coalesce(seats_left::text,'') from public.list_offers('umrah') where id='$O'"
t "|" C "select coalesce(seats_left::text,'')||'|'||coalesce(seats_updated_at::text,'') from public.list_offers('umrah') where id='$O'"

# --- wrong numbers are refused
t "bad_value" B "select public.set_offer_seats('$O', -1)"
t "bad_value" B "select public.set_offer_seats('$O', 501)"
t fail anon "select public.set_offer_seats('$O', 3)"

# --- nobody else can change it: other leader, a haji, the admin; and not on an old (finished) package
t "not_found" E "select public.set_offer_seats('$O', 3)"
t "not_found" C "select public.set_offer_seats('$O', 3)"
t "not_found" A "select public.set_offer_seats('$O', 3)"
t "not_found" B "select public.set_offer_seats('$OLD', 3)"
t "not_found" B "select public.set_offer_seats('00000000-0000-0000-0000-000000000123', 3)"
t "" C "select coalesce(seats_left::text,'') from public.list_offers('umrah') where id='$O'"

# --- the columns cannot be written directly (so the time cannot be faked)
t fail B "update public.offers set seats_left = 2 where id='$O'"
t fail B "update public.offers set seats_updated_at = now() + interval '1 year' where id='$O'"
t "" B "select coalesce(seats_left::text,'') from public.offers where id='$O'"

# --- list_offers keeps every earlier rule: no anon, nothing pending
t fail anon "select count(*) from public.list_offers('umrah')"
t "approved" C "select string_agg(distinct (select review from public.offers x where x.id = l.id), ',') from public.list_offers('umrah') l"
echo "t34: pass=$pass fail=$fail"
