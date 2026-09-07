export const DEAL_SETUP_DOCUMENT_REQUIREMENTS_VERSION = 'deal_setup_document_requirements_v1'

const text = (value) => String(value ?? '').trim()
const key = (value) => text(value).toLowerCase()

function requirement({ key: requirementKey, label, partyId = null, owner, group, reason, satisfiedByProfile = false }) {
  return Object.freeze({
    id: `${requirementKey}:${partyId || owner}`,
    key: requirementKey,
    label,
    partyId,
    owner,
    group,
    reason,
    required: true,
    satisfiedByProfile,
  })
}

function profileDocumentKeys(profileDocumentsByBuyer, buyerId) {
  return new Set((profileDocumentsByBuyer?.[buyerId] || []).map((document) => key(document.document_key || document.key)))
}

export function buildDealSetupDocumentRequirements({ setup = {}, profileDocumentsByBuyer = {} } = {}) {
  const buyers = Array.isArray(setup.buyers) ? setup.buyers.filter((buyer) => !buyer.removed_at && key(buyer.status) !== 'removed') : []
  const purchaserType = key(setup.terms?.purchaserType)
  const financeType = key(setup.finance?.type)
  const requirements = []
  buyers.forEach((buyer, index) => {
    const buyerId = text(buyer.buyer_party_id || buyer.buyerId || buyer.id) || `buyer-${index + 1}`
    const documents = profileDocumentKeys(profileDocumentsByBuyer, buyerId)
    const owner = buyer.participant_name || `Buyer ${index + 1}`
    requirements.push(requirement({ key: 'identity_document', label: 'Identity document', partyId: buyerId, owner, group: 'buyer_fica', reason: 'Required for every buyer party.', satisfiedByProfile: documents.has('identity_document') || documents.has('id_document') }))
    requirements.push(requirement({ key: 'proof_of_address', label: 'Proof of address', partyId: buyerId, owner, group: 'buyer_fica', reason: 'Required for every buyer party.', satisfiedByProfile: documents.has('proof_of_address') }))
    if (buyer.signing_required !== false) requirements.push(requirement({ key: 'signed_otp', label: 'Signed OTP / signature pack', partyId: buyerId, owner, group: 'signing', reason: 'This buyer is a required signer.' }))
  })
  if (purchaserType === 'married_coc') requirements.push(requirement({ key: 'marriage_certificate', label: 'Marriage certificate', owner: 'Buyer parties', group: 'buyer_marital', reason: 'Required for a married purchaser setup.' }))
  if (purchaserType === 'company') requirements.push(requirement({ key: 'company_registration', label: 'Company registration and authority', owner: 'Buyer entity', group: 'buyer_entity', reason: 'Required for a company or CC purchaser.' }))
  if (purchaserType === 'trust') requirements.push(requirement({ key: 'trust_authority', label: 'Trust deed and letters of authority', owner: 'Trust / trustees', group: 'buyer_entity', reason: 'Required for a trust purchaser.' }))
  if (financeType === 'cash' || financeType === 'hybrid') requirements.push(requirement({ key: 'proof_of_funds', label: 'Proof of funds', owner: 'Buyer', group: 'finance', reason: 'Cash contribution is part of this deal.' }))
  if (financeType === 'bond' || financeType === 'hybrid') requirements.push(requirement({ key: 'bond_application', label: 'Bond application / pre-approval', owner: 'Bond originator', group: 'finance', reason: 'Bond finance is part of this deal.' }))
  return Object.freeze({ version: DEAL_SETUP_DOCUMENT_REQUIREMENTS_VERSION, requirements: Object.freeze(requirements) })
}
