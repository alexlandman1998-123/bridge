begin;

-- The August upload replacement lost the stable-link resolver. Preserve the
-- current Document Trust operation and its private upload base, translating
-- only a validated workspace capability to the base's legacy token input.
-- Expired onboarding links and one-time invitation links cannot upload.
do $migration$
declare
  v_signature regprocedure := to_regprocedure('public.bridge_upload_private_listing_seller_document(text,text,text,text,text,text,uuid,text,text)');
  v_definition text;
  v_original text := E'begin\n  v_result := public.bridge_upload_private_listing_seller_document_phase1_base(\n    p_token,';
  v_replacement text := E'begin\n  -- seller_upload_token_resolution_v1\n  select * into v_resolution\n  from public.bridge_resolve_private_listing_seller_portal_token(p_token);\n  if not found or not coalesce(v_resolution.token_valid, false)\n     or v_resolution.token_kind not in (''stable'', ''legacy'') then\n    raise exception ''Seller portal link is invalid or inactive.'';\n  end if;\n\n  v_result := public.bridge_upload_private_listing_seller_document_phase1_base(\n    v_resolution.legacy_token,';
begin
  if v_signature is null then
    raise exception 'Seller upload token resolution requires the Document Trust upload function.';
  end if;
  v_definition := pg_get_functiondef(v_signature);
  if position('seller_upload_token_resolution_v1' in v_definition) = 0 then
    if position(v_original in v_definition) = 0
       or position(E'declare\n  v_result jsonb;' in v_definition) = 0
       or position('document_trust_state' in v_definition) = 0 then
      raise exception 'Unexpected seller upload definition; review its token resolution before applying this correction.';
    end if;
    v_definition := replace(v_definition, E'declare\n  v_result jsonb;', E'declare\n  v_resolution record;\n  v_result jsonb;');
    execute replace(v_definition, v_original, v_replacement);
  end if;
end;
$migration$;

-- Returned physical signing copies lock the same resolved onboarding row.
-- Keep the exact reviewed version/digest, session and atomic linking checks.
do $migration$
declare
  v_signature regprocedure := to_regprocedure('public.bridge_upload_private_listing_seller_signed_copy(text,text,text,text,text,text,uuid,text,text,uuid,text)');
  v_definition text;
  v_original text := E'where token = nullif(btrim(p_token), '''') for update;';
  v_replacement text := E'-- seller_signed_upload_token_resolution_v1\n  where id = (\n    select onboarding_id\n    from public.bridge_resolve_private_listing_seller_portal_token(p_token)\n    where token_valid and token_kind in (''stable'', ''legacy'')\n  ) for update;';
begin
  if v_signature is null then
    raise exception 'Seller upload token resolution requires the reviewed signing-copy upload function.';
  end if;
  v_definition := pg_get_functiondef(v_signature);
  if position('seller_signed_upload_token_resolution_v1' in v_definition) = 0 then
    if position(v_original in v_definition) = 0 then
      raise exception 'Unexpected signing-copy upload definition; review its token resolution before applying this correction.';
    end if;
    execute replace(v_definition, v_original, v_replacement);
  end if;
end;
$migration$;

-- CREATE OR REPLACE retains the existing owner, grants and security settings.
-- No records, portal tokens, expiry times or storage objects are rewritten.
notify pgrst, 'reload schema';
commit;
