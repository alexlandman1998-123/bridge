begin;

-- The historical verification snapshot contains whole rows (including file
-- paths) and accepts an unscoped call. Keep it available only to server-side
-- service-role verification, never a browser or anonymous caller.
revoke all on function public.canonical_document_verification_snapshot(text, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.canonical_document_verification_snapshot(text, uuid, text, integer)
  to service_role;

-- Existing-matter repair is intentionally one transaction at a time. A plan
-- contains only exact, one-to-one identity links; it never copies files or
-- changes a review outcome. Request links are suggestions only because the
-- Phase 4 request trigger can change review state when linked retrospectively.
create or replace function public.bridge_plan_transaction_document_reconciliation_phase6(
  p_transaction_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_legacy_links jsonb := '[]'::jsonb;
  v_document_links jsonb := '[]'::jsonb;
  v_request_links jsonb := '[]'::jsonb;
  v_canonical_count integer := 0;
  v_legacy_count integer := 0;
  v_unresolved_count integer := 0;
  v_document_review_count integer := 0;
  v_request_review_count integer := 0;
  v_status_review_count integer := 0;
begin
  if auth.jwt()->>'role' is distinct from 'service_role' then
    raise exception 'Service-role verification is required.' using errcode = '42501';
  end if;
  if p_transaction_id is null or not exists (
    select 1 from public.transactions where id = p_transaction_id
  ) then
    raise exception 'An existing transaction is required.' using errcode = '22023';
  end if;

  select count(*) into v_canonical_count
  from public.document_requirement_instances r
  where r.transaction_id = p_transaction_id and r.status <> 'not_applicable';
  select count(*) into v_legacy_count
  from public.transaction_required_documents l
  where l.transaction_id = p_transaction_id;

  with candidates as (
    select l.id as legacy_id, r.id as requirement_id,
      count(*) over (partition by l.id) as candidate_count,
      count(*) over (partition by r.id) as legacy_count
    from public.transaction_required_documents l
    join public.document_requirement_instances r
      on r.transaction_id = l.transaction_id
     and r.context_type = 'transaction' and r.context_id = l.transaction_id
     and r.status <> 'not_applicable'
     and lower(coalesce(r.requested_from_role, '')) = lower(coalesce(l.required_from_role, ''))
     and r.document_definition_key = case
       when l.document_key = 'grant_signed' then 'grant_letter'
       else l.document_key end
    where l.transaction_id = p_transaction_id
      and l.canonical_requirement_instance_id is null
      and not exists (
        select 1 from public.transaction_required_documents linked
        where linked.canonical_requirement_instance_id = r.id
      )
      -- This legacy column has a BEFORE UPDATE seller-file satisfier trigger.
      -- Do not let a link-only repair silently replace an upload or status.
      and not exists (
        select 1 from public.documents seller_file
        where seller_file.transaction_id = l.transaction_id
          and seller_file.source = 'seller_portal'
          and seller_file.status in ('uploaded', 'pending_review', 'approved')
          and (
            seller_file.canonical_requirement_instance_id = r.id
            or public.bridge_normalize_seller_document_key_p0_4(seller_file.document_type)
              = public.bridge_normalize_seller_document_key_p0_4(coalesce(l.requirement_key, l.document_key))
            or public.bridge_normalize_seller_document_key_p0_4(seller_file.category)
              = public.bridge_normalize_seller_document_key_p0_4(coalesce(l.requirement_key, l.document_key))
          )
      )
  ), safe as (
    select legacy_id, requirement_id from candidates
    where candidate_count = 1 and legacy_count = 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'legacyId', legacy_id, 'requirementId', requirement_id
  ) order by legacy_id), '[]'::jsonb) into v_legacy_links from safe;

  with legacy_map as (
    select l.id, l.uploaded_document_id,
      coalesce(l.canonical_requirement_instance_id, (link->>'requirementId')::uuid) as requirement_id
    from public.transaction_required_documents l
    left join lateral (
      select item as link from jsonb_array_elements(v_legacy_links) item
      where item->>'legacyId' = l.id::text limit 1
    ) planned on true
    where l.transaction_id = p_transaction_id
  ), candidates as (
    select d.id as document_id, map.requirement_id,
      count(*) over (partition by d.id) as source_count,
      count(*) over (partition by map.requirement_id) as target_count
    from legacy_map map
    join public.documents d on d.id = map.uploaded_document_id
      and d.transaction_id = p_transaction_id
    join public.document_requirement_instances r on r.id = map.requirement_id
      and r.transaction_id = p_transaction_id
    where map.requirement_id is not null
      and d.canonical_requirement_instance_id is null
      and (r.satisfied_by_document_id is null or r.satisfied_by_document_id = d.id)
      and not exists (
        select 1 from public.documents linked
        where linked.canonical_requirement_instance_id = r.id and linked.id <> d.id
      )
  ), safe as (
    select document_id, requirement_id from candidates
    where source_count = 1 and target_count = 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'documentId', document_id, 'requirementId', requirement_id
  ) order by document_id), '[]'::jsonb) into v_document_links from safe;

  with documents_map as (
    select d.id,
      coalesce(d.canonical_requirement_instance_id, (link->>'requirementId')::uuid) as requirement_id
    from public.documents d
    left join lateral (
      select item as link from jsonb_array_elements(v_document_links) item
      where item->>'documentId' = d.id::text limit 1
    ) planned on true
    where d.transaction_id = p_transaction_id
  ), candidates as (
    select request.id as request_id, map.requirement_id,
      count(*) over (partition by request.id) as source_count,
      count(*) over (partition by map.requirement_id) as target_count
    from public.document_requests request
    join documents_map map on map.id = request.requested_document_id
    join public.document_requirement_instances r on r.id = map.requirement_id
      and r.transaction_id = p_transaction_id
    where request.transaction_id = p_transaction_id
      and request.canonical_requirement_instance_id is null
      and map.requirement_id is not null
      and (request.document_type is null or lower(request.document_type) = r.document_definition_key)
      and (nullif(request.requested_from, '') is null
        or lower(request.requested_from) = lower(coalesce(r.requested_from_role, '')))
  ), safe as (
    select request_id, requirement_id from candidates
    where source_count = 1 and target_count = 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'requestId', request_id, 'requirementId', requirement_id
  ) order by request_id), '[]'::jsonb) into v_request_links from safe;

  select count(*) into v_unresolved_count
  from public.transaction_required_documents l
  where l.transaction_id = p_transaction_id
    and l.canonical_requirement_instance_id is null
    and not exists (
      select 1 from jsonb_array_elements(v_legacy_links) item
      where item->>'legacyId' = l.id::text
    );

  -- A legacy upload is still unresolved if its file is linked elsewhere, has
  -- no unambiguous requirement, or was excluded from the safe document plan.
  select count(distinct d.id) into v_document_review_count
  from public.transaction_required_documents l
  join public.documents d on d.id = l.uploaded_document_id
    and d.transaction_id = p_transaction_id
  where l.transaction_id = p_transaction_id
    and not exists (
      select 1 from jsonb_array_elements(v_document_links) item
      where item->>'documentId' = d.id::text
    )
    and not exists (
      select 1 from public.document_requirement_instances r
      where r.id = d.canonical_requirement_instance_id
        and r.transaction_id = p_transaction_id
        and r.id = coalesce(l.canonical_requirement_instance_id, (
          select (item->>'requirementId')::uuid
          from jsonb_array_elements(v_legacy_links) item
          where item->>'legacyId' = l.id::text limit 1
        ))
    );

  select count(*) into v_request_review_count
  from public.document_requests request
  where request.transaction_id = p_transaction_id
    and request.canonical_requirement_instance_id is null;

  select count(*) into v_status_review_count
  from public.document_requirement_instances r
  where r.transaction_id = p_transaction_id
    and r.status in ('pending', 'requested')
    and (
      r.satisfied_by_document_id is not null
      or exists (
        select 1 from public.documents d
        where d.transaction_id = p_transaction_id
          and d.canonical_requirement_instance_id = r.id
      )
      or exists (
        select 1 from jsonb_array_elements(v_document_links) item
        where item->>'requirementId' = r.id::text
      )
    );

  return jsonb_build_object(
    'transactionId', p_transaction_id,
    'planDigest', md5(v_legacy_links::text || '|' || v_document_links::text || '|' || v_request_links::text),
    'legacyLinks', v_legacy_links,
    'documentLinks', v_document_links,
    'requestSuggestions', v_request_links,
    'summary', jsonb_build_object(
      'canonicalRequirements', v_canonical_count,
      'legacyRequirements', v_legacy_count,
      'safeLegacyLinks', jsonb_array_length(v_legacy_links),
      'safeDocumentLinks', jsonb_array_length(v_document_links),
      'requestLinkSuggestions', jsonb_array_length(v_request_links),
      'requestsForManualReview', v_request_review_count,
      'legacyRowsForManualReview', v_unresolved_count,
      'documentsForManualReview', v_document_review_count,
      'statusesForManualReview', v_status_review_count
    )
  );
end;
$$;

revoke all on function public.bridge_plan_transaction_document_reconciliation_phase6(uuid)
  from public, anon, authenticated;
grant execute on function public.bridge_plan_transaction_document_reconciliation_phase6(uuid)
  to service_role;

create or replace function public.bridge_apply_transaction_document_reconciliation_phase6(
  p_transaction_id uuid,
  p_expected_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan jsonb;
  v_item jsonb;
  v_affected integer;
begin
  if auth.jwt()->>'role' is distinct from 'service_role' then
    raise exception 'Service-role reconciliation is required.' using errcode = '42501';
  end if;
  if p_transaction_id is null or nullif(p_expected_digest, '') is null then
    raise exception 'Transaction and current plan digest are required.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_transaction_id::text, 0));
  -- Hold existing matter rows steady while rebuilding and applying the plan.
  perform 1 from public.document_requirement_instances
    where transaction_id = p_transaction_id for update;
  perform 1 from public.transaction_required_documents
    where transaction_id = p_transaction_id for update;
  perform 1 from public.documents
    where transaction_id = p_transaction_id for update;
  perform 1 from public.document_requests
    where transaction_id = p_transaction_id for update;
  v_plan := public.bridge_plan_transaction_document_reconciliation_phase6(p_transaction_id);
  if v_plan->>'planDigest' is distinct from p_expected_digest then
    raise exception 'The reconciliation plan changed. Run a new dry-run.' using errcode = '40001';
  end if;

  for v_item in select value from jsonb_array_elements(v_plan->'legacyLinks') loop
    update public.transaction_required_documents l
    set canonical_requirement_instance_id = (v_item->>'requirementId')::uuid
    where l.id = (v_item->>'legacyId')::uuid
      and l.transaction_id = p_transaction_id
      and l.canonical_requirement_instance_id is null;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then raise exception 'Legacy link changed during reconciliation.' using errcode = '40001'; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(v_plan->'documentLinks') loop
    update public.documents d
    set canonical_requirement_instance_id = (v_item->>'requirementId')::uuid
    where d.id = (v_item->>'documentId')::uuid
      and d.transaction_id = p_transaction_id
      and d.canonical_requirement_instance_id is null;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then raise exception 'Document link changed during reconciliation.' using errcode = '40001'; end if;
  end loop;
  return jsonb_build_object(
    'transactionId', p_transaction_id,
    'appliedPlanDigest', p_expected_digest,
    'linkedLegacyRows', jsonb_array_length(v_plan->'legacyLinks'),
    'linkedDocuments', jsonb_array_length(v_plan->'documentLinks'),
    'linkedRequests', 0,
    'postCheck', public.bridge_plan_transaction_document_reconciliation_phase6(p_transaction_id)
  );
end;
$$;

revoke all on function public.bridge_apply_transaction_document_reconciliation_phase6(uuid, text)
  from public, anon, authenticated;
grant execute on function public.bridge_apply_transaction_document_reconciliation_phase6(uuid, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
