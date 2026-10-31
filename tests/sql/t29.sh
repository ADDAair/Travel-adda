. /var/tmp/pgt/as.sh
P="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -q -v ON_ERROR_STOP=1"
Q="psql -h /var/tmp/pgt -p 5544 -U postgres -d t -qtA -c"
# 029: leaders may give to the help fund and see the account, but may not apply for help themselves (owner, Oct 2026).
$P -c "create schema if not exists net; create table if not exists net._http_response (id bigint primary key, status_code int, content text); create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as 'select 1::bigint'" 2>&1 | grep -v NOTICE
for f in 010_leader_backfill 011_push 012_terms 013_scale 014_work_area 015_security 016_email_login 017_leader_kinds 018_khadem_help 019_offer_review 020_offer_route 021_audit_fixes 022_admin_tools 023_admin_mfa 024_admin_part3 025_readonly_fix 026_admin_part4 027_help_fund 028_fund_access 029_fund_leader 029_fund_leader; do $P -f /home/claude/travel-adda/supabase/$f.sql 2>&1 | grep -v "NOTICE\|not available\|not scheduled\|accounts moved\|skipping"; done
apply() { t "$1" $2 "select public.apply_help('umrah', 60, 'ঢাকা', 'ব্যবসা', 'আমার ওমরাহ করার খুব ইচ্ছা কিন্তু টাকা নেই', false, 'ইমাম সাহেব', '01712345678', false)"; }
# a leader (approved or still applying) cannot apply
apply "leader" B
$Q "update public.profiles set account_type='leader' where id='$F'" >/dev/null
apply "leader" F
t "0" A "select count(*) from public.admin_help_applications(null)"
# a haji still can
apply "ok" C
# a leader may give, under the same permission rule
$Q "insert into public.app_settings (key, value) values ('fund_donate_mode', 'open') on conflict (key) do update set value = 'open'" >/dev/null
t "ok" B "select public.donate_fund(500, 'bkash', 'TX-L1', current_date, false)"
t "t" B "select (public.fund_summary() ? 'collected')"
t "t" B "select (public.my_donate_access()->>'can')::boolean"
echo "t29: pass=$pass fail=$fail"
