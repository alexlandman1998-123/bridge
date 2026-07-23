begin;

create table if not exists public.document_signing_field_layouts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  packet_id uuid not null references public.document_packets(id) on delete cascade,
  packet_version_id uuid not null references public.document_packet_versions(id) on delete cascade,
  revision integer not null default 1,
  status text not null default 'draft' check (status in ('draft', 'applied', 'superseded')),
  fields_json jsonb not null default '[]'::jsonb,
  content_fingerprint text not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (packet_version_id)
);

alter table public.document_signing_field_layouts enable row level security;
revoke all on table public.document_signing_field_layouts from public, anon;
grant select on table public.document_signing_field_layouts to authenticated;

drop policy if exists document_signing_field_layout_access_e1 on public.document_signing_field_layouts;
create policy document_signing_field_layout_access_e1
on public.document_signing_field_layouts
for select to authenticated
using (public.bridge_can_access_legal_packet_h2(packet_id));

create or replace function public.bridge_save_signing_field_layout_e1(
  p_packet_id uuid,
  p_version_id uuid,
  p_fields jsonb,
  p_expected_revision integer default 0
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
  v_field jsonb;
  v_count integer;
  v_revision integer;
  v_actor uuid := auth.uid();
  v_fingerprint text;
begin
  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(p_packet_id) then
    raise exception 'Packet signing-layout access is not available.' using errcode = '42501';
  end if;
  select * into v_packet from public.document_packets where id = p_packet_id for update;
  if not found then raise exception 'Document packet not found.' using errcode = 'P0002'; end if;
  select * into v_version from public.document_packet_versions where id = p_version_id and packet_id = p_packet_id;
  if not found then raise exception 'Packet version not found.' using errcode = 'P0002'; end if;
  if not coalesce(v_version.transaction_pdf_persisted, false) or v_version.rendered_media_type <> 'application/pdf' then
    raise exception 'A D3-persisted PDF is required before adding signing blocks.'
      using errcode = '22000', detail = 'E1_PERSISTED_PDF_REQUIRED';
  end if;
  if coalesce(v_packet.status, '') in ('sent', 'partially_signed', 'completed', 'voided', 'archived') then
    raise exception 'Signing blocks cannot change after signing starts.'
      using errcode = '22000', detail = 'E1_SIGNING_LAYOUT_LOCKED';
  end if;
  if jsonb_typeof(coalesce(p_fields, 'null'::jsonb)) <> 'array' then
    raise exception 'Signing fields must be a JSON array.' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_fields);
  if v_count < 1 or v_count > 100 then
    raise exception 'A signing layout requires between 1 and 100 blocks.'
      using errcode = '22023', detail = 'E1_SIGNING_LAYOUT_SIZE_INVALID';
  end if;
  for v_field in select value from jsonb_array_elements(p_fields) loop
    if coalesce(v_field->>'fieldType', '') not in ('signature', 'initial')
       or coalesce(v_field->>'signerRole', '') not in ('purchaser_1','purchaser_2','buyer_spouse','seller','seller_spouse','agent','contractor','witness_1','witness_2','other')
       or coalesce((v_field->>'pageNumber')::integer, 0) < 1
       or coalesce((v_field->>'width')::numeric, 0) < 24
       or coalesce((v_field->>'height')::numeric, 0) < 18
       or coalesce((v_field->>'xPosition')::numeric, -1) < 0
       or coalesce((v_field->>'yPosition')::numeric, -1) < 0
       or coalesce((v_field->>'xPosition')::numeric, 0) + coalesce((v_field->>'width')::numeric, 0) > 595
       or coalesce((v_field->>'yPosition')::numeric, 0) + coalesce((v_field->>'height')::numeric, 0) > 842 then
      raise exception 'A signing block is invalid or outside the A4 page.'
        using errcode = '22023', detail = 'E1_SIGNING_FIELD_INVALID';
    end if;
  end loop;

  select * into v_layout from public.document_signing_field_layouts where packet_version_id = p_version_id for update;
  if found and v_layout.revision <> coalesce(p_expected_revision, 0) then
    raise exception 'The signing layout changed in another session.'
      using errcode = '40001', detail = 'E1_SIGNING_LAYOUT_STALE';
  end if;
  if not found and coalesce(p_expected_revision, 0) <> 0 then
    raise exception 'The signing layout changed in another session.'
      using errcode = '40001', detail = 'E1_SIGNING_LAYOUT_STALE';
  end if;

  v_revision := case when v_layout.id is null then 1 else v_layout.revision + 1 end;
  v_fingerprint := 'md5_' || md5(p_fields::text || '|' || p_version_id::text || '|' || v_revision::text);
  insert into public.document_signing_field_layouts (
    organisation_id, packet_id, packet_version_id, revision, status, fields_json,
    content_fingerprint, created_by, updated_by
  ) values (
    v_packet.organisation_id, v_packet.id, v_version.id, v_revision, 'draft', p_fields,
    v_fingerprint, v_actor, v_actor
  )
  on conflict (packet_version_id) do update set
    revision = excluded.revision,
    status = 'draft',
    fields_json = excluded.fields_json,
    content_fingerprint = excluded.content_fingerprint,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_layout;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by
  ) values (
    v_packet.id, v_packet.organisation_id, v_version.id, 'signing_field_layout_saved',
    jsonb_build_object('contract','e1-v1','layoutId',v_layout.id,'revision',v_layout.revision,'fieldCount',v_count,'contentFingerprint',v_layout.content_fingerprint),
    v_actor
  );

  return jsonb_build_object(
    'contract','e1-v1','layoutId',v_layout.id,'packetId',v_packet.id,'versionId',v_version.id,
    'revision',v_layout.revision,'status',v_layout.status,'fields',v_layout.fields_json,
    'contentFingerprint',v_layout.content_fingerprint,'updatedAt',v_layout.updated_at
  );
end;
$$;

revoke all on function public.bridge_save_signing_field_layout_e1(uuid, uuid, jsonb, integer) from public, anon;
grant execute on function public.bridge_save_signing_field_layout_e1(uuid, uuid, jsonb, integer) to authenticated, service_role;

commit;
