begin;
set local lock_timeout='5s';
-- Immutable selection travels with the purchase; the report query/price is unchanged.
alter table public.knowledge_factory_report_purchase_intents
  add column boundary_snapshot jsonb,
  add column target_seller_lead_id uuid references public.leads(lead_id);
create unique index knowledge_factory_one_property_per_seller_lead
  on public.knowledge_factory_property_seller_leads(organisation_id,lead_id);

create function public.knowledge_factory_validate_seller_target(p_org uuid,p_actor uuid,p_property bigint,p_lead uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m jsonb; l public.leads%rowtype; linked uuid; role_name text;
begin
  select to_jsonb(u) into m from public.organisation_users u where u.organisation_id=p_org and u.user_id=p_actor
    and lower(coalesce(nullif(u.membership_status,''),u.status))='active' limit 1;
  if m is null then raise exception 'Active membership required'; end if;
  role_name:=lower(coalesce(m->>'workspace_role',m->>'organization_role',m->>'organisation_role',m->>'role',''));
  select * into l from public.leads where lead_id=p_lead and organisation_id=p_org and lead_category='seller';
  if not found then raise exception 'Seller lead not found'; end if;
  if role_name not in ('principal','owner','director','admin','super_admin','agency_admin','administrator','superadmin','principal / owner')
    and coalesce(l.assigned_user_id,l.assigned_agent_id,l.created_by) is distinct from p_actor then raise exception 'Seller lead access denied'; end if;
  select lead_id into linked from public.knowledge_factory_property_seller_leads where organisation_id=p_org and property_id=p_property;
  if linked is not null and linked<>p_lead then raise exception 'Property already belongs to a different seller lead'; end if;
  if exists(select 1 from public.knowledge_factory_property_seller_leads where organisation_id=p_org and lead_id=p_lead and property_id<>p_property)
    or (coalesce(l.source_reference_id,'') like 'knowledge_factory:property:%' and l.source_reference_id<>'knowledge_factory:property:'||p_property::text)
    then raise exception 'Seller lead already belongs to another property'; end if;
  -- Never attach another property's documents through an inconsistent old link.
  if l.listing_id is not null and not exists(select 1 from public.private_listings pl where pl.id::text=l.listing_id and pl.organisation_id=p_org
    and (pl.seller_lead_id::text=p_lead::text or pl.originating_crm_lead_id::text=p_lead::text)) then raise exception 'Seller property link needs review'; end if;
  return jsonb_build_object('leadId',l.lead_id);
end $$;

create function public.knowledge_factory_seller_lead_options(p_org uuid,p_actor uuid,p_property bigint,p_search text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item record; accepted jsonb:='[]'::jsonb; linked uuid; m jsonb; role_name text;
begin
  select lead_id into linked from public.knowledge_factory_property_seller_leads where organisation_id=p_org and property_id=p_property;
  select to_jsonb(u) into m from public.organisation_users u where u.organisation_id=p_org and u.user_id=p_actor
    and lower(coalesce(nullif(u.membership_status,''),u.status))='active' limit 1;
  if m is null then raise exception 'Active membership required'; end if;
  role_name:=lower(coalesce(m->>'workspace_role',m->>'organization_role',m->>'organisation_role',m->>'role',''));
  for item in select l.lead_id,l.seller_property_address,c.first_name,c.last_name from public.leads l
    left join public.contacts c on c.contact_id=l.contact_id and c.organisation_id=p_org
    where l.organisation_id=p_org and l.lead_category='seller' and (linked is null or linked=l.lead_id)
      and (role_name in ('principal','owner','director','admin','super_admin','agency_admin','administrator','superadmin','principal / owner')
        or coalesce(l.assigned_user_id,l.assigned_agent_id,l.created_by)=p_actor)
      and (coalesce(p_search,'')='' or position(lower(left(p_search,120)) in lower(concat_ws(' ',c.first_name,c.last_name,l.seller_property_address)))>0)
    order by l.created_at desc limit 200
  loop
    begin
      perform public.knowledge_factory_validate_seller_target(p_org,p_actor,p_property,item.lead_id);
      accepted:=accepted||jsonb_build_array(jsonb_build_object('leadId',item.lead_id,'name',concat_ws(' ',item.first_name,item.last_name),'address',item.seller_property_address));
    exception when raise_exception then continue;
    end;
  end loop;
  return jsonb_build_object('linkedLeadId',linked,'items',accepted);
end $$;
create or replace function public.knowledge_factory_prepare_seller_filing(p_report_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  r public.knowledge_factory_report_results%rowtype;
  journey public.knowledge_factory_property_seller_leads%rowtype;
  filing public.knowledge_factory_report_seller_filings%rowtype;
  contact_id uuid; new_lead_id uuid; new_listing_id uuid; contact_name text;
  property jsonb; owners jsonb; form jsonb; membership jsonb; requester jsonb; actor_role text; target_id uuid; target_row public.leads%rowtype;
begin
  select * into r from public.knowledge_factory_report_results where id=p_report_id;
  if not found then raise exception 'Completed report not found'; end if;
  select to_jsonb(u) into membership from public.organisation_users u where u.organisation_id=r.organisation_id and u.user_id=p_actor_id
    and lower(coalesce(nullif(u.membership_status,''),u.status))='active' limit 1;
  if membership is null then raise exception 'Active organisation membership required'; end if;
  actor_role:=lower(coalesce(membership->>'workspace_role',membership->>'organization_role',membership->>'organisation_role',membership->>'role',''));
  if r.actor_id<>p_actor_id and actor_role not in ('principal','owner','director','admin','super_admin','agency_admin','administrator','superadmin','principal / owner') then
    raise exception 'Report access denied';
  end if;
  if r.request_context_snapshot->>'supplierEnvironment' is distinct from 'live' then
    return jsonb_build_object('status','test_report');
  end if;
  if r.report_snapshot_version is distinct from 'canvassing-report-v1' or jsonb_typeof(r.report_data->'owners') is distinct from 'array'
     or jsonb_array_length(r.report_data->'owners')=0 then raise exception 'Complete saved owner details required'; end if;
  select to_jsonb(u) into requester from public.organisation_users u where u.organisation_id=r.organisation_id and u.user_id=r.actor_id
    and lower(coalesce(nullif(u.membership_status,''),u.status))='active' limit 1;
  if requester is null then raise exception 'Report requester is no longer an active member'; end if;

  -- Serialises different reports for the same property, including Basic vs Full.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r.organisation_id::text||':kf:'||r.property_id::text,0));
  select * into journey from public.knowledge_factory_property_seller_leads where organisation_id=r.organisation_id and property_id=r.property_id;
  target_id:=nullif(r.request_context_snapshot->>'targetSellerLeadId','')::uuid;
  if target_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r.organisation_id::text||':kf-lead:'||target_id::text,0));
    perform public.knowledge_factory_validate_seller_target(r.organisation_id,r.actor_id,r.property_id,target_id);
  end if;
  property:=coalesce(r.report_data->'property','{}'::jsonb);
  select jsonb_agg(jsonb_build_object('id','kf-owner-'||n,'fullName',o->>'name','name',o->>'name',
    'supplierOwnerType',o->'type','ownershipShare',o->'share','source','Knowledge Factory','verified',false) order by n)
    into owners from jsonb_array_elements(r.report_data->'owners') with ordinality as x(o,n);
  contact_name:=nullif(btrim(r.report_data->'owners'->0->>'name'),'');
  if contact_name is null then raise exception 'An owner name is required'; end if;
  form:=jsonb_build_object('sellerFirstName',contact_name,'sellerSurname','','sellerName',contact_name,
    'propertyAddress',coalesce(property->>'address','Property '||r.property_id::text),
    'propertyAddressLine1',property->>'address','suburb',property->>'suburb','city',property->>'town',
    'province',property->>'province','postalCode',property->>'postalCode','propertyType',property->>'type',
    'erfNumber',property->'erf','unitNumber',property->'unit',
    'ownerStructureType',case when jsonb_array_length(owners)>1 then 'multiple_owners' else 'other' end,
    'multipleOwners',owners,'owners',owners,'ownershipRouteConfirmed',false,'ownershipDeclarationPending',true,
    'knowledgeFactory',jsonb_build_object('propertyId',r.property_id,'reportResultId',r.id,'retrievedAt',r.executed_at,'owners',r.report_data->'owners','property',property,'verified',false));
  if journey.lead_id is null then
    if target_id is not null then
      select * into target_row from public.leads where lead_id=target_id for update;
      new_lead_id:=target_row.lead_id;
      -- Existing manual leads may not have a private property workspace yet.
      select pl.id into new_listing_id from public.private_listings pl
        where pl.organisation_id=r.organisation_id and
          (pl.id::text=target_row.listing_id or pl.seller_lead_id::text=target_id::text or pl.originating_crm_lead_id::text=target_id::text)
        order by (pl.id::text=target_row.listing_id) desc nulls last,pl.created_at limit 1;
      if new_listing_id is null then
        insert into public.private_listings(organisation_id,assigned_agent_id,created_by,seller_lead_id,originating_crm_lead_id,listing_reference,listing_status,listing_visibility,listing_source,listing_category,title,seller_onboarding_status,mandate_status,is_active)
        values(r.organisation_id,coalesce(target_row.assigned_user_id,target_row.assigned_agent_id,r.actor_id),r.actor_id,target_id,target_id,'KF-'||target_id::text,'seller_lead','internal','seller_lead_intake','private_sale',coalesce(property->>'address','Property '||r.property_id::text),'not_started','not_started',false)
        returning id into new_listing_id;
        update public.leads set listing_id=new_listing_id where lead_id=target_id;
      end if;
      insert into public.private_listing_seller_onboarding(private_listing_id,token,form_data,status)
        values(new_listing_id,'seller-'||gen_random_uuid()::text,form,'in_progress') on conflict(private_listing_id) do nothing;
      insert into public.lead_activities(organisation_id,lead_id,agent_id,activity_type,activity_note,activity_date,outcome)
        values(r.organisation_id,target_id,r.actor_id,'Note Added','Property report explicitly linked to this existing seller lead; supplied owners require verification.',now(),'New');
    else
    -- Reuse only an explicit supplier identity, never a name/address guess.
    select l.lead_id,l.listing_id into new_lead_id,new_listing_id from public.leads l
      join public.private_listings pl on pl.id::text=l.listing_id::text and pl.organisation_id=r.organisation_id
      where l.organisation_id=r.organisation_id and l.lead_category='seller'
      and l.source_reference_id='knowledge_factory:property:'||r.property_id::text limit 1;
    if new_lead_id is null then
      insert into public.contacts(organisation_id,assigned_agent_id,first_name,last_name,contact_type,notes)
      values(r.organisation_id,r.actor_id,contact_name,'','seller','Supplier owner name; identity, contact details and selling intent require verification.') returning contacts.contact_id into contact_id;
      insert into public.leads(organisation_id,branch_id,assigned_agent_email,assigned_agent_id,assigned_user_id,created_by,contact_id,lead_domain,lead_category,lead_direction,lead_source,
        source_reference_id,stage,status,priority,ownership_status,assigned_at,seller_property_address,formatted_address,suburb,city,province,postal_code,notes)
      values(r.organisation_id,nullif(requester->>'branch_id','')::uuid,nullif(requester->>'email',''),r.actor_id,r.actor_id,r.actor_id,contact_id,'agency','seller','Outbound','Knowledge Factory Property Report',
        'knowledge_factory:property:'||r.property_id::text,'New Lead','New Lead','Medium','assigned',now(),property->>'address',property->>'address',property->>'suburb',property->>'town',property->>'province',property->>'postalCode',
        'Created from a completed property report. Supplier ownership is unverified and does not establish intent or consent to sell.') returning leads.lead_id into new_lead_id;
      insert into public.private_listings(organisation_id,branch_id,assigned_agent_id,created_by,seller_lead_id,originating_crm_lead_id,listing_reference,listing_status,listing_visibility,
        listing_source,listing_category,title,formatted_address,address_line_1,suburb,city,province,postal_code,property_type,seller_onboarding_status,mandate_status,is_active)
      values(r.organisation_id,nullif(requester->>'branch_id','')::uuid,r.actor_id,r.actor_id,new_lead_id,new_lead_id,'KF-'||new_lead_id::text,'seller_lead','internal','seller_lead_intake','private_sale',
        coalesce(property->>'address','Property '||r.property_id::text),property->>'address',property->>'address',property->>'suburb',property->>'town',property->>'province',property->>'postalCode',property->>'type','not_started','not_started',false)
      returning id into new_listing_id;
      update public.leads set listing_id=new_listing_id where lead_id=new_lead_id;
      insert into public.private_listing_seller_onboarding(private_listing_id,token,form_data,status)
      values(new_listing_id,'seller-'||gen_random_uuid()::text,form,'in_progress');
      insert into public.lead_activities(organisation_id,lead_id,agent_id,activity_type,activity_note,activity_date,outcome)
      values(r.organisation_id,new_lead_id,r.actor_id,'Lead Created','Property report saved; all supplied owners linked for verification.',now(),'New');
    end if;
    end if;
    insert into public.knowledge_factory_property_seller_leads(organisation_id,property_id,lead_id,private_listing_id)
      values(r.organisation_id,r.property_id,new_lead_id,new_listing_id) returning * into journey;
  end if;
  if not exists(select 1 from public.leads l join public.private_listings pl on pl.id=journey.private_listing_id
    where l.lead_id=journey.lead_id and l.organisation_id=r.organisation_id and pl.organisation_id=r.organisation_id and l.lead_category='seller') then
    raise exception 'Seller journey organisation does not match'; end if;

  -- Keep subsequent supplier versions beside, never over the agent/seller's answers.
  update public.private_listing_seller_onboarding o set form_data=coalesce(o.form_data,'{}'::jsonb)||jsonb_build_object('knowledgeFactory',form->'knowledgeFactory'),updated_at=now()
    where o.private_listing_id=journey.private_listing_id
      and o.form_data->'knowledgeFactory' is distinct from form->'knowledgeFactory'
      and coalesce(journey.latest_report_at,'-infinity'::timestamptz)<=r.executed_at;
  update public.knowledge_factory_property_seller_leads set latest_report_at=r.executed_at
    where organisation_id=r.organisation_id and property_id=r.property_id and coalesce(latest_report_at,'-infinity'::timestamptz)<=r.executed_at;
  insert into public.knowledge_factory_report_seller_filings(report_result_id,organisation_id,property_id,lead_id,private_listing_id,storage_path)
  values(r.id,r.organisation_id,r.property_id,journey.lead_id,journey.private_listing_id,
    'private-listings/'||journey.private_listing_id::text||'/knowledge-factory/'||r.id::text||'.pdf')
  on conflict(report_result_id) do nothing;
  select * into filing from public.knowledge_factory_report_seller_filings where report_result_id=r.id;
  return to_jsonb(filing);
end $$;

revoke all on function public.knowledge_factory_validate_seller_target(uuid,uuid,bigint,uuid),public.knowledge_factory_seller_lead_options(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.knowledge_factory_validate_seller_target(uuid,uuid,bigint,uuid),public.knowledge_factory_seller_lead_options(uuid,uuid,bigint,text) to service_role;
notify pgrst,'reload schema';
commit;
