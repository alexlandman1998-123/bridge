begin;

-- Extend the existing public-only JSON contracts without reclassifying saved
-- legacy values as public-source facts. Application preparation guards require
-- a refreshed, confirmed record; old drafts remain readable and structurally
-- valid so their wording can be reviewed before an explicit refresh.
-- Depends on property builders 20261023132334 and the latest general builder
-- validator/goal constraint in 20261025204945_business_campaign_ai.sql.
create function public.marketing_campaign_contact_provenance_valid(value jsonb, effective_source jsonb, fields text[])
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare field text; item jsonb; expected text;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>60000
    or not(value ?& array['version','source','overrides','confirmed'])
    or value->'version' is distinct from '1'::jsonb
    or value->'confirmed' is distinct from 'true'::jsonb
    or jsonb_typeof(value->'source') is distinct from 'object'
    or jsonb_typeof(value->'overrides') is distinct from 'object' then return false; end if;
  for field in select jsonb_object_keys(value) loop
    if field not in ('version','source','overrides','confirmed') then return false; end if;
  end loop;
  if not(value->'source' ?& fields) then return false; end if;
  for field,item in select * from jsonb_each(value->'source') union all select * from jsonb_each(value->'overrides') loop
    if not(field=any(fields)) or jsonb_typeof(item) is distinct from 'string'
      or length(item#>>'{}')>6000 or item#>>'{}'<>btrim(item#>>'{}') then return false; end if;
  end loop;
  foreach field in array fields loop
    expected:=case when value->'overrides' ? field then value#>>array['overrides',field] else value#>>array['source',field] end;
    if coalesce(effective_source->>field,'') is distinct from expected then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.marketing_campaign_contact_provenance_valid(jsonb,jsonb,text[]) from public,anon;
grant execute on function public.marketing_campaign_contact_provenance_valid(jsonb,jsonb,text[]) to authenticated,service_role;

alter function public.marketing_listing_builder_valid(jsonb) rename to marketing_listing_builder_before_contacts_valid;
create function public.marketing_listing_builder_valid(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare proxy jsonb; item jsonb;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>180000 then return false; end if;
  proxy:=value-'contactProvenance';
  if value->'version'='2'::jsonb then
    if jsonb_typeof(value->'additionalListings') is distinct from 'array' then return false; end if;
    proxy:=jsonb_set(proxy,'{additionalListings}',coalesce((select jsonb_agg(member-'contactProvenance') from jsonb_array_elements(value->'additionalListings') member),'[]'::jsonb));
  end if;
  if public.marketing_listing_builder_before_contacts_valid(proxy) is distinct from true then return false; end if;
  for item in select value union all select * from jsonb_array_elements(coalesce(value->'additionalListings','[]'::jsonb)) loop
    if public.marketing_campaign_contact_provenance_valid(item->'contactProvenance',item->'source',array['agentName','agentEmail','agentPhone','destination']) is distinct from true then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.marketing_listing_builder_valid(jsonb) from public,anon;
grant execute on function public.marketing_listing_builder_valid(jsonb) to authenticated,service_role;
alter table public.marketing_campaigns drop constraint marketing_listing_builder_valid;
alter table public.marketing_campaigns add constraint marketing_listing_builder_valid check (
  public.marketing_listing_builder_valid(listing_builder) and (listing_builder is null or (status='draft' and goal=case when listing_builder->>'template'='just-sold' then 'seller_leads' else 'promote_listing' end))
);

alter function public.marketing_general_builder_valid(jsonb) rename to marketing_general_builder_before_contacts_valid;
create function public.marketing_general_builder_valid(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) is distinct from 'object' or octet_length(value::text)>60000 then return false; end if;
  return public.marketing_general_builder_before_contacts_valid(value-'contactProvenance') is true
    and public.marketing_campaign_contact_provenance_valid(value->'contactProvenance',value->'source',array['agentName','destination']) is true;
end $$;
revoke all on function public.marketing_general_builder_valid(jsonb) from public,anon;
grant execute on function public.marketing_general_builder_valid(jsonb) to authenticated,service_role;
alter table public.marketing_campaigns drop constraint marketing_general_builder_valid;
alter table public.marketing_campaigns add constraint marketing_general_builder_valid check (
 public.marketing_general_builder_valid(campaign_builder) and (campaign_builder is null or (
 listing_builder is null and status='draft'
 and (campaign_builder->>'template'<>'review-request' or (planned_channels <@ array['email','whatsapp']::text[] and planned_channels @> array['email','whatsapp']::text[] and not(channel_content ? 'social')))
 and goal=case
 when campaign_builder->>'template' in ('sellers','thinking-of-selling','buyer-demand') then 'seller_leads'
 when campaign_builder->>'template' in ('buyers','first-time-buyer') then 'buyer_leads'
 when campaign_builder->>'template' in ('key-handover','review-request','referral-request','client-check-in') then 'reengage' else 'custom' end))
);
notify pgrst,'reload schema';
commit;
