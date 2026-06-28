alter table if exists developments add column if not exists address text;
alter table if exists developments add column if not exists formatted_address text;
alter table if exists developments add column if not exists street_address text;
alter table if exists developments add column if not exists postal_code text;
alter table if exists developments add column if not exists latitude numeric;
alter table if exists developments add column if not exists longitude numeric;
alter table if exists developments add column if not exists google_place_id text;
