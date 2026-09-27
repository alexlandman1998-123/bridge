begin;

-- A developer's own Property24 listing is a direct lead, even when an agent
-- in that same organisation handled the portal listing. Keep external agency
-- introductions protected by requiring the two organisation IDs to match.
with reclassified as (
  update public.developer_leads
  set lead_owner = 'developer',
      ownership_model = 'developer_direct',
      visibility_state = 'full',
      updated_at = now()
  where lead_source = 'Property24 development enquiry'
    and lead_owner = 'agency'
    and ownership_model = 'agency_introduced'
    and source_agency_org_id = developer_org_id
  returning developer_lead_id
)
update public.developer_lead_private_details details
set handover_source = 'developer',
    updated_at = now()
where details.developer_lead_id in (select developer_lead_id from reclassified)
  and details.handover_source = 'agency';

commit;
