// documents owns these operations and their existing recovery behavior.
import { summarizeDocumentRequests, summarizeChecklistItems, loadTransactionChecklistItemsByIds, loadTransactionIssueOverridesByIds } from '../transactions/readinessReadApi.js'
import { loadSharedDocuments, isStorageBucketNotFoundError } from './listReadApi.js'
import { normalizeNullableText, requireClient } from '../../lib/api/shared/readHelpers.js'
import { loadTransactionDocumentRequestsByIds, fetchTransactionRequiredDocumentsByTransactionIds } from './requirementReadModel.js'
import { createFreshDocumentSignedUrl } from '../../lib/documentAccess.js'
import { DOCUMENTS_BUCKET_CANDIDATES } from '../../lib/supabaseClient'
import { getBuyerFicaReadiness as getBuyerFicaReadinessFromProfile, getBuyerFinanceReadiness as getBuyerFinanceReadinessFromProfile, getBuyerRequirementProfile, getMissingBuyerRequirements as getMissingBuyerRequirementsFromProfile, getTransferReadinessFromBuyerDocs as getTransferReadinessFromBuyerDocsFromProfile, getRequiredTransactionActions } from '../../lib/buyerRequirementEngine'
import { getAttorneyMockTransactionDetail } from '../../core/transactions/attorneyMockData'
import { resolveAttorneyOperationalStageKey } from '../../core/transactions/attorneyOperationalEngine'
import { fetchOnboardingFormDataForTransaction } from '../transactions/participantInfrastructure.js'
import { buildLiveTransactionChecklistData } from '../transactions/workspaceHydration.js'
import { resolveTransactionWorkspaceReadContext } from '../transactions/workspaceTabsApi.js'

export async function createTransactionDocumentSignedUrl({
  filePath,
  fileBucket = '',
  download = false,
  filename = 'document',
  expiresInSeconds = 60 * 30,
} = {}) {
  return createFreshDocumentSignedUrl({
    client: requireClient(), filePath, fileBucket, download, filename, expiresInSeconds,
    candidateBuckets: DOCUMENTS_BUCKET_CANDIDATES,
    isBucketMissing: isStorageBucketNotFoundError,
  })
}

export async function fetchTransactionCanonicalDocumentProjection(transactionId, options = {}) {
  const normalizedId = normalizeNullableText(transactionId)
  if (!normalizedId) throw new Error('Transaction ID is required.')
  const client = requireClient()
  const { data, error } = await client.rpc('bridge_transaction_document_projection', {
    p_transaction_id: normalizedId,
    p_seller_token: options.sellerToken || null,
    p_seller_session: options.sellerSession || null,
  })
  if (error) throw error
  if (!data || String(data.transactionId || '') !== normalizedId || !Array.isArray(data.requirements)) {
    throw new Error('The shared document register returned an invalid transaction projection.')
  }
  const expectedRole = options.sellerToken ? 'seller' : ''
  if (expectedRole && data.role !== expectedRole) {
    throw new Error('The shared document register returned the wrong portal role.')
  }
  return data
}

export async function fetchTransactionDocumentsWorkspace(transactionId, options = {}) {
  if (!transactionId) return null

  const mockDetail = getAttorneyMockTransactionDetail(transactionId)
  if (mockDetail) {
    return {
      transaction: mockDetail.transaction || null,
      documents: mockDetail.documents || [],
      onboardingFormData: mockDetail.onboardingFormData || null,
      transactionRequiredDocuments: mockDetail.transactionRequiredDocuments || [],
      requiredDocumentChecklist: mockDetail.requiredDocumentChecklist || [],
      documentSummary: mockDetail.documentSummary || null,
      documentChecklistInsights: mockDetail.documentChecklistInsights || null,
      buyerRequirementProfile: mockDetail.buyerRequirementProfile || null,
      buyerRequirementSummary: mockDetail.buyerRequirementSummary || null,
      missingBuyerRequirements: mockDetail.missingBuyerRequirements || null,
      requiredTransactionActions: mockDetail.requiredTransactionActions || [],
      buyerReadiness: mockDetail.buyerReadiness || null,
      documentRequests: mockDetail.documentRequests || [],
      documentRequestSummary: mockDetail.documentRequestSummary || null,
      transactionChecklistItems: mockDetail.transactionChecklistItems || [],
      checklistSummary: mockDetail.checklistSummary || null,
      issueOverrides: mockDetail.issueOverrides || [],
    }
  }

  const context = options.hydrationContext || await resolveTransactionWorkspaceReadContext(transactionId)
  if (!context) return null
  const { client, transaction, canonicalTransactionId } = context

  const [
    documents,
    canonicalDocumentProjection,
    onboardingFormData,
    documentRequestsByTransactionId,
    checklistItemsByTransactionId,
    issueOverridesByTransactionId,
    transactionRequirementsByTransactionId,
  ] = await Promise.all([
    loadSharedDocuments(client, { transactionIds: [canonicalTransactionId], viewer: 'internal' }),
    fetchTransactionCanonicalDocumentProjection(canonicalTransactionId),
    fetchOnboardingFormDataForTransaction(client, canonicalTransactionId, transaction?.purchaser_type || 'individual'),
    loadTransactionDocumentRequestsByIds(client, [canonicalTransactionId]),
    loadTransactionChecklistItemsByIds(client, [canonicalTransactionId]),
    loadTransactionIssueOverridesByIds(client, [canonicalTransactionId]),
    fetchTransactionRequiredDocumentsByTransactionIds(client, [canonicalTransactionId]),
  ])

  const transactionRequiredDocuments = transactionRequirementsByTransactionId[canonicalTransactionId] || []
  const liveChecklist = await buildLiveTransactionChecklistData(client, {
    transaction,
    onboardingFormData: onboardingFormData || null,
    documents,
    persistedRequirements: transactionRequiredDocuments,
  })
  const buyerRequirementProfile = getBuyerRequirementProfile({
    transaction,
    onboardingFormData,
    requiredDocumentChecklist: liveChecklist.requiredDocumentChecklist,
  })
  const buyerRequirementMissing = getMissingBuyerRequirementsFromProfile(
    buyerRequirementProfile,
    liveChecklist.requiredDocumentChecklist,
  )
  const buyerRequirementActions = getRequiredTransactionActions(
    buyerRequirementProfile,
    liveChecklist.requiredDocumentChecklist,
  )

  return {
    transaction,
    documents,
    canonicalDocumentProjection,
    onboardingFormData: onboardingFormData || null,
    transactionRequiredDocuments: liveChecklist.requiredDocuments,
    requiredDocumentChecklist: liveChecklist.requiredDocumentChecklist,
    documentSummary: liveChecklist.documentSummary,
    documentChecklistInsights: liveChecklist.documentChecklistInsights,
    buyerRequirementProfile,
    buyerRequirementSummary: {
      buyerType: buyerRequirementProfile.buyerType,
      buyerTypeLabel: buyerRequirementProfile.buyerTypeLabel,
      financeType: buyerRequirementProfile.financeType,
      financeTypeLabel: buyerRequirementProfile.financeTypeLabel,
      missingRequiredCount: buyerRequirementMissing.totalMissingCritical,
      missingCount: buyerRequirementMissing.totalMissing,
      totalRequiredCount: buyerRequirementMissing.totalRequired,
      hasOutstanding: buyerRequirementMissing.hasOutstanding,
    },
    missingBuyerRequirements: buyerRequirementMissing,
    requiredTransactionActions: buyerRequirementActions,
    buyerReadiness: {
      fica: getBuyerFicaReadinessFromProfile(buyerRequirementProfile, liveChecklist.requiredDocumentChecklist),
      finance: getBuyerFinanceReadinessFromProfile(buyerRequirementProfile, liveChecklist.requiredDocumentChecklist),
      transfer: getTransferReadinessFromBuyerDocsFromProfile(
        {
          ...buyerRequirementProfile,
          onboardingStatus: onboardingFormData?.status || null,
          onboarding: onboardingFormData || null,
        },
        liveChecklist.requiredDocumentChecklist,
      ),
    },
    documentRequests: documentRequestsByTransactionId[canonicalTransactionId] || [],
    documentRequestSummary: summarizeDocumentRequests(documentRequestsByTransactionId[canonicalTransactionId] || []),
    transactionChecklistItems: checklistItemsByTransactionId[canonicalTransactionId] || [],
    checklistSummary: summarizeChecklistItems(checklistItemsByTransactionId[canonicalTransactionId] || [], {
      stageKey: resolveAttorneyOperationalStageKey({ transaction }),
    }),
    issueOverrides: issueOverridesByTransactionId[canonicalTransactionId] || [],
  }
}
