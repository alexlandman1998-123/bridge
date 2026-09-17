-- The signing pack is frozen when its secure link is issued. This prevents
-- later listing edits from changing the facts, signer roster or template
-- version seen and signed by the recipient.
alter table public.private_listing_mandate_signing_sessions
  add column if not exists signing_pack_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists signing_pack_version text not null default 'seller_signing_pack_v1',
  add column if not exists signing_pack_digest text,
  add column if not exists signing_pack_frozen_at timestamptz;

alter table public.private_listing_mandate_signing_sessions
  add constraint private_listing_mandate_signing_sessions_pack_snapshot_check
  check (jsonb_typeof(signing_pack_snapshot) = 'object') not valid;

alter table public.private_listing_mandate_signing_sessions
  validate constraint private_listing_mandate_signing_sessions_pack_snapshot_check;
