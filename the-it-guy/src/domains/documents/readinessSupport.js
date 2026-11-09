// documents owns these operations and their existing recovery behavior.
import { getOrCreateTransactionOnboardingRecord } from '../onboarding/workflow.js'
import { ensureTransactionRequiredDocuments } from './requirementActions.js'
import { loadSharedDocuments } from './listReadApi.js'
import { normalizeStage, normalizeMainStage } from '../../core/transactions/legacyReadModel.js'
import { buildRequiredChecklistFromRows } from './requirementReadModel.js'
import { isMissingColumnError, isMissingSchemaError } from '../../lib/api/shared/readHelpers.js'
import { normalizePurchaserType } from '../../lib/purchaserPersonas'
import { isBondFinanceType, normalizeFinanceType } from '../../core/transactions/financeType'
import { resolveSalesWorkflowSnapshot } from '../../core/transactions/salesWorkflow'
import { BOND_NOTIFICATION_EVENTS } from '../../services/bondIntakeNotificationService'
import { fetchOnboardingFormDataForTransaction } from '../transactions/participantInfrastructure.js'
import { notifyRolesForTransaction } from '../bond/financeRead.js'

export async function computeTransactionReadinessSnapshot(client, transactionId) {
  if (!transactionId) {
    return null
  }

  let transactionQuery = await client
    .from('transactions')
    .select(
      'id, finance_type, purchaser_type, cash_amount, bond_amount, reservation_required, stage, current_main_stage, onboarding_status, onboarding_completed_at',
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'purchaser_type') ||
      isMissingColumnError(transactionQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionQuery.error, 'bond_amount') ||
      isMissingColumnError(transactionQuery.error, 'reservation_required') ||
      isMissingColumnError(transactionQuery.error, 'current_main_stage'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, finance_type, stage')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    if (isMissingSchemaError(transactionQuery.error)) {
      return null
    }
    throw transactionQuery.error
  }

  const transaction = transactionQuery.data
  if (!transaction) {
    return null
  }

  const purchaserType = normalizePurchaserType(transaction.purchaser_type)
  const onboardingFormData = await fetchOnboardingFormDataForTransaction(client, transactionId, purchaserType)
  const requiredDocuments = await ensureTransactionRequiredDocuments(client, {
    transactionId,
    purchaserType,
    financeType: normalizeFinanceType(transaction.finance_type || 'cash'),
    reservationRequired: Boolean(transaction.reservation_required),
    cashAmount: transaction.cash_amount,
    bondAmount: transaction.bond_amount,
  })
  const uploadedDocuments = await loadSharedDocuments(client, {
    transactionIds: [transactionId],
    viewer: 'internal',
  })

  const checklistResult = buildRequiredChecklistFromRows(requiredDocuments, uploadedDocuments)
  const uploadedRequiredDocs = Number(checklistResult.summary?.uploadedCount || 0)
  const totalRequiredDocs = Number(checklistResult.summary?.totalRequired || 0)
  const missingRequiredDocs = Math.max(totalRequiredDocs - uploadedRequiredDocs, 0)
  const docsComplete = totalRequiredDocs === 0 ? true : missingRequiredDocs === 0

  const onboarding = await getOrCreateTransactionOnboardingRecord(client, {
    transactionId,
    purchaserType,
  }, { createIfMissing: false })
  const onboardingStatus = onboarding?.status || 'Not Started'
  const salesSnapshot = resolveSalesWorkflowSnapshot({
    onboardingStatus: transaction.onboarding_status || onboardingStatus,
    onboardingCompletedAt: transaction.onboarding_completed_at || null,
    externalOnboardingSubmittedAt: transaction.external_onboarding_submitted_at || null,
    onboardingFormData: onboardingFormData?.formData || {},
    documents: uploadedDocuments,
    requiredDocuments,
    permissions: null,
  })
  const onboardingComplete = Boolean(salesSnapshot.onboardingComplete)
  const signedOtpReceived = Boolean(salesSnapshot.signedOtpReceived)

  const financeType = normalizeFinanceType(transaction.finance_type, {
    allowUnknown: true,
  })
  const stage = normalizeStage(transaction.stage, 'Available')
  const mainStage = normalizeMainStage(transaction.current_main_stage, stage)
  const financeLaneReady = isBondFinanceType(financeType)
    ? Boolean(salesSnapshot.readyForFinance)
    : Boolean(salesSnapshot.readyForFinance)
  const attorneyLaneReady =
    signedOtpReceived &&
    docsComplete &&
    (financeType === 'cash' ||
      ['ATTY', 'XFER', 'REG'].includes(mainStage) ||
      stage === 'Bond Approved / Proof of Funds')
  const stageReady = Boolean(salesSnapshot.readyForFinance)

  return {
    transactionId,
    financeType,
    stage,
    mainStage,
    onboardingStatus,
    onboardingComplete,
    signedOtpReceived,
    docsComplete,
    uploadedRequiredDocs,
    totalRequiredDocs,
    missingRequiredDocs,
    financeLaneReady,
    attorneyLaneReady,
    stageReady,
  }
}

export async function notifyAttorneysForBondDocumentsComplete(
  client,
  { transactionId, result = null, actor = {}, metadata = {} } = {},
) {
  if (!transactionId || result?.eventType !== BOND_NOTIFICATION_EVENTS.BOND_DOCUMENTS_COMPLETE || result?.skipped) {
    return []
  }

  return notifyRolesForTransaction(client, {
    transactionId,
    roleTypes: ['attorney'],
    title: 'Buyer documents complete',
    message: 'All required buyer onboarding documents are uploaded and ready for legal review.',
    notificationType: 'document_uploaded',
    eventType: 'TransactionUpdated',
    eventData: {
      source: 'bond_documents_complete',
      ...metadata,
    },
    dedupePrefix: 'buyer-documents-complete-attorney',
    excludeUserId: actor?.id || actor?.userId || null,
  })
}
