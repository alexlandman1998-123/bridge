begin;

-- Phase 1 replaces the seller portal's best-effort legacy fallback with a
-- transaction-scoped continuity gate.  The original upload implementation is
-- retained privately so this migration does not replay or rewrite historical
-- seller documents.
do $$
declare
  v_current_upload oid := to_regprocedure('public.bridge_upload_private_listing_seller_document(text,text,text,text,text,text,uuid,text,text)');
  v_definition text;
begin
  if v_current_upload is null then
    raise exception 'Document Trust Phase 1 requires the nine-argument seller portal upload function.';
  end if;

  if to_regprocedure('public.bridge_upload_private_listing_seller_document_phase1_base(text,text,text,text,text,text,uuid,text,text)') is null then
    v_definition := pg_get_functiondef(v_current_upload);
    if position('bridge_upload_private_listing_seller_document_phase1_base' in v_definition) > 0 then
      raise exception 'Document Trust Phase 1 upload base is missing; restore it before retrying.';
    end if;
    execute 'alter function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text) rename to bridge_upload_private_listing_seller_document_phase1_base';
  end if;
end;
$$;

revoke all on function public.bridge_upload_private_listing_seller_document_phase1_base(text, text, text, text, text, text, uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.bridge_upload_private_listing_seller_document(
  p_token text,
  p_requirement_key text,
  p_document_name text,
  p_storage_path text,
  p_file_url text default null,
  p_document_type text default null,
  p_canonical_requirement_instance_id uuid default null,
  p_category text default null,
  p_access_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_result jsonb;
  v_source_document public.private_listing_documents%rowtype;
  v_shared_document public.documents%rowtype;
  v_document_id uuid;
  v_transaction_id uuid;
  v_promotion jsonb;
  v_continuity jsonb;
begin
  v_result := public.bridge_upload_private_listing_seller_document_phase1_base(
    p_token,
    p_requirement_key,
    p_document_name,
    p_storage_path,
    p_file_url,
    p_document_type,
    p_canonical_requirement_instance_id,
    p_category,
    p_access_token
  );

  v_document_id := nullif(v_result #>> '{document,id}', '')::uuid;
  if v_document_id is null then
    raise exception 'Seller upload did not create a source document.' using errcode = 'P0001';
  end if;

  v_promotion := public.bridge_promote_private_listing_document_row(v_document_id);
  v_continuity := coalesce(
    v_promotion -> 'continuity',
    public.bridge_apply_seller_document_transaction_continuity_p0_6(v_document_id)
  );

  select * into v_source_document
  from public.private_listing_documents
  where id = v_document_id;

  v_transaction_id := coalesce(
    v_source_document.promoted_transaction_id,
    public.bridge_resolve_private_listing_transaction_id(v_source_document.private_listing_id)
  );

  if v_source_document.promoted_document_id is not null then
    select * into v_shared_document
    from public.documents
    where id = v_source_document.promoted_document_id;
  end if;

  -- A pre-transaction seller upload is retained as an explicitly pending
  -- source document.  It must never be reported as a completed transaction
  -- upload before a transaction exists.
  if v_transaction_id is null then
    return v_result || jsonb_build_object(
      'document', to_jsonb(v_source_document),
      'transaction_id', null,
      'shared_document', null,
      'pending_transaction_promotion', true,
      'promotion', v_promotion,
      'continuity', v_continuity,
      'document_trust_state', 'pending_transaction_link'
    );
  end if;

  -- For an active transaction, the source upload, shared document, and
  -- canonical requirement are one all-or-nothing database operation.  Raising
  -- here rolls back the base upload instead of leaving a legacy-only success.
  if v_shared_document.id is null
     or v_shared_document.transaction_id is distinct from v_transaction_id
     or v_shared_document.canonical_requirement_instance_id is null then
    raise exception 'Seller upload could not be linked to the canonical transaction document requirement.'
      using errcode = 'P0001',
            detail = jsonb_build_object(
              'private_listing_document_id', v_document_id,
              'transaction_id', v_transaction_id,
              'promotion_status', v_source_document.promotion_status,
              'promotion_error', v_source_document.promotion_error
            )::text,
            hint = 'Retry after the canonical document requirement is available, or resolve the document-link exception.';
  end if;

  return v_result || jsonb_build_object(
    'document', to_jsonb(v_source_document),
    'transaction_id', v_transaction_id,
    'shared_document', to_jsonb(v_shared_document),
    'pending_transaction_promotion', false,
    'promotion', v_promotion,
    'continuity', v_continuity,
    'document_trust_state', 'canonically_linked'
  );
end;
$$;

revoke all on function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text)
  from public;
grant execute on function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text)
  to anon, authenticated;

comment on function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text)
  is 'Phase 1 seller upload: active transactions require an atomically linked shared document and canonical requirement; pre-transaction uploads remain explicitly pending.';

commit;
