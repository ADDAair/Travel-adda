. /var/tmp/pgt/as.sh
su() { exp="$1"; out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "$2" 2>&1); if [ "$(echo "$out" | tail -1)" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/su] $2 -> $out"; fi; }
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# fake pg_net: records requests; answers can be inserted by hand
$P <<'S'
create schema if not exists net;
create table if not exists net.sent (id bigserial primary key, url text, body jsonb);
create table if not exists net._http_response (id bigint primary key, status_code int, content text, created timestamptz default now());
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net.sent (url, body) values (url, body) returning id $$;
S
$P -f /home/claude/travel-adda/supabase/011_push.sql 2>&1 | grep -v NOTICE
$P -f /home/claude/travel-adda/supabase/011_push.sql 2>&1 | grep -v NOTICE
$Q "update public.profiles set created_at = now() - interval '10 days'" >/dev/null
CC=$($Q "select haji_code from public.profiles where id='$C'")
TC='ExponentPushToken[cccccccccccccccccccc]'; TC2='ExponentPushToken[cc22cccccccccccccccc]'; TB='ExponentPushToken[bbbbbbbbbbbbbbbbbbbb]'; TF='ExponentPushToken[ffffffffffffffffffff]'
# --- registering
t fail anon "select public.register_push_token('$TC','android')"
t "bad" C "select public.register_push_token('not a token','android')"
t "bad" C "select public.register_push_token('ExponentPushToken[x'';drop]','android')"
t "ok" C "select public.register_push_token('$TC','android')"
t "ok" C "select public.register_push_token('$TC','android')"
t "ok" C "select public.register_push_token('$TC2','android')"
t "ok" B "select public.register_push_token('$TB','android')"
t "ok" F "select public.register_push_token('$TF','android')"
t "2" C "select public.my_push_count()"
t fail C "select * from public.push_tokens"
t fail C "insert into public.push_tokens (token, user_id) values ('$TF','$C')"
t fail C "select public.push_send(array['$TB'],'spam','x',false)"
t fail C "select public.push_cleanup()"
# --- a personal notice reaches only that person's phones, title only
$Q "delete from net.sent" >/dev/null
t "ok" A "select public.admin_send_notification('one','শুধু আপনাকে','গোপন বিস্তারিত', '$CC',false)"
su "1" "select count(*) from net.sent"
su "2" "select jsonb_array_length(body) from net.sent"
su "$TC2,$TC" "select string_agg(m->>'to', ',' order by m->>'to') from net.sent, jsonb_array_elements(body) m"
su "0" "select count(*) from net.sent, jsonb_array_elements(body) m where m->>'body' like '%গোপন%'"
su "শুধু আপনাকে" "select distinct m->>'title' from net.sent, jsonb_array_elements(body) m"
su "Notifications" "select distinct m->'data'->>'route' from net.sent, jsonb_array_elements(body) m"
# --- general notices go to their audience only
$Q "delete from net.sent" >/dev/null
t "ok" A "select public.admin_send_notification('leader','শুধু লিডারদের','লিডার সভা',null,true)"
su "$TB" "select string_agg(m->>'to', ',') from net.sent, jsonb_array_elements(body) m"
su "important" "select distinct m->>'channelId' from net.sent, jsonb_array_elements(body) m"
$Q "delete from net.sent" >/dev/null
t "ok" A "select public.admin_send_notification('haji','হাজীদের','x',null,false)"
su "$TC2,$TC,$TF" "select string_agg(m->>'to', ',' order by m->>'to') from net.sent, jsonb_array_elements(body) m"
# --- the same phone logs in to another account: the token moves (old account no longer gets alerts there)
t "ok" F "select public.register_push_token('$TC2','android')"
t "1" C "select public.my_push_count()"
t "2" F "select public.my_push_count()"
# --- logout removes only one's own token
t "ok" C "select public.unregister_push_token('$TF')"
t "2" F "select public.my_push_count()"
t "ok" F "select public.unregister_push_token('$TF')"
t "1" F "select public.my_push_count()"
# --- at most 5 phones per account
for i in 1 2 3 4 5 6; do t "ok" D "select public.register_push_token('ExponentPushToken[dddddddddddddddddd0$i]','android')"; done
t "5" D "select public.my_push_count()"
# --- big audience: 100 per request
$Q "insert into public.push_tokens (token, user_id) select 'ExponentPushToken[zz' || lpad(g::text, 18, '0') || ']', '$E' from generate_series(1, 230) g" >/dev/null
$Q "update public.profiles set account_type='haji', role='haji' where id='$E'" >/dev/null
$Q "delete from net.sent" >/dev/null
t "ok" A "select public.admin_send_notification('all','সবাই','x',null,false)"
su "3" "select count(*) from net.sent"
su "100,100,38" "select string_agg(jsonb_array_length(body)::text, ',' order by id) from net.sent"
# --- uninstalled phones are removed after Expo answers
RID=$($Q "select max(request_id) from public.push_log")
TOK=$($Q "select tokens[2] from public.push_log where request_id=$RID")
$Q "insert into net._http_response (id, status_code, content) values ($RID, 200, '{\"data\":[{\"status\":\"ok\",\"id\":\"a\"},{\"status\":\"error\",\"message\":\"x\",\"details\":{\"error\":\"DeviceNotRegistered\"}}]}')" >/dev/null
su "1" "select count(*) from public.push_tokens where token='$TOK'"
$Q "delete from net.sent" >/dev/null
t "ok" A "select public.admin_send_notification('one','আবার','x','$CC',false)"
su "0" "select count(*) from public.push_tokens where token='$TOK'"
su "0" "select count(*) from public.push_log where request_id=$RID"
# --- a suspended account gets no phone alerts
$Q "update public.profiles set status='suspended' where id='$C'" >/dev/null
$Q "delete from net.sent" >/dev/null
t "ok" A "select public.admin_send_notification('one','বন্ধ অ্যাকাউন্ট','x','$CC',false)"
su "0" "select count(*) from net.sent"
$Q "update public.profiles set status='active' where id='$C'" >/dev/null
# --- the notice still lands even if sending breaks
$Q "create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language plpgsql as \$\$ begin raise exception 'network down'; end \$\$" >/dev/null
t "ok" A "select public.admin_send_notification('one','নেট বন্ধ','x','$CC',false)"
t "1" C "select count(*) from public.my_notifications(100) where title='নেট বন্ধ'"
$Q "drop schema net cascade" >/dev/null
t "ok" A "select public.admin_send_notification('one','pg_net নেই','x','$CC',false)"
t "1" C "select count(*) from public.my_notifications(100) where title='pg_net নেই'"
# --- deleting an account removes its tokens
su "1" "select count(*) from public.push_tokens where user_id='$C'"
echo "pass=$pass fail=$fail"
