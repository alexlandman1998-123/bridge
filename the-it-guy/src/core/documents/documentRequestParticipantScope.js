export const DOCUMENT_REQUEST_PARTICIPANT_SCOPE_VERSION = 'document_request_participant_scope_v1'

const PRIMARY_PURCHASER_KEYS = new Set([
  'id_document',
  'purchaser_id',
  'purchaser_1_id',
  'passport_copy',
  'proof_of_address',
  'purchaser_proof_of_address',
  'purchaser_1_proof_of_address',
  'payslips',
  'payslips_3_months',
  'bank_statements',
  'bank_statements_3_months',
  'bank_statements_6_months',
  'bank_statements_12_months',
  'financial_statements',
  'tax_returns_latest',
  'accountant_letter',
  'proof_of_income',
  'income_explanation',
  'commission_statements',
  'contracts_or_invoices',
  'pension_proof',
])

const SECONDARY_PURCHASER_KEYS = new Set([
  'co_purchaser_id_document',
  'co_purchaser_proof_of_address',
  'spouse_id',
  'spouse_proof_of_address',
  'spouse_id_optional',
  'spouse_proof_of_address_optional',
  'spouse_income_support',
  'spouse_bank_statements',
])

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function yes(value) {
  return value === true || ['yes', 'y', 'true', '1'].includes(key(value))
}

function fullName(source = {}, fallbacks = {}) {
  const explicit = text(source.full_name || source.fullName || fallbacks.fullName)
  if (explicit) return explicit
  return [
    source.first_name || source.firstName || fallbacks.firstName,
    source.last_name || source.lastName || source.surname || fallbacks.lastName,
  ].map(text).filter(Boolean).join(' ')
}

function participant({ participantKey, participantId = null, participantRole, ordinal, name = '' }) {
  const baseLabel = participantRole === 'spouse_related_party' ? 'Spouse' : `Purchaser ${ordinal}`
  return Object.freeze({
    participantKey,
    participantId: participantId || null,
    participantRole,
    participantOrdinal: ordinal,
    participantName: text(name),
    participantLabel: text(name) ? `${baseLabel} (${text(name)})` : baseLabel,
  })
}

export function resolveBuyerDocumentRequestParticipants(formData = {}, purchaserType = 'individual') {
  const structured = Array.isArray(formData.purchasers) ? formData.purchasers : []
  const primarySource = structured[0] || {}
  const secondarySource = structured[1] || {}
  const normalizedPurchaserType = key(purchaserType || formData.purchaser_type || 'individual')
  const primary = participant({
    participantKey: text(primarySource.participant_key || primarySource.participantKey) || 'purchaser:1',
    participantId: primarySource.participant_id || primarySource.participantId || null,
    participantRole: 'primary_purchaser',
    ordinal: 1,
    name: fullName(primarySource, {
      firstName: formData.first_name,
      lastName: formData.last_name,
      fullName: formData.purchaser_full_name || formData.buyer_name,
    }),
  })

  const spouseIsPurchaser = normalizedPurchaserType === 'married_coc' || yes(formData.spouse_is_co_purchaser)
  const coPurchaserName = fullName(secondarySource, {
    firstName: formData.co_first_name,
    lastName: formData.co_last_name,
    fullName: formData.co_purchaser_full_name,
  })
  const secondaryName = coPurchaserName || (spouseIsPurchaser ? text(formData.spouse_full_name) : '')
  const hasSecondaryPurchaser = Boolean(
    structured[1] ||
    coPurchaserName ||
    key(formData.purchase_mode) === 'co_purchasing' ||
    yes(formData.has_co_purchaser) ||
    spouseIsPurchaser,
  )
  const secondary = hasSecondaryPurchaser
    ? participant({
        participantKey: text(secondarySource.participant_key || secondarySource.participantKey) || 'purchaser:2',
        participantId: secondarySource.participant_id || secondarySource.participantId || null,
        participantRole: 'co_purchaser',
        ordinal: 2,
        name: secondaryName,
      })
    : null
  const spouse = !spouseIsPurchaser && text(formData.spouse_full_name)
    ? participant({
        participantKey: 'spouse:1',
        participantRole: 'spouse_related_party',
        ordinal: 1,
        name: formData.spouse_full_name,
      })
    : null

  return Object.freeze({ primary, secondary, spouse })
}

function participantForRequirement(requirement = {}, participants = {}) {
  const requirementKey = key(requirement.baseRequirementKey || requirement.key)
  if (SECONDARY_PURCHASER_KEYS.has(requirementKey)) return participants.secondary || participants.spouse || null
  if (PRIMARY_PURCHASER_KEYS.has(requirementKey)) return participants.primary || null
  return null
}

export function scopeBuyerDocumentRequirements(requirements = [], formData = {}, purchaserType = 'individual') {
  const participants = resolveBuyerDocumentRequestParticipants(formData, purchaserType)
  return (requirements || []).map((requirement) => {
    const scopedParticipant = participantForRequirement(requirement, participants)
    if (!scopedParticipant) return requirement
    const baseRequirementKey = key(requirement.baseRequirementKey || requirement.key)
    return {
      ...requirement,
      baseRequirementKey,
      requirementInstanceKey: `${scopedParticipant.participantKey}:${baseRequirementKey}`,
      label: `${scopedParticipant.participantLabel} — ${text(requirement.label)}`,
      participantScopeVersion: DOCUMENT_REQUEST_PARTICIPANT_SCOPE_VERSION,
      ...scopedParticipant,
    }
  })
}
