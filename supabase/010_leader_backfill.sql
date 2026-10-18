-- Travel Adda 010: leader accounts opened BEFORE step 007 was run.
-- Their sign-up choice ("আমি গ্রুপ লিডার") is in the login data, but 007 gave them account_type 'haji' and a TA- code.
-- This moves them to a leader account (TL- code) -- only if they have never been used as a haji
-- (no group, no contract, no payment). Run once in SQL Editor after 002-009. Safe to run again (nothing left to move).
do $$
declare r record; n int := 0;
begin
  for r in
    select p.id from public.profiles p join auth.users u on u.id = p.id
     where coalesce(u.raw_user_meta_data->>'account_type', '') = 'leader'
       and p.account_type = 'haji' and p.role = 'haji'
       and not exists (select 1 from public.group_members m where m.user_id = p.id)
       and not exists (select 1 from public.haji_contracts c where c.haji_id = p.id)
       and not exists (select 1 from public.haji_payments x where x.haji_id = p.id)
  loop
    update public.profiles
       set account_type = 'leader',
           haji_code = 'TL-' || lpad(nextval('public.leader_code_seq')::text, 5, '0')
     where id = r.id;
    n := n + 1;
  end loop;
  raise notice 'leader accounts fixed: %', n;
end $$;
