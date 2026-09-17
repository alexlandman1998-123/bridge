-- Phase 5: one immutable seller signing packet can require many recipients to
-- sign many documents. Recipient links are independent: resending one never
-- revokes another recipient's link.
create table if not exists public.private_listing_seller_signing_packets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  private_listing_id uuid not null references public.private_listings(id) on delete cascade,
  status text not null default 'active' check (status in ('draft', 'active', 'complete', 'superseded', 'revoked', 'expired')),
  selected_documents jsonb not null check (jsonb_typeof(selected_documents) = 'array'),
  document_snapshot jsonb not null default '{}'::jsonb,
  snapshot_hash text not null,
  authority_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  completed_at timestamptz,
  superseded_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists private_listing_seller_signing_packets_listing_idx
  on public.private_listing_seller_signing_packets (private_listing_id, created_at desc);

create table if not exists public.private_listing_seller_signing_recipients (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references public.private_listing_seller_signing_packets(id) on delete cascade,
  signer_name text not null,
  signer_email text not null,
  signer_role text not null,
  required boolean not null default true,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'viewed', 'signed', 'revoked', 'expired')),
  expires_at timestamptz not null,
  viewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (packet_id, signer_email, signer_role)
);

create index if not exists private_listing_seller_signing_recipients_packet_idx
  on public.private_listing_seller_signing_recipients (packet_id, status, expires_at);

create table if not exists public.private_listing_seller_document_signatures (
  id uuid primary key default gen_random_uuid(),
  packet_id uuid not null references public.private_listing_seller_signing_packets(id) on delete cascade,
  recipient_id uuid not null references public.private_listing_seller_signing_recipients(id) on delete cascade,
  document_key text not null check (document_key in ('mandate', 'disclosure', 'fica')),
  signed_name text not null,
  signature text not null,
  acceptance_ip text,
  acceptance_user_agent text,
  signed_at timestamptz not null default now(),
  immutable_document_hash text not null,
  unique (recipient_id, document_key)
);

create index if not exists private_listing_seller_document_signatures_packet_idx
  on public.private_listing_seller_document_signatures (packet_id, document_key, signed_at);

alter table public.private_listing_seller_signing_packets enable row level security;
alter table public.private_listing_seller_signing_recipients enable row level security;
alter table public.private_listing_seller_document_signatures enable row level security;

revoke all on table public.private_listing_seller_signing_packets from anon, authenticated;
revoke all on table public.private_listing_seller_signing_recipients from anon, authenticated;
revoke all on table public.private_listing_seller_document_signatures from anon, authenticated;
grant all on table public.private_listing_seller_signing_packets to service_role;
grant all on table public.private_listing_seller_signing_recipients to service_role;
grant all on table public.private_listing_seller_document_signatures to service_role;

-- The legacy one-document-per-session index prevents a combined signing link
-- from storing more than its first completed document. New packets use the
-- signature table above; remove this incompatible legacy restriction.
drop index if exists public.private_listing_documents_signing_session_unique;
