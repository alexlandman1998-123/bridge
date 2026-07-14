begin;

create or replace function public.bridge_attorney_pre_instruction_pipeline(
  p_firm_id uuid default null
)
returns table (
  allocation_id uuid,
  private_listing_id uuid,
  firm_id uuid,
  partner_organisation_id uuid,
  agency_organisation_id uuid,
  listing_reference text,
  property_label text,
  seller_name text,
  asking_price numeric,
  assigned_agent_name text,
  assigned_agent_email text,
  allocation_status text,
  mandate_packet_id uuid,
  mandate_signed_at timestamptz,
  selected_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_firm public.attorney_firms%rowtype;
begin
  select firm.*
    into v_firm
  from public.attorney_firms firm
  join public.attorney_firm_members member
    on member.firm_id = firm.id
   and member.user_id = auth.uid()
   and member.status = 'active'
  where firm.is_active = true
    and firm.organisation_id is not null
    and (p_firm_id is null or firm.id = p_firm_id)
  order by case when firm.id = p_firm_id then 0 else 1 end, member.joined_at desc nulls last
  limit 1;

  if v_firm.id is null then
    raise exception 'An active attorney-firm membership is required.';
  end if;

  return query
  select
    allocation.id as allocation_id,
    listing.id as private_listing_id,
    v_firm.id as firm_id,
    allocation.partner_organisation_id,
    listing.organisation_id as agency_organisation_id,
    coalesce(nullif(trim(listing.listing_reference), ''), 'PL-' || upper(substr(listing.id::text, 1, 8))) as listing_reference,
    coalesce(
      nullif(trim(listing.formatted_address), ''),
      nullif(trim(listing.street_address), ''),
      nullif(trim(listing.address_line_1), ''),
      nullif(trim(listing.title), ''),
      'Property pending'
    ) as property_label,
    coalesce(
      nullif(trim(listing.seller_canonical_facts_json #>> '{seller,fullName}'), ''),
      nullif(trim(listing.seller_canonical_facts_json #>> '{seller,full_name}'), ''),
      nullif(trim(listing.seller_canonical_facts_json #>> '{seller,name}'), ''),
      nullif(trim(listing.seller_canonical_facts_json ->> 'sellerFullName'), ''),
      nullif(trim(listing.seller_canonical_facts_json ->> 'seller_name'), ''),
      'Seller pending'
    ) as seller_name,
    coalesce(listing.asking_price, listing.estimated_value, 0) as asking_price,
    coalesce(
      nullif(trim(agent.full_name), ''),
      nullif(trim(concat_ws(' ', agent.first_name, agent.last_name)), ''),
      nullif(trim(agent.email), ''),
      nullif(trim(listing.assigned_agent_email), '')
    ) as assigned_agent_name,
    coalesce(nullif(trim(agent.email), ''), nullif(trim(listing.assigned_agent_email), '')) as assigned_agent_email,
    allocation.allocation_status,
    allocation.mandate_packet_id,
    allocation.mandate_signed_at,
    allocation.selected_at,
    allocation.updated_at
  from public.private_listing_role_players allocation
  join public.private_listings listing on listing.id = allocation.private_listing_id
  left join public.profiles agent on agent.id = listing.assigned_agent_id
  where allocation.partner_organisation_id = v_firm.organisation_id
    and allocation.role_type = 'transfer_attorney'
    and allocation.allocation_status = 'awaiting_buyer'
  order by coalesce(allocation.mandate_signed_at, allocation.selected_at) desc;
end;
$$;

revoke all on function public.bridge_attorney_pre_instruction_pipeline(uuid) from public;
grant execute on function public.bridge_attorney_pre_instruction_pipeline(uuid) to authenticated;

comment on function public.bridge_attorney_pre_instruction_pipeline(uuid) is
  'Phase 2 firm inbox projection for signed mandates allocated to a transfer attorney before a buyer or formal transfer instruction exists.';

drop policy if exists document_packets_allocated_transfer_attorney_select on public.document_packets;
create policy document_packets_allocated_transfer_attorney_select
on public.document_packets
for select
to authenticated
using (
  exists (
    select 1
    from public.private_listing_role_players allocation
    where allocation.mandate_packet_id = document_packets.id
      and allocation.role_type = 'transfer_attorney'
      and allocation.allocation_status = 'awaiting_buyer'
      and allocation.partner_organisation_id is not null
      and public.bridge_is_active_member(allocation.partner_organisation_id)
  )
);

drop policy if exists document_packet_versions_allocated_transfer_attorney_select on public.document_packet_versions;
create policy document_packet_versions_allocated_transfer_attorney_select
on public.document_packet_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.private_listing_role_players allocation
    where allocation.mandate_packet_id = document_packet_versions.packet_id
      and allocation.role_type = 'transfer_attorney'
      and allocation.allocation_status = 'awaiting_buyer'
      and allocation.partner_organisation_id is not null
      and public.bridge_is_active_member(allocation.partner_organisation_id)
  )
);

drop policy if exists document_packet_events_allocated_transfer_attorney_select on public.document_packet_events;
create policy document_packet_events_allocated_transfer_attorney_select
on public.document_packet_events
for select
to authenticated
using (
  exists (
    select 1
    from public.private_listing_role_players allocation
    where allocation.mandate_packet_id = document_packet_events.packet_id
      and allocation.role_type = 'transfer_attorney'
      and allocation.allocation_status = 'awaiting_buyer'
      and allocation.partner_organisation_id is not null
      and public.bridge_is_active_member(allocation.partner_organisation_id)
  )
);

drop policy if exists document_packet_signers_allocated_transfer_attorney_select on public.document_packet_signers;
create policy document_packet_signers_allocated_transfer_attorney_select
on public.document_packet_signers
for select
to authenticated
using (
  exists (
    select 1
    from public.private_listing_role_players allocation
    where allocation.mandate_packet_id = document_packet_signers.packet_id
      and allocation.role_type = 'transfer_attorney'
      and allocation.allocation_status = 'awaiting_buyer'
      and allocation.partner_organisation_id is not null
      and public.bridge_is_active_member(allocation.partner_organisation_id)
  )
);

drop policy if exists document_signing_fields_allocated_transfer_attorney_select on public.document_signing_fields;
create policy document_signing_fields_allocated_transfer_attorney_select
on public.document_signing_fields
for select
to authenticated
using (
  exists (
    select 1
    from public.private_listing_role_players allocation
    where allocation.mandate_packet_id = document_signing_fields.packet_id
      and allocation.role_type = 'transfer_attorney'
      and allocation.allocation_status = 'awaiting_buyer'
      and allocation.partner_organisation_id is not null
      and public.bridge_is_active_member(allocation.partner_organisation_id)
  )
);

commit;
