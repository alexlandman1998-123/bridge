-- Online signing is retired. Retain every session and its signature evidence,
-- but ensure no session that was left open can be mistaken for a usable signing
-- link after the application deployment.
--
-- This is intentionally a one-way status transition only: it does not delete,
-- redact, or overwrite any historical session, document, acknowledgement, or
-- signature data. The retired Edge Function independently returns 410 for all
-- requests, so this database transition is defence in depth for stored state.
update public.private_listing_mandate_signing_sessions
set
  status = 'revoked',
  updated_at = now()
where status = 'active';

-- Existing database RPCs are retained as explicit tombstones so that stale
-- clients and any server-side caller fail closed as well. They cannot create,
-- update, rotate, acknowledge, or complete an online signing session.
create or replace function public.complete_private_listing_seller_signing_pack(
  p_session_id uuid,
  p_signed_name text,
  p_signature text,
  p_acceptance_ip text,
  p_acceptance_user_agent text,
  p_generated_documents jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  raise exception 'Online document signing has been retired. Arrange wet-ink signatures and upload the signed originals for review.' using errcode = 'P0001';
end;
$$;

create or replace function public.complete_private_listing_seller_document_signing(
  p_session_id uuid,
  p_document_key text,
  p_signed_name text,
  p_signature text,
  p_acceptance_ip text,
  p_acceptance_user_agent text,
  p_generated_html text,
  p_generated_file_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  raise exception 'Online document signing has been retired. Arrange wet-ink signatures and upload the signed originals for review.' using errcode = 'P0001';
end;
$$;

create or replace function public.bridge_prepare_listing_seller_signing_pack_atomically(
  p_listing_id uuid,
  p_signing_group_id uuid,
  p_sessions jsonb,
  p_superseded_signing_group_id uuid default null,
  p_replacement_reason text default null,
  p_initiated_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  raise exception 'Online document signing has been retired. Prepare a physical-signature pack instead.' using errcode = 'P0001';
end;
$$;

create or replace function public.bridge_replace_listing_seller_signing_pack(
  p_listing_id uuid,
  p_superseded_signing_group_id uuid,
  p_replacement_signing_group_id uuid,
  p_reason text,
  p_initiated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  raise exception 'Online document signing has been retired. Prepare a physical-signature pack instead.' using errcode = 'P0001';
end;
$$;

create or replace function public.bridge_amend_listing_seller_signing_pack(
  p_listing_id uuid,
  p_signed_signing_group_id uuid,
  p_amendment_signing_group_id uuid,
  p_reason text,
  p_initiated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  raise exception 'Online document signing has been retired. Prepare a physical-signature pack instead.' using errcode = 'P0001';
end;
$$;

create or replace function public.bridge_rotate_listing_seller_signing_link(
  p_session_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_initiated_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  raise exception 'Online document signing has been retired. Signing links cannot be issued or rotated.' using errcode = 'P0001';
end;
$$;

create or replace function public.bridge_record_private_listing_signing_acknowledgements(
  p_signing_session_id uuid,
  p_acknowledgements jsonb,
  p_terms_version text,
  p_terms_content_digest text,
  p_accepted_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  raise exception 'Online document signing has been retired. Signing acknowledgements cannot be recorded.' using errcode = 'P0001';
end;
$$;

create or replace function public.bridge_update_listing_signing_seller_details(
  p_session_id uuid,
  p_seller jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  raise exception 'Online document signing has been retired. Seller details cannot be updated through a signing session.' using errcode = 'P0001';
end;
$$;

revoke execute on function public.complete_private_listing_seller_signing_pack(uuid, text, text, text, text, jsonb) from public;
revoke execute on function public.complete_private_listing_seller_document_signing(uuid, text, text, text, text, text, text, text) from public;
revoke execute on function public.bridge_prepare_listing_seller_signing_pack_atomically(uuid, uuid, jsonb, uuid, text, uuid) from public;
revoke execute on function public.bridge_replace_listing_seller_signing_pack(uuid, uuid, uuid, text, uuid) from public;
revoke execute on function public.bridge_amend_listing_seller_signing_pack(uuid, uuid, uuid, text, uuid) from public;
revoke execute on function public.bridge_rotate_listing_seller_signing_link(uuid, text, timestamptz, uuid) from public;
revoke execute on function public.bridge_record_private_listing_signing_acknowledgements(uuid, jsonb, text, text, timestamptz) from public;
revoke execute on function public.bridge_update_listing_signing_seller_details(uuid, jsonb) from public;

comment on table public.private_listing_mandate_signing_sessions is
  'Historical seller mandate signing sessions. Online signing was retired on 2026-09-25; any previously active session was revoked while its audit evidence was retained.';
