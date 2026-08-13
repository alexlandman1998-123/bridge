import { getBuyerRequirementProfile } from '../../lib/buyerRequirementEngine.js'
import { buildCanonicalDocumentRequestAudiencePlan } from '../../core/documents/documentRequestCanonicalPlanner.js'
import { buildDocumentRequestContainerModel } from '../../core/documents/documentRequestContainerModel.js'

export const BUYER_DOCUMENT_CANONICAL_CLEANUP_VERSION = 'buyer_document_canonical_cleanup_v1'

export const BUYER_DOCUMENT_CLEANUP_SCENARIOS = Object.freeze([
  {
    id: 'individual_cash',
    label: 'Individual cash buyer',
    formData: {
      purchaser_type: 'individual',
      purchaser_entity_type: 'individual',
      marital_status: 'single',
      marital_regime: 'not_applicable',
      purchase_finance_type: 'cash',
    },
  },
  {
    id: 'individual_bond_salaried',
    label: 'Individual bond buyer, salaried',
    formData: {
      purchaser_type: 'individual',
      purchaser_entity_type: 'individual',
      employment_type: 'employed',
      purchase_finance_type: 'bond',
    },
  },
  {
    id: 'individual_hybrid_self_employed',
    label: 'Individual hybrid buyer, self-employed',
    formData: {
      purchaser_type: 'individual',
      purchaser_entity_type: 'individual',
      employment_type: 'self_employed',
      purchase_finance_type: 'hybrid',
    },
  },
  {
    id: 'married_cop_bond',
    label: 'Married COP bond buyer',
    formData: {
      purchaser_type: 'married_coc',
      purchaser_entity_type: 'individual',
      marital_status: 'married',
      marital_regime: 'in_community',
      spouse_full_name: 'Example Spouse',
      employment_type: 'employed',
      purchase_finance_type: 'bond',
    },
  },
  {
    id: 'married_anc_bond_self_employed',
    label: 'Married ANC bond buyer, self-employed',
    formData: {
      purchaser_type: 'married_anc',
      purchaser_entity_type: 'individual',
      marital_status: 'married',
      marital_regime: 'out_of_community',
      spouse_full_name: 'Example Spouse',
      employment_type: 'self-employed',
      purchase_finance_type: 'bond',
    },
  },
  {
    id: 'foreign_cash',
    label: 'Foreign cash buyer',
    formData: {
      purchaser_type: 'foreign_purchaser',
      purchaser_entity_type: 'foreign_purchaser',
      purchase_finance_type: 'cash',
    },
  },
  {
    id: 'company_bond',
    label: 'Company bond buyer',
    formData: {
      purchaser_type: 'company',
      purchaser_entity_type: 'company',
      purchase_finance_type: 'bond',
    },
  },
  {
    id: 'trust_bond',
    label: 'Trust bond buyer',
    formData: {
      purchaser_type: 'trust',
      purchaser_entity_type: 'trust',
      purchase_finance_type: 'bond',
    },
  },
])

const PROFESSIONAL_ONLY_CANONICAL_KEYS = new Set(['signed_otp', 'transfer_documents'])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeFinanceForCanonical(value = '') {
  const normalized = normalizeKey(value)
  if (normalized === 'combination') return 'hybrid'
  return normalized || 'cash'
}

function resolveBuyerMaritalRegime(profile = {}, formData = {}) {
  const explicit = normalizeKey(formData.marital_regime || formData.marital_status)
  const branch = normalizeKey(profile.buyerBranch)
  if (branch === 'married_coc' || branch === 'married_cop' || explicit === 'in_community') return 'married_cop'
  if (branch === 'married_anc' || branch === 'married_anc_accrual' || explicit === 'out_of_community') return 'married_anc'
  return branch || explicit || ''
}

export function buildBuyerCanonicalDocumentScenario(profile = {}, formData = {}) {
  return Object.freeze({
    buyerEntityType: profile.buyerEntityType || formData.purchaser_entity_type || formData.purchaser_type || 'individual',
    buyerMaritalRegime: resolveBuyerMaritalRegime(profile, formData),
    financeType: normalizeFinanceForCanonical(profile.financeBranch || profile.financeType || formData.purchase_finance_type || 'cash'),
  })
}

function isProfessionalOnlyLegacyBuyerRow(row = {}) {
  const canonicalKey = normalizeKey(row.canonicalDocumentRequestKey)
  const visibility = normalizeKey(row.canonicalDocumentRequestVisibility)
  const ownerRole = normalizeKey(row.canonicalDocumentRequestOwnerRole)
  if (visibility === 'professional_shared') return true
  if (PROFESSIONAL_ONLY_CANONICAL_KEYS.has(canonicalKey) && ownerRole && ownerRole !== 'buyer') return true
  return false
}

function canonicalKeyFor(row = {}) {
  return normalizeKey(row.canonicalDocumentRequestKey || row.key || row.id)
}

function buildDuplicateCanonicalGroups(rows = []) {
  const groups = rows.reduce((acc, row) => {
    const canonicalKey = canonicalKeyFor(row)
    if (!canonicalKey) return acc
    if (!acc[canonicalKey]) acc[canonicalKey] = []
    acc[canonicalKey].push(row.key || row.id)
    return acc
  }, {})
  return Object.entries(groups)
    .filter(([, keys]) => keys.length > 1)
    .map(([canonicalKey, legacyKeys]) => Object.freeze({ canonicalKey, legacyKeys: Object.freeze(legacyKeys) }))
}

export function buildBuyerDocumentCanonicalCleanupProfile(input = {}) {
  const formData = input.formData || input.onboardingFormData?.formData || input.onboardingFormData || {}
  const profile = getBuyerRequirementProfile(input)
  const scenario = buildBuyerCanonicalDocumentScenario(profile, formData)
  const canonicalPlan = buildCanonicalDocumentRequestAudiencePlan(scenario, 'buyer')
  const legacyRows = Array.isArray(profile.requiredDocuments) ? profile.requiredDocuments : []
  const mappedRows = legacyRows.filter((row) => row.canonicalDocumentRequestKnown)
  const unmappedRows = legacyRows.filter((row) => !row.canonicalDocumentRequestKnown)
  const professionalOnlyLegacyRows = mappedRows.filter(isProfessionalOnlyLegacyBuyerRow)
  const pendingPolicyLegacyRows = mappedRows.filter((row) => normalizeKey(row.canonicalDocumentRequestLevel).startsWith('pending_policy_'))
  const buyerClientUploadRows = mappedRows.filter((row) => {
    if (isProfessionalOnlyLegacyBuyerRow(row)) return false
    if (normalizeKey(row.canonicalDocumentRequestVisibility) !== 'client_visible') return false
    if (normalizeKey(row.canonicalDocumentRequestOwnerRole) && normalizeKey(row.canonicalDocumentRequestOwnerRole) !== 'buyer') return false
    return true
  })
  const requestableBuyerClientUploadRows = buyerClientUploadRows.filter(
    (row) => !normalizeKey(row.canonicalDocumentRequestLevel).startsWith('pending_policy_'),
  )
  const mappedCanonicalKeys = unique(mappedRows.map(canonicalKeyFor))
  const requestablePlanKeys = canonicalPlan.requests.filter((request) => request.requestable).map((request) => request.key)
  const missingFromLegacyButCoveredByCanonicalPlan = requestablePlanKeys.filter((key) => !mappedCanonicalKeys.includes(key))
  const extraLegacyKeysOutsideBuyerUpload = mappedRows
    .filter((row) => !requestableBuyerClientUploadRows.some((candidate) => candidate.key === row.key))
    .map((row) => row.key)

  const containerModel = buildDocumentRequestContainerModel({
    transactionId: input.transaction?.id || input.transactionId || 'buyer-phase3',
    audience: 'buyer',
    requiredDocuments: canonicalPlan.requests
      .filter((request) => request.clientVisible && request.requestedFrom === 'buyer')
      .map((request) => ({
        id: `canonical_${request.key}`,
        document_key: request.key,
        document_label: request.label,
        requested_from: 'buyer',
        visibility_scope: 'client_visible',
        status: request.requestable ? 'required' : 'not_applicable',
        is_required: request.requestable,
      })),
    additionalRequests: input.additionalRequests || [],
  })

  return Object.freeze({
    version: BUYER_DOCUMENT_CANONICAL_CLEANUP_VERSION,
    buyerType: profile.buyerType,
    buyerEntityType: profile.buyerEntityType,
    financeType: profile.financeType,
    financeBranch: profile.financeBranch,
    scenario,
    legacyRequirementCount: legacyRows.length,
    mappedRequirementCount: mappedRows.length,
    buyerClientUploadCount: buyerClientUploadRows.length,
    requestableBuyerClientUploadCount: requestableBuyerClientUploadRows.length,
    canonicalPlanRequestCount: canonicalPlan.requests.length,
    canonicalPlanRequestableCount: canonicalPlan.summary.requestable,
    unmappedRows: Object.freeze(unmappedRows.map((row) => Object.freeze({ key: row.key, label: row.label }))),
    professionalOnlyLegacyRows: Object.freeze(
      professionalOnlyLegacyRows.map((row) =>
        Object.freeze({
          key: row.key,
          canonicalKey: row.canonicalDocumentRequestKey,
          ownerRole: row.canonicalDocumentRequestOwnerRole,
          visibility: row.canonicalDocumentRequestVisibility,
        }),
      ),
    ),
    pendingPolicyLegacyRows: Object.freeze(
      pendingPolicyLegacyRows.map((row) =>
        Object.freeze({
          key: row.key,
          canonicalKey: row.canonicalDocumentRequestKey,
          level: row.canonicalDocumentRequestLevel,
        }),
      ),
    ),
    duplicateCanonicalGroups: Object.freeze(buildDuplicateCanonicalGroups(mappedRows)),
    missingFromLegacyButCoveredByCanonicalPlan: Object.freeze(missingFromLegacyButCoveredByCanonicalPlan),
    extraLegacyKeysOutsideBuyerUpload: Object.freeze(extraLegacyKeysOutsideBuyerUpload),
    buyerClientUploadKeys: Object.freeze(unique(buyerClientUploadRows.map(canonicalKeyFor))),
    requestableBuyerClientUploadKeys: Object.freeze(unique(requestableBuyerClientUploadRows.map(canonicalKeyFor))),
    canonicalPlanKeys: Object.freeze(canonicalPlan.requests.map((request) => request.key)),
    canonicalPlanRequestableKeys: Object.freeze(requestablePlanKeys),
    containerSummary: containerModel.summary,
  })
}

export function buildBuyerDocumentCanonicalCleanupAudit(scenarios = BUYER_DOCUMENT_CLEANUP_SCENARIOS) {
  const results = scenarios.map((scenario) =>
    Object.freeze({
      id: scenario.id,
      label: scenario.label,
      profile: buildBuyerDocumentCanonicalCleanupProfile({
        formData: scenario.formData,
        purchaserType: scenario.formData.purchaser_type,
        financeType: scenario.formData.purchase_finance_type,
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

  return Object.freeze({
    version: BUYER_DOCUMENT_CANONICAL_CLEANUP_VERSION,
    scenarioCount: results.length,
    results: Object.freeze(results),
    summary: Object.freeze({
      unmappedCount: unmapped.length,
      professionalOnlyLegacyCount: professionalOnly.length,
      missingCoveredByCanonicalPlanCount: missingCovered.length,
      pendingPolicyLegacyCount: results.reduce((count, result) => count + result.profile.pendingPolicyLegacyRows.length, 0),
      duplicateCanonicalGroupCount: results.reduce((count, result) => count + result.profile.duplicateCanonicalGroups.length, 0),
    }),
    unmapped: Object.freeze(unmapped),
    professionalOnly,
    missingCoveredByCanonicalPlan: Object.freeze(missingCovered),
  })
}
