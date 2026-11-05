export function buildRouteBuyerForm({scenario,primary,buyerEmail,phone,developer=false}) {
  const cash=scenario.financeType==='cash',hybrid=scenario.financeType==='hybrid'
  const person={...primary,first_name:developer?'Developer portal fixture':'Agent portal fixture',last_name:'buyer',email:buyerEmail,phone,marital_status:'single',marital_regime:'',monthly_credit_commitments:'0'}
  const form={purchaser_type:'individual',purchaser_entity_type:'individual',natural_person_purchase_mode:'individual',purchase_finance_type:scenario.financeType,purchasers:[person],purchase_price:'2190000',cash_amount:cash?'2190000':hybrid?'500000':'0',bond_amount:cash?'0':hybrid?'1690000':'2190000',deposit_amount:'100000',reservation_required:developer,finance:{proof_of_funds_available:'yes',source_of_funds:'Savings',cash_funds_confirmed:'yes'}}
  if(!cash)Object.assign(form.finance,{buyer_banks:['standard_bank'],bond_bank_name:'Standard Bank',bond_process_started:'yes',bond_current_status:'application_in_progress',bond_preapproval_completed:'yes',bond_preapproval_document_available:'yes',bond_help_requested:'no',bank_statements_available:'yes',bond_readiness_consent:'yes',credit_check_consent:'yes',affordability_confirmed:'yes'})
  applyBuyerRouteVariant(form,scenario,buyerEmail)
  const reference=phone.replace(/\D/g,'').slice(-6)
  if(form.company)form.company.company_registration_number=form.company_registration_number=`2026/${reference}/07`
  if(form.trust)form.trust.trust_registration_number=form.trust_registration_number=`IT${reference}/2026`
  form.funding_sources=cash||hybrid?[{sourceType:scenario.buyerEntityType==='company'?'company_account':scenario.buyerEntityType==='trust'?'trust_account':scenario.partyVariant==='foreign_buyer'?'foreign_funds':'personal_account',amount:form.cash_amount,expectedPaymentDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10),status:'planned',notes:'Controlled staging source'}]:[]
  return form
}

// Synthetic identities and authority facts for disposable staging routes only.
export function applyBuyerRouteVariant(form, scenario, email) {
  const primary=form.purchasers[0]
  primary.residential_address ||= [primary.street_address,primary.suburb,primary.city,primary.postal_code].filter(Boolean).join(', ')
  if (scenario.partyVariant==='joint_purchasers') {
    primary.ownership_share='50'
    form.natural_person_purchase_mode='co_purchasing'
    form.purchasers.push({...primary,first_name:'Controlled co-purchaser',email:email.replace('@','+joint@'),identity_number:'9102025009084',ownership_share:'50'})
  }
  if (scenario.purchaserType?.startsWith('married_')) {
    form.purchaser_type=scenario.purchaserType
    const marital={marital_status:'married',marital_regime:scenario.purchaserType==='married_coc'?'in_community':scenario.purchaserType==='married_anc_accrual'?'out_of_community_with_accrual':'out_of_community',spouse_full_name:'Controlled Spouse',spouse_identity_number:'9102025009084',spouse_email:email.replace('@','+spouse@'),spouse_phone:primary.phone,spouse_is_co_purchaser:scenario.purchaserType==='married_coc'?'yes':'no'}
    Object.assign(primary,marital);Object.assign(form,marital)
  }
  if (scenario.partyVariant==='foreign_buyer') {
    Object.assign(primary,{identity_number:'',passport_number:'STAGING-PASSPORT',nationality:'German',residency_status:'foreign_national'})
    form.purchaser_type=form.purchaser_entity_type='foreign_purchaser'
    Object.assign(form,{identity_number:'',passport_number:primary.passport_number,nationality:primary.nationality,residency_status:primary.residency_status})
  }
  if (scenario.buyerEntityType==='company') {
    form.purchaser_type=form.purchaser_entity_type='company'
    form.company={company_name:'Controlled staging company',company_registration_number:'2024/123456/07',registered_address:primary.residential_address,business_address:primary.residential_address,tax_number:'9001015009',vat_number:'4123456789',nature_of_business:'Synthetic property investment',authorised_signatory_name:'Controlled Director',authorised_signatory_identity_number:'9001015009083',authorised_signatory_email:email,authorised_signatory_phone:primary.phone,authorised_signatory_capacity:'Director',board_resolution_available:'yes',directors:[{full_name:'Controlled Director',id_number:'9001015009083',phone:primary.phone,email,residential_address:primary.residential_address,signing_authority:'yes'}]}
    Object.assign(form,Object.fromEntries(Object.entries(form.company).filter(([k])=>k.startsWith('authorised_')||['company_name','company_registration_number'].includes(k))))
  }
  if (scenario.buyerEntityType==='trust') {
    form.purchaser_type=form.purchaser_entity_type='trust'
    form.trust={trust_name:'Controlled staging trust',trust_registration_number:'IT1234/2024',trust_type:'family_trust',masters_office_reference:'STAGING-MASTER',registered_address:primary.residential_address,tax_number:'9001015009',contact_name:'Controlled Trustee',contact_email:email,contact_phone:primary.phone,authorised_trustee_name:'Controlled Trustee',authorised_trustee_identity_number:'9001015009083',authorised_trustee_email:email,authorised_trustee_phone:primary.phone,trust_deed_available:'yes',letters_of_authority_available:'yes',resolution_available:'yes',all_trustees_signing:'no',trustees:[{full_name:'Controlled Trustee',id_number:'9001015009083',phone:primary.phone,email,residential_address:primary.residential_address,signing_authority:'yes'}]}
    Object.assign(form,Object.fromEntries(Object.entries(form.trust).filter(([k])=>k.startsWith('authorised_')||['trust_name','trust_registration_number'].includes(k))))
    form.trust_resolution_available='yes'
  }
  return form
}

export function sellerRouteVariant(scenario,email,phone) {
  const type=scenario.sellerEntityType||'individual'
  const reference=String(phone).replace(/\D/g,'').slice(-6)
  const result={sellerLegalType:type,ownershipType:type,...(scenario.propertyType?{propertyCategory:scenario.propertyType,propertyType:scenario.propertyType==='commercial'?'office':'house'}:{}),...(scenario.propertyTenure?{propertyStructureType:scenario.propertyTenure}:{}),...(scenario.nonResidentSeller?{taxResident:'no',saResident:'no',nationality:'German',passportNumber:'STAGING-SELLER-PASSPORT'}:{})}
  if (type==='company') Object.assign(result,{companyName:'Controlled staging seller company',companyRegistrationNumber:'2024/654321/07',companyRegisteredAddress:'54 Menlyn Avenue, Pretoria',companyDirectors:[{name:'Controlled',surname:'Director',email,phone,signingAuthority:true}],authorisedSignatoryName:'Controlled Director',authorisedSignatoryCapacity:'Director',authorisedSignatoryEmail:email,authorisedSignatoryPhone:phone,companyResolutionDate:'2026-11-04',companyAuthorityBasis:'Synthetic staging board resolution.'})
  if (type==='trust') Object.assign(result,{trustName:'Controlled staging seller trust',trustRegistrationNumber:'IT4321/2024',trustRegisteredAddress:'54 Menlyn Avenue, Pretoria',trustees:[{name:'Controlled',surname:'Trustee',email,phone,signingAuthority:true}],authorisedTrusteeName:'Controlled Trustee',authorisedTrusteeCapacity:'Trustee',authorisedTrusteeEmail:email,authorisedTrusteePhone:phone,trustAuthorityBasis:'Synthetic staging trustee resolution.'})
  if(type==='company')result.companyRegistrationNumber=`2026/${reference}/07`
  if(type==='trust')result.trustRegistrationNumber=`IT${reference}/2026`
  return result
}
