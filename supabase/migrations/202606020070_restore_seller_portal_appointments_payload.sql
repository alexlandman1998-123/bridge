begin;

alter table if exists public.private_listings
  add column if not exists mandate_packet_id uuid,
  add column if not exists mandate_status text not null default 'not_started';

create or replace function public.bridge_private_listing_seller_portal_payload(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onboarding public.private_listing_seller_onboarding%rowtype;
  v_listing public.private_listings%rowtype;
  v_requirements jsonb := '[]'::jsonb;
  v_documents jsonb := '[]'::jsonb;
  v_appointments jsonb := '[]'::jsonb;
  v_mandate_packet jsonb := 'null'::jsonb;
begin
  select *
    into v_onboarding
  from public.private_listing_seller_onboarding
  where token = nullif(trim(p_token), '')
    and (token_expires_at is null or token_expires_at > now())
  limit 1;

  if not found then
    return null;
  end if;

  select *
    into v_listing
  from public.private_listings
  where id = v_onboarding.private_listing_id
  limit 1;

  if not found then
    return null;
  end if;

  if to_regprocedure('public.bridge_promote_pending_private_listing_documents(uuid)') is not null then
    perform public.bridge_promote_pending_private_listing_documents(v_listing.id);
  end if;

  if to_regclass('public.private_listing_document_requirements') is not null then
    select coalesce(jsonb_agg(to_jsonb(req) order by req.created_at asc), '[]'::jsonb)
      into v_requirements
    from public.private_listing_document_requirements req
    where req.private_listing_id = v_listing.id;
  end if;

  if to_regclass('public.private_listing_documents') is not null then
    select coalesce(jsonb_agg(to_jsonb(doc) order by doc.uploaded_at desc), '[]'::jsonb)
      into v_documents
    from public.private_listing_documents doc
    where doc.private_listing_id = v_listing.id;
  end if;

  if to_regclass('public.appointments') is not null then
    select coalesce(jsonb_agg(to_jsonb(appt) order by appt.date_time asc nulls last, appt.created_at desc), '[]'::jsonb)
      into v_appointments
    from public.appointments appt
    where appt.organisation_id = v_listing.organisation_id
      and coalesce(appt.status, '') not in ('cancelled', 'deleted')
      and coalesce(appt.visibility_scope, 'shared_role_players') not in ('internal', 'internal_only', 'admin_only')
      and (
        appt.listing_id::text = v_listing.id::text
        or appt.lead_id::text = v_listing.seller_lead_id::text
        or appt.lead_id::text = v_listing.originating_crm_lead_id::text
        or appt.related_entity_id::text = v_listing.id::text
        or appt.related_entity_id::text = v_listing.seller_lead_id::text
        or appt.related_entity_id::text = v_listing.originating_crm_lead_id::text
      );
  end if;

  if to_regclass('public.document_packets') is not null and to_regclass('public.document_packet_versions') is not null then
    select jsonb_build_object(
      'id', pkt.id,
      'state', case
        when pkt.status = 'completed' and (
          nullif(trim(coalesce(ver.final_signed_file_path, '')), '') is not null
          or nullif(trim(coalesce(ver.final_signed_file_url, '')), '') is not null
        ) then 'fully_signed'
        when pkt.status = 'completed' then 'fully_signed'
        when pkt.status = 'partially_signed' then 'awaiting_other_signatures'
        when pkt.status = 'sent' then 'ready_for_client_signature'
        when pkt.status = 'generated' then 'generated_not_ready'
        when pkt.status in ('ready_for_generation', 'draft') then 'not_generated'
        else coalesce(pkt.status, 'not_generated')
      end,
      'packet', to_jsonb(pkt),
      'version', to_jsonb(ver),
      'packetVersionId', ver.id,
      'finalSignedFilePath', ver.final_signed_file_path,
      'finalSignedFileName', ver.final_signed_file_name,
      'finalSignedFileBucket', ver.final_signed_file_bucket,
      'finalSignedDownloadUrl', ver.final_signed_file_url,
      'generatedPreviewFilePath', ver.rendered_file_path,
      'generatedPreviewFileName', ver.rendered_file_name,
      'signedAt', coalesce(ver.finalised_at, pkt.completed_at),
      'updatedAt', pkt.updated_at
    )
      into v_mandate_packet
    from public.document_packets pkt
    left join lateral (
      select *
      from public.document_packet_versions packet_version
      where packet_version.packet_id = pkt.id
      order by
        case
          when packet_version.final_signed_file_path is not null or packet_version.final_signed_file_url is not null then 0
          else 1
        end,
        packet_version.finalised_at desc nulls last,
        packet_version.version_number desc nulls last,
        packet_version.created_at desc nulls last
      limit 1
    ) ver on true
    where pkt.organisation_id = v_listing.organisation_id
      and pkt.packet_type = 'mandate'
      and (
        pkt.id::text = nullif(v_listing.mandate_packet_id::text, '')
        or pkt.id::text = nullif(v_onboarding.form_data->>'mandatePacketId', '')
        or pkt.lead_id::text = v_listing.seller_lead_id::text
        or pkt.lead_id::text = v_listing.originating_crm_lead_id::text
        or pkt.source_context_json->>'uiLeadId' = v_listing.seller_lead_id::text
        or pkt.source_context_json->>'uiLeadId' = v_listing.originating_crm_lead_id::text
        or pkt.source_context_json->>'leadId' = v_listing.seller_lead_id::text
        or pkt.source_context_json->>'leadId' = v_listing.originating_crm_lead_id::text
      )
    order by
      case
        when pkt.status = 'completed' then 0
        when pkt.id::text = nullif(v_listing.mandate_packet_id::text, '') then 1
        when pkt.id::text = nullif(v_onboarding.form_data->>'mandatePacketId', '') then 2
        else 3
      end,
      pkt.updated_at desc nulls last,
      pkt.created_at desc nulls last
    limit 1;
  end if;

  return jsonb_build_object(
    'listing', to_jsonb(v_listing),
    'onboarding', to_jsonb(v_onboarding),
    'requirements', v_requirements,
    'documents', v_documents,
    'appointments', v_appointments,
    'mandatePacket', v_mandate_packet
  );
end;
$$;

grant execute on function public.bridge_private_listing_seller_portal_payload(text) to anon, authenticated;

with completed_mandates as (
  select
    pkt.id as packet_id,
    pkt.organisation_id,
    pkt.lead_id,
    coalesce(ver.finalised_at, pkt.completed_at, pkt.updated_at, now()) as signed_at
  from public.document_packets pkt
  left join lateral (
    select finalised_at
    from public.document_packet_versions packet_version
    where packet_version.packet_id = pkt.id
      and (
        packet_version.final_signed_file_path is not null
        or packet_version.final_signed_file_url is not null
      )
    order by packet_version.finalised_at desc nulls last, packet_version.version_number desc nulls last
    limit 1
  ) ver on true
  where pkt.packet_type = 'mandate'
    and pkt.status = 'completed'
    and pkt.lead_id is not null
)
update public.leads lead
   set stage = 'Mandate Signed',
       status = 'Mandate Signed',
       mandate_packet_id = completed_mandates.packet_id,
       updated_at = now()
from completed_mandates
where lead.organisation_id = completed_mandates.organisation_id
  and lead.lead_id = completed_mandates.lead_id;

with completed_mandates as (
  select
    pkt.id as packet_id,
    pkt.organisation_id,
    pkt.lead_id,
    coalesce(ver.finalised_at, pkt.completed_at, pkt.updated_at, now()) as signed_at
  from public.document_packets pkt
  left join lateral (
    select finalised_at
    from public.document_packet_versions packet_version
    where packet_version.packet_id = pkt.id
      and (
        packet_version.final_signed_file_path is not null
        or packet_version.final_signed_file_url is not null
      )
    order by packet_version.finalised_at desc nulls last, packet_version.version_number desc nulls last
    limit 1
  ) ver on true
  where pkt.packet_type = 'mandate'
    and pkt.status = 'completed'
)
update public.private_listings listing
   set listing_status = 'mandate_signed',
       mandate_status = 'signed',
       mandate_packet_id = completed_mandates.packet_id,
       updated_at = now()
from completed_mandates
where listing.organisation_id = completed_mandates.organisation_id
  and (
    listing.mandate_packet_id = completed_mandates.packet_id
    or listing.seller_lead_id = completed_mandates.lead_id
    or listing.originating_crm_lead_id = completed_mandates.lead_id
  );

do $$
begin
  if to_regclass('public.lead_activities') is not null then
    insert into public.lead_activities (
      organisation_id,
      lead_id,
      activity_type,
      activity_note,
      outcome,
      activity_date,
      created_at
    )
    select
      pkt.organisation_id,
      pkt.lead_id,
      'Mandate Signed',
      'Mandate was fully signed by all required parties.',
      'Signed',
      coalesce(ver.finalised_at, pkt.completed_at, pkt.updated_at, now()),
      now()
    from public.document_packets pkt
    left join lateral (
      select finalised_at
      from public.document_packet_versions packet_version
      where packet_version.packet_id = pkt.id
        and (
          packet_version.final_signed_file_path is not null
          or packet_version.final_signed_file_url is not null
        )
      order by packet_version.finalised_at desc nulls last, packet_version.version_number desc nulls last
      limit 1
    ) ver on true
    where pkt.packet_type = 'mandate'
      and pkt.status = 'completed'
      and pkt.lead_id is not null
      and not exists (
        select 1
        from public.lead_activities existing
        where existing.organisation_id = pkt.organisation_id
          and existing.lead_id = pkt.lead_id
          and existing.activity_type = 'Mandate Signed'
      );
  end if;
end $$;

do $$
begin
  if to_regclass('public.private_listing_activity') is not null
    and to_regclass('public.private_listings') is not null
    and to_regclass('public.document_packets') is not null
    and to_regclass('public.document_packet_versions') is not null then
    insert into public.private_listing_activity (
      private_listing_id,
      activity_type,
      activity_title,
      activity_description,
      visibility,
      metadata,
      created_at
    )
    select distinct on (listing.id, pkt.id)
      listing.id,
      'mandate_signed',
      'Mandate signed',
      'Mandate was fully signed by all required parties.',
      'client_visible',
      jsonb_build_object(
        'packetId', pkt.id,
        'packetVersionId', ver.id,
        'finalArtifactPath', ver.final_signed_file_path,
        'finalArtifactBucket', ver.final_signed_file_bucket,
        'signedAt', coalesce(ver.finalised_at, pkt.completed_at, pkt.updated_at, now()),
        'source', 'mandate_signed_backfill'
      ),
      coalesce(ver.finalised_at, pkt.completed_at, pkt.updated_at, now())
    from public.document_packets pkt
    left join lateral (
      select id, finalised_at, final_signed_file_path, final_signed_file_bucket
      from public.document_packet_versions packet_version
      where packet_version.packet_id = pkt.id
        and (
          packet_version.final_signed_file_path is not null
          or packet_version.final_signed_file_url is not null
        )
      order by packet_version.finalised_at desc nulls last, packet_version.version_number desc nulls last
      limit 1
    ) ver on true
    join public.private_listings listing
      on listing.organisation_id = pkt.organisation_id
     and (
       listing.mandate_packet_id = pkt.id
       or listing.seller_lead_id = pkt.lead_id
       or listing.originating_crm_lead_id = pkt.lead_id
     )
    where pkt.packet_type = 'mandate'
      and pkt.status = 'completed'
      and not exists (
        select 1
        from public.private_listing_activity existing
        where existing.private_listing_id = listing.id
          and existing.activity_type = 'mandate_signed'
      );
  end if;
end $$;

commit;
