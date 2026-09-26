begin;

-- Unmatched buyer evidence is visible as an upload, never as a satisfied
-- requirement. The bearer token selects the transaction; callers supply no id.
create or replace function public.bridge_client_portal_unmatched_buyer_documents_projection()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token text := nullif(trim(coalesce(public.bridge_client_portal_request_token(), '')), '');
  v_link public.client_portal_links%rowtype;
  v_documents jsonb := '[]'::jsonb;
begin
  if v_token is null then
    raise exception 'A valid buyer portal token is required.' using errcode = '42501';
  end if;

  select link.* into v_link
  from public.client_portal_links link
  join public.transactions transaction_row on transaction_row.id = link.transaction_id
  where link.token = v_token
    and link.is_active is true
    and link.buyer_id is not null
    and transaction_row.development_id is not distinct from link.development_id
    and transaction_row.unit_id is not distinct from link.unit_id
    and transaction_row.buyer_id is not distinct from link.buyer_id
  order by link.updated_at desc nulls last, link.created_at desc nulls last
  limit 1;

  if not found then
    raise exception 'Buyer portal link is invalid or inactive.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', document_row.id,
    'name', document_row.name,
    'file_name', document_row.file_name,
    'file_path', document_row.file_path,
    'file_bucket', document_row.file_bucket,
    'document_type', document_row.document_type,
    'category', document_row.category,
    'status', document_row.status,
    'visibility_scope', document_row.visibility_scope,
    'is_client_visible', document_row.is_client_visible,
    'uploaded_at', document_row.uploaded_at,
    'created_at', document_row.created_at,
    'source', document_row.source,
    'canonical_requirement_instance_id', null
  ) order by document_row.uploaded_at desc nulls last, document_row.created_at desc), '[]'::jsonb)
  into v_documents
  from public.documents document_row
  where document_row.transaction_id = v_link.transaction_id
    and document_row.source in ('agent_buyer_document_upload', 'client_portal_requested_document_upload')
    and document_row.canonical_requirement_instance_id is null
    and (
      document_row.client_recipient_role = 'buyer'
      or (document_row.source = 'client_portal_requested_document_upload' and document_row.source_requirement_id is not null)
    )
    and document_row.uploaded_by_party = 'buyer'
    and document_row.is_client_visible is true
    and lower(coalesce(document_row.visibility_scope, '')) = 'shared'
    and nullif(trim(document_row.file_path), '') is not null
    and document_security.can_read(document_row)
    and not exists (
      select 1 from public.document_requirement_instances requirement
      where requirement.transaction_id = v_link.transaction_id
        and requirement.satisfied_by_document_id = document_row.id
    );

  return jsonb_build_object(
    'projectionVersion', 'buyer_unmatched_documents_phase3',
    'role', 'buyer',
    'transactionId', v_link.transaction_id,
    'documents', v_documents
  );
end;
$$;

revoke all on function public.bridge_client_portal_unmatched_buyer_documents_projection() from public;
grant execute on function public.bridge_client_portal_unmatched_buyer_documents_projection() to anon, authenticated;

comment on function public.bridge_client_portal_unmatched_buyer_documents_projection() is
  'Buyer-token-scoped, buyer-only agent uploads not yet attached to an exact canonical requirement.';

notify pgrst, 'reload schema';

commit;
