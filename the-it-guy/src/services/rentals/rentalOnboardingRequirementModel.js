import { rentalApplicationDocumentSlots } from './rentalApplicationWizardModel.js'

export const RENTAL_TENANT_REQUIREMENT_RULE_VERSION = 'rental_application_evidence_v1'
export const RENTAL_LANDLORD_REQUIREMENT_RULE_VERSION = 'rental_landlord_collection_v1'
export const RENTAL_LANDLORD_CONDITIONAL_RULE_VERSION = 'rental_landlord_conditional_v1'
const entities = ['company', 'close_corporation', 'trust']
const authorities = ['authorised_signatory', 'trustee']
const identityKeys = ['firstName', 'lastName', 'name', 'identityType', 'identityNumber', 'idNumber', 'nationality', 'dateOfBirth', 'role', 'capacity']
const pick = (value = {}, keys) => Object.fromEntries(keys.map((key) => [key, value?.[key] ?? '']))
const definition = (subjectId, scopeKey, purpose, required, fingerprint) => ({ key: JSON.stringify([scopeKey, subjectId, purpose]), subjectId, scopeKey, purpose, required, fingerprint })

// Definitions are previews. IDs and generations come from the saved database rows.
export function rentalTenantRequirementDefinitions(data = {}, policy = { version: 1 }) {
  return rentalApplicationDocumentSlots(data, policy).map((slot) => {
    const subject = slot.subjectId === 'primary' ? data.identity || {} : slot.subjectId === 'entity' ? data.entity || {} : (data.people || []).find((person) => person.id === slot.subjectId) || {}
    let fingerprint = pick(subject, identityKeys)
    if (slot.subjectId === 'entity') fingerprint = pick(data.entity, ['type', 'legalName', 'registrationNumber', 'primaryContactRole'])
    if (slot.purpose === 'authority') fingerprint = { ...fingerprint, signatories: (data.people || []).filter((person) => authorities.includes(person.role)).map((person) => ({ id: person.id, ...pick(person, [...identityKeys, 'authorityBasis']) })).sort((a, b) => a.id.localeCompare(b.id)) }
    if (policy.version === 4) {
      if (slot.subjectId === 'primary' && slot.purpose === 'address') fingerprint = { ...data.identity, address: data.rentalHistory?.currentAddress ?? null }
      else if (slot.subjectId === 'entity' && ['address', 'beneficial_ownership', 'trust_authority'].includes(slot.purpose)) fingerprint = { ...data.entity, people: data.people ?? null }
      else if (slot.subjectId !== 'primary' && slot.subjectId !== 'entity' && ['address', 'authority'].includes(slot.purpose)) fingerprint = { ...subject }
    }
    return definition(slot.subjectId, 'application', slot.purpose, slot.required, fingerprint)
  })
}

export function rentalLandlordRequirementDefinitions({ profile = {}, portfolio = [] } = {}) {
  // Exceptional/foreign legacy types must be resolved in discovery, never mapped
  // to an individual. Proposed rules are stored only as a preview in Phase 3.
  if (!['individual', 'multiple_owners', ...entities].includes(profile.type)) return []
  const legal = pick(profile, ['type', 'name', 'idNumber', 'registrationNumber', 'country', 'nationality'])
  const requirements = []
  const add = (subject, scope, purpose, fingerprint = legal) => requirements.push(definition(subject, scope, purpose, true, fingerprint))
  if (!entities.includes(profile.type)) { add('primary', 'identity', 'identity'); add('primary', 'identity', 'address', { ...legal, residentialAddress: profile.residentialAddress || '' }) }
  else {
    add('entity', 'identity', profile.type === 'trust' ? 'trust_founding' : 'entity_registration')
    if (profile.type === 'trust') add('entity', 'identity', 'trust_authority')
    add('entity', 'identity', 'beneficial_ownership')
    add('signatory', 'identity', 'identity', pick(profile, ['authorisedSignatoryName', 'authorisedSignatoryCapacity', 'authorisedSignatoryIdNumber', 'authorisedSignatoryNationality']))
  }
  for (const person of profile.people || []) {
    if (!person.id || ['primary', 'entity', 'signatory'].includes(person.id)) continue
    add(person.id, 'identity', 'identity', pick(person, identityKeys))
    add(person.id, 'identity', 'address', { ...pick(person, identityKeys), residentialAddress: person.residentialAddress || '' })
  }
  for (const property of portfolio) {
    if (!property.id) continue
    const scope = `property:${property.id}`
    const rights = { ...legal, propertyId: property.canonicalPropertyId || '', ownershipType: property.ownershipType || '', address: property.address || '', unitNumber: property.unitNumber || '', complexName: property.complexName || '' }
    add('property', scope, 'property_disclosure', rights)
    add('entity', scope, 'right_to_let', rights)
    add('entity', scope, 'signed_mandate', { ...rights, signedAt: property.mandateSignedAt || '', startsOn: property.mandateStartDate || '', endsOn: property.mandateEndDate || '' })
    if (entities.includes(profile.type)) add('entity', scope, 'signing_authority', { ...rights, authorityBasis: profile.authorityBasis || '', signatory: profile.authorisedSignatoryName || '', signatoryId: profile.authorisedSignatoryIdNumber || '', capacity: profile.authorisedSignatoryCapacity || '' })
    if (profile.type === 'multiple_owners') add('entity', scope, 'co_owner_authority', { ...rights, owners: (profile.people || []).map((person) => ({ id: person.id, ...pick(person, identityKeys) })).sort((a, b) => a.id.localeCompare(b.id)) })
    const conditional = { ...rights, conditionalRuleVersion: RENTAL_LANDLORD_CONDITIONAL_RULE_VERSION }
    if (property.serviceType === 'managed_rental') {
      add('entity', scope, 'payout_account', { ...conditional, ...pick(property, ['payoutBeneficiaryType', 'payoutAccountHolder', 'payoutAccountReference']) })
      add('property', scope, 'management_information', { ...conditional, billingResponsibility: property.billingResponsibility || '' })
      if (property.payoutBeneficiaryType === 'third_party') add('entity', scope, 'third_party_payee_authority', { ...conditional, ...pick(property, ['payoutAccountHolder', 'payoutAccountReference']) })
      if (property.occupancyStatus === 'tenanted') add('property', scope, 'existing_tenancy_pack', { ...conditional, leaseEndDate: property.leaseEndDate || '', currentTenant: property.currentTenant || '' })
    }
    if (property.ownershipType === 'sectional_title' || ['body_corporate', 'hoa'].includes(property.schemeType)) add('property', scope, 'scheme_rules', { ...conditional, schemeType: property.schemeType || '' })
  }
  return requirements
}

export { rentalSavedRequirementProgress as rentalRequirementProgress } from './rentalSavedRequirementModel.js'
