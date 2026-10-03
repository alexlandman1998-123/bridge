begin;
-- Agent handoff links are bookkeeping, not amendments to the landlord's declaration.
create function public.rental_landlord_onboarding_link_property(p_lead_id uuid,p_expected_version integer,p_payload jsonb,p_scope jsonb,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.leads; s public.rental_landlord_onboarding; m jsonb; entry jsonb; updated jsonb; k text; parent_key text; idx integer; linked public.private_listings;
begin
 select * into l from public.leads where lead_id=p_lead_id for update;
 if not found or p_actor is null or l.organisation_id::text is distinct from p_scope->>'organisation_id' then raise exception 'Landlord unavailable in this scope'; end if;
 foreach k in array array['branch_id','assigned_agent_id','assigned_user_id'] loop
  if p_scope ? k and (to_jsonb(l)->k) is distinct from p_scope->k then raise exception 'Landlord scope changed; reopen onboarding'; end if;
 end loop;
 m:=coalesce(l.raw_enquiry_payload->'rentalCrm',l.raw_enquiry_payload->'rental_crm',l.raw_enquiry_payload,'{}');
 if m->>'role' is distinct from 'landlord' then raise exception 'Choose a landlord lead'; end if;
 select value,(ordinality-1)::integer into entry,idx from jsonb_array_elements(coalesce(m->'landlordPortfolio','[]')) with ordinality where value->>'id'=p_payload->>'propertyId';
 if not found or nullif(entry->>'canonicalPropertyId','') is null then raise exception 'Choose a linked managed property'; end if;
 if not exists(select 1 from public.rental_properties where id::text=entry->>'canonicalPropertyId' and organisation_id=l.organisation_id and (l.branch_id is null or branch_id=l.branch_id)) then raise exception 'Managed property outside landlord scope'; end if;
 updated:=entry;
 if p_payload ? 'mandateId' then
  if nullif(entry->>'mandateId','') is not null and entry->>'mandateId' is distinct from p_payload->>'mandateId' then raise exception 'Property already linked to another mandate'; end if;
  if not exists(select 1 from public.rental_property_mandates where id::text=p_payload->>'mandateId' and organisation_id=l.organisation_id and property_id::text=entry->>'canonicalPropertyId' and mandate_status='active' and metadata_json->>'leadId'=l.lead_id::text) then raise exception 'Current active mandate required for this property'; end if;
  updated:=jsonb_set(updated,'{mandateId}',p_payload->'mandateId');
 end if;
 if p_payload ? 'listingId' then
  if nullif(entry->>'listingId','') is not null and entry->>'listingId' is distinct from p_payload->>'listingId' then raise exception 'Property already linked to another listing'; end if;
  select * into linked from public.private_listings where id::text=p_payload->>'listingId' for share;
  if not found or linked.organisation_id is distinct from l.organisation_id or (l.branch_id is not null and linked.branch_id is distinct from l.branch_id) then raise exception 'Listing outside landlord scope'; end if;
  if not exists(select 1 from public.rental_property_mandates where organisation_id=l.organisation_id and property_id::text=entry->>'canonicalPropertyId' and mandate_status='active' and metadata_json->>'leadId'=l.lead_id::text) then raise exception 'Current active mandate required for this property'; end if;
  updated:=jsonb_set(updated,'{listingId}',p_payload->'listingId');
 end if;
 if not(p_payload ? 'mandateId' or p_payload ? 'listingId') then raise exception 'Choose a mandate or listing link'; end if;
 insert into public.rental_landlord_onboarding(lead_id,organisation_id) values(l.lead_id,l.organisation_id) on conflict do nothing;
 select * into s from public.rental_landlord_onboarding where lead_id=l.lead_id for update;
 if updated=entry then return jsonb_build_object('version',s.version,'status',s.status); end if;
 if s.version is distinct from p_expected_version then raise exception 'Landlord onboarding changed; reopen before linking'; end if;
 if p_payload ? 'expectedDiscovery' and rental_private.landlord_discovery(l.raw_enquiry_payload) is distinct from p_payload->'expectedDiscovery' then raise exception 'Landlord discovery changed; reopen before linking'; end if;
 m:=jsonb_set(m,array['landlordPortfolio',idx::text],updated);
 parent_key:=case when l.raw_enquiry_payload ? 'rentalCrm' then 'rentalCrm' when l.raw_enquiry_payload ? 'rental_crm' then 'rental_crm' else null end;
 perform set_config('app.rental_landlord_onboarding','on',true);
 update public.leads set raw_enquiry_payload=case when parent_key is null then m else jsonb_set(l.raw_enquiry_payload,array[parent_key],m) end where lead_id=l.lead_id;
 perform set_config('app.rental_landlord_onboarding','off',true);
 update public.rental_landlord_onboarding set version=version+1,updated_at=now() where lead_id=l.lead_id returning * into s;
 insert into public.rental_landlord_onboarding_events(lead_id,version,command,source,actor_id,payload_json) values(l.lead_id,s.version,'link_property','agent',p_actor,p_payload-'expectedDiscovery');
 return jsonb_build_object('version',s.version,'status',s.status);
end; $$;
revoke all on function public.rental_landlord_onboarding_link_property(uuid,integer,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.rental_landlord_onboarding_link_property(uuid,integer,jsonb,jsonb,uuid) to service_role;
commit;
