-- One document requirement identity across buyer, seller, agent, developer and attorney workspaces.
-- Assignment role is workflow metadata; contact identity remains part of the key for multi-party matters.

begin;

-- Retired containers/forms must not reappear as uploadable requirements.
update public.document_definitions
set is_active = false,
    metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
      'retired_at', now(),
      'retired_reason', 'Aggregate/container or retired data-capture surface; request concrete documents instead.'
    ),
    updated_at = now()
where key in ('information_sheet', 'buyer_fica_pack', 'seller_fica_pack')
  and is_active is distinct from false;

update public.document_requirement_instances
set status = 'not_applicable',
    requirement_level = 'not_applicable',
    satisfied_by_document_id = null,
    source_system = 'canonical_document_identity_v2_retirement',
    updated_at = now()
where document_definition_key in ('information_sheet', 'buyer_fica_pack', 'seller_fica_pack')
  and status <> 'not_applicable';

-- Repair invalid staging projections which claim completion with a non-existent document.
update public.document_requirement_instances instance
set satisfied_by_document_id = null,
    status = case
      when instance.status in ('uploaded', 'under_review', 'approved', 'completed') then 'pending'
      else instance.status
    end,
    source_system = 'canonical_document_identity_v2_orphan_repair',
    updated_at = now()
where instance.satisfied_by_document_id is not null
  and instance.source_system = 'staging_link_projection_cleanup'
  and not exists (
    select 1 from public.documents document where document.id = instance.satisfied_by_document_id
  );

drop table if exists pg_temp.document_requirement_identity_merge;
create temporary table document_requirement_identity_merge on commit drop as
with ranked as (
  select
    instance.id,
    first_value(instance.id) over (
      partition by instance.context_type, instance.context_id, instance.document_definition_key,
        coalesce(instance.requested_from_contact_id, '00000000-0000-0000-0000-000000000000'::uuid)
      order by
        (instance.satisfied_by_document_id is not null) desc,
        case instance.status
          when 'completed' then 100 when 'approved' then 90 when 'under_review' then 80
          when 'uploaded' then 70 when 'rejected' then 60 when 'requested' then 50
          when 'pending' then 40 when 'waived' then 30 else 0 end desc,
        case instance.requirement_level
          when 'blocker' then 40 when 'required' then 30 when 'recommended' then 20 else 10 end desc,
        instance.created_at,
        instance.id
    ) as winner_id,
    count(*) over (
      partition by instance.context_type, instance.context_id, instance.document_definition_key,
        coalesce(instance.requested_from_contact_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) as identity_count
  from public.document_requirement_instances instance
  where instance.status <> 'not_applicable'
)
select id as loser_id, winner_id
from ranked
where identity_count > 1 and id <> winner_id;

-- Repoint every projection before deactivating duplicate requirement rows.
update public.documents document
set canonical_requirement_instance_id = merge.winner_id
from document_requirement_identity_merge merge
where document.canonical_requirement_instance_id = merge.loser_id;

update public.document_requests request
set canonical_requirement_instance_id = merge.winner_id,
    updated_at = now()
from document_requirement_identity_merge merge
where request.canonical_requirement_instance_id = merge.loser_id;

update public.transaction_required_documents required
set canonical_requirement_instance_id = merge.winner_id,
    updated_at = now()
from document_requirement_identity_merge merge
where required.canonical_requirement_instance_id = merge.loser_id;

update public.document_requirement_instances winner
set visible_to_roles = coalesce(merged.visible_to_roles, '{}'::text[]),
    uploadable_by_roles = coalesce(merged.uploadable_by_roles, '{}'::text[]),
    stage_gates = coalesce(merged.stage_gates, '{}'::text[]),
    requirement_level = merged.requirement_level,
    updated_at = now()
from (
  select
    merge.winner_id,
    array_agg(distinct visible_role) filter (where visible_role is not null) as visible_to_roles,
    array_agg(distinct upload_role) filter (where upload_role is not null) as uploadable_by_roles,
    array_agg(distinct gate_name) filter (where gate_name is not null) as stage_gates,
    case max(case instance.requirement_level when 'blocker' then 4 when 'required' then 3 when 'recommended' then 2 else 1 end)
      when 4 then 'blocker' when 3 then 'required' when 2 then 'recommended' else 'optional' end as requirement_level
  from document_requirement_identity_merge merge
  join public.document_requirement_instances instance on instance.id in (merge.winner_id, merge.loser_id)
  left join lateral unnest(instance.visible_to_roles) visible_role on true
  left join lateral unnest(instance.uploadable_by_roles) upload_role on true
  left join lateral unnest(instance.stage_gates) gate_name on true
  group by merge.winner_id
) merged
where winner.id = merged.winner_id;

update public.document_requirement_instances loser
set status = 'not_applicable',
    requirement_level = 'not_applicable',
    satisfied_by_document_id = null,
    source_system = 'canonical_document_identity_v2_merged',
    updated_at = now()
from document_requirement_identity_merge merge
where loser.id = merge.loser_id;

drop index if exists public.document_requirement_instances_active_unique_idx;
create unique index document_requirement_instances_active_unique_idx
  on public.document_requirement_instances (
    context_type,
    context_id,
    document_definition_key,
    coalesce(requested_from_contact_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status <> 'not_applicable';

comment on index public.document_requirement_instances_active_unique_idx is
  'Canonical requirement identity v2: context + definition + party contact. Assignment role is mutable metadata.';

create or replace function public.bridge_sync_transaction_document_requirement_instances(
  p_transaction_id uuid,
  p_generated_instances jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item jsonb;
  v_definition public.document_definitions%rowtype;
  v_existing public.document_requirement_instances%rowtype;
  v_saved public.document_requirement_instances%rowtype;
  v_key text;
  v_pack text;
  v_level text;
  v_role text;
  v_contact uuid;
  v_reviewer text;
  v_rule uuid;
  v_gates text[];
  v_visible text[];
  v_upload text[];
  v_signature text;
  v_signatures text[] := '{}'::text[];
  v_active_ids uuid[] := '{}'::uuid[];
  v_created integer := 0;
  v_updated integer := 0;
  v_deactivated integer := 0;
begin
  if p_transaction_id is null or jsonb_typeof(p_generated_instances) <> 'array'
     or jsonb_array_length(p_generated_instances) not between 1 and 250 then
    raise exception 'A transaction and 1-250 generated requirements are required.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.transactions where id = p_transaction_id) then
    raise exception 'transaction not found' using errcode = 'P0002';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and (
    auth.uid() is null or not (
      public.bridge_has_transaction_permission(p_transaction_id, 'edit_core_transaction') or
      public.bridge_has_transaction_permission(p_transaction_id, 'manage_transfer_workflow') or
      public.bridge_has_transaction_permission(p_transaction_id, 'manage_bond_workflow') or
      public.bridge_can_access_transaction_spine(p_transaction_id)
    )
  ) then
    raise exception 'not authorised to generate transaction document requirements' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_transaction_id::text, 0));
  for v_item in select value from jsonb_array_elements(p_generated_instances) loop
    v_key := nullif(btrim(v_item ->> 'document_definition_key'), '');
    select * into v_definition from public.document_definitions
      where key = v_key and is_active and 'transaction' = any(applies_to_context);
    if not found then raise exception 'active transaction document definition not found: %', v_key using errcode = '23503'; end if;

    v_pack := coalesce(nullif(btrim(v_item ->> 'pack_key'), ''), v_definition.pack_key);
    if not exists (select 1 from public.document_packs where key = v_pack and is_active and 'transaction' = any(applies_to_context)) then
      raise exception 'active transaction document pack not found: %', v_pack using errcode = '23503';
    end if;
    v_level := coalesce(nullif(btrim(v_item ->> 'requirement_level'), ''), v_definition.default_requirement_level, 'required');
    if v_level not in ('blocker','required','recommended','optional','not_applicable') then
      raise exception 'invalid requirement level: %', v_level using errcode = '22023';
    end if;
    v_role := nullif(btrim(v_item ->> 'requested_from_role'), '');
    v_contact := nullif(btrim(v_item ->> 'requested_from_contact_id'), '')::uuid;
    v_reviewer := nullif(btrim(v_item ->> 'reviewer_role'), '');
    v_rule := nullif(btrim(v_item ->> 'rule_id'), '')::uuid;
    select coalesce(array_agg(distinct value order by value), '{}'::text[]) into v_gates
      from jsonb_array_elements_text(coalesce(v_item -> 'stage_gates', '[]'::jsonb));
    select coalesce(array_agg(distinct value order by value), '{}'::text[]) into v_visible
      from jsonb_array_elements_text(coalesce(v_item -> 'visible_to_roles', to_jsonb(v_definition.default_visibility)));
    select coalesce(array_agg(distinct value order by value), '{}'::text[]) into v_upload
      from jsonb_array_elements_text(coalesce(v_item -> 'uploadable_by_roles', to_jsonb(v_definition.default_upload_roles)));

    v_signature := concat_ws('::', p_transaction_id::text, v_key, coalesce(v_contact::text, ''));
    if v_signature = any(v_signatures) then
      raise exception 'duplicate generated requirement identity: %', v_signature using errcode = '23505';
    end if;
    v_signatures := array_append(v_signatures, v_signature);

    select * into v_existing from public.document_requirement_instances
    where context_type = 'transaction' and context_id = p_transaction_id
      and document_definition_key = v_key
      and requested_from_contact_id is not distinct from v_contact
    order by (status <> 'not_applicable') desc, created_at desc limit 1 for update;

    if found then
      update public.document_requirement_instances set
        transaction_id = p_transaction_id, listing_id = null, pack_key = v_pack,
        requirement_level = v_level, status = case when status = 'not_applicable' then 'pending' else status end,
        stage_gates = v_gates, requested_from_role = v_role, requested_from_contact_id = v_contact,
        visible_to_roles = v_visible, uploadable_by_roles = v_upload, reviewer_role = v_reviewer,
        rule_id = v_rule, resolver_version = 'transaction_canonical_document_requirement_engine_v2',
        source_system = 'transaction_canonical_document_requirement_engine', updated_at = now()
      where id = v_existing.id returning * into v_saved;
      v_updated := v_updated + 1;
    else
      insert into public.document_requirement_instances (
        document_definition_key, context_type, context_id, transaction_id, listing_id, pack_key,
        requirement_level, status, stage_gates, requested_from_role, requested_from_contact_id,
        visible_to_roles, uploadable_by_roles, reviewer_role, rule_id, resolver_version, source_system
      ) values (
        v_key, 'transaction', p_transaction_id, p_transaction_id, null, v_pack, v_level, 'pending',
        v_gates, v_role, v_contact, v_visible, v_upload, v_reviewer, v_rule,
        'transaction_canonical_document_requirement_engine_v2', 'transaction_canonical_document_requirement_engine'
      ) returning * into v_saved;
      v_created := v_created + 1;
    end if;
    v_active_ids := array_append(v_active_ids, v_saved.id);
  end loop;

  with stale as (
    update public.document_requirement_instances set status = 'not_applicable', updated_at = now()
    where context_type = 'transaction' and context_id = p_transaction_id and status <> 'not_applicable'
      and (source_system = 'transaction_canonical_document_requirement_engine' or rule_id is not null)
      and not (id = any(v_active_ids)) returning id
  ) select count(*)::integer into v_deactivated from stale;

  return jsonb_build_object(
    'transactionId', p_transaction_id, 'createdCount', v_created, 'updatedCount', v_updated,
    'markedNotApplicableCount', v_deactivated,
    'instances', coalesce((select jsonb_agg(to_jsonb(i) order by i.pack_key, i.document_definition_key)
      from public.document_requirement_instances i where i.context_type='transaction'
        and i.context_id=p_transaction_id and i.status <> 'not_applicable'), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.bridge_sync_transaction_document_requirement_instances(uuid, jsonb) from public;
grant execute on function public.bridge_sync_transaction_document_requirement_instances(uuid, jsonb) to authenticated, service_role;

-- Ad-hoc attorney requests are valid request records, not fake canonical document definitions.
-- This token-scoped RPC lets the buyer satisfy one without inventing a requirement key.
create or replace function public.bridge_upload_buyer_portal_requested_document(
  p_transaction_id uuid,
  p_document_request_id uuid,
  p_file_path text,
  p_file_bucket text,
  p_document_name text,
  p_category text default 'Additional Requests',
  p_document_type text default 'additional_document'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_token text := nullif(trim(coalesce(public.bridge_client_portal_request_token(), '')), '');
  v_link public.client_portal_links%rowtype;
  v_request public.document_requests%rowtype;
  v_document public.documents%rowtype;
  v_name text;
  v_type text;
  v_category text;
  v_buyer_email text;
begin
  if p_transaction_id is null or p_document_request_id is null or v_token is null then
    raise exception 'A buyer portal transaction, request and token are required.' using errcode = '42501';
  end if;
  select link.* into v_link
  from public.client_portal_links link
  join public.transactions transaction_row on transaction_row.id = link.transaction_id
  where link.transaction_id = p_transaction_id and link.is_active is true and link.token = v_token
    and link.buyer_id is not null
    and transaction_row.development_id is not distinct from link.development_id
    and transaction_row.unit_id is not distinct from link.unit_id
    and transaction_row.buyer_id is not distinct from link.buyer_id
  limit 1;
  if not found then raise exception 'Buyer portal token cannot upload to this transaction.' using errcode = '42501'; end if;

  select * into v_request from public.document_requests
  where id = p_document_request_id and transaction_id = p_transaction_id
  for update;
  if not found then raise exception 'Document request does not belong to this transaction.' using errcode = '42501'; end if;
  if coalesce(v_request.requested_from, '') not in ('buyer', 'buyer_and_seller', 'client')
     and coalesce(v_request.assigned_to_role, '') not in ('buyer', 'client') then
    raise exception 'This document request is not assigned to the buyer.' using errcode = '42501';
  end if;
  if v_request.status not in ('requested', 'rejected') then
    raise exception 'This document request is not awaiting an upload.' using errcode = '22023';
  end if;
  if coalesce(trim(p_file_bucket), '') <> 'documents'
     or coalesce(trim(p_file_path), '') = ''
     or trim(p_file_path) not like 'client-portal/' || p_transaction_id::text || '/%'
     or trim(p_file_path) ~ '(^|/)[.]{1,2}(/|$)' then
    raise exception 'The uploaded object path is outside this buyer portal transaction.' using errcode = '22023';
  end if;

  v_name := left(trim(regexp_replace(coalesce(p_document_name, ''), '[[:cntrl:]]', '', 'g')), 255);
  if v_name = '' then raise exception 'A document name is required.' using errcode = '22023'; end if;
  v_category := left(trim(regexp_replace(coalesce(p_category, 'Additional Requests'), '[[:cntrl:]]', '', 'g')), 120);
  v_type := left(trim(both '_' from lower(regexp_replace(trim(coalesce(p_document_type, 'additional_document')), '[^a-zA-Z0-9]+', '_', 'g'))), 120);
  select lower(nullif(trim(email), '')) into v_buyer_email from public.buyers where id = v_link.buyer_id;

  insert into public.documents (
    transaction_id, name, file_name, file_path, category, document_type, status,
    visibility_scope, is_client_visible, uploaded_by_role, uploaded_by_email,
    uploaded_by_party, source_requirement_id, source, file_bucket, uploaded_at
  ) values (
    p_transaction_id, v_name, v_name, trim(p_file_path), v_category, v_type, 'uploaded',
    'shared', true, 'client', v_buyer_email, 'buyer', p_document_request_id,
    'client_portal_requested_document_upload', 'documents', now()
  ) returning * into v_document;

  update public.document_requests
  set status = case when coalesce(requires_review, true) then 'uploaded' else 'completed' end,
      requested_document_id = v_document.id,
      completed_at = case when coalesce(requires_review, true) then null else now() end,
      rejected_reason = null,
      updated_at = now()
  where id = p_document_request_id;

  insert into public.transaction_events (
    transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope
  ) values (
    p_transaction_id, 'DocumentUploaded',
    jsonb_build_object('documentId', v_document.id, 'documentRequestId', p_document_request_id,
      'documentName', v_name, 'category', v_category, 'documentType', v_type,
      'visibilityScope', 'shared', 'source', 'client_portal_requested_document_upload'),
    null, 'client', 'internal'
  );

  return to_jsonb(v_document) || jsonb_build_object('documentRequestUpdated', true);
end;
$function$;

revoke all on function public.bridge_upload_buyer_portal_requested_document(uuid, uuid, text, text, text, text, text) from public;
grant execute on function public.bridge_upload_buyer_portal_requested_document(uuid, uuid, text, text, text, text, text) to anon, authenticated, service_role;

commit;
