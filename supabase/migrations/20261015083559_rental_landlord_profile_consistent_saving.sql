begin;

-- Clients can check support before attempting a save against an older schema.
alter function public.rental_landlord_onboarding_snapshot(uuid,jsonb) rename to rental_landlord_onboarding_snapshot_before_profile_sync;
revoke all on function public.rental_landlord_onboarding_snapshot_before_profile_sync(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.rental_landlord_onboarding_snapshot(p_lead_id uuid,p_scope jsonb) returns jsonb
language sql security definer set search_path='' as $$
  select public.rental_landlord_onboarding_snapshot_before_profile_sync(p_lead_id,p_scope)||jsonb_build_object('capabilities',jsonb_build_object('profileConsistency',true));
$$;
revoke all on function public.rental_landlord_onboarding_snapshot(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.rental_landlord_onboarding_snapshot(uuid,jsonb) to service_role;

create function rental_private.landlord_profile_consistency_guard() returns trigger
language plpgsql set search_path='' as $$
declare previous jsonb; incoming jsonb;
begin
  if tg_op='UPDATE' then previous:=coalesce(old.raw_enquiry_payload->'rentalCrm',old.raw_enquiry_payload->'rental_crm',old.raw_enquiry_payload)->'landlordProfileConsistency'; end if;
  incoming:=coalesce(new.raw_enquiry_payload->'rentalCrm',new.raw_enquiry_payload->'rental_crm',new.raw_enquiry_payload)->'landlordProfileConsistency';
  if incoming is distinct from previous and current_setting('app.rental_landlord_profile_projection',true) is distinct from 'on' then raise exception 'Save landlord consistency through the versioned profile workflow'; end if;
  return new;
end; $$;
revoke all on function rental_private.landlord_profile_consistency_guard() from public,anon,authenticated,service_role;
create trigger rental_landlord_profile_consistency_guard before insert or update of raw_enquiry_payload on public.leads for each row execute function rental_private.landlord_profile_consistency_guard();

-- All projections run in the existing versioned save transaction. No backfill,
-- identity merge, role change, publication request or document rewrite occurs.
create function rental_private.project_landlord_profile(p_lead_id uuid,p_source text,p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.leads; c public.contacts; m jsonb; p jsonb; core jsonb; v_client_id uuid; contact_client uuid;
  client public.agency_client_profiles; listing public.private_listings; ids text[]; listing_key text; facts jsonb; capture jsonb; parent_key text; phone_key text; client_changed boolean; previous_projection text;
begin
  select * into l from public.leads where lead_id=p_lead_id for update;
  m:=coalesce(l.raw_enquiry_payload->'rentalCrm',l.raw_enquiry_payload->'rental_crm',l.raw_enquiry_payload,'{}');
  if m->>'role' is distinct from 'landlord' then raise exception 'Choose a landlord lead'; end if;
  p:=coalesce(m->'landlordProfile','{}');
  if nullif(btrim(p->>'name'),'') is null or (nullif(btrim(p->>'email'),'') is null and nullif(btrim(p->>'phone'),'') is null) then raise exception 'Complete the landlord name and contact details before saving'; end if;
  if nullif(btrim(p->>'email'),'') is not null and btrim(p->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid landlord email'; end if;
  select * into c from public.contacts where contact_id=l.contact_id and organisation_id=l.organisation_id for update;
  if not found then raise exception 'Link this landlord to a saved Client before saving its profile'; end if;
  -- Only exact source links select identities. Changed contact details never
  -- choose or merge a different client by a matching name/email/phone.
  perform arch9_client_private.attach_source(l.organisation_id,'contact',c.contact_id,concat_ws(' ',c.first_name,c.last_name),c.email,c.phone);
  perform arch9_client_private.attach_source(l.organisation_id,'lead',l.lead_id,concat_ws(' ',c.first_name,c.last_name),c.email,c.phone,'contact',c.contact_id);
  select a.client_id into v_client_id from public.agency_client_links a where a.organisation_id=l.organisation_id and a.source_kind='lead' and a.source_id=l.lead_id;
  select a.client_id into contact_client from public.agency_client_links a where a.organisation_id=l.organisation_id and a.source_kind='contact' and a.source_id=c.contact_id;
  if v_client_id is null or v_client_id is distinct from contact_client then raise exception 'The landlord and contact have different Client identities; review their connection before saving'; end if;
  select * into client from public.agency_client_profiles where id=v_client_id and organisation_id=l.organisation_id for update;
  if not found or client.merged_into is not null then raise exception 'The saved Client connection changed; reopen this landlord'; end if;
  if exists(select 1 from public.agency_client_identifiers a where a.organisation_id=l.organisation_id and a.kind='email' and a.value=lower(btrim(p->>'email')) and a.client_id<>v_client_id) then raise exception 'This email belongs to another Client; review the identities before saving'; end if;
  phone_key:=regexp_replace(coalesce(p->>'phone',''),'[^0-9]','','g');
  if phone_key ~ '^0[0-9]{9}$' then phone_key:='27'||substr(phone_key,2); end if;
  if nullif(btrim(p->>'email'),'') is not null then insert into public.agency_client_identifiers(organisation_id,client_id,kind,value) values(l.organisation_id,v_client_id,'email',lower(btrim(p->>'email'))) on conflict do nothing; end if;
  if phone_key<>'' then insert into public.agency_client_identifiers(organisation_id,client_id,kind,value) values(l.organisation_id,v_client_id,'phone',phone_key) on conflict do nothing; end if;
  client_changed:=(client.name,client.primary_email,client.primary_phone) is distinct from (btrim(p->>'name'),nullif(lower(btrim(p->>'email')),''),nullif(phone_key,''));
  -- Keep former identifiers as aliases and keep the same client/contact IDs.
  update public.agency_client_profiles set name=btrim(p->>'name'),primary_email=nullif(lower(btrim(p->>'email')),''),primary_phone=nullif(phone_key,''),version=version+1,updated_at=now()
  where id=v_client_id and (name,primary_email,primary_phone) is distinct from (btrim(p->>'name'),nullif(lower(btrim(p->>'email')),''),nullif(phone_key,''));
  update public.contacts set first_name=split_part(btrim(p->>'name'),' ',1),last_name=substr(btrim(p->>'name'),length(split_part(btrim(p->>'name'),' ',1))+2),email=coalesce(btrim(p->>'email'),''),phone=coalesce(btrim(p->>'phone'),'')
  where contact_id=c.contact_id and organisation_id=l.organisation_id and (concat_ws(' ',first_name,nullif(last_name,'')),coalesce(email,''),coalesce(phone,'')) is distinct from (btrim(p->>'name'),coalesce(btrim(p->>'email'),''),coalesce(btrim(p->>'phone'),''));
  core:=jsonb_build_object('landlordName',btrim(p->>'name'),'landlordEmail',coalesce(btrim(p->>'email'),''),'landlordPhone',coalesce(btrim(p->>'phone'),''),'landlordType',coalesce(p->>'type','individual'),'landlordContactId',c.contact_id::text,'landlordLeadId',l.lead_id::text);
  select array_agg(distinct value order by value) into ids from (
    select row->>'listingId' value from jsonb_array_elements(coalesce(m->'landlordPortfolio','[]')) row
    union select coalesce(nullif(m#>>'{relationships,listingId}',''),nullif(m#>>'{relationships,listing_id}',''),nullif(m#>>'{relationship_refs,listingId}',''),nullif(m#>>'{relationship_refs,listing_id}',''),nullif(m->>'listingId',''),nullif(m->>'listing_id',''),nullif(to_jsonb(l)->>'listing_id',''),nullif(to_jsonb(l)->>'enquired_listing_id',''))
  ) s where nullif(value,'') is not null;
  foreach listing_key in array coalesce(ids,array[]::text[]) loop
    select * into listing from public.private_listings where id::text=listing_key and organisation_id=l.organisation_id for update;
    if not found or listing.listing_category is distinct from 'rental' or (l.branch_id is not null and listing.branch_id is distinct from l.branch_id) then raise exception 'A linked rental listing is unavailable in this landlord workspace'; end if;
    facts:=coalesce(listing.seller_canonical_facts_json,'{}');
    if (nullif(facts->>'landlordLeadId','') is not null and facts->>'landlordLeadId'<>l.lead_id::text) or (nullif(facts->>'landlordContactId','') is not null and facts->>'landlordContactId'<>c.contact_id::text) then raise exception 'A linked rental listing belongs to another landlord; review its connection'; end if;
    facts:=facts||core;
    capture:=facts->'rentalCaptureDraft';
    if capture->>'version'='1' and jsonb_typeof(capture->'form')='object' then facts:=jsonb_set(facts,'{rentalCaptureDraft,form}',capture->'form'||(core-'landlordContactId'-'landlordLeadId')); end if;
    update public.private_listings set seller_canonical_facts_json=facts,seller_type=core->>'landlordType',seller_canonical_fact_readiness_json=coalesce(seller_canonical_fact_readiness_json,'{}')||jsonb_build_object('landlordName',true,'landlordContact',true),seller_canonical_facts_updated_at=now()
    where id=listing.id and (seller_canonical_facts_json,seller_type) is distinct from (facts,core->>'landlordType');
  end loop;
  m:=jsonb_set(m,'{landlordProfileConsistency}',jsonb_build_object('version',1,'clientId',v_client_id,'contactId',c.contact_id,'syncedAt',now(),'capturedCore',jsonb_build_object('name',btrim(p->>'name'),'email',coalesce(btrim(p->>'email'),''),'phone',coalesce(btrim(p->>'phone'),''),'type',coalesce(p->>'type','individual'))));
  parent_key:=case when l.raw_enquiry_payload ? 'rentalCrm' then 'rentalCrm' when l.raw_enquiry_payload ? 'rental_crm' then 'rental_crm' else null end;
  previous_projection:=current_setting('app.rental_landlord_profile_projection',true);
  perform set_config('app.rental_landlord_profile_projection','on',true);
  update public.leads set raw_enquiry_payload=case when parent_key is null then m else jsonb_set(l.raw_enquiry_payload,array[parent_key],m) end where lead_id=l.lead_id;
  perform set_config('app.rental_landlord_profile_projection',coalesce(previous_projection,''),true);
  if client_changed and current_setting('app.rental_landlord_client_projection',true) is distinct from 'on' then perform rental_private.sync_landlord_client_profiles(v_client_id,p_source,p_actor,l.lead_id); end if;
  return jsonb_build_object('synced',true);
end; $$;
revoke all on function rental_private.project_landlord_profile(uuid,text,uuid) from public,anon,authenticated,service_role;

alter function public.rental_landlord_onboarding_command(uuid,integer,text,jsonb,jsonb,text,uuid) rename to rental_landlord_onboarding_command_before_profile_sync;
revoke all on function public.rental_landlord_onboarding_command_before_profile_sync(uuid,integer,text,jsonb,jsonb,text,uuid) from public,anon,authenticated,service_role;
create function public.rental_landlord_onboarding_command(p_lead_id uuid,p_expected_version integer,p_command text,p_payload jsonb,p_scope jsonb,p_source text,p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  -- Match the Client editor's lock order before taking the existing lead lock.
  perform pg_advisory_xact_lock(hashtextextended(p_scope->>'organisation_id',0));
  result:=public.rental_landlord_onboarding_command_before_profile_sync(p_lead_id,p_expected_version,p_command,p_payload,p_scope,p_source,p_actor);
  if p_command='save' then result:=result||jsonb_build_object('consistency',rental_private.project_landlord_profile(p_lead_id,p_source,p_actor)); end if;
  return result;
end; $$;
revoke all on function public.rental_landlord_onboarding_command(uuid,integer,text,jsonb,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.rental_landlord_onboarding_command(uuid,integer,text,jsonb,jsonb,text,uuid) to service_role;

-- Cascade only through permanent, exact Client links. The original source and
-- actor are retained; aliases never select unrelated journeys. The recursion
-- marker is internal, and the helper is not executable by application roles.
create function rental_private.sync_landlord_client_profiles(p_client_id uuid,p_source text,p_actor uuid,p_exclude_lead uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare client public.agency_client_profiles; l public.leads; m jsonb; p jsonb; s public.rental_landlord_onboarding; phone_key text; previous_marker text;
begin
  select * into client from public.agency_client_profiles where id=p_client_id;
  if (select count(distinct coalesce(coalesce(lead.raw_enquiry_payload->'rentalCrm',lead.raw_enquiry_payload->'rental_crm',lead.raw_enquiry_payload)#>>'{landlordProfile,type}','individual'))
      from public.leads lead join public.agency_client_links link on link.source_kind='lead' and link.source_id=lead.lead_id and link.organisation_id=lead.organisation_id
      where link.client_id=p_client_id and coalesce(lead.raw_enquiry_payload->'rentalCrm',lead.raw_enquiry_payload->'rental_crm',lead.raw_enquiry_payload)->>'role'='landlord')>1 then
    raise exception 'Linked landlord profiles use different ownership types; review their Client connections before saving';
  end if;
  previous_marker:=current_setting('app.rental_landlord_client_projection',true);
  perform set_config('app.rental_landlord_client_projection','on',true);
  for l in select lead.* from public.leads lead join public.agency_client_links link on link.source_kind='lead' and link.source_id=lead.lead_id and link.organisation_id=lead.organisation_id
    where link.client_id=p_client_id and (p_exclude_lead is null or lead.lead_id<>p_exclude_lead) and coalesce(lead.raw_enquiry_payload->'rentalCrm',lead.raw_enquiry_payload->'rental_crm',lead.raw_enquiry_payload)->>'role'='landlord' order by lead.lead_id for update of lead loop
    m:=coalesce(l.raw_enquiry_payload->'rentalCrm',l.raw_enquiry_payload->'rental_crm',l.raw_enquiry_payload,'{}');
    p:=coalesce(m->'landlordProfile','{}');
    phone_key:=regexp_replace(coalesce(p->>'phone',''),'[^0-9]','','g');
    if phone_key ~ '^0[0-9]{9}$' then phone_key:='27'||substr(phone_key,2); end if;
    if (btrim(p->>'name'),nullif(lower(btrim(p->>'email')),''),nullif(phone_key,'')) is not distinct from (client.name,client.primary_email,client.primary_phone) then continue; end if;
    p:=p||jsonb_build_object('name',client.name,'email',coalesce(client.primary_email,''),'phone',coalesce(client.primary_phone,''));
    select * into s from public.rental_landlord_onboarding where lead_id=l.lead_id for update;
    perform public.rental_landlord_onboarding_command(l.lead_id,coalesce(s.version,0),'save',jsonb_build_object('profile',p,'expectedDiscovery',rental_private.landlord_discovery(l.raw_enquiry_payload)),jsonb_build_object('organisation_id',l.organisation_id,'branch_id',l.branch_id), p_source,p_actor);
  end loop;
  perform set_config('app.rental_landlord_client_projection',coalesce(previous_marker,''),true);
end; $$;
revoke all on function rental_private.sync_landlord_client_profiles(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;

-- Client edits still use the existing owner/principal permission and optimistic
-- version checks. A submitted journey rolls back the entire update.
alter function arch9_client_private.update_client(uuid,integer,text,text[],text[]) rename to update_client_before_landlord_sync;
revoke all on function arch9_client_private.update_client_before_landlord_sync(uuid,integer,text,text[],text[]) from public,anon,authenticated,service_role;
create function arch9_client_private.update_client(p_client_id uuid,p_expected_version integer,p_name text,p_emails text[],p_phones text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result:=arch9_client_private.update_client_before_landlord_sync(p_client_id,p_expected_version,p_name,p_emails,p_phones);
  perform rental_private.sync_landlord_client_profiles(p_client_id,'agent',auth.uid());
  select to_jsonb(c) into result from public.agency_client_profiles c where id=p_client_id;
  return result;
end; $$;
revoke all on function arch9_client_private.update_client(uuid,integer,text,text[],text[]) from public,anon,service_role;
grant execute on function arch9_client_private.update_client(uuid,integer,text,text[],text[]) to authenticated;
create or replace function public.agency_client_update(p_client_id uuid,p_expected_version integer,p_name text,p_emails text[],p_phones text[]) returns jsonb
language sql security invoker set search_path='' as $$ select arch9_client_private.update_client(p_client_id,p_expected_version,p_name,p_emails,p_phones); $$;

commit;
