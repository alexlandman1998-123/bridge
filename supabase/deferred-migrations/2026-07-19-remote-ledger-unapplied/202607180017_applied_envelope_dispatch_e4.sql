begin;

create table if not exists public.document_signing_dispatches (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  packet_version_id uuid not null references public.document_packet_versions(id) on delete cascade,
  layout_id uuid not null references public.document_signing_field_layouts(id) on delete restrict,
  layout_revision integer not null,
  dispatch_kind text not null check (dispatch_kind in ('initial','resend')),
  target_signer_role text,
  idempotency_key text not null unique,
  status text not null default 'authorized' check (status in ('authorized','delivered','failed')),
  delivery_evidence_json jsonb not null default '{}'::jsonb,
  authorized_by uuid,
  authorized_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.document_signing_dispatches enable row level security;
revoke all on table public.document_signing_dispatches from public, anon;
grant select on table public.document_signing_dispatches to authenticated;
drop policy if exists document_signing_dispatch_access_e4 on public.document_signing_dispatches;
create policy document_signing_dispatch_access_e4 on public.document_signing_dispatches
for select to authenticated using (public.bridge_can_access_legal_packet_h2(packet_id));

create or replace function public.bridge_authorize_applied_envelope_dispatch_e4(
  p_packet_id uuid,
  p_version_id uuid,
  p_regenerate boolean default false,
  p_target_signer_role text default null
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
  v_dispatch public.document_signing_dispatches%rowtype;
  v_actor uuid := auth.uid();
  v_kind text := case when p_regenerate then 'resend' else 'initial' end;
  v_target text := nullif(lower(trim(p_target_signer_role)), '');
  v_key text;
  v_field_count integer;
  v_mismatch_count integer;
begin
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet signing dispatch is not available.' using errcode = '42501';
  end if;
  select * into v_packet from public.document_packets where id=p_packet_id for update;
  if not found then raise exception 'Document packet not found.' using errcode='P0002'; end if;
  select * into v_version from public.document_packet_versions where id=p_version_id and packet_id=p_packet_id;
  if not found then raise exception 'Packet version not found.' using errcode='P0002'; end if;
  select * into v_layout from public.document_signing_field_layouts where packet_version_id=p_version_id and packet_id=p_packet_id;
  if not found or v_layout.status <> 'applied' or not coalesce(v_layout.placement_verified,false) then
    raise exception 'The E3-applied visual signing layout is required before dispatch.'
      using errcode='22000', detail='E4_APPLIED_LAYOUT_REQUIRED';
  end if;
  if not coalesce(v_version.transaction_pdf_persisted,false) or not coalesce(v_version.native_pdf_verified,false) then
    raise exception 'The certified PDF is not dispatchable.' using errcode='22000', detail='E4_CERTIFIED_PDF_REQUIRED';
  end if;

  select count(*) into v_field_count from public.document_signing_fields
  where packet_id=p_packet_id and packet_version_id=p_version_id;
  select count(*) into v_mismatch_count
  from jsonb_array_elements(v_layout.fields_json) layout_field
  where not exists (
    select 1 from public.document_signing_fields signing_field
    where signing_field.packet_id=p_packet_id and signing_field.packet_version_id=p_version_id
      and signing_field.signer_role=layout_field->>'signerRole'
      and signing_field.field_type=layout_field->>'fieldType'
      and signing_field.page_number=(layout_field->>'pageNumber')::integer
      and signing_field.x_position=(layout_field->>'xPosition')::numeric
      and signing_field.y_position=(layout_field->>'yPosition')::numeric
      and signing_field.width=(layout_field->>'width')::numeric
      and signing_field.height=(layout_field->>'height')::numeric
      and signing_field.required=coalesce((layout_field->>'required')::boolean,true)
  );
  if v_field_count <> jsonb_array_length(v_layout.fields_json) or v_mismatch_count > 0 then
    raise exception 'The signing fields no longer match the applied visual layout.'
      using errcode='22000', detail='E4_APPLIED_LAYOUT_FIELD_MISMATCH';
  end if;

  if v_target is not null and not exists (
    select 1 from public.document_packet_signers where packet_id=p_packet_id and packet_version_id=p_version_id and signer_role=v_target
  ) then
    raise exception 'The requested signing recipient is not in this envelope.' using errcode='22000', detail='E4_TARGET_SIGNER_MISSING';
  end if;

  v_key := case
    when p_regenerate then p_version_id::text || ':resend:' || coalesce(v_target,'all') || ':' || gen_random_uuid()::text
    else p_version_id::text || ':initial'
  end;
  insert into public.document_signing_dispatches (
    organisation_id,packet_id,packet_version_id,layout_id,layout_revision,dispatch_kind,
    target_signer_role,idempotency_key,status,authorized_by
  ) values (
    v_packet.organisation_id,v_packet.id,v_version.id,v_layout.id,v_layout.revision,v_kind,
    v_target,v_key,'authorized',v_actor
  )
  on conflict (idempotency_key) do update set updated_at=now()
  returning * into v_dispatch;

  insert into public.document_packet_events (
    packet_id,organisation_id,version_id,event_type,event_payload_json,created_by
  ) values (
    v_packet.id,v_packet.organisation_id,v_version.id,'signing_dispatch_authorized',
    jsonb_build_object('contract','e4-v1','dispatchId',v_dispatch.id,'layoutId',v_layout.id,'layoutRevision',v_layout.revision,'kind',v_kind,'targetSignerRole',v_target,'alreadyDelivered',v_dispatch.status='delivered'),v_actor
  );

  return jsonb_build_object(
    'contract','e4-v1','authorized',true,'dispatchId',v_dispatch.id,'status',v_dispatch.status,
    'alreadyDelivered',v_dispatch.status='delivered','layoutId',v_layout.id,'layoutRevision',v_layout.revision,
    'packetId',v_packet.id,'versionId',v_version.id,'kind',v_kind,'targetSignerRole',v_target
  );
end;
$$;

create or replace function public.bridge_complete_applied_envelope_dispatch_e4(
  p_dispatch_id uuid,
  p_success boolean,
  p_delivery_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispatch public.document_signing_dispatches%rowtype;
  v_actor uuid:=auth.uid();
begin
  select * into v_dispatch from public.document_signing_dispatches where id=p_dispatch_id for update;
  if not found then raise exception 'Signing dispatch not found.' using errcode='P0002'; end if;
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(v_dispatch.packet_id) then
    raise exception 'Packet signing dispatch is not available.' using errcode='42501';
  end if;
  if v_dispatch.status='delivered' and not p_success then
    raise exception 'A delivered signing dispatch cannot be marked failed.' using errcode='22000';
  end if;
  if p_success
     and not coalesce((p_delivery_evidence->>'emailConfirmed')::boolean,false)
     and coalesce(p_delivery_evidence->>'emailDeliveryId','')=''
     and jsonb_array_length(coalesce(p_delivery_evidence->'emailDeliveryIds','[]'::jsonb))=0
     and coalesce(p_delivery_evidence->>'recipientEmail','')=''
     and jsonb_array_length(coalesce(p_delivery_evidence->'recipientEmails','[]'::jsonb))=0 then
    raise exception 'Confirmed delivery evidence is required.' using errcode='22000', detail='E4_DELIVERY_EVIDENCE_REQUIRED';
  end if;
  update public.document_signing_dispatches set
    status=case when p_success then 'delivered' else 'failed' end,
    delivery_evidence_json=coalesce(p_delivery_evidence,'{}'::jsonb),
    completed_at=now(),updated_at=now()
  where id=p_dispatch_id returning * into v_dispatch;
  insert into public.document_packet_events (
    packet_id,organisation_id,version_id,event_type,event_payload_json,created_by
  ) values (
    v_dispatch.packet_id,v_dispatch.organisation_id,v_dispatch.packet_version_id,
    case when p_success then 'signing_dispatch_delivered' else 'signing_dispatch_failed' end,
    jsonb_build_object('contract','e4-v1','dispatchId',v_dispatch.id,'status',v_dispatch.status,'kind',v_dispatch.dispatch_kind,'targetSignerRole',v_dispatch.target_signer_role,'deliveryEvidence',v_dispatch.delivery_evidence_json),v_actor
  );
  return jsonb_build_object('contract','e4-v1','dispatchId',v_dispatch.id,'status',v_dispatch.status,'completedAt',v_dispatch.completed_at);
end;
$$;

revoke all on function public.bridge_authorize_applied_envelope_dispatch_e4(uuid,uuid,boolean,text) from public,anon;
grant execute on function public.bridge_authorize_applied_envelope_dispatch_e4(uuid,uuid,boolean,text) to authenticated,service_role;
revoke all on function public.bridge_complete_applied_envelope_dispatch_e4(uuid,boolean,jsonb) from public,anon;
grant execute on function public.bridge_complete_applied_envelope_dispatch_e4(uuid,boolean,jsonb) to authenticated,service_role;

commit;
