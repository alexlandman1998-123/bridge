-- Phase 2: canonical South African legal deal facts.
-- The versioned JSON record is the stable input used by document routing and
-- generation; legacy transaction columns remain available during migration.

alter table if exists public.transactions
  add column if not exists legal_instrument_family text,
  add column if not exists legal_deal_facts_json jsonb not null default '{}'::jsonb,
  add column if not exists legal_deal_facts_version text,
  add column if not exists legal_deal_facts_updated_at timestamptz,
  add column if not exists legal_deal_facts_updated_by uuid references public.profiles(id) on delete set null;

alter table if exists public.transactions
  drop constraint if exists transactions_legal_deal_facts_shape_check;
alter table if exists public.transactions
  add constraint transactions_legal_deal_facts_shape_check
  check (
    jsonb_typeof(legal_deal_facts_json) = 'object'
    and (
      legal_deal_facts_json = '{}'::jsonb
      or legal_deal_facts_json ->> 'schemaVersion' = coalesce(legal_deal_facts_version, legal_deal_facts_json ->> 'schemaVersion')
    )
  );

alter table if exists public.transactions
  drop constraint if exists transactions_legal_instrument_family_check;
alter table if exists public.transactions
  add constraint transactions_legal_instrument_family_check
  check (
    legal_instrument_family is null
    or (legal_instrument_family = lower(legal_instrument_family) and legal_instrument_family ~ '^[a-z][a-z0-9_]*$')
  );

create index if not exists transactions_legal_deal_facts_family_idx
  on public.transactions ((legal_deal_facts_json #>> '{instrument,familyKey}'))
  where legal_deal_facts_json <> '{}'::jsonb;

create index if not exists transactions_legal_deal_facts_review_idx
  on public.transactions (organisation_id, legal_deal_facts_updated_at desc)
  where legal_deal_facts_json <> '{}'::jsonb;

comment on column public.transactions.legal_deal_facts_json is
  'Versioned canonical legal facts used to route SA agreement wording and preserve the generation decision.';
comment on column public.transactions.legal_deal_facts_version is
  'Schema identifier for legal_deal_facts_json, initially sa_legal_deal_facts_v1.';
