begin;

-- Phase 6.1 deliberately accepts explicit identifiers only.  It does not try
-- to infer a document match from names, categories, or legacy keys.
create or replace function public.bridge_document_trust_phase61_link_requirement_document(
  p_requirement_instance_id uuid,
  p_document_id uuid,
  p_actor_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requirement public.document_requirement_instances%rowtype;
  v_document public.documents%rowtype;
  v_actor_reference text := nullif(trim(p_actor_reference), '');
begin
  if v_actor_reference is null then
    raise exception 'A non-empty remediation actor reference is required.' using errcode = '22023';
  end if;

  select * into v_requirement
  from public.document_requirement_instances
  where id = p_requirement_instance_id
  for update;
  if not found then
    raise exception 'Canonical requirement % was not found.', p_requirement_instance_id using errcode = 'P0002';
  end if;

  select * into v_document
  from public.documents
  where id = p_document_id
  for update;
  if not found then
    raise exception 'Document % was not found.', p_document_id using errcode = 'P0002';
  end if;

  if v_requirement.transaction_id is null
     or v_document.transaction_id is distinct from v_requirement.transaction_id then
    raise exception 'Requirement and document must belong to the same transaction.' using errcode = '23514';
  end if;
  if lower(coalesce(v_requirement.status, '')) not in ('uploaded', 'under_review', 'approved', 'completed') then
    raise exception 'Only an evidence-bearing requirement can be remediated by this operation.' using errcode = '23514';
  end if;
  if v_requirement.satisfied_by_document_id is not null
     and v_requirement.satisfied_by_document_id is distinct from p_document_id then
    raise exception 'Requirement already has a different satisfied document; resolve manually.' using errcode = '23514';
  end if;
  if v_document.canonical_requirement_instance_id is not null
     and v_document.canonical_requirement_instance_id is distinct from p_requirement_instance_id then
    raise exception 'Document is already linked to a different canonical requirement; resolve manually.' using errcode = '23514';
  end if;

  update public.documents
  set canonical_requirement_instance_id = p_requirement_instance_id
  where id = p_document_id;

  update public.document_requirement_instances
  set satisfied_by_document_id = p_document_id,
      updated_at = now()
  where id = p_requirement_instance_id;

  insert into public.document_requirement_events (
    requirement_instance_id, event_type, actor_role, message, metadata_json
  ) values (
    p_requirement_instance_id,
    'legacy_upload_linked',
    'system',
    'Phase 6.1 confirmed remediation linked an explicitly selected document.',
    jsonb_build_object(
      'source', 'document_trust_phase61_confirmed_remediation',
      'document_id', p_document_id,
      'actor_reference', v_actor_reference
    )
  );

  return jsonb_build_object(
    'requirementInstanceId', p_requirement_instance_id,
    'documentId', p_document_id,
    'transactionId', v_requirement.transaction_id,
    'remediated', true
  );
end;
$$;

create or replace function public.bridge_document_trust_phase61_link_legacy_required_document(
  p_legacy_required_document_id uuid,
  p_requirement_instance_id uuid,
  p_actor_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requirement public.document_requirement_instances%rowtype;
  v_legacy public.transaction_required_documents%rowtype;
  v_actor_reference text := nullif(trim(p_actor_reference), '');
begin
  if v_actor_reference is null then
    raise exception 'A non-empty remediation actor reference is required.' using errcode = '22023';
  end if;

  select * into v_legacy
  from public.transaction_required_documents
  where id = p_legacy_required_document_id
  for update;
  if not found then
    raise exception 'Legacy required-document row % was not found.', p_legacy_required_document_id using errcode = 'P0002';
  end if;

  select * into v_requirement
  from public.document_requirement_instances
  where id = p_requirement_instance_id
  for update;
  if not found then
    raise exception 'Canonical requirement % was not found.', p_requirement_instance_id using errcode = 'P0002';
  end if;
  if v_legacy.transaction_id is distinct from v_requirement.transaction_id then
    raise exception 'Legacy row and canonical requirement must belong to the same transaction.' using errcode = '23514';
  end if;
  if v_legacy.canonical_requirement_instance_id is not null
     and v_legacy.canonical_requirement_instance_id is distinct from p_requirement_instance_id then
    raise exception 'Legacy row is already linked to a different canonical requirement; resolve manually.' using errcode = '23514';
  end if;

  update public.transaction_required_documents
  set canonical_requirement_instance_id = p_requirement_instance_id,
      updated_at = now()
  where id = p_legacy_required_document_id;

  insert into public.document_requirement_events (
    requirement_instance_id, event_type, actor_role, message, metadata_json
  ) values (
    p_requirement_instance_id,
    'legacy_synced',
    'system',
    'Phase 6.1 confirmed remediation linked an explicitly selected legacy required-document row.',
    jsonb_build_object(
      'source', 'document_trust_phase61_confirmed_remediation',
      'legacy_required_document_id', p_legacy_required_document_id,
      'actor_reference', v_actor_reference
    )
  );

  return jsonb_build_object(
    'legacyRequiredDocumentId', p_legacy_required_document_id,
    'requirementInstanceId', p_requirement_instance_id,
    'transactionId', v_requirement.transaction_id,
    'remediated', true
  );
end;
$$;

revoke all on function public.bridge_document_trust_phase61_link_requirement_document(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.bridge_document_trust_phase61_link_legacy_required_document(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.bridge_document_trust_phase61_link_requirement_document(uuid, uuid, text) to service_role;
grant execute on function public.bridge_document_trust_phase61_link_legacy_required_document(uuid, uuid, text) to service_role;

comment on function public.bridge_document_trust_phase61_link_requirement_document(uuid, uuid, text) is
  'Phase 6.1: atomically establishes an explicitly reviewed canonical requirement/document link and records an audit event.';
comment on function public.bridge_document_trust_phase61_link_legacy_required_document(uuid, uuid, text) is
  'Phase 6.1: links an explicitly reviewed legacy required-document row to a canonical requirement and records an audit event.';

notify pgrst, 'reload schema';

commit;
