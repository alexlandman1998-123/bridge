begin;

-- Versioned public marketing projection only; existing campaign ownership and
-- optimistic revision policies continue to protect these drafts.
create function public.marketing_listing_builder_valid(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare field text; item jsonb;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value)<>'object' or octet_length(value::text)>30000 then return false; end if;
  if not (value ?& array['version','template','listingId','agentId','source']) then return false; end if;
  if value->'version'<>'1'::jsonb or value->>'template'<>'new-listing' then return false; end if;
  if jsonb_typeof(value->'listingId')<>'string' or value->>'listingId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  if jsonb_typeof(value->'agentId')<>'string' or (value->>'agentId'<>'' and value->>'agentId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return false; end if;
  for field in select jsonb_object_keys(value) loop
    if field not in ('version','template','listingId','agentId','source') then return false; end if;
  end loop;
  if jsonb_typeof(value->'source')<>'object' then return false; end if;
  for field,item in select * from jsonb_each(value->'source') loop
    if field not in ('title','price','location','facts','description','agencyName','agentName','agentEmail','agentPhone','destination','language','tone','primaryColor','imageId','listingUpdatedAt') or jsonb_typeof(item)<>'string' or length(item #>> '{}')>6000 then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.marketing_listing_builder_valid(jsonb) from public,anon;
grant execute on function public.marketing_listing_builder_valid(jsonb) to authenticated,service_role;
alter table public.marketing_campaigns add column listing_builder jsonb;
alter table public.marketing_campaigns add constraint marketing_listing_builder_valid check (
  public.marketing_listing_builder_valid(listing_builder)
  and (listing_builder is null or (status='draft' and goal='promote_listing'))
);
grant insert(listing_builder),update(listing_builder) on public.marketing_campaigns to authenticated;

create function public.marketing_campaign_listing_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.listing_builder is not null then
    if not public.marketing_listing_builder_valid(new.listing_builder) then raise exception 'Invalid listing draft.' using errcode='22023'; end if;
    -- Invoker SELECT honours listing RLS as well as agency identity.
    if not exists(select 1 from public.private_listings l where l.id=(new.listing_builder->>'listingId')::uuid and l.organisation_id=new.organisation_id
      and coalesce(l.assigned_agent_id::text,'')=new.listing_builder->>'agentId'
      and coalesce(l.listing_category,'')<>'rental'
      and coalesce(l.listing_status,'') not in ('sold','withdrawn','archived','deleted','under_offer','transaction_created')
      and (l.assigned_agent_id=(select auth.uid()) or public.email_campaign_can_send(new.organisation_id))) then
      raise exception 'The listing or assigned agent changed or is no longer available in this agency.' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.marketing_campaign_listing_scope() from public,anon,authenticated;
create trigger marketing_campaign_listing_scope before insert or update on public.marketing_campaigns for each row execute function public.marketing_campaign_listing_scope();
notify pgrst,'reload schema';
commit;
