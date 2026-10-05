begin;

-- Preserve the existing token/session and Document Trust upload command. A
-- returned signing file additionally supplies the version the seller opened.
-- The record and all linking side effects roll back if that copy is stale.
create function public.bridge_upload_private_listing_seller_signed_copy(
  p_token text,
  p_requirement_key text,
  p_document_name text,
  p_storage_path text,
  p_file_url text default null,
  p_document_type text default null,
  p_canonical_requirement_instance_id uuid default null,
  p_category text default null,
  p_access_token text default null,
  p_reviewed_signing_version_id uuid default null,
  p_reviewed_signing_version_digest text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_document public.private_listing_documents%rowtype;
  v_pack jsonb;
  v_copy jsonb;
  v_result jsonb;
  v_key text := nullif(btrim(p_requirement_key), '');
begin
  if v_key is null or v_key not in ('signed_disclosure_form', 'signed_fica_declaration', 'signed_mandate')
     or p_reviewed_signing_version_id is null
     or coalesce(p_reviewed_signing_version_digest, '') !~ '^(sha256:)?[a-f0-9]{64}$' then
    raise exception 'A returned signing file needs its exact reviewed document version.' using errcode = '23514';
  end if;

  -- Serialize against canonical onboarding updates and replacement copies.
  select * into v_onboarding from public.private_listing_seller_onboarding
  where token = nullif(btrim(p_token), '') for update;

  -- The established command validates the link, password/session, exact
  -- requirement and canonical linking. It never approves the returned file.
  v_result := public.bridge_upload_private_listing_seller_document(
    p_token, p_requirement_key, p_document_name, p_storage_path, p_file_url,
    p_document_type, p_canonical_requirement_instance_id, p_category, p_access_token
  );

  v_pack := coalesce(v_onboarding.form_data->'sellerOnboardingManualSigningPack',
                     v_onboarding.form_data->'seller_onboarding_manual_signing_pack');
  if coalesce(v_onboarding.form_data #>> '{sellerOnboardingReview,status}',
              v_onboarding.form_data #>> '{seller_onboarding_review,status}') is distinct from 'approved'
     or coalesce(v_onboarding.form_data #>> '{sellerOnboardingFormalPackApproval,status}',
                 v_onboarding.form_data #>> '{seller_onboarding_formal_pack_approval,status}') is distinct from 'approved' then
    raise exception 'Approve the seller onboarding and signing copy before accepting its returned file.' using errcode = '23514';
  end if;
  if jsonb_typeof(v_pack->'documents') is distinct from 'array' then
    raise exception 'The reviewed signing pack is unavailable. Reopen the current signing copy.' using errcode = '23514';
  end if;
  select copy into v_copy from jsonb_array_elements(v_pack->'documents') copy
  where copy->>'key' = v_key limit 1;

  if v_copy is null
     or v_copy->>'versionId' is distinct from p_reviewed_signing_version_id::text
     or v_copy->>'versionDigest' is distinct from p_reviewed_signing_version_digest
     or nullif(btrim(coalesce(v_copy->>'generatedHtml', v_copy->>'generated_html', '')), '') is null then
    raise exception 'The returned file does not match the current reviewed signing copy. Reopen it before uploading.' using errcode = '23514';
  end if;

  select * into v_document from public.private_listing_documents
  where id = nullif(v_result #>> '{document,id}', '')::uuid;
  if v_document.id is null or v_document.private_listing_id is distinct from v_onboarding.private_listing_id
     or v_document.document_type is distinct from v_key or v_document.requirement_id is null
     or v_document.status is distinct from 'uploaded' then
    raise exception 'The returned signing file was not linked to its exact seller requirement.' using errcode = '23514';
  end if;

  update public.private_listing_documents
  set reviewed_signing_version_id = p_reviewed_signing_version_id,
      reviewed_signing_version_digest = p_reviewed_signing_version_digest
  where id = v_document.id returning * into v_document;
  return jsonb_set(v_result, '{document}', to_jsonb(v_document));
end;
$$;

revoke all on function public.bridge_upload_private_listing_seller_signed_copy(text,text,text,text,text,text,uuid,text,text,uuid,text) from public;
grant execute on function public.bridge_upload_private_listing_seller_signed_copy(text,text,text,text,text,text,uuid,text,text,uuid,text) to anon, authenticated, service_role;
comment on function public.bridge_upload_private_listing_seller_signed_copy(text,text,text,text,text,text,uuid,text,text,uuid,text)
  is 'Token/session validated returned signing upload bound to the exact reviewed copy; approval remains a separate staff review.';

commit;
