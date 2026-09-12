begin;

-- Searchable enquiry signals are a compact, denormalised projection of the
-- client CRM. They support fast agency segmentation without copying clients.
alter table public.email_marketing_contacts
  add column if not exists enquiry_property_type text,
  add column if not exists highest_enquiry_price numeric(14,2) check (highest_enquiry_price is null or highest_enquiry_price >= 0);

create index if not exists email_marketing_contacts_enquiry_search_idx
  on public.email_marketing_contacts (organisation_id, enquiry_property_type, highest_enquiry_price)
  where is_valid_email;

-- The UI may use these keys when it converts a search result into a curated
-- list. Dispatch remains exact because static lists write contact_ids.
comment on column public.email_marketing_contacts.enquiry_property_type is 'Normalised property type from the client’s latest or highest-value enquiry.';
comment on column public.email_marketing_contacts.highest_enquiry_price is 'Highest asking price of a listing or unit the client enquired about.';

commit;
