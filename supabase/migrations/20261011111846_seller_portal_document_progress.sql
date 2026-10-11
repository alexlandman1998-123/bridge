begin;

-- Preserve existing token/session checks and audience filtering. Only their
-- successful, access-protected result may acquire document progress.
create schema if not exists seller_document_progress_private;
revoke all on schema seller_document_progress_private from public, anon, authenticated;

alter function public.bridge_private_listing_seller_portal_payload(text,text,boolean)
  set schema seller_document_progress_private;
alter function public.bridge_private_listing_seller_portal_core_payload(text,text,boolean)
  set schema seller_document_progress_private;
revoke all on function seller_document_progress_private.bridge_private_listing_seller_portal_payload(text,text,boolean) from public, anon, authenticated, service_role;
revoke all on function seller_document_progress_private.bridge_private_listing_seller_portal_core_payload(text,text,boolean) from public, anon, authenticated, service_role;

create function seller_document_progress_private.with_document_progress(p_payload jsonb, p_require_access boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_listing_id uuid;
  v_documents jsonb;
  v_form jsonb;
  v_copies jsonb;
begin
  if p_require_access is not true or p_payload is null
    or coalesce(p_payload->>'authRequired','false') = 'true'
    or nullif(p_payload#>>'{listing,id}','') is null then
    return p_payload;
  end if;
  v_listing_id := (p_payload#>>'{listing,id}')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'document_key', d.document_key, 'version_id', d.version_id,
    'status', d.status, 'created_at', d.created_at, 'sent_at', d.sent_at,
    'signed_at', d.signed_at, 'reviewed_at', d.reviewed_at,
    'revoked_at', d.revoked_at, 'revoke_reason', d.revoke_reason,
    'signer_count', counts.total, 'signed_count', counts.signed
  ) order by d.created_at desc), '[]'::jsonb) into v_documents
  from public.private_listing_seller_portal_signing_documents d
  cross join lateral (
    select count(*) as total, count(*) filter (where r.status = 'signed') as signed
    from public.private_listing_seller_portal_signing_recipients r where r.signing_document_id = d.id
  ) counts
  where d.private_listing_id = v_listing_id
    and d.document_key in ('signed_mandate','signed_disclosure_form','signed_fica_declaration');
  select o.form_data into v_form from public.private_listing_seller_onboarding o
    where o.private_listing_id = v_listing_id and o.id::text = p_payload#>>'{onboarding,id}';
  v_copies := coalesce(v_form#>'{sellerOnboardingManualSigningPack,documents}', v_form#>'{seller_onboarding_manual_signing_pack,documents}', '[]'::jsonb);
  if jsonb_typeof(v_copies) is distinct from 'array' then v_copies := '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('key', c->>'key', 'versionId', c->>'versionId', 'signingRoute', c->>'signingRoute')), '[]'::jsonb)
    into v_copies from jsonb_array_elements(v_copies) c
    where c->>'key' in ('signed_mandate','signed_disclosure_form','signed_fica_declaration');
  -- Core reads also get the workflow marker and copy identifiers without the
  -- full questionnaire or HTML. Never expose recipient identity or link tokens.
  return p_payload || jsonb_build_object('sellerPortalSigningRequests', v_documents,
    'sellerDocumentWorkspace', jsonb_build_object(
      'informationOnly', coalesce(v_form#>'{sellerOnboardingCompletion,informationOnly}', v_form#>'{seller_onboarding_completion,informationOnly}', 'false'::jsonb) = 'true'::jsonb,
      'documents', v_copies));
end;
$$;
revoke all on function seller_document_progress_private.with_document_progress(jsonb,boolean) from public, anon, authenticated, service_role;

create function public.bridge_private_listing_seller_portal_payload(p_token text, p_access_token text default null, p_require_access boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return seller_document_progress_private.with_document_progress(
    seller_document_progress_private.bridge_private_listing_seller_portal_payload(p_token,p_access_token,p_require_access), p_require_access);
end;
$$;
create function public.bridge_private_listing_seller_portal_core_payload(p_token text, p_access_token text default null, p_require_access boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return seller_document_progress_private.with_document_progress(
    seller_document_progress_private.bridge_private_listing_seller_portal_core_payload(p_token,p_access_token,p_require_access), p_require_access);
end;
$$;
revoke all on function public.bridge_private_listing_seller_portal_payload(text,text,boolean) from public, anon, authenticated, service_role;
revoke all on function public.bridge_private_listing_seller_portal_core_payload(text,text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.bridge_private_listing_seller_portal_payload(text,text,boolean) to anon, authenticated;
grant execute on function public.bridge_private_listing_seller_portal_core_payload(text,text,boolean) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
