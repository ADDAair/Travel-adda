-- 015: security hardening after a full review. Run AFTER 014. Safe to re-run. Changes nothing the app shows.
--  1) Internal helper functions can no longer be called directly by users. They answered questions about OTHER people
--     ("does haji X have a contract with leader Y?", "who is haji X referred to?", "has X blocked Y?").
--     The app never calls them; only the database's own functions use them.
--  2) Sign-up / profile triggers and ID counters are not callable from outside.
--  3) Limits per account, so one account cannot fill the storage (and the bill) with thousands of files:
--     profile photo 3, my documents 60 files / 60 rows, payment receipts 100, licence papers 20, complaint evidence 40.
--  4) Proof cannot be destroyed or replaced after it was used: a file attached to a complaint, and a payment receipt,
--     can no longer be deleted or overwritten by the uploader (deleting receipts was already blocked in 008).
--     Licence papers stay deletable, so "delete my account" can still remove them.

-- 1) helpers about other people: internal only ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.active_referral_leader(uuid)', 'public.has_accepted_contract(uuid, uuid)',
                           'public.blocked_between(uuid, uuid)'] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end $$;

-- 2) triggers and counters ----------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.handle_new_user()', 'public.protect_profile_columns()'] loop
    if to_regprocedure(f) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end $$;
do $$
declare s record;
begin
  for s in select sequence_name from information_schema.sequences where sequence_schema = 'public' loop
    execute format('revoke all on sequence public.%I from anon, authenticated', s.sequence_name);
  end loop;
end $$;

-- 3) per-account limits on files --------------------------------------------------------------------------------------
create or replace function public.my_file_count(p_bucket text) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from storage.objects
   where bucket_id = p_bucket and (select auth.uid()) is not null
     and name like (select auth.uid())::text || '/%';
$$;
revoke all on function public.my_file_count(text) from public, anon;
grant execute on function public.my_file_count(text) to authenticated;

-- A RESTRICTIVE policy is added on top of the existing ones (both must allow the upload).
drop policy if exists "files_per_account_cap" on storage.objects;
create policy "files_per_account_cap" on storage.objects as restrictive for insert to authenticated
  with check (
    case bucket_id
      when 'avatars'            then public.my_file_count(bucket_id) < 3
      when 'documents'          then public.my_file_count(bucket_id) < 60
      when 'receipts'           then public.my_file_count(bucket_id) < 100
      when 'leader-docs'        then public.my_file_count(bucket_id) < 20
      when 'complaint-evidence' then public.my_file_count(bucket_id) < 40
      else false                                       -- no other bucket may be written from the app
    end);

create or replace function public.my_document_rows() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.user_documents where user_id = (select auth.uid());
$$;
revoke all on function public.my_document_rows() from public, anon;
grant execute on function public.my_document_rows() to authenticated;
drop policy if exists "docs_rows_cap" on public.user_documents;
create policy "docs_rows_cap" on public.user_documents as restrictive for insert to authenticated
  with check ((select public.my_document_rows()) < 60);

-- 4) used proof stays ---------------------------------------------------------------------------------------------------
create or replace function public.file_is_evidence(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_bucket
           when 'complaint-evidence' then exists (select 1 from public.complaint_files f where f.path = p_name)
           when 'receipts' then exists (select 1 from public.haji_payments p where p.receipt_path = p_name)
           else false end;
$$;
revoke all on function public.file_is_evidence(text, text) from public, anon;
grant execute on function public.file_is_evidence(text, text) to authenticated;
drop policy if exists "used_proof_stays" on storage.objects;
create policy "used_proof_stays" on storage.objects as restrictive for delete to authenticated
  using (not public.file_is_evidence(bucket_id, name));
drop policy if exists "used_proof_not_replaced" on storage.objects;
create policy "used_proof_not_replaced" on storage.objects as restrictive for update to authenticated
  using (not public.file_is_evidence(bucket_id, name));

notify pgrst, 'reload schema';
