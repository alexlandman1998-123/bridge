-- H1 batch 1: additive transaction routing schema.
-- Forward-only and idempotent. No existing values are changed in this batch.

alter table if exists public.transactions
  add column if not exists property_tenure text,
  add column if not exists seller_type text,
  add column if not exists existing_bond boolean not null default false,
  add column if not exists cancellation_required boolean not null default false,
  add column if not exists vat_treatment text,
  add column if not exists routing_profile_version text,
  add column if not exists routing_profile_json jsonb not null default '{}'::jsonb;

comment on column public.transactions.property_tenure is
  'Canonical property-tenure routing fact, for example freehold or sectional_title.';
comment on column public.transactions.seller_type is
  'Canonical seller legal-entity routing fact.';
comment on column public.transactions.existing_bond is
  'Compatibility routing fact mirroring whether the seller has an existing bond.';
comment on column public.transactions.cancellation_required is
  'Whether the transfer requires a bank-appointed cancellation lane.';
comment on column public.transactions.vat_treatment is
  'Canonical transaction VAT-treatment routing fact.';
comment on column public.transactions.routing_profile_version is
  'Version of the deterministic transaction routing profile.';
comment on column public.transactions.routing_profile_json is
  'Deterministic routing profile. Provider data cannot overwrite reviewed legal truth.';
