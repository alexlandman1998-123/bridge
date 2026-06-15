create or replace function public.bridge_link_document_to_canonical_requirement(
  p_document_id uuid,
  p_requirement_instance_id uuid,
  p_actor_role text default null,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_document public.documents%rowtype;
  v_requirement public.document_requirement_instances%rowtype;
  v_definition public.document_definitions%rowtype;
  v_actor_role text := lower(trim(coalesce(p_actor_role, '')));
  v_profile_role text;
  v_is_internal boolean := false;
  v_previous_status text;
  v_next_status text;
  v_legacy_document_keys text[];
begin
  if v_auth_user_id is null then
    raise exception 'Authentication is required to link a document to a canonical requirement.'
      using errcode = '28000';
  end if;

  if p_actor_user_id is not null and p_actor_user_id <> v_auth_user_id then
    raise exception 'Actor user does not match the authenticated user.'
      using errcode = '42501';
  end if;

  select *
    into v_document
  from public.documents
  where id = p_document_id;

  if not found then
    raise exception 'Document % was not found.', p_document_id
      using errcode = 'P0002';
  end if;

  select *
    into v_requirement
  from public.document_requirement_instances
  where id = p_requirement_instance_id;

  if not found then
    raise exception 'Canonical requirement % was not found.', p_requirement_instance_id
      using errcode = 'P0002';
  end if;

  if v_requirement.transaction_id is not null and v_document.transaction_id is distinct from v_requirement.transaction_id then
    raise exception 'Document transaction does not match canonical requirement transaction.'
      using errcode = '42501';
  end if;

  if v_document.canonical_requirement_instance_id is not null
     and v_document.canonical_requirement_instance_id <> p_requirement_instance_id then
    raise exception 'Document is already linked to a different canonical requirement.'
      using errcode = '23505';
  end if;

  select role
    into v_profile_role
  from public.profiles
  where id = v_auth_user_id;

  v_profile_role := lower(trim(coalesce(v_profile_role, '')));
  if v_actor_role = 'attorney' then
    v_actor_role := 'transferring_attorney';
  elsif v_actor_role = 'client' then
    v_actor_role := 'buyer';
  end if;

  v_is_internal :=
    coalesce(v_profile_role, '') in ('agent', 'agency_admin', 'developer', 'attorney', 'transferring_attorney', 'bond_attorney', 'cancellation_attorney', 'bond_originator', 'admin', 'internal_admin')
    or exists (
      select 1
      from public.attorney_firm_members afm
      where afm.user_id = v_auth_user_id
        and coalesce(afm.status, '') = 'active'
    )
    or exists (
      select 1
      from public.organisation_users ou
      where ou.user_id = v_auth_user_id
        and coalesce(ou.status, '') = 'active'
        and lower(coalesce(ou.app_role, ou.role, '')) in ('agent', 'agency_admin', 'developer', 'attorney', 'admin', 'internal_admin')
    );

  if not v_is_internal
     and not (coalesce(v_requirement.uploadable_by_roles, '{}'::text[]) @> array[v_actor_role]::text[]) then
    raise exception 'Authenticated user cannot upload against this canonical requirement.'
      using errcode = '42501';
  end if;

  select *
    into v_definition
  from public.document_definitions
  where key = v_requirement.document_definition_key;

  v_previous_status := coalesce(v_requirement.status, 'pending');
  v_next_status := case when coalesce(v_definition.review_required, false) then 'under_review' else 'uploaded' end;
  v_legacy_document_keys := array_remove(array[
    v_requirement.document_definition_key,
    case v_requirement.document_definition_key
      when 'signed_otp' then 'otp'
      when 'generated_otp' then 'generated_otp'
      when 'grant_letter' then 'grant_signed'
      when 'seller_id_document' then 'id_document'
      when 'buyer_id_document' then 'id_document'
      when 'seller_proof_of_address' then 'proof_of_address'
      when 'buyer_proof_of_address' then 'proof_of_address'
      when 'signed_transfer_documents' then 'signed_transfer_pack'
      when 'settlement_figure' then 'settlement_figures'
      else null
    end
  ], null);

  if v_previous_status in ('approved', 'completed', 'waived', 'not_applicable') then
    v_next_status := v_previous_status;
  end if;

  update public.documents
  set canonical_requirement_instance_id = p_requirement_instance_id
  where id = p_document_id;

  update public.document_requirement_instances
  set status = v_next_status,
      satisfied_by_document_id = p_document_id,
      rejection_reason = null,
      source_system = 'internal_browser_upload',
      updated_at = now()
  where id = p_requirement_instance_id;

  update public.transaction_required_documents
  set is_uploaded = true,
      uploaded_document_id = p_document_id,
      canonical_requirement_instance_id = coalesce(canonical_requirement_instance_id, p_requirement_instance_id),
      status = case
        when v_next_status = 'under_review' then 'under_review'
        when v_next_status in ('approved', 'completed') then 'approved'
        else 'uploaded'
      end,
      uploaded_at = coalesce(uploaded_at, now()),
      updated_at = now()
  where transaction_id = v_requirement.transaction_id
    and (
      canonical_requirement_instance_id = p_requirement_instance_id
      or document_key = any(v_legacy_document_keys)
    );

  insert into public.document_requirement_events (
    requirement_instance_id,
    event_type,
    actor_role,
    actor_user_id,
    message,
    metadata_json
  )
  values (
    p_requirement_instance_id,
    'uploaded',
    nullif(v_actor_role, ''),
    v_auth_user_id,
    'Browser upload linked to canonical requirement.',
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'document_id', p_document_id,
        'previous_status', v_previous_status,
        'new_status', v_next_status,
        'source', 'internal_browser_upload'
      )
  );

  return jsonb_build_object(
    'ok', true,
    'documentId', p_document_id,
    'requirementInstanceId', p_requirement_instance_id,
    'previousStatus', v_previous_status,
    'newStatus', v_next_status
  );
end;
$$;
revoke all on function public.bridge_link_document_to_canonical_requirement(uuid, uuid, text, uuid, jsonb) from public;
revoke all on function public.bridge_link_document_to_canonical_requirement(uuid, uuid, text, uuid, jsonb) from anon;
grant execute on function public.bridge_link_document_to_canonical_requirement(uuid, uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.bridge_link_document_to_canonical_requirement(uuid, uuid, text, uuid, jsonb) to service_role;
comment on function public.bridge_link_document_to_canonical_requirement(uuid, uuid, text, uuid, jsonb) is
  'Staging-safe scoped RPC for browser uploads to satisfy canonical document requirement instances without exposing broad table CRUD.';
create or replace function public.bridge_link_document_to_canonical_requirement_by_key(
  p_document_id uuid,
  p_transaction_id uuid,
  p_document_key text,
  p_actor_role text default null,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_document public.documents%rowtype;
  v_normalized_key text;
  v_canonical_key text;
  v_requirement_id uuid;
  v_match_count integer := 0;
begin
  if v_auth_user_id is null then
    raise exception 'Authentication is required to link a document to a canonical requirement.'
      using errcode = '28000';
  end if;

  if p_actor_user_id is not null and p_actor_user_id <> v_auth_user_id then
    raise exception 'Actor user does not match the authenticated user.'
      using errcode = '42501';
  end if;

  select *
    into v_document
  from public.documents
  where id = p_document_id;

  if not found then
    raise exception 'Document % was not found.', p_document_id
      using errcode = 'P0002';
  end if;

  if v_document.transaction_id is distinct from p_transaction_id then
    raise exception 'Document transaction does not match canonical upload transaction.'
      using errcode = '42501';
  end if;

  if v_document.canonical_requirement_instance_id is not null then
    return jsonb_build_object(
      'ok', true,
      'documentId', p_document_id,
      'requirementInstanceId', v_document.canonical_requirement_instance_id,
      'matchReason', 'already_linked'
    );
  end if;

  v_normalized_key := lower(trim(regexp_replace(coalesce(p_document_key, ''), '[^a-zA-Z0-9]+', '_', 'g')));
  v_normalized_key := trim(both '_' from v_normalized_key);

  v_canonical_key := case v_normalized_key
    when 'otp' then 'signed_otp'
    when 'otp_signed' then 'signed_otp'
    when 'mandate_signature' then 'signed_mandate'
    when 'seller_id' then 'seller_id_document'
    when 'buyer_id' then 'buyer_id_document'
    when 'grant_signed' then 'grant_letter'
    when 'settlement_figures' then 'settlement_figure'
    when 'signed_transfer_pack' then 'signed_transfer_documents'
    when 'transfer_document_pack' then 'signed_transfer_documents'
    when 'instruction_otp_documents' then 'signed_otp'
    when 'signing_documents' then 'signed_transfer_documents'
    when 'drafting_documents' then 'transfer_documents'
    when 'buyer_fica_compliance' then 'buyer_id_document'
    when 'seller_fica_compliance' then 'seller_id_document'
    when 'clearance_documents' then 'rates_clearance_certificate'
    when 'lodgement_documents' then 'lodgement_confirmation'
    when 'registration_close_out_documents' then 'registration_confirmation'
    else v_normalized_key
  end;

  if v_canonical_key = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_document_key');
  end if;

  select count(*), min(id::text)::uuid
    into v_match_count, v_requirement_id
  from public.document_requirement_instances
  where transaction_id = p_transaction_id
    and document_definition_key = v_canonical_key
    and coalesce(status, '') <> 'not_applicable';

  if v_match_count = 0 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'no_matching_canonical_requirement',
      'documentKey', v_normalized_key,
      'canonicalKey', v_canonical_key
    );
  end if;

  if v_match_count > 1 then
    return jsonb_build_object(
      'ok', false,
      'reason', 'ambiguous_canonical_requirement',
      'documentKey', v_normalized_key,
      'canonicalKey', v_canonical_key,
      'matchCount', v_match_count
    );
  end if;

  return public.bridge_link_document_to_canonical_requirement(
    p_document_id,
    v_requirement_id,
    p_actor_role,
    p_actor_user_id,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'match_reason', 'document_key_rpc',
        'document_key', v_normalized_key,
        'canonical_key', v_canonical_key
      )
  );
end;
$$;
revoke all on function public.bridge_link_document_to_canonical_requirement_by_key(uuid, uuid, text, text, uuid, jsonb) from public;
revoke all on function public.bridge_link_document_to_canonical_requirement_by_key(uuid, uuid, text, text, uuid, jsonb) from anon;
grant execute on function public.bridge_link_document_to_canonical_requirement_by_key(uuid, uuid, text, text, uuid, jsonb) to authenticated;
grant execute on function public.bridge_link_document_to_canonical_requirement_by_key(uuid, uuid, text, text, uuid, jsonb) to service_role;
comment on function public.bridge_link_document_to_canonical_requirement_by_key(uuid, uuid, text, text, uuid, jsonb) is
  'Scoped browser upload helper that resolves a single canonical document requirement by transaction and explicit document key without exposing operational canonical tables.';
