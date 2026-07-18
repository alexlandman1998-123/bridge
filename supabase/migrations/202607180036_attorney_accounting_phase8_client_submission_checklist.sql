begin;

create or replace function public.bridge_client_portal_submit_matter_financial_request_document(
  p_workspace text default 'buyer',
  p_financial_account_id uuid default null,
  p_request_id uuid default null,
  p_storage_bucket text default null,
  p_storage_path text default null,
  p_file_name text default null,
  p_mime_type text default null,
  p_file_size_bytes bigint default null,
  p_amount numeric default null,
  p_document_date date default null,
  p_reference text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_token text := public.bridge_client_portal_request_token();
  v_link public.client_portal_links%rowtype;
  v_party_role text := case
    when lower(coalesce(p_workspace, 'buyer')) in ('seller', 'selling') then 'seller'
    else 'buyer'
  end;
  v_account public.matter_financial_accounts%rowtype;
  v_request public.matter_financial_document_requests%rowtype;
  v_document public.matter_financial_documents%rowtype;
  v_document_type text;
  v_title text;
begin
  if coalesce(v_token, '') = '' then
    raise exception 'Client portal token is required.';
  end if;

  if p_financial_account_id is null then
    raise exception 'Financial account is required.';
  end if;

  if p_request_id is null then
    raise exception 'Finance request is required.';
  end if;

  if coalesce(nullif(trim(coalesce(p_storage_path, '')), ''), '') = '' then
    raise exception 'A file is required for this finance request.';
  end if;

  select *
  into v_link
  from public.client_portal_links link
  where link.token = v_token
    and link.is_active = true
  order by link.updated_at desc nulls last, link.created_at desc nulls last
  limit 1;

  if not found then
    raise exception 'Client portal link is invalid or inactive.';
  end if;

  select *
  into v_account
  from public.matter_financial_accounts account
  where account.id = p_financial_account_id
    and account.transaction_id = v_link.transaction_id
    and account.party_role = v_party_role
    and account.portal_enabled = true
    and account.status = 'active'
  limit 1;

  if not found then
    raise exception 'This account is not available in your portal.';
  end if;

  select *
  into v_request
  from public.matter_financial_document_requests request
  where request.id = p_request_id
    and request.financial_account_id = v_account.id
    and request.transaction_id = v_account.transaction_id
    and request.portal_visible = true
    and request.request_status not in ('complete', 'cancelled')
    and request.audience_role <> 'internal'
    and (
      request.audience_role = v_account.party_role
      or request.audience_role in ('client', 'shared')
    )
  limit 1;

  if not found then
    raise exception 'This finance request is not available in your portal.';
  end if;

  v_document_type := case
    when v_request.request_type in ('invoice', 'statement', 'receipt', 'proof_of_payment', 'credit_note', 'debit_note', 'other')
      then v_request.request_type
    else 'other'
  end;
  v_title := coalesce(
    nullif(trim(v_request.title), ''),
    nullif(trim(p_reference), ''),
    case when v_document_type = 'proof_of_payment' then 'Proof of payment' else 'Finance document submission' end
  );

  insert into public.matter_financial_documents (
    financial_account_id,
    transaction_id,
    attorney_firm_id,
    uploaded_by,
    published_by,
    document_type,
    document_status,
    audience_role,
    external_reference,
    title,
    storage_bucket,
    storage_path,
    file_name,
    mime_type,
    file_size_bytes,
    currency_code,
    amount_total,
    amount_due,
    issued_on,
    published_at,
    notes,
    metadata_json
  )
  values (
    v_account.id,
    v_account.transaction_id,
    v_account.attorney_firm_id,
    null,
    null,
    v_document_type,
    'published',
    v_account.party_role,
    nullif(trim(coalesce(p_reference, '')), ''),
    v_title,
    nullif(trim(coalesce(p_storage_bucket, '')), ''),
    p_storage_path,
    coalesce(nullif(trim(coalesce(p_file_name, '')), ''), 'finance-document'),
    nullif(trim(coalesce(p_mime_type, '')), ''),
    case when p_file_size_bytes is not null and p_file_size_bytes >= 0 then p_file_size_bytes else null end,
    v_account.currency_code,
    p_amount,
    case when v_document_type = 'proof_of_payment' then null else p_amount end,
    p_document_date,
    now(),
    nullif(trim(coalesce(p_notes, '')), ''),
    jsonb_build_object(
      'source', 'client_portal_finance_request_submission',
      'protocol', 'client_submitted_requested_finance_document',
      'requestId', v_request.id,
      'requestType', v_request.request_type,
      'requiresAttorneyReview', v_document_type = 'proof_of_payment',
      'requiresRequestReview', true
    )
  )
  returning *
  into v_document;

  update public.matter_financial_document_requests
  set
    linked_document_id = v_document.id,
    request_status = 'awaiting_review',
    submitted_at = coalesce(submitted_at, now()),
    metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
      'lastSubmissionDocumentId', v_document.id,
      'lastSubmissionAt', now(),
      'lastSubmissionSource', 'client_portal_finance_request_submission',
      'lastSubmissionDocumentType', v_document.document_type
    )
  where id = v_request.id;

  insert into public.matter_financial_account_events (
    financial_account_id,
    transaction_id,
    event_type,
    event_visibility,
    actor_user_id,
    actor_role,
    payload_json
  )
  values (
    v_account.id,
    v_account.transaction_id,
    'client_finance_request_document_uploaded',
    'client_visible',
    null,
    v_account.party_role,
    jsonb_build_object(
      'requestId', v_request.id,
      'documentId', v_document.id,
      'documentType', v_document.document_type,
      'amount', v_document.amount_total,
      'documentDate', v_document.issued_on,
      'reference', v_document.external_reference,
      'requiresAttorneyReview', v_document_type = 'proof_of_payment'
    )
  );

  return jsonb_build_object(
    'document', jsonb_build_object(
      'id', v_document.id,
      'financialAccountId', v_document.financial_account_id,
      'transactionId', v_document.transaction_id,
      'documentType', v_document.document_type,
      'documentStatus', v_document.document_status,
      'audienceRole', v_document.audience_role,
      'externalReference', v_document.external_reference,
      'title', v_document.title,
      'storageBucket', v_document.storage_bucket,
      'storagePath', v_document.storage_path,
      'fileName', v_document.file_name,
      'mimeType', v_document.mime_type,
      'fileSizeBytes', v_document.file_size_bytes,
      'currencyCode', v_document.currency_code,
      'amountTotal', v_document.amount_total,
      'amountDue', v_document.amount_due,
      'issuedOn', v_document.issued_on,
      'publishedAt', v_document.published_at,
      'notes', v_document.notes
    ),
    'request', jsonb_build_object(
      'id', v_request.id,
      'requestStatus', 'awaiting_review',
      'linkedDocumentId', v_document.id,
      'submittedAt', now()
    ),
    'message', 'Document uploaded against the request for attorney review.'
  );
end;
$$;

revoke all on function public.bridge_client_portal_submit_matter_financial_request_document(text, uuid, uuid, text, text, text, text, bigint, numeric, date, text, text) from public;
grant execute on function public.bridge_client_portal_submit_matter_financial_request_document(text, uuid, uuid, text, text, text, text, bigint, numeric, date, text, text) to anon, authenticated;

comment on function public.bridge_client_portal_submit_matter_financial_request_document(text, uuid, uuid, text, text, text, text, bigint, numeric, date, text, text) is
  'Token-scoped buyer/seller upload for requested finance checklist items. Supports invoices, statements, receipts, and POPs; it does not post ledger entries.';

notify pgrst, 'reload schema';

commit;
