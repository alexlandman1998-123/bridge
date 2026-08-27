import {
  buildSellerRequirementProfile,
} from '../../lib/privateListingRequirementEngine.js'
import {
  getSellerRequiredDocuments,
} from '../sellerDocumentRequirementsService.js'
import {
  buildCanonicalDocumentRequestAudiencePlan,
} from '../../core/documents/documentRequestCanonicalPlanner.js'
import {
  buildDocumentRequestContainerModel,
} from '../../core/documents/documentRequestContainerModel.js'
import {
  DEFERRED_SELLER_UPLOAD_REQUIREMENT_KEYS,
  isPendingSellerDocumentPolicyRequirement,
  isProfessionalOnlySellerRequirement,
  isSellerClientUploadRequirementAllowed,
} from '../../core/documents/sellerDocumentRequestRuntimePolicy.js'

export const SELLER_DOCUMENT_CANONICAL_CLEANUP_VERSION = 'seller_document_canonical_cleanup_v1'

export { DEFERRED_SELLER_UPLOAD_REQUIREMENT_KEYS }

export const SELLER_DOCUMENT_CLEANUP_SCENARIOS = Object.freeze([
  {
    id: 'individual_freehold',
    label: 'Individual seller, freehold residential',
    formData: {
      sellerType: 'individual',
      maritalStatus: 'single',
      propertyTitleType: 'freehold',
      propertyCategory: 'residential',
      askingPrice: 2500000,
    },
  },
  {
    id: 'married_cop_existing_bond',
    label: 'Married COP seller with existing bond',
    formData: {
      sellerType: 'individual',
      maritalStatus: 'married_in_community',
      maritalRegime: 'in_community',
      propertyTitleType: 'freehold',
      propertyCategory: 'residential',
      bondStatus: 'bonded',
      askingPrice: 2800000,
    },
  },
  {
    id: 'married_anc_sectional_title',
    label: 'Married ANC seller, sectional title',
    formData: {
      sellerType: 'individual',
      maritalStatus: 'married_out_of_community',
      maritalRegime: 'out_of_community',
      propertyTitleType: 'sectional_title',
      sectionalTitle: true,
      propertyCategory: 'residential',
      askingPrice: 1900000,
    },
  },
  {
    id: 'company_seller',
    label: 'Company seller',
    formData: {
      sellerType: 'company',
      ownershipType: 'company',
      entityType: 'company',
      companyName: 'Phase Five Properties Pty Ltd',
      companyDirectors: [{ full_name: 'Director One' }],
      propertyTitleType: 'freehold',
      propertyCategory: 'residential',
      askingPrice: 4200000,
    },
  },
  {
    id: 'trust_seller',
    label: 'Trust seller',
    formData: {
      sellerType: 'trust',
      ownershipType: 'trust',
      entityType: 'trust',
      trustName: 'Phase Five Trust',
      trustees: [{ full_name: 'Trustee One' }],
      propertyTitleType: 'freehold',
      propertyCategory: 'residential',
      askingPrice: 3600000,
    },
  },
  {
    id: 'deceased_estate',
    label: 'Deceased estate seller',
    formData: {
      sellerType: 'deceased_estate',
      ownershipType: 'deceased_estate',
      entityType: 'deceased_estate',
      executorName: 'Executor One',
      propertyTitleType: 'freehold',
      propertyCategory: 'residential',
      askingPrice: 2100000,
    },
  },
  {
    id: 'power_of_attorney',
    label: 'Seller represented by power of attorney',
    formData: {
      sellerType: 'power_of_attorney',
      ownershipType: 'power_of_attorney',
      entityType: 'power_of_attorney',
      authorisedSignatoryName: 'Representative One',
      propertyTitleType: 'freehold',
      propertyCategory: 'residential',
      askingPrice: 1750000,
    },
  },
  {
    id: 'tenant_occupied_estate',
    label: 'Tenant-occupied estate / HOA property',
    formData: {
      sellerType: 'individual',
      maritalStatus: 'single',
      propertyTitleType: 'estate',
      estateOrHoa: true,
      estateComplexName: 'Example Estate',
      occupancyStatus: 'tenant_occupied',
      tenantOccupied: true,
      propertyCategory: 'residential',
      askingPrice: 3100000,
    },
  },
  {
    id: 'commercial_vat',
    label: 'Commercial seller with VAT trigger',
    formData: {
      sellerType: 'company',
      ownershipType: 'company',
      entityType: 'company',
      companyName: 'Commercial Seller Pty Ltd',
      propertyTitleType: 'commercial',
      propertyCategory: 'commercial',
      commercialProperty: true,
      document_triggers: ['vat_registration_certificate'],
      documentTriggers: ['vat_registration_certificate'],
      askingPrice: 9800000,
    },
  },
  {
    id: 'conditional_compliance',
    label: 'Seller with conditional compliance documents',
    formData: {
      sellerType: 'individual',
      maritalStatus: 'single',
      propertyTitleType: 'freehold',
      propertyCategory: 'residential',
      municipality: 'city_of_cape_town',
      gasInstallation: true,
      electricFence: true,
      solarInstallation: true,
      beetleCertificateRegion: true,
      recentAlterations: true,
      askingPrice: 2400000,
    },
  },
  {
    id: 'stale_persisted_deferred_documents',
    label: 'Seller with stale persisted acquisition / improvement rows',
    formData: {
      sellerType: 'individual',
      maritalStatus: 'single',
      propertyTitleType: 'freehold',
      propertyCategory: 'residential',
      askingPrice: 2250000,
    },
    persistedRequirements: DEFERRED_SELLER_UPLOAD_REQUIREMENT_KEYS.map((key) => ({
      key,
      requirement_key: key,
      requirement_name: key.replace(/_/g, ' '),
      visibility: 'seller_visible',
      document_visibility: 'seller_visible',
      status: 'required',
      is_required: true,
    })),
  },
])

const COVERED_NON_CATALOGUE_SELLER_KEYS = new Set([
  'signed_mandate',
])

const GRANULAR_SELLER_KEY_PATTERNS = Object.freeze([
  [/^owner_\d+_id_document$/, 'seller_id_document'],
  [/^owner_\d+_proof_of_address$/, 'seller_proof_of_address'],
  [/^owner_\d+_marriage_certificate$/, 'seller_marriage_certificate'],
  [/^owner_\d+_marital_status$/, 'seller_marriage_certificate'],
  [/^director_fica_/, 'seller_director_fica'],
  [/^trustee_fica_/, 'seller_trustee_fica'],
  [/^member_fica_/, 'seller_director_fica'],
  [/^owner_fica_/, 'seller_id_document'],
  [/^spouse_fica_/, 'seller_spouse_id_document'],
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function scenarioListingFor(scenario = {}) {
  return {
    id: `phase5-${scenario.id || 'seller'}`,
    listingStatus: 'onboarding_completed',
    lifecycleStatus: 'onboarding_completed',
    sellerOnboardingStatus: 'completed',
    organisationId: 'phase5-org',
    assignedAgentId: 'phase5-agent',
    propertyAddress: '1 Phase Street, Cape Town',
    askingPrice: scenario.formData?.askingPrice || 2500000,
    documentRequirements: scenario.persistedRequirements || [],
    sellerOnboarding: {
      status: 'completed',
      formData: scenario.formData || {},
    },
  }
}

function canonicalKeyFor(row = {}) {
  const explicit = normalizeKey(
    row.canonicalDocumentRequestKey ||
      row.canonical_document_request_key ||
      row.documentRequestCanonicalKey ||
      '',
  )
  if (explicit) return explicit
  const rowKey = normalizeKey(row.key || row.requirement_key || row.id)
  for (const [pattern, canonicalKey] of GRANULAR_SELLER_KEY_PATTERNS) {
    if (pattern.test(rowKey)) return canonicalKey
  }
  return rowKey
}

function isMappedOrGranularCovered(row = {}) {
  if (row.canonicalDocumentRequestKnown) return true
  const rowKey = normalizeKey(row.key || row.requirement_key || row.id)
  if (COVERED_NON_CATALOGUE_SELLER_KEYS.has(rowKey)) return true
  return canonicalKeyFor(row) !== rowKey
}

function isProfessionalOnlySellerRow(row = {}) {
  return isProfessionalOnlySellerRequirement(row)
}

function buildDuplicateCanonicalGroups(rows = []) {
  const groups = rows.reduce((accumulator, row) => {
    const canonicalKey = canonicalKeyFor(row)
    if (!canonicalKey) return accumulator
    if (!accumulator[canonicalKey]) accumulator[canonicalKey] = []
    accumulator[canonicalKey].push(row.key || row.requirement_key || row.id)
    return accumulator
  }, {})
  return Object.entries(groups)
    .filter(([, keys]) => keys.length > 1)
    .map(([canonicalKey, legacyKeys]) => Object.freeze({ canonicalKey, legacyKeys: Object.freeze(legacyKeys) }))
}

export function buildSellerCanonicalDocumentScenario(profile = {}, formData = {}) {
  const sellerType = normalizeKey(profile.sellerType || formData.sellerType || formData.seller_type || 'individual')
  const maritalRegime = normalizeKey(profile.maritalRegime || formData.maritalRegime || formData.marital_status || formData.maritalStatus)
  const propertyTriggers = unique([
    profile.propertyBranch,
    profile.propertyStructureType,
    formData.propertyTitleType,
    formData.property_title_type,
    formData.propertyCategory,
    formData.property_category,
    ...(Array.isArray(profile.documentTriggers) ? profile.documentTriggers : []),
    ...(Array.isArray(formData.documentTriggers) ? formData.documentTriggers : []),
    ...(Array.isArray(formData.document_triggers) ? formData.document_triggers : []),
  ])

  return Object.freeze({
    sellerEntityType: sellerType,
    sellerMaritalRegime: maritalRegime,
    propertyType: profile.propertyBranch || formData.propertyTitleType || formData.propertyCategory || '',
    propertyTriggers,
    sellerHasExistingBond: normalizeKey(profile.bondStatus) === 'bonded' || normalizeKey(formData.bondStatus) === 'bonded',
    financeType: 'cash',
  })
}

export function buildSellerDocumentCanonicalCleanupProfile(input = {}) {
  const formData = input.formData || input.onboardingFormData?.formData || input.onboardingFormData || {}
  const listing = input.listing || scenarioListingFor({ id: input.id || 'seller', formData, persistedRequirements: input.persistedRequirements || [] })
  const legacyRows = getSellerRequiredDocuments(listing, formData)
  const profile = buildSellerRequirementProfile({
    ...listing,
    sellerOnboarding: {
      ...(listing.sellerOnboarding || {}),
      status: 'completed',
      formData,
    },
  })
  const scenario = buildSellerCanonicalDocumentScenario(profile, formData)
  const canonicalPlan = buildCanonicalDocumentRequestAudiencePlan(scenario, 'seller')
  const mappedRows = legacyRows.filter(isMappedOrGranularCovered)
  const unmappedRows = legacyRows.filter((row) => !isMappedOrGranularCovered(row))
  const professionalOnlyLegacyRows = mappedRows.filter(isProfessionalOnlySellerRow)
  const pendingPolicyLegacyRows = mappedRows.filter(isPendingSellerDocumentPolicyRequirement)
  const deferredLegacyRows = legacyRows.filter((row) => DEFERRED_SELLER_UPLOAD_REQUIREMENT_KEYS.includes(normalizeKey(row.key || row.requirement_key)))
  const sellerClientUploadRows = mappedRows.filter(isSellerClientUploadRequirementAllowed)
  const requestableSellerClientUploadRows = sellerClientUploadRows
  const mappedCanonicalKeys = unique(mappedRows.map(canonicalKeyFor))
  const requestablePlanKeys = canonicalPlan.requests.filter((request) => request.requestable).map((request) => request.key)
  const missingFromLegacyButCoveredByCanonicalPlan = requestablePlanKeys.filter((key) => !mappedCanonicalKeys.includes(key))
  const extraLegacyKeysOutsideSellerUpload = mappedRows
    .filter((row) => !requestableSellerClientUploadRows.some((candidate) => (candidate.key || candidate.requirement_key) === (row.key || row.requirement_key)))
    .map((row) => row.key || row.requirement_key)

  const containerModel = buildDocumentRequestContainerModel({
    transactionId: input.transaction?.id || input.transactionId || `seller-phase5-${input.id || 'scenario'}`,
    audience: 'seller',
    requiredDocuments: canonicalPlan.requests
      .filter((request) => request.clientVisible && request.requestedFrom === 'seller')
      .map((request) => ({
        id: `canonical_${request.key}`,
        document_key: request.key,
        document_label: request.label,
        requested_from: 'seller',
        visibility_scope: 'client_visible',
        status: request.requestable ? 'required' : 'not_applicable',
        is_required: request.requestable,
      })),
    additionalRequests: input.additionalRequests || [],
  })

  return Object.freeze({
    version: SELLER_DOCUMENT_CANONICAL_CLEANUP_VERSION,
    sellerType: profile.sellerType,
    sellerBranch: profile.sellerBranch,
    propertyBranch: profile.propertyBranch,
    propertyStructureType: profile.propertyStructureType,
    bondStatus: profile.bondStatus,
    occupancyStatus: profile.occupancyStatus,
    scenario,
    legacyRequirementCount: legacyRows.length,
    mappedRequirementCount: mappedRows.length,
    sellerClientUploadCount: sellerClientUploadRows.length,
    requestableSellerClientUploadCount: requestableSellerClientUploadRows.length,
    canonicalPlanRequestCount: canonicalPlan.requests.length,
    canonicalPlanRequestableCount: canonicalPlan.summary.requestable,
    unmappedRows: Object.freeze(unmappedRows.map((row) => Object.freeze({ key: row.key || row.requirement_key, label: row.label || row.requirement_name }))),
    professionalOnlyLegacyRows: Object.freeze(
      professionalOnlyLegacyRows.map((row) =>
        Object.freeze({
          key: row.key || row.requirement_key,
          canonicalKey: canonicalKeyFor(row),
          ownerRole: row.canonicalDocumentRequestOwnerRole,
          visibility: row.canonicalDocumentRequestVisibility,
        }),
      ),
    ),
    pendingPolicyLegacyRows: Object.freeze(
      pendingPolicyLegacyRows.map((row) =>
        Object.freeze({
          key: row.key || row.requirement_key,
          canonicalKey: canonicalKeyFor(row),
          level: row.canonicalDocumentRequestLevel,
        }),
      ),
    ),
    deferredLegacyRows: Object.freeze(
      deferredLegacyRows.map((row) =>
        Object.freeze({
          key: row.key || row.requirement_key,
          label: row.label || row.requirement_name,
        }),
      ),
    ),
    duplicateCanonicalGroups: Object.freeze(buildDuplicateCanonicalGroups(mappedRows)),
    missingFromLegacyButCoveredByCanonicalPlan: Object.freeze(missingFromLegacyButCoveredByCanonicalPlan),
    extraLegacyKeysOutsideSellerUpload: Object.freeze(extraLegacyKeysOutsideSellerUpload),
    sellerClientUploadKeys: Object.freeze(unique(sellerClientUploadRows.map(canonicalKeyFor))),
    requestableSellerClientUploadKeys: Object.freeze(unique(requestableSellerClientUploadRows.map(canonicalKeyFor))),
    canonicalPlanKeys: Object.freeze(canonicalPlan.requests.map((request) => request.key)),
    canonicalPlanRequestableKeys: Object.freeze(requestablePlanKeys),
    containerSummary: containerModel.summary,
  })
}

export function buildSellerDocumentCanonicalCleanupAudit(scenarios = SELLER_DOCUMENT_CLEANUP_SCENARIOS) {
  const results = scenarios.map((scenario) =>
    Object.freeze({
      id: scenario.id,
      label: scenario.label,
      profile: buildSellerDocumentCanonicalCleanupProfile({
        id: scenario.id,
        formData: scenario.formData,
        persistedRequirements: scenario.persistedRequirements,
      }),
    }),
  )

  const unmapped = results.flatMap((result) => result.profile.unmappedRows.map((row) => ({ scenarioId: result.id, ...row })))
  const professionalOnly = results.flatMap((result) =>
    result.profile.professionalOnlyLegacyRows.map((row) => ({ scenarioId: result.id, ...row })),
  )
  const missingCovered = results.flatMap((result) =>
    result.profile.missingFromLegacyButCoveredByCanonicalPlan.map((key) => ({ scenarioId: result.id, key })),
  )
  const deferred = results.flatMap((result) =>
    result.profile.deferredLegacyRows.map((row) => ({ scenarioId: result.id, ...row })),
  )

  return Object.freeze({
    version: SELLER_DOCUMENT_CANONICAL_CLEANUP_VERSION,
    scenarioCount: results.length,
    results: Object.freeze(results),
    summary: Object.freeze({
      unmappedCount: unmapped.length,
      professionalOnlyLegacyCount: professionalOnly.length,
      missingCoveredByCanonicalPlanCount: missingCovered.length,
      pendingPolicyLegacyCount: results.reduce((count, result) => count + result.profile.pendingPolicyLegacyRows.length, 0),
      duplicateCanonicalGroupCount: results.reduce((count, result) => count + result.profile.duplicateCanonicalGroups.length, 0),
      deferredSellerUploadCount: deferred.length,
    }),
    unmapped: Object.freeze(unmapped),
    professionalOnly: Object.freeze(professionalOnly),
    missingCoveredByCanonicalPlan: Object.freeze(missingCovered),
    deferredSellerUploads: Object.freeze(deferred),
  })
}
