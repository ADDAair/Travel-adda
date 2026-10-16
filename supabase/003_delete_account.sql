-- Travel Adda: let a signed-in user permanently delete their own account (required by Google Play).
-- Run once in Supabase Dashboard > SQL Editor, AFTER 001 and 002. Safe to re-run.
--
-- How it works: the app first deletes the user's own files through the Storage API (the storage policies already
-- allow a user to delete only files inside their own folder), then calls this function. Deleting the auth user
-- removes the profile and document rows automatically (ON DELETE CASCADE in 001_core.sql).

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = v_uid;   -- only ever the caller's own account
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
