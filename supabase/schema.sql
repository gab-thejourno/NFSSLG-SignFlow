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

-- 5. Seed / Repair the 19 Pre-Authorized NFSSLG Accounts (Default Password: adminpassword)
-- Tip: In Supabase Dashboard -> Authentication -> Providers -> Email, turn OFF "Allow new users to sign up"
-- so only you (via Supabase Dashboard/SQL) can create or manage accounts.
do $$
declare
  acct record;
  new_uid uuid;
  existing_uid uuid;
begin
  perform set_config('search_path', 'public, auth, extensions', true);

  for acct in
    select * from (values
      ('centraloffice@signflow.gov.ph', 'nfsslg-yfd', 'Central Office - Youth Formation Division (YFD)', 'National Federation of SSLG Central Office (YFD)', 'Central Office Administrator', 'admin'),
      ('ncr@signflow.gov.ph', 'nfsslg-ncr', 'RFSSLG President - NCR (National Capital Region)', 'Regional Federation of SSLG - NCR (National Capital Region)', 'RFSSLG President', 'user'),
      ('car@signflow.gov.ph', 'nfsslg-car', 'RFSSLG President - CAR (Cordillera Administrative Region)', 'Regional Federation of SSLG - CAR (Cordillera Administrative Region)', 'RFSSLG President', 'user'),
      ('nir@signflow.gov.ph', 'nfsslg-nir', 'RFSSLG President - NIR (Negros Island Region)', 'Regional Federation of SSLG - NIR (Negros Island Region)', 'RFSSLG President', 'user'),
      ('barmm@signflow.gov.ph', 'nfsslg-barmm', 'RFSSLG President - BARMM (Bangsamoro Autonomous Region)', 'Regional Federation of SSLG - BARMM (Bangsamoro Autonomous Region)', 'RFSSLG President', 'user'),
      ('region4a@signflow.gov.ph', 'nfsslg-r4a', 'RFSSLG President - Region 4A (CALABARZON)', 'Regional Federation of SSLG - Region 4A (CALABARZON)', 'RFSSLG President', 'user'),
      ('region4b@signflow.gov.ph', 'nfsslg-r4b', 'RFSSLG President - Region 4B (MIMAROPA)', 'Regional Federation of SSLG - Region 4B (MIMAROPA)', 'RFSSLG President', 'user'),
      ('region1@signflow.gov.ph', 'nfsslg-r1', 'RFSSLG President - Region 1 (Ilocos Region)', 'Regional Federation of SSLG - Region 1 (Ilocos Region)', 'RFSSLG President', 'user'),
      ('region2@signflow.gov.ph', 'nfsslg-r2', 'RFSSLG President - Region 2 (Cagayan Valley)', 'Regional Federation of SSLG - Region 2 (Cagayan Valley)', 'RFSSLG President', 'user'),
      ('region3@signflow.gov.ph', 'nfsslg-r3', 'RFSSLG President - Region 3 (Central Luzon)', 'Regional Federation of SSLG - Region 3 (Central Luzon)', 'RFSSLG President', 'user'),
      ('region5@signflow.gov.ph', 'nfsslg-r5', 'RFSSLG President - Region 5 (Bicol Region)', 'Regional Federation of SSLG - Region 5 (Bicol Region)', 'RFSSLG President', 'user'),
      ('region6@signflow.gov.ph', 'nfsslg-r6', 'RFSSLG President - Region 6 (Western Visayas)', 'Regional Federation of SSLG - Region 6 (Western Visayas)', 'RFSSLG President', 'user'),
      ('region7@signflow.gov.ph', 'nfsslg-r7', 'RFSSLG President - Region 7 (Central Visayas)', 'Regional Federation of SSLG - Region 7 (Central Visayas)', 'RFSSLG President', 'user'),
      ('region8@signflow.gov.ph', 'nfsslg-r8', 'RFSSLG President - Region 8 (Eastern Visayas)', 'Regional Federation of SSLG - Region 8 (Eastern Visayas)', 'RFSSLG President', 'user'),
      ('region9@signflow.gov.ph', 'nfsslg-r9', 'RFSSLG President - Region 9 (Zamboanga Peninsula)', 'Regional Federation of SSLG - Region 9 (Zamboanga Peninsula)', 'RFSSLG President', 'user'),
      ('region10@signflow.gov.ph', 'nfsslg-r10', 'RFSSLG President - Region 10 (Northern Mindanao)', 'Regional Federation of SSLG - Region 10 (Northern Mindanao)', 'RFSSLG President', 'user'),
      ('region11@signflow.gov.ph', 'nfsslg-r11', 'RFSSLG President - Region 11 (Davao Region)', 'Regional Federation of SSLG - Region 11 (Davao Region)', 'RFSSLG President', 'user'),
      ('region12@signflow.gov.ph', 'nfsslg-r12', 'RFSSLG President - Region 12 (SOCCSKSARGEN)', 'Regional Federation of SSLG - Region 12 (SOCCSKSARGEN)', 'RFSSLG President', 'user'),
      ('region13@signflow.gov.ph', 'nfsslg-r13', 'RFSSLG President - Region 13 (Caraga Administrative Region)', 'Regional Federation of SSLG - Region 13 (Caraga Administrative Region)', 'RFSSLG President', 'user')
    ) as t(email, username, full_name, department, position, role)
  loop
    select id into existing_uid from auth.users where email = acct.email limit 1;

    if existing_uid is null then
      new_uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        recovery_sent_at, last_sign_in_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new
      ) values (
        '00000000-0000-0000-0000-000000000000',
        new_uid,
        'authenticated',
        'authenticated',
        acct.email,
        crypt('adminpassword', gen_salt('bf', 10)),
        now(),
        now(),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object(
          'full_name', acct.full_name,
          'username', acct.username,
          'department', acct.department,
          'position', acct.position,
          'role', acct.role,
          'status', 'active'
        ),
        now(),
        now(),
        '',
        '',
        '',
        ''
      );

      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(),
        new_uid,
        jsonb_build_object('sub', new_uid::text, 'email', acct.email, 'email_verified', true),
        'email',
        new_uid::text,
        now(),
        now(),
        now()
      );

      insert into public.profiles (id, email, full_name, username, department, position, role, status)
      values (new_uid, acct.email, acct.full_name, acct.username, acct.department, acct.position, acct.role, 'active')
      on conflict (id) do update
      set username = acct.username,
          full_name = acct.full_name,
          department = acct.department,
          position = acct.position,
          role = acct.role,
          status = 'active';
    else
      -- Repair missing GoTrue string defaults or unconfirmed state if inserted earlier
      update auth.users
      set email_confirmed_at = coalesce(email_confirmed_at, now()),
          confirmation_token = coalesce(confirmation_token, ''),
          recovery_token = coalesce(recovery_token, ''),
          email_change = coalesce(email_change, ''),
          email_change_token_new = coalesce(email_change_token_new, ''),
          raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
          raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
            'full_name', acct.full_name,
            'username', acct.username,
            'department', acct.department,
            'position', acct.position,
            'role', acct.role,
            'status', 'active'
          )
      where id = existing_uid;

      if not exists (select 1 from auth.identities where user_id = existing_uid and provider = 'email') then
        insert into auth.identities (
          id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) values (
          gen_random_uuid(),
          existing_uid,
          jsonb_build_object('sub', existing_uid::text, 'email', acct.email, 'email_verified', true),
          'email',
          existing_uid::text,
          now(),
          now(),
          now()
        );
      end if;

      insert into public.profiles (id, email, full_name, username, department, position, role, status)
      values (existing_uid, acct.email, acct.full_name, acct.username, acct.department, acct.position, acct.role, 'active')
      on conflict (id) do update
      set username = acct.username,
          full_name = acct.full_name,
          department = acct.department,
          position = acct.position,
          role = acct.role,
          status = 'active';
    end if;
  end loop;
end $$;

-- Optional: Run the line below ONLY if you ever want to reset all 19 NFSSLG passwords back to 'adminpassword':
-- update auth.users set encrypted_password = extensions.crypt('adminpassword', extensions.gen_salt('bf', 10)) where email like '%@signflow.gov.ph';


