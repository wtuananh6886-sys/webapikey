-- License key at rest: hash + prefix (full key nullable for new rows).
-- Chạy sau schema gốc. Pepper phải khớp LICENSE_KEY_PEPPER (hoặc WA_SESSION_SECRET) trên app khi backfill.

alter table licenses alter column key drop not null;

alter table licenses add column if not exists key_hash text;
alter table licenses add column if not exists key_prefix text;

create unique index if not exists licenses_key_hash_uidx on licenses (key_hash) where key_hash is not null;

-- Giữ log khi xóa license (audit). license_id có thể null sau khi license bị xóa.
alter table license_logs drop constraint if exists license_logs_license_id_fkey;
alter table license_logs alter column license_id drop not null;
alter table license_logs
  add constraint license_logs_license_id_fkey
  foreign key (license_id) references licenses (id) on delete set null;
