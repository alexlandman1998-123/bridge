alter table if exists public.development_profiles
  add column if not exists seller_details jsonb not null default '{}'::jsonb;

comment on column public.development_profiles.seller_details is
  'Development-level legal seller details used as the source for OTP and mandate document parties.';
