// Extracted from the legacy API; query, mapping and error behaviour are preserved.
import { normalizeDocumentRequestStatus, normalizeDocumentRequestPriority } from '../../core/transactions/attorneyOperationalEngine'
import { DEFAULT_DOCUMENT_REQUIREMENTS } from '../../core/documents/documentRequirementRules'
import { isMissingSchemaError, isPermissionDeniedError, isMissingColumnError } from '../../lib/api/shared/readHelpers.js'
import { resolveTransactionSaleProfile } from '../../core/transactions/transactionSaleProfile.js'
import { resolveCrossModuleDocumentReference } from '../../services/documents/crossModuleDocumentKeyMapService.js'
import { normalizeMainStage } from '../../core/transactions/legacyReadModel.js'
import { getMainStageIndex } from '../../core/transactions/stageConfig'
import { normalizeFinanceType } from '../../core/transactions/financeType'
import { getGroupByKey, normalizeRequiredStatus, statusFromLegacyFlags } from '../../core/documents/documentVaultArchitecture'
import { resolvePortalDocumentMetadata } from '../../core/documents/portalDocumentMetadata'
import { getCanonicalDocumentRolloutMode } from '../../services/documents/canonicalDocumentConsolidationService'
import { fetchTransactionDocumentRequirementsByTransactionIds as fetchCanonicalTransactionDocumentRequirementsByTransactionIds } from '../../services/documents/transactionCanonicalDocumentRequirementService'
import { isOptionalRelationKnownMissing, rememberMissingOptionalRelation } from '../../lib/api/shared/schemaReadCompatibility.js'
import { resolveRequirementReviewStatus } from '../../services/documents/requirementReviewStatus.js'
import { isDocumentRequirementRequired, matchDocumentRequirementLink } from '../../core/documents/documentRequirementIdentity.js'
import { normalizeRoleType } from '../../core/transactions/permissions'

export const ADDITIONAL_DOCUMENT_REQUEST_VISIBILITY_TYPES = ['client_visible', 'internal_only', 'shared_role_players']

export const ADDITIONAL_DOCUMENT_REQUEST_REQUESTED_FROM_TYPES = [
  'buyer',
  'seller',
  'buyer_and_seller',
  'agent',
  'developer',
  'attorney',
  'bond_originator',
  'other',
]

export function normalizeDocumentRequestStatusValue(value) {
  return normalizeDocumentRequestStatus(value)
}

export function normalizeDocumentRequestPriorityValue(value) {
  return normalizeDocumentRequestPriority(value)
}

export function normalizeRequestRoleScope(value, fallback = 'client') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (!normalized) {
    return fallback
  }
  if (normalized === 'bond') {
    return 'bond_originator'
  }
  if (normalized === 'buyer_and_seller' || normalized === 'both_buyer_and_seller') {
    return 'client'
  }
  return normalized
}

export function normalizeAdditionalDocumentRequestVisibility(value, fallback = 'shared_role_players') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (!normalized) return fallback
  if (normalized === 'client' || normalized === 'client_visible') return 'client_visible'
  if (normalized === 'shared' || normalized === 'shared_role_players') return 'shared_role_players'
  if (normalized === 'internal' || normalized === 'internal_only') return 'internal_only'
  return ADDITIONAL_DOCUMENT_REQUEST_VISIBILITY_TYPES.includes(normalized) ? normalized : fallback
}

export function normalizeAdditionalDocumentRequestRequestedFrom(value, fallback = 'buyer') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (!normalized) return fallback
  if (normalized === 'both_buyer_and_seller' || normalized === 'buyer_seller' || normalized === 'both') {
    return 'buyer_and_seller'
  }
  if (normalized === 'client' || normalized === 'buyer_or_seller') {
    return 'buyer_and_seller'
  }
  if (normalized === 'bond' || normalized === 'bond_originator') {
    return 'bond_originator'
  }
  return ADDITIONAL_DOCUMENT_REQUEST_REQUESTED_FROM_TYPES.includes(normalized) ? normalized : fallback
}

export function normalizeAdditionalDocumentRequestPriority(value, fallback = 'normal') {
  const normalized = normalizeDocumentRequestPriorityValue(value)
  if (normalized === 'urgent' || normalized === 'required') return 'urgent'
  if (normalized === 'optional') return 'normal'
  if (normalized === 'important') return 'normal'
  if (normalized === 'normal') return 'normal'
  return fallback
}

export function mapRequestedFromToAssignedRole(requestedFrom = '') {
  const normalized = normalizeAdditionalDocumentRequestRequestedFrom(requestedFrom, 'buyer')
  if (normalized === 'buyer') return 'buyer'
  if (normalized === 'seller') return 'seller'
  if (normalized === 'buyer_and_seller') return 'client'
  if (normalized === 'agent') return 'agent'
  if (normalized === 'developer') return 'developer'
  if (normalized === 'attorney') return 'attorney'
  if (normalized === 'bond_originator') return 'bond_originator'
  return 'client'
}

export function normalizeRequirementRows(rows) {
  if (!rows?.length) {
    return DEFAULT_DOCUMENT_REQUIREMENTS
  }

  const mergedByKey = new Map()

  for (const row of rows) {
    const current = mergedByKey.get(row.category_key)
    const normalized = {
      key: row.category_key,
      label: row.label,
      sortOrder: row.sort_order ?? 999,
      keywords: DEFAULT_DOCUMENT_REQUIREMENTS.find((item) => item.key === row.category_key)?.keywords || [
        String(row.label || row.category_key).toLowerCase(),
      ],
      scoped: Boolean(row.development_id),
    }

    if (!current || (!current.scoped && normalized.scoped)) {
      mergedByKey.set(row.category_key, normalized)
    }
  }

  const normalizedRows = [...mergedByKey.values()].sort((a, b) => a.sortOrder - b.sortOrder)

  return normalizedRows.length ? normalizedRows : DEFAULT_DOCUMENT_REQUIREMENTS
}

export async function fetchDocumentRequirements(client, developmentId = null) {
  try {
    let query = client
      .from('document_requirements')
      .select('id, development_id, category_key, label, sort_order')
      .order('sort_order', { ascending: true })

    if (developmentId) {
      query = query.or(`development_id.is.null,development_id.eq.${developmentId}`)
    } else {
      query = query.is('development_id', null)
    }

    const { data, error } = await query

    if (error) {
      if (isMissingSchemaError(error) || isPermissionDeniedError(error)) {
        return DEFAULT_DOCUMENT_REQUIREMENTS
      }

      throw error
    }

    return normalizeRequirementRows(data)
  } catch (error) {
    if (isMissingSchemaError(error) || isPermissionDeniedError(error)) {
      return DEFAULT_DOCUMENT_REQUIREMENTS
    }

    throw error
  }
}

export function classifyDocumentToRequirement(document, requirements) {
  const haystack = `${document.category || ''} ${document.name || ''}`.toLowerCase()

  const directMatch = requirements.find(
    (requirement) =>
      haystack.includes(requirement.key.replaceAll('_', ' ')) || haystack.includes(requirement.label.toLowerCase()),
  )

  if (directMatch) {
    return directMatch.key
  }

  const keywordMatch = requirements.find((requirement) =>
    requirement.keywords.some((keyword) => haystack.includes(keyword.toLowerCase())),
  )

  return keywordMatch?.key || null
}

export function parseTimestamp(value) {
  const parsed = new Date(value || 0).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export function getDocumentSearchText(document) {
  return `${document?.name || ''} ${document?.category || ''}`.toLowerCase()
}

export function isSignedVariantDocument(document) {
  const text = getDocumentSearchText(document)
  return /\bsigned\b|\bexecuted\b|\bfinal\b|\bcompleted\b|\bcountersigned\b/.test(text)
}

export function isTemplateVariantDocument(document) {
  const text = getDocumentSearchText(document)
  return /\btemplate\b|\bblank\b|\bunsigned\b|\bdraft\b|\bsample\b|\bspecimen\b/.test(text)
}

export function documentPriorityScore(document) {
  const role = String(document?.uploaded_by_role || '').toLowerCase()
  let score = 20

  if (role === 'client') {
    score = 60
  } else if (role === 'attorney' || role === 'tuckers' || role === 'bond_originator') {
    score = 50
  } else if (role === 'developer' || role === 'agent' || role === 'internal_admin') {
    score = 35
  }

  if (document?.external_access_id) {
    score += 6
  }

  if (isSignedVariantDocument(document)) {
    score += 45
  }

  if (isTemplateVariantDocument(document)) {
    score -= 35
  }

  return score
}

export function isPreferredRequirementDocument(candidate, current) {
  if (!current) {
    return true
  }

  const candidateScore = documentPriorityScore(candidate)
  const currentScore = documentPriorityScore(current)

  if (candidateScore !== currentScore) {
    return candidateScore > currentScore
  }

  return parseTimestamp(candidate?.created_at) > parseTimestamp(current?.created_at)
}

export function buildDocumentChecklist(requirements, documents) {
  const matchedRequirementKeys = new Set()
  const matchedDocumentsByRequirement = new Map()

  for (const document of documents) {
    const key = classifyDocumentToRequirement(document, requirements)
    if (key) {
      matchedRequirementKeys.add(key)
      const current = matchedDocumentsByRequirement.get(key)
      if (isPreferredRequirementDocument(document, current)) {
        matchedDocumentsByRequirement.set(key, document)
      }
    }
  }

  const checklist = requirements.map((requirement) => ({
    key: requirement.key,
    label: requirement.label,
    complete: matchedRequirementKeys.has(requirement.key),
    matchedDocument: matchedDocumentsByRequirement.get(requirement.key) || null,
  }))

  const uploadedCount = checklist.filter((item) => item.complete).length

  return {
    checklist,
    summary: {
      uploadedCount,
      totalRequired: checklist.length,
    },
  }
}

export const FINANCE_PRE_COLLECTION_DOCUMENT_KEYS = new Set([])

export function normalizeChecklistTraceRole(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (!normalized || normalized === 'client') return 'Buyer'
  if (normalized === 'buyer') return 'Buyer'
  if (normalized === 'seller') return 'Seller'
  if (normalized === 'agent') return 'Agent'
  if (normalized === 'attorney' || normalized === 'transfer_attorney') return 'Conveyancer / Transfer Attorney'
  if (normalized === 'bond_originator') return 'Bond originator'
  if (normalized === 'bond_attorney') return 'Bond attorney'
  if (normalized === 'cancellation_attorney') return 'Cancellation attorney'
  if (normalized === 'developer') return 'Developer'
  return normalized
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function getTransactionSellerPartyRequirementMeta(transaction = {}) {
  const saleProfile = resolveTransactionSaleProfile({ transaction })
  if (saleProfile.isDeveloperSale) {
    return {
      isDeveloperSale: true,
      partyRole: 'developer',
      partyLabel: 'Developer',
      documentsLabel: 'Developer Documents',
      onboardingWorkflow: 'OTP / Developer onboarding',
      deferredReason: 'Developer requirements are deferred until OTP is active.',
      unknownEntityReason: 'Developer entity type is not captured yet.',
      inactiveReason: 'Developer requirements are deferred until the developer workflow is active.',
      noActiveReason: 'No developer requirements apply at this stage.',
      triggeringCondition: 'developer-side requirements are active for this development sale stage',
    }
  }
  return {
    isDeveloperSale: false,
    partyRole: 'seller',
    partyLabel: 'Seller',
    documentsLabel: 'Seller Documents',
    onboardingWorkflow: 'OTP / Seller onboarding',
    deferredReason: 'Seller requirements are deferred until OTP is active.',
    unknownEntityReason: 'Seller type is not captured yet.',
    inactiveReason: 'Seller requirements are deferred until the seller workflow is active.',
    noActiveReason: 'No seller requirements apply at this stage.',
    triggeringCondition: 'seller-side requirements are active for this transaction stage',
  }
}

export function getTransactionAgencyPartyRequirementMeta(transaction = {}) {
  const saleProfile = resolveTransactionSaleProfile({ transaction })
  const isExternalAgencySale = saleProfile.saleRoute === 'external_agency_sale'
  return {
    isExternalAgencySale,
    partyRole: 'agency',
    partyLabel: 'Agency / Introducing Agent',
    documentsLabel: 'Agency Documents',
    onboardingWorkflow: 'Agency / Introducing Agent handover',
    inactiveReason: 'Agency requirements only apply to external agency sales.',
  }
}

export function isSellerPartyRequirement(row = {}, partyMeta = getTransactionSellerPartyRequirementMeta()) {
  const key = String(row?.document_key || row?.key || row?.id || '').trim().toLowerCase()
  const groupKey = String(row?.group_key || row?.groupKey || row?.group || '').trim().toLowerCase()
  const expectedFromRole = String(row?.required_from_role || row?.expectedFromRole || row?.requiredFrom || '').trim().toLowerCase()
  const appliesTo = String(row?.appliesTo || row?.applies_to || '').trim().toLowerCase()
  const category = String(row?.category || row?.documentCategory || row?.document_category || '').trim().toLowerCase()

  if (
    groupKey.includes('seller') ||
    key === 'seller_fica' ||
    key.startsWith('seller_') ||
    (expectedFromRole === 'seller' && !groupKey.includes('cancellation'))
  ) {
    return true
  }

  if (!partyMeta.isDeveloperSale) return false
  return (
    expectedFromRole === 'developer' ||
    appliesTo === 'developer' ||
    category === 'development_documents' ||
    key.startsWith('developer_') ||
    ['unit_schedule', 'building_plans', 'occupation_certificate', 'hoa_body_corporate_rules', 'sectional_title_documents', 'nhbrc_compliance_documents'].includes(key)
  )
}

export function isAgencyPartyRequirement(row = {}, agencyMeta = getTransactionAgencyPartyRequirementMeta()) {
  if (!agencyMeta.isExternalAgencySale) return false
  const key = String(row?.document_key || row?.key || row?.id || '').trim().toLowerCase()
  const groupKey = String(row?.group_key || row?.groupKey || row?.group || '').trim().toLowerCase()
  const expectedFromRole = String(row?.required_from_role || row?.expectedFromRole || row?.requiredFrom || '').trim().toLowerCase()
  const appliesTo = String(row?.appliesTo || row?.applies_to || '').trim().toLowerCase()
  const category = String(row?.category || row?.documentCategory || row?.document_category || '').trim().toLowerCase()

  return (
    groupKey.includes('agency') ||
    expectedFromRole === 'agency' ||
    expectedFromRole === 'introducing_agent' ||
    appliesTo === 'agency' ||
    category === 'agency_documents' ||
    key.startsWith('agency_') ||
    key.startsWith('introducing_agent_')
  )
}

export function buildRequirementDocumentReference(row = {}, context = {}) {
  return resolveCrossModuleDocumentReference(
    row.canonicalDocumentKey ||
      row.canonical_document_key ||
      row.documentDefinitionKey ||
      row.document_definition_key ||
      row.document_key ||
      row.key ||
      row.document_type,
    {
      ownerRole: row.documentOwnerRole || row.document_owner_role,
      requestedFromRole: row.expectedFromRole || row.required_from_role || row.requested_from || row.responsible_role,
      groupKey: row.groupKey || row.group_key,
      packKey: row.packKey || row.pack_key || row.documentPackKey,
      visibleSection: row.visibleSection || row.visible_section,
      portalWorkspaceCategory: row.portalWorkspaceCategory || row.portal_workspace_category,
      transaction: context.transaction,
    },
  )
}

export function withCrossModuleRequirementMetadata(row = {}, context = {}) {
  const documentReference = buildRequirementDocumentReference(row, context)
  return {
    ...row,
    canonicalDocumentKey: row.canonicalDocumentKey || documentReference.canonicalDocumentKey,
    crossModuleDocumentKey: row.crossModuleDocumentKey || documentReference.crossModuleDocumentKey,
    crossModuleDocumentMapVersion: row.crossModuleDocumentMapVersion || documentReference.crossModuleDocumentMapVersion,
    crossModuleDocumentKnown: row.crossModuleDocumentKnown ?? documentReference.crossModuleDocumentKnown,
    documentOwnerRole: row.documentOwnerRole || documentReference.documentOwnerRole,
    documentResponsibleRoles: row.documentResponsibleRoles || documentReference.documentResponsibleRoles,
    documentPackKey: row.documentPackKey || documentReference.documentPackKey,
    documentCategory: row.documentCategory || documentReference.documentCategory,
  }
}

export function getRequirementWorkflowMetadata(row = {}, context = {}) {
  const key = String(row?.document_key || row?.key || '')
    .trim()
    .toLowerCase()
  const groupKey = String(row?.group_key || row?.groupKey || '')
    .trim()
    .toLowerCase()
  const expectedFromRole = String(row?.required_from_role || row?.expectedFromRole || 'client')
    .trim()
    .toLowerCase()
  const mainStage = normalizeMainStage(
    context?.currentMainStage,
    context?.stage || context?.transaction?.stage || 'Available',
  )
  const mainStageIndex = getMainStageIndex(mainStage)
  const financeVisible = mainStageIndex >= getMainStageIndex('FIN')
  const preCollectionAllowed = FINANCE_PRE_COLLECTION_DOCUMENT_KEYS.has(key)
  const sellerPartyMeta = getTransactionSellerPartyRequirementMeta(context?.transaction)
  const agencyPartyMeta = getTransactionAgencyPartyRequirementMeta(context?.transaction)

  let owningWorkflow = 'Transaction Documents'
  let visibleSection = 'transfer_documents'
  let blockingStage = 'ATTY'

  if (groupKey === 'sale' || groupKey === 'buyer_fica') {
    owningWorkflow = 'OTP / Buyer onboarding'
    visibleSection = 'buyer_documents'
    blockingStage = 'OTP'
  } else if (groupKey === 'finance') {
    owningWorkflow = 'Finance'
    visibleSection = 'finance_documents'
    blockingStage = 'FIN'
  } else if (groupKey === 'transfer') {
    owningWorkflow = 'Transfer of Property'
    visibleSection = 'transfer_documents'
    blockingStage = 'ATTY'
  } else if (isSellerPartyRequirement(row, sellerPartyMeta)) {
    owningWorkflow = sellerPartyMeta.onboardingWorkflow
    visibleSection = 'seller_documents'
    blockingStage = 'OTP'
  } else if (isAgencyPartyRequirement(row, agencyPartyMeta)) {
    owningWorkflow = agencyPartyMeta.onboardingWorkflow
    visibleSection = 'agency_documents'
    blockingStage = 'OTP'
  } else if (groupKey.includes('cancellation') || key.includes('cancellation')) {
    owningWorkflow = 'Bond Cancellation'
    visibleSection = 'transfer_documents'
    blockingStage = 'ATTY'
  } else if (
    groupKey.includes('bond') ||
    expectedFromRole === 'bond_originator' ||
    expectedFromRole === 'bond_attorney'
  ) {
    owningWorkflow = 'Bond Registration'
    visibleSection = 'finance_documents'
    blockingStage = 'FIN'
  }

  const isBlocking =
    row?.requirementLevel !== 'optional_required' &&
    row?.requirementLevel !== 'optional' &&
    !(visibleSection === 'finance_documents' && preCollectionAllowed && !financeVisible)

  return {
    owningWorkflow,
    visibleSection,
    blockingStage,
    preCollectionAllowed,
    isBlocking,
  }
}

export function inferRequirementTriggeringCondition(row = {}, context = {}) {
  const key = String(row?.document_key || row?.key || '')
    .trim()
    .toLowerCase()
  const transaction = context?.transaction || {}
  const financeType = normalizeFinanceType(
    context?.financeType || transaction?.finance_type || context?.formData?.purchase_finance_type || 'cash',
    { allowUnknown: true },
  )

  if (key === 'bond_approval' || key === 'grant_signed') return `finance_type = ${financeType || 'bond'}`
  if (key === 'proof_of_funds') return `finance_type = ${financeType || 'cash'}`
  if (key === 'proof_of_funds_cash_component') return 'finance_type = hybrid'
  if (key.includes('payslip') || key.includes('bank_statement') || key === 'proof_of_income') {
    return `finance_type = ${financeType || 'bond'}`
  }
  if (key === 'passport_copy') return 'buyer persona resolved as foreign purchaser'
  if (key === 'source_of_funds') return 'foreign purchaser or cash-source compliance path'
  if (key.includes('cancellation')) return 'seller_has_existing_bond = true'
  if (key === 'seller_fica' || key.startsWith('seller_') || key.startsWith('developer_'))
    return getTransactionSellerPartyRequirementMeta(context?.transaction).triggeringCondition
  if (key === 'transfer_documents') return 'transaction entered transfer workflow document set'
  if (key === 'otp' || key === 'information_sheet') return 'base buyer onboarding requirements'
  return 'legacy requirement generator'
}

export function withRequirementTraceMetadata(row = {}, context = {}) {
  const enrichedRow = withCrossModuleRequirementMetadata(row, context)
  const workflowMeta = getRequirementWorkflowMetadata(row, context)
  const currentMainStage = normalizeMainStage(
    context?.currentMainStage,
    context?.stage || context?.transaction?.stage || 'Available',
  )
  return {
    ...enrichedRow,
    owningWorkflow: enrichedRow.owningWorkflow || workflowMeta.owningWorkflow,
    visibleSection: enrichedRow.visibleSection || workflowMeta.visibleSection,
    blockingStage: enrichedRow.blockingStage || workflowMeta.blockingStage,
    preCollectionAllowed: enrichedRow.preCollectionAllowed === true || workflowMeta.preCollectionAllowed === true,
    isBlocking: enrichedRow.isBlocking ?? workflowMeta.isBlocking,
    sourceEngine: enrichedRow.sourceEngine || 'legacy_transaction_required_documents',
    sourceRuleOrLegacyPath:
      enrichedRow.sourceRuleOrLegacyPath || '/src/lib/purchaserPersonas.js#deriveOnboardingConfiguration',
    triggeringCondition: enrichedRow.triggeringCondition || inferRequirementTriggeringCondition(enrichedRow, context),
    currentMainStageAtGeneration: enrichedRow.currentMainStageAtGeneration || currentMainStage,
    lastRecalculatedAt:
      enrichedRow.lastRecalculatedAt ||
      enrichedRow.updatedAt ||
      enrichedRow.updated_at ||
      enrichedRow.createdAt ||
      enrichedRow.created_at ||
      null,
    requestedFromLabel: normalizeChecklistTraceRole(
      enrichedRow.expectedFromRole || enrichedRow.required_from_role || 'client',
    ),
    debugTrace: enrichedRow.debugTrace || {
      documentName:
        enrichedRow.label || enrichedRow.document_label || enrichedRow.key || enrichedRow.document_key || 'Document',
      owningWorkflow: enrichedRow.owningWorkflow || workflowMeta.owningWorkflow,
      requestedFrom: normalizeChecklistTraceRole(
        enrichedRow.expectedFromRole || enrichedRow.required_from_role || 'client',
      ),
      visibleSection: enrichedRow.visibleSection || workflowMeta.visibleSection,
      sourceEngine: enrichedRow.sourceEngine || 'legacy_transaction_required_documents',
      sourceRuleOrLegacyPath:
        enrichedRow.sourceRuleOrLegacyPath || '/src/lib/purchaserPersonas.js#deriveOnboardingConfiguration',
      triggeringCondition: enrichedRow.triggeringCondition || inferRequirementTriggeringCondition(enrichedRow, context),
      canonicalDocumentKey: enrichedRow.canonicalDocumentKey,
      documentOwnerRole: enrichedRow.documentOwnerRole,
      documentResponsibleRoles: enrichedRow.documentResponsibleRoles,
      documentPackKey: enrichedRow.documentPackKey,
      currentMainStageAtGeneration: enrichedRow.currentMainStageAtGeneration || currentMainStage,
      blockingStage: enrichedRow.blockingStage || workflowMeta.blockingStage,
      preCollectionAllowed: enrichedRow.preCollectionAllowed === true || workflowMeta.preCollectionAllowed === true,
      createdAt: enrichedRow.createdAt || enrichedRow.created_at || null,
      lastRecalculatedAt:
        enrichedRow.lastRecalculatedAt ||
        enrichedRow.updatedAt ||
        enrichedRow.updated_at ||
        enrichedRow.createdAt ||
        enrichedRow.created_at ||
        null,
    },
  }
}

export function normalizeRequiredDocumentRows(rows = [], metadataByKey = {}, context = {}) {
  return rows
    .map((row) => {
      const metadata = metadataByKey[row.document_key] || {}
      const resolvedGroupKey = String(row.group_key || metadata.groupKey || 'buyer_fica')
      const groupMeta = getGroupByKey(resolvedGroupKey)
      const isRequired = row.is_required !== false
      const isUploaded = Boolean(row.is_uploaded)
      const description = row.description || metadata.description || ''
      const portalMetadata = resolvePortalDocumentMetadata({
        portal_workspace_category: row.portal_workspace_category || metadata.portalWorkspaceCategory,
        group_key: groupMeta.key,
        document_type: row.document_type || metadata.documentType || row.document_key,
        document_key: row.document_key,
        label: row.document_label,
        description,
      })

      return {
        id: row.id,
        transactionId: row.transaction_id,
        key: row.document_key,
        label: row.document_label,
        groupKey: groupMeta.key,
        groupLabel: row.group_label || metadata.groupLabel || groupMeta.label,
        group: row.group_label || metadata.groupLabel || groupMeta.label,
        description,
        requirementLevel: metadata.requirementLevel || 'required',
        isRequired,
        isUploaded,
        status: normalizeRequiredStatus(row.status, statusFromLegacyFlags({ isRequired, isUploaded })),
        isEnabled: row.enabled !== false,
        expectedFromRole: row.required_from_role || metadata.expectedFromRole || 'client',
        visibilityScope: row.visibility_scope || metadata.defaultVisibility || 'client',
        allowMultiple: row.allow_multiple === true || metadata.allowMultiple === true,
        uploadedDocumentId: row.uploaded_document_id || null,
        uploadedAt: row.uploaded_at || null,
        verifiedAt: row.verified_at || null,
        rejectedAt: row.rejected_at || null,
        notes: row.notes || '',
        rejectionReason: row.rejected_note || row.rejection_reason || row.notes || '',
        rejection_reason: row.rejected_note || row.rejection_reason || row.notes || '',
        sortOrder: row.sort_order ?? 999,
        canonicalRequirementInstanceId: row.canonical_requirement_instance_id || null,
        canonical_requirement_instance_id: row.canonical_requirement_instance_id || null,
        requirementIdentity: row.requirement_identity || null,
        requirement_identity: row.requirement_identity || null,
        requirementIdentityVersion: row.requirement_identity_version || null,
        requirement_identity_version: row.requirement_identity_version || null,
        requirementBaseKey: row.requirement_base_key || null,
        requirement_base_key: row.requirement_base_key || null,
        participantRole: row.participant_role || null,
        participant_role: row.participant_role || null,
        participantKey: row.participant_key || null,
        participant_key: row.participant_key || null,
        requirementBaselineVersion: row.requirement_baseline_version || null,
        requirement_baseline_version: row.requirement_baseline_version || null,
        originatorProfileKey: row.originator_profile_key || null,
        originator_profile_key: row.originator_profile_key || null,
        originatorProfileVersion: row.originator_profile_version || null,
        originator_profile_version: row.originator_profile_version || null,
        requirementProfileFingerprint: row.requirement_profile_fingerprint || null,
        requirement_profile_fingerprint: row.requirement_profile_fingerprint || null,
        decisionFingerprint: row.decision_fingerprint || null,
        decision_fingerprint: row.decision_fingerprint || null,
        reconciliationFingerprint: row.reconciliation_fingerprint || null,
        reconciliation_fingerprint: row.reconciliation_fingerprint || null,
        reconciliationSource: row.reconciliation_source || null,
        reconciliation_source: row.reconciliation_source || null,
        reconciledAt: row.reconciled_at || null,
        reconciled_at: row.reconciled_at || null,
        portalDocumentType: portalMetadata.portalDocumentType,
        portalWorkspaceCategory: portalMetadata.portalWorkspaceCategory,
        portalMappingSource: portalMetadata.portalMappingSource,
        portalMappingConfidence: portalMetadata.portalMappingConfidence,
        portalMappingAmbiguous: portalMetadata.portalMappingAmbiguous,
        canonicalDocumentKey: portalMetadata.canonicalDocumentKey,
        crossModuleDocumentKey: portalMetadata.crossModuleDocumentKey,
        crossModuleDocumentMapVersion: portalMetadata.crossModuleDocumentMapVersion,
        crossModuleDocumentKnown: portalMetadata.crossModuleDocumentKnown,
        documentOwnerRole: portalMetadata.documentOwnerRole,
        documentResponsibleRoles: portalMetadata.documentResponsibleRoles,
        documentPackKey: portalMetadata.documentPackKey,
        documentCategory: portalMetadata.documentCategory,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
      }
    })
    .map((row) => withRequirementTraceMetadata(row, context))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function fetchTransactionRequiredDocumentsByTransactionIds(client, transactionIds = []) {
  if (!transactionIds.length) {
    return {}
  }

  const canonicalEligibleIds = transactionIds.filter((transactionId) => {
    const rolloutMode = getCanonicalDocumentRolloutMode({ transactionId })
    return rolloutMode === 'canonical_primary' || rolloutMode === 'canonical_only'
  })
  if (canonicalEligibleIds.length) {
    try {
      const canonicalRows = await fetchCanonicalTransactionDocumentRequirementsByTransactionIds({
        transactionIds: canonicalEligibleIds,
        client,
      })
      if (canonicalEligibleIds.length === transactionIds.length && Object.keys(canonicalRows).length) {
        return canonicalRows
      }
      if (Object.keys(canonicalRows).length) {
        const legacyRows = await fetchTransactionRequiredDocumentsByTransactionIdsLegacy(client, transactionIds)
        return {
          ...legacyRows,
          ...canonicalRows,
        }
      }
    } catch (canonicalError) {
      console.warn(
        '[canonical-documents] canonical transaction document read failed; falling back to legacy projection.',
        canonicalError,
      )
    }
  }

  return fetchTransactionRequiredDocumentsByTransactionIdsLegacy(client, transactionIds)
}

export async function fetchTransactionRequiredDocumentsByTransactionIdsLegacy(client, transactionIds = []) {
  if (isOptionalRelationKnownMissing('transaction_required_documents')) return {}
  // Each requirement evaluates transaction access. Keep portfolio-sized reads
  // below the API statement timeout without dropping checklist rows.
  if (transactionIds.length > 5) {
    const grouped = {}
    for (let offset = 0; offset < transactionIds.length; offset += 5) {
      Object.assign(grouped, await fetchTransactionRequiredDocumentsByTransactionIdsLegacy(
        client,
        transactionIds.slice(offset, offset + 5),
      ))
    }
    return grouped
  }
  let query = await client
    .from('transaction_required_documents')
    .select(
      'id, transaction_id, document_key, document_label, is_required, is_uploaded, status, enabled, group_key, group_label, description, required_from_role, visibility_scope, allow_multiple, uploaded_document_id, uploaded_at, verified_at, rejected_at, notes, sort_order, canonical_requirement_instance_id, created_at, updated_at',
    )
    .in('transaction_id', transactionIds)
    .order('sort_order', { ascending: true })

  if (
    query.error &&
    (isMissingColumnError(query.error, 'status') ||
      isMissingColumnError(query.error, 'group_key') ||
      isMissingColumnError(query.error, 'group_label') ||
      isMissingColumnError(query.error, 'required_from_role') ||
      isMissingColumnError(query.error, 'visibility_scope') ||
      isMissingColumnError(query.error, 'allow_multiple') ||
      isMissingColumnError(query.error, 'canonical_requirement_instance_id') ||
      isMissingColumnError(query.error, 'enabled'))
  ) {
    query = await client
      .from('transaction_required_documents')
      .select(
        'id, transaction_id, document_key, document_label, is_required, is_uploaded, uploaded_document_id, sort_order, created_at, updated_at',
      )
      .in('transaction_id', transactionIds)
      .order('sort_order', { ascending: true })
  }

  if (query.error) {
    if (
      rememberMissingOptionalRelation('transaction_required_documents', query.error) ||
      isMissingColumnError(query.error, 'document_key') ||
      isMissingColumnError(query.error, 'document_label')
    ) {
      return {}
    }

    throw query.error
  }

  const grouped = {}
  for (const row of query.data || []) {
    if (!grouped[row.transaction_id]) {
      grouped[row.transaction_id] = []
    }
    grouped[row.transaction_id].push(row)
  }

  return Object.entries(grouped).reduce((accumulator, [transactionId, rows]) => {
    accumulator[transactionId] = normalizeRequiredDocumentRows(rows)
    return accumulator
  }, {})
}

export function buildRequiredChecklistFromRows(requiredRows, documents) {
  const activeRows = (requiredRows || []).filter((row) => {
    const isRequired = isDocumentRequirementRequired(row)
    const isEnabled = row?.isEnabled !== false && row?.enabled !== false
    const status = normalizeRequiredStatus(
      row?.status,
      statusFromLegacyFlags({
        isRequired,
        isUploaded: Boolean(row?.isUploaded || row?.is_uploaded),
      }),
    )
    return isRequired && isEnabled && status !== 'not_required'
  })

  if (!activeRows.length) {
    return {
      checklist: [],
      summary: { uploadedCount: 0, totalRequired: 0 },
    }
  }

  const requirements = activeRows.map((row) => ({
    key: row.key,
    label: row.label,
    sortOrder: row.sortOrder,
    keywords: [String(row.label || '').toLowerCase(), String(row.key || '').replaceAll('_', ' ')],
  }))

  const checklistResult = buildDocumentChecklist(requirements, documents)
  const checklistByKey = new Map(checklistResult.checklist.map((item) => [item.key, item]))

  const checklist = activeRows.map((row) => {
    const mapped = checklistByKey.get(row.key)
    const linkedId = row.uploadedDocumentId || row.uploaded_document_id || ''
    const canonicalId = row.canonicalRequirementInstanceId || row.canonical_requirement_instance_id || ''
    const transactionId = row.transactionId || row.transaction_id || ''
    const inScope = document => {
      const documentTransactionId = document?.transaction_id || document?.transactionId
      return document && (!transactionId || !documentTransactionId || transactionId === documentTransactionId) &&
        document.is_current_evidence !== false && matchDocumentRequirementLink(document, row) !== false
    }
    const linkedCandidates = (documents || []).filter(document => inScope(document) && matchDocumentRequirementLink(document, row) === true)
    const matchedDocument = linkedId
      ? (documents || []).find(document => document.id === linkedId && inScope(document)) || null
      : linkedCandidates.find(document => document.is_current_evidence === true) ||
        (linkedCandidates.length === 1 ? linkedCandidates[0] : null) ||
        (!canonicalId && inScope(mapped?.matchedDocument) ? mapped.matchedDocument : null)
    const explicitEvidence = Boolean(linkedId || canonicalId)
    const uploaded = explicitEvidence ? Boolean(matchedDocument) : Boolean(row.isUploaded || matchedDocument)
    const resolvedStatus = normalizeRequiredStatus(
      resolveRequirementReviewStatus(row, matchedDocument),
      statusFromLegacyFlags({
        isRequired: row.isRequired,
        isUploaded: uploaded,
      }),
    )
    const receivedStatus = ['uploaded', 'under_review', 'accepted', 'approved', 'completed'].includes(resolvedStatus)
    const evidenceUnavailable = explicitEvidence && receivedStatus && !matchedDocument
    const complete = receivedStatus && !evidenceUnavailable

    return {
      key: row.key,
      label: row.label,
      group: row.group || row.groupLabel || 'General',
      groupKey: row.groupKey || 'buyer_fica',
      groupLabel: row.groupLabel || row.group || 'Buyer & FICA',
      description: row.description || '',
      requirementLevel: row.requirementLevel || 'required',
      expectedFromRole: row.expectedFromRole || 'client',
      visibilityScope: row.visibilityScope || 'client',
      rejectionReason: row.rejectionReason || row.rejection_reason || row.notes || '',
      rejection_reason: row.rejectionReason || row.rejection_reason || row.notes || '',
      status: resolvedStatus,
      isRequired: row.isRequired !== false,
      isEnabled: row.isEnabled !== false,
      complete,
      matchedDocument,
      evidenceUnavailable,
      portalDocumentType: row.portalDocumentType || row.key || 'other',
      portalWorkspaceCategory: row.portalWorkspaceCategory || 'additional',
      portalMappingSource: row.portalMappingSource || 'fallback',
      portalMappingConfidence: row.portalMappingConfidence || 'fallback',
      portalMappingAmbiguous: Boolean(row.portalMappingAmbiguous),
      canonicalDocumentKey: row.canonicalDocumentKey || row.crossModuleDocumentKey || row.key || null,
      crossModuleDocumentKey: row.crossModuleDocumentKey || row.canonicalDocumentKey || row.key || null,
      crossModuleDocumentMapVersion: row.crossModuleDocumentMapVersion || '',
      crossModuleDocumentKnown: row.crossModuleDocumentKnown === true,
      documentOwnerRole: row.documentOwnerRole || '',
      documentResponsibleRoles: Array.isArray(row.documentResponsibleRoles) ? row.documentResponsibleRoles : [],
      documentPackKey: row.documentPackKey || '',
      documentCategory: row.documentCategory || '',
      canonicalRequirementInstanceId:
        row.canonicalRequirementInstanceId || row.canonical_requirement_instance_id || null,
      canonical_requirement_instance_id:
        row.canonicalRequirementInstanceId || row.canonical_requirement_instance_id || null,
      owningWorkflow: row.owningWorkflow || 'Transaction Documents',
      visibleSection: row.visibleSection || 'transfer_documents',
      blockingStage: row.blockingStage || null,
      preCollectionAllowed: row.preCollectionAllowed === true,
      isBlocking: row.isBlocking !== false,
      sourceEngine: row.sourceEngine || 'legacy_transaction_required_documents',
      sourceRuleOrLegacyPath: row.sourceRuleOrLegacyPath || '',
      triggeringCondition: row.triggeringCondition || '',
      currentMainStageAtGeneration: row.currentMainStageAtGeneration || null,
      lastRecalculatedAt:
        row.lastRecalculatedAt || row.updatedAt || row.updated_at || row.createdAt || row.created_at || null,
      requestedFromLabel: row.requestedFromLabel || normalizeChecklistTraceRole(row.expectedFromRole || 'client'),
      debugTrace: row.debugTrace || null,
      createdAt: row.createdAt || row.created_at || null,
      updatedAt: row.updatedAt || row.updated_at || null,
    }
  })

  const uploadedCount = checklist.filter((item) => item.complete).length
  return {
    checklist,
    summary: {
      uploadedCount,
      totalRequired: checklist.length,
    },
  }
}

export function normalizeDocumentRequestRow(row) {
  const visibility = normalizeAdditionalDocumentRequestVisibility(
    row?.visibility_scope || row?.visibility || 'shared_role_players',
  )
  const requestedFrom = normalizeAdditionalDocumentRequestRequestedFrom(
    row?.requested_from || row?.requestedFrom || mapRequestedFromToAssignedRole(row?.assigned_to_role || 'buyer'),
    'buyer',
  )
  const requestType = String(row?.request_type || row?.requestType || 'additional_document_request')
    .trim()
    .toLowerCase()
  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    category: row?.category || 'General',
    documentType: row?.document_type || null,
    title: row?.title || row?.document_type || 'Document Request',
    description: row?.description || null,
    priority: normalizeDocumentRequestPriorityValue(row?.priority),
    additionalPriority: normalizeAdditionalDocumentRequestPriority(row?.priority),
    dueDate: row?.due_date || null,
    assignedToRole:
      normalizeRoleType(row?.assigned_to_role || null) || normalizeRequestRoleScope(row?.assigned_to_role || null),
    assignedToUserId: row?.assigned_to_user_id || null,
    requestGroupId: row?.request_group_id || null,
    canonicalRequirementInstanceId: row?.canonical_requirement_instance_id || null,
    status: normalizeDocumentRequestStatusValue(row?.status),
    requiresReview: row?.requires_review !== false,
    requestedDocumentId: row?.requested_document_id || null,
    createdBy: row?.created_by || null,
    createdByRole:
      normalizeRoleType(row?.created_by_role || null) ||
      normalizeRequestRoleScope(row?.created_by_role || null, 'attorney'),
    completedAt: row?.completed_at || null,
    rejectedReason: row?.rejected_reason || null,
    resendCount: Number(row?.resend_count || 0) || 0,
    lastResentAt: row?.last_resent_at || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    requestType,
    requestedFrom,
    visibility,
    clientVisible: visibility === 'client_visible',
    notes: row?.notes || row?.description || null,
    audience: visibility,
  }
}

export async function loadTransactionDocumentRequestsByIds(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return {}
  if (isOptionalRelationKnownMissing('document_requests')) return {}

  let query = await client
    .from('document_requests')
    .select(
      'id, transaction_id, category, document_type, title, description, notes, priority, due_date, assigned_to_role, assigned_to_user_id, request_group_id, canonical_requirement_instance_id, status, requires_review, requested_document_id, created_by, created_by_role, completed_at, rejected_reason, resend_count, last_resent_at, requested_from, visibility_scope, request_type, created_at, updated_at',
    )
    .in('transaction_id', ids)
    .order('created_at', { ascending: false })

  if (
    query.error &&
    (isMissingColumnError(query.error, 'request_group_id') ||
      isMissingColumnError(query.error, 'assigned_to_user_id') ||
      isMissingColumnError(query.error, 'requested_document_id') ||
      isMissingColumnError(query.error, 'requires_review') ||
      isMissingColumnError(query.error, 'rejected_reason') ||
      isMissingColumnError(query.error, 'resend_count') ||
      isMissingColumnError(query.error, 'last_resent_at') ||
      isMissingColumnError(query.error, 'requested_from') ||
      isMissingColumnError(query.error, 'visibility_scope') ||
      isMissingColumnError(query.error, 'request_type') ||
      isMissingColumnError(query.error, 'notes'))
  ) {
    query = await client
      .from('document_requests')
      .select(
        'id, transaction_id, category, document_type, title, description, priority, due_date, assigned_to_role, status, created_by, created_by_role, completed_at, created_at',
      )
      .in('transaction_id', ids)
      .order('created_at', { ascending: false })
  }

  if (query.error) {
    if (rememberMissingOptionalRelation('document_requests', query.error) || isMissingSchemaError(query.error)) {
      return {}
    }
    throw query.error
  }

  const map = {}
  for (const row of query.data || []) {
    const normalized = normalizeDocumentRequestRow(row)
    if (!map[normalized.transactionId]) {
      map[normalized.transactionId] = []
    }
    map[normalized.transactionId].push(normalized)
  }
  return map
}
