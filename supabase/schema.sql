-- NFSSLG SignFlow Supabase Schema & Storage Setup
-- Run this in your Supabase SQL Editor

create extension if not exists "pgcrypto";

-- 1. User Profiles Table (synced with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  username text not null default '',
  department text not null default 'National Federation of SSLG',
  position text not null default 'Authorized Signatory',
  role text not null default 'user' check (role in ('admin', 'user')),
  status text not null default 'active' check (status in ('active', 'pending', 'disabled')),
  signature_png_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Authenticated users can view profiles" on public.profiles;
create policy "Authenticated users can view profiles"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Trigger to auto-create profile row on auth.users signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, username, department, position)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email, 'user'), '@', 1)),
    coalesce(new.raw_user_meta_data->>'department', 'National Federation of SSLG'),
    coalesce(new.raw_user_meta_data->>'position', 'Authorized Signatory')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Documents Table
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  category text not null default 'Resolution',
  reference_number text not null default '',
  deadline timestamptz,
  instructions text default '',
  status text not null default 'pending_signatures',
  signing_order_type text not null default 'parallel',
  initiator_id uuid references auth.users(id) on delete set null,
  initiator_name text default '',
  initiator_email text default '',
  signatories jsonb not null default '[]'::jsonb,
  fields jsonb not null default '[]'::jsonb,
  original_file_url text not null,
  final_file_url text not null,
  page_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents enable row level security;

drop policy if exists "Authenticated users can read documents" on public.documents;
create policy "Authenticated users can read documents"
  on public.documents for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can insert documents" on public.documents;
create policy "Authenticated users can insert documents"
  on public.documents for insert
  to authenticated
  with check (auth.uid() = initiator_id or initiator_id is null);

drop policy if exists "Authenticated users can update documents" on public.documents;
create policy "Authenticated users can update documents"
  on public.documents for update
  to authenticated
  using (true);

-- 3. Document Signatures Table
create table if not exists public.document_signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  signature_url text not null,
  page_number integer not null default 1,
  pos_x double precision not null,
  pos_y double precision not null,
  width double precision not null,
  height double precision not null,
  signer_name text default '',
  signer_email text default '',
  signer_position text default '',
  verification_hash text default '',
  signed_at timestamptz not null default now(),
  unique (document_id, user_id)
);

alter table public.document_signatures enable row level security;

drop policy if exists "Authenticated users can read document_signatures" on public.document_signatures;
create policy "Authenticated users can read document_signatures"
  on public.document_signatures for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own signature" on public.document_signatures;
create policy "Users can insert their own signature"
  on public.document_signatures for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own signature" on public.document_signatures;
create policy "Users can update their own signature"
  on public.document_signatures for update
  to authenticated
  using (auth.uid() = user_id);

-- 4. Storage Buckets ("documents" and "signatures")
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('signatures', 'signatures', true)
on conflict (id) do update set public = true;

-- Storage RLS Policies for "documents" bucket
drop policy if exists "Public read access for documents" on storage.objects;
create policy "Public read access for documents"
  on storage.objects for select
  to public
  using (bucket_id = 'documents');

drop policy if exists "Authenticated upload access for documents" on storage.objects;
create policy "Authenticated upload access for documents"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents');

drop policy if exists "Authenticated update access for documents" on storage.objects;
create policy "Authenticated update access for documents"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'documents');

-- Storage RLS Policies for "signatures" bucket
drop policy if exists "Public read access for signatures" on storage.objects;
create policy "Public read access for signatures"
  on storage.objects for select
  to public
  using (bucket_id = 'signatures');

drop policy if exists "Authenticated upload access for signatures" on storage.objects;
create policy "Authenticated upload access for signatures"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'signatures');

drop policy if exists "Authenticated update access for signatures" on storage.objects;
create policy "Authenticated update access for signatures"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'signatures');
