alter table public.private_listing_mandate_signing_sessions
  add column if not exists document_progress jsonb not null default '{}'::jsonb;
