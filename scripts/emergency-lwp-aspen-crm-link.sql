-- Link the existing LWP website inventory for Aspen Sanders to the active
-- Aspen CRM profile. This is intentionally an update-only repair: it neither
-- creates listings nor alters their website publication records.
begin;

update public.private_listings
set
  assigned_agent_id = '74250273-18a5-4e45-b6e0-2dcb4a25440b'::uuid,
  assigned_agent_email = 'aspen@lwp.co.za'
where organisation_id = '7d7c9fc1-c38b-4f83-a508-c659975f985f'::uuid
  and listing_reference like 'LWP-ASPEN-%'
  and assigned_agent_id is null;

commit;
