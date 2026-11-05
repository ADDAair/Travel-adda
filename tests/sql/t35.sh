. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 035 (owner, Nov 2026): instead of deleting at once, a person can pause ("বন্ধ রাখা") and resume his account, and a
# deletion request waits 30 days (logging in and resuming cancels it); after 30 days the account is removed by a job.
# Google Play still gets a real deletion. Contract, payment and complaint records stay without the person (set null).
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 023_admin_mfa 024_admin_part3 025_readonly_fix 026_admin_part4 027_help_fund 028_fund_access 029_fund_leader 030_group_remove 031_user_counts 032_public_counts 033_contact_email 034_offer_seats; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
for i in 1 2; do $P -f /home/claude/travel-adda/supabase/035_account_pause.sql 2>&1 | grep -v "NOTICE\|skipping\|not scheduled\|not available"; done   # safe to run twice
see() { r=$($Q "$2"); if [ "$r" = "$1" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$1/db] $2 -> $r"; fi; }
NOW=$(date +%s); OLD=$((NOW-3600))
FRESH="{\"aal\":\"aal2\",\"amr\":[{\"method\":\"password\",\"timestamp\":$NOW}]}"
STALE="{\"aal\":\"aal2\",\"amr\":[{\"method\":\"password\",\"timestamp\":$OLD}]}"
run() { eval uid=\$$1; psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -v ON_ERROR_STOP=1 -c "begin; set local role authenticated; set local request.jwt.claim.sub='$uid'; set local request.jwt.claims='$2'; $3; commit;" 2>&1 | tail -1; }
chk() {   # chk <expected value | fail> <user> <claims> <sql>
  eval uid=\$$2
  if [ "$2" = anon ]; then pre="set local role anon;"; else pre="set local role authenticated; set local request.jwt.claim.sub='$uid'; set local request.jwt.claims='$3';"; fi
  out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -v ON_ERROR_STOP=1 -c "begin; $pre $4; commit;" 2>&1); rc=$?
  if [ "$1" = fail ]; then [ $rc != 0 ] && ok=1 || ok=0; else [ $rc = 0 ] && [ "$(echo "$out" | tail -1)" = "$1" ] && ok=1 || ok=0; fi
  if [ $ok = 1 ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$1/$2] $4 -> $out"; fi; }
S=$(date +%s%N | tail -c 7)
# two fresh people: a haji H and a leader L with an approved package
H=00000000-0000-0000-0000-0000000000c1; L=00000000-0000-0000-0000-0000000000c2; H2=00000000-0000-0000-0000-0000000000c3
for u in $H:01711110001 $L:01711110002 $H2:01711110003; do $Q "insert into auth.users (id, email, raw_user_meta_data) values ('${u%%:*}','${u##*:}@users.traveladda.app','{\"full_name\":\"P $S\"}') on conflict do nothing" >/dev/null; done
$Q "update public.profiles set role='leader', account_type='leader' where id='$L'" >/dev/null
O=$($Q "insert into public.offers (leader_id, kind, title, price_bdt, depart_on, return_on, review, from_airport, arrive_at, first_city, makkah_nights, madinah_nights, return_from, return_to) values ('$L','umrah','বিরতি $S',1000,current_date+30,current_date+44,'approved','DAC','JED','makkah',7,5,'MED','DAC') returning id" | head -1)

# --- columns and the new status exist; people cannot write them directly
see "3" "select count(*) from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('paused_at','delete_after','status')"
chk fail H "$FRESH" "update public.profiles set status='paused' where id='$H'"
chk fail H "$FRESH" "update public.profiles set delete_after=now() where id='$H'"

# --- pausing needs a fresh password, and only an active account can pause
chk "password_needed" H "$STALE" "select public.pause_my_account()"
chk "password_needed" H "{}" "select public.pause_my_account()"
see "active" "select status from public.profiles where id='$H'"
chk "ok" L "$FRESH" "select public.pause_my_account()"
see "paused|true" "select status||'|'||(paused_at is not null) from public.profiles where id='$L'"
chk "not_active" L "$FRESH" "select public.pause_my_account()"

# --- a paused leader and his packages are hidden from hajis
chk "0" C "$FRESH" "select count(*) from public.list_offers('umrah') where id='$O'"
chk "0" C "$FRESH" "select count(*) from public.list_leaders(null, null) where id='$L'"

# --- resume: back to active, both dates cleared; resuming twice says so
chk "ok" L "{}" "select public.resume_my_account()"
see "active||" "select status||'|'||coalesce(paused_at::text,'')||'|'||coalesce(delete_after::text,'') from public.profiles where id='$L'"
chk "1" C "$FRESH" "select count(*) from public.list_offers('umrah') where id='$O'"
chk "not_paused" L "{}" "select public.resume_my_account()"

# --- an accepted contract blocks pausing (the other side must be able to reach him)
$Q "insert into public.haji_contracts (leader_id, haji_id, leader_name, leader_code, haji_name, haji_code, kind, title, price_bdt, includes, refund_policy, status) values ('$L','$H2','L','TL-1','H','TA-1','umrah','চুক্তি $S',1000,'সব','নিয়ম','accepted')" >/dev/null
HAS=$($Q "select count(*) from public.haji_contracts where haji_id='$H2' and status='accepted'")
if [ "$HAS" = "1" ]; then
  chk "has_contract" H2 "$FRESH" "select public.pause_my_account()"
  chk "has_contract" L "$FRESH" "select public.pause_my_account()"
else fail=$((fail+1)); echo "FAIL could not make a test contract"; fi

# --- deletion request: fresh password; account paused at once; removal date 30 days ahead; repeating keeps the date
chk "password_needed" H "$STALE" "select public.request_account_deletion()"
chk "ok" H "$FRESH" "select public.request_account_deletion()"
see "paused|true" "select status||'|'||(delete_after between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour') from public.profiles where id='$H'"
D1=$($Q "select delete_after from public.profiles where id='$H'")
chk "ok" H "$FRESH" "select public.request_account_deletion()"
see "$D1" "select delete_after from public.profiles where id='$H'"
# the old app's delete_my_account() now also waits 30 days (it no longer removes at once)
chk fail H2 "$STALE" "select public.delete_my_account()"
chk "" H2 "$FRESH" "select public.delete_my_account()"
see "1|true" "select count(*)||'|'||bool_and(delete_after is not null) from public.profiles where id='$H2'"

# --- logging in and resuming cancels the deletion
chk "ok" H "{}" "select public.resume_my_account()"
see "active|" "select status||'|'||coalesce(delete_after::text,'') from public.profiles where id='$H'"

# --- an admin-suspended account cannot resume itself; it can still ask for deletion and cancel only that
$Q "update public.profiles set status='suspended' where id='$H'" >/dev/null
chk "ok" H "$FRESH" "select public.request_account_deletion()"
see "suspended|true" "select status||'|'||(delete_after is not null) from public.profiles where id='$H'"
chk "ok" H "{}" "select public.resume_my_account()"
see "suspended|" "select status||'|'||coalesce(delete_after::text,'') from public.profiles where id='$H'"
chk "not_paused" H "{}" "select public.resume_my_account()"

# --- the removal job: only accounts whose 30 days are over; nobody can call it from the app
chk fail H "$FRESH" "select public.purge_deleted_accounts()"
chk fail anon "{}" "select public.purge_deleted_accounts()"
$Q "update public.profiles set delete_after = now() - interval '1 minute' where id='$H2'" >/dev/null
see "1" "select public.purge_deleted_accounts()"
see "0" "select count(*) from auth.users where id='$H2'"
see "1" "select count(*) from auth.users where id='$H'"
see "1" "select count(*) from public.haji_contracts where leader_id='$L' and haji_id is null"   # the contract stays, without the person
see "0" "select public.purge_deleted_accounts()"
echo "t35: pass=$pass fail=$fail"
