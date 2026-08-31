begin;

-- Existing transactions created before the canonical creation RPC retained a
-- complete legacy checklist, but had no canonical requirement instances. That
-- made the browser read model empty and left uploads (notably signed OTPs)
-- without an authoritative requirement to satisfy. Build one deterministic
-- candidate per canonical transaction/definition/role signature, then repair
-- both projections from that source.
create temporary table bridge_transaction_requirement_backfill_candidates
on commit drop
as
select distinct on (
  legacy.transaction_id,
  mapped.document_definition_key,
  mapped.requested_from_role
)
  legacy.id as legacy_requirement_id,
  legacy.transaction_id,
  mapped.document_definition_key,
  definition.display_label as document_name,
  definition.category as document_category,
  definition.pack_key,
  coalesce(definition.default_requirement_level, 'required') as requirement_level,
  case
    when legacy.status = 'accepted' then 'approved'
    when legacy.status = 'under_review' then 'under_review'
    when legacy.status = 'uploaded' or legacy.is_uploaded then 'uploaded'
    when legacy.status = 'reupload_required' then 'rejected'
    else 'pending'
  end as canonical_status,
  case
    when legacy.group_key = 'finance' then array['finance_ready']::text[]
    when legacy.group_key = 'transfer' then array['attorney_instruction_ready']::text[]
    else array['otp_ready']::text[]
  end as stage_gates,
  mapped.requested_from_role,
  definition.default_visibility as visible_to_roles,
  definition.default_upload_roles as uploadable_by_roles,
  case
    when legacy.group_key = 'transfer' then 'transferring_attorney'
    when legacy.group_key = 'finance' then 'bond_originator'
    else 'agent'
  end as reviewer_role,
  case
    when legacy.group_key = 'finance' then 'Finance'
    when legacy.group_key = 'transfer' then 'Transfer of Property'
    else 'OTP / Buyer Onboarding'
  end as owning_workflow,
  case
    when legacy.group_key = 'finance' then 'Finance'
    when legacy.group_key = 'transfer' then 'Transfer'
    else 'OTP'
  end as workflow_stage,
  case
    when legacy.group_key = 'finance' then 'finance_documents'
    when legacy.group_key = 'transfer' then 'transfer_documents'
    else 'buyer_documents'
  end as visible_section,
  case
    when legacy.group_key = 'finance' then 'FIN'
    when legacy.group_key = 'transfer' then 'ATTY'
    else 'OTP'
  end as blocking_stage,
  legacy.is_required,
  legacy.uploaded_document_id,
  legacy.created_at,
  legacy.updated_at,
  transaction.current_main_stage
from public.transaction_required_documents legacy
join public.transactions transaction on transaction.id = legacy.transaction_id
cross join lateral (
  select
    case
      when legacy.group_key = 'buyer_fica' and legacy.document_key in (
        'id_document', 'purchaser_id', 'purchaser_1_id', 'passport_copy',
        'director_id', 'trustee_id'
      ) then 'buyer_id_document'
      when legacy.group_key = 'buyer_fica' and legacy.document_key in (
        'proof_of_address', 'purchaser_proof_of_address',
        'purchaser_1_proof_of_address', 'director_proof_of_address'
      ) then 'buyer_proof_of_address'
      when legacy.document_key in ('otp', 'otp_signed', 'signed_offer_to_purchase') then 'signed_otp'
      when legacy.document_key = 'id_document' then 'seller_id_document'
      when legacy.document_key = 'proof_of_address' then 'seller_proof_of_address'
      when legacy.document_key = 'grant_signed' then 'grant_letter'
      when legacy.document_key = 'signed_transfer_pack' then 'signed_transfer_documents'
      else legacy.document_key
    end as document_definition_key,
    case
      when legacy.required_from_role in ('client', 'buyer') then 'buyer'
      when legacy.required_from_role in ('attorney', 'transfer_attorney') then 'transferring_attorney'
      else nullif(legacy.required_from_role, '')
    end as requested_from_role
) mapped
join public.document_definitions definition
  on definition.key = mapped.document_definition_key
 and definition.is_active
 and 'transaction' = any(definition.applies_to_context)
where legacy.enabled
  and legacy.status <> 'not_required'
order by
  legacy.transaction_id,
  mapped.document_definition_key,
  mapped.requested_from_role,
  legacy.is_uploaded desc,
  legacy.updated_at desc,
  legacy.id;

insert into public.document_requirement_instances (
  document_definition_key,
  context_type,
  context_id,
  transaction_id,
  listing_id,
  pack_key,
  requirement_level,
  status,
  stage_gates,
  requested_from_role,
  requested_from_contact_id,
  visible_to_roles,
  uploadable_by_roles,
  reviewer_role,
  satisfied_by_document_id,
  resolver_version,
  source_system,
  created_at,
  updated_at
)
select
  candidate.document_definition_key,
  'transaction',
  candidate.transaction_id,
  candidate.transaction_id,
  null,
  candidate.pack_key,
  candidate.requirement_level,
  candidate.canonical_status,
  candidate.stage_gates,
  candidate.requested_from_role,
  null,
  candidate.visible_to_roles,
  candidate.uploadable_by_roles,
  candidate.reviewer_role,
  candidate.uploaded_document_id,
  'legacy_transaction_requirement_backfill_v1',
  'legacy_transaction_requirement_backfill',
  candidate.created_at,
  greatest(candidate.updated_at, now())
from bridge_transaction_requirement_backfill_candidates candidate
where not exists (
  select 1
  from public.document_requirement_instances instance
  where instance.context_type = 'transaction'
    and instance.context_id = candidate.transaction_id
    and instance.document_definition_key = candidate.document_definition_key
    and instance.requested_from_role is not distinct from candidate.requested_from_role
    and instance.requested_from_contact_id is null
    and instance.status <> 'not_applicable'
);

update public.document_requirement_instances instance
set
  transaction_id = candidate.transaction_id,
  satisfied_by_document_id = coalesce(instance.satisfied_by_document_id, candidate.uploaded_document_id),
  status = case
    when instance.status in ('pending', 'requested', 'rejected')
      and candidate.canonical_status in ('uploaded', 'under_review', 'approved')
      then candidate.canonical_status
    else instance.status
  end,
  updated_at = greatest(instance.updated_at, candidate.updated_at)
from bridge_transaction_requirement_backfill_candidates candidate
where instance.context_type = 'transaction'
  and instance.context_id = candidate.transaction_id
  and instance.document_definition_key = candidate.document_definition_key
  and instance.requested_from_role is not distinct from candidate.requested_from_role
  and instance.requested_from_contact_id is null
  and instance.status <> 'not_applicable';

insert into public.document_requirement_events (
  requirement_instance_id,
  event_type,
  actor_role,
  metadata_json,
  created_at
)
select
  instance.id,
  'created',
  'system',
  jsonb_build_object(
    'source_system', 'legacy_transaction_requirement_backfill',
    'resolver_version', 'legacy_transaction_requirement_backfill_v1'
  ),
  instance.created_at
from public.document_requirement_instances instance
where instance.source_system = 'legacy_transaction_requirement_backfill'
  and not exists (
    select 1
    from public.document_requirement_events event
    where event.requirement_instance_id = instance.id
      and event.event_type = 'created'
  );

update public.transaction_required_documents legacy
set
  canonical_requirement_instance_id = instance.id,
  requirement_key = coalesce(legacy.requirement_key, candidate.document_definition_key),
  updated_at = greatest(legacy.updated_at, instance.updated_at)
from bridge_transaction_requirement_backfill_candidates candidate
join public.document_requirement_instances instance
  on instance.context_type = 'transaction'
 and instance.context_id = candidate.transaction_id
 and instance.document_definition_key = candidate.document_definition_key
 and instance.requested_from_role is not distinct from candidate.requested_from_role
 and instance.requested_from_contact_id is null
 and instance.status <> 'not_applicable'
where legacy.id = candidate.legacy_requirement_id
  and legacy.canonical_requirement_instance_id is distinct from instance.id;

update public.documents document
set
  canonical_requirement_instance_id = coalesce(document.canonical_requirement_instance_id, instance.id),
  updated_at = greatest(document.updated_at, instance.updated_at)
from bridge_transaction_requirement_backfill_candidates candidate
join public.document_requirement_instances instance
  on instance.context_type = 'transaction'
 and instance.context_id = candidate.transaction_id
 and instance.document_definition_key = candidate.document_definition_key
 and instance.requested_from_role is not distinct from candidate.requested_from_role
 and instance.requested_from_contact_id is null
 and instance.status <> 'not_applicable'
where candidate.uploaded_document_id = document.id
  and document.canonical_requirement_instance_id is null;

insert into public.transaction_document_requirements (
  transaction_id,
  rule_id,
  rule_version,
  document_key,
  document_name,
  document_category,
  owning_workflow,
  workflow_stage,
  requested_from,
  responsible_role,
  visible_section,
  required,
  blocking,
  blocking_stage,
  status,
  source,
  trigger_snapshot,
  stage_at_generation,
  pre_collection_allowed,
  canonical_requirement_instance_id,
  uploaded_document_id,
  created_at,
  updated_at,
  last_resolved_at
)
select
  candidate.transaction_id,
  'backfill:legacy:' || candidate.legacy_requirement_id::text,
  1,
  candidate.document_definition_key,
  candidate.document_name,
  candidate.document_category,
  candidate.owning_workflow,
  candidate.workflow_stage,
  candidate.requested_from_role,
  candidate.requested_from_role,
  candidate.visible_section,
  candidate.is_required,
  candidate.requirement_level = 'blocker',
  candidate.blocking_stage,
  instance.status,
  'legacy_transaction_requirement_backfill',
  jsonb_build_object(
    'legacy_requirement_id', candidate.legacy_requirement_id,
    'migration', 'legacy_transaction_requirement_backfill_v1'
  ),
  candidate.current_main_stage,
  false,
  instance.id,
  candidate.uploaded_document_id,
  candidate.created_at,
  candidate.updated_at,
  candidate.updated_at
from bridge_transaction_requirement_backfill_candidates candidate
join public.document_requirement_instances instance
  on instance.context_type = 'transaction'
 and instance.context_id = candidate.transaction_id
 and instance.document_definition_key = candidate.document_definition_key
 and instance.requested_from_role is not distinct from candidate.requested_from_role
 and instance.requested_from_contact_id is null
 and instance.status <> 'not_applicable'
where not exists (
  select 1
  from public.transaction_document_requirements projection
  where projection.transaction_id = candidate.transaction_id
    and projection.document_key = candidate.document_definition_key
    and projection.requested_from is not distinct from candidate.requested_from_role
    and projection.visible_section = candidate.visible_section
    and projection.superseded_at is null
);

update public.transaction_document_requirements projection
set
  canonical_requirement_instance_id = instance.id,
  uploaded_document_id = coalesce(projection.uploaded_document_id, candidate.uploaded_document_id),
  status = instance.status,
  updated_at = greatest(projection.updated_at, candidate.updated_at),
  last_resolved_at = greatest(projection.last_resolved_at, candidate.updated_at)
from bridge_transaction_requirement_backfill_candidates candidate
join public.document_requirement_instances instance
  on instance.context_type = 'transaction'
 and instance.context_id = candidate.transaction_id
 and instance.document_definition_key = candidate.document_definition_key
 and instance.requested_from_role is not distinct from candidate.requested_from_role
 and instance.requested_from_contact_id is null
 and instance.status <> 'not_applicable'
where projection.transaction_id = candidate.transaction_id
  and projection.document_key = candidate.document_definition_key
  and projection.requested_from is not distinct from candidate.requested_from_role
  and projection.visible_section = candidate.visible_section
  and projection.superseded_at is null;

do $$
begin
  if exists (
    select 1
    from bridge_transaction_requirement_backfill_candidates candidate
    where not exists (
      select 1
      from public.document_requirement_instances instance
      where instance.context_type = 'transaction'
        and instance.context_id = candidate.transaction_id
        and instance.document_definition_key = candidate.document_definition_key
        and instance.requested_from_role is not distinct from candidate.requested_from_role
        and instance.status <> 'not_applicable'
    )
  ) then
    raise exception 'canonical transaction requirement backfill left unresolved candidates';
  end if;

  if exists (
    select 1
    from bridge_transaction_requirement_backfill_candidates candidate
    join public.transaction_required_documents legacy
      on legacy.id = candidate.legacy_requirement_id
    where legacy.canonical_requirement_instance_id is null
  ) then
    raise exception 'legacy transaction requirement projection was not linked to canonical state';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
