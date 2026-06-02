begin;

alter table if exists public.documents
  add column if not exists source text,
  add column if not exists source_document_id uuid,
  add column if not exists uploaded_by_party text,
  add column if not exists file_bucket text;

alter table if exists public.private_listing_documents
  add column if not exists category text,
  add column if not exists pending_transaction_promotion boolean not null default false,
  add column if not exists promoted_transaction_id uuid references public.transactions(id) on delete set null,
  add column if not exists promoted_document_id uuid references public.documents(id) on delete set null;

create unique index if not exists documents_transaction_source_document_unique_idx
  on public.documents (transaction_id, source, source_document_id);

create index if not exists private_listing_documents_pending_transaction_idx
  on public.private_listing_documents (private_listing_id, pending_transaction_promotion, uploaded_at desc);

create or replace function public.bridge_normalize_document_key_candidate(value text)
returns text
language sql
immutable
as $$
  select trim(both '_' from regexp_replace(lower(trim(coalesce(value, ''))), '[^a-z0-9]+', '_', 'g'))::text
$$;

create or replace function public.bridge_resolve_private_listing_transaction_id(p_private_listing_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select
      t.id as transaction_id,
      0 as priority,
      coalesce(t.updated_at, t.created_at, now()) as sort_at
    from public.transactions t
    where t.listing_id = p_private_listing_id

    union all

    select
      o.transaction_id,
      1 as priority,
      coalesce(o.updated_at, o.created_at, now()) as sort_at
    from public.offers o
    where o.listing_id = p_private_listing_id
      and o.transaction_id is not null

    union all

    select
      t.id as transaction_id,
      2 as priority,
      coalesce(t.updated_at, t.created_at, o.updated_at, o.created_at, now()) as sort_at
    from public.offers o
    join public.transactions t
      on t.accepted_offer_id = o.id
    where o.listing_id = p_private_listing_id
  )
  select transaction_id
  from candidates
  where transaction_id is not null
  order by priority asc, sort_at desc
  limit 1
$$;

create or replace function public.bridge_private_listing_document_bucket_key(
  p_requirement_group text,
  p_requirement_key text,
  p_document_type text
)
returns text
language plpgsql
immutable
as $$
declare
  v_group text := lower(trim(coalesce(p_requirement_group, '')));
  v_requirement_key text := public.bridge_normalize_document_key_candidate(p_requirement_key);
  v_document_type text := public.bridge_normalize_document_key_candidate(p_document_type);
  v_search text := trim(both '_' from concat_ws('_', v_group, v_requirement_key, v_document_type));
begin
  if v_group = 'financial' or v_search like '%bond%' or v_search like '%finance%' or v_search like '%mortgage%' then
    return 'finance';
  end if;

  if v_group in ('mandate', 'marketing') or v_search like '%mandate%' or v_search like '%otp%' or v_search like '%sale%' then
    return 'sale';
  end if;

  if v_group = 'property' or v_search like '%rates%' or v_search like '%levy%' or v_search like '%clearance%' then
    return 'transfer';
  end if;

  return 'legal';
end;
$$;

create or replace function public.bridge_resolve_transaction_notification_targets(
  p_transaction_id uuid,
  p_role_types text[]
)
returns table(user_id uuid, role_type text)
language sql
stable
security definer
set search_path = public
as $$
  with requested_roles as (
    select distinct lower(trim(value)) as role_type
    from unnest(coalesce(p_role_types, array[]::text[])) as value
    where nullif(trim(value), '') is not null
  ),
  participant_targets as (
    select
      coalesce(tp.user_id, profile_by_email.id) as user_id,
      case
        when lower(trim(tp.role_type)) = 'attorney' then 'attorney'
        when lower(trim(tp.role_type)) = 'bond_originator' then 'bond_originator'
        when lower(trim(tp.role_type)) = 'agent' then 'agent'
        when lower(trim(tp.role_type)) = 'developer' then 'developer'
        when lower(trim(tp.role_type)) = 'seller' then 'seller'
        else lower(trim(tp.role_type))
      end as role_type
    from public.transaction_participants tp
    left join public.profiles profile_by_email
      on lower(coalesce(profile_by_email.email, '')) = lower(coalesce(tp.participant_email, ''))
    where tp.transaction_id = p_transaction_id
      and tp.removed_at is null
      and lower(coalesce(tp.status, 'active')) = 'active'
      and exists (
        select 1
        from requested_roles rr
        where rr.role_type = lower(trim(tp.role_type))
           or (rr.role_type = 'attorney' and lower(trim(tp.role_type)) = 'attorney')
      )
  ),
  roleplayer_targets as (
    select
      coalesce(
        nullif(trp.snapshot_json ->> 'assigned_user_id', '')::uuid,
        nullif(trp.snapshot_json ->> 'user_id', '')::uuid,
        profile_by_email.id
      ) as user_id,
      case
        when lower(trim(trp.role_type)) in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney') then 'attorney'
        when lower(trim(trp.role_type)) = 'developer_contact' then 'developer'
        else lower(trim(trp.role_type))
      end as role_type
    from public.transaction_role_players trp
    left join public.profiles profile_by_email
      on lower(coalesce(profile_by_email.email, '')) = lower(
        coalesce(
          trp.email_address,
          trp.snapshot_json ->> 'email',
          trp.snapshot_json ->> 'assigned_user_email',
          ''
        )
      )
    where trp.transaction_id = p_transaction_id
      and lower(coalesce(trp.assignment_status, trp.status, 'selected')) not in ('removed', 'declined', 'rejected')
      and exists (
        select 1
        from requested_roles rr
        where rr.role_type = lower(trim(trp.role_type))
           or (rr.role_type = 'attorney' and lower(trim(trp.role_type)) in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney'))
           or (rr.role_type = 'developer' and lower(trim(trp.role_type)) = 'developer_contact')
      )
  )
  select distinct targets.user_id, targets.role_type
  from (
    select * from participant_targets
    union all
    select * from roleplayer_targets
  ) as targets
  where targets.user_id is not null
$$;

create or replace function public.bridge_create_transaction_notifications_for_roles(
  p_transaction_id uuid,
  p_role_types text[],
  p_notification_type text,
  p_title text,
  p_message text,
  p_event_type text default 'TransactionUpdated',
  p_event_data jsonb default '{}'::jsonb,
  p_dedupe_prefix text default 'notify'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted_count integer := 0;
begin
  if p_transaction_id is null or coalesce(array_length(p_role_types, 1), 0) = 0 then
    return 0;
  end if;

  with targets as (
    select *
    from public.bridge_resolve_transaction_notification_targets(p_transaction_id, p_role_types)
  ),
  inserted as (
    insert into public.transaction_notifications (
      transaction_id,
      user_id,
      role_type,
      notification_type,
      title,
      message,
      is_read,
      dedupe_key,
      event_type,
      event_data
    )
    select
      p_transaction_id,
      targets.user_id,
      targets.role_type,
      coalesce(nullif(trim(p_notification_type), ''), 'document_uploaded'),
      coalesce(nullif(trim(p_title), ''), 'Document uploaded'),
      coalesce(p_message, ''),
      false,
      concat(
        coalesce(nullif(trim(p_dedupe_prefix), ''), 'notify'),
        ':',
        p_transaction_id::text,
        ':',
        targets.role_type,
        ':',
        targets.user_id::text
      ),
      coalesce(nullif(trim(p_event_type), ''), 'TransactionUpdated'),
      coalesce(p_event_data, '{}'::jsonb) || jsonb_build_object('recipientRole', targets.role_type)
    from targets
    on conflict do nothing
    returning 1
  )
  select count(*) into v_inserted_count
  from inserted;

  return coalesce(v_inserted_count, 0);
end;
$$;

create or replace function public.bridge_link_transaction_required_document_from_seller_upload(
  p_transaction_id uuid,
  p_document_id uuid,
  p_document_name text,
  p_category text,
  p_required_document_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_explicit_key text := public.bridge_normalize_document_key_candidate(p_required_document_key);
  v_category_key text := public.bridge_normalize_document_key_candidate(p_category);
  v_name_key text := public.bridge_normalize_document_key_candidate(p_document_name);
  v_matched public.transaction_required_documents%rowtype;
begin
  if p_transaction_id is null or p_document_id is null or to_regclass('public.transaction_required_documents') is null then
    return null;
  end if;

  if v_explicit_key <> '' then
    select *
      into v_matched
    from public.transaction_required_documents
    where transaction_id = p_transaction_id
      and public.bridge_normalize_document_key_candidate(document_key) = v_explicit_key
    order by sort_order asc, created_at asc
    limit 1;
  end if;

  if v_matched.id is null and v_category_key <> '' then
    select *
      into v_matched
    from public.transaction_required_documents
    where transaction_id = p_transaction_id
      and (
        public.bridge_normalize_document_key_candidate(document_key) = v_category_key
        or public.bridge_normalize_document_key_candidate(document_label) = v_category_key
      )
    order by sort_order asc, created_at asc
    limit 1;
  end if;

  if v_matched.id is null and v_name_key <> '' then
    select *
      into v_matched
    from public.transaction_required_documents
    where transaction_id = p_transaction_id
      and (
        v_name_key like '%' || public.bridge_normalize_document_key_candidate(document_key) || '%'
        or v_name_key like '%' || public.bridge_normalize_document_key_candidate(document_label) || '%'
      )
    order by sort_order asc, created_at asc
    limit 1;
  end if;

  if v_matched.id is null then
    return null;
  end if;

  update public.transaction_required_documents
     set is_uploaded = true,
         uploaded_document_id = p_document_id,
         status = 'uploaded',
         uploaded_at = now(),
         updated_at = now()
   where id = v_matched.id
   returning * into v_matched;

  return to_jsonb(v_matched);
end;
$$;

create or replace function public.bridge_link_document_request_from_seller_upload(
  p_transaction_id uuid,
  p_document_id uuid,
  p_category text,
  p_document_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_key text := public.bridge_normalize_document_key_candidate(p_category);
  v_name_key text := public.bridge_normalize_document_key_candidate(p_document_name);
  v_target public.document_requests%rowtype;
  v_next_status text := 'uploaded';
begin
  if p_transaction_id is null or p_document_id is null or to_regclass('public.document_requests') is null then
    return null;
  end if;

  select *
    into v_target
  from public.document_requests
  where transaction_id = p_transaction_id
    and status in ('requested', 'rejected', 'reviewed', 'under_review')
    and (
      (v_category_key = '')
      or public.bridge_normalize_document_key_candidate(category) = v_category_key
      or public.bridge_normalize_document_key_candidate(document_type) = v_category_key
      or public.bridge_normalize_document_key_candidate(title) like '%' || v_category_key || '%'
      or (
        v_name_key <> ''
        and (
          v_name_key like '%' || public.bridge_normalize_document_key_candidate(document_type) || '%'
          or v_name_key like '%' || public.bridge_normalize_document_key_candidate(title) || '%'
        )
      )
    )
  order by
    case lower(coalesce(priority, 'required'))
      when 'urgent' then 4
      when 'required' then 3
      when 'important' then 2
      when 'normal' then 2
      else 1
    end desc,
    created_at asc
  limit 1;

  if v_target.id is null then
    return null;
  end if;

  v_next_status := case when coalesce(v_target.requires_review, true) then 'uploaded' else 'completed' end;

  update public.document_requests
     set status = v_next_status,
         requested_document_id = p_document_id,
         completed_at = case when v_next_status = 'completed' then now() else null end,
         rejected_reason = null,
         updated_at = now()
   where id = v_target.id
   returning * into v_target;

  return to_jsonb(v_target);
end;
$$;

create or replace function public.bridge_recalculate_transaction_readiness_from_required_documents(
  p_transaction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction record;
  v_onboarding record;
  v_total_required integer := 0;
  v_uploaded_required integer := 0;
  v_missing_required integer := 0;
  v_docs_complete boolean := false;
  v_onboarding_complete boolean := false;
  v_finance_lane_ready boolean := false;
  v_attorney_lane_ready boolean := false;
  v_stage_ready boolean := false;
begin
  if p_transaction_id is null or to_regclass('public.transaction_readiness_states') is null then
    return null;
  end if;

  select
    t.id,
    lower(coalesce(t.finance_type, 'cash')) as finance_type,
    coalesce(t.current_main_stage, '') as current_main_stage,
    coalesce(t.stage, '') as stage
    into v_transaction
  from public.transactions t
  where t.id = p_transaction_id
  limit 1;

  if v_transaction.id is null then
    return null;
  end if;

  if to_regclass('public.transaction_required_documents') is not null then
    select
      count(*) filter (where coalesce(is_required, true) = true and coalesce(enabled, true) = true),
      count(*) filter (where coalesce(is_required, true) = true and coalesce(enabled, true) = true and coalesce(is_uploaded, false) = true)
      into v_total_required, v_uploaded_required
    from public.transaction_required_documents
    where transaction_id = p_transaction_id;
  end if;

  if to_regclass('public.transaction_onboarding') is not null then
    select status, coalesce(is_active, true) as is_active
      into v_onboarding
    from public.transaction_onboarding
    where transaction_id = p_transaction_id
    order by updated_at desc nulls last, created_at desc nulls last
    limit 1;
  end if;

  v_missing_required := greatest(coalesce(v_total_required, 0) - coalesce(v_uploaded_required, 0), 0);
  v_docs_complete := coalesce(v_total_required, 0) = 0 or v_missing_required = 0;
  v_onboarding_complete := coalesce(v_onboarding.status, 'Not Started') in ('Submitted', 'Reviewed', 'Approved');
  v_finance_lane_ready := case
    when v_transaction.finance_type in ('bond', 'mortgage', 'bank_finance', 'finance', 'loan') then v_docs_complete and v_onboarding_complete
    else v_docs_complete
  end;
  v_attorney_lane_ready := v_docs_complete and (
    v_transaction.finance_type = 'cash'
    or upper(v_transaction.current_main_stage) in ('ATTY', 'XFER', 'REG')
    or v_transaction.stage = 'Bond Approved / Proof of Funds'
  );
  v_stage_ready := v_docs_complete and v_onboarding_complete;

  insert into public.transaction_readiness_states (
    transaction_id,
    onboarding_status,
    onboarding_complete,
    docs_complete,
    missing_required_docs,
    uploaded_required_docs,
    total_required_docs,
    finance_lane_ready,
    attorney_lane_ready,
    stage_ready,
    updated_at
  )
  values (
    p_transaction_id,
    coalesce(v_onboarding.status, 'Not Started'),
    v_onboarding_complete,
    v_docs_complete,
    v_missing_required,
    coalesce(v_uploaded_required, 0),
    coalesce(v_total_required, 0),
    v_finance_lane_ready,
    v_attorney_lane_ready,
    v_stage_ready,
    now()
  )
  on conflict (transaction_id) do update
  set onboarding_status = excluded.onboarding_status,
      onboarding_complete = excluded.onboarding_complete,
      docs_complete = excluded.docs_complete,
      missing_required_docs = excluded.missing_required_docs,
      uploaded_required_docs = excluded.uploaded_required_docs,
      total_required_docs = excluded.total_required_docs,
      finance_lane_ready = excluded.finance_lane_ready,
      attorney_lane_ready = excluded.attorney_lane_ready,
      stage_ready = excluded.stage_ready,
      updated_at = excluded.updated_at;

  return jsonb_build_object(
    'transactionId', p_transaction_id,
    'onboardingStatus', coalesce(v_onboarding.status, 'Not Started'),
    'onboardingComplete', v_onboarding_complete,
    'docsComplete', v_docs_complete,
    'missingRequiredDocs', v_missing_required,
    'uploadedRequiredDocs', coalesce(v_uploaded_required, 0),
    'totalRequiredDocs', coalesce(v_total_required, 0),
    'financeLaneReady', v_finance_lane_ready,
    'attorneyLaneReady', v_attorney_lane_ready,
    'stageReady', v_stage_ready
  );
end;
$$;

create or replace function public.bridge_promote_private_listing_document_row(
  p_private_listing_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.private_listing_documents%rowtype;
  v_listing public.private_listings%rowtype;
  v_requirement public.private_listing_document_requirements%rowtype;
  v_transaction_id uuid := null;
  v_bucket_key text := 'legal';
  v_shared_document public.documents%rowtype;
  v_required_document jsonb := null;
  v_request jsonb := null;
  v_readiness jsonb := null;
  v_notify_roles text[] := array['agent'];
  v_request_role text := null;
begin
  if p_private_listing_document_id is null then
    return jsonb_build_object('pendingTransactionPromotion', false);
  end if;

  select *
    into v_document
  from public.private_listing_documents
  where id = p_private_listing_document_id
  limit 1;

  if v_document.id is null then
    return jsonb_build_object('pendingTransactionPromotion', false);
  end if;

  select *
    into v_listing
  from public.private_listings
  where id = v_document.private_listing_id
  limit 1;

  if v_listing.id is null then
    return jsonb_build_object('pendingTransactionPromotion', false);
  end if;

  if v_document.requirement_id is not null and to_regclass('public.private_listing_document_requirements') is not null then
    select *
      into v_requirement
    from public.private_listing_document_requirements
    where id = v_document.requirement_id
    limit 1;
  end if;

  v_transaction_id := public.bridge_resolve_private_listing_transaction_id(v_listing.id);

  if v_transaction_id is null then
    update public.private_listing_documents
       set pending_transaction_promotion = true,
           promoted_transaction_id = null,
           promoted_document_id = null,
           updated_at = now()
     where id = v_document.id
     returning * into v_document;

    return jsonb_build_object(
      'pendingTransactionPromotion', true,
      'transactionId', null,
      'document', to_jsonb(v_document)
    );
  end if;

  v_bucket_key := public.bridge_private_listing_document_bucket_key(
    v_requirement.requirement_group,
    coalesce(v_requirement.requirement_key, v_document.document_type),
    v_document.document_type
  );

  insert into public.documents (
    transaction_id,
    name,
    file_path,
    category,
    document_type,
    status,
    visibility_scope,
    uploaded_by_user_id,
    uploaded_by_role,
    uploaded_by_party,
    is_client_visible,
    bucket_key,
    source,
    source_document_id,
    file_bucket,
    canonical_requirement_instance_id,
    owner_role,
    metadata,
    updated_at
  )
  values (
    v_transaction_id,
    coalesce(nullif(trim(coalesce(v_document.document_name, '')), ''), 'Seller document'),
    trim(coalesce(v_document.storage_path, '')),
    coalesce(nullif(trim(coalesce(v_document.category, '')), ''), nullif(trim(coalesce(v_requirement.requirement_name, '')), ''), 'Seller Document'),
    coalesce(nullif(trim(coalesce(v_document.document_type, '')), ''), nullif(trim(coalesce(v_requirement.requirement_key, '')), ''), 'seller_document'),
    'uploaded',
    'internal',
    null,
    'seller',
    'seller',
    false,
    v_bucket_key,
    'seller_portal',
    v_document.id,
    'documents',
    v_document.canonical_requirement_instance_id,
    'seller',
    jsonb_build_object(
      'privateListingId', v_listing.id,
      'privateListingDocumentId', v_document.id,
      'requirementId', v_document.requirement_id,
      'requirementKey', v_requirement.requirement_key,
      'documentVisibility', coalesce(v_document.visibility, v_requirement.document_visibility, 'seller_visible'),
      'promotionSource', 'seller_client_portal'
    ),
    now()
  )
  on conflict (transaction_id, source, source_document_id) do update
  set name = excluded.name,
      file_path = excluded.file_path,
      category = excluded.category,
      document_type = excluded.document_type,
      status = excluded.status,
      visibility_scope = excluded.visibility_scope,
      uploaded_by_role = excluded.uploaded_by_role,
      uploaded_by_party = excluded.uploaded_by_party,
      is_client_visible = excluded.is_client_visible,
      bucket_key = excluded.bucket_key,
      file_bucket = excluded.file_bucket,
      canonical_requirement_instance_id = coalesce(excluded.canonical_requirement_instance_id, public.documents.canonical_requirement_instance_id),
      owner_role = excluded.owner_role,
      metadata = coalesce(public.documents.metadata, '{}'::jsonb) || excluded.metadata,
      updated_at = now()
  returning * into v_shared_document;

  update public.private_listing_documents
     set pending_transaction_promotion = false,
         promoted_transaction_id = v_transaction_id,
         promoted_document_id = v_shared_document.id,
         updated_at = now()
   where id = v_document.id
   returning * into v_document;

  if to_regclass('public.transaction_events') is not null then
    insert into public.transaction_events (
      transaction_id,
      event_type,
      event_data,
      created_by,
      created_by_role,
      visibility_scope
    )
    values (
      v_transaction_id,
      'DocumentUploaded',
      jsonb_build_object(
        'source', 'seller_portal',
        'documentId', v_shared_document.id,
        'sourceDocumentId', v_document.id,
        'documentName', v_shared_document.name,
        'bucketKey', v_bucket_key
      ),
      null,
      'seller',
      'internal'
    );
  end if;

  v_required_document := public.bridge_link_transaction_required_document_from_seller_upload(
    v_transaction_id,
    v_shared_document.id,
    v_shared_document.name,
    coalesce(v_shared_document.category, v_bucket_key),
    coalesce(v_requirement.requirement_key, v_document.document_type)
  );

  v_request := public.bridge_link_document_request_from_seller_upload(
    v_transaction_id,
    v_shared_document.id,
    coalesce(v_shared_document.category, v_bucket_key),
    v_shared_document.name
  );

  if v_request is not null then
    v_request_role := lower(trim(coalesce(v_request ->> 'assigned_to_role', '')));
    if v_request_role = 'attorney' then
      v_notify_roles := array_append(v_notify_roles, 'attorney');
    elsif v_request_role = 'bond_originator' then
      v_notify_roles := array_append(v_notify_roles, 'bond_originator');
    elsif v_request_role = 'developer' then
      v_notify_roles := array_append(v_notify_roles, 'developer');
    elsif v_request_role = 'agent' then
      v_notify_roles := array_append(v_notify_roles, 'agent');
    end if;
  end if;

  perform public.bridge_create_transaction_notifications_for_roles(
    v_transaction_id,
    (
      select array_agg(distinct role_type)
      from unnest(v_notify_roles) as role_type
    ),
    'document_uploaded',
    case when v_request is null then 'Seller uploaded a document' else 'Seller uploaded a requested document' end,
    case
      when v_request is null then coalesce(v_shared_document.name, 'A seller document') || ' was uploaded and added to the transaction file.'
      else coalesce(v_shared_document.name, 'A seller document') || ' was uploaded and linked to a requested document.'
    end,
    'DocumentUploaded',
    jsonb_build_object(
      'source', 'seller_portal',
      'documentId', v_shared_document.id,
      'sourceDocumentId', v_document.id,
      'requestId', coalesce(v_request ->> 'id', null),
      'requiredDocumentId', coalesce(v_required_document ->> 'id', null)
    ),
    'seller-doc-upload:' || v_document.id::text
  );

  v_readiness := public.bridge_recalculate_transaction_readiness_from_required_documents(v_transaction_id);

  if coalesce((v_readiness ->> 'docsComplete')::boolean, false) = true
     and coalesce((v_readiness ->> 'onboardingComplete')::boolean, false) = true then
    if coalesce((v_readiness ->> 'financeLaneReady')::boolean, false) = true
       and lower(coalesce(v_readiness ->> 'attorneyLaneReady', 'false')) = 'false' then
      perform public.bridge_create_transaction_notifications_for_roles(
        v_transaction_id,
        array['bond_originator'],
        'lane_handoff',
        'Finance lane ready',
        'Seller-side documents are complete. Finance processing can proceed.',
        'TransactionUpdated',
        jsonb_build_object('trigger', 'seller_docs_complete_finance'),
        'seller-pack-ready-finance'
      );
    else
      perform public.bridge_create_transaction_notifications_for_roles(
        v_transaction_id,
        array['attorney'],
        'lane_handoff',
        'Attorney lane ready',
        'Seller-side documents are complete. Transfer preparation can proceed.',
        'TransactionUpdated',
        jsonb_build_object('trigger', 'seller_docs_complete_attorney'),
        'seller-pack-ready-attorney'
      );
    end if;
  end if;

  return jsonb_build_object(
    'pendingTransactionPromotion', false,
    'transactionId', v_transaction_id,
    'document', to_jsonb(v_document),
    'sharedDocument', to_jsonb(v_shared_document),
    'requiredDocument', v_required_document,
    'documentRequest', v_request,
    'readiness', v_readiness
  );
end;
$$;

create or replace function public.bridge_promote_pending_private_listing_documents(
  p_private_listing_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_result jsonb;
  v_promoted_count integer := 0;
  v_pending_count integer := 0;
  v_transaction_id uuid := null;
begin
  if p_private_listing_id is null then
    return jsonb_build_object('promotedCount', 0, 'pendingCount', 0);
  end if;

  for v_row in
    select id
    from public.private_listing_documents
    where private_listing_id = p_private_listing_id
      and (pending_transaction_promotion = true or promoted_document_id is null)
    order by uploaded_at asc, created_at asc
  loop
    v_result := public.bridge_promote_private_listing_document_row(v_row.id);
    if coalesce((v_result ->> 'pendingTransactionPromotion')::boolean, false) then
      v_pending_count := v_pending_count + 1;
    else
      v_promoted_count := v_promoted_count + 1;
      if v_transaction_id is null then
        v_transaction_id := nullif(v_result ->> 'transactionId', '')::uuid;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'transactionId', v_transaction_id,
    'promotedCount', v_promoted_count,
    'pendingCount', v_pending_count
  );
end;
$$;

create or replace function public.bridge_private_listing_seller_portal_payload(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_requirements jsonb := '[]'::jsonb;
  v_documents jsonb := '[]'::jsonb;
begin
  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
    and (token_expires_at is null or token_expires_at > now())
  limit 1;

  if not found then
    return null;
  end if;

  select *
    into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id
  limit 1;

  if not found then
    return null;
  end if;

  perform public.bridge_promote_pending_private_listing_documents(v_listing.id);

  if to_regclass('public.private_listing_document_requirements') is not null then
    select coalesce(jsonb_agg(to_jsonb(req) order by req.created_at asc), '[]'::jsonb)
      into v_requirements
    from public.private_listing_document_requirements req
    where req.private_listing_id = v_listing.id;
  end if;

  if to_regclass('public.private_listing_documents') is not null then
    select coalesce(jsonb_agg(to_jsonb(doc) order by doc.uploaded_at desc), '[]'::jsonb)
      into v_documents
    from public.private_listing_documents doc
    where doc.private_listing_id = v_listing.id;
  end if;

  return jsonb_build_object(
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding),
    'requirements', v_requirements,
    'documents', v_documents
  );
end;
$$;

create or replace function public.bridge_upload_private_listing_seller_document(
  p_token text,
  p_requirement_key text,
  p_document_name text,
  p_storage_path text,
  p_file_url text default null,
  p_document_type text default null,
  p_canonical_requirement_instance_id uuid default null,
  p_category text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_requirement public.private_listing_document_requirements%rowtype;
  v_document public.private_listing_documents%rowtype;
  v_requirement_key text := nullif(trim(coalesce(p_requirement_key, '')), '');
  v_promotion jsonb := '{}'::jsonb;
begin
  if nullif(trim(coalesce(p_storage_path, '')), '') is null then
    raise exception 'Document storage path is required.';
  end if;

  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
    and (token_expires_at is null or token_expires_at > now())
  limit 1;

  if not found then
    raise exception 'Seller portal link is invalid or inactive.';
  end if;

  select *
    into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id
  limit 1;

  if not found then
    raise exception 'Private listing not found.';
  end if;

  if v_requirement_key is not null then
    select *
      into v_requirement
    from public.private_listing_document_requirements
    where private_listing_id = v_listing.id
      and requirement_key = v_requirement_key
    limit 1;
  end if;

  insert into public.private_listing_documents (
    private_listing_id,
    requirement_id,
    document_type,
    category,
    document_name,
    storage_path,
    file_url,
    uploaded_by,
    status,
    visibility,
    canonical_requirement_instance_id,
    uploaded_at
  )
  values (
    v_listing.id,
    case when v_requirement.id is not null then v_requirement.id else null end,
    nullif(trim(coalesce(p_document_type, v_requirement_key, 'seller_document')), ''),
    nullif(trim(coalesce(p_category, v_requirement.requirement_name, 'Seller Document')), ''),
    coalesce(nullif(trim(coalesce(p_document_name, '')), ''), 'Seller document'),
    trim(p_storage_path),
    nullif(trim(coalesce(p_file_url, '')), ''),
    null,
    'uploaded',
    'seller_visible',
    p_canonical_requirement_instance_id,
    now()
  )
  returning * into v_document;

  if v_requirement.id is not null then
    update public.private_listing_document_requirements
       set status = 'uploaded',
           updated_at = now()
     where id = v_requirement.id
     returning * into v_requirement;
  end if;

  if to_regclass('public.private_listing_activity') is not null then
    insert into public.private_listing_activity (
      private_listing_id,
      activity_type,
      activity_title,
      activity_description,
      performed_by,
      visibility,
      metadata
    )
    values (
      v_listing.id,
      'seller_document_uploaded',
      'Seller document uploaded',
      coalesce(nullif(trim(coalesce(p_document_name, '')), ''), 'A seller document was uploaded from the client portal.'),
      null,
      'internal',
      jsonb_build_object(
        'documentId', v_document.id,
        'requirementId', v_requirement.id,
        'requirementKey', v_requirement_key,
        'source', 'seller_portal'
      )
    );
  end if;

  v_promotion := public.bridge_promote_private_listing_document_row(v_document.id);

  select *
    into v_document
  from public.private_listing_documents
  where id = v_document.id
  limit 1;

  return jsonb_build_object(
    'document', to_jsonb(v_document),
    'requirement', case when v_requirement.id is not null then to_jsonb(v_requirement) else null end,
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding),
    'shared_document', coalesce(v_promotion -> 'sharedDocument', 'null'::jsonb),
    'transaction_id', v_promotion ->> 'transactionId',
    'pending_transaction_promotion', coalesce((v_promotion ->> 'pendingTransactionPromotion')::boolean, false),
    'required_document', coalesce(v_promotion -> 'requiredDocument', 'null'::jsonb),
    'document_request', coalesce(v_promotion -> 'documentRequest', 'null'::jsonb),
    'readiness', coalesce(v_promotion -> 'readiness', 'null'::jsonb)
  );
end;
$$;

grant execute on function public.bridge_promote_pending_private_listing_documents(uuid) to anon, authenticated;
grant execute on function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text) to anon, authenticated;
grant execute on function public.bridge_private_listing_seller_portal_payload(text) to anon, authenticated;

commit;
