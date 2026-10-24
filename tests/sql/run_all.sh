#!/bin/bash
# Runs every database security/integration suite (t5–t16) against a throw-away PostgreSQL that mimics Supabase.
# Each suite starts from a fresh database. Exit code 1 if any check fails.
#   CONN  how to reach PostgreSQL as user postgres (default: -h localhost -p 5432, as in GitHub Actions)
#   W     scratch folder for the adapted scripts (default: /var/tmp/pgt-ci)
set -u
REPO=${REPO:-$(cd "$(dirname "$0")/../.." && pwd)}
CONN=${CONN:--h localhost -p 5432}
W=${W:-/var/tmp/pgt-ci}
mkdir -p "$W"
for f in "$REPO"/tests/sql/*.sh "$REPO"/tests/sql/stub.sql; do
  b=$(basename "$f"); [ "$b" = run_all.sh ] && continue
  sed -e "s#/home/claude/travel-adda#$REPO#g" -e "s#-h /var/tmp/pgt -p 5544#$CONN#g" -e "s#/var/tmp/pgt/#$W/#g" "$f" > "$W/$b"
done
echo 'true' > "$W/start.sh"
P="psql $CONN -U postgres -d t -q -v ON_ERROR_STOP=1"
NET="create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create table if not exists net.sent (id bigserial primary key, url text, body jsonb); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'"
prep_all() {   # newest database: every step applied, the pending test leader already agreed to the leader terms
  bash "$W/reset.sh" >/dev/null 2>&1
  $P -c "$NET" >/dev/null 2>&1
  for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login; do $P -f "$REPO/supabase/$f.sql" >/dev/null 2>&1 || echo "SETUP FAILED: $f"; done
  $P -c "insert into public.terms_agreements (user_id,key,version) select '00000000-0000-0000-0000-00000000000e', key, updated_at from public.app_texts where key='terms_leader' on conflict do nothing" >/dev/null 2>&1
}
total_fail=0; summary=""
for s in t5 t6 t7 t8 t9 t11 t12 t13 t14 t15 t16; do
  case $s in t5|t6|t7|t8|t9) prep_all ;; *) bash "$W/reset.sh" >/dev/null 2>&1 ;; esac
  out=$(bash "$W/$s.sh" 2>&1)
  line=$(echo "$out" | grep -oE "pass=[0-9]+ fail=[0-9]+" | tail -1)
  f=$(echo "$line" | sed -E 's/.*fail=([0-9]+)/\1/'); [ -z "$line" ] && { f=1; line="no result"; }
  echo "$out" | grep -E "^FAIL|SETUP FAILED" | head -20
  summary="$summary $s:$line"
  total_fail=$((total_fail + f))
done
echo "SUMMARY$summary"
[ $total_fail -eq 0 ] && echo "ALL DATABASE SUITES PASSED" || { echo "DATABASE CHECKS FAILED: $total_fail"; exit 1; }
