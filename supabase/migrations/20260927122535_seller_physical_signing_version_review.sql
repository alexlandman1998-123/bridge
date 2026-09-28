-- A wet-ink upload belongs to the current agent-reviewed signing copy.
-- Portal-signed documents are inserted as approved by their separate,
-- evidence-checked finalization command and do not use this review transition.
create function public.bridge_check_seller_physical_signing_review_version()
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

create trigger bridge_check_seller_physical_signing_review_version
before update of status on public.private_listing_documents
for each row
execute function public.bridge_check_seller_physical_signing_review_version();
