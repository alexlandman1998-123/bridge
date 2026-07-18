begin;

alter table public.document_signing_field_layouts
  add column if not exists applied_at timestamptz,
  add column if not exists applied_by uuid,
  add column if not exists applied_field_count integer;

create or replace function public.bridge_apply_signing_field_layout_e3(
  p_packet_id uuid,
  p_version_id uuid,
  p_layout_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_layout public.document_signing_field_layouts%rowtype;
  v_actor uuid := auth.uid();
  v_missing_signer_roles text[];
  v_invalid_signer_roles text[];
  v_missing_signature_roles text[];
  v_base_roles text[];
  v_missing_base_roles text[];
  v_existing_locked integer;
  v_inserted integer;
begin
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet signing-envelope access is not available.' using errcode = '42501';
  end if;
  select * into v_packet from public.document_packets where id = p_packet_id for update;
  if not found then raise exception 'Document packet not found.' using errcode = 'P0002'; end if;
  select * into v_version from public.document_packet_versions where id = p_version_id and packet_id = p_packet_id;
  if not found then raise exception 'Packet version not found.' using errcode = 'P0002'; end if;
  select * into v_layout from public.document_signing_field_layouts where packet_version_id = p_version_id and packet_id = p_packet_id for update;
  if not found or not coalesce(v_layout.placement_verified, false) then
    raise exception 'A verified E2 placement is required before mapping signers.'
      using errcode = '22000', detail = 'E3_VERIFIED_PLACEMENT_REQUIRED';
  end if;
  if v_layout.revision <> p_layout_revision then
    raise exception 'The signing layout changed before it could be applied.'
      using errcode = '40001', detail = 'E3_LAYOUT_REVISION_STALE';
  end if;
  if coalesce(v_packet.status, '') in ('sent','partially_signed','completed','voided','archived') then
    raise exception 'The signing envelope is locked after dispatch.'
      using errcode = '22000', detail = 'E3_SIGNING_ENVELOPE_LOCKED';
  end if;

  with roles as (
    select distinct field->>'signerRole' role from jsonb_array_elements(v_layout.fields_json) field
  )
  select array_agg(role order by role) into v_missing_signer_roles
  from roles
  where not exists (
    select 1 from public.document_packet_signers signer
    where signer.packet_id = p_packet_id and signer.packet_version_id = p_version_id and signer.signer_role = roles.role
  );

  with roles as (
    select distinct field->>'signerRole' role from jsonb_array_elements(v_layout.fields_json) field
  )
  select array_agg(role order by role) into v_invalid_signer_roles
  from roles
  join public.document_packet_signers signer
    on signer.packet_id = p_packet_id and signer.packet_version_id = p_version_id and signer.signer_role = roles.role
  where coalesce(trim(signer.signer_name), '') = ''
     or lower(coalesce(trim(signer.signer_email), '')) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or lower(trim(signer.signer_email)) like '%@bridge.local';

  with roles as (
    select distinct field->>'signerRole' role from jsonb_array_elements(v_layout.fields_json) field
  )
  select array_agg(role order by role) into v_missing_signature_roles
  from roles
  where not exists (
    select 1 from jsonb_array_elements(v_layout.fields_json) field
    where field->>'signerRole' = roles.role and field->>'fieldType' = 'signature'
      and coalesce((field->>'required')::boolean, true)
  );

  v_base_roles := case when v_packet.packet_type = 'otp' then array['purchaser_1','seller']::text[] else array['agent','seller']::text[] end;
  select array_agg(role order by role) into v_missing_base_roles
  from unnest(v_base_roles) role
  where not exists (
    select 1 from jsonb_array_elements(v_layout.fields_json) field
    where field->>'signerRole' = role and field->>'fieldType' = 'signature'
  );

  if coalesce(cardinality(v_missing_signer_roles),0) > 0
     or coalesce(cardinality(v_invalid_signer_roles),0) > 0
     or coalesce(cardinality(v_missing_signature_roles),0) > 0
     or coalesce(cardinality(v_missing_base_roles),0) > 0 then
    raise exception 'Every signer must have one real identity and a required signature block.'
      using errcode = '22000', detail = 'E3_SIGNER_FIELD_MAPPING_INCOMPLETE',
      hint = jsonb_build_object(
        'missingSigners',coalesce(v_missing_signer_roles,'{}'::text[]),
        'invalidSigners',coalesce(v_invalid_signer_roles,'{}'::text[]),
        'missingSignatures',coalesce(v_missing_signature_roles,'{}'::text[]),
        'missingBaseRoles',coalesce(v_missing_base_roles,'{}'::text[])
      )::text;
  end if;

  select count(*) into v_existing_locked
  from public.document_signing_fields
  where packet_id = p_packet_id and packet_version_id = p_version_id
    and (status <> 'pending' or completed_at is not null or signature_asset_path is not null);
  if v_existing_locked > 0 then
    raise exception 'Completed signing fields cannot be replaced.'
      using errcode = '22000', detail = 'E3_SIGNING_FIELDS_ALREADY_USED';
  end if;

  delete from public.document_signing_fields where packet_id = p_packet_id and packet_version_id = p_version_id;
  delete from public.document_packet_signers signer
  where signer.packet_id = p_packet_id and signer.packet_version_id = p_version_id
    and signer.signing_token is null and signer.status in ('pending','ready_to_send')
    and not exists (
      select 1 from jsonb_array_elements(v_layout.fields_json) field
      where field->>'signerRole' = signer.signer_role
    );
  insert into public.document_signing_fields (
    organisation_id, packet_id, packet_document_id, packet_version_id,
    signer_role, signer_name, signer_email, field_type, page_number,
    x_position, y_position, width, height, required, status
  )
  select
    v_packet.organisation_id, v_packet.id, v_version.rendered_document_id, v_version.id,
    field->>'signerRole', signer.signer_name, lower(signer.signer_email), field->>'fieldType',
    (field->>'pageNumber')::integer, (field->>'xPosition')::numeric, (field->>'yPosition')::numeric,
    (field->>'width')::numeric, (field->>'height')::numeric, coalesce((field->>'required')::boolean,true), 'pending'
  from jsonb_array_elements(v_layout.fields_json) field
  join public.document_packet_signers signer
    on signer.packet_id = v_packet.id and signer.packet_version_id = v_version.id and signer.signer_role = field->>'signerRole';
  get diagnostics v_inserted = row_count;

  update public.document_signing_field_layouts
  set status='applied', applied_at=now(), applied_by=v_actor, applied_field_count=v_inserted, updated_at=now()
  where id=v_layout.id returning * into v_layout;

  update public.document_packets
  set status='signing_prep', source_context_json=coalesce(source_context_json,'{}'::jsonb) || jsonb_build_object(
    'signingLayoutId',v_layout.id,'signingLayoutRevision',v_layout.revision,'signingFieldCount',v_inserted
  )
  where id=v_packet.id;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by
  ) values (
    v_packet.id,v_packet.organisation_id,v_version.id,'signing_field_layout_applied',
    jsonb_build_object('contract','e3-v1','layoutId',v_layout.id,'revision',v_layout.revision,'fieldCount',v_inserted,'signerCount',jsonb_array_length(to_jsonb(v_base_roles))),v_actor
  );

  return jsonb_build_object(
    'contract','e3-v1','applied',true,'layoutId',v_layout.id,'revision',v_layout.revision,
    'packetId',v_packet.id,'versionId',v_version.id,'fieldCount',v_inserted,'appliedAt',v_layout.applied_at
  );
end;
$$;

revoke all on function public.bridge_apply_signing_field_layout_e3(uuid, uuid, integer) from public, anon;
grant execute on function public.bridge_apply_signing_field_layout_e3(uuid, uuid, integer) to authenticated, service_role;

commit;
