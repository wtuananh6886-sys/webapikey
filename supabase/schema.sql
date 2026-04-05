create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'role_type') then
    create type role_type as enum ('owner','admin','support','viewer');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'admin_status') then
    create type admin_status as enum ('active','suspended','invited');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'license_status') then
    create type license_status as enum ('active','inactive','expired','banned','revoked');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'server_status') then
    create type server_status as enum ('online','offline','warning','maintenance');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tweak_status') then
    create type tweak_status as enum ('draft','active','archived','disabled');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'severity_level') then
    create type severity_level as enum ('info','warning','error','critical');
  end if;
end
$$;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text,
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
  key text unique,
  key_hash text,
  key_prefix text,
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
alter table licenses add column if not exists owner_email text;
alter table licenses add column if not exists key_hash text;
alter table licenses add column if not exists key_prefix text;
alter table licenses alter column key drop not null;
create unique index if not exists licenses_key_hash_uidx on licenses (key_hash) where key_hash is not null;
alter table users add column if not exists password_hash text;
alter table user_packages add column if not exists token text;
alter table user_packages add column if not exists activation_ui_title text;
alter table user_packages add column if not exists activation_ui_subtitle text;
alter table user_packages add column if not exists archived_at timestamptz;

create table if not exists license_logs (
  id uuid primary key default gen_random_uuid(),
  license_id uuid references licenses(id) on delete set null,
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

create table if not exists account_policies (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role role_type not null default 'viewer',
  assigned_plan text not null default 'basic',
  monthly_package_token_limit int not null default 3,
  monthly_key_limit int not null default 30,
  package_tokens_used_this_month int not null default 0,
  keys_used_this_month int not null default 0,
  usage_month text not null default to_char(now(), 'YYYY-MM'),
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table account_policies add column if not exists role role_type default 'viewer';
alter table account_policies add column if not exists assigned_plan text default 'basic';
alter table account_policies add column if not exists monthly_package_token_limit int default 3;
alter table account_policies add column if not exists monthly_key_limit int default 30;
alter table account_policies add column if not exists package_tokens_used_this_month int default 0;
alter table account_policies add column if not exists keys_used_this_month int default 0;
alter table account_policies add column if not exists usage_month text default to_char(now(), 'YYYY-MM');
alter table account_policies add column if not exists expires_at timestamptz;
alter table account_policies add column if not exists updated_at timestamptz default now();
alter table account_policies add column if not exists created_at timestamptz default now();

-- Optional: seed or upgrade owner policy (replace email). Run once after tables exist.
-- insert into account_policies (email, role, assigned_plan, monthly_package_token_limit, monthly_key_limit, package_tokens_used_this_month, keys_used_this_month, usage_month, updated_at)
-- values ('your-email@example.com', 'owner', 'premium', 99999, 999999, 0, 0, to_char(now(), 'YYYY-MM'), now())
-- on conflict (email) do update set
--   role = excluded.role,
--   assigned_plan = excluded.assigned_plan,
--   monthly_package_token_limit = excluded.monthly_package_token_limit,
--   monthly_key_limit = excluded.monthly_key_limit,
--   updated_at = now();
