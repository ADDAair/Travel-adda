-- Travel Adda: Phase 1 core (haji accounts + private document vault)
-- Run once in Supabase Dashboard > SQL Editor. Safe to re-run.

create sequence if not exists public.haji_code_seq start 1;

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'haji' check (role in ('haji','leader','admin')),
  haji_code  text unique,
  full_name  text not null check (char_length(full_name) between 2 and 80),
  phone      text not null unique check (phone ~ '^01[3-9][0-9]{8}$'),
  status     text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Clients get the minimum: read own row, change only own name.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Second wall: even if a grant is changed by mistake, users cannot change protected columns.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and (
       new.id is distinct from old.id or new.role is distinct from old.role or
       new.haji_code is distinct from old.haji_code or new.phone is distinct from old.phone or
       new.status is distinct from old.status) then
    raise exception 'protected column';
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_profile on public.profiles;
create trigger trg_protect_profile before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Auto-create profile at sign-up. Role is ALWAYS haji. Phone is taken from the login id, not from user input.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_phone text := split_part(new.email, '@', 1);
begin
  insert into public.profiles (id, role, haji_code, full_name, phone)
  values (new.id, 'haji',
          'TA-' || lpad(nextval('public.haji_code_seq')::text, 5, '0'),
          trim(coalesce(new.raw_user_meta_data->>'full_name','')), v_phone);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Private document vault (passport, visa, ticket, hotel voucher)
create table if not exists public.user_documents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  doc_type   text not null check (doc_type in ('passport','visa','ticket','hotel_voucher','other')),
  file_path  text not null check (char_length(file_path) between 3 and 300),
  created_at timestamptz not null default now()
);
alter table public.user_documents enable row level security;
revoke all on public.user_documents from anon, authenticated;
grant select, insert, delete on public.user_documents to authenticated;

drop policy if exists "docs_own_select" on public.user_documents;
create policy "docs_own_select" on public.user_documents for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "docs_own_insert" on public.user_documents;
create policy "docs_own_insert" on public.user_documents for insert to authenticated
  with check (user_id = (select auth.uid()) and file_path like (select auth.uid())::text || '/%');
drop policy if exists "docs_own_delete" on public.user_documents;
create policy "docs_own_delete" on public.user_documents for delete to authenticated using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents','documents', false, 5242880, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','application/pdf'];

drop policy if exists "docs_files_select" on storage.objects;
create policy "docs_files_select" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "docs_files_insert" on storage.objects;
create policy "docs_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "docs_files_delete" on storage.objects;
create policy "docs_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
