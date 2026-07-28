begin;

create index if not exists contacts_org_contact_hot_path_idx
  on public.contacts (organisation_id, contact_id);

create index if not exists lead_activities_org_lead_activity_hot_path_idx
  on public.lead_activities (organisation_id, lead_id, activity_date desc, created_at desc)
  where lead_id is not null;

create index if not exists private_listings_org_seller_lead_hot_path_idx
  on public.private_listings (organisation_id, seller_lead_id, updated_at desc)
  where seller_lead_id is not null;

create index if not exists private_listings_org_originating_crm_lead_hot_path_idx
  on public.private_listings (organisation_id, originating_crm_lead_id, updated_at desc)
  where originating_crm_lead_id is not null;

commit;
