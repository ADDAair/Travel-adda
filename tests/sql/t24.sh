. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 024: admin part 3 —
#  1) during a dispute the admin may read a haji's help chat with that leader ONLY after the haji agrees;
#     the permission ends after 7 days or when the haji takes it back, and every view is logged
#  2) the admin can correct guide and dua text without an app update (text only, never the structure)
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 023_admin_mfa 024_admin_part3 024_admin_part3; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
su() { exp="$1"; out=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "$2" 2>&1); if [ "$(echo "$out" | tail -1)" = "$exp" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL [$exp/su] $2 -> $out"; fi; }
as_user() { eval uid=\$$1; psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -v ON_ERROR_STOP=1 -c "begin; set local role authenticated; set local request.jwt.claim.sub='$uid'; set local request.jwt.claims='{\"aal\":\"aal2\"}'; $2; commit;"; }
BC=$($Q "select haji_code from public.profiles where id='$B'"); CC=$($Q "select haji_code from public.profiles where id='$C'")
CT=$($Q "insert into public.haji_contracts (leader_id, haji_id, leader_name, leader_code, haji_name, haji_code, kind, title, price_bdt, includes, refund_policy, status) values ('$B','$C','Leader B','$BC','Haji C','$CC','umrah','চুক্তি',150000,'বিমান','নিয়ম','accepted') returning id" | head -1)
G=$($Q "insert into public.groups (leader_id, name) values ('$B', 'ওমরাহ দল ক') returning id" | head -1)
G2=$($Q "insert into public.groups (leader_id, name) values ('$D', 'অন্য দল') returning id" | head -1)
$Q "insert into public.group_members (group_id, user_id, status, joined_at) values ('$G','$C','active',now()), ('$G2','$C','active',now())" >/dev/null
as_user C "select public.help_send('$G', 'হোটেল কোথায়?')" >/dev/null
TH=$($Q "select id from public.help_threads where group_id='$G' and haji_id='$C'")
as_user B "select public.help_reply('$TH', 'হারামের কাছে')" >/dev/null
as_user C "select public.help_send('$G2', 'অন্য দলের গোপন প্রশ্ন')" >/dev/null

# ---------- 1) help chat during a dispute ----------
# no consent: nothing to read; chat tables stay closed
t fail A "select count(*) from public.admin_view_help_chat('00000000-0000-0000-0000-000000000001')"
t fail A "select count(*) from public.help_messages"
t fail A "select public.admin_request_chat_consent('$CT', 'ক')"
t fail C "select public.admin_request_chat_consent('$CT', 'আমি অ্যাডমিন নই, তবু চাইছি')"
t fail B "select public.admin_request_chat_consent('$CT', 'আমি লিডার, তবু চাইছি')"
t "sent" A "select public.admin_request_chat_consent('$CT', 'হোটেল নিয়ে অভিযোগ যাচাই')"
t "exists" A "select public.admin_request_chat_consent('$CT', 'আবার চাইছি একই চুক্তিতে')"
t "1" C "select count(*) from public.user_notifications where user_id='$C' and route='ChatConsent'"
K=$(as_user A "select id from public.admin_chat_consents('$CT') limit 1" | head -1)
t "asked" A "select status from public.admin_chat_consents('$CT')"
# still asked: admin can't read
t fail A "select count(*) from public.admin_view_help_chat('$K')"
# the haji sees the request with the reason; others don't
t "Leader B|হোটেল নিয়ে অভিযোগ যাচাই|asked" C "select leader_name||'|'||reason||'|'||status from public.my_chat_consents()"
t "0" F "select count(*) from public.my_chat_consents()"
t "not_found" F "select public.chat_consent_respond('$K', true)"
t "not_found" B "select public.chat_consent_respond('$K', true)"
# the haji agrees
t "ok" C "select public.chat_consent_respond('$K', true)"
t "granted" A "select status from public.admin_chat_consents('$CT')"
# admin reads only the chat between this haji and THIS leader's groups
t "2" A "select count(*) from public.admin_view_help_chat('$K')"
t "0" A "select count(*) from public.admin_view_help_chat('$K') where body like '%অন্য দলের%'"
t "haji|হোটেল কোথায়?" A "select sender_role||'|'||body from public.admin_view_help_chat('$K') order by created_at limit 1"
# three readings above = three lines in the work record
t "3" A "select count(*) from public.admin_list_audit() where action='chat_viewed'"
# staff without the complaints permission, leader and haji can't read
S=00000000-0000-0000-0000-0000000000c1
$Q "insert into auth.users (id, email, raw_user_meta_data) values ('$S','01710000088@users.traveladda.app','{\"full_name\":\"Staff S\"}')" >/dev/null
$Q "update public.profiles set role='staff' where id='$S'; insert into public.admin_staff (user_id, perms) values ('$S', '{payments}') on conflict (user_id) do update set perms = excluded.perms" >/dev/null
t fail S "select count(*) from public.admin_view_help_chat('$K')"
t fail B "select count(*) from public.admin_view_help_chat('$K')"
t fail C "select count(*) from public.admin_view_help_chat('$K')"
# without 2FA the admin can't read either
r=$(psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c "begin; set local role authenticated; set local request.jwt.claim.sub='$A'; set local request.jwt.claims='{\"aal\":\"aal1\"}'; select count(*) from public.admin_view_help_chat('$K'); commit;" 2>&1)
if echo "$r" | grep -q "not allowed"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL aal1 view must be refused: $r"; fi
# the haji takes it back -> no more reading
t "ok" C "select public.chat_consent_revoke('$K')"
t fail A "select count(*) from public.admin_view_help_chat('$K')"
t "revoked" A "select status from public.admin_chat_consents('$CT')"
t "not_found" C "select public.chat_consent_revoke('$K')"
# a new request is possible after revoke; declining works; expiry after 7 days
t "sent" A "select public.admin_request_chat_consent('$CT', 'আবার যাচাই করা দরকার')"
K2=$(as_user A "select id from public.admin_chat_consents('$CT') where status='asked' limit 1" | head -1)
t "ok" C "select public.chat_consent_respond('$K2', false)"
t "declined" A "select status from public.admin_chat_consents('$CT') where id='$K2'"
t fail A "select count(*) from public.admin_view_help_chat('$K2')"
t "sent" A "select public.admin_request_chat_consent('$CT', 'শেষবার যাচাই করা দরকার')"
K3=$(as_user A "select id from public.admin_chat_consents('$CT') where status='asked' limit 1" | head -1)
t "ok" C "select public.chat_consent_respond('$K3', true)"
t "2" A "select count(*) from public.admin_view_help_chat('$K3')"
su "t" "select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' from public.chat_consents where id='$K3'"
$Q "update public.chat_consents set expires_at = now() - interval '1 minute' where id='$K3'" >/dev/null
t fail A "select count(*) from public.admin_view_help_chat('$K3')"
t "0" C "select count(*) from public.my_chat_consents() where status='granted'"
# the consent table itself is closed to everyone
t fail C "select count(*) from public.chat_consents"
t fail C "update public.chat_consents set status='granted'"

# ---------- 2) guide & dua text corrections ----------
t "ok" A "select public.admin_set_content('guide', 'health', 'blocks.0.text', 'নতুন সতর্কবার্তা')"
t "নতুন সতর্কবার্তা" C "select body from public.content_overrides where kind='guide' and item_id='health' and path='blocks.0.text'"
t "1" anon "select count(*) from public.content_overrides"
t "ok" A "select public.admin_set_content('guide', 'health', 'blocks.0.text', 'আবার বদলানো')"
t "1" C "select count(*) from public.content_overrides"
t "ok" A "select public.admin_set_content('dua', 'sana', 'parts.0.bn', 'সংশোধিত অর্থ')"
t fail A "select public.admin_set_content('video', 'x', 'title', 'কিছু')"
t fail A "select public.admin_set_content('guide', 'Bad Id!', 'title', 'কিছু')"
t fail A "select public.admin_set_content('guide', 'health', 'blocks[0]; drop', 'কিছু')"
t fail A "select public.admin_set_content('guide', 'health', 'title', '')"
t fail A "select public.admin_set_content('guide', 'health', 'title', repeat('ক', 4001))"
t fail C "select public.admin_set_content('guide', 'health', 'title', 'হ্যাক')"
t fail B "select public.admin_set_content('guide', 'health', 'title', 'হ্যাক')"
t fail S "select public.admin_set_content('guide', 'health', 'title', 'হ্যাক')"
t fail C "insert into public.content_overrides (kind, item_id, path, body) values ('guide','health','title','হ্যাক')"
t fail anon "update public.content_overrides set body='হ্যাক'"
t "3" A "select count(*) from public.admin_list_audit() where action='content_edit'"
# back to the text inside the app
t "ok" A "select public.admin_set_content('guide', 'health', 'blocks.0.text', null)"
t "1" C "select count(*) from public.content_overrides"
echo "t24: pass=$pass fail=$fail"
