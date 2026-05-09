import {
  getPrivateListingLifecycleState,
  getPrivateListingStatusLabel,
} from './privateListingLifecycle'

const COMPLETED_REQUIREMENT_STATUSES = new Set(['approved', 'completed'])
const ACTIVE_REQUIREMENT_STATUSES = new Set(['required', 'requested', 'uploaded', 'under_review', 'rejected'])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function hasValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  return normalizeText(value).length > 0
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  return ['true', 'yes', '1', 'bonded', 'bond'].includes(normalized)
}

function toSellerType(value) {
  const normalized = normalizeKey(value)
  if (normalized === 'company') return 'company'
  if (normalized === 'trust') return 'trust'
  return 'individual'
}

function normalizeMaritalRegime(value) {
  const normalized = normalizeKey(value)
  if (!normalized) return 'single'
  if (normalized.includes('in_community') || normalized.includes('cop')) return 'married_in_community'
  if (normalized.includes('antenuptial') || normalized.includes('anc')) return 'antenuptial_contract'
  if (normalized.includes('out_of_community')) return 'married_out_of_community'
  if (normalized.includes('divorc')) return 'divorced'
  if (normalized.includes('widow')) return 'widowed'
  if (normalized.includes('married')) return 'married_out_of_community'
  return normalized
}

function inferSectionalTitle(listing = {}) {
  const propertyType = normalizeKey(listing?.propertyType || listing?.property_type)
  return propertyType.includes('sectional') || propertyType.includes('apartment') || propertyType.includes('flat')
}

function inferBondedProperty(listing = {}) {
  const formData = listing?.sellerOnboarding?.formData || {}
  if (toBoolean(formData?.bondedProperty)) return true
  const financeContext = normalizeKey(listing?.financeContext || listing?.finance_context)
  return financeContext.includes('bond')
}

function buildRequirement({
  key,
  name,
  description,
  group,
  visibility = 'seller_visible',
  required = true,
  status = 'required',
  documentType = '',
  stage = '',
  generatedFrom = {},
}) {
  return {
    requirement_key: key,
    requirement_name: name,
    requirement_description: description,
    requirement_group: group,
    document_visibility: visibility,
    is_required: Boolean(required),
    status: status || 'required',
    document_type: documentType || key,
    stage_hint: stage || '',
    generated_from: generatedFrom && typeof generatedFrom === 'object' ? generatedFrom : {},
  }
}

export function getSellerRequirementProfile(listing = {}) {
  const onboarding = listing?.sellerOnboarding || {}
  const formData = onboarding?.formData || {}
  const ownershipType = normalizeKey(formData?.ownershipType || listing?.ownership_structure || '')

  const sellerType = toSellerType(
    listing?.sellerType ||
      listing?.seller_type ||
      formData?.sellerType ||
      (ownershipType === 'company' || ownershipType === 'trust' ? ownershipType : 'individual'),
  )
  const lifecycleStatus = getPrivateListingLifecycleState(listing)
  const maritalRegime = normalizeMaritalRegime(
    formData?.maritalRegime || formData?.marriageRegime || listing?.marital_regime,
  )

  return {
    listingId: normalizeText(listing?.id),
    lifecycleStatus,
    lifecycleLabel: getPrivateListingStatusLabel(lifecycleStatus),
    sellerType,
    ownershipStructure: ownershipType || sellerType,
    maritalRegime,
    propertyType: normalizeText(listing?.propertyType || listing?.property_type),
    isSectionalTitle: inferSectionalTitle(listing),
    bondedProperty: inferBondedProperty(listing),
    askingPrice: Number(listing?.askingPrice || listing?.asking_price || 0) || 0,
    addressLine1: normalizeText(listing?.addressLine1 || listing?.address_line_1),
    sellerContactEmail: normalizeText(formData?.email || listing?.seller?.email),
    sellerContactPhone: normalizeText(formData?.phone || listing?.seller?.phone),
    onboardingCompleted:
      normalizeKey(listing?.sellerOnboardingStatus || listing?.seller_onboarding_status || onboarding?.status) === 'completed',
    mandateStatus: normalizeKey(listing?.mandateStatus || listing?.mandate_status),
    formData,
  }
}

export function getRequiredSellerActions(requirementProfile = {}) {
  const status = normalizeKey(requirementProfile?.lifecycleStatus)
  const actions = []
  if (status === 'seller_lead') {
    actions.push('send_onboarding')
  } else if (status === 'onboarding_sent') {
    actions.push('await_onboarding_completion')
  } else if (status === 'onboarding_completed' || status === 'listing_review') {
    actions.push('prepare_mandate')
  } else if (status === 'mandate_ready') {
    actions.push('send_mandate')
  } else if (status === 'mandate_sent') {
    actions.push('await_mandate_signature')
  } else if (status === 'mandate_signed') {
    actions.push('activate_listing')
  } else if (status === 'active') {
    actions.push('manage_market_activity')
  }
  return actions
}

export function getRequiredMandateInputs(requirementProfile = {}) {
  const inputs = [
    { key: 'seller_type', label: 'Seller type', satisfied: hasValue(requirementProfile?.sellerType) },
    { key: 'property_address', label: 'Property address', satisfied: hasValue(requirementProfile?.addressLine1) },
    { key: 'property_type', label: 'Property type', satisfied: hasValue(requirementProfile?.propertyType) },
    { key: 'asking_price', label: 'Asking price', satisfied: Number(requirementProfile?.askingPrice || 0) > 0 },
    {
      key: 'seller_contact',
      label: 'Seller contact details',
      satisfied: hasValue(requirementProfile?.sellerContactEmail) || hasValue(requirementProfile?.sellerContactPhone),
    },
  ]
  return inputs
}

export function getRequiredSellerDocuments(requirementProfile = {}) {
  const status = normalizeKey(requirementProfile?.lifecycleStatus)
  const sellerType = normalizeKey(requirementProfile?.sellerType || 'individual')
  const docs = []
  const generatedFrom = {
    sellerType,
    lifecycleStatus: status,
    maritalRegime: requirementProfile?.maritalRegime || 'single',
    propertyType: requirementProfile?.propertyType || '',
    bondedProperty: Boolean(requirementProfile?.bondedProperty),
  }

  if (status === 'seller_lead') {
    return [
      buildRequirement({
        key: 'seller_contact_confirmation',
        name: 'Seller Contact Confirmation',
        description: 'Confirm seller contact details before onboarding is sent.',
        group: 'seller_identity',
        visibility: 'internal',
        stage: status,
        generatedFrom,
      }),
    ]
  }

  if (status === 'onboarding_sent') {
    return [
      buildRequirement({
        key: 'seller_onboarding_submission',
        name: 'Seller Onboarding Submission',
        description: 'Seller onboarding form must be completed before document collection.',
        group: 'seller_identity',
        visibility: 'seller_visible',
        stage: status,
        generatedFrom,
      }),
    ]
  }

  docs.push(
    buildRequirement({
      key: 'id_document',
      name: 'ID Document',
      description: 'South African ID or passport.',
      group: 'seller_identity',
      visibility: 'seller_visible',
      stage: status,
      generatedFrom,
    }),
    buildRequirement({
      key: 'proof_of_address',
      name: 'Proof of Address',
      description: 'Recent proof of residential address.',
      group: 'fica',
      visibility: 'seller_visible',
      stage: status,
      generatedFrom,
    }),
    buildRequirement({
      key: 'rates_account',
      name: 'Rates Account',
      description: 'Latest municipal rates account.',
      group: 'property',
      visibility: 'seller_visible',
      stage: status,
      generatedFrom,
    }),
    buildRequirement({
      key: 'mandate_signature',
      name: 'Mandate Signature',
      description: 'Mandate must be signed to activate listing.',
      group: 'mandate',
      visibility: 'seller_visible',
      stage: status,
      generatedFrom,
    }),
  )

  if (sellerType === 'individual') {
    docs.push(
      buildRequirement({
        key: 'tax_number',
        name: 'Tax Number',
        description: 'Seller tax number if available.',
        group: 'financial',
        visibility: 'internal',
        required: false,
        stage: status,
        generatedFrom,
      }),
    )

    if (requirementProfile?.maritalRegime === 'married_in_community' || requirementProfile?.maritalRegime === 'married_out_of_community') {
      docs.push(
        buildRequirement({
          key: 'marriage_certificate',
          name: 'Marriage Certificate',
          description: 'Marriage certificate required for married sellers.',
          group: 'marital',
          visibility: 'seller_visible',
          stage: status,
          generatedFrom,
        }),
        buildRequirement({
          key: 'spouse_id_document',
          name: 'Spouse ID Document',
          description: 'Spouse ID document for marital compliance.',
          group: 'marital',
          visibility: 'seller_visible',
          stage: status,
          generatedFrom,
        }),
      )
    }
    if (requirementProfile?.maritalRegime === 'antenuptial_contract' || requirementProfile?.maritalRegime === 'married_out_of_community') {
      docs.push(
        buildRequirement({
          key: 'antenuptial_contract',
          name: 'Antenuptial Contract',
          description: 'Registered ANC where applicable.',
          group: 'marital',
          visibility: 'seller_visible',
          stage: status,
          generatedFrom,
        }),
      )
    }
  }

  if (sellerType === 'company') {
    docs.push(
      buildRequirement({
        key: 'company_registration_documents',
        name: 'Company Registration Documents',
        description: 'CIPC/CK documents for company seller.',
        group: 'company',
        visibility: 'seller_visible',
        stage: status,
        generatedFrom,
      }),
      buildRequirement({
        key: 'company_resolution',
        name: 'Company Resolution',
        description: 'Resolution authorising sale.',
        group: 'company',
        visibility: 'seller_visible',
        stage: status,
        generatedFrom,
      }),
      buildRequirement({
        key: 'director_member_ids',
        name: 'Director / Member IDs',
        description: 'Identity documents of directors/members.',
        group: 'company',
        visibility: 'seller_visible',
        stage: status,
        generatedFrom,
      }),
      buildRequirement({
        key: 'authorised_signatory_id',
        name: 'Authorised Signatory ID',
        description: 'ID of authorised company signatory.',
        group: 'company',
        visibility: 'seller_visible',
        stage: status,
        generatedFrom,
      }),
      buildRequirement({
        key: 'company_address_proof',
        name: 'Proof of Company Address',
        description: 'Proof of registered company address.',
        group: 'company',
        visibility: 'seller_visible',
        stage: status,
        generatedFrom,
      }),
      buildRequirement({
        key: 'company_tax_vat',
        name: 'Company Tax / VAT Documents',
        description: 'Tax or VAT supporting documents where applicable.',
        group: 'company',
        visibility: 'internal',
        required: false,
        stage: status,
        generatedFrom,
      }),
    )
  }

  if (sellerType === 'trust') {
    docs.push(
      buildRequirement({
        key: 'trust_deed',
        name: 'Trust Deed',
        description: 'Signed trust deed document.',
        group: 'trust',
        visibility: 'seller_visible',
        stage: status,
        generatedFrom,
      }),
      buildRequirement({
        key: 'letters_of_authority',
        name: 'Letters of Authority',
        description: 'Master’s letters of authority.',
        group: 'trust',
        visibility: 'seller_visible',
        stage: status,
        generatedFrom,
      }),
      buildRequirement({
        key: 'trustee_ids',
        name: 'Trustee IDs',
        description: 'Identity documents for trustees.',
        group: 'trust',
        visibility: 'seller_visible',
        stage: status,
        generatedFrom,
      }),
      buildRequirement({
        key: 'trustee_resolution',
        name: 'Trustee Resolution',
        description: 'Resolution authorising the sale.',
        group: 'trust',
        visibility: 'seller_visible',
        stage: status,
        generatedFrom,
      }),
      buildRequirement({
        key: 'authorised_trustee_id',
        name: 'Authorised Trustee ID',
        description: 'ID of authorised trustee/signatory.',
        group: 'trust',
        visibility: 'seller_visible',
        stage: status,
        generatedFrom,
      }),
    )
  }

  if (requirementProfile?.isSectionalTitle) {
    docs.push(
      buildRequirement({
        key: 'levy_statement',
        name: 'Levy Statement',
        description: 'Latest levy statement for sectional title units.',
        group: 'property',
        visibility: 'seller_visible',
        stage: status,
        generatedFrom,
      }),
      buildRequirement({
        key: 'body_corporate_contact',
        name: 'Body Corporate Contact Information',
        description: 'Body corporate or managing agent details.',
        group: 'property',
        visibility: 'internal',
        required: false,
        stage: status,
        generatedFrom,
      }),
    )
  }

  if (requirementProfile?.bondedProperty) {
    docs.push(
      buildRequirement({
        key: 'bond_statement',
        name: 'Latest Bond Statement',
        description: 'Bond statement for bonded property.',
        group: 'financial',
        visibility: 'seller_visible',
        stage: status,
        generatedFrom,
      }),
    )
  }

  return docs
}

export function isSellerRequirementSatisfied(requirement = {}, documents = []) {
  const status = normalizeKey(requirement?.status)
  if (COMPLETED_REQUIREMENT_STATUSES.has(status)) return true
  if (status === 'not_applicable') return true

  const key = normalizeKey(requirement?.requirement_key || requirement?.key)
  if (!key) return false

  const docMatch = (Array.isArray(documents) ? documents : []).find((document) => {
    const requirementKey = normalizeKey(document?.requirement_key || document?.requirementKey)
    const documentType = normalizeKey(document?.document_type || document?.documentType)
    return requirementKey === key || documentType === key
  })
  if (!docMatch) return false

  const docStatus = normalizeKey(docMatch?.status)
  return COMPLETED_REQUIREMENT_STATUSES.has(docStatus) || docStatus === 'uploaded'
}

export function getListingReadinessSummary(listing = {}) {
  const requirementProfile = getSellerRequirementProfile(listing)
  const requirements = Array.isArray(listing?.documentRequirements) ? listing.documentRequirements : []
  const documents = Array.isArray(listing?.documents) ? listing.documents : []
  const mandateInputs = getRequiredMandateInputs(requirementProfile)
  const requiredRows = requirements.filter((row) => row?.is_required !== false && normalizeKey(row?.status) !== 'not_applicable')
  const completedRows = requiredRows.filter((row) => isSellerRequirementSatisfied(row, documents))
  const missingRows = requiredRows.filter((row) => !isSellerRequirementSatisfied(row, documents))
  const blockers = []

  if (!requirementProfile.onboardingCompleted) {
    blockers.push('Seller onboarding must be completed before mandate readiness.')
  }
  if (missingRows.length) {
    for (const row of missingRows.slice(0, 5)) {
      blockers.push(`Missing ${row.requirement_name || row.requirement_key}`)
    }
  }
  for (const input of mandateInputs) {
    if (!input.satisfied) blockers.push(`Missing ${input.label}`)
  }
  if (normalizeKey(requirementProfile.mandateStatus) !== 'signed') {
    blockers.push('Missing mandate signature')
  }

  const requirementCompletionPct = requiredRows.length
    ? Math.round((completedRows.length / requiredRows.length) * 100)
    : 0
  const mandateReady = requirementProfile.onboardingCompleted && mandateInputs.every((item) => item.satisfied)
  const activeReady = mandateReady && normalizeKey(requirementProfile.mandateStatus) === 'signed' && missingRows.length === 0
  const readinessState = activeReady ? 'ready_for_activation' : mandateReady ? 'ready_for_mandate' : 'blocked'

  return {
    requirementProfile,
    onboardingComplete: Boolean(requirementProfile.onboardingCompleted),
    mandateReady,
    mandateSigned: normalizeKey(requirementProfile.mandateStatus) === 'signed',
    activeReady,
    readinessState,
    requirementCompletionPct,
    totalRequirements: requiredRows.length,
    completedRequirementsCount: completedRows.length,
    missingRequirementsCount: missingRows.length,
    missingRequirements: missingRows,
    completedRequirements: completedRows,
    blockedBy: Array.from(new Set(blockers)),
  }
}

export function getMissingSellerRequirements(listing) {
  const summary = getListingReadinessSummary(listing || {})
  return summary.missingRequirements
}

