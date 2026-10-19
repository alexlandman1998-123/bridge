begin;
set local lock_timeout = '5s';

-- Stable property identity owns one seller journey; each purchased snapshot owns
-- its own document receipt. No matching on a person's name or a partial address.
create table public.knowledge_factory_property_seller_leads (
  organisation_id uuid not null references public.organisations(id),
  property_id bigint not null,
  lead_id uuid not null references public.leads(lead_id),
  private_listing_id uuid not null references public.private_listings(id),
  created_at timestamptz not null default now(),
  latest_report_at timestamptz,
  primary key (organisation_id, property_id)
);
create table public.knowledge_factory_report_seller_filings (
  report_result_id uuid primary key references public.knowledge_factory_report_results(id),
  organisation_id uuid not null references public.organisations(id),
  property_id bigint not null,
  lead_id uuid not null references public.leads(lead_id),
  private_listing_id uuid not null references public.private_listings(id),
  document_id uuid unique references public.private_listing_documents(id),
  status text not null default 'pending' check (status in ('pending','filed')),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  filed_at timestamptz,
  check ((status='filed') = (document_id is not null and filed_at is not null)),
  foreign key (organisation_id, property_id) references public.knowledge_factory_property_seller_leads(organisation_id,property_id)
);
alter table public.knowledge_factory_property_seller_leads enable row level security;
alter table public.knowledge_factory_report_seller_filings enable row level security;
revoke all on public.knowledge_factory_property_seller_leads,public.knowledge_factory_report_seller_filings from public,anon,authenticated;
grant select,insert,update on public.knowledge_factory_property_seller_leads,public.knowledge_factory_report_seller_filings to service_role;

create function public.knowledge_factory_prepare_seller_filing(p_report_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  r public.knowledge_factory_report_results%rowtype;
  journey public.knowledge_factory_property_seller_leads%rowtype;
  filing public.knowledge_factory_report_seller_filings%rowtype;
  contact_id uuid; new_lead_id uuid; new_listing_id uuid; contact_name text;
  property jsonb; owners jsonb; form jsonb; membership jsonb; requester jsonb; actor_role text;
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

create function public.knowledge_factory_complete_seller_filing(p_report_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.knowledge_factory_report_seller_filings%rowtype; receipt jsonb; doc_id uuid;
begin
  receipt:=public.knowledge_factory_prepare_seller_filing(p_report_id,p_actor_id);
  if receipt->>'status'='test_report' then return receipt; end if;
  select * into f from public.knowledge_factory_report_seller_filings where report_result_id=p_report_id for update;
  if f.status='filed' then return to_jsonb(f); end if;
  if not exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id
    where o.bucket_id='documents' and not b.public and o.name=f.storage_path and o.metadata->>'mimetype'='application/pdf') then
    raise exception 'Private property report PDF has not been saved'; end if;
  insert into public.private_listing_documents(private_listing_id,document_type,category,document_name,storage_path,uploaded_by,status,visibility)
  values(f.private_listing_id,'knowledge_factory_property_report','Property Report','Knowledge Factory property report - '||p_report_id::text||'.pdf',f.storage_path,p_actor_id,'uploaded','internal') returning id into doc_id;
  update public.knowledge_factory_report_seller_filings set document_id=doc_id,status='filed',filed_at=now() where report_result_id=p_report_id returning * into f;
  return to_jsonb(f);
end $$;
revoke all on function public.knowledge_factory_prepare_seller_filing(uuid,uuid),public.knowledge_factory_complete_seller_filing(uuid,uuid) from public,anon,authenticated;
grant execute on function public.knowledge_factory_prepare_seller_filing(uuid,uuid),public.knowledge_factory_complete_seller_filing(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
