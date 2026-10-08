begin;

-- Additive preview rules: existing base fingerprints and acceptance remain intact.
-- No saved checklist is changed until its parent discovery is explicitly saved.
alter function rental_private.landlord_definitions(jsonb) rename to landlord_definitions_base_v1;
create function rental_private.landlord_definitions(data jsonb)
returns table(subject_id text,scope_key text,purpose text,required boolean,fingerprint jsonb)
language plpgsql immutable set search_path='' as $$
declare profile jsonb:=coalesce(data->'profile','{}'); property jsonb; legal jsonb; rights jsonb;
begin
 return query select * from rental_private.landlord_definitions_base_v1(data);
 if coalesce(profile->>'type','') not in ('individual','multiple_owners','company','close_corporation','trust') then return; end if;
 legal:=rental_private.pick(profile,array['type','name','idNumber','registrationNumber','country','nationality']);
 required:=true;
 for property in select value from jsonb_array_elements(coalesce(data->'portfolio','[]')) loop
  if coalesce(property->>'id','')='' then continue; end if;
  scope_key:='property:'||(property->>'id');
  rights:=legal||jsonb_build_object('propertyId',coalesce(property->>'canonicalPropertyId',''),'ownershipType',coalesce(property->>'ownershipType',''),'address',coalesce(property->>'address',''),'unitNumber',coalesce(property->>'unitNumber',''),'complexName',coalesce(property->>'complexName',''),'conditionalRuleVersion','rental_landlord_conditional_v1');
  if property->>'serviceType'='managed_rental' then
   subject_id:='entity'; purpose:='payout_account'; fingerprint:=rights||rental_private.pick(property,array['payoutBeneficiaryType','payoutAccountHolder','payoutAccountReference']); return next;
   subject_id:='property'; purpose:='management_information'; fingerprint:=rights||jsonb_build_object('billingResponsibility',coalesce(property->>'billingResponsibility','')); return next;
   if property->>'payoutBeneficiaryType'='third_party' then
    subject_id:='entity'; purpose:='third_party_payee_authority'; fingerprint:=rights||rental_private.pick(property,array['payoutAccountHolder','payoutAccountReference']); return next;
   end if;
   if property->>'occupancyStatus'='tenanted' then
    subject_id:='property'; purpose:='existing_tenancy_pack'; fingerprint:=rights||jsonb_build_object('leaseEndDate',coalesce(property->>'leaseEndDate',''),'currentTenant',coalesce(property->>'currentTenant','')); return next;
   end if;
  end if;
  if property->>'ownershipType'='sectional_title' or property->>'schemeType' in ('body_corporate','hoa') then
   subject_id:='property'; purpose:='scheme_rules'; fingerprint:=rights||jsonb_build_object('schemeType',coalesce(property->>'schemeType','')); return next;
  end if;
 end loop;
end; $$;

-- Helpers remain internal to the existing scoped parent-save transaction.
revoke all on function rental_private.landlord_definitions(jsonb),rental_private.landlord_definitions_base_v1(jsonb) from public,anon,authenticated;

-- Record the additive rule revision without bumping the base rule version, which
-- would invalidate every previously accepted identity/disclosure assignment.
alter function rental_private.sync_checklist(uuid,uuid,uuid,jsonb,jsonb) rename to sync_checklist_before_landlord_conditionals;
create function rental_private.sync_checklist(p_org uuid,p_application uuid,p_landlord uuid,p_discovery jsonb,p_application_data jsonb default '{}')
returns void language plpgsql set search_path='' as $$
begin
 perform rental_private.sync_checklist_before_landlord_conditionals(p_org,p_application,p_landlord,
  case when p_landlord is not null then p_discovery||jsonb_build_object('_landlordConditionalRules','rental_landlord_conditional_v1') else p_discovery end,p_application_data);
end; $$;
revoke all on function rental_private.sync_checklist(uuid,uuid,uuid,jsonb,jsonb),rental_private.sync_checklist_before_landlord_conditionals(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;

commit;
