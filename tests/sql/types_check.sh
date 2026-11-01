# Builds the full database (every supabase/0*.sql step) and checks that src/lib/dbTypes.ts matches it.
# Fix a difference with: python3 tools/gen_db_types.py "<conn> -U postgres -d t" > src/lib/dbTypes.ts
bash /var/tmp/pgt/reset.sh >/dev/null 2>&1
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" >/dev/null 2>&1
for f in /home/claude/travel-adda/supabase/0*.sql; do
  case "$(basename "$f")" in 00[1-9]_*) continue ;; esac
  $P -f "$f" >/dev/null 2>&1 || { echo "SETUP FAILED: $f"; exit 1; }
done
python3 /home/claude/travel-adda/tools/gen_db_types.py "-h /var/tmp/pgt -p 5544 -U postgres -d t" > /tmp/dbTypes.ts || exit 1
if diff -u /home/claude/travel-adda/src/lib/dbTypes.ts /tmp/dbTypes.ts > /tmp/dbTypes.diff; then echo "types: pass=1 fail=0"
else echo "FAIL src/lib/dbTypes.ts is out of date with the database:"; head -40 /tmp/dbTypes.diff; echo "types: pass=0 fail=1"; exit 1; fi
