-- Lightweight, HTML-only mandate signing sessions. The raw token never reaches
-- the database; public access is granted only by a matching, unexpired hash.
create table if not exists public.private_listing_mandate_signing_sessions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  signer_email text not null,
  signer_name text not null,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'signed', 'expired', 'revoked')),
  expires_at timestamptz not null,
  viewed_at timestamptz,
  signed_at timestamptz,
  used_at timestamptz,
  signature text,
  signed_name text,
  acceptance_ip text,
  acceptance_user_agent text,
  mandate_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_listing_mandate_signing_signature_check check (
    (status <> 'signed') or (signature is not null and signed_name is not null and signed_at is not null and used_at is not null)
  )
);

create index if not exists private_listing_mandate_signing_sessions_listing_idx
  on public.private_listing_mandate_signing_sessions (private_listing_id, created_at desc);
create index if not exists private_listing_mandate_signing_sessions_expiry_idx
  on public.private_listing_mandate_signing_sessions (expires_at) where status = 'active';

alter table public.private_listing_mandate_signing_sessions enable row level security;

-- Only the dedicated Edge Function (service role) accesses signing sessions.
-- Agents issue links through its authenticated action; recipients use its token-bound public actions.

alter table public.private_listing_documents
  add column if not exists generated_html text,
  add column if not exists generated_file_name text,
  add column if not exists signing_session_id uuid references public.private_listing_mandate_signing_sessions(id) on delete set null;

create unique index if not exists private_listing_documents_signing_session_unique
  on public.private_listing_documents (signing_session_id)
  where signing_session_id is not null;
