begin;

do $$
begin
  if to_regclass('public.private_listings') is not null
     and to_regclass('public.document_packets') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'private_listings'
         and column_name = 'mandate_packet_id'
         and udt_name = 'uuid'
     )
  then
    create index if not exists private_listings_mandate_packet_id_idx
      on public.private_listings(mandate_packet_id)
      where mandate_packet_id is not null;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'private_listings_mandate_packet_id_document_packets_fkey'
        and conrelid = 'public.private_listings'::regclass
    ) then
      alter table public.private_listings
        add constraint private_listings_mandate_packet_id_document_packets_fkey
        foreign key (mandate_packet_id)
        references public.document_packets(id)
        on delete set null
        not valid;
    end if;

    comment on constraint private_listings_mandate_packet_id_document_packets_fkey on public.private_listings
      is 'Future-write guard for signed mandate packet linkage. Added NOT VALID so existing mandate/listing continuity can be audited before validation.';
  end if;
end;
$$;

create or replace function public.bridge_private_listing_document_continuity_report()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report jsonb;
begin
  with
  listing_mandate_packet_orphans as (
    select pl.id as private_listing_id, pl.organisation_id, pl.mandate_packet_id
    from public.private_listings pl
    left join public.document_packets pkt on pkt.id = pl.mandate_packet_id
    where pl.mandate_packet_id is not null
      and pkt.id is null
  ),
  lead_mandate_packet_orphans as (
    select l.lead_id, l.organisation_id, l.mandate_packet_id
    from public.leads l
    left join public.document_packets pkt on pkt.id = l.mandate_packet_id
    where l.mandate_packet_id is not null
      and pkt.id is null
  ),
  mandate_packet_listing_mismatches as (
    select
      pl.id as private_listing_id,
      pl.organisation_id,
      pl.mandate_packet_id,
      nullif(trim(coalesce(
        pkt.source_context_json ->> 'privateListingId',
        pkt.source_context_json ->> 'private_listing_id',
        pkt.source_context_json ->> 'listingId',
        pkt.source_context_json ->> 'listing_id',
        ''
      )), '') as packet_listing_id
    from public.private_listings pl
    join public.document_packets pkt on pkt.id = pl.mandate_packet_id
    where nullif(trim(coalesce(
        pkt.source_context_json ->> 'privateListingId',
        pkt.source_context_json ->> 'private_listing_id',
        pkt.source_context_json ->> 'listingId',
        pkt.source_context_json ->> 'listing_id',
        ''
      )), '') is not null
      and nullif(trim(coalesce(
        pkt.source_context_json ->> 'privateListingId',
        pkt.source_context_json ->> 'private_listing_id',
        pkt.source_context_json ->> 'listingId',
        pkt.source_context_json ->> 'listing_id',
        ''
      )), '') <> pl.id::text
  ),
  private_listing_document_requirement_mismatches as (
    select
      doc.id as private_listing_document_id,
      doc.private_listing_id as document_private_listing_id,
      doc.requirement_id,
      req.private_listing_id as requirement_private_listing_id
    from public.private_listing_documents doc
    join public.private_listing_document_requirements req on req.id = doc.requirement_id
    where req.private_listing_id <> doc.private_listing_id
  ),
  private_listing_documents_missing_file_reference as (
    select doc.id, doc.private_listing_id, doc.requirement_id, doc.document_type, doc.document_name
    from public.private_listing_documents doc
    where nullif(trim(coalesce(doc.storage_path, '')), '') is null
      and nullif(trim(coalesce(doc.file_url, '')), '') is null
  ),
  private_listing_documents_pending_transaction_promotion as (
    select
      doc.id as private_listing_document_id,
      doc.private_listing_id,
      resolved.transaction_id,
      doc.pending_transaction_promotion,
      doc.promoted_transaction_id,
      doc.promoted_document_id
    from public.private_listing_documents doc
    join lateral (
      select public.bridge_resolve_private_listing_transaction_id(doc.private_listing_id) as transaction_id
    ) resolved on true
    where coalesce(doc.pending_transaction_promotion, false) = true
      or (resolved.transaction_id is not null and doc.promoted_document_id is null)
  ),
  private_listing_document_promotion_orphans as (
    select
      doc.id as private_listing_document_id,
      doc.private_listing_id,
      doc.promoted_transaction_id,
      doc.promoted_document_id
    from public.private_listing_documents doc
    left join public.transactions t on t.id = doc.promoted_transaction_id
    left join public.documents shared_doc on shared_doc.id = doc.promoted_document_id
    where (doc.promoted_transaction_id is not null and t.id is null)
       or (doc.promoted_document_id is not null and shared_doc.id is null)
  ),
  private_listing_document_promotion_mismatches as (
    select
      doc.id as private_listing_document_id,
      doc.private_listing_id,
      doc.promoted_transaction_id,
      doc.promoted_document_id,
      shared_doc.transaction_id as shared_transaction_id,
      shared_doc.source,
      shared_doc.source_document_id
    from public.private_listing_documents doc
    join public.documents shared_doc on shared_doc.id = doc.promoted_document_id
    where coalesce(shared_doc.source, '') <> 'seller_portal'
       or shared_doc.source_document_id <> doc.id
       or (
         doc.promoted_transaction_id is not null
         and shared_doc.transaction_id <> doc.promoted_transaction_id
       )
  ),
  duplicate_promoted_seller_documents as (
    select
      shared_doc.transaction_id,
      shared_doc.source_document_id,
      count(*) as shared_document_count,
      jsonb_agg(shared_doc.id order by shared_doc.created_at) as shared_document_ids
    from public.documents shared_doc
    where shared_doc.source = 'seller_portal'
      and shared_doc.source_document_id is not null
    group by shared_doc.transaction_id, shared_doc.source_document_id
    having count(*) > 1
  ),
  required_private_listing_documents_missing_upload as (
    select
      req.id as requirement_id,
      req.private_listing_id,
      req.requirement_key,
      req.status
    from public.private_listing_document_requirements req
    left join public.private_listing_documents doc on doc.requirement_id = req.id
    where coalesce(req.is_required, true) = true
      and req.status not in ('uploaded', 'approved', 'completed', 'not_applicable')
      and doc.id is null
  )
  select jsonb_build_object(
    'listing_mandate_packet_orphans', jsonb_build_object(
      'count', (select count(*) from listing_mandate_packet_orphans),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.private_listing_id) from (select * from listing_mandate_packet_orphans limit 10) row), '[]'::jsonb)
    ),
    'lead_mandate_packet_orphans', jsonb_build_object(
      'count', (select count(*) from lead_mandate_packet_orphans),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.lead_id) from (select * from lead_mandate_packet_orphans limit 10) row), '[]'::jsonb)
    ),
    'mandate_packet_listing_mismatches', jsonb_build_object(
      'count', (select count(*) from mandate_packet_listing_mismatches),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.private_listing_id) from (select * from mandate_packet_listing_mismatches limit 10) row), '[]'::jsonb)
    ),
    'private_listing_document_requirement_mismatches', jsonb_build_object(
      'count', (select count(*) from private_listing_document_requirement_mismatches),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.private_listing_document_id) from (select * from private_listing_document_requirement_mismatches limit 10) row), '[]'::jsonb)
    ),
    'private_listing_documents_missing_file_reference', jsonb_build_object(
      'count', (select count(*) from private_listing_documents_missing_file_reference),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from (select * from private_listing_documents_missing_file_reference limit 10) row), '[]'::jsonb)
    ),
    'private_listing_documents_pending_transaction_promotion', jsonb_build_object(
      'count', (select count(*) from private_listing_documents_pending_transaction_promotion),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.private_listing_document_id) from (select * from private_listing_documents_pending_transaction_promotion limit 10) row), '[]'::jsonb)
    ),
    'private_listing_document_promotion_orphans', jsonb_build_object(
      'count', (select count(*) from private_listing_document_promotion_orphans),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.private_listing_document_id) from (select * from private_listing_document_promotion_orphans limit 10) row), '[]'::jsonb)
    ),
    'private_listing_document_promotion_mismatches', jsonb_build_object(
      'count', (select count(*) from private_listing_document_promotion_mismatches),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.private_listing_document_id) from (select * from private_listing_document_promotion_mismatches limit 10) row), '[]'::jsonb)
    ),
    'duplicate_promoted_seller_documents', jsonb_build_object(
      'count', (select count(*) from duplicate_promoted_seller_documents),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.source_document_id) from (select * from duplicate_promoted_seller_documents limit 10) row), '[]'::jsonb)
    ),
    'required_private_listing_documents_missing_upload', jsonb_build_object(
      'count', (select count(*) from required_private_listing_documents_missing_upload),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.requirement_id) from (select * from required_private_listing_documents_missing_upload limit 10) row), '[]'::jsonb)
    )
  )
  into v_report;

  return v_report;
end;
$$;

comment on function public.bridge_private_listing_document_continuity_report()
  is 'Service-only diagnostic report for Seller Lead to Listing document continuity, mandate packet linkage, and seller upload transaction-promotion integrity.';

revoke all on function public.bridge_private_listing_document_continuity_report() from public;
revoke all on function public.bridge_private_listing_document_continuity_report() from anon;
revoke all on function public.bridge_private_listing_document_continuity_report() from authenticated;
grant execute on function public.bridge_private_listing_document_continuity_report() to service_role;

notify pgrst, 'reload schema';

commit;
