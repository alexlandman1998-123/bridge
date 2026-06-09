begin;

do $$
begin
  if to_regclass('public.private_listing_activity') is not null then
    create index if not exists private_listing_activity_metadata_packet_idx
      on public.private_listing_activity ((metadata ->> 'packetId'))
      where metadata ? 'packetId';

    create index if not exists private_listing_activity_metadata_document_idx
      on public.private_listing_activity ((metadata ->> 'documentId'))
      where metadata ? 'documentId';
  end if;

  if to_regclass('public.document_packet_events') is not null then
    create index if not exists document_packet_events_payload_signer_idx
      on public.document_packet_events ((event_payload_json ->> 'signerId'))
      where event_payload_json ? 'signerId';
  end if;
end;
$$;

create or replace function public.bridge_private_listing_timeline_continuity_report()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report jsonb;
begin
  with
  converted_listings_missing_mandate_activity as (
    select pl.id as private_listing_id, pl.organisation_id, pl.mandate_packet_id, pl.listing_status, pl.mandate_status
    from public.private_listings pl
    where (
        coalesce(pl.mandate_status, '') = 'signed'
        or coalesce(pl.listing_status, '') in ('mandate_signed', 'active', 'under_offer', 'transaction_created', 'sold')
      )
      and not exists (
        select 1
        from public.private_listing_activity activity
        where activity.private_listing_id = pl.id
          and lower(coalesce(activity.activity_type, '')) in ('mandate_signed', 'mandate signed')
      )
  ),
  completed_onboarding_missing_activity as (
    select onboarding.private_listing_id, pl.organisation_id, onboarding.id as onboarding_id, onboarding.submitted_at
    from public.private_listing_seller_onboarding onboarding
    join public.private_listings pl on pl.id = onboarding.private_listing_id
    where coalesce(onboarding.status, '') = 'completed'
      and not exists (
        select 1
        from public.private_listing_activity activity
        where activity.private_listing_id = onboarding.private_listing_id
          and lower(coalesce(activity.activity_type, '')) = 'seller_onboarding_completed'
      )
  ),
  seller_documents_missing_activity as (
    select doc.id as private_listing_document_id, doc.private_listing_id, doc.uploaded_at
    from public.private_listing_documents doc
    where not exists (
      select 1
      from public.private_listing_activity activity
      where activity.private_listing_id = doc.private_listing_id
        and lower(coalesce(activity.activity_type, '')) = 'seller_document_uploaded'
        and activity.metadata ->> 'documentId' = doc.id::text
    )
  ),
  completed_packets_missing_completion_event as (
    select pkt.id as packet_id, pkt.organisation_id, pkt.lead_id, pkt.completed_at, pkt.status
    from public.document_packets pkt
    where coalesce(pkt.status, '') in ('completed', 'signed', 'fully_signed')
      and not exists (
        select 1
        from public.document_packet_events event
        where event.packet_id = pkt.id
          and lower(coalesce(event.event_type, '')) in ('all_signers_completed', 'final_signed_mandate_email_sent')
      )
  ),
  signed_signers_missing_packet_event as (
    select signer.id as signer_id, signer.packet_id, signer.organisation_id, signer.signer_role, signer.signed_at
    from public.document_packet_signers signer
    where coalesce(signer.status, '') = 'signed'
      and not exists (
        select 1
        from public.document_packet_events event
        where event.packet_id = signer.packet_id
          and lower(coalesce(event.event_type, '')) in ('signer_completed_signing', 'mandate_signed_by_seller')
          and (
            event.event_payload_json ->> 'signerId' = signer.id::text
            or event.event_payload_json ->> 'signer_id' = signer.id::text
          )
      )
  ),
  mandate_activity_packet_orphans as (
    select activity.id as activity_id, activity.private_listing_id, activity.metadata ->> 'packetId' as packet_id
    from public.private_listing_activity activity
    left join public.document_packets pkt
      on pkt.id::text = nullif(trim(activity.metadata ->> 'packetId'), '')
    where lower(coalesce(activity.activity_type, '')) in ('mandate_signed', 'mandate signed')
      and nullif(trim(activity.metadata ->> 'packetId'), '') is not null
      and pkt.id is null
  ),
  seller_document_activity_orphans as (
    select activity.id as activity_id, activity.private_listing_id, activity.metadata ->> 'documentId' as document_id
    from public.private_listing_activity activity
    left join public.private_listing_documents doc
      on doc.id::text = nullif(trim(activity.metadata ->> 'documentId'), '')
    where lower(coalesce(activity.activity_type, '')) = 'seller_document_uploaded'
      and nullif(trim(activity.metadata ->> 'documentId'), '') is not null
      and doc.id is null
  ),
  duplicate_listing_milestone_activity as (
    select
      activity.private_listing_id,
      lower(coalesce(activity.activity_type, '')) as activity_type,
      count(*) as activity_count,
      jsonb_agg(activity.id order by activity.created_at) as activity_ids
    from public.private_listing_activity activity
    where lower(coalesce(activity.activity_type, '')) in (
      'seller_onboarding_completed',
      'mandate_signed',
      'mandate signed'
    )
    group by activity.private_listing_id, lower(coalesce(activity.activity_type, ''))
    having count(*) > 1
  ),
  lead_listing_link_missing_lead_activity as (
    select l.lead_id, l.organisation_id, l.listing_id, l.mandate_packet_id
    from public.leads l
    where l.listing_id is not null
      and (
        l.mandate_packet_id is not null
        or coalesce(l.seller_onboarding_status, '') in ('completed', 'submitted')
      )
      and not exists (
        select 1
        from public.lead_activities activity
        where activity.lead_id = l.lead_id
          and activity.organisation_id = l.organisation_id
          and (
            lower(coalesce(activity.activity_type, '')) like '%mandate%'
            or lower(coalesce(activity.activity_type, '')) like '%onboarding%'
            or coalesce(activity.activity_note, '') like '%' || l.listing_id::text || '%'
          )
      )
  )
  select jsonb_build_object(
    'converted_listings_missing_mandate_activity', jsonb_build_object(
      'count', (select count(*) from converted_listings_missing_mandate_activity),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.private_listing_id) from (select * from converted_listings_missing_mandate_activity limit 10) row), '[]'::jsonb)
    ),
    'completed_onboarding_missing_activity', jsonb_build_object(
      'count', (select count(*) from completed_onboarding_missing_activity),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.private_listing_id) from (select * from completed_onboarding_missing_activity limit 10) row), '[]'::jsonb)
    ),
    'seller_documents_missing_activity', jsonb_build_object(
      'count', (select count(*) from seller_documents_missing_activity),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.private_listing_document_id) from (select * from seller_documents_missing_activity limit 10) row), '[]'::jsonb)
    ),
    'completed_packets_missing_completion_event', jsonb_build_object(
      'count', (select count(*) from completed_packets_missing_completion_event),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.packet_id) from (select * from completed_packets_missing_completion_event limit 10) row), '[]'::jsonb)
    ),
    'signed_signers_missing_packet_event', jsonb_build_object(
      'count', (select count(*) from signed_signers_missing_packet_event),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.signer_id) from (select * from signed_signers_missing_packet_event limit 10) row), '[]'::jsonb)
    ),
    'mandate_activity_packet_orphans', jsonb_build_object(
      'count', (select count(*) from mandate_activity_packet_orphans),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.activity_id) from (select * from mandate_activity_packet_orphans limit 10) row), '[]'::jsonb)
    ),
    'seller_document_activity_orphans', jsonb_build_object(
      'count', (select count(*) from seller_document_activity_orphans),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.activity_id) from (select * from seller_document_activity_orphans limit 10) row), '[]'::jsonb)
    ),
    'duplicate_listing_milestone_activity', jsonb_build_object(
      'count', (select count(*) from duplicate_listing_milestone_activity),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.private_listing_id) from (select * from duplicate_listing_milestone_activity limit 10) row), '[]'::jsonb)
    ),
    'lead_listing_link_missing_lead_activity', jsonb_build_object(
      'count', (select count(*) from lead_listing_link_missing_lead_activity),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.lead_id) from (select * from lead_listing_link_missing_lead_activity limit 10) row), '[]'::jsonb)
    )
  )
  into v_report;

  return v_report;
end;
$$;

comment on function public.bridge_private_listing_timeline_continuity_report()
  is 'Service-only diagnostic report for Seller Lead to Listing timeline continuity across onboarding, mandate signing, seller documents, and lead activity.';

revoke all on function public.bridge_private_listing_timeline_continuity_report() from public;
revoke all on function public.bridge_private_listing_timeline_continuity_report() from anon;
revoke all on function public.bridge_private_listing_timeline_continuity_report() from authenticated;
grant execute on function public.bridge_private_listing_timeline_continuity_report() to service_role;

notify pgrst, 'reload schema';

commit;
