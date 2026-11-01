. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 030: a leader can remove a group made by mistake (owner, Nov 2026). An empty group (nobody joined or was invited, no
# chats or terms) is deleted for good; a group with any history is closed instead (records stay, nobody can join).
# A closed group can be opened again.
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 023_admin_mfa 024_admin_part3 025_readonly_fix 026_admin_part4 027_help_fund 028_fund_access 029_fund_leader 030_group_remove 030_group_remove; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
mk() { $Q "insert into public.groups (id, leader_id, name) values ('$1', '$B', 'দল $1')" >/dev/null; }
G1=00000000-0000-0000-0000-0000000000a1; G2=00000000-0000-0000-0000-0000000000a2; G3=00000000-0000-0000-0000-0000000000a3
mk $G1; mk $G2; mk $G3
# database-side check (as the owner of the database, past row security)
see() { r=$($Q "$2"); if [ "$r" = "$1" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$1/db] $2 -> $r"; fi; }
# only the group's own leader
t fail C "select public.leader_remove_group('$G1')"
t fail D "select public.leader_remove_group('$G1')"
t fail anon "select public.leader_remove_group('$G1')"
see "1" "select count(*) from public.groups where id='$G1'"
# empty group: deleted for good
t "deleted" B "select public.leader_remove_group('$G1')"
see "0" "select count(*) from public.groups where id='$G1'"
t "not_found" B "select public.leader_remove_group('$G1')"
# someone joined: closed, not deleted; nobody can join it any more
CODE=$($Q "select join_code from public.groups where id='$G2'")
t "ok" C "select public.join_group('$CODE')"
t "closed" B "select public.leader_remove_group('$G2')"
see "f" "select active from public.groups where id='$G2'"
see "1" "select count(*) from public.group_members where group_id='$G2'"
t "bad_code" F "select public.join_group('$CODE')"
t "already_closed" B "select public.leader_remove_group('$G2')"
# an invite alone also counts as history (so a deleted group can't reset the daily invite limit)
$Q "insert into public.leader_invites (leader_id, group_id, kind, hint) values ('$B', '$G3', 'member', '01***78')" >/dev/null
t "closed" B "select public.leader_remove_group('$G3')"
# open again
t "ok" B "select public.leader_reopen_group('$G2')"
see "t" "select active from public.groups where id='$G2'"
t fail D "select public.leader_reopen_group('$G2')"
echo "t30: pass=$pass fail=$fail"
