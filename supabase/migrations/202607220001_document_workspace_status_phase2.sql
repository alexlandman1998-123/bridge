begin;

create or replace function public.bridge_get_document_workspace_status_p2(
  p_packet_id uuid default null,
  p_packet_type text default null,
  p_transaction_id uuid default null,
  p_lead_id uuid default null,
  p_organisation_id uuid default null,
  p_include_activity boolean default false,
  p_activity_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packet public.document_packets%rowtype;
  v_packet_type text := lower(nullif(trim(coalesce(p_packet_type, '')), ''));
  v_activity_limit integer := greatest(0, least(coalesce(p_activity_limit, 25), 100));
  v_versions jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_signers jsonb := '[]'::jsonb;
  v_fields jsonb := '[]'::jsonb;
begin
  if v_packet_type is not null and v_packet_type not in ('otp', 'mandate') then
    raise exception 'Unsupported packet type for workspace status: %', v_packet_type
      using errcode = '22023';
  end if;

  if p_packet_id is not null then
    select *
      into v_packet
      from public.document_packets
     where id = p_packet_id;
  else
    select *
      into v_packet
      from public.document_packets
     where (p_organisation_id is null or organisation_id = p_organisation_id)
       and (v_packet_type is null or lower(packet_type) = v_packet_type)
       and (p_transaction_id is null or transaction_id = p_transaction_id)
       and (p_lead_id is null or lead_id = p_lead_id)
     order by updated_at desc nulls last, created_at desc
     limit 1;
  end if;

  if v_packet.id is null then
    return jsonb_build_object(
      'contract', 'p2-document-workspace-status-v1',
      'mutatedData', false,
      'packet', null,
      'versions', '[]'::jsonb,
      'events', '[]'::jsonb,
      'signers', '[]'::jsonb,
      'fields', '[]'::jsonb,
      'warnings', '[]'::jsonb
    );
  end if;

  if auth.role() <> 'service_role' and not public.bridge_can_access_legal_packet_h2(v_packet.id) then
    raise exception 'Not authorised to read this document workspace status.'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(version_row) order by version_row.version_number desc), '[]'::jsonb)
    into v_versions
    from (
      select *
        from public.document_packet_versions
       where packet_id = v_packet.id
       order by version_number desc
       limit 20
    ) version_row;

  select coalesce(jsonb_agg(to_jsonb(signer_row) order by signer_row.signing_order asc nulls last, signer_row.created_at asc), '[]'::jsonb)
    into v_signers
    from public.document_packet_signers signer_row
   where signer_row.packet_id = v_packet.id;

  select coalesce(jsonb_agg(to_jsonb(field_row) order by field_row.page_number asc nulls last, field_row.created_at asc), '[]'::jsonb)
    into v_fields
    from public.document_signing_fields field_row
   where field_row.packet_id = v_packet.id;

  if p_include_activity then
    select coalesce(jsonb_agg(to_jsonb(event_row) order by event_row.created_at desc), '[]'::jsonb)
      into v_events
      from (
        select id, packet_id, organisation_id, version_id, event_type, event_payload_json, created_by, created_at
          from public.document_packet_events
         where packet_id = v_packet.id
         order by created_at desc
         limit v_activity_limit
      ) event_row;
  end if;

  return jsonb_build_object(
    'contract', 'p2-document-workspace-status-v1',
    'mutatedData', false,
    'packet', to_jsonb(v_packet),
    'versions', v_versions,
    'events', v_events,
    'signers', v_signers,
    'fields', v_fields,
    'warnings', '[]'::jsonb,
    'activityIncluded', p_include_activity,
    'activityLimit', v_activity_limit
  );
end;
$$;

revoke all on function public.bridge_get_document_workspace_status_p2(uuid, text, uuid, uuid, uuid, boolean, integer) from public, anon;
grant execute on function public.bridge_get_document_workspace_status_p2(uuid, text, uuid, uuid, uuid, boolean, integer) to authenticated, service_role;

commit;
