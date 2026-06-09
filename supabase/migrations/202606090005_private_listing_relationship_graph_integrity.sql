begin;

do $$
begin
  if to_regclass('public.private_listings') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'private_listings'
        and column_name = 'seller_profile_id'
        and udt_name = 'uuid'
    ) then
      create index if not exists private_listings_seller_profile_id_idx
        on public.private_listings(seller_profile_id)
        where seller_profile_id is not null;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'private_listings'
        and column_name = 'property_profile_id'
        and udt_name = 'uuid'
    ) then
      create index if not exists private_listings_property_profile_id_idx
        on public.private_listings(property_profile_id)
        where property_profile_id is not null;
    end if;
  end if;

  if to_regclass('public.leads') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'leads'
         and column_name = 'converted_transaction_id'
         and udt_name = 'uuid'
     )
  then
    create index if not exists leads_converted_transaction_id_idx
      on public.leads(converted_transaction_id)
      where converted_transaction_id is not null;
  end if;
end;
$$;

create or replace function public.bridge_private_listing_relationship_graph_integrity_report()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uuid_regex constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  v_report jsonb;
begin
  with
  lead_listing_organisation_mismatches as (
    select l.lead_id, l.organisation_id as lead_organisation_id, l.listing_id, pl.organisation_id as listing_organisation_id
    from public.leads l
    join public.private_listings pl on pl.id = l.listing_id
    where l.organisation_id <> pl.organisation_id
  ),
  transaction_listing_organisation_mismatches as (
    select t.id as transaction_id, t.organisation_id as transaction_organisation_id, t.listing_id, pl.organisation_id as listing_organisation_id
    from public.transactions t
    join public.private_listings pl on pl.id = t.listing_id
    where t.organisation_id <> pl.organisation_id
  ),
  private_listing_originating_lead_organisation_mismatches as (
    select pl.id as private_listing_id, pl.organisation_id as listing_organisation_id, l.lead_id, l.organisation_id as lead_organisation_id
    from public.private_listings pl
    join lateral (
      select nullif(trim(pl.originating_crm_lead_id), '') as lead_id_text
      where nullif(trim(pl.originating_crm_lead_id), '') ~* v_uuid_regex
    ) lead_link on true
    join public.leads l on l.lead_id = lead_link.lead_id_text::uuid
    where l.organisation_id <> pl.organisation_id
  ),
  private_listing_seller_lead_organisation_mismatches as (
    select pl.id as private_listing_id, pl.organisation_id as listing_organisation_id, l.lead_id, l.organisation_id as lead_organisation_id
    from public.private_listings pl
    join lateral (
      select nullif(trim(pl.seller_lead_id), '') as lead_id_text
      where nullif(trim(pl.seller_lead_id), '') ~* v_uuid_regex
    ) lead_link on true
    join public.leads l on l.lead_id = lead_link.lead_id_text::uuid
    where l.organisation_id <> pl.organisation_id
  ),
  lead_contact_organisation_mismatches as (
    select l.lead_id, l.organisation_id as lead_organisation_id, l.contact_id, c.organisation_id as contact_organisation_id
    from public.leads l
    join public.contacts c on c.contact_id = l.contact_id
    where l.organisation_id <> c.organisation_id
  ),
  transaction_seller_contact_organisation_mismatches as (
    select t.id as transaction_id, t.organisation_id as transaction_organisation_id, t.seller_contact_id, c.organisation_id as contact_organisation_id
    from public.transactions t
    join public.contacts c on c.contact_id = t.seller_contact_id
    where t.organisation_id <> c.organisation_id
  ),
  listing_mandate_packet_organisation_mismatches as (
    select pl.id as private_listing_id, pl.organisation_id as listing_organisation_id, pl.mandate_packet_id, pkt.organisation_id as packet_organisation_id
    from public.private_listings pl
    join public.document_packets pkt on pkt.id = pl.mandate_packet_id
    where pl.organisation_id <> pkt.organisation_id
  ),
  lead_mandate_packet_organisation_mismatches as (
    select l.lead_id, l.organisation_id as lead_organisation_id, l.mandate_packet_id, pkt.organisation_id as packet_organisation_id
    from public.leads l
    join public.document_packets pkt on pkt.id = l.mandate_packet_id
    where l.organisation_id <> pkt.organisation_id
  ),
  listing_seller_profile_unresolved_links as (
    select pl.id as private_listing_id, pl.organisation_id, pl.seller_profile_id
    from public.private_listings pl
    left join public.contacts c on c.contact_id = pl.seller_profile_id
    left join public.profiles p on p.id = pl.seller_profile_id
    where pl.seller_profile_id is not null
      and c.contact_id is null
      and p.id is null
  ),
  listing_property_profile_unresolved_links as (
    select pl.id as private_listing_id, pl.organisation_id, pl.property_profile_id
    from public.private_listings pl
    where pl.property_profile_id is not null
      and to_regclass('public.property_profiles') is null
  ),
  lead_transaction_listing_mismatches as (
    select l.lead_id, l.organisation_id, l.listing_id as lead_listing_id, l.converted_transaction_id, t.listing_id as transaction_listing_id
    from public.leads l
    join public.transactions t on t.id = l.converted_transaction_id
    where l.listing_id is not null
      and t.listing_id is not null
      and l.listing_id <> t.listing_id
  ),
  transactions_without_listing_backlink_to_lead as (
    select t.id as transaction_id, t.organisation_id, t.listing_id
    from public.transactions t
    join public.private_listings pl on pl.id = t.listing_id
    where t.listing_id is not null
      and not exists (
        select 1
        from public.leads l
        where l.organisation_id = t.organisation_id
          and (
            l.listing_id = t.listing_id
            or l.lead_id::text = nullif(trim(pl.originating_crm_lead_id), '')
            or l.lead_id::text = nullif(trim(pl.seller_lead_id), '')
          )
      )
  ),
  duplicate_transactions_per_listing as (
    select t.organisation_id, t.listing_id, count(*) as transaction_count, jsonb_agg(t.id order by t.created_at) as transaction_ids
    from public.transactions t
    where t.listing_id is not null
    group by t.organisation_id, t.listing_id
    having count(*) > 1
  )
  select jsonb_build_object(
    'lead_listing_organisation_mismatches', jsonb_build_object(
      'count', (select count(*) from lead_listing_organisation_mismatches),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.lead_id) from (select * from lead_listing_organisation_mismatches limit 10) row), '[]'::jsonb)
    ),
    'transaction_listing_organisation_mismatches', jsonb_build_object(
      'count', (select count(*) from transaction_listing_organisation_mismatches),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.transaction_id) from (select * from transaction_listing_organisation_mismatches limit 10) row), '[]'::jsonb)
    ),
    'private_listing_originating_lead_organisation_mismatches', jsonb_build_object(
      'count', (select count(*) from private_listing_originating_lead_organisation_mismatches),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.private_listing_id) from (select * from private_listing_originating_lead_organisation_mismatches limit 10) row), '[]'::jsonb)
    ),
    'private_listing_seller_lead_organisation_mismatches', jsonb_build_object(
      'count', (select count(*) from private_listing_seller_lead_organisation_mismatches),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.private_listing_id) from (select * from private_listing_seller_lead_organisation_mismatches limit 10) row), '[]'::jsonb)
    ),
    'lead_contact_organisation_mismatches', jsonb_build_object(
      'count', (select count(*) from lead_contact_organisation_mismatches),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.lead_id) from (select * from lead_contact_organisation_mismatches limit 10) row), '[]'::jsonb)
    ),
    'transaction_seller_contact_organisation_mismatches', jsonb_build_object(
      'count', (select count(*) from transaction_seller_contact_organisation_mismatches),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.transaction_id) from (select * from transaction_seller_contact_organisation_mismatches limit 10) row), '[]'::jsonb)
    ),
    'listing_mandate_packet_organisation_mismatches', jsonb_build_object(
      'count', (select count(*) from listing_mandate_packet_organisation_mismatches),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.private_listing_id) from (select * from listing_mandate_packet_organisation_mismatches limit 10) row), '[]'::jsonb)
    ),
    'lead_mandate_packet_organisation_mismatches', jsonb_build_object(
      'count', (select count(*) from lead_mandate_packet_organisation_mismatches),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.lead_id) from (select * from lead_mandate_packet_organisation_mismatches limit 10) row), '[]'::jsonb)
    ),
    'listing_seller_profile_unresolved_links', jsonb_build_object(
      'count', (select count(*) from listing_seller_profile_unresolved_links),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.private_listing_id) from (select * from listing_seller_profile_unresolved_links limit 10) row), '[]'::jsonb)
    ),
    'listing_property_profile_unresolved_links', jsonb_build_object(
      'count', (select count(*) from listing_property_profile_unresolved_links),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.private_listing_id) from (select * from listing_property_profile_unresolved_links limit 10) row), '[]'::jsonb)
    ),
    'lead_transaction_listing_mismatches', jsonb_build_object(
      'count', (select count(*) from lead_transaction_listing_mismatches),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.lead_id) from (select * from lead_transaction_listing_mismatches limit 10) row), '[]'::jsonb)
    ),
    'transactions_without_listing_backlink_to_lead', jsonb_build_object(
      'count', (select count(*) from transactions_without_listing_backlink_to_lead),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.transaction_id) from (select * from transactions_without_listing_backlink_to_lead limit 10) row), '[]'::jsonb)
    ),
    'duplicate_transactions_per_listing', jsonb_build_object(
      'count', (select count(*) from duplicate_transactions_per_listing),
      'sample', coalesce((select jsonb_agg(to_jsonb(row) order by row.listing_id) from (select * from duplicate_transactions_per_listing limit 10) row), '[]'::jsonb)
    )
  )
  into v_report;

  return v_report;
end;
$$;

comment on function public.bridge_private_listing_relationship_graph_integrity_report()
  is 'Service-only diagnostic report for Seller Lead to Listing graph integrity across organisations, contacts, mandate packets, profile compatibility links, and transaction backlinks.';

revoke all on function public.bridge_private_listing_relationship_graph_integrity_report() from public;
revoke all on function public.bridge_private_listing_relationship_graph_integrity_report() from anon;
revoke all on function public.bridge_private_listing_relationship_graph_integrity_report() from authenticated;
grant execute on function public.bridge_private_listing_relationship_graph_integrity_report() to service_role;

notify pgrst, 'reload schema';

commit;
