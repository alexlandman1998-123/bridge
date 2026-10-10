-- Agent uploads need only the signing-conflict answer, never the protected
-- signing documents, recipient credentials, HTML or signature evidence.
-- No historical evidence, document status or signing request is changed.
create schema if not exists private;

create or replace function private.bridge_seller_document_has_active_signing(p_listing_id uuid, p_document_key text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.private_listings listing
    where listing.id = p_listing_id
      and coalesce(public.bridge_is_active_member(listing.organisation_id), false)
      and (coalesce(public.bridge_is_org_admin(listing.organisation_id), false)
           or listing.assigned_agent_id = auth.uid() or listing.created_by = auth.uid())
  ) then
    raise exception 'Agent access is required for seller signing status.' using errcode = '42501';
  end if;
  if p_document_key is null or p_document_key not in ('signed_mandate', 'signed_fica_declaration', 'signed_disclosure_form') then
    raise exception 'Choose an exact seller signing requirement.' using errcode = '23514';
  end if;
  return exists (
    select 1 from public.private_listing_seller_portal_signing_documents
    where private_listing_id = p_listing_id and document_key = p_document_key
      and status in ('prepared', 'sent', 'partially_signed', 'signed', 'reviewed')
  );
end;
$$;
revoke all on function private.bridge_seller_document_has_active_signing(uuid, text) from public, anon, authenticated, service_role;
grant usage on schema private to authenticated, service_role;
grant execute on function private.bridge_seller_document_has_active_signing(uuid, text) to authenticated, service_role;

create or replace function public.bridge_guard_seller_existing_signed_evidence()
returns trigger language plpgsql set search_path = public as $$
declare v_key text; v_listing public.private_listings%rowtype;
begin
  if tg_op = 'UPDATE' and new.seller_signing_evidence_source is distinct from old.seller_signing_evidence_source then
    raise exception 'Seller signing evidence source is immutable.' using errcode = '23514';
  end if;
  if new.seller_signing_evidence_source <> 'existing_signed_upload' then return new; end if;
  select * into v_listing from public.private_listings where id = new.private_listing_id;
  if not found or not coalesce(public.bridge_is_active_member(v_listing.organisation_id), false)
     or (not coalesce(public.bridge_is_org_admin(v_listing.organisation_id), false)
         and v_listing.assigned_agent_id is distinct from auth.uid()
         and v_listing.created_by is distinct from auth.uid()) then
    raise exception 'Agent access is required for existing signed evidence.' using errcode = '42501';
  end if;
  select requirement_key into v_key from public.private_listing_document_requirements
    where id = new.requirement_id and private_listing_id = new.private_listing_id;
  if v_key is null or v_key not in ('signed_mandate', 'signed_fica_declaration', 'signed_disclosure_form')
     or new.document_type is distinct from v_key
     or new.reviewed_signing_version_id is not null or new.reviewed_signing_version_digest is not null then
    raise exception 'Existing signed evidence must link to its exact seller signing requirement without a generated version.' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.private_listing_id::text || ':' || v_key, 0));
  if tg_op = 'INSERT' and (new.status <> 'uploaded' or new.uploaded_by is distinct from auth.uid()) then
    raise exception 'Existing signed evidence must be uploaded by the agent and await review.' using errcode = '23514';
  end if;
  if new.status in ('uploaded', 'under_review', 'approved') and private.bridge_seller_document_has_active_signing(new.private_listing_id, v_key) then
    raise exception 'Review the active online signing request before uploading or approving a replacement.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.bridge_guard_seller_existing_signed_evidence() from public, anon, authenticated;
