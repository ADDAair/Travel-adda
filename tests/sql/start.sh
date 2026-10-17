B=/usr/lib/postgresql/16/bin
psql -h /var/tmp/pgt -p 5544 -U postgres -c 'select 1' >/dev/null 2>&1 && exit 0
pkill -u pgtest postgres 2>/dev/null; sleep 1
rm -f /var/tmp/pgt/data/postmaster.pid /var/tmp/pgt/.s.PGSQL.5544*
su pgtest -s /bin/sh -c "$B/pg_ctl -D /var/tmp/pgt/data -o '-p 5544 -k /var/tmp/pgt' -l /var/tmp/pgt/log start -w" >/dev/null
psql -h /var/tmp/pgt -p 5544 -U postgres -c 'select 1' >/dev/null && echo started
