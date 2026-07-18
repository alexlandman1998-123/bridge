begin;

create table if not exists public.document_signer_sessions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  packet_version_id uuid not null references public.document_packet_versions(id) on delete cascade,
  signer_id uuid not null references public.document_packet_signers(id) on delete cascade,
  dispatch_id uuid not null references public.document_signing_dispatches(id) on delete restrict,
  layout_id uuid not null references public.document_signing_field_layouts(id) on delete restrict,
  token_fingerprint text not null,
  status text not null default 'active' check (status in ('active','completed','expired')),
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (signer_id, token_fingerprint)
);

alter table public.document_signer_sessions enable row level security;
revoke all on table public.document_signer_sessions from public, anon, authenticated;

create or replace function public.bridge_open_applied_envelope_signer_session_f1(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_signer public.document_packet_signers%rowtype;
  v_packet public.document_packets%rowtype;
  v_version public.document_packet_versions%rowtype;
  v_layout public.document_signing_field_layouts%rowtype;
  v_dispatch public.document_signing_dispatches%rowtype;
  v_session public.document_signer_sessions%rowtype;
  v_fingerprint text;
  v_field_count integer;
  v_mismatch_count integer;
  v_first_open boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Signer sessions may only be opened through the signing service.' using errcode='42501';
  end if;
  if coalesce(length(trim(p_token)),0) < 32 then
    raise exception 'The signing link is invalid.' using errcode='22000', detail='F1_INVALID_TOKEN';
  end if;

  select * into v_signer from public.document_packet_signers where signing_token=trim(p_token) limit 1;
  if not found then raise exception 'The signing link is invalid.' using errcode='P0002', detail='F1_SIGNER_MISSING'; end if;
  if v_signer.status not in ('sent','viewed') or v_signer.token_expires_at is null or v_signer.token_expires_at <= now() then
    raise exception 'The signing link is no longer active.' using errcode='22000', detail='F1_SIGNER_SESSION_INACTIVE';
  end if;

  select * into v_packet from public.document_packets where id=v_signer.packet_id;
  select * into v_version from public.document_packet_versions where id=v_signer.packet_version_id and packet_id=v_signer.packet_id;
  if v_packet.id is null or v_version.id is null
     or v_packet.current_version_number is distinct from v_version.version_number
     or v_packet.organisation_id is distinct from v_signer.organisation_id
     or not coalesce(v_version.transaction_pdf_persisted,false)
     or not coalesce(v_version.native_pdf_verified,false)
     or coalesce(trim(v_version.rendered_file_path),'')='' then
    raise exception 'The exact certified PDF is not available for this signing link.' using errcode='22000', detail='F1_CERTIFIED_VERSION_INVALID';
  end if;

  select * into v_layout from public.document_signing_field_layouts
  where packet_id=v_packet.id and packet_version_id=v_version.id and status='applied' and placement_verified is true
  limit 1;
  if not found then raise exception 'The applied signature layout is unavailable.' using errcode='22000', detail='F1_APPLIED_LAYOUT_MISSING'; end if;

  select * into v_dispatch from public.document_signing_dispatches
  where packet_id=v_packet.id and packet_version_id=v_version.id
    and layout_id=v_layout.id and layout_revision=v_layout.revision and status='delivered'
    and (target_signer_role is null or target_signer_role=lower(trim(v_signer.signer_role)))
  order by completed_at desc nulls last limit 1;
  if not found then raise exception 'This exact envelope was not delivered to the signer.' using errcode='22000', detail='F1_DELIVERED_DISPATCH_REQUIRED'; end if;

  select count(*) into v_field_count from public.document_signing_fields
  where packet_id=v_packet.id and packet_version_id=v_version.id
    and signer_role=v_signer.signer_role
    and (coalesce(trim(signer_email),'')='' or lower(trim(signer_email))=lower(trim(v_signer.signer_email)));
  if v_field_count=0 or not exists (
    select 1 from public.document_signing_fields where packet_id=v_packet.id and packet_version_id=v_version.id
      and signer_role=v_signer.signer_role and field_type='signature' and required is true
      and (coalesce(trim(signer_email),'')='' or lower(trim(signer_email))=lower(trim(v_signer.signer_email)))
  ) then
    raise exception 'No required signature field is assigned to this signer.' using errcode='22000', detail='F1_SCOPED_FIELDS_INVALID';
  end if;

  select count(*) into v_mismatch_count
  from public.document_signing_fields field
  where field.packet_id=v_packet.id and field.packet_version_id=v_version.id
    and field.signer_role=v_signer.signer_role
    and (coalesce(trim(field.signer_email),'')='' or lower(trim(field.signer_email))=lower(trim(v_signer.signer_email)))
    and not exists (
      select 1 from jsonb_array_elements(v_layout.fields_json) layout_field
      where layout_field->>'signerRole'=field.signer_role
        and layout_field->>'fieldType'=field.field_type
        and (layout_field->>'pageNumber')::integer=field.page_number
        and (layout_field->>'xPosition')::numeric=field.x_position
        and (layout_field->>'yPosition')::numeric=field.y_position
        and (layout_field->>'width')::numeric=field.width
        and (layout_field->>'height')::numeric=field.height
        and coalesce((layout_field->>'required')::boolean,true)=field.required
    );
  if v_mismatch_count>0 then
    raise exception 'The signer fields no longer match the delivered layout.' using errcode='22000', detail='F1_SCOPED_FIELD_MISMATCH';
  end if;

  v_fingerprint := encode(digest(trim(p_token),'sha256'),'hex');
  select not exists (
    select 1 from public.document_signer_sessions
    where signer_id=v_signer.id and token_fingerprint=v_fingerprint
  ) into v_first_open;
  insert into public.document_signer_sessions (
    organisation_id,packet_id,packet_version_id,signer_id,dispatch_id,layout_id,token_fingerprint
  ) values (
    v_packet.organisation_id,v_packet.id,v_version.id,v_signer.id,v_dispatch.id,v_layout.id,v_fingerprint
  )
  on conflict (signer_id,token_fingerprint) do update set last_seen_at=now()
  returning * into v_session;

  if v_first_open then
    insert into public.document_packet_events (packet_id,organisation_id,version_id,event_type,event_payload_json,created_by)
    values (v_packet.id,v_packet.organisation_id,v_version.id,'controlled_signer_session_opened',
      jsonb_build_object('contract','f1-v1','sessionId',v_session.id,'dispatchId',v_dispatch.id,'layoutId',v_layout.id,'layoutRevision',v_layout.revision,'signerId',v_signer.id,'signerRole',v_signer.signer_role,'fieldCount',v_field_count),null);
  end if;

  return jsonb_build_object(
    'contract','f1-v1','authorized',true,'sessionId',v_session.id,'dispatchId',v_dispatch.id,
    'layoutId',v_layout.id,'layoutRevision',v_layout.revision,'packetId',v_packet.id,'versionId',v_version.id,
    'signerId',v_signer.id,'signerRole',v_signer.signer_role,'fieldCount',v_field_count,
    'certifiedPdfPath',v_version.rendered_file_path,'openedAt',v_session.opened_at
  );
end;
$$;

revoke all on function public.bridge_open_applied_envelope_signer_session_f1(text) from public,anon,authenticated;
grant execute on function public.bridge_open_applied_envelope_signer_session_f1(text) to service_role;

comment on function public.bridge_open_applied_envelope_signer_session_f1(text) is
  'F1 opens an auditable signer session only for an E4-delivered, E3-applied layout over the exact D3 certified PDF.';

commit;
