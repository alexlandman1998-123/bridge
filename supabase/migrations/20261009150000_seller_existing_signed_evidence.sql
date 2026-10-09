-- Separate pre-existing signed evidence from a returned generated signing copy.
-- No historical documents or approvals are changed.
alter table public.private_listing_documents
  add column seller_signing_evidence_source text not null default 'reviewed_copy'
  check (seller_signing_evidence_source in ('reviewed_copy', 'existing_signed_upload'));

create function public.bridge_guard_seller_existing_signed_evidence()
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
  if new.status in ('uploaded', 'under_review', 'approved') and exists (
    select 1 from public.private_listing_seller_portal_signing_documents
    where private_listing_id = new.private_listing_id and document_key = v_key
      and status in ('prepared', 'sent', 'partially_signed', 'signed', 'reviewed')
  ) then
    raise exception 'Review the active online signing request before uploading or approving a replacement.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.bridge_guard_seller_existing_signed_evidence() from public, anon, authenticated;
create trigger bridge_guard_seller_existing_signed_evidence
before insert or update of seller_signing_evidence_source, status on public.private_listing_documents
for each row execute function public.bridge_guard_seller_existing_signed_evidence();

create or replace function public.bridge_check_seller_physical_signing_review_version()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_key text;
  v_pack jsonb;
  v_copy jsonb;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  select requirement_key into v_key
  from public.private_listing_document_requirements
  where id = new.requirement_id and private_listing_id = new.private_listing_id;

  if v_key not in ('signed_mandate', 'signed_fica_declaration', 'signed_disclosure_form') then
    if new.reviewed_signing_version_id is not null then
      raise exception 'Reviewed signing evidence must link to a seller signing requirement.' using errcode = '23514';
    end if;
    return new;
  end if;

  -- An agent's explicit existing-document upload has its own evidence path.
  -- It must not pretend to be a return of a generated signing version.
  if new.seller_signing_evidence_source = 'existing_signed_upload' then
    if new.document_type is distinct from v_key
       or new.reviewed_signing_version_id is not null
       or new.reviewed_signing_version_digest is not null
       or nullif(btrim(coalesce(new.storage_path, '')), '') is null
       or new.reviewed_by is null or new.reviewed_at is null
       or nullif(btrim(coalesce(new.review_reason, '')), '') is null
    then
      raise exception 'Existing signed evidence requires an exact requirement, stored file and recorded signature review.' using errcode = '23514';
    end if;
    return new;
  end if;

  select coalesce(form_data->'sellerOnboardingManualSigningPack',
                  form_data->'seller_onboarding_manual_signing_pack') into v_pack
  from public.private_listing_seller_onboarding
  where private_listing_id = new.private_listing_id
  order by updated_at desc nulls last
  limit 1;

  -- Older standalone uploads retain their existing review path. Once an
  -- approved pack exists, its three signing copies must use its exact version.
  if v_pack is null then
    if new.reviewed_signing_version_id is not null then
      raise exception 'The reviewed signing pack is unavailable for this upload.' using errcode = '23514';
    end if;
    return new;
  end if;
  if jsonb_typeof(v_pack->'documents') is distinct from 'array' then
    raise exception 'The reviewed signing pack has no document versions.' using errcode = '23514';
  end if;

  select copy into v_copy
  from jsonb_array_elements(v_pack->'documents') as copy
  where copy->>'key' = v_key
  limit 1;

  if v_copy is null then
    raise exception 'No reviewed physical signing copy exists for this document.' using errcode = '23514';
  end if;
  if new.document_type <> v_key
     or new.reviewed_signing_version_id is null
     or new.reviewed_signing_version_digest is null
     or new.reviewed_signing_version_id::text is distinct from v_copy->>'versionId'
     or new.reviewed_signing_version_digest is distinct from v_copy->>'versionDigest'
     or nullif(btrim(coalesce(new.storage_path, '')), '') is null
     or new.reviewed_by is null
     or new.reviewed_at is null
     or nullif(btrim(coalesce(new.review_reason, '')), '') is null
  then
    raise exception 'The signed upload does not match the current reviewed physical signing copy or lacks a recorded signature review.' using errcode = '23514';
  end if;

  return new;
end;
$$;


revoke all on function public.bridge_check_seller_physical_signing_review_version() from public, anon, authenticated;

-- Issuing a new online request must not race a pending review of existing evidence.
create function public.bridge_guard_seller_portal_existing_evidence()
returns trigger language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.private_listing_id::text || ':' || new.document_key, 0));
  if exists (
    select 1 from public.private_listing_documents document
    join public.private_listing_document_requirements requirement
      on requirement.id = document.requirement_id and requirement.private_listing_id = document.private_listing_id
    where document.private_listing_id = new.private_listing_id
      and requirement.requirement_key = new.document_key
      and document.status in ('uploaded', 'under_review')
  ) then
    raise exception 'Review the existing signed upload before sending a new signature request.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.bridge_guard_seller_portal_existing_evidence() from public, anon, authenticated;
create trigger bridge_guard_seller_portal_existing_evidence
before insert on public.private_listing_seller_portal_signing_documents
for each row execute function public.bridge_guard_seller_portal_existing_evidence();
