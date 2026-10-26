import { getVisibleOnboardingSections } from '../../lib/purchaserPersonas.js'
import { getBuyerOnboardingCompletionIdentity } from './transactionBuyerCompletion.js'

// Only an explicit person/profile reference associates onboarding answers with
// a roster entry. Shared names or email addresses are not sufficient.
export function buyerCaptureDetails(party, { formData = {}, buyerId = '', primaryParticipantId = '', purchaserType = 'individual' } = {}) {
  const identity = getBuyerOnboardingCompletionIdentity(formData)
  const participantId = identity.participantId || primaryParticipantId
  const profileId = identity.buyerPartyId || buyerId
  if (participantId && participantId !== party.id) return {}
  if (identity.buyerPartyId && identity.buyerPartyId !== party.buyer_party_id) return {}
  if (!(participantId === party.id || (profileId && profileId === party.buyer_party_id))) return {}
  const sections = getVisibleOnboardingSections({ purchaserType, financeType: 'cash', values: { ...formData, purchaser_type: purchaserType } })
  const keys = new Set(sections.filter(section => !['finance_totals', 'cash_funding', 'funding_sources'].includes(section.key)).flatMap(section => [section.key, ...section.fields.map(field => field.key)]))
  const nestedPeople = purchaserType === 'company' && Array.isArray(formData.company?.directors) ? { directors: formData.company.directors } : purchaserType === 'trust' && Array.isArray(formData.trust?.trustees) ? { trustees: formData.trust.trustees } : {}
  return { ...nestedPeople, ...Object.fromEntries(Object.entries(formData).filter(([key, value]) => keys.has(key) && value !== null && value !== '' && value !== undefined)) }
}

// Seller drafts share the form-data row. Their presence is not evidence of a
// captured buyer profile or a buyer-lead handoff.
export function hasBuyerCaptureDetails(formData = {}) {
  const filled = value => typeof value === 'string' && Boolean(value.trim())
  const buyer = formData.__bridge_transaction_parties?.buyer
  if (buyer && (filled(buyer.name) || filled(buyer.registrationNumber) || (Array.isArray(buyer.people) && buyer.people.some(person =>
    ['name','email','phone','identityNumber'].some(key => filled(person?.[key])))))) return true
  return ['first_name','last_name','email','phone','identity_number','buyerFullName','buyerName','buyer_name','buyerEmail','buyer_email','buyerPhone','buyer_phone','fullName','full_name','company_name','trust_name']
    .some(key => filled(formData[key])) || ['company','trust'].some(key => filled(formData[key]?.name))
}
