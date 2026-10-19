begin;
-- Transaction-local draft capture: no listing/lead/portal creation, submissions,
-- signatures or document evidence. Reuses the seller contact authority/receipt.
create function seller_save_private.capture_context(p_tx uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb; form jsonb; roster jsonb;
begin
 context:=seller_save_private.edit_context(p_tx);
 if context#>>'{revision,listingId}' is not null then
   raise exception using errcode='22023',message='Use the linked listing seller profile for this transaction.';
 end if;
 -- edit_context locks the transaction and form first. Lock the whole seller
 -- roster afterwards and include it in the revision, including removed people.
 perform 1 from public.transaction_participants where transaction_id=p_tx and role_type='seller' order by id for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',participant_name,'email',participant_email,'phone',participant_phone,
   'updatedAt',updated_at,'removedAt',removed_at) order by id),'[]') into roster
 from public.transaction_participants where transaction_id=p_tx and role_type='seller';
 select form_data into form from public.onboarding_form_data where transaction_id=p_tx;
 return (context - 'blockedReason') || jsonb_build_object(
   'revision',(context->'revision') || jsonb_build_object('sellerRoster',roster),
   'roster',roster,'profile',coalesce(form#>'{__bridge_transaction_parties,seller}','{}'::jsonb));
end $$;

create function seller_save_private.save_capture(p_tx uuid,p_revision jsonb,p_profile jsonb,p_mutation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb; replay seller_save_private.transaction_receipts%rowtype;
 request jsonb:=jsonb_build_object('command','seller_capture_v1','revision',p_revision,'profile',p_profile);
 receipt jsonb; profile jsonb; fields jsonb; form jsonb; snapshot jsonb;
 people jsonb; person jsonb; primary_person jsonb; total int; primary_count int;
 person_id uuid; primary_id uuid; name text; now_at timestamptz:=clock_timestamp();
 allowed_fields text[]:=ARRAY[
'sellerLegalType','seller_legal_type','legalType','sellerType','ownerEntityType','owner_entity_type',
'ownerStructureType','owner_structure_type','ownershipType','ownership_type','branch','fullName',
'sellerName','sellerFirstName','firstName','sellerSurname','lastName','primaryContactName',
'contactName','email','sellerEmail','phone','sellerPhone','mobile',
'alternativeNumber','alternative_number','alternatePhone','alternate_phone','alternativeContact','preferredContactMethod',
'idNumber','id_number','sellerIdNumber','dateOfBirth','date_of_birth','birthDate',
'nationality','residentialAddress','residential_address','residentialStreet','sellerResidentialAddress','physicalAddress',
'domiciliumAddress','domicilium_address','sellerTaxNumber','incomeTaxNumber','income_tax_number','taxNumber',
'tax_number','taxResident','tax_resident','saResident','sa_resident','vatRegistered',
'vatNumber','occupation','sourceOfFunds','source_of_funds','politicallyExposedPerson','politically_exposed_person',
'politicallyExposedDetails','politically_exposed_details','maritalStatus','maritalRegime','spouseInvolved','sellerOwnershipConfirmed',
'seller_ownership_confirmed','foreignOwnerCountry','foreign_owner_country','foreignPassportNumber','passportNumber','foreignRegistrationNumber',
'foreign_registration_number','foreignResidencyStatus','foreign_residency_status','residencyStatus','companyName','companyRegistrationNumber',
'companyRegisteredAddress','trustName','trustRegistrationNumber','trustRegisteredAddress','otherEntityName','otherEntityRegistrationNumber',
'companyAuthorityBasis','company_authority_basis','companyResolutionDate','company_resolution_date','trustAuthorityBasis','trust_authority_basis',
'trustBeneficiaryClass','deceasedEstateName','estateReferenceNumber','estateReference','executorAuthorityDetails','powerOfAttorneyAuthorityDetails',
'powerOfAttorneyReference','powerOfAttorneyPrincipalName','principalName','powerOfAttorneyPrincipalIdNumber','principalIdNumber','otherAuthorityDetails',
'multipleOwners','owners','companyDirectors','directors','companyBeneficialOwners','trustees',
'trustTrustees','trustFounders','trustBeneficiaries','beneficiaries','executors','executorIdNumber',
'powerOfAttorneyRepresentatives','powerOfAttorneyIdNumber','spouseName','spouseIdNumber','spouseEmail','spousePhone',
'spouseNationality','spouseAddress','spouseCapacity','authorisedSignatoryName','authorisedSignatoryIdNumber','authorisedSignatoryEmail',
'authorisedSignatoryPhone','authorisedSignatoryNationality','authorisedSignatoryAddress','authorisedSignatoryCapacity','authorisedTrusteeName','authorisedTrusteeIdNumber',
'authorisedTrusteeEmail','authorisedTrusteePhone','authorisedTrusteeNationality','authorisedTrusteeAddress','authorisedTrusteeCapacity','companyDirectorName',
'companyDirectorEmail','companyDirectorPhone','trusteeName','trusteeEmail','trusteePhone','executorName',
'executorEmail','executorPhone','powerOfAttorneyName','powerOfAttorneyEmail','powerOfAttorneyPhone','existingBond',
'hasExistingBond','bondStatus'
 ];
begin
 if auth.uid() is null or p_mutation is null then raise exception using errcode='42501',message='A signed-in seller editor and save reference are required.'; end if;
 context:=seller_save_private.capture_context(p_tx);
 select * into replay from seller_save_private.transaction_receipts where mutation_id=p_mutation;
 if found then
   if replay.actor_id<>auth.uid() or replay.transaction_id<>p_tx or replay.request<>request then
     raise exception using errcode='PT409',message='This save reference belongs to a different change.';
   end if;
   return replay.receipt;
 end if;
 if context->'revision' is distinct from p_revision then raise exception using errcode='PT409',message='Someone else saved seller changes. Your entries remain in this form. Review the latest saved profile before saving again.'; end if;
 if octet_length(p_profile::text)>1048576 or jsonb_typeof(p_profile) is distinct from 'object' or jsonb_typeof(p_profile->'people') is distinct from 'array'
   or jsonb_typeof(p_profile->'profileFields') is distinct from 'object'
   or jsonb_typeof(p_profile->'name') is distinct from 'string'
   or jsonb_typeof(p_profile->'registrationNumber') is distinct from 'string'
   or jsonb_typeof(p_profile->'countryOfRegistration') is distinct from 'string'
   or not coalesce(p_profile->>'entityType'=any(array['unknown','individual','multiple_owners','company','close_corporation','trust','foreign_individual','foreign_company','foreign_trust','deceased_estate','other']),false)
   or exists(select 1 from jsonb_object_keys(p_profile) k where k not in ('entityType','name','registrationNumber','countryOfRegistration','profileFields','people')) then
     raise exception using errcode='22023',message='Invalid seller profile capture.';
 end if;
 if exists(select 1 from jsonb_object_keys(p_profile->'profileFields') k where not(k=any(allowed_fields))) then
   raise exception using errcode='22023',message='Only seller profile details can be captured here.';
 end if;
 people:=p_profile->'people'; total:=jsonb_array_length(people);
 if total<1 or total>100 or exists(select 1 from jsonb_array_elements(people) p where jsonb_typeof(p) is distinct from 'object'
   or coalesce(p->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or not coalesce(p->>'role'=any(array['owner','spouse','authorised_representative','director','member','trustee','executor','beneficial_owner','founder','beneficiary','surety','other']),false))
   or (select count(distinct p->>'id') from jsonb_array_elements(people) p)<>total then
   raise exception using errcode='22023',message='Seller people must have distinct transaction person references.';
 end if;
 if exists(select 1 from jsonb_array_elements(people) p, jsonb_each(p) field
   where field.key not in ('id','role','name','dateOfBirth','nationality','residentialAddress','incomeTaxNumber','saResident','taxResident','capacity','ownershipShare','authorityDetails',
     'sourceOnboardingId','sourcePersonId','sourceSlot','sourceLinkStatus','sourceKey','email','phone','identityNumber','maritalStatus','maritalRegime','spouseOfId','isOwner','signatory','primaryContact')
     or (field.key in ('isOwner','signatory','primaryContact') and jsonb_typeof(field.value)<>'boolean')
     or (field.key not in ('isOwner','signatory','primaryContact','saResident','taxResident') and jsonb_typeof(field.value)<>'string'))
   or exists(select 1 from jsonb_array_elements(people) p where nullif(p->>'spouseOfId','') is not null
     and not exists(select 1 from jsonb_array_elements(people) owner where owner->>'id'=p->>'spouseOfId')) then
   raise exception using errcode='22023',message='Invalid seller person details or spouse link.';
 end if;
 select count(*),jsonb_agg(p)->0 into primary_count,primary_person from jsonb_array_elements(people) p where p->>'primaryContact'='true';
 if primary_count<>1 then raise exception using errcode='22023',message='Choose one primary seller contact.'; end if;
 primary_id:=(primary_person->>'id')::uuid;
 if context#>>'{revision,participantId}' is not null and primary_id<>(context#>>'{revision,participantId}')::uuid then
   raise exception using errcode='PT409',message='Retain the identified primary seller contact.';
 end if;
 if context#>>'{revision,participantId}' is null and exists(select 1 from jsonb_array_elements(context->'roster') r where r->>'removedAt' is null)
   and not exists(select 1 from jsonb_array_elements(context->'roster') r where r->>'removedAt' is null and r->>'id'=primary_id::text) then
   raise exception using errcode='22023',message='Choose the primary contact from the existing sellers.';
 end if;
 -- No person may be borrowed from a different transaction or non-seller role.
 if exists(select 1 from jsonb_array_elements(people) p join public.transaction_participants tp on tp.id=(p->>'id')::uuid
   where tp.transaction_id<>p_tx or tp.role_type is distinct from 'seller' or tp.seller_source_onboarding_id is not null or tp.seller_source_contact_key is not null) then
   raise exception using errcode='42501',message='A seller person reference belongs to another source. Reload the profile.';
 end if;
 select form_data into form from public.onboarding_form_data where transaction_id=p_tx;
 form:=coalesce(form,'{}'); snapshot:=coalesce(form->'__bridge_transaction_parties','{}');
 if snapshot ? 'version' and snapshot->>'version'<>'transaction_party_profile_v1' then
   raise exception using errcode='PT409',message='The transaction party profile version needs review.';
 end if;
 fields:=coalesce(snapshot#>'{seller,profileFields}','{}') || (p_profile->'profileFields');
 -- These are draft answers. Incoming source/evidence flags never grant portal
 -- authority or turn an agent capture into submitted onboarding.
 select jsonb_agg(p || jsonb_build_object('sourceOnboardingId','','sourceKey','','sourcePersonId',p->>'id','sourceLinkStatus','captured') order by ord)
   into people from jsonb_array_elements(people) with ordinality rows(p,ord);
 profile:=p_profile || jsonb_build_object('profileFields',fields,'people',people);
 name:=coalesce(nullif(btrim(p_profile->>'name'),''),primary_person->>'name','');
 perform seller_save_private.authorise(p_tx);
 update public.transactions set seller_name=name,seller_email=nullif(primary_person->>'email',''),seller_phone=nullif(primary_person->>'phone',''),
   seller_type=case when p_profile->>'entityType'='unknown' then seller_type else p_profile->>'entityType' end,updated_at=now_at where id=p_tx;
 -- The role-slot index permits one seller participant. Other owners and
 -- representatives remain in the full profile, not in access/invitation rows.
 person:=primary_person; person_id:=primary_id;
 if exists(select 1 from public.transaction_participants where id=person_id) then
   update public.transaction_participants set participant_name=person->>'name',participant_email=nullif(person->>'email',''),
     participant_phone=nullif(person->>'phone',''),removed_at=null,updated_at=now_at where id=person_id and transaction_id=p_tx and role_type='seller';
 else
   insert into public.transaction_participants(id,transaction_id,role_type,transaction_role,legal_role,status,participant_name,participant_email,participant_phone,updated_at)
     values(person_id,p_tx,'seller','seller','none','active',person->>'name',nullif(person->>'email',''),nullif(person->>'phone',''),now_at);
 end if;
 snapshot:=snapshot || jsonb_build_object('version','transaction_party_profile_v1','seller',profile);
 form:=form || jsonb_build_object('__bridge_transaction_parties',snapshot,'seller_name',name,
   'seller_email',coalesce(primary_person->>'email',''),'seller_phone',coalesce(primary_person->>'phone',''),
   'seller_type',p_profile->>'entityType','__bridge_transaction_seller_capture',jsonb_build_object('source','agent_manual','actorId',auth.uid(),'updatedAt',now_at));
 insert into public.onboarding_form_data(transaction_id,purchaser_type,form_data,updated_at)
   select p_tx,coalesce(purchaser_type,'individual'),form,now_at from public.transactions where id=p_tx
   on conflict(transaction_id) do update set form_data=excluded.form_data,updated_at=excluded.updated_at;
 delete from seller_save_private.authorised_commands where database_transaction=pg_current_xact_id() and transaction_id=p_tx;
 receipt:=seller_save_private.capture_context(p_tx) || jsonb_build_object('mutationId',p_mutation);
 insert into seller_save_private.transaction_receipts(mutation_id,actor_id,transaction_id,request,receipt) values(p_mutation,auth.uid(),p_tx,request,receipt);
 return receipt;
end $$;

create function public.bridge_get_transaction_seller_capture(p_transaction_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select seller_save_private.capture_context(p_transaction_id)$$;
create function public.bridge_save_transaction_seller_capture(p_transaction_id uuid,p_revision jsonb,p_profile jsonb,p_mutation_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select seller_save_private.save_capture(p_transaction_id,p_revision,p_profile,p_mutation_id)$$;
revoke all on function seller_save_private.capture_context(uuid),seller_save_private.save_capture(uuid,jsonb,jsonb,uuid),
 public.bridge_get_transaction_seller_capture(uuid),public.bridge_save_transaction_seller_capture(uuid,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function seller_save_private.capture_context(uuid),seller_save_private.save_capture(uuid,jsonb,jsonb,uuid),
 public.bridge_get_transaction_seller_capture(uuid),public.bridge_save_transaction_seller_capture(uuid,jsonb,jsonb,uuid) to authenticated;
commit;
