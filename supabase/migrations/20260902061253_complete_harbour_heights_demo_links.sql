-- Complete the Harbour Heights demonstration links after the baseline repair.
-- Existing rows are restricted to explicitly flagged demo data.

with targets as (
  select id, organisation_id
  from public.developments
  where name = 'Harbour Heights Residences'
    and code like 'DEMO-%'
)
update public.private_listings listing
set
  listing_status = case
    when listing.listing_status in ('active', 'under_offer', 'sold') then listing.listing_status
    else 'active'
  end,
  listing_visibility = 'active_market',
  bridge_listing_status = case
    when listing.bridge_listing_status = 'published' then 'published'
    else 'draft'
  end,
  updated_at = now()
from targets target
where listing.development_id = target.id
  and listing.is_demo_data = true;

with targets as (
  select id, organisation_id
  from public.developments
  where name = 'Harbour Heights Residences'
    and code like 'DEMO-%'
), seeded_leads as (
  select
    target.id as development_id,
    target.organisation_id as developer_org_id,
    lead.lead_id as source_lead_id,
    lead.assigned_agent_id,
    lead.budget as budget_max,
    lead.min_budget as budget_min,
    coalesce(nullif(lead.property_interest, ''), 'Harbour Heights residence') as unit_type_interest,
    coalesce(nullif(lead.notes, ''), 'Seed lead linked to Harbour Heights Residences.') as protected_summary,
    case
      when lead.stage in ('qualified', 'viewing', 'offer', 'negotiation') then 'qualified'
      when lead.stage in ('contacted', 'attempted_contact') then 'contacted'
      else 'new'
    end as lead_status
  from public.leads lead
  join targets target on target.organisation_id = lead.organisation_id
  where lead.is_demo_data = true
)
insert into public.developer_leads (
  developer_org_id, source_agency_org_id, source_agent_user_id,
  assigned_agent_id, source_lead_id, primary_development_id,
  ownership_model, lead_owner, selling_model, visibility_state,
  reservation_state, lead_status, lead_source, budget_min, budget_max,
  unit_type_interest, protected_summary, qualification_note
)
select
  seeded.developer_org_id, seeded.developer_org_id, seeded.assigned_agent_id,
  seeded.assigned_agent_id, seeded.source_lead_id, seeded.development_id,
  'developer_direct', 'developer', 'developer_led', 'full',
  'none', seeded.lead_status, 'developer_direct', seeded.budget_min,
  seeded.budget_max, seeded.unit_type_interest, seeded.protected_summary,
  'Linked from the organisation’s Harbour Heights demo lead.'
from seeded_leads seeded
where not exists (
  select 1
  from public.developer_leads existing
  where existing.source_lead_id = seeded.source_lead_id
    and existing.primary_development_id = seeded.development_id
);

with targets as (
  select id, organisation_id
  from public.developments
  where name = 'Harbour Heights Residences'
    and code like 'DEMO-%'
)
insert into public.developer_lead_development_interests (
  developer_lead_interest_id, developer_lead_id, developer_org_id,
  development_id, interest_rank, interest_status, is_primary
)
select gen_random_uuid(), lead.developer_lead_id, lead.developer_org_id,
  target.id, 1, 'interested', true
from public.developer_leads lead
join targets target on target.organisation_id = lead.developer_org_id
where lead.primary_development_id = target.id
  and not exists (
    select 1
    from public.developer_lead_development_interests interest
    where interest.developer_lead_id = lead.developer_lead_id
      and interest.development_id = target.id
      and interest.unit_id is null
  );
