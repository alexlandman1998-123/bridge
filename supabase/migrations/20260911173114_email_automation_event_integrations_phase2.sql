begin;

-- CRM leads are the canonical listing-enquiry source. Resolve only the
-- existing email-marketing projection; this never creates a marketable contact
-- or bypasses its consent state.
create or replace function public.email_automation_lead_listing_enquiry_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.enquired_listing_id is null or (tg_op = 'UPDATE' and new.enquired_listing_id is not distinct from old.enquired_listing_id) then return new; end if;
  insert into public.email_automation_events (organisation_id, contact_id, event_key, payload)
  select c.organisation_id, c.id, 'listing_enquiry', jsonb_build_object('lead_id', new.lead_id, 'listing_id', new.enquired_listing_id)
  from public.email_marketing_contacts c
  where c.organisation_id = new.organisation_id and c.source_id = new.contact_id;
  return new;
end $$;
drop trigger if exists email_automation_lead_listing_enquiry_event_trigger on public.leads;
create trigger email_automation_lead_listing_enquiry_event_trigger
after insert or update of enquired_listing_id on public.leads
for each row execute function public.email_automation_lead_listing_enquiry_event();

-- A price-reduction event is emitted only for contacts who previously enquired
-- about that exact listing, not the agency's entire audience.
create or replace function public.email_automation_listing_price_reduction_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.asking_price is null or new.asking_price is null or new.asking_price >= old.asking_price then return new; end if;
  insert into public.email_automation_events (organisation_id, contact_id, event_key, payload)
  select distinct c.organisation_id, c.id, 'price_reduction',
    jsonb_build_object('listing_id', new.listing_id, 'previous_price', old.asking_price, 'new_price', new.asking_price)
  from public.leads l
  join public.email_marketing_contacts c on c.organisation_id = l.organisation_id and c.source_id = l.contact_id
  where l.enquired_listing_id = new.listing_id;
  return new;
end $$;
drop trigger if exists email_automation_listing_price_reduction_event_trigger on public.listing_publication_data;
create trigger email_automation_listing_price_reduction_event_trigger
after update of asking_price on public.listing_publication_data
for each row execute function public.email_automation_listing_price_reduction_event();

revoke all on function public.email_automation_lead_listing_enquiry_event(), public.email_automation_listing_price_reduction_event() from public, anon, authenticated;
commit;
