begin;

alter table public.private_listings add column rental_vacancy_id uuid references public.rental_vacancies(id) on delete restrict;
create unique index private_listings_rental_vacancy_unique on public.private_listings(rental_vacancy_id) where rental_vacancy_id is not null;

-- Explicit, retryable handoff. Existing stock is repaired only on agent action.
-- RLS and the caller's normal listing/property/unit permissions remain in force.
create function public.rental_ensure_listing_vacancy(p_listing_id uuid, p_organisation_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare l public.private_listings; u public.rental_units; v public.rental_vacancies; facts jsonb;
begin
  if auth.uid() is null or p_organisation_id is null or not coalesce(public.bridge_can_access_private_listing(p_listing_id),false) then
    raise exception 'You do not have access to connect this rental listing.' using errcode='42501';
  end if;
  select * into l from public.private_listings where id=p_listing_id and organisation_id=p_organisation_id for update;
  if not found or l.listing_category is distinct from 'rental' then raise exception 'Choose a rental listing in this organisation.' using errcode='42501'; end if;
  facts:=coalesce(l.seller_canonical_facts_json,'{}');
  if coalesce(facts#>>'{rentalInfo,rentalPriceFrequency}','monthly') <> 'monthly' then
    return jsonb_build_object('listingId',l.id,'applicable',false);
  end if;
  if l.rental_property_id is null or l.rental_unit_id is null then
    update public.private_listings set address_line_1=address_line_1 where id=l.id returning * into l;
    if not found or l.rental_property_id is null or l.rental_unit_id is null then raise exception 'Save a complete rental address and select its managed unit first.'; end if;
  end if;
  select * into u from public.rental_units where id=l.rental_unit_id for update;
  if not found or u.property_id is distinct from l.rental_property_id or u.organisation_id is distinct from l.organisation_id or u.branch_id is distinct from l.branch_id then
    raise exception 'The rental listing must use a unit in its managed property and branch.' using errcode='42501';
  end if;
  if l.rental_vacancy_id is not null then
    select * into v from public.rental_vacancies where id=l.rental_vacancy_id;
    if not found or v.organisation_id is distinct from l.organisation_id or v.property_id is distinct from l.rental_property_id or v.unit_id is distinct from u.id or v.branch_id is distinct from l.branch_id then
      raise exception 'The saved vacancy does not match this rental listing.' using errcode='42501';
    end if;
  else
    if l.listing_status in ('withdrawn','deleted','sold','let','rented') or l.listing_visibility in ('archived','deleted') then raise exception 'A closed rental listing cannot create a new vacancy.'; end if;
    if u.active_tenancy_id is not null or u.status not in ('vacant','marketing','application_pending','lease_pending') then raise exception 'This unit is occupied or unavailable for a new vacancy.'; end if;
    select * into v from public.rental_vacancies where unit_id=u.id and status in ('draft','preparing','marketing','applications_open','paused') for update;
    if found then
      if v.organisation_id is distinct from l.organisation_id or v.property_id is distinct from l.rental_property_id or v.branch_id is distinct from l.branch_id
        or exists(select 1 from public.private_listings where rental_vacancy_id=v.id and id<>l.id)
        or (nullif(v.metadata_json->>'sourceListingId','') is not null and v.metadata_json->>'sourceListingId'<>l.id::text) then
        raise exception 'This unit already has a vacancy connected to another listing.';
      end if;
    else
      insert into public.rental_vacancies(organisation_id,property_id,unit_id,branch_id,assigned_agent_id,status,available_from,asking_rent,deposit_amount,lease_term_months,metadata_json,created_by)
      values(l.organisation_id,l.rental_property_id,u.id,l.branch_id,l.assigned_agent_id,'draft',
        nullif(facts#>>'{rentalInfo,availableFrom}','')::date,coalesce(l.asking_price,0),
        coalesce(nullif(facts#>>'{rentalInfo,depositAmount}','')::numeric,0),
        nullif(nullif(facts#>>'{rentalInfo,leasePeriodMonths}','')::integer,0),jsonb_build_object('sourceListingId',l.id),auth.uid()) returning * into v;
    end if;
    update public.private_listings set rental_vacancy_id=v.id where id=l.id returning * into l;
    if not found then raise exception 'The rental vacancy was not linked. Reopen the listing before retrying.' using errcode='42501'; end if;
  end if;
  return jsonb_build_object('applicable',true,'listingId',l.id,'propertyId',l.rental_property_id,'unitId',u.id,'vacancyId',v.id,'vacancyStatus',v.status,'updatedAt',l.updated_at);
end;
$$;
revoke all on function public.rental_ensure_listing_vacancy(uuid,uuid) from public,anon;
grant execute on function public.rental_ensure_listing_vacancy(uuid,uuid) to authenticated;

-- Prevent direct writes from joining a listing to a foreign vacancy. Existing
-- links are immutable; another letting cycle needs its own listing/vacancy.
create function public.rental_validate_listing_vacancy()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and old.rental_vacancy_id is not null and new.rental_vacancy_id is distinct from old.rental_vacancy_id then raise exception 'The saved rental vacancy link cannot be replaced.'; end if;
  if new.rental_vacancy_id is not null and (new.listing_category is distinct from 'rental' or not exists(
    select 1 from public.rental_vacancies where id=new.rental_vacancy_id and organisation_id=new.organisation_id and property_id=new.rental_property_id and unit_id=new.rental_unit_id and branch_id is not distinct from new.branch_id)) then
    raise exception 'Rental listing and vacancy must share a property, unit, organisation and branch.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.rental_validate_listing_vacancy() from public,anon,authenticated;
create trigger zz_rental_validate_listing_vacancy before insert or update on public.private_listings for each row execute function public.rental_validate_listing_vacancy();

-- Retain the service-only, versioned onboarding handoff and declaration history.
create or replace function public.rental_landlord_onboarding_link_property(p_lead_id uuid,p_expected_version integer,p_payload jsonb,p_scope jsonb,p_actor uuid)
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
  if linked.listing_category is distinct from 'rental' or linked.rental_property_id::text is distinct from entry->>'canonicalPropertyId' then raise exception 'Rental listing must use this landlord property'; end if;
  if nullif(entry->>'canonicalUnitId','') is not null and linked.rental_unit_id::text is distinct from entry->>'canonicalUnitId' then raise exception 'Rental listing must use this landlord unit'; end if;
  if linked.rental_vacancy_id is null or not exists(select 1 from public.rental_vacancies where id=linked.rental_vacancy_id and property_id=linked.rental_property_id and unit_id=linked.rental_unit_id and organisation_id=l.organisation_id) then raise exception 'Connect the rental vacancy before linking this listing'; end if;
  updated:=updated||jsonb_build_object('listingId',linked.id,'canonicalUnitId',linked.rental_unit_id,'vacancyId',linked.rental_vacancy_id);
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
-- Shared contacts are reused, without changing their sales/tenant identity.
create function public.rental_validate_landlord_contact()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and new.party_id is not distinct from old.party_id and new.organisation_id is not distinct from old.organisation_id then return new; end if;
  if not exists(select 1 from public.contacts where contact_id=new.party_id and organisation_id=new.organisation_id) then raise exception 'Choose an existing landlord contact in this organisation.' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function public.rental_validate_landlord_contact() from public,anon,authenticated;
create trigger rental_validate_landlord_contact before insert or update of party_id,organisation_id on public.rental_property_landlords for each row execute function public.rental_validate_landlord_contact();

commit;
