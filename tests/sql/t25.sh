. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# Read-only safety. The server (PostgREST) runs every "stable" function inside a READ ONLY transaction, so a stable
# function must never write (insert/update/delete, work-record log, notifications). Bug found by the owner Oct 2026:
# admin_user_detail was stable but writes 'user_viewed' -> "কাজটি হয়নি" on the user page.
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 023_admin_mfa 024_admin_part3 025_readonly_fix 025_readonly_fix; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
# 1) no stable/immutable function in public writes anything
BAD=$($Q "select string_agg(p.proname, ', ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.provolatile in ('s','i')
    and p.prosrc ~* '(insert[[:space:]]+into|update[[:space:]]+public\.|delete[[:space:]]+from|log_admin|notify_user|perform[[:space:]]+public\.(log|notify))'")
if [ -z "$BAD" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL stable functions that write: $BAD"; fi
# 2) the user page works the way the server calls it (read-only transaction) and is still logged
r=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -v ON_ERROR_STOP=1 -c "begin; set local role authenticated; set local request.jwt.claim.sub='$A'; set local request.jwt.claims='{\"aal\":\"aal2\"}'; select (public.admin_user_detail('$C'))->>'full_name'; commit;" 2>&1)
if [ "$(echo "$r" | tail -1)" = "Haji C" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL user page: $r"; fi
t "1" A "select count(*) from public.admin_list_audit() where action='user_viewed'"
echo "t25: pass=$pass fail=$fail"
