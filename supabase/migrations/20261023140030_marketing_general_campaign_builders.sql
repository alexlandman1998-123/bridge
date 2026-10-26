begin;
-- Marketing-only public snapshots; existing campaign RLS and revision rules apply.
alter table public.marketing_campaigns add column campaign_builder jsonb;
create function public.marketing_general_builder_valid(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare field text; item jsonb; details jsonb; allowed text[]; family text;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value)<>'object' or value->'version' is distinct from '1'::jsonb or octet_length(value::text)>40000 then return false; end if;
  if not(value ?& array['version','template','agentId','source','details','reviewed','permission']) then return false; end if;
  for field in select jsonb_object_keys(value) loop
    if field not in ('version','template','agentId','source','details','reviewed','permission') then return false; end if;
  end loop;
  family:=value->>'template';
  if family not in ('sellers','thinking-of-selling','buyer-demand','buyers','first-time-buyer','meet-your-agent','client-success','market-update') then return false; end if;
  if jsonb_typeof(value->'template')<>'string' or jsonb_typeof(value->'agentId')<>'string' or value->>'agentId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  if value->'reviewed' is distinct from 'true'::jsonb or jsonb_typeof(value->'permission')<>'boolean' then return false; end if;
  if family in ('buyer-demand','client-success') and value->'permission' is distinct from 'true'::jsonb then return false; end if;
  if jsonb_typeof(value->'source')<>'object' or jsonb_typeof(value->'details')<>'object' then return false; end if;
  for field,item in select * from jsonb_each(value->'source') loop
    if field not in ('agencyName','agentName','agentTitle','agentBio','destination','serviceAreas','language','setupLanguage','tone','primaryColor','logoUrl','photoUrl') or jsonb_typeof(item)<>'string' or length(item #>> '{}')>2048 then return false; end if;
    if field in ('logoUrl','photoUrl') and item #>> '{}'<>'' and item #>> '{}' !~ '^https://[^/@?#[:space:]]+([/?#][^[:space:]]*)?$' then return false; end if;
  end loop;
  if coalesce(btrim(value#>>'{source,agencyName}'),'')='' or coalesce(btrim(value#>>'{source,agentName}'),'')='' or coalesce(btrim(value#>>'{source,destination}'),'')='' or coalesce(value#>>'{source,language}','') not in ('en-ZA','af-ZA') then return false; end if;
  if family='meet-your-agent' and coalesce(value#>>'{source,photoUrl}','')='' then return false; end if;
  allowed:=case family
    when 'sellers' then array['offer'] when 'thinking-of-selling' then array['checklist']
    when 'buyer-demand' then array['brief','briefExpires'] when 'buyers' then array[]::text[]
    when 'first-time-buyer' then array['checklist'] when 'meet-your-agent' then array['bio']
    when 'client-success' then array['quote','attribution','context']
    when 'market-update' then array['summary','period','reportSource','reportDate'] end;
  details:=value->'details';
  if not(details ?& (allowed || array['area'])) then return false; end if;
  for field,item in select * from jsonb_each(details) loop
    if not(field=any(allowed || array['area'])) or jsonb_typeof(item)<>'string' or length(btrim(item #>> '{}'))=0 or length(item #>> '{}')>(case when field in ('area','attribution','period') then 120 when field in ('offer','reportSource') then 600 when field in ('briefExpires','reportDate') then 10 else 2000 end) then return false; end if;
  end loop;
  if family in ('buyer-demand','market-update') then
    field:=case when family='buyer-demand' then 'briefExpires' else 'reportDate' end;
    if details->>field !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
    begin perform (details->>field)::date; exception when others then return false; end;
  end if;
  return true;
end $$;
revoke all on function public.marketing_general_builder_valid(jsonb) from public,anon;
grant execute on function public.marketing_general_builder_valid(jsonb) to authenticated,service_role;
alter table public.marketing_campaigns add constraint marketing_general_builder_valid check (
  public.marketing_general_builder_valid(campaign_builder) and (campaign_builder is null or (
    listing_builder is null and status='draft' and goal=case
      when campaign_builder->>'template' in ('sellers','thinking-of-selling','buyer-demand') then 'seller_leads'
      when campaign_builder->>'template' in ('buyers','first-time-buyer') then 'buyer_leads' else 'custom' end
  ))
);
create function public.marketing_general_builder_scope()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.campaign_builder is null then return new; end if;
  if not public.marketing_general_builder_valid(new.campaign_builder) then raise exception 'Invalid public campaign draft.' using errcode='22023'; end if;
  if new.campaign_builder->>'agentId'<>(select auth.uid())::text and not public.email_campaign_can_send(new.organisation_id) then raise exception 'Use your own agent profile for this campaign.' using errcode='42501'; end if;
  if new.campaign_builder->>'template'='buyer-demand' and ((new.campaign_builder#>>'{details,briefExpires}')||'T23:59:59+02:00')::timestamptz<=now() then raise exception 'The confirmed buyer search expired.' using errcode='22023'; end if;
  if new.campaign_builder->>'template'='market-update' and ((new.campaign_builder#>>'{details,reportDate}')||'T00:00:00+02:00')::timestamptz>now() then raise exception 'Report publication date cannot be in the future.' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function public.marketing_general_builder_scope() from public,anon;
grant execute on function public.marketing_general_builder_scope() to authenticated,service_role;
create trigger marketing_general_builder_scope before insert or update on public.marketing_campaigns for each row execute function public.marketing_general_builder_scope();
grant insert(campaign_builder),update(campaign_builder) on public.marketing_campaigns to authenticated;
notify pgrst,'reload schema';
commit;
