alter table if exists public.leads
  add column if not exists lead_category text;

update public.leads
set lead_category = case
  when lower(coalesce(lead_category, '')) in ('seller', 'seller_lead', 'sell', 'vendor', 'landlord', 'landlord_lead') then 'seller'
  when lower(coalesce(lead_category, '')) in ('buyer', 'buyer_lead', 'buy', 'purchaser') then 'buyer'
  when lower(coalesce(lead_category, '')) = 'other' then 'other'
  when nullif(trim(coalesce(seller_property_address, '')), '') is not null then 'seller'
  when coalesce(estimated_value, 0) > 0 then 'seller'
  when nullif(trim(coalesce(mandate_packet_id::text, '')), '') is not null then 'seller'
  when nullif(trim(coalesce(seller_onboarding_token, '')), '') is not null then 'seller'
  when nullif(trim(coalesce(seller_onboarding_status, '')), '') is not null then 'seller'
  when nullif(trim(coalesce(listing_id::text, '')), '') is not null
    and lower(coalesce(lead_source, '')) similar to '%(valuation|list my property|seller|canvassing|guided onboarding|private listing)%' then 'seller'
  when lower(coalesce(lead_source, '')) similar to '%(valuation|list my property|seller onboarding|seller referral|canvassing|expired listing|valuation campaign|owner database)%' then 'seller'
  when lower(coalesce(lead_source, '')) similar to '%(property24|private property|website property enquiry|whatsapp property enquiry|buyer referral|property enquiry|viewing request)%' then 'buyer'
  else 'other'
end
where lead_category is null
  or lower(coalesce(lead_category, '')) not in ('buyer', 'seller', 'other')
  or lead_category <> lower(lead_category);

update public.leads
set lead_category = 'other'
where lead_category is null or trim(lead_category) = '';

alter table if exists public.leads
  alter column lead_category set default 'other';

alter table if exists public.leads
  alter column lead_category set not null;

alter table if exists public.leads
  drop constraint if exists leads_lead_category_s1_check;

alter table if exists public.leads
  add constraint leads_lead_category_s1_check
  check (lead_category in ('buyer', 'seller', 'other'));

create index if not exists leads_category_s1_idx
  on public.leads (organisation_id, lead_category, stage);
