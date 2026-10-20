. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
su() { exp="$1"; out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "$2" 2>&1); if [ "$(echo "$out" | tail -1)" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/su] $2 -> $out"; fi; }
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 012_terms; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v NOTICE; done
# --- texts readable by everyone (also before sign-up), written only by the admin
t "2" anon "select count(*) from public.app_texts where key in ('terms_haji','terms_leader')"
t "1" anon "select count(*) from public.app_texts where key='terms_haji' and body like '%হাজীদের জন্য শর্তাবলি%'"
t fail C "select public.admin_set_text('terms_haji','hack')"
t fail B "select public.admin_set_text('terms_leader','hack')"
t fail C "update public.app_texts set body='hack' where key='terms_haji'"
t fail C "with x as (update public.app_texts set body='hack' where key='terms_haji' returning 1) select count(*) from x"
t fail A "select public.admin_set_text('terms_other','x')"
# re-running 012 keeps the admin's own text
t "ok" A "select public.admin_set_text('terms_haji','অ্যাডমিনের নিজের লেখা হাজী শর্ত')"
$P -f /home/claude/travel-adda/supabase/012_terms.sql 2>&1 | grep -v NOTICE
t "অ্যাডমিনের নিজের লেখা হাজী শর্ত" anon "select body from public.app_texts where key='terms_haji'"
# --- agreeing
t fail anon "select public.agree_terms('terms_haji')"
t "bad" C "select public.agree_terms('terms')"
t "ok" C "select public.agree_terms('terms_haji')"
t "ok" C "select public.agree_terms('terms_haji')"
t "terms_haji|true" C "select key||'|'||current_version from public.my_terms()"
t fail C "select * from public.terms_agreements"
t fail C "insert into public.terms_agreements (user_id,key,version) values ('$F','terms_haji',now())"
t "0" F "select count(*) from public.my_terms()"
# terms changed: old agreement is no longer current
sleep 1
t "ok" A "select public.admin_set_text('terms_haji','নতুন সংস্করণ')"
t "terms_haji|false" C "select key||'|'||current_version from public.my_terms()"
t "ok" C "select public.agree_terms('terms_haji')"
t "terms_haji|true" C "select key||'|'||current_version from public.my_terms()"
t "terms_haji:1,terms_leader:0" A "select string_agg(key||':'||agreed, ',' order by key) from public.admin_terms_counts()"
t "" C "select string_agg(key, ',') from public.admin_terms_counts()"
# --- leader application needs the leader terms (E = pending leader account)
t fail E "insert into public.leader_applications (agency_name, license_no, umrah_license, district, upazila) values ('Agency E','U-1','U-1','সিলেট','সদর')"
t "f" E "select public.agreed_terms('terms_leader')"
t "ok" E "select public.agree_terms('terms_leader')"
t "ok" E "insert into public.leader_applications (agency_name, license_no, umrah_license, district, upazila) values ('Agency E','U-1','U-1','সিলেট','সদর')"
# a haji account still cannot apply even after agreeing
t "ok" C "select public.agree_terms('terms_leader')"
t fail C "insert into public.leader_applications (agency_name, license_no) values ('Agency C','X-1')"
# no leader text written: nothing to agree to (the rule does not block)
t "ok" A "select public.admin_set_text('terms_leader','')"
t "none" F "select public.agree_terms('terms_leader')"
t "t" F "select public.agreed_terms('terms_leader')"
# account deletion removes agreements
su "3" "select count(*) from public.terms_agreements where user_id='$C'"
echo "pass=$pass fail=$fail"
