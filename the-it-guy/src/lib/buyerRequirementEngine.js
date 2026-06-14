import {
  deriveOnboardingConfiguration,
  getPurchaserTypeLabel,
  getVisibleOnboardingSections,
} from './purchaserPersonas.js'
import { normalizeFinanceType } from '../core/transactions/financeType.js'
import { resolveBuyerOnboardingFlow } from './buyerOnboardingFlow.js'

// Phase 9 canonical document consolidation:
// This legacy buyer requirement engine is retained as a compatibility fallback.
// New requirement generation should route through canonicalDocumentResolverService
// once CANONICAL_DOCUMENTS_SOURCE_OF_TRUTH / LEGACY_DOCUMENT_GENERATION_DISABLED
// are enabled and parity reports are clean. Remove only after adapters, backfill
// and production rollback checks have passed.

function normalizeStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'accepted') return 'completed'
  if (normalized === 'uploaded') return 'uploaded'
  if (normalized === 'under_review') return 'under_review'
  if (normalized === 'reupload_required') return 'rejected'
  if (normalized === 'not_required') return 'not_applicable'
  if (normalized === 'requested') return 'requested'
  if (normalized === 'approved') return 'approved'
  if (normalized === 'completed') return 'completed'
  return normalized || 'required'
}

function financeTypeLabel(financeType = 'cash') {
  const normalized = normalizeFinanceType(financeType || 'cash')
  if (normalized === 'bond') return 'Bond'
  if (normalized === 'combination') return 'Hybrid (Cash + Bond)'
  return 'Cash'
}

function requirementMatchesDocument(requirement, document = {}) {
  const key = String(requirement?.key || '').trim().toLowerCase()
  const documentKey = String(document?.key || document?.document_key || document?.portalDocumentType || '').trim().toLowerCase()
  const category = String(document?.category || '').trim().toLowerCase()
  const name = String(document?.name || '').trim().toLowerCase()
  const blob = `${documentKey} ${category} ${name}`

  if (key && documentKey && key === documentKey) {
    return true
  }

  if (!key) return false
  const keyWords = key.replaceAll('_', ' ').split(' ').filter(Boolean)
  return keyWords.length > 1 && keyWords.every((word) => blob.includes(word))
}

function normalizeRequirementGroup(requirement = {}) {
  return String(requirement?.groupKey || requirement?.requirement_group || '')
    .trim()
    .toLowerCase()
}

function getDocumentsFromInput(input = {}, uploadedDocuments = []) {
  if (Array.isArray(uploadedDocuments)) {
    return uploadedDocuments
  }
  if (Array.isArray(input?.requiredDocumentChecklist)) {
    return input.requiredDocumentChecklist
  }
  if (Array.isArray(input?.documents)) {
    return input.documents
  }
  return []
}

export function getBuyerRequirementProfile(transactionOrOnboardingData = {}) {
  const transaction = transactionOrOnboardingData?.transaction || transactionOrOnboardingData || {}
  const formData =
    transactionOrOnboardingData?.onboardingFormData?.formData ||
    transactionOrOnboardingData?.formData ||
    {}

  const flow = resolveBuyerOnboardingFlow(formData, transaction, {
    purchaserType: transaction?.purchaser_type || transactionOrOnboardingData?.purchaserType,
    financeType:
      formData?.purchase_finance_type ||
      transaction?.finance_type ||
      transactionOrOnboardingData?.financeType ||
      'cash',
  })
  const purchaserType = flow.purchaser_branch
  const financeType = normalizeFinanceType(
    flow.finance_type ||
      formData?.purchase_finance_type ||
      transaction?.finance_type ||
      transactionOrOnboardingData?.financeType ||
      'cash',
  )

  const derived = deriveOnboardingConfiguration(formData, {
    transaction,
    purchaserType,
    financeType,
  })

  const onboardingSections = getVisibleOnboardingSections({
    purchaserType,
    financeType,
    values: formData,
  }).map((section) => ({
    sectionKey: section.key,
    sectionTitle: section.title,
    requiredFields: (section.fields || [])
      .filter((field) => field.required)
      .map((field) => ({
        key: field.key,
        label: field.label,
      })),
  }))

  const requirementByKey = (derived.requiredDocuments || []).reduce((accumulator, item) => {
    accumulator[item.key] = item
    return accumulator
  }, {})

  const criticalGroups = new Set(['buyer_fica', 'sale', 'finance'])
  const criticalRequirements = (derived.requiredDocuments || []).filter((item) => {
    const level = String(item?.requirementLevel || 'required').trim().toLowerCase()
    if (level !== 'required') return false
    return criticalGroups.has(String(item?.groupKey || '').trim().toLowerCase())
  })

  return {
    buyerType: purchaserType,
    buyerTypeLabel: getPurchaserTypeLabel(purchaserType),
    buyerEntityType:
      purchaserType === 'trust'
        ? 'trust'
        : purchaserType === 'company'
          ? 'company'
          : purchaserType === 'foreign_purchaser'
            ? 'foreign_individual'
            : 'individual',
    financeType,
    financeTypeLabel: financeTypeLabel(financeType),
    purchaseMode: String(flow.purchase_mode || (derived?.derivedFields?.buyer_party_count > 1 ? 'co_purchasing' : 'individual')).trim().toLowerCase(),
    buyerBranch: String(flow.purchaser_branch || purchaserType).trim().toLowerCase(),
    financeBranch: String(flow.finance_branch || (financeType === 'combination' ? 'hybrid' : financeType)).trim().toLowerCase(),
    flow: flow || derived.flow || null,
    branchSummary: flow.branch_summary || derived?.flow?.branch_summary || null,
    buyerCount: Number(derived?.derivedFields?.buyer_party_count || 1),
    signatoryCount: Number(derived?.derivedFields?.signatory_count || 1),
    maritalStructure: String(derived?.derivedFields?.marital_structure || '').trim().toLowerCase(),
    isForeignBuyer: purchaserType === 'foreign_purchaser',
    isMarriedBuyer: ['married_coc', 'married_anc', 'married_anc_accrual'].includes(purchaserType),
    isMultipleBuyers: Number(derived?.derivedFields?.buyer_party_count || 1) > 1,
    hasBondComponent: Boolean(derived?.derivedFields?.has_bond_component),
    hasCashComponent: Boolean(derived?.derivedFields?.has_cash_component),
    requiresBondDocuments: Boolean(derived?.derivedFields?.requires_bond_documents),
    requiresProofOfFunds: Boolean(derived?.derivedFields?.requires_proof_of_funds),
    requiresEntityDocuments: Boolean(derived?.derivedFields?.requires_entity_documents),
    needsBondOriginator: Boolean(derived?.derivedFields?.needs_bond_originator),
    requiredDocuments: derived.requiredDocuments || [],
    requirementByKey,
    criticalRequirements,
    onboardingSections,
    summary: derived.summary || { headlineItems: [], lines: [] },
    flags: derived.flags || [],
    derivedFields: derived.derivedFields || {},
  }
}

export function buildBuyerRequirementProfile(onboardingData = {}, transactionData = null) {
  return getBuyerRequirementProfile({
    transaction: transactionData || onboardingData?.transaction || {},
    onboardingFormData: onboardingData?.onboardingFormData || onboardingData || {},
    financeType: onboardingData?.financeType || transactionData?.finance_type,
    purchaserType: onboardingData?.purchaserType || transactionData?.purchaser_type,
  })
}

export function isRequirementSatisfied(requirement, uploadedDocuments = []) {
  if (!requirement) return false
  const docs = Array.isArray(uploadedDocuments) ? uploadedDocuments : []

  const matched = docs.find((doc) => requirementMatchesDocument(requirement, doc))
  if (!matched) return false

  const status = normalizeStatus(matched?.status)
  if (['completed', 'approved', 'under_review', 'uploaded'].includes(status)) {
    return true
  }

  if (matched?.complete === true || matched?.isUploaded === true || matched?.is_uploaded === true) {
    return true
  }

  return false
}

export function getRequiredBuyerDocuments(requirementProfile) {
  if (!requirementProfile) return []
  return Array.isArray(requirementProfile.requiredDocuments) ? requirementProfile.requiredDocuments : []
}

export function getRequiredOnboardingSections(requirementProfile) {
  if (!requirementProfile) return []
  return Array.isArray(requirementProfile.onboardingSections) ? requirementProfile.onboardingSections : []
}

export function getRequiredTransactionActions(requirementProfile, uploadedDocuments = []) {
  if (!requirementProfile) return []
  const requiredDocuments = getRequiredBuyerDocuments(requirementProfile)
  const missing = requiredDocuments.filter((item) => !isRequirementSatisfied(item, uploadedDocuments))
  const missingKeys = new Set(missing.map((item) => String(item.key || '').trim().toLowerCase()))

  const actions = []
  if (missing.length) {
    actions.push({
      key: 'upload_required_documents',
      severity: 'critical',
      title: 'Upload required buyer documents',
      description: `${missing.length} required document${missing.length === 1 ? '' : 's'} still outstanding.`,
    })
  }

  if (requirementProfile.requiresProofOfFunds && [...missingKeys].some((key) => key.includes('proof_of_funds'))) {
    actions.push({
      key: 'submit_proof_of_funds',
      severity: 'critical',
      title: 'Submit proof of funds',
      description: 'Proof of funds is required for this cash or hybrid purchase.',
    })
  }

  if (requirementProfile.requiresBondDocuments && [...missingKeys].some((key) => key.includes('bond') || key.includes('income') || key.includes('bank_statement'))) {
    actions.push({
      key: 'complete_bond_pack',
      severity: 'critical',
      title: 'Complete bond document pack',
      description: 'Bond application and affordability documents are still missing.',
    })
  }

  if (requirementProfile.buyerType === 'trust' && [...missingKeys].some((key) => key.includes('trust') || key.includes('trustee') || key.includes('authority'))) {
    actions.push({
      key: 'complete_trust_documents',
      severity: 'critical',
      title: 'Complete trust authority documents',
      description: 'Trust deed, letters of authority, and trustee-related records are required.',
    })
  }

  if (requirementProfile.buyerType === 'company' && [...missingKeys].some((key) => key.includes('company') || key.includes('cipc') || key.includes('director'))) {
    actions.push({
      key: 'complete_company_documents',
      severity: 'critical',
      title: 'Complete company authority documents',
      description: 'Company registration, resolution, and signatory records are required.',
    })
  }

  if (
    requirementProfile.buyerType === 'foreign_purchaser' &&
    [...missingKeys].some((key) => key.includes('passport') || key.includes('source_of_funds') || key.includes('proof_of_address'))
  ) {
    actions.push({
      key: 'complete_foreign_buyer_pack',
      severity: 'critical',
      title: 'Complete foreign buyer document pack',
      description: 'Passport, address, and foreign source-of-funds records are still required.',
    })
  }

  return actions
}

export function getMissingBuyerRequirements(input = {}, uploadedDocuments = []) {
  const profile = input?.requiredDocuments ? input : getBuyerRequirementProfile(input)
  const requirements = getRequiredBuyerDocuments(profile)
  const docs = getDocumentsFromInput(input, uploadedDocuments)

  const missing = requirements.filter((item) => !isRequirementSatisfied(item, docs))
  const missingCritical = missing.filter((item) => String(item?.requirementLevel || 'required').trim().toLowerCase() === 'required')

  return {
    profile,
    missing,
    missingCritical,
    totalRequired: requirements.length,
    totalMissing: missing.length,
    totalMissingCritical: missingCritical.length,
    hasOutstanding: missing.length > 0,
  }
}

export function getMissingBuyerDocuments(input = {}, uploadedDocuments = []) {
  return getMissingBuyerRequirements(input, uploadedDocuments)
}

export function getBuyerFicaReadiness(input = {}, uploadedDocuments = []) {
  const profile = input?.requiredDocuments ? input : getBuyerRequirementProfile(input)
  const docs = getDocumentsFromInput(input, uploadedDocuments)
  const ficaRequirements = getRequiredBuyerDocuments(profile).filter((requirement) => {
    const level = String(requirement?.requirementLevel || 'required').trim().toLowerCase()
    if (level !== 'required') return false
    return normalizeRequirementGroup(requirement) === 'buyer_fica'
  })
  const missing = ficaRequirements.filter((requirement) => !isRequirementSatisfied(requirement, docs))
  return {
    ready: missing.length === 0,
    totalRequired: ficaRequirements.length,
    totalMissing: missing.length,
    missing,
    blockers: missing.map((item) => item.label || item.key || 'Required buyer FICA document'),
  }
}

export function getBuyerFinanceReadiness(input = {}, uploadedDocuments = []) {
  const profile = input?.requiredDocuments ? input : getBuyerRequirementProfile(input)
  const docs = getDocumentsFromInput(input, uploadedDocuments)
  const financeRequirements = getRequiredBuyerDocuments(profile).filter((requirement) => {
    const level = String(requirement?.requirementLevel || 'required').trim().toLowerCase()
    if (level !== 'required') return false
    return normalizeRequirementGroup(requirement) === 'finance'
  })
  const missing = financeRequirements.filter((requirement) => !isRequirementSatisfied(requirement, docs))
  const financeType = normalizeFinanceType(profile?.financeType || 'cash')
  const requiresFinancePack = financeType === 'bond' || financeType === 'combination'
  const requiresProofOfFunds = financeType === 'cash' || financeType === 'combination'
  const proofOfFundsOutstanding =
    requiresProofOfFunds &&
    missing.some((item) => String(item?.key || '').toLowerCase().includes('proof_of_funds'))
  const bondPackOutstanding =
    requiresFinancePack &&
    missing.some((item) => {
      const key = String(item?.key || '').toLowerCase()
      return key.includes('bond') || key.includes('income') || key.includes('bank_statement') || key.includes('payslip')
    })

  return {
    ready: missing.length === 0,
    financeType,
    totalRequired: financeRequirements.length,
    totalMissing: missing.length,
    missing,
    requiresFinancePack,
    requiresProofOfFunds,
    proofOfFundsOutstanding,
    bondPackOutstanding,
    blockers: [
      proofOfFundsOutstanding ? 'Proof of funds is still outstanding.' : null,
      bondPackOutstanding ? 'Bond affordability/application documents are still outstanding.' : null,
    ].filter(Boolean),
  }
}

export function getTransferReadinessFromBuyerDocs(input = {}, uploadedDocuments = []) {
  const profile = input?.requiredDocuments ? input : getBuyerRequirementProfile(input)
  const docs = getDocumentsFromInput(input, uploadedDocuments)
  const missingState = getMissingBuyerRequirements(profile, docs)
  const ficaReadiness = getBuyerFicaReadiness(profile, docs)
  const financeReadiness = getBuyerFinanceReadiness(profile, docs)
  const saleRequirements = getRequiredBuyerDocuments(profile).filter((requirement) => {
    const level = String(requirement?.requirementLevel || 'required').trim().toLowerCase()
    if (level !== 'required') return false
    return normalizeRequirementGroup(requirement) === 'sale'
  })
  const saleMissing = saleRequirements.filter((requirement) => !isRequirementSatisfied(requirement, docs))
  const onboardingCompleted =
    String(input?.onboardingStatus || input?.onboarding?.status || '').trim().toLowerCase() === 'completed'
  const blockers = [
    !onboardingCompleted ? 'Buyer onboarding is not completed yet.' : null,
    ...ficaReadiness.blockers,
    ...financeReadiness.blockers,
    ...saleMissing.map((item) => `${item.label || item.key || 'Sale document'} is still outstanding.`),
  ].filter(Boolean)

  return {
    ready: blockers.length === 0 && missingState.totalMissingCritical === 0,
    onboardingCompleted,
    blockers,
    missingCriticalCount: missingState.totalMissingCritical,
    missingCount: missingState.totalMissing,
    fica: ficaReadiness,
    finance: financeReadiness,
  }
}

export function canProgressTransactionStage(
  { targetStage = '', requirementProfile = null, requiredDocumentChecklist = [] } = {},
) {
  const profile = requirementProfile || getBuyerRequirementProfile({})
  const missingState = getMissingBuyerRequirements(profile, requiredDocumentChecklist)
  const stageText = String(targetStage || '').trim().toLowerCase()

  const transferLike =
    stageText.includes('transfer') ||
    stageText.includes('attorney') ||
    stageText.includes('lodg') ||
    stageText.includes('register')
  const financeLike = stageText.includes('finance') || stageText.includes('bond')

  const blockingRequirements = missingState.missingCritical.filter((item) => {
    const group = String(item?.groupKey || '').trim().toLowerCase()
    if (transferLike) {
      return group === 'buyer_fica' || group === 'sale'
    }
    if (financeLike) {
      return group === 'finance'
    }
    return false
  })

  return {
    canProgress: blockingRequirements.length === 0,
    blockingRequirements,
    warnings:
      missingState.missing.length > 0
        ? [
            `${missingState.totalMissing} required document${
              missingState.totalMissing === 1 ? '' : 's'
            } are still outstanding for this buyer and finance profile.`,
          ]
        : [],
    profile,
  }
}

export function getRoleFilteredRequirements(
  requirementProfile,
  role = 'client',
) {
  const profile = requirementProfile || null
  if (!profile) return []
  const requirements = getRequiredBuyerDocuments(profile)
  const normalizedRole = String(role || '').trim().toLowerCase()

  if (normalizedRole === 'client' || normalizedRole === 'buyer' || normalizedRole === 'seller') {
    return requirements.filter((item) => String(item?.expectedFromRole || 'client').trim().toLowerCase() === 'client')
  }

  if (normalizedRole === 'bond_originator') {
    return requirements.filter((item) => String(item?.groupKey || '').trim().toLowerCase() === 'finance')
  }

  if (normalizedRole === 'attorney') {
    return requirements
  }

  return requirements
}
