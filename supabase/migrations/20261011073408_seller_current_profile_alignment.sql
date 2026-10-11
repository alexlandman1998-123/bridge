-- Current identity facts are read from the linked capture, not a deal snapshot.
-- Invoker security preserves the existing transaction, listing and capture RLS.
create function public.bridge_get_transaction_seller_profile(p_transaction_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.bridge_can_access_transaction_spine(p_transaction_id) then
  raise exception using errcode='42501', message='Seller profile access denied.';
 end if;
 select case
  when t.listing_id is null then jsonb_build_object('status','transaction_capture','partyProfile',
    case when f.total=1 then f.rows->0->'form_data'->'__bridge_transaction_parties'->'seller' else null end)
  when l.id is null or not public.bridge_can_access_private_listing(l.id) then jsonb_build_object('status','restricted')
  when t.organisation_id is distinct from l.organisation_id then jsonb_build_object('status','relationship_review_required')
  when o.total<>1 then jsonb_build_object('status',case when o.total=0 then 'capture_required' else 'relationship_review_required' end)
  else jsonb_build_object('status','current','listing',jsonb_build_object(
    'id',l.id,'updatedAt',l.updated_at,
    'sellerCanonicalFacts',jsonb_strip_nulls(jsonb_build_object('seller',o.rows->0->'canonical_facts_json'->'seller','property',o.rows->0->'canonical_facts_json'->'property','finance',o.rows->0->'canonical_facts_json'->'finance')),
    'sellerOnboarding',jsonb_build_object('id',o.rows->0->'id','updatedAt',o.rows->0->'updated_at',
      'status',o.rows->0->'status','formData',coalesce(o.rows->0->'form_data','{}'::jsonb))))
 end into result
 from public.transactions t
 left join public.private_listings l on l.id=t.listing_id
 left join lateral (select count(*) total,jsonb_agg(jsonb_build_object('id',s.id,'updated_at',s.updated_at,
    'status',s.status,'form_data',(select coalesce(jsonb_object_agg(field.key,case when field.key in ('company','trust') and jsonb_typeof(field.value)='object' then
      (select coalesce(jsonb_object_agg(detail.key,detail.value),'{}'::jsonb)
       from jsonb_each(field.value) detail where detail.key=any(array[
         'name','registration_number','registrationNumber','registered_address','registeredAddress',
         'directors','beneficial_owners','trustees','founders','beneficiaries','beneficiary_class',
         'authorised_signatory','authorisedSignatory','authorised_trustee','authorisedTrustee',
         'authority_basis','resolution_date'
       ])) else field.value end),'{}'::jsonb) from jsonb_each(coalesce(s.form_data,'{}'::jsonb)) field where field.key=any(array[
      'sellerLegalType','seller_legal_type','legalType','sellerType','ownerEntityType',
      'owner_entity_type','ownerStructureType','owner_structure_type','ownershipType','ownership_type',
      'branch','fullName','sellerName','sellerFirstName','firstName',
      'sellerSurname','lastName','primaryContactName','contactName','email',
      'sellerEmail','phone','sellerPhone','mobile','alternativeNumber',
      'alternative_number','alternatePhone','alternate_phone','alternativeContact','preferredContactMethod',
      'idNumber','id_number','sellerIdNumber','dateOfBirth','date_of_birth',
      'birthDate','nationality','residentialAddress','residential_address','residentialStreet',
      'sellerResidentialAddress','physicalAddress','domiciliumAddress','domicilium_address','sellerTaxNumber',
      'incomeTaxNumber','income_tax_number','taxNumber','tax_number','taxResident',
      'tax_resident','saResident','sa_resident','vatRegistered','vatNumber',
      'occupation','sourceOfFunds','source_of_funds','politicallyExposedPerson','politically_exposed_person',
      'politicallyExposedDetails','politically_exposed_details','maritalStatus','maritalRegime','spouseConsentRequired',
      'spouseInvolved','sellerOwnershipConfirmed','seller_ownership_confirmed','foreignOwnerCountry','foreign_owner_country',
      'foreignPassportNumber','passportNumber','foreignRegistrationNumber','foreign_registration_number','foreignResidencyStatus',
      'foreign_residency_status','residencyStatus','popiConsent','popiConsentAccepted','popiConsentAcceptedAt',
      'companyName','companyRegistrationNumber','companyRegisteredAddress','trustName','trustRegistrationNumber',
      'trustRegisteredAddress','otherEntityName','otherEntityRegistrationNumber','companyAuthorityBasis','company_authority_basis',
      'companyResolutionDate','company_resolution_date','trustAuthorityBasis','trust_authority_basis','trustBeneficiaryClass',
      'deceasedEstateName','estateReferenceNumber','estateReference','executorAuthorityDetails','powerOfAttorneyAuthorityDetails',
      'powerOfAttorneyReference','powerOfAttorneyPrincipalName','principalName','powerOfAttorneyPrincipalIdNumber','principalIdNumber',
      'otherAuthorityDetails','multipleOwners','owners','companyDirectors','directors',
      'companyBeneficialOwners','trustees','trustTrustees','trustFounders','trustBeneficiaries',
      'beneficiaries','executors','executorIdNumber','powerOfAttorneyRepresentatives','powerOfAttorneyIdNumber',
      'spouseName','spouseIdNumber','spouseEmail','spousePhone','spouseNationality',
      'spouseAddress','spouseCapacity','authorisedSignatoryName','authorisedSignatoryIdNumber','authorisedSignatoryEmail',
      'authorisedSignatoryPhone','authorisedSignatoryNationality','authorisedSignatoryAddress','authorisedSignatoryCapacity','authorisedTrusteeName',
      'authorisedTrusteeIdNumber','authorisedTrusteeEmail','authorisedTrusteePhone','authorisedTrusteeNationality','authorisedTrusteeAddress',
      'authorisedTrusteeCapacity','companyDirectorName','companyDirectorEmail','companyDirectorPhone','trusteeName',
      'trusteeEmail','trusteePhone','executorName','executorEmail','executorPhone',
      'powerOfAttorneyName','powerOfAttorneyEmail','powerOfAttorneyPhone','existingBond','hasExistingBond',
      'bondStatus','sellerProfileCaptureSource','propertyAddress','titleDeedNumber','bondHolder',
      'outstandingBond','sectionNumber','unitNumber','first_name','surname',
      'last_name','propertyCategory','propertyType','primary_contact_name','marital_regime',
      'vat_registered','alternateContact','secondaryPhone','alternativePhone','contactPreference',
      'vat_number','authorised_signatory_phone','authorised_trustee_phone','marital_status','spouseFullName',
      'company_name','company_registered_address','company_directors','company_beneficial_owners','authorised_signatory_name',
      'authorised_signatory_capacity','authorised_signatory_email','authorised_signatory_id_number','authorised_signatory_nationality','authorised_signatory_address',
      'trust_name','trust_registered_address','trust_trustees','trust_founders','trust_beneficiaries',
      'trust_beneficiary_class','authorised_trustee_name','authorised_trustee_capacity','authorised_trustee_email','authorised_trustee_id_number',
      'authorised_trustee_nationality','authorised_trustee_address','deceasedEstateReferenceNumber','power_of_attorney_principal_name','power_of_attorney_principal_id_number',
      'power_of_attorney_name','power_of_attorney_email','entityName','entityRegistrationNumber','spouse',
      'company','trust','addressLine1','deedNumber','titleReference',
      'propertyBondStatus','bond_status','sellerHasExistingBond','bondExists'
    ])), 'canonical_facts_json',s.canonical_facts_json)) rows
    from public.private_listing_seller_onboarding s where s.private_listing_id=l.id) o on true
 left join lateral (select count(*) total,jsonb_agg(jsonb_build_object('form_data',s.form_data)) rows
    from public.onboarding_form_data s where s.transaction_id=t.id) f on true
 where t.id=p_transaction_id;
 if result is null then raise exception using errcode='42501', message='Seller profile access denied.'; end if;
 return result;
end;
$$;
revoke all on function public.bridge_get_transaction_seller_profile(uuid) from public,anon;
grant execute on function public.bridge_get_transaction_seller_profile(uuid) to authenticated;
