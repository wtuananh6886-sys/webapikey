create extension if not exists "pgcrypto";

create type role_type as enum ('owner','admin','support','viewer');
create type admin_status as enum ('active','suspended','invited');
create type license_status as enum ('active','inactive','expired','banned','revoked');
create type server_status as enum ('online','offline','warning','maintenance');
create type tweak_status as enum ('draft','active','archived','disabled');
create type severity_level as enum ('info','warning','error','critical');

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists admin_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  username text not null unique,
  role role_type not null default 'viewer',
  avatar_url text,
  status admin_status not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists licenses (
  id uuid primary key default gen_random_uuid(),
  name text,
  package_name text,
  key text not null unique,
  plan text not null,
  key_mode text not null default 'dynamic',
  status license_status not null default 'inactive',
  assigned_user text,
  device_id text,
  max_devices int not null default 1,
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists user_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  token text not null unique,
  owner_email text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table licenses add column if not exists name text;
alter table licenses add column if not exists package_name text;
alter table licenses add column if not exists key_mode text default 'dynamic';
alter table user_packages add column if not exists token text;

create table if not exists license_logs (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references licenses(id) on delete cascade,
  action text not null,
  ip_address text,
  user_agent text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  host text,
  ip_address text not null,
  region text,
  status server_status not null default 'offline',
  ping_ms int not null default 0,
  cpu_usage numeric(5,2) not null default 0,
  ram_usage numeric(5,2) not null default 0,
  service_version text,
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists server_logs (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references servers(id) on delete cascade,
  level severity_level not null default 'info',
  message text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists tweaks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  package_id text not null unique,
  current_version text,
  release_channel text not null default 'stable',
  status tweak_status not null default 'draft',
  description text,
  required_license_plan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tweak_versions (
  id uuid primary key default gen_random_uuid(),
  tweak_id uuid not null references tweaks(id) on delete cascade,
  version text not null,
  build_number text,
  changelog text,
  released_at timestamptz,
  status text not null default 'draft'
);

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id) on delete set null,
  actor_name text,
  action text not null,
  target_type text not null,
  target_id text,
  target_name text,
  severity severity_level not null default 'info',
  ip_address text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(category, key)
);
