begin;

create or replace function public.bridge_portal_request_header_raw(p_name text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim(coalesce(
    public.bridge_request_headers() ->> lower(coalesce(p_name, '')),
    ''
  )), '');
$$;

create or replace function public.bridge_portal_matter_financial_transaction_id(
  p_workspace text default 'buyer'
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_workspace text := case
    when lower(coalesce(p_workspace, 'buyer')) in ('seller', 'selling') then 'seller'
    else 'buyer'
  end;
  v_client_token text := public.bridge_client_portal_request_token();
  v_seller_token text := coalesce(
    public.bridge_portal_request_header_raw('x-bridge-seller-portal-token'),
    public.bridge_portal_request_header_raw('x-bridge-client-portal-token')
  );
  v_seller_access_token text := public.bridge_portal_request_header_raw('x-bridge-seller-portal-access-token');
  v_seller_payload jsonb;
  v_listing_id uuid;
  v_transaction_id uuid;
begin
  if coalesce(v_client_token, '') <> '' then
    select link.transaction_id
    into v_transaction_id
    from public.client_portal_links link
    where link.token = v_client_token
      and link.is_active = true
    order by link.updated_at desc nulls last, link.created_at desc nulls last
    limit 1;
  end if;

  if v_transaction_id is not null then
    return v_transaction_id;
  end if;

  if v_workspace <> 'seller' then
    return null;
  end if;

  if coalesce(v_seller_token, '') = '' then
    return null;
  end if;

  v_seller_payload := public.bridge_private_listing_seller_portal_payload(
    v_seller_token,
    v_seller_access_token,
    true
  );

  if v_seller_payload is null or coalesce((v_seller_payload ->> 'authRequired')::boolean, false) then
    return null;
  end if;

  begin
    v_transaction_id := nullif(v_seller_payload #>> '{transaction,id}', '')::uuid;
  exception
    when invalid_text_representation then
      v_transaction_id := null;
  end;

  if v_transaction_id is not null then
    return v_transaction_id;
  end if;

  begin
    v_listing_id := nullif(v_seller_payload #>> '{listing,id}', '')::uuid;
  exception
    when invalid_text_representation then
      v_listing_id := null;
  end;

  if v_listing_id is not null
     and to_regprocedure('public.bridge_resolve_private_listing_transaction_id(uuid)') is not null then
    v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing_id);
  end if;

  return v_transaction_id;
end;
$$;

create or replace function public.bridge_client_portal_matter_financial_accounts(
  p_workspace text default 'buyer'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_party_role text := case
    when lower(coalesce(p_workspace, 'buyer')) in ('seller', 'selling') then 'seller'
    else 'buyer'
  end;
  v_transaction_id uuid := public.bridge_portal_matter_financial_transaction_id(p_workspace);
  v_accounts jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_transaction_id is null then
    return jsonb_build_object(
      'accounts', '[]'::jsonb,
      'summary', jsonb_build_object(
        'balanceDue', 0,
        'totalCharged', 0,
        'totalCredited', 0,
        'documentCount', 0,
        'postedEntries', 0,
        'eventCount', 0,
        'requestCount', 0,
        'openRequests', 0,
        'overdueRequests', 0
      ),
      'workspace', v_party_role,
      'unavailable', false
    );
  end if;

  with scoped_accounts as (
    select
      account.id,
      account.transaction_id,
      account.party_role,
      account.party_ref,
      account.party_label,
      account.party_email,
      account.currency_code,
      account.status,
      account.portal_enabled,
      account.opening_balance,
      account.metadata_json,
      account.updated_at
    from public.matter_financial_accounts account
    where account.transaction_id = v_transaction_id
      and account.party_role = v_party_role
      and account.portal_enabled = true
      and account.status = 'active'
  ),
  visible_entries as (
    select entry.*
    from public.matter_financial_entries entry
    join scoped_accounts account on account.id = entry.financial_account_id
    where entry.entry_status = 'posted'
      and entry.entry_visibility = 'client_visible'
  ),
  visible_documents as (
    select document.*
    from public.matter_financial_documents document
    join scoped_accounts account on account.id = document.financial_account_id
    where document.document_status = 'published'
      and document.audience_role <> 'internal'
      and (
        document.audience_role = account.party_role
        or document.audience_role in ('client', 'shared')
      )
  ),
  visible_events as (
    select event.*
    from public.matter_financial_account_events event
    join scoped_accounts account on account.id = event.financial_account_id
    where event.event_visibility = 'client_visible'
  ),
  visible_requests as (
    select request.*
    from public.matter_financial_document_requests request
    join scoped_accounts account on account.id = request.financial_account_id
    where request.portal_visible = true
      and request.request_status <> 'cancelled'
      and request.audience_role <> 'internal'
      and (
        request.audience_role = account.party_role
        or request.audience_role in ('client', 'shared')
      )
  ),
  account_payloads as (
    select
      account.id,
      jsonb_build_object(
        'id', account.id,
        'transactionId', account.transaction_id,
        'partyRole', account.party_role,
        'partyRef', account.party_ref,
        'partyLabel', account.party_label,
        'partyEmail', account.party_email,
        'currencyCode', account.currency_code,
        'status', account.status,
        'portalEnabled', account.portal_enabled,
        'updatedAt', account.updated_at,
        'paymentInstructions', case
          when coalesce((account.metadata_json -> 'paymentInstructions' ->> 'published')::boolean, false) = true
            then account.metadata_json -> 'paymentInstructions'
          else '{}'::jsonb
        end,
        'balance', jsonb_build_object(
          'openingBalance', account.opening_balance,
          'postedEntryTotal', coalesce(sum(entry.amount), 0)::numeric(14, 2),
          'balanceDue', (account.opening_balance + coalesce(sum(entry.amount), 0))::numeric(14, 2),
          'totalCharged', coalesce(sum(entry.amount) filter (
            where entry.entry_type in ('opening_balance', 'charge', 'debit')
              and entry.amount > 0
          ), 0)::numeric(14, 2),
          'totalCredited', abs(coalesce(sum(entry.amount) filter (
            where entry.entry_type in ('payment', 'credit', 'write_off')
              and entry.amount < 0
          ), 0))::numeric(14, 2),
          'lastPostedAt', max(entry.posted_at)
        ),
        'requests', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', request.id,
              'financialAccountId', request.financial_account_id,
              'transactionId', request.transaction_id,
              'linkedDocumentId', request.linked_document_id,
              'requestType', request.request_type,
              'requestStatus', request.request_status,
              'audienceRole', request.audience_role,
              'portalVisible', request.portal_visible,
              'title', request.title,
              'description', request.description,
              'externalReference', request.external_reference,
              'currencyCode', request.currency_code,
              'amountDue', request.amount_due,
              'dueOn', request.due_on,
              'requestedAt', request.requested_at,
              'submittedAt', request.submitted_at,
              'reviewedAt', request.reviewed_at,
              'completedAt', request.completed_at,
              'reviewNotes', request.review_notes
            )
            order by
              case
                when request.request_status in ('requested', 'rejected') then 0
                when request.request_status in ('submitted', 'awaiting_review') then 1
                else 2
              end,
              request.due_on asc nulls last,
              request.created_at desc
          )
          from visible_requests request
          where request.financial_account_id = account.id
        ), '[]'::jsonb),
        'documents', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', document.id,
              'documentType', document.document_type,
              'documentStatus', document.document_status,
              'audienceRole', document.audience_role,
              'externalReference', document.external_reference,
              'title', document.title,
              'storageBucket', document.storage_bucket,
              'storagePath', document.storage_path,
              'fileName', document.file_name,
              'mimeType', document.mime_type,
              'fileSizeBytes', document.file_size_bytes,
              'currencyCode', document.currency_code,
              'amountTotal', document.amount_total,
              'amountDue', document.amount_due,
              'issuedOn', document.issued_on,
              'dueOn', document.due_on,
              'publishedAt', document.published_at,
              'notes', document.notes
            )
            order by document.issued_on desc nulls last, document.published_at desc nulls last, document.created_at desc
          )
          from visible_documents document
          where document.financial_account_id = account.id
        ), '[]'::jsonb),
        'entries', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', entry.id,
              'financialDocumentId', entry.financial_document_id,
              'entryType', entry.entry_type,
              'entryStatus', entry.entry_status,
              'entryVisibility', entry.entry_visibility,
              'amount', entry.amount,
              'currencyCode', entry.currency_code,
              'description', entry.description,
              'occurredOn', entry.occurred_on,
              'postedAt', entry.posted_at
            )
            order by entry.occurred_on desc, entry.created_at desc
          )
          from visible_entries entry
          where entry.financial_account_id = account.id
        ), '[]'::jsonb),
        'events', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', event.id,
              'eventType', event.event_type,
              'eventVisibility', event.event_visibility,
              'actorRole', event.actor_role,
              'payload', event.payload_json,
              'createdAt', event.created_at
            )
            order by event.created_at desc
          )
          from visible_events event
          where event.financial_account_id = account.id
        ), '[]'::jsonb)
      ) as account_json,
      (account.opening_balance + coalesce(sum(entry.amount), 0))::numeric(14, 2) as balance_due,
      coalesce(sum(entry.amount) filter (
        where entry.entry_type in ('opening_balance', 'charge', 'debit')
          and entry.amount > 0
      ), 0)::numeric(14, 2) as total_charged,
      abs(coalesce(sum(entry.amount) filter (
        where entry.entry_type in ('payment', 'credit', 'write_off')
          and entry.amount < 0
      ), 0))::numeric(14, 2) as total_credited,
      (select count(*) from visible_documents document where document.financial_account_id = account.id) as document_count,
      (select count(*) from visible_entries posted_entry where posted_entry.financial_account_id = account.id) as posted_entry_count,
      (select count(*) from visible_events event where event.financial_account_id = account.id) as event_count,
      (select count(*) from visible_requests request where request.financial_account_id = account.id) as request_count,
      (
        select count(*)
        from visible_requests request
        where request.financial_account_id = account.id
          and request.request_status in ('requested', 'submitted', 'awaiting_review', 'rejected')
      ) as open_request_count,
      (
        select count(*)
        from visible_requests request
        where request.financial_account_id = account.id
          and request.request_status in ('requested', 'rejected')
          and request.due_on is not null
          and request.due_on < current_date
      ) as overdue_request_count
    from scoped_accounts account
    left join visible_entries entry on entry.financial_account_id = account.id
    group by account.id, account.transaction_id, account.party_role, account.party_ref, account.party_label,
      account.party_email, account.currency_code, account.status, account.portal_enabled, account.opening_balance,
      account.metadata_json, account.updated_at
  )
  select
    coalesce(jsonb_agg(account_json order by account_json ->> 'partyRole', account_json ->> 'partyLabel'), '[]'::jsonb),
    jsonb_build_object(
      'balanceDue', coalesce(sum(balance_due), 0)::numeric(14, 2),
      'totalCharged', coalesce(sum(total_charged), 0)::numeric(14, 2),
      'totalCredited', coalesce(sum(total_credited), 0)::numeric(14, 2),
      'documentCount', coalesce(sum(document_count), 0),
      'postedEntries', coalesce(sum(posted_entry_count), 0),
      'eventCount', coalesce(sum(event_count), 0),
      'requestCount', coalesce(sum(request_count), 0),
      'openRequests', coalesce(sum(open_request_count), 0),
      'overdueRequests', coalesce(sum(overdue_request_count), 0)
    )
  into v_accounts, v_summary
  from account_payloads;

  return jsonb_build_object(
    'accounts', coalesce(v_accounts, '[]'::jsonb),
    'summary', coalesce(v_summary, '{}'::jsonb),
    'workspace', v_party_role,
    'unavailable', false
  );
end;
$$;

create or replace function public.bridge_storage_buyer_portal_can_write(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  with seller_scope as (
    select public.bridge_portal_matter_financial_transaction_id('seller') as transaction_id
  )
  select exists (
    select 1
    from public.client_portal_links link
    where link.is_active = true
      and link.token = public.bridge_storage_request_header('x-bridge-client-portal-token')
      and (
        (
          coalesce((storage.foldername(p_name))[1], '') = 'client-portal'
          and coalesce((storage.foldername(p_name))[2], '') = link.transaction_id::text
          and coalesce(storage.filename(p_name), '') <> ''
        )
        or exists (
          select 1
          from public.matter_financial_accounts account
          where account.id::text = coalesce((storage.foldername(p_name))[3], '')
            and account.transaction_id = link.transaction_id
            and account.party_role = case
              when lower(coalesce((storage.foldername(p_name))[2], 'buyer')) in ('seller', 'selling') then 'seller'
              else 'buyer'
            end
            and account.portal_enabled = true
            and account.status = 'active'
            and coalesce((storage.foldername(p_name))[1], '') = 'matter-financial-proof'
            and coalesce(storage.filename(p_name), '') <> ''
        )
        or exists (
          select 1
          from public.matter_financial_document_requests request
          join public.matter_financial_accounts account
            on account.id = request.financial_account_id
          where account.id::text = coalesce((storage.foldername(p_name))[3], '')
            and request.id::text = coalesce((storage.foldername(p_name))[4], '')
            and account.transaction_id = link.transaction_id
            and request.transaction_id = link.transaction_id
            and account.party_role = case
              when lower(coalesce((storage.foldername(p_name))[2], 'buyer')) in ('seller', 'selling') then 'seller'
              else 'buyer'
            end
            and account.portal_enabled = true
            and account.status = 'active'
            and request.portal_visible = true
            and request.request_status not in ('complete', 'cancelled')
            and request.audience_role <> 'internal'
            and (request.audience_role = account.party_role or request.audience_role in ('client', 'shared'))
            and coalesce((storage.foldername(p_name))[1], '') = 'matter-financial-request-documents'
            and coalesce(storage.filename(p_name), '') <> ''
        )
        or exists (
          select 1
          from public.client_issues issue
          where issue.id::text = coalesce((storage.foldername(p_name))[2], '')
            and issue.transaction_id = link.transaction_id
            and coalesce((storage.foldername(p_name))[1], '') = 'client-issues'
            and coalesce(storage.filename(p_name), '') <> ''
        )
        or exists (
          select 1
          from public.alteration_requests alteration
          where alteration.id::text = coalesce((storage.foldername(p_name))[2], '')
            and alteration.transaction_id = link.transaction_id
            and coalesce((storage.foldername(p_name))[1], '') = 'alteration-requests'
            and coalesce(storage.filename(p_name), '') <> ''
        )
      )
  )
  or exists (
    select 1
    from seller_scope
    join public.matter_financial_accounts account
      on account.transaction_id = seller_scope.transaction_id
    where seller_scope.transaction_id is not null
      and account.id::text = coalesce((storage.foldername(p_name))[3], '')
      and account.party_role = 'seller'
      and account.portal_enabled = true
      and account.status = 'active'
      and coalesce((storage.foldername(p_name))[2], '') in ('seller', 'selling')
      and coalesce((storage.foldername(p_name))[1], '') = 'matter-financial-proof'
      and coalesce(storage.filename(p_name), '') <> ''
  )
  or exists (
    select 1
    from seller_scope
    join public.matter_financial_accounts account
      on account.transaction_id = seller_scope.transaction_id
    join public.matter_financial_document_requests request
      on request.financial_account_id = account.id
    where seller_scope.transaction_id is not null
      and account.id::text = coalesce((storage.foldername(p_name))[3], '')
      and request.id::text = coalesce((storage.foldername(p_name))[4], '')
      and request.transaction_id = seller_scope.transaction_id
      and account.party_role = 'seller'
      and account.portal_enabled = true
      and account.status = 'active'
      and request.portal_visible = true
      and request.request_status not in ('complete', 'cancelled')
      and request.audience_role <> 'internal'
      and (request.audience_role = account.party_role or request.audience_role in ('client', 'shared'))
      and coalesce((storage.foldername(p_name))[2], '') in ('seller', 'selling')
      and coalesce((storage.foldername(p_name))[1], '') = 'matter-financial-request-documents'
      and coalesce(storage.filename(p_name), '') <> ''
  )
  or exists (
    select 1
    from public.transaction_onboarding onboarding
    where onboarding.is_active = true
      and onboarding.token = public.bridge_storage_request_header('x-bridge-onboarding-token')
      and coalesce((storage.foldername(p_name))[1], '') = 'onboarding'
      and coalesce((storage.foldername(p_name))[2], '') = onboarding.transaction_id::text
      and coalesce((storage.foldername(p_name))[3], '') <> ''
      and coalesce(storage.filename(p_name), '') <> ''
  );
$$;

drop function if exists public.bridge_client_portal_upload_matter_financial_proof(text, uuid, text, text, text, text, bigint, numeric, date, text, text);

create or replace function public.bridge_client_portal_upload_matter_financial_proof(
  p_workspace text default 'buyer',
  p_financial_account_id uuid default null,
  p_storage_bucket text default null,
  p_storage_path text default null,
  p_file_name text default null,
  p_mime_type text default null,
  p_file_size_bytes bigint default null,
  p_amount numeric default null,
  p_paid_on date default null,
  p_reference text default null,
  p_notes text default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_party_role text := case
    when lower(coalesce(p_workspace, 'buyer')) in ('seller', 'selling') then 'seller'
    else 'buyer'
  end;
  v_transaction_id uuid := public.bridge_portal_matter_financial_transaction_id(p_workspace);
  v_account public.matter_financial_accounts%rowtype;
  v_request public.matter_financial_document_requests%rowtype;
  v_document public.matter_financial_documents%rowtype;
  v_title text;
begin
  if v_transaction_id is null then
    raise exception 'Client portal link is invalid or inactive.';
  end if;

  if p_financial_account_id is null then
    raise exception 'Financial account is required.';
  end if;

  if coalesce(nullif(trim(coalesce(p_storage_path, '')), ''), '') = '' then
    raise exception 'Proof of payment file is required.';
  end if;

  select *
  into v_account
  from public.matter_financial_accounts account
  where account.id = p_financial_account_id
    and account.transaction_id = v_transaction_id
    and account.party_role = v_party_role
    and account.portal_enabled = true
    and account.status = 'active'
  limit 1;

  if not found then
    raise exception 'This account is not available in your portal.';
  end if;

  if p_request_id is not null then
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
      raise exception 'This request is not available in your portal.';
    end if;
  end if;

  v_title := coalesce(
    nullif(trim(p_reference), ''),
    case when p_request_id is not null then v_request.title else null end,
    case when p_paid_on is not null then 'Proof of payment - ' || p_paid_on::text else null end,
    'Proof of payment'
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
    'proof_of_payment',
    'published',
    v_account.party_role,
    nullif(trim(coalesce(p_reference, '')), ''),
    v_title,
    nullif(trim(coalesce(p_storage_bucket, '')), ''),
    p_storage_path,
    coalesce(nullif(trim(coalesce(p_file_name, '')), ''), 'proof-of-payment'),
    nullif(trim(coalesce(p_mime_type, '')), ''),
    case when p_file_size_bytes is not null and p_file_size_bytes >= 0 then p_file_size_bytes else null end,
    v_account.currency_code,
    p_amount,
    null,
    p_paid_on,
    now(),
    nullif(trim(coalesce(p_notes, '')), ''),
    jsonb_build_object(
      'source', 'client_portal_account_proof_upload',
      'protocol', 'client_submitted_payment_evidence',
      'requiresAttorneyReview', true,
      'requestId', p_request_id
    )
  )
  returning *
  into v_document;

  if p_request_id is not null then
    update public.matter_financial_document_requests
    set
      linked_document_id = v_document.id,
      request_status = 'awaiting_review',
      submitted_at = coalesce(submitted_at, now()),
      metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
        'lastSubmissionDocumentId', v_document.id,
        'lastSubmissionAt', now(),
        'lastSubmissionSource', 'client_portal_account_proof_upload'
      )
    where id = p_request_id;
  end if;

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
    'client_payment_proof_uploaded',
    'client_visible',
    null,
    v_account.party_role,
    jsonb_build_object(
      'documentId', v_document.id,
      'requestId', p_request_id,
      'documentType', v_document.document_type,
      'amount', v_document.amount_total,
      'paidOn', v_document.issued_on,
      'reference', v_document.external_reference,
      'requiresAttorneyReview', true
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
    'request', case
      when p_request_id is not null then jsonb_build_object(
        'id', p_request_id,
        'requestStatus', 'awaiting_review',
        'linkedDocumentId', v_document.id,
        'submittedAt', now()
      )
      else null
    end,
    'message', case
      when p_request_id is not null then 'Proof uploaded against the request for attorney review.'
      else 'Proof of payment uploaded for attorney review.'
    end
  );
end;
$$;

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
  v_party_role text := case
    when lower(coalesce(p_workspace, 'buyer')) in ('seller', 'selling') then 'seller'
    else 'buyer'
  end;
  v_transaction_id uuid := public.bridge_portal_matter_financial_transaction_id(p_workspace);
  v_account public.matter_financial_accounts%rowtype;
  v_request public.matter_financial_document_requests%rowtype;
  v_document public.matter_financial_documents%rowtype;
  v_document_type text;
  v_title text;
begin
  if v_transaction_id is null then
    raise exception 'Client portal link is invalid or inactive.';
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
  into v_account
  from public.matter_financial_accounts account
  where account.id = p_financial_account_id
    and account.transaction_id = v_transaction_id
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

revoke all on function public.bridge_portal_request_header_raw(text) from public;
grant execute on function public.bridge_portal_request_header_raw(text) to anon, authenticated;

revoke all on function public.bridge_portal_matter_financial_transaction_id(text) from public;
grant execute on function public.bridge_portal_matter_financial_transaction_id(text) to anon, authenticated;

revoke all on function public.bridge_client_portal_matter_financial_accounts(text) from public;
grant execute on function public.bridge_client_portal_matter_financial_accounts(text) to anon, authenticated;

revoke all on function public.bridge_storage_buyer_portal_can_write(text) from public;
grant execute on function public.bridge_storage_buyer_portal_can_write(text) to anon, authenticated;

revoke all on function public.bridge_client_portal_upload_matter_financial_proof(text, uuid, text, text, text, text, bigint, numeric, date, text, text, uuid) from public;
grant execute on function public.bridge_client_portal_upload_matter_financial_proof(text, uuid, text, text, text, text, bigint, numeric, date, text, text, uuid) to anon, authenticated;

revoke all on function public.bridge_client_portal_submit_matter_financial_request_document(text, uuid, uuid, text, text, text, text, bigint, numeric, date, text, text) from public;
grant execute on function public.bridge_client_portal_submit_matter_financial_request_document(text, uuid, uuid, text, text, text, text, bigint, numeric, date, text, text) to anon, authenticated;

comment on function public.bridge_portal_matter_financial_transaction_id(text) is
  'Resolves buyer client-portal or seller private-listing portal sessions to a transaction for matter account access.';

comment on function public.bridge_client_portal_matter_financial_accounts(text) is
  'Token-scoped read model for buyer/seller portal account details, including seller portal token support.';

comment on function public.bridge_client_portal_upload_matter_financial_proof(text, uuid, text, text, text, text, bigint, numeric, date, text, text, uuid) is
  'Token-scoped buyer/seller proof-of-payment upload metadata. Supports seller portal sessions and does not post ledger entries.';

comment on function public.bridge_client_portal_submit_matter_financial_request_document(text, uuid, uuid, text, text, text, text, bigint, numeric, date, text, text) is
  'Token-scoped buyer/seller upload for requested finance checklist items. Supports seller portal sessions and does not post ledger entries.';

notify pgrst, 'reload schema';

commit;
