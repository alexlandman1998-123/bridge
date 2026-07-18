begin;

alter table if exists public.private_listing_document_requirements
  add column if not exists requested_from_role text,
  add column if not exists request_stage text,
  add column if not exists request_priority text,
  add column if not exists request_due_date date,
  add column if not exists request_delivery_channels text[] not null default '{}'::text[],
  add column if not exists request_dedupe_key text,
  add column if not exists request_source text,
  add column if not exists requested_at timestamptz,
  add column if not exists request_revision integer not null default 0,
  add column if not exists last_request_reason text,
  add column if not exists request_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists private_listing_document_requirements_request_dedupe_idx
  on public.private_listing_document_requirements(request_dedupe_key)
  where request_dedupe_key is not null;

create index if not exists private_listing_document_requirements_request_due_idx
  on public.private_listing_document_requirements(request_due_date, status)
  where status in ('requested', 'rejected');

create or replace function public.bridge_add_seller_request_business_days(
  p_start_date date,
  p_business_days integer
)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  v_result date := coalesce(p_start_date, current_date);
  v_remaining integer := greatest(coalesce(p_business_days, 0), 0);
begin
  while v_remaining > 0 loop
    v_result := v_result + 1;
    if extract(isodow from v_result) < 6 then
      v_remaining := v_remaining - 1;
    end if;
  end loop;
  return v_result;
end;
$$;

create or replace function public.bridge_issue_private_listing_requirement_request_p0_1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(regexp_replace(coalesce(new.requirement_key, ''), '[^a-zA-Z0-9]+', '_', 'g'));
  v_group text := lower(regexp_replace(coalesce(new.requirement_group, ''), '[^a-zA-Z0-9]+', '_', 'g'));
  v_has_document boolean := false;
begin
  if new.status <> 'required'
     or new.is_required is false
     or coalesce(new.document_visibility, 'internal') <> 'seller_visible'
     or new.private_listing_id is null
     or coalesce(v_key, '') = '' then
    return new;
  end if;

  select exists (
    select 1
    from public.private_listing_documents document
    where document.private_listing_id = new.private_listing_id
      and document.status in ('uploaded', 'under_review', 'approved', 'completed')
      and (
        document.requirement_id = new.id
        or lower(regexp_replace(coalesce(document.document_type, ''), '[^a-zA-Z0-9]+', '_', 'g')) = v_key
      )
  ) into v_has_document;

  if v_has_document then
    return new;
  end if;

  new.status := 'requested';
  new.requested_from_role := 'seller';
  new.request_stage := case
    when v_group in ('mandate', 'seller_identity', 'fica', 'marital', 'company', 'trust', 'deceased_estate', 'seller_authority', 'power_of_attorney')
      then 'mandate_ready'
    else 'listing_ready'
  end;
  new.request_priority := case when v_key = 'signed_mandate' then 'blocker' else 'required' end;
  new.request_due_date := coalesce(new.request_due_date, public.bridge_add_seller_request_business_days(current_date, 5));
  new.request_delivery_channels := case
    when coalesce(array_length(new.request_delivery_channels, 1), 0) = 0 then array['in_app']::text[]
    else new.request_delivery_channels
  end;
  new.request_dedupe_key := coalesce(
    nullif(new.request_dedupe_key, ''),
    'seller-document-request:' || new.private_listing_id::text || ':' || v_key || ':v1'
  );
  new.request_source := coalesce(nullif(new.request_source, ''), 'database_requirement_trigger');
  new.requested_at := coalesce(new.requested_at, now());
  new.request_revision := greatest(coalesce(new.request_revision, 0), 1);
  new.last_request_reason := coalesce(nullif(new.last_request_reason, ''), 'requirement_became_applicable');
  new.request_metadata := coalesce(new.request_metadata, '{}'::jsonb) || jsonb_build_object(
    'issued_automatically', true,
    'orchestration_version', 'seller_document_request_orchestration_v1'
  );
  return new;
end;
$$;

drop trigger if exists trg_issue_private_listing_requirement_request_p0_1
  on public.private_listing_document_requirements;
create trigger trg_issue_private_listing_requirement_request_p0_1
before insert or update of status, is_required, document_visibility, requirement_key, requirement_group
on public.private_listing_document_requirements
for each row
execute function public.bridge_issue_private_listing_requirement_request_p0_1();

create or replace function public.bridge_log_private_listing_requirement_request_p0_1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'requested'
     and (tg_op = 'INSERT' or old.status is distinct from 'requested')
     and to_regclass('public.private_listing_activity') is not null then
    insert into public.private_listing_activity (
      private_listing_id,
      activity_type,
      activity_title,
      activity_description,
      performed_by,
      visibility,
      metadata
    ) values (
      new.private_listing_id,
      'seller_document_requested',
      coalesce(new.requirement_name, 'Seller document') || ' requested',
      coalesce(new.requirement_description, 'A document is required to progress the property file.'),
      null,
      'client_visible',
      jsonb_build_object(
        'requirementId', new.id,
        'requirementKey', new.requirement_key,
        'requestedFromRole', new.requested_from_role,
        'requestStage', new.request_stage,
        'requestPriority', new.request_priority,
        'requestDueDate', new.request_due_date,
        'deliveryChannels', new.request_delivery_channels,
        'requestDedupeKey', new.request_dedupe_key,
        'requestSource', new.request_source,
        'requestedAt', new.requested_at
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_private_listing_requirement_request_p0_1
  on public.private_listing_document_requirements;
create trigger trg_log_private_listing_requirement_request_p0_1
after insert or update of status
on public.private_listing_document_requirements
for each row
execute function public.bridge_log_private_listing_requirement_request_p0_1();

update public.private_listing_document_requirements requirement
set
  status = 'requested',
  requested_from_role = 'seller',
  request_stage = case
    when lower(regexp_replace(coalesce(requirement.requirement_group, ''), '[^a-zA-Z0-9]+', '_', 'g')) in
      ('mandate', 'seller_identity', 'fica', 'marital', 'company', 'trust', 'deceased_estate', 'seller_authority', 'power_of_attorney')
      then 'mandate_ready'
    else 'listing_ready'
  end,
  request_priority = case when requirement.requirement_key = 'signed_mandate' then 'blocker' else 'required' end,
  request_due_date = public.bridge_add_seller_request_business_days(current_date, 5),
  request_delivery_channels = array['in_app']::text[],
  request_dedupe_key = 'seller-document-request:' || requirement.private_listing_id::text || ':' ||
    lower(regexp_replace(requirement.requirement_key, '[^a-zA-Z0-9]+', '_', 'g')) || ':v1',
  request_source = 'p0_1_backfill',
  requested_at = now(),
  request_revision = 1,
  last_request_reason = 'existing_applicable_requirement_backfill',
  request_metadata = coalesce(requirement.request_metadata, '{}'::jsonb) || jsonb_build_object(
    'issued_automatically', true,
    'orchestration_version', 'seller_document_request_orchestration_v1',
    'backfilled', true
  )
where requirement.status = 'required'
  and requirement.is_required is true
  and requirement.document_visibility = 'seller_visible'
  and not exists (
    select 1
    from public.private_listing_documents document
    where document.private_listing_id = requirement.private_listing_id
      and document.status in ('uploaded', 'under_review', 'approved', 'completed')
      and (
        document.requirement_id = requirement.id
        or lower(regexp_replace(coalesce(document.document_type, ''), '[^a-zA-Z0-9]+', '_', 'g')) =
           lower(regexp_replace(requirement.requirement_key, '[^a-zA-Z0-9]+', '_', 'g'))
      )
  );

create or replace function public.bridge_mark_transaction_seller_requirement_requested_p0_1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_document boolean := false;
begin
  if new.superseded_at is not null
     or new.required is false
     or coalesce(new.requested_from, new.responsible_role, '') <> 'seller'
     or new.status not in ('pending', 'required', 'requested') then
    return new;
  end if;

  select exists (
    select 1
    from public.documents document
    where document.transaction_id = new.transaction_id
      and coalesce(document.review_status, 'uploaded') in ('uploaded', 'under_review', 'approved', 'completed')
      and (
        document.canonical_requirement_instance_id = new.canonical_requirement_instance_id
        or lower(regexp_replace(coalesce(document.document_type, document.category, ''), '[^a-zA-Z0-9]+', '_', 'g')) =
           lower(regexp_replace(new.document_key, '[^a-zA-Z0-9]+', '_', 'g'))
      )
  ) into v_has_document;

  if not v_has_document then
    new.status := 'requested';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mark_transaction_seller_requirement_requested_p0_1
  on public.transaction_document_requirements;
create trigger trg_mark_transaction_seller_requirement_requested_p0_1
before insert or update of status, requested_from, responsible_role, required, superseded_at
on public.transaction_document_requirements
for each row
execute function public.bridge_mark_transaction_seller_requirement_requested_p0_1();

create or replace function public.bridge_create_transaction_seller_document_request_p0_1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requirement_id text := 'transaction_requirement:' || new.id::text;
  v_lane_key text := case
    when new.owning_workflow ilike '%cancellation%' then 'cancellation'
    else 'transfer'
  end;
  v_attorney_role text := case
    when new.owning_workflow ilike '%cancellation%' then 'cancellation_attorney'
    else 'transfer_attorney'
  end;
begin
  if new.status <> 'requested'
     or new.superseded_at is not null
     or new.required is false
     or coalesce(new.requested_from, new.responsible_role, '') <> 'seller' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.transaction_id::text || ':' || new.document_key || ':seller'));

  if not exists (
    select 1
    from public.document_requests request
    where request.transaction_id = new.transaction_id
      and request.status not in ('cancelled', 'completed', 'approved')
      and (
        request.requirement_id = v_requirement_id
        or (
          coalesce(request.assigned_to_role, request.requested_from, '') = 'seller'
          and lower(regexp_replace(coalesce(request.document_type, request.title, ''), '[^a-zA-Z0-9]+', '_', 'g')) =
              lower(regexp_replace(new.document_key, '[^a-zA-Z0-9]+', '_', 'g'))
        )
      )
  ) then
    insert into public.document_requests (
      transaction_id,
      category,
      document_type,
      title,
      description,
      priority,
      due_date,
      assigned_to_role,
      status,
      requires_review,
      visibility_scope,
      created_by,
      created_by_role,
      lane_key,
      attorney_role,
      requested_from,
      requested_by,
      review_status,
      requirement_id
    ) values (
      new.transaction_id,
      coalesce(new.document_category, 'seller_documents'),
      new.document_key,
      new.document_name,
      'Automatically requested from the seller when this transaction requirement became applicable.',
      case when new.blocking then 'important' else 'required' end,
      public.bridge_add_seller_request_business_days(current_date, case when new.blocking then 2 else 5 end),
      'seller',
      'requested',
      true,
      'client_visible',
      null,
      'system',
      v_lane_key,
      v_attorney_role,
      'seller',
      null,
      'requested',
      v_requirement_id
    );

    if to_regclass('public.transaction_events') is not null then
      insert into public.transaction_events (
        transaction_id,
        event_type,
        event_data,
        created_by,
        created_by_role,
        visibility_scope
      ) values (
        new.transaction_id,
        'SellerDocumentAutomaticallyRequested',
        jsonb_build_object(
          'requirementId', new.id,
          'requirementKey', new.document_key,
          'requestedFrom', 'seller',
          'visibleSection', new.visible_section,
          'blocking', new.blocking,
          'blockingStage', new.blocking_stage,
          'source', 'automatic_seller_document_requests_p0_1'
        ),
        null,
        'system',
        'client_visible'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_create_transaction_seller_document_request_p0_1
  on public.transaction_document_requirements;
create trigger trg_create_transaction_seller_document_request_p0_1
after insert or update of status
on public.transaction_document_requirements
for each row
execute function public.bridge_create_transaction_seller_document_request_p0_1();

update public.transaction_document_requirements
set status = status
where superseded_at is null
  and required is true
  and coalesce(requested_from, responsible_role, '') = 'seller'
  and status in ('pending', 'required', 'requested');

commit;
