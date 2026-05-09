import {
  deriveOnboardingConfiguration,
  getPurchaserTypeLabel,
  getVisibleOnboardingSections,
  resolvePurchaserTypeFromFormData,
} from './purchaserPersonas'
import { normalizeFinanceType } from '../core/transactions/financeType'

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

export function getBuyerRequirementProfile(transactionOrOnboardingData = {}) {
  const transaction = transactionOrOnboardingData?.transaction || transactionOrOnboardingData || {}
  const formData =
    transactionOrOnboardingData?.onboardingFormData?.formData ||
    transactionOrOnboardingData?.formData ||
    {}

  const purchaserType = resolvePurchaserTypeFromFormData(formData, {
    purchaserType: transaction?.purchaser_type || transactionOrOnboardingData?.purchaserType,
    transaction,
  })
  const financeType = normalizeFinanceType(
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
    financeType,
    financeTypeLabel: financeTypeLabel(financeType),
    buyerCount: Number(derived?.derivedFields?.buyer_party_count || 1),
    signatoryCount: Number(derived?.derivedFields?.signatory_count || 1),
    maritalStructure: String(derived?.derivedFields?.marital_structure || '').trim().toLowerCase(),
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

  return actions
}

export function getMissingBuyerRequirements(input = {}, uploadedDocuments = []) {
  const profile = input?.requiredDocuments ? input : getBuyerRequirementProfile(input)
  const requirements = getRequiredBuyerDocuments(profile)
  const docs = Array.isArray(uploadedDocuments)
    ? uploadedDocuments
    : Array.isArray(input?.requiredDocumentChecklist)
      ? input.requiredDocumentChecklist
      : Array.isArray(input?.documents)
        ? input.documents
        : []

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
