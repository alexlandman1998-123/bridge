import {
  getPrivateListingLifecycleState,
  getPrivateListingStatusLabel,
} from './privateListingLifecycle.js'
import {
  normalizePropertyCategory,
  normalizePropertyStructureType,
} from './propertyTaxonomy.js'
import { resolveSellerOnboardingFlow } from './sellerOnboardingFlow.js'
import {
  formatPropertyAddress,
  normalizePropertyAddress,
} from './sellerPropertyAddress.js'

// Phase 9 canonical document consolidation:
// This legacy seller requirement engine is retained as a compatibility fallback.
// New requirement generation should route through canonicalDocumentResolverService
// once CANONICAL_DOCUMENTS_SOURCE_OF_TRUTH / LEGACY_DOCUMENT_GENERATION_DISABLED
// are enabled and parity reports are clean. Remove only after adapters, backfill
// and production rollback checks have passed.

const COMPLETED_REQUIREMENT_STATUSES = new Set(['approved', 'completed'])
const ACTIVE_REQUIREMENT_STATUSES = new Set(['required', 'requested', 'uploaded', 'under_review', 'rejected'])

const MANDATE_SIGNED_STATUSES = new Set(['signed', 'signed_uploaded'])
const DOCUMENT_STATUSES = ['required', 'requested', 'uploaded', 'under_review', 'rejected', 'approved', 'completed', 'not_applicable']

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeDocumentMatchKey(value) {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const SELLER_DOCUMENT_MATCH_ALIASES = {
  signed_mandate: ['mandate', 'mandate_signature', 'signed_mandate'],
  id_document: ['id_document', 'identity', 'identity_document', 'identity_documents', 'passport', 'seller_id'],
  proof_of_address: ['proof_of_address', 'residential_address', 'residence', 'address'],
  title_deed_reference: ['title_deed_reference', 'title_deed_copy', 'title_deed', 'deed'],
  title_deed_copy: ['title_deed_reference', 'title_deed_copy', 'title_deed', 'deed'],
  rates_account: ['rates_account', 'rates'],
  property_condition_disclosure: ['property_condition_disclosure', 'condition_disclosure', 'disclosure', 'defects'],
  solar_compliance_documents: ['solar_compliance_documents', 'solar_compliance', 'solar'],
}

function getSellerDocumentMatchAliases(key = '') {
  const normalized = normalizeDocumentMatchKey(key)
  if (!normalized) return []
  return SELLER_DOCUMENT_MATCH_ALIASES[normalized] || [normalized]
}

function sellerDocumentKeysOverlap(left = '', right = '') {
  const leftAliases = getSellerDocumentMatchAliases(left)
  const rightAliases = getSellerDocumentMatchAliases(right)
  if (!leftAliases.length || !rightAliases.length) return false
  return leftAliases.some((leftAlias) =>
    rightAliases.some((rightAlias) =>
      leftAlias === rightAlias ||
      leftAlias.includes(rightAlias) ||
      rightAlias.includes(leftAlias),
    ),
  )
}

function hasValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  if (typeof value === 'boolean') return value
  return normalizeText(value).length > 0
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  return ['true', 'yes', '1', 'on', 'bonded', 'tenant_occupied'].includes(normalized)
}

function normalizeSellerType(value) {
  const normalized = normalizeKey(value)
  if (['company', 'pty', 'corporate'].includes(normalized)) return 'company'
  if (normalized === 'trust') return 'trust'
  if (['deceased_estate', 'estate', 'deceased'].includes(normalized)) return 'deceased_estate'
  if (['multiple_individuals', 'multiple_owners', 'multiple', 'joint'].includes(normalized)) return 'multiple_individuals'
  if (['other', 'other_legal_entity', 'legal_entity'].includes(normalized)) return 'other_legal_entity'
  return 'individual'
}

function normalizeMaritalRegime(value, ownershipType = '') {
  const normalized = normalizeKey(value || ownershipType)
  if (!normalized) return 'single'
  if (normalized === 'married_cop' || normalized.includes('in_community') || normalized.includes('cop')) return 'married_in_community'
  if (normalized === 'married_anc' || normalized.includes('antenuptial') || normalized.includes('anc')) return 'antenuptial_contract'
  if (normalized.includes('out_of_community')) return 'married_out_of_community'
  if (normalized.includes('divorc')) return 'divorced'
  if (normalized.includes('widow')) return 'widowed'
  if (normalized.includes('married')) return 'married_out_of_community'
  return 'single'
}

function normalizeBondStatus(value, fallback = 'unknown') {
  const normalized = normalizeKey(value)
  if (['bonded', 'has_bond', 'bond'].includes(normalized)) return 'bonded'
  if (['paid_off', 'settled', 'cancelled'].includes(normalized)) return 'paid_off'
  if (['no_bond', 'none', 'cash_owned'].includes(normalized)) return 'no_bond'
  return fallback
}

function normalizeOccupancyStatus(value, fallback = 'unknown') {
  const normalized = normalizeKey(value)
  if (['owner_occupied', 'owner'].includes(normalized)) return 'owner_occupied'
  if (['tenant_occupied', 'tenant', 'leased', 'rented'].includes(normalized)) return 'tenant_occupied'
  if (['vacant', 'empty'].includes(normalized)) return 'vacant'
  return fallback
}

function normalizeRequirementStatus(value, fallback = 'required') {
  const normalized = normalizeKey(value)
  return DOCUMENT_STATUSES.includes(normalized) ? normalized : fallback
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function toLifecycleStatus(listing = {}) {
  return normalizeKey(
    getPrivateListingLifecycleState(listing) ||
      listing?.listingStatus ||
      listing?.listing_status ||
      listing?.status ||
      'seller_lead',
  )
}

function resolveOwners(formData = {}) {
  const owners = toArray(formData?.multipleOwners || formData?.owners).map((owner, index) => ({
    id: normalizeText(owner?.id) || `owner-${index + 1}`,
    name: normalizeText(owner?.name),
    firstName: normalizeText(owner?.first_name || owner?.firstName),
    surname: normalizeText(owner?.surname),
    idNumber: normalizeText(owner?.idNumber),
    id_number: normalizeText(owner?.id_number),
    proofAddress: normalizeText(owner?.residentialAddress || owner?.proofAddress),
    maritalRegime: normalizeMaritalRegime(owner?.maritalRegime || owner?.maritalStatus),
    ownershipShare: normalizeText(owner?.ownershipShare || owner?.ownership_share),
    consentToSell: toBoolean(owner?.consentToSell ?? owner?.consent_to_sell),
  }))
  return owners
    .map((owner) => ({
      ...owner,
      name: owner.name || owner.firstName,
      idNumber: owner.idNumber || owner.id_number,
    }))
    .filter((owner) => hasValue(owner.name) || hasValue(owner.surname) || hasValue(owner.idNumber))
}

function resolveSellerType(formData = {}, listing = {}) {
  const explicitSellerType =
    listing?.sellerType ||
    listing?.seller_type ||
    formData?.sellerType ||
    formData?.ownershipType ||
    formData?.ownershipStructure ||
    formData?.entityType
  return normalizeSellerType(explicitSellerType)
}

function resolveSellerDisplayName(profile = {}) {
  const formData = profile?.formData || {}
  if (profile.sellerType === 'company') {
    return normalizeText(formData?.companyName || formData?.entityName || profile?.listingData?.seller?.name)
  }
  if (profile.sellerType === 'trust') {
    return normalizeText(formData?.trustName || formData?.entityName || profile?.listingData?.seller?.name)
  }
  if (profile.sellerType === 'deceased_estate') {
    return normalizeText(formData?.estateName || formData?.deceasedEstateName || profile?.listingData?.seller?.name)
  }
  if (profile.sellerType === 'multiple_individuals') {
    const owners = toArray(profile?.owners)
    if (owners.length) return owners.map((owner) => `${owner.name} ${owner.surname}`.trim()).filter(Boolean).join(' / ')
  }
  const personName = [formData?.sellerFirstName, formData?.sellerSurname].filter(Boolean).join(' ').trim()
  return personName || normalizeText(profile?.listingData?.seller?.name)
}

function getCanonicalSellerFacts(listing = {}, onboarding = {}) {
  if (listing?.sellerOnboarding?.canonicalFacts && typeof listing.sellerOnboarding.canonicalFacts === 'object') {
    return listing.sellerOnboarding.canonicalFacts
  }
  if (listing?.sellerCanonicalFacts && typeof listing.sellerCanonicalFacts === 'object') {
    return listing.sellerCanonicalFacts
  }
  if (onboarding?.canonicalFacts && typeof onboarding.canonicalFacts === 'object') {
    return onboarding.canonicalFacts
  }
  if (onboarding?.canonicalSellerFacts && typeof onboarding.canonicalSellerFacts === 'object') {
    return onboarding.canonicalSellerFacts
  }
  return {}
}

function buildRequirement({
  key,
  name,
  description,
  group,
  visibility = 'seller_visible',
  required = true,
  status = 'required',
  generatedFrom = {},
  appliesTo = 'seller',
}) {
  return {
    requirement_key: key,
    requirement_name: name,
    requirement_description: description,
    requirement_group: group,
    document_visibility: visibility,
    visibility,
    applies_to: appliesTo,
    is_required: Boolean(required),
    status: normalizeRequirementStatus(status, 'required'),
    generated_from: generatedFrom && typeof generatedFrom === 'object' ? generatedFrom : {},
    key,
    label: name,
    required: Boolean(required),
  }
}

function appendBondRequirements(docs, generatedFrom) {
  docs.push(
    buildRequirement({
      key: 'bond_statement',
      name: 'Latest Bond Statement',
      description: 'Latest bond statement for cancellation and settlement preparation.',
      group: 'financial',
      visibility: 'seller_visible',
      generatedFrom,
    }),
    buildRequirement({
      key: 'bond_bank_details',
      name: 'Bond Bank Details',
      description: 'Bond bank and account reference details for the existing bond.',
      group: 'financial',
      visibility: 'seller_visible',
      generatedFrom,
    }),
    buildRequirement({
      key: 'bond_cancellation_attorney_details',
      name: 'Bond Cancellation Attorney Details',
      description: 'Details of the attorney or firm handling bond cancellation.',
      group: 'financial',
      visibility: 'seller_visible',
      generatedFrom,
    }),
    buildRequirement({
      key: 'settlement_figure',
      name: 'Settlement Figure',
      description: 'Estimated bond settlement figure for the sale.',
      group: 'financial',
      visibility: 'seller_visible',
      generatedFrom,
    }),
  )
}

function appendSectionalRequirements(docs, generatedFrom) {
  docs.push(
    buildRequirement({
      key: 'levy_statement',
      name: 'Latest Levy Statement',
      description: 'Latest levy statement for sectional title / share block property.',
      group: 'property',
      visibility: 'seller_visible',
      generatedFrom,
    }),
    buildRequirement({
      key: 'body_corporate_details',
      name: 'Body Corporate / Managing Agent Details',
      description: 'Body corporate or managing agent contact details.',
      group: 'property',
      visibility: 'seller_visible',
      generatedFrom,
    }),
  )
}

function appendEstateRequirements(docs, generatedFrom) {
  docs.push(
    buildRequirement({
      key: 'hoa_levy_statement',
      name: 'HOA Levy Statement',
      description: 'Latest HOA levy statement where applicable.',
      group: 'property',
      visibility: 'seller_visible',
      generatedFrom,
    }),
    buildRequirement({
      key: 'hoa_contact_details',
      name: 'HOA Details',
      description: 'Estate / HOA contact and rules information.',
      group: 'property',
      visibility: 'seller_visible',
      generatedFrom,
    }),
  )
}

function appendOccupancyRequirements(docs, generatedFrom) {
  docs.push(
    buildRequirement({
      key: 'lease_agreement',
      name: 'Lease Agreement',
      description: 'Current signed lease agreement for tenant-occupied property.',
      group: 'occupancy',
      visibility: 'seller_visible',
      generatedFrom,
    }),
    buildRequirement({
      key: 'tenant_details',
      name: 'Tenant Details',
      description: 'Tenant contact details and lease term information.',
      group: 'occupancy',
      visibility: 'seller_visible',
      generatedFrom,
    }),
  )
}

function appendPowerOfAttorneyRequirements(docs, generatedFrom) {
  docs.push(
    buildRequirement({
      key: 'power_of_attorney_document',
      name: 'Power of Attorney / Authority Letter',
      description: 'Signed power of attorney or authority letter.',
      group: 'seller_authority',
      visibility: 'seller_visible',
      generatedFrom,
    }),
    buildRequirement({
      key: 'principal_identity',
      name: 'Principal Owner Identity Details',
      description: 'Principal owner identity details where applicable.',
      group: 'seller_authority',
      visibility: 'seller_visible',
      required: false,
      generatedFrom,
    }),
  )
}

function appendComplianceTriggerRequirements(docs, generatedFrom, triggers = []) {
  const triggerSet = new Set(toArray(triggers).map(normalizeKey))
  if (triggerSet.has('gas_compliance_certificate')) {
    docs.push(
      buildRequirement({
        key: 'gas_compliance_certificate',
        name: 'Gas Compliance Certificate',
        description: 'Gas compliance certificate where a gas installation exists.',
        group: 'property_compliance',
        visibility: 'seller_visible',
        generatedFrom,
      }),
    )
  }
  if (triggerSet.has('solar_compliance_documents')) {
    docs.push(
      buildRequirement({
        key: 'solar_compliance_documents',
        name: 'Solar Compliance Documents',
        description: 'Solar / inverter compliance documents where a solar installation exists.',
        group: 'property_compliance',
        visibility: 'seller_visible',
        generatedFrom,
      }),
    )
  }
  if (triggerSet.has('electric_fence_certificate')) {
    docs.push(
      buildRequirement({
        key: 'electric_fence_certificate',
        name: 'Electric Fence Certificate',
        description: 'Electric fence certificate where an electric fence exists.',
        group: 'property_compliance',
        visibility: 'seller_visible',
        generatedFrom,
      }),
    )
  }
  if (triggerSet.has('borehole_certificate')) {
    docs.push(
      buildRequirement({
        key: 'borehole_certificate',
        name: 'Borehole / Water Source Certificate',
        description: 'Borehole or water-source compliance documentation where applicable.',
        group: 'property_compliance',
        visibility: 'seller_visible',
        required: false,
        generatedFrom,
      }),
    )
  }
  if (triggerSet.has('alteration_approvals')) {
    docs.push(
      buildRequirement({
        key: 'alteration_approvals',
        name: 'Alteration Approvals / Consents',
        description: 'Municipal or body corporate approvals for recent alterations where applicable.',
        group: 'property_compliance',
        visibility: 'seller_visible',
        required: false,
        generatedFrom,
      }),
    )
  }
}

function appendLandRequirements(docs, generatedFrom, propertyBranch) {
  if (propertyBranch === 'vacant_land') {
    docs.push(
      buildRequirement({
        key: 'zoning_certificate',
        name: 'Zoning / Use Certificate',
        description: 'Zoning or permitted-use information for vacant land.',
        group: 'property',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'sg_diagram',
        name: 'SG Diagram / Survey Diagram',
        description: 'SG or survey diagram for vacant land.',
        group: 'property',
        visibility: 'seller_visible',
        required: false,
        generatedFrom,
      }),
    )
  }
  if (propertyBranch === 'agricultural') {
    docs.push(
      buildRequirement({
        key: 'zoning_certificate',
        name: 'Zoning / Agricultural Use Certificate',
        description: 'Zoning or agricultural use information for agricultural property.',
        group: 'property',
        visibility: 'seller_visible',
        required: false,
        generatedFrom,
      }),
      buildRequirement({
        key: 'water_source_details',
        name: 'Water Source / Borehole Details',
        description: 'Water source or borehole details for agricultural property.',
        group: 'property',
        visibility: 'seller_visible',
        required: false,
        generatedFrom,
      }),
    )
  }
}

export function buildSellerRequirementProfile(onboardingData = {}, listingData = {}) {
  const isListingEnvelope = !listingData || Object.keys(listingData || {}).length === 0
  const listing = isListingEnvelope ? onboardingData || {} : listingData || {}
  const onboarding =
    isListingEnvelope
      ? listing?.sellerOnboarding?.formData || listing?.sellerOnboarding?.form_data || {}
      : onboardingData || {}
  const canonicalFacts = getCanonicalSellerFacts(listing, onboarding)
  const flow = resolveSellerOnboardingFlow(onboarding, listing, canonicalFacts)
  const onboardingStatusRaw = normalizeKey(
    listing?.sellerOnboardingStatus ||
      listing?.seller_onboarding_status ||
      listing?.sellerOnboarding?.status ||
      listing?.sellerOnboarding?.onboarding_status ||
      '',
  )
  const lifecycleStatus = toLifecycleStatus(listing)
  const resolvedSellerType = resolveSellerType(onboarding, listing)
  const sellerBranch = resolvedSellerType === 'multiple_individuals' ? resolvedSellerType : flow.seller_branch || 'individual'
  const propertyBranch = flow.property_branch || 'residential'
  const sellerType = resolvedSellerType === 'multiple_individuals' ? resolvedSellerType : flow.seller_legacy_type || resolvedSellerType
  const ownershipTypeRaw = normalizeKey(onboarding?.ownershipType || onboarding?.ownershipStructure || listing?.ownership_structure || sellerType)
  const maritalRegime = normalizeMaritalRegime(
    onboarding?.maritalRegime ||
      onboarding?.maritalStatus ||
      canonicalFacts?.seller?.marital_regime ||
      canonicalFacts?.seller?.marital_status,
    ownershipTypeRaw || sellerType,
  )
  const ownershipType =
    ownershipTypeRaw && ownershipTypeRaw !== 'individual'
      ? ownershipTypeRaw
      : sellerBranch === 'married'
        ? (maritalRegime === 'in_community' || maritalRegime === 'married_in_community' ? 'married_cop' : 'married_anc')
        : ownershipTypeRaw || sellerType
  const propertyStructureType =
    flow.property_structure_type ||
    normalizePropertyStructureType(
      onboarding?.propertyStructureType ||
        canonicalFacts?.property?.property_structure_type ||
        listing?.propertyStructureType ||
        listing?.property_structure_type ||
        listing?.propertyType ||
        listing?.property_type,
      { fallback: 'other' },
    )
  const sectionalTitle = Boolean(onboarding?.sectionalTitle || canonicalFacts?.property?.sectional_title || propertyBranch === 'sectional_title')
  const shareBlock = Boolean(onboarding?.shareBlock || canonicalFacts?.property?.share_block)
  const estateOrHoa = Boolean(
    onboarding?.estateOrHoa ||
      canonicalFacts?.property?.estate_or_hoa ||
      propertyBranch === 'estate_hoa' ||
      normalizeText(onboarding?.estateName || onboarding?.estateComplexName || canonicalFacts?.property?.estate_name),
  )
  const bodyCorporate = Boolean(onboarding?.bodyCorporate || canonicalFacts?.property?.body_corporate || sectionalTitle || shareBlock)
  const commercialProperty = Boolean(onboarding?.commercialProperty || canonicalFacts?.property?.commercial_property || ['commercial', 'mixed_use'].includes(propertyBranch))
  const bondStatus = normalizeBondStatus(
    onboarding?.bondStatus ||
      onboarding?.propertyBondStatus ||
      (toBoolean(onboarding?.existingBond) || toBoolean(onboarding?.sellerHasExistingBond) || toBoolean(onboarding?.bondedProperty) || toBoolean(listing?.bondedProperty) ? 'bonded' : '') ||
      listing?.bond_status,
    toBoolean(onboarding?.bondedProperty || listing?.bondedProperty) ? 'bonded' : 'unknown',
  )
  const occupancyStatus = normalizeOccupancyStatus(
    onboarding?.occupancyStatus || onboarding?.propertyOccupancyStatus || listing?.occupancy_status,
    toBoolean(onboarding?.tenantOccupied) ? 'tenant_occupied' : 'unknown',
  )
  const propertyCategory =
    flow.property_category ||
    normalizePropertyCategory(
      onboarding?.propertyCategory ||
        canonicalFacts?.property?.property_category ||
        listing?.propertyCategory ||
        listing?.property_category ||
        listing?.propertyType ||
        listing?.property_type,
      { fallback: 'residential' },
    )
  const propertyAddressDetails = normalizePropertyAddress(
    {
      propertyAddressDetails: onboarding?.propertyAddressDetails || canonicalFacts?.property?.address_details || {},
      propertyAddress: onboarding?.propertyAddress || canonicalFacts?.property?.address || '',
      propertyAddressLine1: onboarding?.propertyAddressLine1 || canonicalFacts?.property?.address_line_1 || '',
      propertyAddressLine2: onboarding?.propertyAddressLine2 || canonicalFacts?.property?.address_line_2 || '',
      suburb: onboarding?.suburb || canonicalFacts?.property?.suburb || '',
      city: onboarding?.city || canonicalFacts?.property?.city || '',
      province: onboarding?.province || canonicalFacts?.property?.province || '',
      postalCode: onboarding?.postalCode || canonicalFacts?.property?.postal_code || '',
      municipality: onboarding?.municipality || canonicalFacts?.property?.municipality || '',
    },
    listing,
    {
      line1: listing?.addressLine1 || listing?.address_line_1 || listing?.propertyAddress || '',
      line2: listing?.addressLine2 || listing?.address_line_2 || '',
      suburb: listing?.suburb || '',
      city: listing?.city || '',
      province: listing?.province || '',
      postalCode: listing?.postalCode || listing?.postal_code || '',
      municipality: listing?.municipality || listing?.city || '',
      country: listing?.country || 'South Africa',
      source: listing?.addressLine1 || listing?.address_line_1 || listing?.propertyAddress ? 'listing' : 'manual',
    },
  )
  const propertyAddress = normalizeText(formatPropertyAddress(propertyAddressDetails))
  const askingPrice = Number(onboarding?.askingPrice || listing?.askingPrice || listing?.asking_price || 0) || 0
  const owners = resolveOwners({
    ...onboarding,
    multipleOwners: onboarding?.multipleOwners || canonicalFacts?.seller?.owners || [],
    owners: onboarding?.owners || canonicalFacts?.seller?.owners || [],
  })
  const companyDirectors = toArray(canonicalFacts?.seller?.company?.directors || onboarding?.companyDirectors)
  const trustTrustees = toArray(canonicalFacts?.seller?.trust?.trustees || onboarding?.trustees)
  const estateExecutors = toArray(canonicalFacts?.seller?.deceased_estate?.executors || onboarding?.executors)
  const poaRepresentatives = toArray(canonicalFacts?.seller?.power_of_attorney?.representatives || onboarding?.powerOfAttorneyRepresentatives)
  const hasMultipleOwnerBranch = ['multiple_owners', 'multiple_individuals'].includes(sellerBranch) || sellerType === 'multiple_individuals'
  const ownerCount = hasMultipleOwnerBranch ? Math.max(owners.length, 2) : 1
  const authorisedSignatory = normalizeText(
    onboarding?.authorisedSignatoryName ||
    onboarding?.authorizedSignatoryName ||
    canonicalFacts?.seller?.company?.authorised_signatory?.name ||
    companyDirectors[0]?.full_name ||
    companyDirectors[0]?.name ||
    onboarding?.companyDirectorName ||
    canonicalFacts?.seller?.trust?.authorised_trustee?.name ||
    trustTrustees[0]?.full_name ||
    trustTrustees[0]?.name ||
    onboarding?.trusteeName ||
    estateExecutors[0]?.full_name ||
      estateExecutors[0]?.name ||
      onboarding?.executorName,
  )
  const mandateType = normalizeText(onboarding?.mandateType || listing?.mandateType || listing?.mandate_type)
  const mandateDuration = normalizeText(
    onboarding?.mandateDuration || listing?.mandateDuration || (listing?.mandateStartDate && listing?.mandateEndDate ? 'custom' : ''),
  )
  const commissionTerms =
    hasValue(onboarding?.commissionRate) ||
    hasValue(onboarding?.commissionTerms) ||
    hasValue(onboarding?.mandateCommissionTerms) ||
    hasValue(onboarding?.commissionPercentage) ||
    hasValue(onboarding?.commissionPercent) ||
    hasValue(onboarding?.commission_percent) ||
    hasValue(onboarding?.mandateCommissionPercentage) ||
    hasValue(onboarding?.mandateCommissionPercent) ||
    hasValue(onboarding?.commissionAmount) ||
    hasValue(onboarding?.commission_amount) ||
    hasValue(onboarding?.mandateCommissionAmount) ||
    hasValue(onboarding?.mandateTerms) ||
    hasValue(listing?.commission?.commission_percentage) ||
    hasValue(listing?.commission?.commission_amount)
  const sellerName = resolveSellerDisplayName({
    sellerType,
    formData: {
      ...onboarding,
      companyName: onboarding?.companyName || canonicalFacts?.seller?.company?.name,
      trustName: onboarding?.trustName || canonicalFacts?.seller?.trust?.name,
      estateName: onboarding?.estateName || canonicalFacts?.seller?.deceased_estate?.estate_reference || canonicalFacts?.seller?.deceased_estate?.executor_name,
    },
    owners,
    listingData: listing,
  })
  const mandateStatus = normalizeKey(listing?.mandateStatus || listing?.mandate_status || onboarding?.mandateStatus || 'not_started')
  const onboardingCompleted = ['completed', 'submitted', 'under_review'].includes(onboardingStatusRaw) || lifecycleStatus === 'onboarding_completed'

  return {
    listingId: normalizeText(listing?.id),
    lifecycleStatus,
    lifecycleLabel: getPrivateListingStatusLabel(lifecycleStatus),
    sellerType,
    sellerBranch,
    ownershipType,
    maritalRegime,
    ownerCount,
    owners,
    propertyCategory,
    propertyStructureType,
    propertyType: normalizeText(onboarding?.propertyType || listing?.propertyType || listing?.property_type),
    propertyBranch,
    sectionalTitle,
    shareBlock,
    estateOrHoa,
    bodyCorporate,
    commercialProperty,
    propertyAddress,
    propertyAddressDetails,
    bondStatus,
    occupancyStatus,
    askingPrice,
    estateComplexName: normalizeText(onboarding?.estateComplexName),
    mandateStatus,
    mandateType,
    mandateDuration,
    commissionTermsAvailable: Boolean(commissionTerms),
    onboardingCompleted: Boolean(onboardingCompleted),
    sellerName,
    authorisedSignatory,
    sellerContactEmail: normalizeText(onboarding?.email || listing?.seller?.email),
    sellerContactPhone: normalizeText(onboarding?.phone || listing?.seller?.phone),
    companyDirectors,
    trustTrustees,
    estateExecutors,
    poaRepresentatives,
    flow,
    documentTriggers: flow.document_triggers || [],
    organisationId: normalizeText(listing?.organisationId || listing?.organisation_id),
    assignedAgentId: normalizeText(listing?.assignedAgentId || listing?.assigned_agent_id || listing?.agentId),
    listingData: listing,
    formData: onboarding,
  }
}

export function getRequiredMandateInputs(requirementProfile = {}) {
  const sellerBranch = normalizeKey(requirementProfile?.sellerBranch || requirementProfile?.sellerType)
  const checks = [
    {
      key: 'seller_type',
      label: 'Seller type',
      satisfied: hasValue(requirementProfile?.sellerBranch || requirementProfile?.sellerType),
      blocker: 'Seller type missing',
    },
    {
      key: 'seller_name',
      label: 'Seller / entity name',
      satisfied: hasValue(requirementProfile?.sellerName),
      blocker: 'Seller or entity name missing',
    },
    {
      key: 'authorised_signatory',
      label: 'Authorised signatory',
      satisfied:
        !['company', 'trust', 'deceased_estate', 'power_of_attorney', 'other_legal_entity'].includes(sellerBranch) ||
        hasValue(requirementProfile?.authorisedSignatory),
      blocker: 'Authorised signatory missing',
    },
    {
      key: 'property_address',
      label: 'Property address',
      satisfied: hasValue(requirementProfile?.propertyAddress),
      blocker: 'Property address missing',
    },
    {
      key: 'property_category',
      label: 'Property category',
      satisfied: hasValue(requirementProfile?.propertyCategory),
      blocker: 'Property category missing',
    },
    {
      key: 'property_structure_type',
      label: 'Property structure type',
      satisfied: hasValue(requirementProfile?.propertyStructureType),
      blocker: 'Property structure type missing',
    },
    {
      key: 'asking_price',
      label: 'Asking price',
      satisfied: Number(requirementProfile?.askingPrice || 0) > 0,
      blocker: 'Asking price missing',
    },
    {
      key: 'agency_context',
      label: 'Agent / agency context',
      satisfied: hasValue(requirementProfile?.organisationId) && hasValue(requirementProfile?.assignedAgentId),
      blocker: 'Agent or agency details missing',
    },
    {
      key: 'mandate_terms',
      label: 'Mandate terms',
      satisfied: Boolean(requirementProfile?.commissionTermsAvailable),
      blocker: 'Mandate terms missing',
    },
    {
      key: 'mandate_type',
      label: 'Mandate type',
      satisfied: hasValue(requirementProfile?.mandateType),
      blocker: 'Mandate type missing',
    },
    {
      key: 'mandate_duration',
      label: 'Mandate duration',
      satisfied: hasValue(requirementProfile?.mandateDuration),
      blocker: 'Mandate duration missing',
    },
  ]
  return checks
}

export function getRequiredSellerActions(requirementProfile = {}) {
  const status = normalizeKey(requirementProfile?.lifecycleStatus)
  if (status === 'seller_lead') return ['send_onboarding']
  if (status === 'onboarding_sent') return ['await_onboarding_completion']
  if (status === 'onboarding_completed' || status === 'listing_review') return ['review_listing', 'prepare_mandate']
  if (status === 'mandate_ready') return ['send_mandate']
  if (status === 'mandate_sent') return ['await_mandate_signature']
  if (status === 'mandate_signed') return ['activate_listing']
  if (status === 'active') return ['manage_viewings_offers']
  return []
}

export function getRequiredSellerDocuments(requirementProfile = {}) {
  const profile = requirementProfile || {}
  const flow = profile.flow && typeof profile.flow === 'object' ? profile.flow : {}
  const lifecycleStatus = normalizeKey(profile.lifecycleStatus || flow.lifecycle_status || 'seller_lead')
  const profileSellerType = normalizeKey(profile.sellerType)
  const sellerBranch = profileSellerType === 'multiple_individuals'
    ? profileSellerType
    : normalizeKey(profile.sellerBranch || flow.seller_branch || profile.sellerType || 'individual')
  const propertyBranch = normalizeKey(profile.propertyBranch || flow.property_branch || profile.propertyStructureType || profile.propertyCategory || 'residential')
  const maritalRegime = normalizeKey(profile.maritalRegime || flow.marital_regime || '')
  const propertyCategory = normalizeKey(profile.propertyCategory || flow.property_category || 'residential')
  const propertyStructureType = normalizeKey(profile.propertyStructureType || flow.property_structure_type || 'other')
  const documentTriggers = new Set(
    [...toArray(profile.documentTriggers), ...toArray(flow.document_triggers)].map(normalizeKey),
  )
  const generatedFrom = {
    sellerType: profile.sellerType || flow.seller_legacy_type || sellerBranch || 'individual',
    sellerBranch,
    propertyBranch,
    lifecycleStatus,
    maritalRegime: maritalRegime || 'single',
    propertyCategory: propertyCategory || 'residential',
    propertyStructureType: propertyStructureType || 'other',
    bondStatus: profile.bondStatus || 'unknown',
    occupancyStatus: profile.occupancyStatus || 'unknown',
    ownerCount: profile.ownerCount || 1,
    documentTriggers: Array.from(documentTriggers),
  }

  if (lifecycleStatus === 'seller_lead') {
    return [
      buildRequirement({
        key: 'seller_contact_confirmation',
        name: 'Seller Contact Confirmation',
        description: 'Confirm seller contact details before onboarding is sent.',
        group: 'seller_identity',
        visibility: 'internal',
        generatedFrom,
      }),
    ]
  }

  if (lifecycleStatus === 'onboarding_sent') {
    return [
      buildRequirement({
        key: 'seller_onboarding_submission',
        name: 'Seller Onboarding Submission',
        description: 'Complete seller onboarding before document collection starts.',
        group: 'seller_identity',
        visibility: 'seller_visible',
        generatedFrom,
      }),
    ]
  }

  const docs = [
    buildRequirement({
      key: 'signed_mandate',
      name: 'Signed Mandate',
      description: 'Signed mandate is required before listing activation.',
      group: 'mandate',
      visibility: 'seller_visible',
      generatedFrom,
    }),
    buildRequirement({
      key: 'title_deed_copy',
      name: 'Title Deed Copy',
      description: 'Title deed copy for ownership verification.',
      group: 'property',
      visibility: 'seller_visible',
      generatedFrom,
    }),
    buildRequirement({
      key: 'rates_account',
      name: 'Rates Account',
      description: 'Latest municipal rates account.',
      group: 'property',
      visibility: 'seller_visible',
      generatedFrom,
    }),
    buildRequirement({
      key: 'property_condition_disclosure',
      name: 'Property Condition Disclosure',
      description: 'Property condition disclosure and known defects.',
      group: 'property_compliance',
      visibility: 'seller_visible',
      generatedFrom,
    }),
  ]

  const isMarriedBranch =
    sellerBranch === 'married' ||
    maritalRegime === 'in_community' ||
    maritalRegime === 'anc' ||
    maritalRegime === 'out_of_community' ||
    maritalRegime === 'foreign_marriage' ||
    maritalRegime === 'married_in_community' ||
    maritalRegime === 'married_out_of_community'

  const appendPersonalIdentityDocs = () => {
    docs.push(
      buildRequirement({
        key: 'id_document',
        name: 'ID Document / Passport',
        description: 'Seller ID document or passport.',
        group: 'seller_identity',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'proof_of_address',
        name: 'Proof of Residential Address',
        description: 'Recent proof of residential address.',
        group: 'fica',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'income_tax_number',
        name: 'Income Tax Number',
        description: 'Income tax number where required.',
        group: 'financial',
        visibility: 'internal',
        required: false,
        generatedFrom,
      }),
    )
  }

  if (sellerBranch === 'individual' || sellerBranch === 'married' || isMarriedBranch) {
    appendPersonalIdentityDocs()

    if (maritalRegime === 'in_community' || maritalRegime === 'married_in_community') {
      docs.push(
        buildRequirement({
          key: 'marriage_certificate',
          name: 'Marriage Certificate',
          description: 'Marriage certificate for marital compliance.',
          group: 'marital',
          visibility: 'seller_visible',
          generatedFrom,
        }),
        buildRequirement({
          key: 'spouse_id_document',
          name: 'Spouse ID Document',
          description: 'Spouse ID document.',
          group: 'marital',
          visibility: 'seller_visible',
          generatedFrom,
        }),
        buildRequirement({
          key: 'spouse_proof_of_address',
          name: 'Spouse Proof of Address',
          description: 'Spouse proof of address where required.',
          group: 'marital',
          visibility: 'seller_visible',
          required: false,
          generatedFrom,
        }),
        buildRequirement({
          key: 'spouse_consent',
          name: 'Spouse Consent / Signature',
          description: 'Spousal consent/signature where applicable.',
          group: 'marital',
          visibility: 'seller_visible',
          generatedFrom,
        }),
      )
    } else if (maritalRegime === 'out_of_community' || maritalRegime === 'married_out_of_community' || maritalRegime === 'anc' || maritalRegime === 'antenuptial_contract') {
      docs.push(
        buildRequirement({
          key: 'marriage_certificate',
          name: 'Marriage Certificate',
          description: 'Marriage certificate where applicable.',
          group: 'marital',
          visibility: 'seller_visible',
          generatedFrom,
        }),
        buildRequirement({
          key: 'antenuptial_contract',
          name: 'Antenuptial Contract (ANC)',
          description: 'Registered antenuptial contract.',
          group: 'marital',
          visibility: 'seller_visible',
          generatedFrom,
        }),
        buildRequirement({
          key: 'spouse_id_document',
          name: 'Spouse ID Document',
          description: 'Spouse ID document where required.',
          group: 'marital',
          visibility: 'seller_visible',
          required: false,
          generatedFrom,
        }),
      )
    } else if (maritalRegime === 'divorced') {
      docs.push(
        buildRequirement({
          key: 'divorce_order',
          name: 'Divorce Order',
          description: 'Divorce order where ownership authority is affected.',
          group: 'marital',
          visibility: 'seller_visible',
          generatedFrom,
        }),
      )
    } else if (maritalRegime === 'widowed') {
      docs.push(
        buildRequirement({
          key: 'spouse_death_certificate',
          name: 'Spouse Death Certificate',
          description: 'Death certificate of spouse where required.',
          group: 'marital',
          visibility: 'seller_visible',
          generatedFrom,
        }),
        buildRequirement({
          key: 'estate_authority_documents',
          name: 'Estate / Legal Authority Documents',
          description: 'Authority documents where estate process applies.',
          group: 'deceased_estate',
          visibility: 'seller_visible',
          required: false,
          generatedFrom,
        }),
      )
    }
  } else if (sellerBranch === 'multiple_owners' || sellerBranch === 'multiple_individuals') {
    const owners = Array.from({ length: Math.max(profile.ownerCount || 2, 2) }, (_, index) => profile.owners?.[index] || { id: `owner-${index + 1}`, maritalRegime: 'single' })
    owners.forEach((owner, index) => {
      const seq = index + 1
      docs.push(
        buildRequirement({
          key: `owner_${seq}_id_document`,
          name: `Owner ${seq} ID Document / Passport`,
          description: `Identity document for owner ${seq}.`,
          group: 'seller_identity',
          visibility: 'seller_visible',
          generatedFrom: { ...generatedFrom, ownerId: owner.id },
        }),
        buildRequirement({
          key: `owner_${seq}_proof_of_address`,
          name: `Owner ${seq} Proof of Address`,
          description: `Proof of address for owner ${seq}.`,
          group: 'fica',
          visibility: 'seller_visible',
          generatedFrom: { ...generatedFrom, ownerId: owner.id },
        }),
        buildRequirement({
          key: `owner_${seq}_marital_status`,
          name: `Owner ${seq} Marital Status Declaration`,
          description: `Marital status declaration for owner ${seq}.`,
          group: 'marital',
          visibility: 'seller_visible',
          generatedFrom: { ...generatedFrom, ownerId: owner.id },
        }),
      )
      if (owner.maritalRegime === 'in_community' || owner.maritalRegime === 'married_in_community') {
        docs.push(
          buildRequirement({
            key: `owner_${seq}_marriage_certificate`,
            name: `Owner ${seq} Marriage Certificate`,
            description: `Marriage certificate for owner ${seq}.`,
            group: 'marital',
            visibility: 'seller_visible',
            generatedFrom: { ...generatedFrom, ownerId: owner.id },
          }),
        )
      }
    })
    docs.push(
      buildRequirement({
        key: 'ownership_split_confirmation',
        name: 'Ownership Split Confirmation',
        description: 'Ownership split and participation confirmation.',
        group: 'compliance',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'all_owner_authority_consent',
        name: 'All Owner Authority / Consent',
        description: 'Authority/consent from all owners.',
        group: 'compliance',
        visibility: 'seller_visible',
        generatedFrom,
      }),
    )
  } else if (sellerBranch === 'company') {
    docs.push(
      buildRequirement({
        key: 'company_registration',
        name: 'Company Registration Documents',
        description: 'CIPC / CK registration documents.',
        group: 'company',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'cipc_documents',
        name: 'CIPC / CK Documents',
        description: 'Latest CIPC / CK records.',
        group: 'company',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'company_resolution_to_sell',
        name: 'Company Resolution',
        description: 'Resolution authorising the sale.',
        group: 'company',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'director_member_ids',
        name: 'Director / Member ID Documents',
        description: 'Identity documents of directors/members.',
        group: 'company',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'authorised_signatory_id',
        name: 'Authorised Signatory ID',
        description: 'ID document of authorised signatory.',
        group: 'company',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'company_address_proof',
        name: 'Proof of Company Address',
        description: 'Proof of company registered address.',
        group: 'company',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'sars_tax_vat_documents',
        name: 'SARS Tax / VAT Documents',
        description: 'Tax/VAT support documents where applicable.',
        group: 'company',
        visibility: 'internal',
        required: false,
        generatedFrom,
      }),
      buildRequirement({
        key: 'beneficial_ownership_fica',
        name: 'Beneficial Ownership / FICA Documents',
        description: 'Beneficial ownership and related FICA documents where required.',
        group: 'company',
        visibility: 'internal',
        required: false,
        generatedFrom,
      }),
    )
  } else if (sellerBranch === 'trust') {
    docs.push(
      buildRequirement({
        key: 'seller_trust_deed',
        name: 'Trust Deed',
        description: 'Signed trust deed document.',
        group: 'trust',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'seller_letters_of_authority',
        name: 'Letters of Authority',
        description: 'Master’s appointment / letters of authority.',
        group: 'trust',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'trustee_ids',
        name: 'Trustee ID Documents',
        description: 'Identity documents for trustees.',
        group: 'trust',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'trust_resolution_to_sell',
        name: 'Trustee Resolution',
        description: 'Resolution authorising sale.',
        group: 'trust',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'authorised_trustee_signatory_id',
        name: 'Authorised Trustee / Signatory ID',
        description: 'ID document for authorised trustee signatory.',
        group: 'trust',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'trust_address_proof',
        name: 'Proof of Trust Address',
        description: 'Proof of trust address where required.',
        group: 'trust',
        visibility: 'seller_visible',
        required: false,
        generatedFrom,
      }),
      buildRequirement({
        key: 'trust_beneficial_ownership_fica',
        name: 'Beneficial Ownership / FICA Documents',
        description: 'Beneficial ownership/FICA documents where required.',
        group: 'trust',
        visibility: 'internal',
        required: false,
        generatedFrom,
      }),
    )
  } else if (sellerBranch === 'deceased_estate') {
    docs.push(
      buildRequirement({
        key: 'seller_executor_authority',
        name: 'Letter of Executorship / Authority',
        description: 'Executor authority documentation.',
        group: 'deceased_estate',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'executor_id_document',
        name: 'Executor ID Document',
        description: 'ID document for executor/authorised person.',
        group: 'deceased_estate',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'deceased_death_certificate',
        name: 'Death Certificate',
        description: 'Death certificate for deceased owner.',
        group: 'deceased_estate',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'estate_owner_details',
        name: 'Estate Late Owner Details',
        description: 'Late owner details and estate references.',
        group: 'deceased_estate',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'will_document',
        name: 'Will Document',
        description: 'Will document where required.',
        group: 'deceased_estate',
        visibility: 'seller_visible',
        required: false,
        generatedFrom,
      }),
      buildRequirement({
        key: 'master_documents',
        name: 'Master’s Office Documents',
        description: 'Master’s office support documents where required.',
        group: 'deceased_estate',
        visibility: 'seller_visible',
        required: false,
        generatedFrom,
      }),
    )
  } else if (sellerBranch === 'power_of_attorney') {
    appendPowerOfAttorneyRequirements(docs, generatedFrom)
  } else {
    docs.push(
      buildRequirement({
        key: 'legal_entity_registration',
        name: 'Legal Entity Registration Documents',
        description: 'Registration documents for the legal entity.',
        group: 'compliance',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'authorised_signatory_authority',
        name: 'Authorised Signatory Authority',
        description: 'Authority document and signatory identification.',
        group: 'compliance',
        visibility: 'seller_visible',
        generatedFrom,
      }),
    )
  }

  if (profile.bondStatus === 'bonded') {
    appendBondRequirements(docs, generatedFrom)
  }
  if (['sectional_title', 'share_block'].includes(propertyBranch) || ['sectional_title', 'share_block'].includes(propertyStructureType)) {
    appendSectionalRequirements(docs, generatedFrom)
  }
  if (propertyBranch === 'estate_hoa' || profile.propertyStructureType === 'estate' || hasValue(profile.estateComplexName)) {
    appendEstateRequirements(docs, generatedFrom)
  }
  if (['commercial', 'mixed_use'].includes(propertyBranch)) {
    docs.push(
      buildRequirement({
        key: 'zoning_certificate',
        name: 'Zoning Certificate',
        description: 'Zoning or permitted-use certificate for commercial or mixed-use property.',
        group: 'property',
        visibility: 'seller_visible',
        generatedFrom,
      }),
      buildRequirement({
        key: 'occupation_certificate',
        name: 'Occupation Certificate',
        description: 'Occupation certificate for commercial or mixed-use property.',
        group: 'property',
        visibility: 'seller_visible',
        required: false,
        generatedFrom,
      }),
    )
  }
  if (['vacant_land', 'agricultural'].includes(propertyBranch)) {
    appendLandRequirements(docs, generatedFrom, propertyBranch)
  }
  if (profile.occupancyStatus === 'tenant_occupied') {
    appendOccupancyRequirements(docs, generatedFrom)
  }
  appendComplianceTriggerRequirements(docs, generatedFrom, Array.from(documentTriggers))

  return docs
}

export function generateSellerDocumentRequirements(listingOrProfile) {
  const profile =
    listingOrProfile && listingOrProfile.formData
      ? listingOrProfile
      : buildSellerRequirementProfile(listingOrProfile || {})
  return getRequiredSellerDocuments(profile)
}

export function syncSellerDocumentRequirements(listing = {}, existingRequirements = []) {
  const requirementProfile = buildSellerRequirementProfile(listing || {})
  const generatedRequirements = getRequiredSellerDocuments(requirementProfile)
  const existingRows = Array.isArray(existingRequirements) ? existingRequirements : []
  const existingByKey = new Map(existingRows.map((row) => [normalizeKey(row?.requirement_key || row?.key), row]))
  const generatedKeys = new Set(generatedRequirements.map((row) => normalizeKey(row.requirement_key)))

  const upsertRows = generatedRequirements.map((generated) => {
    const key = normalizeKey(generated.requirement_key)
    const existing = existingByKey.get(key) || null
    const existingStatus = normalizeKey(existing?.status)
    const preservedStatus =
      existingStatus && existingStatus !== 'not_applicable'
        ? normalizeRequirementStatus(existingStatus, generated.status || 'required')
        : normalizeRequirementStatus(generated.status || 'required')
    return {
      id: existing?.id || undefined,
      private_listing_id: listing?.id || listing?.private_listing_id || null,
      requirement_key: generated.requirement_key,
      requirement_name: generated.requirement_name,
      requirement_description: generated.requirement_description,
      requirement_group: generated.requirement_group,
      document_visibility: generated.document_visibility || 'seller_visible',
      visibility: generated.visibility || generated.document_visibility || 'seller_visible',
      applies_to: generated.applies_to || 'seller',
      status: preservedStatus,
      is_required: generated.is_required !== false,
      generated_from: generated.generated_from || {},
    }
  })

  const markNotApplicableRows = existingRows
    .filter((row) => !generatedKeys.has(normalizeKey(row?.requirement_key || row?.key)))
    .map((row) => ({
      id: row?.id || undefined,
      private_listing_id: listing?.id || listing?.private_listing_id || null,
      requirement_key: row?.requirement_key || row?.key,
      requirement_name: row?.requirement_name || row?.label || row?.key,
      requirement_description: row?.requirement_description || '',
      requirement_group: row?.requirement_group || 'compliance',
      document_visibility: row?.document_visibility || row?.visibility || 'seller_visible',
      visibility: row?.visibility || row?.document_visibility || 'seller_visible',
      applies_to: row?.applies_to || 'seller',
      status: 'not_applicable',
      is_required: false,
      generated_from: {
        ...(row?.generated_from && typeof row.generated_from === 'object' ? row.generated_from : {}),
        archived: true,
      },
    }))

  return {
    requirementProfile,
    generatedRequirements,
    upsertRows,
    markNotApplicableRows,
  }
}

export function isSellerRequirementSatisfied(requirement = {}, documents = []) {
  const status = normalizeKey(requirement?.status)
  if (COMPLETED_REQUIREMENT_STATUSES.has(status) || status === 'not_applicable') return true
  const key = normalizeDocumentMatchKey(requirement?.requirement_key || requirement?.key)
  if (!key) return false
  const matchedDocument = toArray(documents).find((document) => {
    const requirementKey = normalizeDocumentMatchKey(document?.requirement_key || document?.requirementKey)
    const documentType = normalizeDocumentMatchKey(document?.document_type || document?.documentType)
    const category = normalizeDocumentMatchKey(document?.category || document?.document_category)
    const name = normalizeDocumentMatchKey(document?.document_name || document?.name || document?.file_name)
    return [requirementKey, documentType, category, name].some((candidate) =>
      candidate === key || sellerDocumentKeysOverlap(candidate, key),
    )
  })
  if (!matchedDocument) return false
  const docStatus = normalizeKey(matchedDocument?.status)
  return COMPLETED_REQUIREMENT_STATUSES.has(docStatus) || ['uploaded', 'under_review', 'verified'].includes(docStatus)
}

export function getMandateReadiness(listingOrProfile = {}) {
  const profile =
    listingOrProfile && listingOrProfile.formData
      ? listingOrProfile
      : buildSellerRequirementProfile(listingOrProfile || {})
  const mandateChecks = getRequiredMandateInputs(profile)
  const blockers = mandateChecks.filter((item) => !item.satisfied).map((item) => item.blocker || `Missing ${item.label}`)
  return {
    profile,
    checks: mandateChecks,
    ready: blockers.length === 0 && Boolean(profile.onboardingCompleted),
    blockers,
  }
}

export function getListingReadinessSummary(listing = {}) {
  const requirementProfile = buildSellerRequirementProfile(listing || {})
  const derivedRequirements = generateSellerDocumentRequirements(requirementProfile)
  const requirements = toArray(listing?.documentRequirements).length ? toArray(listing?.documentRequirements) : derivedRequirements
  const documents = toArray(listing?.documents)
  const mandateReadiness = getMandateReadiness(requirementProfile)
  const mandateSigned = MANDATE_SIGNED_STATUSES.has(normalizeKey(requirementProfile?.mandateStatus))
  const requirementSatisfied = (row) => {
    const key = normalizeKey(row?.requirement_key || row?.key)
    if (key === 'signed_mandate' && mandateSigned) return true
    return isSellerRequirementSatisfied(row, documents)
  }

  const requiredRows = requirements.filter((row) => row?.is_required !== false && normalizeKey(row?.status) !== 'not_applicable')
  const completedRows = requiredRows.filter((row) => requirementSatisfied(row))
  const missingRows = requiredRows.filter((row) => !requirementSatisfied(row))
  const completionPct = requiredRows.length ? Math.round((completedRows.length / requiredRows.length) * 100) : 0
  const activeReady = Boolean(mandateReadiness.ready && mandateSigned && missingRows.length === 0)
  const blockedBy = [
    ...mandateReadiness.blockers,
    ...missingRows.slice(0, 8).map((row) => `Missing ${row?.requirement_name || row?.requirement_key}`),
  ]

  return {
    requirementProfile,
    onboardingComplete: Boolean(requirementProfile.onboardingCompleted),
    mandateReady: Boolean(mandateReadiness.ready),
    mandateSigned,
    activeReady,
    readinessState: activeReady ? 'ready_for_activation' : mandateReadiness.ready ? 'ready_for_mandate' : 'blocked',
    requirementCompletionPct: completionPct,
    totalRequirements: requiredRows.length,
    completedRequirementsCount: completedRows.length,
    missingRequirementsCount: missingRows.length,
    missingRequirements: missingRows,
    completedRequirements: completedRows,
    blockedBy: Array.from(new Set(blockedBy)).filter(Boolean),
    mandateChecks: mandateReadiness.checks,
  }
}

export function getListingActivationReadiness(listingOrSummary = {}) {
  const summary =
    listingOrSummary && listingOrSummary.requirementProfile
      ? listingOrSummary
      : getListingReadinessSummary(listingOrSummary)
  return {
    ready: Boolean(summary?.activeReady),
    blockers: toArray(summary?.blockedBy),
    mandateSigned: Boolean(summary?.mandateSigned),
    missingRequirementsCount: Number(summary?.missingRequirementsCount || 0),
  }
}

export function getMissingSellerDocuments(listingOrSummary = {}) {
  const summary =
    listingOrSummary && Array.isArray(listingOrSummary?.missingRequirements)
      ? listingOrSummary
      : getListingReadinessSummary(listingOrSummary)
  return toArray(summary?.missingRequirements)
}

// Backwards compatibility aliases used in existing screens/services
export const getSellerRequirementProfile = (listing = {}) => buildSellerRequirementProfile(listing || {})
export const getMissingSellerRequirements = (listing = {}) => getMissingSellerDocuments(listing || {})
export { ACTIVE_REQUIREMENT_STATUSES, COMPLETED_REQUIREMENT_STATUSES, DOCUMENT_STATUSES }
