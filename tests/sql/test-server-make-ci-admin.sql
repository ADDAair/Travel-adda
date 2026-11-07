-- ONLY for the TEST server (ami-haji-test, address yhavfnaljbiefzofcduj). Makes the CI test account 01300000007
-- an admin so the security test can check that an admin WITHOUT 2FA can do nothing, and WITH 2FA can.
-- On the real server it stops by itself (more than 20 users) and changes nothing.
do $$
declare n int; v_id uuid;
begin
  select count(*) into n from public.profiles;
  if n > 20 then raise exception 'এটা আসল সার্ভার মনে হচ্ছে (% জন ব্যবহারকারী) — থামানো হলো, কিছু বদলানো হয়নি', n; end if;
  update public.profiles set role = 'admin'
   where phone = '01300000007' and role = 'haji' and full_name = 'CI পরীক্ষা অ্যাডমিন (আসল নয়)'
  returning id into v_id;
  if v_id is null then raise exception 'CI পরীক্ষার অ্যাডমিন অ্যাকাউন্ট (01300000007) পাওয়া যায়নি বা আগেই অ্যাডমিন'; end if;
  raise notice 'CI পরীক্ষার অ্যাডমিন তৈরি হয়েছে';
end $$;
select full_name, role from public.profiles where phone = '01300000007';
