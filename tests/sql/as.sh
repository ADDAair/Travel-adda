# usage: t <expect ok|fail|VALUE> <user letter or anon> <sql>
A=00000000-0000-0000-0000-00000000000a; B=00000000-0000-0000-0000-00000000000b; C=00000000-0000-0000-0000-00000000000c; D=00000000-0000-0000-0000-00000000000d; E=00000000-0000-0000-0000-00000000000e; F=00000000-0000-0000-0000-00000000000f
pass=0; fail=0
t() {
  exp="$1"; who="$2"; sql="$3"
  if [ "$who" = anon ]; then pre="set local role anon;"; else eval uid=\$$who; pre="set local role authenticated; set local request.jwt.claim.sub='$uid'; set local request.jwt.claims='{\"aal\":\"aal2\"}';"; fi   # a session that passed 2FA (023)
  out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -v ON_ERROR_STOP=1 -c "begin; $pre $sql; commit;" 2>&1)
  rc=$?
  if [ "$exp" = ok ]; then [ $rc = 0 ] && r=1 || r=0; elif [ "$exp" = fail ]; then [ $rc != 0 ] && r=1 || r=0; else [ "$(echo "$out" | tail -1)" = "$exp" ] && r=1 || r=0; fi
  if [ $r = 1 ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/$who] $sql -> $out"; fi
}
