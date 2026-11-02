. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 033 (owner, Nov 2026): the contact e-mail inside the saved terms becomes amihaji.bd@gmail.com. Only the e-mail changes;
# the version people agreed to (updated_at) stays, so nobody is asked to agree again.
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
$Q "delete from public.app_settings where key='haji_count_min'" >/dev/null 2>&1
$Q "update public.app_texts set body = replace(body, 'amihaji.bd@gmail.com', 'traveladda.z@gmail.com'), updated_at = '2026-10-30 10:00+00' where key in ('terms_haji', 'terms_leader')" >/dev/null 2>&1   # start from the old e-mail
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 023_admin_mfa 024_admin_part3 025_readonly_fix 026_admin_part4 027_help_fund 028_fund_access 029_fund_leader 030_group_remove 031_user_counts 032_public_counts; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
$Q "update public.app_texts set body = replace(body, 'amihaji.bd@gmail.com', 'traveladda.z@gmail.com'), updated_at = '2026-10-30 10:00+00' where key in ('terms_haji', 'terms_leader')" >/dev/null
see() { r=$($Q "$2"); if [ "$r" = "$1" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$1/db] $2 -> $r"; fi; }
see "2" "select count(*) from public.app_texts where key in ('terms_haji','terms_leader') and body like '%traveladda.z@gmail.com%'"
# a haji agreed to the old text
$Q "delete from public.terms_agreements where user_id='$C'; insert into public.terms_agreements (user_id, key, version) select '$C', 'terms_haji', updated_at from public.app_texts where key='terms_haji'" >/dev/null
# run 033 (twice: safe to repeat)
for i in 1 2; do $P -f /home/claude/travel-adda/supabase/033_contact_email.sql 2>&1 | grep -v NOTICE; done
see "0" "select count(*) from public.app_texts where body like '%traveladda.z@gmail.com%'"
see "2" "select count(*) from public.app_texts where key in ('terms_haji','terms_leader') and body like '%amihaji.bd@gmail.com%'"
see "2" "select count(*) from public.app_texts where key in ('terms_haji','terms_leader') and updated_at = '2026-10-30 10:00+00'"
t "t" C "select bool_and(current_version) from public.my_terms()"
echo "t33: pass=$pass fail=$fail"
