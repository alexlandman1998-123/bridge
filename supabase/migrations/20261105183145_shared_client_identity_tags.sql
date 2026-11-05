-- Shared identities/tags for agency and developer workspaces. No consent changes.
begin;
alter table public.agency_client_profiles add column tag_version bigint not null default 1;
-- All writes go through the checked, versioned API; direct tag reads retain RLS.
revoke insert,delete on public.agency_client_tags from authenticated;

create function arch9_client_private.can_manage(p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select arch9_client_private.is_member(p_org) and
  (public.bridge_agency_open_operations(p_org) or
   (exists(select 1 from public.organisations where id=p_org and type='developer_company') and public.bridge_is_org_admin(p_org)))
$$;
revoke all on function arch9_client_private.can_manage(uuid) from public,anon;
grant execute on function arch9_client_private.can_manage(uuid) to authenticated,service_role;
create function public.client_identity_can_manage(p_organisation_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$ select arch9_client_private.can_manage(p_organisation_id) $$;
revoke all on function public.client_identity_can_manage(uuid) from public,anon;
grant execute on function public.client_identity_can_manage(uuid) to authenticated;


create or replace function arch9_client_private.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from public.organisation_users m join public.organisations o on o.id=m.organisation_id
    where m.organisation_id=p_org and m.user_id=auth.uid() and o.type in ('agency','developer_company')
      and lower(coalesce(m.membership_status,m.status,'')) in ('active','accepted')
  );
$$;

create or replace function arch9_client_private.source_visible(p_org uuid,p_kind text,p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if not arch9_client_private.is_member(p_org) then return false; end if;
  if exists(select 1 from public.organisations where id=p_org and type='developer_company') then
    case p_kind
      when 'contact' then return exists(select 1 from public.contacts c where c.contact_id=p_id and c.organisation_id=p_org and public.bridge_can_access_assignment(p_org,c.assigned_agent_id,null));
      when 'lead' then return exists(select 1 from public.leads l where l.lead_id=p_id and l.organisation_id=p_org and public.bridge_can_access_assignment(p_org,coalesce(l.assigned_user_id,l.assigned_agent_id),l.branch_id));
      when 'buyer' then return exists(select 1 from public.buyers b where b.id=p_id and b.organisation_id=p_org and public.bridge_can_access_assignment(p_org,null,null));
      when 'transaction_buyer','transaction_seller' then return exists(select 1 from public.transactions t where t.id=p_id and t.organisation_id=p_org and public.bridge_has_transaction_access(t.id));
      else return false; -- Agency-only source types are not widened for developers.
    end case;
  end if;
  case p_kind
    when 'contact' then return exists(select 1 from public.contacts c where c.contact_id=p_id and c.organisation_id=p_org
      and public.bridge_agency_record_scope(p_org,null,c.assigned_agent_id));
    when 'lead' then return exists(select 1 from public.leads l where l.lead_id=p_id and l.organisation_id=p_org
      and public.bridge_agency_record_scope(p_org,l.assigned_user_id,l.assigned_agent_id));
    when 'buyer' then return exists(select 1 from public.buyers b where b.id=p_id and b.organisation_id=p_org);
    when 'prospect' then return exists(select 1 from public.canvassing_prospects c where c.id=p_id and c.organisation_id=p_org
      and public.bridge_agency_record_scope(p_org,c.assigned_user_id,c.assigned_agent_id));
    when 'listing_seller' then return exists(select 1 from public.private_listings l where l.id=p_id and l.organisation_id=p_org
      and public.bridge_agency_record_scope(p_org,(to_jsonb(l)->>'assigned_user_id')::uuid,l.assigned_agent_id));
    when 'transaction_buyer','transaction_seller' then return exists(select 1 from public.transactions t where t.id=p_id and t.organisation_id=p_org
      and public.bridge_agency_record_scope(p_org,t.assigned_user_id,t.assigned_agent_id,t.owner_user_id));
    else return false;
  end case;
end;
$$;

create or replace function arch9_client_private.can_read_client(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.agency_client_profiles requested join public.agency_client_profiles c on c.id=coalesce(requested.merged_into,requested.id)
  where requested.id=p_id and arch9_client_private.is_member(c.organisation_id)
   and (arch9_client_private.can_manage(c.organisation_id) or (
    c.merged_into is null
    and exists(select 1 from public.agency_client_links l where l.client_id=c.id and arch9_client_private.source_exists(l.organisation_id,l.source_kind,l.source_id))
    and not exists(select 1 from public.agency_client_links l where l.client_id=c.id
      and arch9_client_private.source_exists(l.organisation_id,l.source_kind,l.source_id)
      and not arch9_client_private.source_visible(l.organisation_id,l.source_kind,l.source_id))
   )))
$$;

create or replace function arch9_client_private.update_client(p_client_id uuid,p_expected_version integer,p_name text,p_emails text[],p_phones text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_client public.agency_client_profiles%rowtype; v_value text; v_emails text[]; v_phones text[];
begin
  select * into v_client from public.agency_client_profiles where id=p_client_id;
  if v_client.id is null or not arch9_client_private.is_member(v_client.organisation_id) or not arch9_client_private.can_manage(v_client.organisation_id) then
    raise exception 'Only an authorised workspace administrator can edit client identities.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_client.organisation_id::text,0));
  select * into v_client from public.agency_client_profiles where id=p_client_id for update;
  if v_client.merged_into is not null or v_client.version is distinct from p_expected_version then raise exception 'Client details changed. Reload the profile before saving.' using errcode='40001'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 250 or coalesce(cardinality(p_emails),0)>20 or coalesce(cardinality(p_phones),0)>20 then raise exception 'Invalid client details.' using errcode='22023'; end if;
  v_emails:=array(select distinct lower(trim(value)) from unnest(coalesce(p_emails,array[]::text[])) value where nullif(trim(value),'') is not null);
  v_phones:=array(select distinct case when digits ~ '^0[0-9]{9}$' then '27'||substr(digits,2) else digits end from (select regexp_replace(value,'[^0-9]','','g') digits from unnest(coalesce(p_phones,array[]::text[])) value) s where digits<>'');
  foreach v_value in array v_emails loop
    if v_value !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(v_value)>320 then raise exception 'Enter valid email addresses.' using errcode='22023'; end if;
    if exists(select 1 from public.agency_client_identifiers where organisation_id=v_client.organisation_id and kind='email' and value=v_value and client_id<>p_client_id) then
      raise exception 'An email belongs to another client. Review and merge the profiles first.' using errcode='23505';
    end if;
    insert into public.agency_client_identifiers(organisation_id,client_id,kind,value) values(v_client.organisation_id,p_client_id,'email',v_value) on conflict do nothing;
  end loop;
  foreach v_value in array v_phones loop
    if length(v_value) not between 7 and 15 then raise exception 'Enter valid phone numbers.' using errcode='22023'; end if;
    insert into public.agency_client_identifiers(organisation_id,client_id,kind,value) values(v_client.organisation_id,p_client_id,'phone',v_value) on conflict do nothing;
  end loop;
  -- Former identifiers remain aliases so editing primary details cannot break historical matching.
  update public.agency_client_profiles set name=trim(p_name),primary_email=nullif(lower(trim(p_emails[1])),''),
    primary_phone=(select case when digits ~ '^0[0-9]{9}$' then '27'||substr(digits,2) else nullif(digits,'') end from (select regexp_replace(coalesce(p_phones[1],''),'[^0-9]','','g') digits) s),
    version=version+1,updated_at=now() where id=p_client_id returning * into v_client;
  return to_jsonb(v_client);
end;
$$;

create or replace function arch9_client_private.merge_clients(p_primary_id uuid,p_secondary_id uuid,p_primary_version integer,p_secondary_version integer,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_primary public.agency_client_profiles%rowtype; v_secondary public.agency_client_profiles%rowtype; v_audit uuid; v_snapshot jsonb;
begin
  select * into v_primary from public.agency_client_profiles where id=p_primary_id;
  if v_primary.id is null or not arch9_client_private.is_member(v_primary.organisation_id) or not arch9_client_private.can_manage(v_primary.organisation_id) then
    raise exception 'Only an authorised workspace administrator can merge client profiles.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_primary.organisation_id::text,0));
  -- A consistent lock order and the agency lock protect simultaneous edits, intake and merges.
  perform id from public.agency_client_profiles where id in (p_primary_id,p_secondary_id) order by id for update;
  select * into v_primary from public.agency_client_profiles where id=p_primary_id;
  select * into v_secondary from public.agency_client_profiles where id=p_secondary_id;
  if p_primary_id=p_secondary_id or v_secondary.id is null or v_secondary.organisation_id<>v_primary.organisation_id then raise exception 'Choose two different clients from this agency.' using errcode='22023'; end if;
  if v_primary.merged_into is not null or v_secondary.merged_into is not null or v_primary.version is distinct from p_primary_version or v_secondary.version is distinct from p_secondary_version then
    raise exception 'Client details changed. Reload both profiles before merging.' using errcode='40001';
  end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'Record why these profiles belong to the same client.' using errcode='22023'; end if;
  v_snapshot:=jsonb_build_object('primary',to_jsonb(v_primary),'secondary',to_jsonb(v_secondary),
    'identifiers',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from public.agency_client_identifiers i where client_id in (p_primary_id,p_secondary_id)),
    'links',(select coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) from public.agency_client_links l where client_id in (p_primary_id,p_secondary_id)));
  -- Move identity associations only. Original source records, messages, files and marketing consent remain untouched.
  delete from public.agency_client_identifiers s using public.agency_client_identifiers p where s.client_id=p_secondary_id and p.client_id=p_primary_id and s.kind=p.kind and s.value=p.value;
  update public.agency_client_identifiers set client_id=p_primary_id where client_id=p_secondary_id;
  update public.agency_client_links set client_id=p_primary_id where client_id=p_secondary_id;
  update public.agency_client_profiles set primary_email=coalesce(primary_email,v_secondary.primary_email),primary_phone=coalesce(primary_phone,v_secondary.primary_phone),version=version+1,updated_at=now() where id=p_primary_id;
  update public.agency_client_profiles set merged_into=p_primary_id,version=version+1,updated_at=now() where id=p_secondary_id;
  -- Flatten earlier redirects while retaining the immutable merge audit.
  update public.agency_client_profiles set merged_into=p_primary_id where organisation_id=v_primary.organisation_id and merged_into=p_secondary_id;
  insert into public.agency_client_merge_audit(organisation_id,primary_id,secondary_id,actor_id,reason,before_snapshot)
    values(v_primary.organisation_id,p_primary_id,p_secondary_id,auth.uid(),trim(p_reason),v_snapshot) returning id into v_audit;
  return jsonb_build_object('client_id',p_primary_id,'audit_id',v_audit);
end;
$$;

alter policy agency_client_merge_read on public.agency_client_merge_audit using (arch9_client_private.can_manage(organisation_id));

create or replace function arch9_client_private.attach_source(p_org uuid,p_kind text,p_id uuid,p_name text,p_email text,p_phone text,p_parent_kind text default null,p_parent_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare v_client uuid; v_email text:=lower(nullif(trim(p_email),'')); v_phone text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'); v_changed integer:=0; v_count integer;
begin
  if p_org is null or not exists(select 1 from public.organisations where id=p_org and type in ('agency','developer_company')) then return; end if;
  if nullif(trim(p_name),'') is null and v_email is null and v_phone='' then return; end if;
  if v_email is not null and (length(v_email)>320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then v_email:=null; end if;
  if length(v_phone)>15 then v_phone:=''; end if;
  if v_phone ~ '^0[0-9]{9}$' then v_phone:='27'||substr(v_phone,2); end if;
  -- Serialize identity creation, edits and merges within one agency, including empty-email profiles.
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
  select client_id into v_client from public.agency_client_links where organisation_id=p_org and source_kind=p_kind and source_id=p_id;
  if v_client is null and p_parent_id is not null then
    select client_id into v_client from public.agency_client_links where organisation_id=p_org and source_kind=p_parent_kind and source_id=p_parent_id;
  end if;
  if v_client is null and v_email is not null then
    select client_id into v_client from public.agency_client_identifiers where organisation_id=p_org and kind='email' and value=v_email;
  end if;
  if v_client is null then
    insert into public.agency_client_profiles(organisation_id,name,primary_email,primary_phone,created_by)
      values(p_org,left(coalesce(nullif(trim(p_name),''),'Unnamed client'),250),v_email,nullif(v_phone,''),auth.uid()) returning id into v_client;
  end if;
  -- Source links survive email/name changes and reviewed merges.
  insert into public.agency_client_links(organisation_id,client_id,source_kind,source_id) values(p_org,v_client,p_kind,p_id) on conflict do nothing;
  get diagnostics v_changed=row_count;
  if v_email is not null then
    insert into public.agency_client_identifiers(organisation_id,client_id,kind,value) values(p_org,v_client,'email',v_email) on conflict do nothing;
    get diagnostics v_count=row_count; v_changed:=v_changed+v_count;
  end if;
  if v_phone<>'' then
    insert into public.agency_client_identifiers(organisation_id,client_id,kind,value) values(p_org,v_client,'phone',v_phone) on conflict do nothing;
    get diagnostics v_count=row_count; v_changed:=v_changed+v_count;
  end if;
  if v_changed>0 then
    update public.agency_client_profiles set primary_email=coalesce(primary_email,(select value from public.agency_client_identifiers where client_id=v_client and kind='email' and value=v_email)),
      primary_phone=coalesce(primary_phone,nullif(v_phone,'')),version=version+1,updated_at=now() where id=v_client;
  end if;
end;
$$;

create or replace function arch9_client_private.ingest(p_table text,p_row jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_org uuid:=(p_row->>'organisation_id')::uuid; v_id uuid; v_contact public.contacts%rowtype; v_buyer public.buyers%rowtype; v_facts jsonb; v_form jsonb; v_listing jsonb; v_parent uuid;
begin
  if coalesce((p_row->>'is_demo_data')::boolean,false) or coalesce((p_row->>'isDemoData')::boolean,false)
    or p_row->'demo_metadata' @> '{"isDemoData":true}'::jsonb
    or p_row->'demo_metadata' @> '{"is_demo_data":true}'::jsonb
    or p_row->'demo_metadata' @> '{"seedData":true}'::jsonb
    or p_row->'demo_metadata' @> '{"seed_data":true}'::jsonb
    or p_row->'demo_metadata' @> '{"migratedFromLocalStorage":true}'::jsonb then return; end if;
  case p_table
    when 'contacts' then
      perform arch9_client_private.attach_source(v_org,'contact',(p_row->>'contact_id')::uuid,concat_ws(' ',p_row->>'first_name',p_row->>'last_name'),p_row->>'email',p_row->>'phone');
    when 'leads' then
      select * into v_contact from public.contacts where contact_id=(p_row->>'contact_id')::uuid and organisation_id=v_org;
      if v_contact.contact_id is not null then
        perform arch9_client_private.attach_source(v_org,'lead',(p_row->>'lead_id')::uuid,concat_ws(' ',v_contact.first_name,v_contact.last_name),v_contact.email,v_contact.phone,'contact',v_contact.contact_id);
      end if;
    when 'buyers' then
      perform arch9_client_private.attach_source(v_org,'buyer',(p_row->>'id')::uuid,p_row->>'name',p_row->>'email',p_row->>'phone');
    when 'canvassing_prospects' then
      perform arch9_client_private.attach_source(v_org,'prospect',(p_row->>'id')::uuid,concat_ws(' ',p_row->>'first_name',p_row->>'last_name'),p_row->>'email',p_row->>'phone');
    when 'transactions' then
      v_id:=(p_row->>'id')::uuid;
      select * into v_buyer from public.buyers where id=(p_row->>'buyer_id')::uuid and organisation_id=v_org;
      if v_buyer.id is not null and not coalesce((to_jsonb(v_buyer)->>'is_demo_data')::boolean,false) then
        perform arch9_client_private.attach_source(v_org,'transaction_buyer',v_id,v_buyer.name,v_buyer.email,v_buyer.phone,'buyer',v_buyer.id);
      end if;
      perform arch9_client_private.attach_source(v_org,'transaction_seller',v_id,p_row->>'seller_name',p_row->>'seller_email',p_row->>'seller_phone');
    when 'private_listing_seller_onboarding' then
      select to_jsonb(l) into v_listing from public.private_listings l where l.id=(p_row->>'private_listing_id')::uuid;
      if v_listing is not null then perform arch9_client_private.ingest('private_listings',v_listing); end if;
    when 'private_listings' then
      select coalesce(canonical_facts_json,'{}'::jsonb)||coalesce(form_data,'{}'::jsonb) into v_form from public.private_listing_seller_onboarding where private_listing_id=(p_row->>'id')::uuid limit 1;
      v_form:=coalesce(v_form,'{}'::jsonb);
      v_facts:=coalesce(p_row->'seller_canonical_facts_json','{}'::jsonb);
      if (p_row->>'seller_lead_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_parent:=(p_row->>'seller_lead_id')::uuid; end if;
      perform arch9_client_private.attach_source(v_org,'listing_seller',(p_row->>'id')::uuid,
        coalesce(nullif(v_facts->>'fullName',''),nullif(v_facts->>'sellerName',''),nullif(v_facts->>'name',''),nullif(trim(concat_ws(' ',v_facts->>'firstName',v_facts->>'lastName')),''),nullif(v_form->>'sellerName',''),nullif(v_form->>'fullName',''),nullif(trim(concat_ws(' ',coalesce(v_form->>'sellerFirstName',v_form->>'firstName'),coalesce(v_form->>'sellerSurname',v_form->>'lastName'))),'')),
        coalesce(v_facts->>'email',v_facts->>'sellerEmail',v_form->>'sellerEmail',v_form->>'email',v_form->>'contactEmail'),coalesce(v_facts->>'phone',v_facts->>'sellerPhone',v_facts->>'mobile',v_form->>'sellerPhone',v_form->>'phone',v_form->>'contactNumber',v_form->>'mobile'),'lead',v_parent);
  end case;
end;
$$;

create function public.client_identity_refresh(p_organisation_id uuid) returns integer
language plpgsql security invoker set search_path='' as $$
declare item jsonb; source_table text; total integer:=0;
begin
 if not exists(select 1 from public.organisations where id=p_organisation_id and type in ('agency','developer_company')) then raise exception 'Unsupported client workspace.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text,0));
 foreach source_table in array array['contacts','buyers','canvassing_prospects','leads','private_listings','transactions'] loop
  for item in execute format('select to_jsonb(s) from public.%I s where organisation_id=$1 order by created_at nulls last',source_table) using p_organisation_id loop
   perform arch9_client_private.ingest(source_table,item);total:=total+1;
  end loop;
 end loop;
 return total;
end $$;
revoke all on function public.client_identity_refresh(uuid) from public,anon,authenticated;
grant execute on function public.client_identity_refresh(uuid) to service_role;
grant execute on function arch9_client_private.ingest(text,jsonb) to service_role;

-- Private raw lookup is only used behind checked client APIs and source triggers.
create function arch9_client_private.client_tags_value(p_client uuid) returns text[]
language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(distinct tag order by tag),'{}') from (
  select t.tag from public.agency_client_tags t join public.agency_client_profiles p on p.id=t.client_id and p.organisation_id=t.organisation_id where p.id=p_client or p.merged_into=p_client
  union
  select lower(btrim(tag)) from public.agency_client_identifiers i join public.email_marketing_contacts m on m.organisation_id=i.organisation_id and m.email=i.value cross join lateral unnest(m.tags) tag
   where i.client_id=p_client and i.kind='email' and nullif(btrim(tag),'') is not null
 ) tags
$$;
revoke all on function arch9_client_private.client_tags_value(uuid) from public,anon,authenticated;
grant execute on function arch9_client_private.client_tags_value(uuid) to service_role;

create function arch9_client_private.client_tag_workspace(p_org uuid,p_client uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.agency_client_profiles%rowtype;
begin
 select * into c from public.agency_client_profiles where id=p_client and organisation_id=p_org;
 if c.id is null or not arch9_client_private.can_read_client(c.id) then raise exception 'Client access required.' using errcode='42501'; end if;
 if c.merged_into is not null then select * into c from public.agency_client_profiles where id=c.merged_into and organisation_id=p_org; end if;
 return jsonb_build_object('clientId',c.id,'tagVersion',c.tag_version,'tags',arch9_client_private.client_tags_value(c.id),'emails',
  (select coalesce(jsonb_agg(value order by value),'[]') from public.agency_client_identifiers where client_id=c.id and kind='email'));
end $$;
revoke all on function arch9_client_private.client_tag_workspace(uuid,uuid) from public,anon;
grant execute on function arch9_client_private.client_tag_workspace(uuid,uuid) to authenticated;
create function public.client_tag_workspace(p_organisation_id uuid,p_client_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select arch9_client_private.client_tag_workspace(p_organisation_id,p_client_id) $$;
revoke all on function public.client_tag_workspace(uuid,uuid) from public,anon;
grant execute on function public.client_tag_workspace(uuid,uuid) to authenticated;

create function arch9_client_private.save_client_tags(p_org uuid,p_client uuid,p_expected bigint,p_tags text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.agency_client_profiles%rowtype; next_tags text[];
begin
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 select * into c from public.agency_client_profiles where id=p_client and organisation_id=p_org for update;
 if c.id is null or not arch9_client_private.can_read_client(c.id) then raise exception 'Client access required.' using errcode='42501'; end if;
 if c.merged_into is not null or c.tag_version is distinct from p_expected then raise exception 'Client tags changed. Refresh before saving.' using errcode='40001'; end if;
 if cardinality(p_tags)>100 or exists(select 1 from unnest(p_tags) tag where tag is null or length(btrim(tag)) not between 1 and 60) then raise exception 'Use up to 100 tags, each 1–60 characters.' using errcode='22023'; end if;
 select coalesce(array_agg(distinct lower(btrim(tag)) order by lower(btrim(tag))),'{}') into next_tags from unnest(p_tags) tag;
 delete from public.agency_client_tags t using public.agency_client_profiles p where p.id=t.client_id and (p.id=c.id or p.merged_into=c.id);
 insert into public.agency_client_tags(organisation_id,client_id,tag,created_by) select p_org,c.id,tag,auth.uid() from unnest(next_tags) tag;
 -- Compatibility is destination metadata only: never copy consent/subscriptions.
 update public.email_marketing_contacts m set tags=next_tags where m.organisation_id=p_org and m.tags is distinct from next_tags and exists(select 1 from public.agency_client_identifiers i where i.client_id=c.id and i.kind='email' and i.value=m.email);
 update public.agency_client_profiles set tag_version=tag_version+1 where id=c.id;
 return arch9_client_private.client_tag_workspace(p_org,c.id);
end $$;
revoke all on function arch9_client_private.save_client_tags(uuid,uuid,bigint,text[]) from public,anon;
grant execute on function arch9_client_private.save_client_tags(uuid,uuid,bigint,text[]) to authenticated;
create function public.client_tags_save(p_organisation_id uuid,p_client_id uuid,p_expected_version bigint,p_tags text[]) returns jsonb
language sql security invoker set search_path='' as $$ select arch9_client_private.save_client_tags(p_organisation_id,p_client_id,p_expected_version,p_tags) $$;
revoke all on function public.client_tags_save(uuid,uuid,bigint,text[]) from public,anon;
grant execute on function public.client_tags_save(uuid,uuid,bigint,text[]) to authenticated;

create function arch9_client_private.client_tag_identity_revision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.version,new.merged_into) is distinct from (old.version,old.merged_into) then new.tag_version:=old.tag_version+1; end if;
 return new;
end $$;
create trigger client_tag_identity_revision before update on public.agency_client_profiles for each row execute function arch9_client_private.client_tag_identity_revision();
create function arch9_client_private.client_tag_legacy_revision() returns trigger
language plpgsql security definer set search_path='' as $$
declare scope uuid; address text;
begin
 if tg_op='UPDATE' and (new.email,new.tags) is not distinct from (old.email,old.tags) then return new; end if;
 scope:=case when tg_op='DELETE' then old.organisation_id else new.organisation_id end;
 address:=case when tg_op='DELETE' then old.email else new.email end;
 perform pg_advisory_xact_lock(hashtextextended(scope::text,0));
 update public.agency_client_profiles p set tag_version=tag_version+1 where p.organisation_id=scope and exists(select 1 from public.agency_client_identifiers i where i.client_id=p.id and i.kind='email' and (i.value=address or (tg_op='UPDATE' and i.value=old.email)));
 if tg_op='DELETE' then return old; end if;return new;
end $$;
create trigger client_tag_legacy_revision before insert or update or delete on public.email_marketing_contacts for each row execute function arch9_client_private.client_tag_legacy_revision();

create function arch9_client_private.client_tags_merged() returns trigger
language plpgsql security definer set search_path='' as $$
declare combined text[];
begin
 if new.merged_into is not null and new.merged_into is distinct from old.merged_into then
  combined:=arch9_client_private.client_tags_value(new.merged_into);
  update public.agency_client_profiles set tag_version=tag_version+1 where id=new.merged_into;
  update public.email_marketing_contacts m set tags=combined where m.organisation_id=new.organisation_id and m.tags is distinct from combined and exists(select 1 from public.agency_client_identifiers i where i.client_id=new.merged_into and i.kind='email' and i.value=m.email);
 end if;
 return new;
end $$;
create trigger client_tags_merged after update of merged_into on public.agency_client_profiles for each row execute function arch9_client_private.client_tags_merged();
revoke all on function arch9_client_private.client_tag_identity_revision(),arch9_client_private.client_tag_legacy_revision(),arch9_client_private.client_tags_merged() from public,anon,authenticated;

-- Checked compatibility lookup: old email-only definitions use shared tags too.
create function arch9_client_private.client_tags_for_email(p_org uuid,p_email text) returns text[]
language sql stable security definer set search_path='' as $$
 select arch9_client_private.client_tags_value(i.client_id) from public.agency_client_identifiers i where i.organisation_id=p_org and i.kind='email' and i.value=p_email and arch9_client_private.can_read_client(i.client_id)
$$;
revoke all on function arch9_client_private.client_tags_for_email(uuid,text) from public,anon;
grant execute on function arch9_client_private.client_tags_for_email(uuid,text) to authenticated,service_role;

-- Live CRM audiences read shared person tags even for phone-only clients.
create function public.client_tags_for_contact(p_org uuid,p_contact uuid) returns text[]
language sql stable security invoker set search_path='' as $$
 select array(select jsonb_array_elements_text(public.client_tag_workspace(p_org,l.client_id)->'tags')) from public.agency_client_links l where l.organisation_id=p_org and l.source_kind='contact' and l.source_id=p_contact
$$;


revoke all on function public.client_tags_for_contact(uuid,uuid) from public,anon;
grant execute on function public.client_tags_for_contact(uuid,uuid) to authenticated;
create function public.client_normalize_phone(p_phone text) returns text
language sql immutable security invoker set search_path='' as $$
 select case when digits ~ '^0[0-9]{9}$' then '27'||substr(digits,2) else digits end from(select regexp_replace(coalesce(p_phone,''),'[^0-9]','','g') digits) s
$$;
revoke all on function public.client_normalize_phone(text) from public,anon;
grant execute on function public.client_normalize_phone(text) to authenticated,service_role;


create or replace function arch9_client_private.email_projection_rows(p_org uuid)
returns table(contact_id uuid,organisation_id uuid,email text,first_name text,last_name text,role_type text,branch_id uuid,assigned_user_id uuid,lead_stage text,area text,source_updated_at timestamptz)
language sql stable security definer set search_path='' as $$
 select c.contact_id,c.organisation_id,lower(btrim(c.email)),nullif(btrim(c.first_name),''),nullif(btrim(c.last_name),''),nullif(lower(btrim(c.contact_type)),''),
  case when exists(select 1 from public.organisation_branches b where b.id=l.branch_id and b.organisation_id=c.organisation_id) then l.branch_id end,
  coalesce(l.assigned_user_id,c.assigned_agent_id),nullif(btrim(l.stage),''),nullif(btrim(l.area_interest),''),c.updated_at
 from public.contacts c join public.organisations o on o.id=c.organisation_id and o.type in ('agency','developer_company')
 left join lateral(select s.branch_id,s.assigned_user_id,s.stage,s.area_interest from public.leads s
   where s.organisation_id=c.organisation_id and s.contact_id=c.contact_id and coalesce(s.lead_domain,'agency')='agency'
    and not coalesce(s.is_demo_data,false)
   order by s.updated_at desc nulls last,s.lead_id limit 1) l on true
 where c.organisation_id=p_org and length(btrim(c.email))<=320 and lower(btrim(c.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  and not coalesce(c.is_demo_data,false)
  and not coalesce(to_jsonb(c)->'demo_metadata' @> '{"seedData":true}' or to_jsonb(c)->'demo_metadata' @> '{"isDemoData":true}' or to_jsonb(c)->'demo_metadata' @> '{"is_demo_data":true}' or to_jsonb(c)->'demo_metadata' @> '{"seed_data":true}' or to_jsonb(c)->'demo_metadata' @> '{"migratedFromLocalStorage":true}',false)
  and (not exists(select 1 from public.leads s where s.organisation_id=c.organisation_id and s.contact_id=c.contact_id and coalesce(s.lead_domain,'agency')<>'agency')
    or exists(select 1 from public.leads s where s.organisation_id=c.organisation_id and s.contact_id=c.contact_id and coalesce(s.lead_domain,'agency')='agency' and not coalesce(s.is_demo_data,false)))
$$;

create or replace function public.email_campaign_refresh_contact_projection(p_organisation_id uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
 if p_organisation_id is null then raise exception 'Organisation is required.' using errcode='22023'; end if;
 if not exists(select 1 from public.organisations where id=p_organisation_id and type in ('agency','developer_company')) then return 0; end if;
 perform pg_advisory_xact_lock(hashtextextended('email-projection:'||p_organisation_id::text,0));
 insert into public.email_marketing_contacts(organisation_id,branch_id,source_type,source_id,email,first_name,last_name,full_name,role_type,assigned_user_id,lead_stage,area,is_valid_email,tags)
  select distinct on(r.email) r.organisation_id,r.branch_id,'crm',r.contact_id,r.email,r.first_name,r.last_name,nullif(concat_ws(' ',r.first_name,r.last_name),''),r.role_type,r.assigned_user_id,r.lead_stage,r.area,true,coalesce((select arch9_client_private.client_tags_value(i.client_id) from public.agency_client_identifiers i where i.organisation_id=r.organisation_id and i.kind='email' and i.value=r.email),'{}')
  from arch9_client_private.email_projection_rows(p_organisation_id) r order by r.email,r.source_updated_at desc nulls last,r.contact_id
  on conflict(organisation_id,email) do update set branch_id=excluded.branch_id,source_type='crm',source_id=excluded.source_id,first_name=excluded.first_name,last_name=excluded.last_name,
   full_name=excluded.full_name,role_type=excluded.role_type,assigned_user_id=excluded.assigned_user_id,lead_stage=excluded.lead_stage,area=excluded.area,is_valid_email=true;
 insert into public.email_marketing_contact_sources(organisation_id,marketing_contact_id,source_kind,source_id,source_snapshot)
  select r.organisation_id,m.id,'crm_contact',r.contact_id,jsonb_build_object('contactId',r.contact_id,'roleType',r.role_type,'leadStage',r.lead_stage,'area',r.area)
  from arch9_client_private.email_projection_rows(p_organisation_id) r join public.email_marketing_contacts m on m.organisation_id=r.organisation_id and m.email=r.email
  on conflict(organisation_id,source_kind,source_id) do update set marketing_contact_id=excluded.marketing_contact_id,source_snapshot=excluded.source_snapshot,synced_at=now();
 get diagnostics affected=row_count;
 -- Tag-only rows for other visible client sources are not owned by this feed.
 update public.email_marketing_contacts m set is_valid_email=false where m.organisation_id=p_organisation_id and m.source_type='crm' and m.is_valid_email
  and (m.source_id is not null or exists(select 1 from public.email_marketing_contact_sources s where s.organisation_id=m.organisation_id and s.marketing_contact_id=m.id and s.source_kind='crm_contact'))
  and not exists(select 1 from arch9_client_private.email_projection_rows(p_organisation_id) r where r.email=m.email);
 return affected;
end $$;

create or replace function public.marketing_audience_members(p_org uuid,p_definition jsonb,p_subscription uuid default null)
returns table(contact_id uuid,name text,email text,phone text,role text,stage text,area text,owner_id uuid,last_contacted_at timestamptz,email_id uuid,whatsapp_id uuid,email_reason text,whatsapp_reason text,recent boolean)
language sql stable security invoker set search_path='' as $$
 with candidates as (
  select c.contact_id,coalesce(nullif(trim(concat_ws(' ',c.first_name,c.last_name)),''),'Unnamed contact') name,lower(trim(c.email)) email,
    public.client_normalize_phone(c.phone) phone,l.lead_id,
    lower(coalesce(nullif(l.lead_category,''),c.contact_type,'')) role,coalesce(l.stage,'') stage,
    coalesce(to_jsonb(l)->>'area_interest','') area,coalesce(l.assigned_user_id,l.assigned_agent_id,c.assigned_agent_id) owner_id,
    coalesce(lower(l.status),'') in ('closed','closed_won','closed_lost','won','lost','archived','deleted','converted') or coalesce(lower(l.stage),'') in ('closed','closed_won','closed_lost','won','lost','archived','deleted','converted') closed,
    em.id email_id,em.is_valid_email,coalesce(public.client_tags_for_contact(c.organisation_id,c.contact_id),em.tags,'{}') tags,l.budget,
    wm.id whatsapp_id,wm.consent_status wa_consent,wm.opted_out_at,wm.consent_at,
    pref.marketing_consent_status email_consent,pref.unsubscribed_at,
    exists(select 1 from public.email_suppressions s where s.organisation_id=p_org and s.email=lower(trim(c.email))) suppressed,
    exists(select 1 from public.contact_email_subscriptions s join public.email_subscription_types t on t.id=s.subscription_type_id and t.organisation_id=s.organisation_id and t.is_active where s.organisation_id=p_org and s.email=lower(trim(c.email)) and s.subscription_type_id=p_subscription and s.status='subscribed') subscribed,
    greatest(
      (select max(a.activity_date) from public.lead_activities a join public.leads al on al.lead_id=a.lead_id and al.organisation_id=a.organisation_id where a.organisation_id=p_org and al.contact_id=c.contact_id and lower(a.activity_type) in ('call','phone call','email','whatsapp','meeting','viewing') and lower(a.outcome) in ('contacted','connected','sent','delivered','completed','replied')),
      (select max(r.sent_at) from public.email_campaign_recipients r where r.organisation_id=p_org and r.email=lower(trim(c.email))),
      (select max(r.sent_at) from public.whatsapp_campaign_recipients r where r.organisation_id=p_org and r.phone=public.client_normalize_phone(c.phone))
    ) direct_last_contacted_at,
    to_jsonb(array_remove(array[lower(c.contact_type),lower(l.lead_category)],null)) roles
  from public.contacts c left join public.leads l on l.contact_id=c.contact_id and l.organisation_id=c.organisation_id and coalesce(l.lead_domain,'agency')='agency'
  left join public.email_marketing_contacts em on em.organisation_id=c.organisation_id and em.email=lower(trim(c.email))
  left join public.contact_marketing_preferences pref on pref.organisation_id=c.organisation_id and pref.email=lower(trim(c.email))
  left join public.whatsapp_marketing_contacts wm on wm.organisation_id=c.organisation_id and wm.phone=public.client_normalize_phone(c.phone)
  where c.organisation_id=p_org and auth.uid() is not null and public.bridge_is_active_member(p_org)
    and (not exists(select 1 from public.leads other where other.contact_id=c.contact_id and other.organisation_id=p_org and coalesce(other.lead_domain,'agency')<>'agency') or l.lead_id is not null)
 ), contacted as (
  select c.*,greatest(
    max(direct_last_contacted_at) over(partition by coalesce(nullif(email,''),contact_id::text)),
    max(direct_last_contacted_at) over(partition by coalesce(nullif(phone,''),contact_id::text))
  ) last_contacted_at from candidates c
 ), matched as (
  select distinct on(c.contact_id) c.* from contacted c
  where (not (p_definition->>'excludeClosed')::boolean or not c.closed)
    and public.marketing_audience_matches(jsonb_build_object('role',c.roles,'stage',c.stage,'area',array[c.area],'owner',c.owner_id,'tags',c.tags,'budget',c.budget),p_definition)
  order by c.contact_id,c.lead_id nulls last
 ), reasoned as (
  select m.*,
   case when not public.email_campaign_can_send(p_org) then 'Email sending access required'
     when nullif(m.email,'') is null then 'No email address'
     when m.email_id is null or not coalesce(m.is_valid_email,false) then 'Not a valid email marketing contact'
     when m.suppressed then 'Email suppressed'
     when m.email_consent is distinct from 'opted_in' or m.unsubscribed_at is not null then 'Email permission not recorded'
     when p_subscription is null then 'Choose an email subscription category'
     when not m.subscribed then 'Not subscribed to this category' else null end er,
   case when m.phone !~ '^[1-9][0-9]{7,14}$' then 'Use an international phone number'
     when m.whatsapp_id is null then 'Not a WhatsApp marketing contact'
     when m.wa_consent is distinct from 'opted_in' or m.opted_out_at is not null or m.consent_at is null or m.consent_at>now() then 'WhatsApp permission not recorded' else null end wr,
   m.last_contacted_at >= now()-make_interval(days=>case when (p_definition->>'quietDays')::integer=0 then 7 else (p_definition->>'quietDays')::integer end) recent
  from matched m
 )
 select r.contact_id,r.name,r.email,r.phone,r.role,r.stage,r.area,r.owner_id,r.last_contacted_at,r.email_id,r.whatsapp_id,
   case when (p_definition->>'quietDays')::integer>0 and coalesce(r.recent,false) then 'Contacted within the quiet period' else r.er end,
   case when (p_definition->>'quietDays')::integer>0 and coalesce(r.recent,false) then 'Contacted within the quiet period' else r.wr end,
   coalesce(r.recent,false)
 from reasoned r;
$$;

create or replace function public.email_audience_rule_matches(
  p_contact public.email_marketing_contacts,
  p_rule jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_operator text := lower(coalesce(p_rule ->> 'operator', 'in'));
  v_group_operator text := upper(coalesce(p_rule ->> 'operator', 'AND'));
  v_field text := lower(coalesce(p_rule ->> 'field', ''));
  v_values text[];
  v_value text;
  v_match boolean;
  v_child jsonb;
begin
  p_contact.tags:=coalesce(arch9_client_private.client_tags_for_email(p_contact.organisation_id,p_contact.email),p_contact.tags);
  if jsonb_typeof(p_rule -> 'rules') = 'array' then
    v_match := case when v_group_operator = 'OR' then false else true end;
    for v_child in select value from jsonb_array_elements(p_rule -> 'rules') loop
      if v_group_operator = 'OR' then
        v_match := v_match or public.email_audience_rule_matches(p_contact, v_child);
      else
        v_match := v_match and public.email_audience_rule_matches(p_contact, v_child);
      end if;
    end loop;
    return v_match;
  end if;

  if jsonb_typeof(p_rule -> 'value') = 'array' then
    select coalesce(array_agg(lower(btrim(value))), '{}') into v_values
    from jsonb_array_elements_text(p_rule -> 'value');
  else
    v_values := array[lower(btrim(coalesce(p_rule ->> 'value', '')))];
  end if;
  v_values := array_remove(v_values, '');
  if coalesce(array_length(v_values, 1), 0) = 0 then return false; end if;

  v_value := case v_field
    when 'contact_type' then lower(coalesce(p_contact.role_type, ''))
    when 'lead_stage' then lower(coalesce(p_contact.lead_stage, ''))
    when 'assigned_agent' then coalesce(p_contact.assigned_user_id::text, '')
    when 'branch' then coalesce(p_contact.branch_id::text, '')
    when 'preferred_area' then lower(coalesce(p_contact.area, ''))
    else ''
  end;

  if v_field = 'tags' then
    v_match := exists (
      select 1 from unnest(p_contact.tags) tag where lower(tag) = any(v_values)
    );
  elsif v_operator = 'contains' then
    v_match := exists (select 1 from unnest(v_values) candidate where v_value like '%' || candidate || '%');
  else
    v_match := v_value = any(v_values);
  end if;

  if v_operator in ('is_not', 'not_in', 'is_none_of') then return not v_match; end if;
  return v_match;
end;
$$;

create or replace function public.email_campaign_contact_filter_matches(p_contact public.email_marketing_contacts,p_filter jsonb)
returns boolean language plpgsql stable security invoker set search_path='' as $$
begin
 p_contact.tags:=coalesce(arch9_client_private.client_tags_for_email(p_contact.organisation_id,p_contact.email),p_contact.tags);
 return (select coalesce(jsonb_typeof(p_filter)='object'
  and (p_filter->>'role_type' is null or p_contact.role_type=p_filter->>'role_type')
  and (p_filter->>'branch_id' is null or p_contact.branch_id::text=p_filter->>'branch_id')
  and (p_filter->>'assigned_user_id' is null or p_contact.assigned_user_id::text=p_filter->>'assigned_user_id')
  and (p_filter->>'lead_stage' is null or p_contact.lead_stage=p_filter->>'lead_stage')
  and (p_filter->>'area' is null or p_contact.area=p_filter->>'area')
  and (p_filter->>'tag' is null or p_filter->>'tag'=any(p_contact.tags))
  and (coalesce(jsonb_array_length(p_filter->'contact_ids'),0)=0 or p_contact.id::text in(select value from jsonb_array_elements_text(p_filter->'contact_ids')))
  and (coalesce(jsonb_typeof(p_filter->'rules'),'')<>'array' or public.email_audience_rule_matches(p_contact,p_filter)),false));
end $$;

create or replace function public.email_campaign_preview_audience(
  p_organisation_id uuid,
  p_subscription_type_id uuid,
  p_filter jsonb default '{}'::jsonb
) returns integer language plpgsql stable security definer set search_path = public as $$
declare v_count integer; v_rules jsonb;
begin
  if p_organisation_id is null or p_subscription_type_id is null then return 0; end if;
  if not public.bridge_has_organisation_membership(p_organisation_id) then raise exception 'Not authorised.' using errcode = '42501'; end if;
  v_rules := public.email_campaign_resolve_audience_rules(p_organisation_id, p_filter);
  select count(*)::integer into v_count
  from public.email_marketing_contacts c
  left join public.email_suppressions s on s.organisation_id=c.organisation_id and s.email=c.email
  join public.contact_marketing_preferences p on p.organisation_id=c.organisation_id and p.email=c.email and p.marketing_consent_status='opted_in'
  join public.contact_email_subscriptions cs on cs.organisation_id=c.organisation_id and cs.email=c.email and cs.subscription_type_id=p_subscription_type_id and cs.status='subscribed'
  where c.organisation_id=p_organisation_id and c.is_valid_email and s.id is null
    and (c.source_type<>'crm' or arch9_client_private.email_contact_visible(c.organisation_id,c.email))
    and public.email_campaign_contact_filter_matches(c,v_rules);
  return coalesce(v_count,0);
end $$;

create or replace function public.email_campaign_prepare_dispatch(p_campaign_id uuid, p_send_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_campaign public.email_campaigns%rowtype; v_count integer; v_rules jsonb;
begin
  select * into v_campaign from public.email_campaigns where id = p_campaign_id for update;
  if not found or not public.email_campaign_can_send(v_campaign.organisation_id) then raise exception 'Not authorised to schedule this campaign.' using errcode = '42501'; end if;
  if v_campaign.status not in ('draft','scheduled') then raise exception 'Only an unsent campaign can be scheduled.' using errcode = '22023'; end if;
  if v_campaign.subscription_type_id is null or not exists (select 1 from public.email_subscription_types st where st.id=v_campaign.subscription_type_id and st.organisation_id=v_campaign.organisation_id and st.is_active) then raise exception 'Choose an active email subscription type before scheduling.' using errcode = '22023'; end if;
  if exists (select 1 from public.email_sending_policies sp where sp.organisation_id=v_campaign.organisation_id and sp.paused_at is not null) then raise exception 'Sending is paused for this organisation.' using errcode = '22023'; end if;
  if not public.email_campaign_sender_ready(v_campaign.organisation_id,v_campaign.sender_identity_id) then raise exception 'Choose a ready sender before scheduling.' using errcode='22023'; end if;
  if not exists(select 1 from public.email_sending_policies p where p.organisation_id=v_campaign.organisation_id and p.approved_at is not null and p.paused_at is null and p.manual_paused_at is null and not p.self_service_blocked) then raise exception 'Organisation sending is not approved and active.' using errcode='42501'; end if;
  v_rules := public.email_campaign_resolve_audience_rules(v_campaign.organisation_id, v_campaign.audience_filter);
  insert into public.email_campaign_recipients (organisation_id, campaign_id, contact_id, email, recipient_snapshot)
  select c.organisation_id, v_campaign.id, c.id, c.email, jsonb_build_object('first_name',c.first_name,'last_name',c.last_name,'full_name',c.full_name,'agent_name','', 'agency_name','', 'branch_name','')
  from public.email_marketing_contacts c
  left join public.email_suppressions s on s.organisation_id=c.organisation_id and s.email=c.email
  left join public.contact_marketing_preferences p on p.organisation_id=c.organisation_id and p.email=c.email
  join public.contact_email_subscriptions cs on cs.organisation_id=c.organisation_id and cs.email=c.email and cs.subscription_type_id=v_campaign.subscription_type_id and cs.status='subscribed'
  where c.organisation_id=v_campaign.organisation_id and c.is_valid_email and s.id is null
    and (c.source_type<>'crm' or arch9_client_private.email_contact_visible(c.organisation_id,c.email)) and coalesce(p.marketing_consent_status,'unknown') = 'opted_in'
    and public.email_campaign_contact_filter_matches(c,v_rules)
  on conflict (campaign_id,email) do nothing;
  get diagnostics v_count = row_count;
  update public.email_campaigns set status = case when p_send_at <= now() then 'sending' else 'scheduled' end, scheduled_for=p_send_at, audience_snapshot_at=coalesce(audience_snapshot_at,now()), updated_by=auth.uid() where id=v_campaign.id;
  insert into public.email_campaign_audit_events (organisation_id,campaign_id,actor_id,event_type,metadata) values (v_campaign.organisation_id,v_campaign.id,auth.uid(),'scheduled',jsonb_build_object('scheduled_for',p_send_at,'eligible_recipients',v_count));
  insert into public.email_campaign_dispatch_jobs (campaign_id, organisation_id, run_at) values (v_campaign.id, v_campaign.organisation_id, p_send_at) on conflict (campaign_id) do update set run_at=excluded.run_at, status='queued', last_error=null, locked_at=null;
  perform public.email_campaign_quote_usage(v_campaign.id,(select count(*)::integer from public.email_campaign_recipients where campaign_id=v_campaign.id));
  return jsonb_build_object('campaign_id',v_campaign.id,'added_recipients',v_count,'scheduled_for',p_send_at);
end $$;

-- Existing data is not backfilled here. Reviewed releases explicitly refresh
-- each permitted agency/developer organisation through the service-only API.
commit;
