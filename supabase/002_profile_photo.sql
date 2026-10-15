-- Travel Adda: profile photo (taken with the front camera at sign-up)
-- Run once in Supabase Dashboard > SQL Editor, AFTER 001_core.sql. Safe to re-run.

-- 1) Column on the profile. The path is forced to be "<own user id>/profile.jpg" so nobody can point it at another file.
alter table public.profiles add column if not exists avatar_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_path_own') then
    alter table public.profiles
      add constraint profiles_avatar_path_own
      check (avatar_path is null or avatar_path = id::text || '/profile.jpg');
  end if;
end $$;

-- Users may change only their own name and their own photo path (row policy "profiles_update_own" already limits rows to self).
grant update (avatar_path) on public.profiles to authenticated;

-- 2) Private bucket: not public, JPEG only, 5 MB max.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

-- 3) Each user can see and change files only inside their own folder.
drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
