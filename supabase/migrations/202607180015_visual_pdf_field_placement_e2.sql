begin;

alter table public.document_signing_field_layouts
  add column if not exists pdf_page_count integer,
  add column if not exists placement_schema_version text,
  add column if not exists placement_verified boolean not null default false,
  add column if not exists placement_verified_at timestamptz;

create or replace function public.bridge_save_signing_field_placement_e2(
  p_packet_id uuid,
  p_version_id uuid,
  p_fields jsonb,
  p_expected_revision integer default 0,
  p_pdf_page_count integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saved jsonb;
  v_layout public.document_signing_field_layouts%rowtype;
  v_max_page integer;
  v_collision_count integer;
  v_actor uuid := auth.uid();
begin
  if coalesce(p_pdf_page_count, 0) < 1 or p_pdf_page_count > 500 then
    raise exception 'The PDF page count is invalid.' using errcode = '22023', detail = 'E2_PDF_PAGE_COUNT_INVALID';
  end if;

  v_saved := public.bridge_save_signing_field_layout_e1(p_packet_id, p_version_id, p_fields, p_expected_revision);

  select coalesce(max((field->>'pageNumber')::integer), 0) into v_max_page
  from jsonb_array_elements(p_fields) field;
  if v_max_page > p_pdf_page_count then
    raise exception 'A signing block is assigned beyond the last PDF page.'
      using errcode = '22023', detail = 'E2_FIELD_PAGE_OUT_OF_RANGE';
  end if;

  select count(*) into v_collision_count
  from jsonb_array_elements(p_fields) with ordinality a(field, position)
  join jsonb_array_elements(p_fields) with ordinality b(field, position)
    on a.position < b.position
   and (a.field->>'pageNumber')::integer = (b.field->>'pageNumber')::integer
   and (a.field->>'xPosition')::numeric < (b.field->>'xPosition')::numeric + (b.field->>'width')::numeric
   and (a.field->>'xPosition')::numeric + (a.field->>'width')::numeric > (b.field->>'xPosition')::numeric
   and (a.field->>'yPosition')::numeric < (b.field->>'yPosition')::numeric + (b.field->>'height')::numeric
   and (a.field->>'yPosition')::numeric + (a.field->>'height')::numeric > (b.field->>'yPosition')::numeric;
  if v_collision_count > 0 then
    raise exception 'Two signing blocks overlap on the same PDF page.'
      using errcode = '22023', detail = 'E2_SIGNING_FIELD_COLLISION';
  end if;

  update public.document_signing_field_layouts
  set
    pdf_page_count = p_pdf_page_count,
    placement_schema_version = 'e2-a4-points-v1',
    placement_verified = true,
    placement_verified_at = now(),
    updated_by = v_actor,
    updated_at = now()
  where packet_version_id = p_version_id and packet_id = p_packet_id
  returning * into v_layout;

  insert into public.document_packet_events (
    packet_id, organisation_id, version_id, event_type, event_payload_json, created_by
  ) values (
    p_packet_id, v_layout.organisation_id, p_version_id, 'signing_field_placement_verified',
    jsonb_build_object(
      'contract','e2-v1','layoutId',v_layout.id,'revision',v_layout.revision,
      'pdfPageCount',v_layout.pdf_page_count,'fieldCount',jsonb_array_length(v_layout.fields_json),
      'placementSchemaVersion',v_layout.placement_schema_version,'contentFingerprint',v_layout.content_fingerprint
    ), v_actor
  );

  return v_saved || jsonb_build_object(
    'contract','e2-v1','pdfPageCount',v_layout.pdf_page_count,
    'placementSchemaVersion',v_layout.placement_schema_version,
    'placementVerified',v_layout.placement_verified,'placementVerifiedAt',v_layout.placement_verified_at
  );
end;
$$;

revoke all on function public.bridge_save_signing_field_placement_e2(uuid, uuid, jsonb, integer, integer) from public, anon;
grant execute on function public.bridge_save_signing_field_placement_e2(uuid, uuid, jsonb, integer, integer) to authenticated, service_role;

commit;
