// bond owns these operations and their existing recovery behavior.
import { uploadToDocumentsBucket, removeUploadedDocumentObject } from '../../lib/api/shared/storage.js'
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { getSignedUrl } from '../documents/listReadApi.js'
import { isOptionalRelationKnownMissing, rememberMissingOptionalRelation } from '../../lib/api/shared/schemaReadCompatibility.js'
import { normalizeNullableText, normalizeOptionalDate, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { fetchDevelopmentBondConfig, normalizeDevelopmentBondConfigRow, normalizeDevelopmentBondDocumentRow, BOND_CLOSEOUT_DOCUMENT_DEFINITIONS, buildDefaultDevelopmentBondDocuments } from '../developments/configurationApi.js'
import { runRecoverableDocumentUpload, readSavedUploadByPath } from '../../lib/documentUploadRecovery.js'
import { DOCUMENTS_BUCKET_CANDIDATES } from '../../lib/supabaseClient'
import { validateDocumentUploadFile } from '../../lib/documentUploadPolicy'
import { createDocumentUploadProgressReporter } from '../../lib/documentUploadLifecycle'
import { getMainStageFromDetailedStage, normalizeStageLabel } from '../../core/transactions/stageConfig'
import { normalizeRequiredStatus } from '../../core/documents/documentVaultArchitecture'
import { isBondFinanceType, normalizeFinanceType } from '../../core/transactions/financeType'
import { normalizeRoleType } from '../../core/transactions/permissions'

const BOND_CLOSEOUT_STATUS_VALUES = ['not_started', 'in_progress', 'ready_to_close', 'closed']

const BOND_RECONCILIATION_STATUS_VALUES = [
  'not_budgeted',
  'budgeted',
  'awaiting_statement',
  'awaiting_confirmation',
  'awaiting_review',
  'reconciled',
]

function normalizeBondCloseoutStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return BOND_CLOSEOUT_STATUS_VALUES.includes(normalized) ? normalized : 'not_started'
}

function normalizeBondReconciliationStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return BOND_RECONCILIATION_STATUS_VALUES.includes(normalized) ? normalized : 'not_budgeted'
}

function isBondCommissionEligible(transaction) {
  if (!transaction) {
    return false
  }

  const financeType = normalizeFinanceType(transaction.finance_type || 'cash', {
    allowUnknown: true,
  })
  if (!isBondFinanceType(financeType)) {
    return false
  }

  const mainStage = String(
    transaction.current_main_stage || getMainStageFromDetailedStage(transaction.stage || ''),
  ).toUpperCase()
  const detailedStage = normalizeStageLabel(transaction.stage || '')

  return detailedStage === 'Bond Approved / Proof of Funds' || ['ATTY', 'XFER', 'REG', 'TRANSFER_DUTY', 'LODGEMENT', 'REGISTRATION', 'POST_REGISTRATION'].includes(mainStage)
    || Boolean(transaction.registered_at)
    || ['Bond Approved', 'Grant Received', 'Grant Signed', 'Grant Submitted', 'Instruction Issued', 'Complete'].includes(transaction.finance_status)
}

function getOnboardingFinanceFieldValue(formData, keys = []) {
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) {
    return null
  }

  for (const key of keys) {
    const value = formData[key]
    if (value !== null && value !== undefined && value !== '') {
      return value
    }
  }

  return null
}

function deriveBondFinanceSnapshot(transaction = {}, onboardingFormData = null) {
  const financeType = normalizeFinanceType(
    transaction?.finance_type ||
      getOnboardingFinanceFieldValue(onboardingFormData, ['purchase_finance_type', 'finance_type']) ||
      'cash',
    { allowUnknown: true },
  )

  const purchasePrice = normalizeOptionalNumber(
    transaction?.purchase_price ??
      transaction?.sales_price ??
      transaction?.purchasePrice ??
      transaction?.salesPrice ??
      getOnboardingFinanceFieldValue(onboardingFormData, ['purchase_price', 'sale_price', 'sales_price']),
  )

  const cashAmount = normalizeOptionalNumber(
    transaction?.cash_amount ??
      transaction?.cashAmount ??
      getOnboardingFinanceFieldValue(onboardingFormData, ['cash_amount']),
  )

  const bondAmount = normalizeOptionalNumber(
    transaction?.bond_amount ??
      transaction?.bondAmount ??
      getOnboardingFinanceFieldValue(onboardingFormData, ['bond_amount']),
  )

  return {
    financeType,
    purchasePrice,
    cashAmount,
    bondAmount,
  }
}

function deriveBondCommissionBase(transaction = {}, unit = {}, financeSnapshot = null) {
  const resolvedFinanceSnapshot =
    financeSnapshot && typeof financeSnapshot === 'object' ? financeSnapshot : deriveBondFinanceSnapshot(transaction)

  const financeType = normalizeFinanceType(transaction?.finance_type || resolvedFinanceSnapshot.financeType || 'cash', {
    allowUnknown: true,
  })
  const purchasePrice = normalizeOptionalNumber(
    resolvedFinanceSnapshot.purchasePrice ??
      transaction?.purchase_price ??
      transaction?.sales_price ??
      transaction?.purchasePrice ??
      transaction?.salesPrice ??
      unit?.list_price ??
      unit?.listPrice ??
      unit?.price,
  )
  const cashAmount = normalizeOptionalNumber(
    resolvedFinanceSnapshot.cashAmount ?? transaction?.cash_amount ?? transaction?.cashAmount,
  )
  const bondAmount = normalizeOptionalNumber(
    resolvedFinanceSnapshot.bondAmount ?? transaction?.bond_amount ?? transaction?.bondAmount,
  )

  if (!isBondFinanceType(financeType)) {
    return {
      financeType,
      amount: null,
      source: 'not_bond',
      purchasePrice,
      cashAmount,
      bondAmount,
    }
  }

  if (bondAmount !== null && bondAmount > 0) {
    return {
      financeType,
      amount: bondAmount,
      source: 'bond_amount',
      purchasePrice,
      cashAmount,
      bondAmount,
    }
  }

  if (financeType === 'combination' && purchasePrice !== null && cashAmount !== null) {
    const derivedBondPortion = Number((purchasePrice - cashAmount).toFixed(2))
    if (derivedBondPortion > 0) {
      return {
        financeType,
        amount: derivedBondPortion,
        source: 'purchase_minus_cash',
        purchasePrice,
        cashAmount,
        bondAmount,
      }
    }
  }

  if (purchasePrice !== null && purchasePrice > 0) {
    return {
      financeType,
      amount: purchasePrice,
      source: financeType === 'combination' ? 'purchase_price_fallback' : 'purchase_price',
      purchasePrice,
      cashAmount,
      bondAmount,
    }
  }

  return {
    financeType,
    amount: null,
    source: 'missing',
    purchasePrice,
    cashAmount,
    bondAmount,
  }
}

function deriveBondCloseoutVariance(budgetedAmount, actualPaidAmount) {
  const budgeted = normalizeOptionalNumber(budgetedAmount)
  const actual = normalizeOptionalNumber(actualPaidAmount)
  const varianceAmount = budgeted !== null && actual !== null ? actual - budgeted : null
  const variancePercent =
    varianceAmount !== null && budgeted && budgeted !== 0
      ? Number(((varianceAmount / budgeted) * 100).toFixed(2))
      : null

  return {
    budgetedAmount: budgeted,
    actualPaidAmount: actual,
    varianceAmount,
    variancePercent,
  }
}

function deriveBondCommissionBudget(config, transaction = {}, unit = {}, financeSnapshot = null) {
  const defaultAmount = normalizeOptionalNumber(config?.defaultCommissionAmount)
  const commissionModelType = normalizeTextValue(config?.commissionModelType) || 'fixed_fee'
  const commissionBase = deriveBondCommissionBase(transaction, unit, financeSnapshot)

  if (defaultAmount === null || commissionBase.amount === null) {
    return null
  }

  if (commissionModelType === 'percentage') {
    return Number(((commissionBase.amount * defaultAmount) / 100).toFixed(2))
  }

  return defaultAmount
}

function normalizeBondCloseoutDocumentRow(row = {}) {
  const fallback =
    BOND_CLOSEOUT_DOCUMENT_DEFINITIONS.find((item) => item.key === row.document_type_key || item.key === row.key) || {}

  return {
    id: row.id || null,
    key: row.document_type_key || row.key || fallback.key || '',
    label: row.label || fallback.label || 'Document',
    isRequired: row.is_required ?? row.required_for_close_out ?? fallback.requiredForCloseOut ?? true,
    status: normalizeRequiredStatus(row.status || 'missing'),
    filePath: row.file_path || null,
    filename: row.filename || null,
    uploadedBy: row.uploaded_by || null,
    uploadedAt: row.uploaded_at || null,
    url: row.url || null,
  }
}

function deriveBondCloseoutStatuses({ transaction, closeout, documents = [] }) {
  const eligible = isBondCommissionEligible(transaction)
  const requiredDocs = documents.filter((item) => item.isRequired)
  const uploadedRequiredCount = requiredDocs.filter(
    (item) => item.status === 'uploaded' || item.status === 'accepted',
  ).length
  const allRequiredDocsUploaded = requiredDocs.every((item) => item.status === 'uploaded' || item.status === 'accepted')
  const hasActual = normalizeOptionalNumber(closeout?.actual_paid_amount ?? closeout?.actualPaidAmount) !== null
  const hasBudget = normalizeOptionalNumber(closeout?.budgeted_amount ?? closeout?.budgetedAmount) !== null
  const hasStatement = documents.some(
    (item) => item.key === 'commission_statement' && (item.status === 'uploaded' || item.status === 'accepted'),
  )
  const hasConfirmation = documents.some(
    (item) => item.key === 'bond_approval_confirmation' && (item.status === 'uploaded' || item.status === 'accepted'),
  )
  const readyToClose = Boolean(eligible && hasActual && allRequiredDocsUploaded)

  let reconciliationStatus = 'not_budgeted'
  if (hasBudget) reconciliationStatus = 'budgeted'
  if (hasBudget && !hasStatement) {
    reconciliationStatus = 'awaiting_statement'
  } else if (hasStatement && !hasConfirmation) {
    reconciliationStatus = 'awaiting_confirmation'
  } else if (readyToClose) {
    reconciliationStatus =
      normalizeBondCloseoutStatus(closeout?.close_out_status) === 'closed' ? 'reconciled' : 'awaiting_review'
  }

  let closeOutStatus = normalizeBondCloseoutStatus(closeout?.close_out_status)
  if (closeOutStatus === 'not_started' && (uploadedRequiredCount > 0 || hasActual || hasBudget)) {
    closeOutStatus = readyToClose ? 'ready_to_close' : 'in_progress'
  }
  if (closeOutStatus === 'in_progress' && readyToClose) {
    closeOutStatus = 'ready_to_close'
  }

  return {
    eligible,
    readyToClose,
    hasActual,
    hasBudget,
    hasStatement,
    hasConfirmation,
    allRequiredDocsUploaded,
    uploadedRequiredCount,
    requiredCount: requiredDocs.length,
    closeOutStatus,
    reconciliationStatus,
  }
}

async function syncTransactionBondCloseoutDocuments(client, closeoutId, configDocuments = []) {
  const definitions = (configDocuments.length ? configDocuments : buildDefaultDevelopmentBondDocuments()).map((item) =>
    normalizeDevelopmentBondDocumentRow(item),
  )

  const payload = definitions.map((item) => ({
    transaction_bond_closeout_id: closeoutId,
    document_type_key: item.key,
    label: item.label,
    is_required: Boolean(item.requiredForCloseOut),
    status: 'missing',
  }))

  const { error } = await client.from('transaction_bond_closeout_documents').upsert(payload, {
    onConflict: 'transaction_bond_closeout_id,document_type_key',
    ignoreDuplicates: true,
  })

  if (error) {
    if (isMissingSchemaError(error)) {
      return definitions.map((item) =>
        normalizeBondCloseoutDocumentRow({
          document_type_key: item.key,
          label: item.label,
          is_required: item.requiredForCloseOut,
          status: 'missing',
        }),
      )
    }
    throw error
  }

  const { data, error: docsError } = await client
    .from('transaction_bond_closeout_documents')
    .select(
      'id, transaction_bond_closeout_id, document_type_key, label, file_path, filename, uploaded_by, uploaded_at, is_required, status',
    )
    .eq('transaction_bond_closeout_id', closeoutId)

  if (docsError) {
    if (isMissingSchemaError(docsError)) {
      return definitions.map((item) =>
        normalizeBondCloseoutDocumentRow({
          document_type_key: item.key,
          label: item.label,
          is_required: item.requiredForCloseOut,
          status: 'missing',
        }),
      )
    }
    throw docsError
  }

  return Promise.all(
    (data || []).map(async (item) =>
      normalizeBondCloseoutDocumentRow({
        ...item,
        url: item.file_path ? await getSignedUrl(item.file_path) : null,
      }),
    ),
  )
}

async function ensureTransactionBondCloseout(client, transaction) {
  if (!transaction?.id || !isBondCommissionEligible(transaction)) {
    return null
  }

  const { data: existing, error: existingError } = await client
    .from('transaction_bond_closeouts')
    .select(
      'id, transaction_id, development_id, bond_originator_id, bond_originator_name, budgeted_amount, budget_source, budget_notes, actual_paid_amount, variance_amount, variance_percent, vat_included, payout_reference, payout_date, statement_date, close_out_status, reconciliation_status, ready_for_review_at, ready_for_review_by, closed_at, closed_by, notes, created_at, updated_at',
    )
    .eq('transaction_id', transaction.id)
    .maybeSingle()

  if (existingError) {
    if (isMissingSchemaError(existingError)) {
      return null
    }
    throw existingError
  }

  const config = transaction.development_id ? await fetchDevelopmentBondConfig(transaction.development_id) : null
  const budgetedAmount = deriveBondCommissionBudget(config, transaction, {}, deriveBondFinanceSnapshot(transaction))

  if (existing) {
    const documents = await syncTransactionBondCloseoutDocuments(client, existing.id, config?.requiredDocuments || [])
    return { closeout: existing, config, documents }
  }

  const seedPayload = {
    transaction_id: transaction.id,
    development_id: transaction.development_id || null,
    bond_originator_id: transaction.primary_bond_consultant_user_id || config?.bondOriginatorId || null,
    bond_originator_name: transaction.bond_originator || config?.bondOriginatorName || null,
    budgeted_amount: budgetedAmount,
    budget_source: 'development_default',
    vat_included: config?.vatIncluded ?? true,
    close_out_status: 'not_started',
    reconciliation_status: budgetedAmount !== null ? 'budgeted' : 'not_budgeted',
  }

  const { data: inserted, error: insertError } = await client
    .from('transaction_bond_closeouts')
    .upsert(seedPayload, { onConflict: 'transaction_id', ignoreDuplicates: true })
    .select(
      'id, transaction_id, development_id, bond_originator_id, bond_originator_name, budgeted_amount, budget_source, budget_notes, actual_paid_amount, variance_amount, variance_percent, vat_included, payout_reference, payout_date, statement_date, close_out_status, reconciliation_status, ready_for_review_at, ready_for_review_by, closed_at, closed_by, notes, created_at, updated_at',
    )

  if (insertError) {
    if (isMissingSchemaError(insertError)) {
      return null
    }
    throw insertError
  }

  let saved = inserted?.[0]
  if (!saved) {
    const read = await client.from('transaction_bond_closeouts').select('*').eq('transaction_id', transaction.id).single()
    if (read.error) throw read.error
    saved = read.data
  }
  if (!saved) throw new Error('Bond close-out could not be loaded after initialization.')
  const documents = await syncTransactionBondCloseoutDocuments(client, saved.id, config?.requiredDocuments || [])
  return { closeout: saved, config, documents }
}

async function fetchTransactionForBondCloseout(client, transactionId) {
  let transactionQuery = await client
    .from('transactions')
    .select(
      'id, development_id, unit_id, buyer_id, finance_type, finance_status, stage, current_main_stage, registered_at, primary_bond_consultant_user_id, bond_originator, sales_price, purchase_price, cash_amount, bond_amount',
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (
    transactionQuery.error &&
    (isMissingColumnError(transactionQuery.error, 'sales_price') ||
      isMissingColumnError(transactionQuery.error, 'purchase_price') ||
      isMissingColumnError(transactionQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionQuery.error, 'bond_amount'))
  ) {
    transactionQuery = await client
      .from('transactions')
      .select('id, development_id, unit_id, buyer_id, finance_type, stage, current_main_stage, bond_originator')
      .eq('id', transactionId)
      .maybeSingle()
  }

  if (transactionQuery.error) {
    throw transactionQuery.error
  }

  return transactionQuery.data || null
}

function buildBondCloseoutViewModel({ transaction, closeout, documents = [], config = null }) {
  const money = deriveBondCloseoutVariance(closeout?.budgeted_amount, closeout?.actual_paid_amount)
  const statuses = deriveBondCloseoutStatuses({
    transaction,
    closeout,
    documents,
  })

  return {
    id: closeout?.id || null,
    transactionId: transaction?.id || null,
    developmentId: transaction?.development_id || null,
    bondOriginatorName:
      closeout?.bond_originator_name || config?.bondOriginatorName || transaction?.bond_originator || 'Unassigned',
    budgetedAmount: money.budgetedAmount,
    budgetSource: closeout?.budget_source || 'development_default',
    budgetNotes: closeout?.budget_notes || '',
    actualPaidAmount: money.actualPaidAmount,
    varianceAmount: money.varianceAmount,
    variancePercent: money.variancePercent,
    vatIncluded: closeout?.vat_included ?? config?.vatIncluded ?? true,
    payoutReference: closeout?.payout_reference || '',
    payoutDate: closeout?.payout_date || '',
    statementDate: closeout?.statement_date || '',
    closeOutStatus: statuses.closeOutStatus,
    reconciliationStatus: statuses.reconciliationStatus,
    readyForReviewAt: closeout?.ready_for_review_at || null,
    closedAt: closeout?.closed_at || null,
    notes: closeout?.notes || '',
    documents,
    readiness: { ...statuses },
    config,
  }
}

export async function fetchTransactionBondCloseout(transactionId) {
  const client = requireClient()
  if (!transactionId) return null

  const transaction = await fetchTransactionForBondCloseout(client, transactionId)
  if (!transaction) return null

  const ensured = await ensureTransactionBondCloseout(client, transaction)
  if (!ensured) return null

  return buildBondCloseoutViewModel({
    transaction,
    closeout: ensured.closeout,
    documents: ensured.documents,
    config: ensured.config,
  })
}

export async function saveTransactionBondCloseout(transactionId, input = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const transaction = await fetchTransactionForBondCloseout(client, transactionId)
  if (!transaction) throw new Error('Transaction not found.')
  if (!isBondCommissionEligible(transaction)) {
    throw new Error(
      'Bond commission close-out only becomes available once the bond transaction is approved or handed into later stages.',
    )
  }

  const ensured = await ensureTransactionBondCloseout(client, transaction)
  if (!ensured?.closeout?.id) {
    throw new Error('Bond commercial tables are not set up yet. Run sql/schema.sql first.')
  }

  const documents = await syncTransactionBondCloseoutDocuments(
    client,
    ensured.closeout.id,
    ensured.config?.requiredDocuments || [],
  )
  const budgetedAmount = normalizeOptionalNumber(input.budgetedAmount ?? ensured.closeout.budgeted_amount)
  const actualPaidAmount = normalizeOptionalNumber(input.actualPaidAmount ?? ensured.closeout.actual_paid_amount)
  const variance = deriveBondCloseoutVariance(budgetedAmount, actualPaidAmount)
  const currentCloseout = {
    ...ensured.closeout,
    budgeted_amount: budgetedAmount,
    actual_paid_amount: actualPaidAmount,
    close_out_status: input.closeOutStatus ?? ensured.closeout.close_out_status,
  }
  const statusMeta = deriveBondCloseoutStatuses({
    transaction,
    closeout: currentCloseout,
    documents,
  })

  let closeOutStatus = normalizeBondCloseoutStatus(input.closeOutStatus ?? statusMeta.closeOutStatus)
  if (input.markReadyForReview) {
    if (!statusMeta.readyToClose) {
      throw new Error(
        'All required commission close-out items must be complete before marking the transaction ready for review.',
      )
    }
    closeOutStatus = 'ready_to_close'
  }
  if (input.markClosed) {
    if (!statusMeta.readyToClose) {
      throw new Error(
        'You cannot close this bond commission until the actual paid amount and required close-out documents are complete.',
      )
    }
    closeOutStatus = 'closed'
  }

  const reconciliationStatus =
    closeOutStatus === 'closed'
      ? 'reconciled'
      : normalizeBondReconciliationStatus(input.reconciliationStatus ?? statusMeta.reconciliationStatus)

  const payload = {
    budgeted_amount: budgetedAmount,
    budget_source: input.budgetSource || ensured.closeout.budget_source || 'development_default',
    budget_notes: normalizeNullableText(input.budgetNotes ?? ensured.closeout.budget_notes),
    actual_paid_amount: actualPaidAmount,
    variance_amount: variance.varianceAmount,
    variance_percent: variance.variancePercent,
    vat_included: input.vatIncluded ?? ensured.closeout.vat_included ?? true,
    payout_reference: normalizeNullableText(input.payoutReference ?? ensured.closeout.payout_reference),
    payout_date: normalizeOptionalDate(input.payoutDate ?? ensured.closeout.payout_date),
    statement_date: normalizeOptionalDate(input.statementDate ?? ensured.closeout.statement_date),
    close_out_status: closeOutStatus,
    reconciliation_status: reconciliationStatus,
    ready_for_review_at: input.markReadyForReview ? new Date().toISOString() : ensured.closeout.ready_for_review_at,
    ready_for_review_by: input.markReadyForReview ? actorProfile.userId || null : ensured.closeout.ready_for_review_by,
    closed_at: input.markClosed
      ? new Date().toISOString()
      : closeOutStatus === 'closed'
        ? ensured.closeout.closed_at
        : null,
    closed_by: input.markClosed
      ? actorProfile.userId || null
      : closeOutStatus === 'closed'
        ? ensured.closeout.closed_by
        : null,
    notes: normalizeNullableText(input.notes ?? ensured.closeout.notes),
    bond_originator_name: normalizeNullableText(
      input.bondOriginatorName ?? ensured.closeout.bond_originator_name ?? transaction.bond_originator,
    ),
  }

  const { error } = await client.from('transaction_bond_closeouts').update(payload).eq('id', ensured.closeout.id)
  if (error) {
    if (isMissingSchemaError(error)) {
      throw new Error('Bond commercial tables are not set up yet. Run sql/schema.sql first.')
    }
    throw error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || 'developer',
    eventType: 'TransactionUpdated',
    eventData: {
      source: 'bond_closeout',
      closeOutStatus,
      reconciliationStatus,
      actualPaidAmount,
      budgetedAmount,
    },
  })

  return fetchTransactionBondCloseout(transactionId)
}

export async function uploadTransactionBondCloseoutDocument({
  transactionId,
  closeoutId = null,
  file,
  documentTypeKey,
  label,
  onProgress = null,
}) {
  const reportProgress = createDocumentUploadProgressReporter(onProgress)
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)

  if (!transactionId || !file || !documentTypeKey) {
    throw new Error('Transaction, file, and document type are required.')
  }

  reportProgress('preparing')
  const closeout = closeoutId ? { id: closeoutId } : await fetchTransactionBondCloseout(transactionId)
  const targetCloseoutId = closeout?.id || closeout?.closeoutId || null
  if (!targetCloseoutId) {
    throw new Error('Bond commission close-out is not available for this transaction yet.')
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-')
  validateDocumentUploadFile(file, { surface: 'bond_closeout' })
  return runRecoverableDocumentUpload({ client: client, scope: ['bond_closeout', transactionId, targetCloseoutId, documentTypeKey], file, storageBuckets: DOCUMENTS_BUCKET_CANDIDATES,
    toSavedReceipt: result => ({ ...closeout, savedDocument: result.data, saved: true }),
    run: async attempt => {
      const filePath = attempt.path(`transaction-${transactionId}/bond-closeout-${targetCloseoutId}/${Date.now()}-${safeName}`)

      reportProgress('uploading')
      const uploadedBucket = await attempt.upload(() => uploadToDocumentsBucket(client, filePath, file))

      const definition = BOND_CLOSEOUT_DOCUMENT_DEFINITIONS.find((item) => item.key === documentTypeKey) || null
      const payload = {
        transaction_bond_closeout_id: targetCloseoutId,
        document_type_key: documentTypeKey,
        label: label || definition?.label || 'Bond Close-Out Document',
        file_path: filePath,
        filename: file.name,
        uploaded_by: actorProfile.userId || null,
        uploaded_at: new Date().toISOString(),
        is_required: definition?.requiredForCloseOut ?? true,
        status: 'uploaded',
      }

      reportProgress('saving')
      await attempt.persist({
        save: () => client.from('transaction_bond_closeout_documents').upsert(payload, { onConflict: 'transaction_bond_closeout_id,document_type_key' }).select('*').single(),
        read: () => readSavedUploadByPath(client, { table: 'transaction_bond_closeout_documents', column: 'file_path', path: filePath, filters: { transaction_bond_closeout_id: targetCloseoutId, document_type_key: documentTypeKey } }),
        cleanup: () => removeUploadedDocumentObject(client, uploadedBucket, filePath),
      })

      await logTransactionEventIfPossible(client, {
        transactionId,
        createdBy: actorProfile.userId || null,
        createdByRole: actorProfile.role || 'developer',
        eventType: 'DocumentUploaded',
        eventData: {
          source: 'bond_closeout',
          documentTypeKey,
          documentName: file.name,
        },
      })

      reportProgress('complete', 'Document saved successfully.')

      return fetchTransactionBondCloseout(transactionId)
    },
  })
}

const REFERRAL_INCENTIVE_SELECT =
  'id, organisation_id, transaction_id, incentive_type, referring_agency_id, referring_agency_name, referring_agent_id, referring_agent_name, referring_agent_email, amount_excl_vat, vat_rate, vat_amount, amount_incl_vat, qualifying_event, status, invoice_status, invoice_trigger_event, invoice_ready_at, invoice_ready_by, invoice_ready_reason, invoice_issued_at, invoice_reference, invoice_notes, expected_payout_date, payout_method, payable_to, account_holder, bank_name, account_number, branch_code, payment_reference, paid_amount, paid_at, approved_at, approved_by, reconciled_at, reconciled_by, notes, created_at, updated_at'

const REFERRAL_INCENTIVE_EVENT_SELECT =
  'id, incentive_id, transaction_id, event_type, previous_status, new_status, previous_value, new_value, actor_user_id, actor_display_name, actor_role, note, created_at'

function normalizeReferralIncentiveStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['pending', 'eligible', 'approved', 'paid', 'reconciled', 'cancelled'].includes(normalized)) return normalized
  return 'pending'
}

function normalizeReferralIncentiveEvent(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['application_submitted', 'quote_received', 'grant_issued', 'grant_accepted', 'attorney_instructed', 'bond_lodged', 'bond_registered', 'manual'].includes(normalized)) return normalized
  return 'grant_accepted'
}

function normalizeReferralInvoiceStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['not_ready', 'ready_to_invoice', 'invoiced', 'cancelled'].includes(normalized)) return normalized
  return 'not_ready'
}

function normalizeReferralIncentiveRow(row = null) {
  if (!row) return null
  return {
    id: row.id || null,
    organisationId: row.organisation_id || row.organisationId || null,
    transactionId: row.transaction_id || row.transactionId || null,
    incentiveType: row.incentive_type || row.incentiveType || 'referral_incentive',
    referringAgencyId: row.referring_agency_id || row.referringAgencyId || null,
    referringAgencyName: row.referring_agency_name || row.referringAgencyName || '',
    referringAgentId: row.referring_agent_id || row.referringAgentId || null,
    referringAgentName: row.referring_agent_name || row.referringAgentName || '',
    referringAgentEmail: row.referring_agent_email || row.referringAgentEmail || '',
    amountExclVat: normalizeOptionalNumber(row.amount_excl_vat ?? row.amountExclVat),
    vatRate: normalizeOptionalNumber(row.vat_rate ?? row.vatRate) ?? 15,
    vatAmount: normalizeOptionalNumber(row.vat_amount ?? row.vatAmount),
    amountInclVat: normalizeOptionalNumber(row.amount_incl_vat ?? row.amountInclVat),
    qualifyingEvent: normalizeReferralIncentiveEvent(row.qualifying_event || row.qualifyingEvent),
    status: normalizeReferralIncentiveStatus(row.status),
    invoiceStatus: normalizeReferralInvoiceStatus(row.invoice_status || row.invoiceStatus),
    invoiceTriggerEvent: normalizeReferralIncentiveEvent(row.invoice_trigger_event || row.invoiceTriggerEvent || 'bond_lodged'),
    invoiceReadyAt: row.invoice_ready_at || row.invoiceReadyAt || '',
    invoiceReadyBy: row.invoice_ready_by || row.invoiceReadyBy || '',
    invoiceReadyReason: row.invoice_ready_reason || row.invoiceReadyReason || '',
    invoiceIssuedAt: row.invoice_issued_at || row.invoiceIssuedAt || '',
    invoiceReference: row.invoice_reference || row.invoiceReference || '',
    invoiceNotes: row.invoice_notes || row.invoiceNotes || '',
    expectedPayoutDate: normalizeOptionalDate(row.expected_payout_date ?? row.expectedPayoutDate) || '',
    payoutMethod: row.payout_method || row.payoutMethod || 'EFT',
    payableTo: row.payable_to || row.payableTo || '',
    accountHolder: row.account_holder || row.accountHolder || '',
    bankName: row.bank_name || row.bankName || '',
    accountNumber: row.account_number || row.accountNumber || '',
    branchCode: row.branch_code || row.branchCode || '',
    paymentReference: row.payment_reference || row.paymentReference || '',
    paidAmount: normalizeOptionalNumber(row.paid_amount ?? row.paidAmount),
    paidAt: row.paid_at || row.paidAt || '',
    approvedAt: row.approved_at || row.approvedAt || '',
    approvedBy: row.approved_by || row.approvedBy || '',
    reconciledAt: row.reconciled_at || row.reconciledAt || '',
    reconciledBy: row.reconciled_by || row.reconciledBy || '',
    notes: row.notes || '',
    createdAt: row.created_at || row.createdAt || '',
    updatedAt: row.updated_at || row.updatedAt || '',
  }
}

function normalizeReferralIncentiveEventRow(row = {}) {
  return {
    id: row.id || null,
    incentiveId: row.incentive_id || row.incentiveId || null,
    transactionId: row.transaction_id || row.transactionId || null,
    eventType: row.event_type || row.eventType || 'updated',
    previousStatus: row.previous_status || row.previousStatus || '',
    newStatus: row.new_status || row.newStatus || '',
    previousValue: row.previous_value || row.previousValue || null,
    newValue: row.new_value || row.newValue || null,
    actorUserId: row.actor_user_id || row.actorUserId || '',
    actorDisplayName: row.actor_display_name || row.actorDisplayName || '',
    actorRole: row.actor_role || row.actorRole || '',
    note: row.note || '',
    createdAt: row.created_at || row.createdAt || '',
  }
}

function buildReferralIncentiveMoney(input = {}) {
  const amountExclVat = normalizeOptionalNumber(input.amountExclVat ?? input.amount_excl_vat)
  const vatRate = normalizeOptionalNumber(input.vatRate ?? input.vat_rate) ?? 15
  const vatAmount = amountExclVat !== null ? Number(((amountExclVat * vatRate) / 100).toFixed(2)) : null
  const amountInclVat = amountExclVat !== null && vatAmount !== null ? Number((amountExclVat + vatAmount).toFixed(2)) : null
  return { amountExclVat, vatRate, vatAmount, amountInclVat }
}

async function logReferralIncentiveEvent(client, { incentiveId, transactionId, eventType, previousStatus = '', newStatus = '', previousValue = null, newValue = null, note = '', actorProfile = {} } = {}) {
  if (!incentiveId || !transactionId) return null
  const payload = {
    incentive_id: incentiveId,
    transaction_id: transactionId,
    event_type: eventType || 'updated',
    previous_status: previousStatus || null,
    new_status: newStatus || null,
    previous_value: previousValue || null,
    new_value: newValue || null,
    actor_user_id: actorProfile.userId || null,
    actor_display_name: actorProfile.displayName || actorProfile.email || null,
    actor_role: actorProfile.role || null,
    note: normalizeNullableText(note),
  }
  const { error } = await client.from('transaction_referral_incentive_events').insert(payload)
  if (error && !isMissingSchemaError(error) && !isMissingTableError(error, 'transaction_referral_incentive_events')) {
    throw error
  }
  await logTransactionEventIfPossible(client, {
    transactionId,
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || 'bond_originator',
    eventType: 'TransactionUpdated',
    eventData: { source: 'referral_incentive', eventType, previousStatus, newStatus, note },
  })
  return payload
}

export async function fetchTransactionReferralIncentive(transactionId) {
  const client = requireClient()
  if (!transactionId) return { incentive: null, events: [], schemaAvailable: false }
  if (isOptionalRelationKnownMissing('transaction_referral_incentives')) {
    return { incentive: null, events: [], schemaAvailable: false }
  }

  const { data, error } = await client
    .from('transaction_referral_incentives')
    .select(REFERRAL_INCENTIVE_SELECT)
    .eq('transaction_id', transactionId)
    .maybeSingle()

  if (error) {
    if (rememberMissingOptionalRelation('transaction_referral_incentives', error) || isMissingSchemaError(error) || isPermissionDeniedError(error)) {
      return { incentive: null, events: [], schemaAvailable: false }
    }
    throw error
  }

  const incentive = normalizeReferralIncentiveRow(data)
  if (!incentive?.id) return { incentive: null, events: [], schemaAvailable: true }

  let eventRows = []
  let eventsError = null
  if (!isOptionalRelationKnownMissing('transaction_referral_incentive_events')) {
    const eventsResult = await client
      .from('transaction_referral_incentive_events')
      .select(REFERRAL_INCENTIVE_EVENT_SELECT)
      .eq('incentive_id', incentive.id)
      .order('created_at', { ascending: false })
    eventRows = eventsResult.data || []
    eventsError = eventsResult.error
    rememberMissingOptionalRelation('transaction_referral_incentive_events', eventsError)
  }

  if (eventsError && !isMissingSchemaError(eventsError) && !isMissingTableError(eventsError, 'transaction_referral_incentive_events') && !isPermissionDeniedError(eventsError)) {
    throw eventsError
  }

  return {
    incentive,
    events: (eventRows || []).map(normalizeReferralIncentiveEventRow),
    schemaAvailable: true,
  }
}

export async function saveTransactionReferralIncentive(transactionId, input = {}, options = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  if (!transactionId) throw new Error('Transaction is required.')

  const { data: transaction, error: transactionError } = await client
    .from('transactions')
    .select('id, organisation_id, transaction_reference, agency_commission_amount')
    .eq('id', transactionId)
    .maybeSingle()
  if (transactionError) throw transactionError
  if (!transaction) throw new Error('Transaction not found.')

  const existingResult = await fetchTransactionReferralIncentive(transactionId)
  const existing = existingResult.incentive
  const money = buildReferralIncentiveMoney({
    amountExclVat: input.amountExclVat ?? input.amount_excl_vat ?? existing?.amountExclVat,
    vatRate: input.vatRate ?? input.vat_rate ?? existing?.vatRate,
  })
  const payload = {
    organisation_id: input.organisationId || input.organisation_id || transaction.organisation_id || null,
    transaction_id: transactionId,
    incentive_type: input.incentiveType || input.incentive_type || existing?.incentiveType || 'referral_incentive',
    referring_agency_id: input.referringAgencyId || input.referring_agency_id || existing?.referringAgencyId || null,
    referring_agency_name: normalizeNullableText(input.referringAgencyName ?? input.referring_agency_name ?? existing?.referringAgencyName),
    referring_agent_id: input.referringAgentId || input.referring_agent_id || existing?.referringAgentId || null,
    referring_agent_name: normalizeNullableText(input.referringAgentName ?? input.referring_agent_name ?? existing?.referringAgentName),
    referring_agent_email: normalizeNullableText(input.referringAgentEmail ?? input.referring_agent_email ?? existing?.referringAgentEmail)?.toLowerCase() || null,
    amount_excl_vat: money.amountExclVat,
    vat_rate: money.vatRate,
    vat_amount: money.vatAmount,
    amount_incl_vat: money.amountInclVat,
    qualifying_event: normalizeReferralIncentiveEvent(input.qualifyingEvent || input.qualifying_event || existing?.qualifyingEvent),
    status: normalizeReferralIncentiveStatus(input.status || existing?.status || 'pending'),
    invoice_status: normalizeReferralInvoiceStatus(input.invoiceStatus || input.invoice_status || existing?.invoiceStatus),
    invoice_trigger_event: normalizeReferralIncentiveEvent(input.invoiceTriggerEvent || input.invoice_trigger_event || existing?.invoiceTriggerEvent || 'bond_lodged'),
    invoice_ready_reason: normalizeNullableText(input.invoiceReadyReason ?? input.invoice_ready_reason ?? existing?.invoiceReadyReason),
    invoice_reference: normalizeNullableText(input.invoiceReference ?? input.invoice_reference ?? existing?.invoiceReference),
    invoice_notes: normalizeNullableText(input.invoiceNotes ?? input.invoice_notes ?? existing?.invoiceNotes),
    expected_payout_date: normalizeOptionalDate(input.expectedPayoutDate ?? input.expected_payout_date ?? existing?.expectedPayoutDate),
    payout_method: normalizeNullableText(input.payoutMethod ?? input.payout_method ?? existing?.payoutMethod) || 'EFT',
    payable_to: normalizeNullableText(input.payableTo ?? input.payable_to ?? existing?.payableTo),
    account_holder: normalizeNullableText(input.accountHolder ?? input.account_holder ?? existing?.accountHolder),
    bank_name: normalizeNullableText(input.bankName ?? input.bank_name ?? existing?.bankName),
    account_number: normalizeNullableText(input.accountNumber ?? input.account_number ?? existing?.accountNumber),
    branch_code: normalizeNullableText(input.branchCode ?? input.branch_code ?? existing?.branchCode),
    payment_reference: normalizeNullableText(input.paymentReference ?? input.payment_reference ?? existing?.paymentReference ?? transaction.transaction_reference),
    notes: normalizeNullableText(input.notes ?? existing?.notes),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await client
    .from('transaction_referral_incentives')
    .upsert(payload, { onConflict: 'transaction_id' })
    .select(REFERRAL_INCENTIVE_SELECT)
    .single()

  if (error) {
    if (isMissingSchemaError(error) || isMissingTableError(error, 'transaction_referral_incentives')) {
      throw new Error('Referral incentive tables are not set up yet. Run the referral incentive migration first.')
    }
    throw error
  }

  const incentive = normalizeReferralIncentiveRow(data)
  await logReferralIncentiveEvent(client, {
    incentiveId: incentive.id,
    transactionId,
    eventType: existing ? 'incentive_updated' : 'incentive_created',
    previousStatus: existing?.status || '',
    newStatus: incentive.status,
    previousValue: existing,
    newValue: incentive,
    note: input.auditNote || input.notes || '',
    actorProfile: { ...actorProfile, role: options.actorRole || actorProfile.role },
  })

  return fetchTransactionReferralIncentive(transactionId)
}

export async function transitionTransactionReferralIncentive(transactionId, input = {}, options = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)
  const current = await fetchTransactionReferralIncentive(transactionId)
  const incentive = current.incentive
  if (!incentive?.id) throw new Error('Create the incentive before changing status.')

  const previousStatus = normalizeReferralIncentiveStatus(incentive.status)
  const hasStatusTransition = input.status !== undefined && input.status !== null && String(input.status).trim() !== ''
  const nextStatus = hasStatusTransition ? normalizeReferralIncentiveStatus(input.status) : previousStatus
  const allowed = {
    pending: ['eligible', 'cancelled'],
    eligible: ['approved', 'pending', 'cancelled'],
    approved: ['paid', 'eligible', 'cancelled'],
    paid: ['reconciled', 'approved'],
    reconciled: ['paid'],
    cancelled: ['pending'],
  }
  if (hasStatusTransition && previousStatus !== nextStatus && !allowed[previousStatus]?.includes(nextStatus)) {
    throw new Error(`Cannot move incentive from ${previousStatus} to ${nextStatus}.`)
  }

  const updates = {
    notes: normalizeNullableText(input.notes ?? incentive.notes),
    updated_at: new Date().toISOString(),
  }
  if (hasStatusTransition) {
    updates.status = nextStatus
  }
  const hasInvoiceTransition = input.invoiceStatus !== undefined || input.invoice_status !== undefined
  if (hasInvoiceTransition) {
    const nextInvoiceStatus = normalizeReferralInvoiceStatus(input.invoiceStatus ?? input.invoice_status)
    updates.invoice_status = nextInvoiceStatus
    updates.invoice_trigger_event = normalizeReferralIncentiveEvent(input.invoiceTriggerEvent || input.invoice_trigger_event || incentive.invoiceTriggerEvent || 'bond_lodged')
    updates.invoice_ready_reason = normalizeNullableText(input.invoiceReadyReason ?? input.invoice_ready_reason ?? input.note ?? input.notes ?? incentive.invoiceReadyReason)
    updates.invoice_notes = normalizeNullableText(input.invoiceNotes ?? input.invoice_notes ?? input.notes ?? incentive.invoiceNotes)
    if (nextInvoiceStatus === 'ready_to_invoice') {
      updates.invoice_ready_at = new Date().toISOString()
      updates.invoice_ready_by = actorProfile.userId || null
    }
    if (nextInvoiceStatus === 'invoiced') {
      updates.invoice_issued_at = normalizeOptionalDate(input.invoiceIssuedAt ?? input.invoice_issued_at) || new Date().toISOString()
      updates.invoice_reference = normalizeNullableText(input.invoiceReference ?? input.invoice_reference ?? incentive.invoiceReference)
    }
  }
  if (hasStatusTransition && nextStatus === 'approved') {
    updates.approved_at = new Date().toISOString()
    updates.approved_by = actorProfile.userId || null
  }
  if (hasStatusTransition && nextStatus === 'paid') {
    updates.paid_at = normalizeOptionalDate(input.paidAt ?? input.paymentDate) || new Date().toISOString()
    updates.paid_amount = normalizeOptionalNumber(input.paidAmount ?? input.amountPaid ?? incentive.amountExclVat)
    updates.payout_method = normalizeNullableText(input.payoutMethod ?? incentive.payoutMethod) || 'EFT'
    updates.payment_reference = normalizeNullableText(input.paymentReference ?? incentive.paymentReference)
  }
  if (hasStatusTransition && nextStatus === 'reconciled') {
    updates.reconciled_at = new Date().toISOString()
    updates.reconciled_by = actorProfile.userId || null
  }

  const { data, error } = await client
    .from('transaction_referral_incentives')
    .update(updates)
    .eq('id', incentive.id)
    .select(REFERRAL_INCENTIVE_SELECT)
    .single()
  if (error) throw error

  await logReferralIncentiveEvent(client, {
    incentiveId: incentive.id,
    transactionId,
    eventType: input.eventType || (hasInvoiceTransition ? `invoice_${normalizeReferralInvoiceStatus(input.invoiceStatus ?? input.invoice_status)}` : `status_${nextStatus}`),
    previousStatus,
    newStatus: nextStatus,
    previousValue: incentive,
    newValue: normalizeReferralIncentiveRow(data),
    note: input.note || input.notes || '',
    actorProfile: { ...actorProfile, role: options.actorRole || actorProfile.role },
  })

  return fetchTransactionReferralIncentive(transactionId)
}

export async function fetchDevelopmentBondReconciliationReport(developmentId) {
  const client = requireClient()
  if (!developmentId) {
    return {
      config: normalizeDevelopmentBondConfigRow(null, []),
      summary: {
        eligibleCount: 0,
        totalBudgeted: 0,
        totalActual: 0,
        totalVariance: 0,
        outstandingStatements: 0,
        outstandingConfirmations: 0,
        closeOutPending: 0,
      },
      rows: [],
    }
  }

  const config = await fetchDevelopmentBondConfig(developmentId)
  let transactionsQuery = await client
    .from('transactions')
    .select(
      'id, unit_id, buyer_id, development_id, finance_type, stage, current_main_stage, bond_originator, sales_price, purchase_price, cash_amount, bond_amount, created_at, updated_at',
    )
    .eq('development_id', developmentId)
    .order('updated_at', { ascending: false })

  if (
    transactionsQuery.error &&
    (isMissingColumnError(transactionsQuery.error, 'cash_amount') ||
      isMissingColumnError(transactionsQuery.error, 'bond_amount') ||
      isMissingColumnError(transactionsQuery.error, 'purchase_price'))
  ) {
    transactionsQuery = await client
      .from('transactions')
      .select(
        'id, unit_id, buyer_id, development_id, finance_type, stage, current_main_stage, bond_originator, sales_price, purchase_price, created_at, updated_at',
      )
      .eq('development_id', developmentId)
      .order('updated_at', { ascending: false })
  }

  if (transactionsQuery.error) throw transactionsQuery.error
  const transactions = transactionsQuery.data || []

  const eligibleTransactions = transactions.filter((item) => isBondCommissionEligible(item))
  const transactionIds = eligibleTransactions.map((item) => item.id)
  const unitIds = [...new Set(eligibleTransactions.map((item) => item.unit_id).filter(Boolean))]
  const buyerIds = [...new Set(eligibleTransactions.map((item) => item.buyer_id).filter(Boolean))]

  const [{ data: unitsData }, { data: buyersData }] = await Promise.all([
    unitIds.length ? client.from('units').select('id, unit_number').in('id', unitIds) : Promise.resolve({ data: [] }),
    buyerIds.length ? client.from('buyers').select('id, name').in('id', buyerIds) : Promise.resolve({ data: [] }),
  ])
  const unitById = Object.fromEntries((unitsData || []).map((item) => [item.id, item]))
  const buyerById = Object.fromEntries((buyersData || []).map((item) => [item.id, item]))
  let onboardingFormDataByTransactionId = {}

  if (transactionIds.length) {
    const { data: onboardingData, error: onboardingError } = await client
      .from('onboarding_form_data')
      .select('transaction_id, form_data')
      .in('transaction_id', transactionIds)

    if (onboardingError && !isMissingTableError(onboardingError, 'onboarding_form_data')) {
      throw onboardingError
    }

    onboardingFormDataByTransactionId = Object.fromEntries(
      (onboardingData || []).map((item) => [item.transaction_id, item.form_data || null]),
    )
  }

  let closeoutsByTransactionId = {}
  let docsByCloseoutId = {}
  if (transactionIds.length) {
    const { data: closeouts, error: closeoutsError } = await client
      .from('transaction_bond_closeouts')
      .select(
        'id, transaction_id, bond_originator_name, budgeted_amount, actual_paid_amount, variance_amount, variance_percent, close_out_status, reconciliation_status, payout_reference, payout_date, statement_date, closed_at',
      )
      .in('transaction_id', transactionIds)
    if (closeoutsError && !isMissingSchemaError(closeoutsError)) throw closeoutsError

    const closeoutRows = closeouts || []
    closeoutsByTransactionId = Object.fromEntries(closeoutRows.map((item) => [item.transaction_id, item]))
    const closeoutIds = closeoutRows.map((item) => item.id)
    if (closeoutIds.length) {
      const { data: docs, error: docsError } = await client
        .from('transaction_bond_closeout_documents')
        .select('transaction_bond_closeout_id, document_type_key, status, file_path, filename')
        .in('transaction_bond_closeout_id', closeoutIds)
      if (docsError && !isMissingSchemaError(docsError)) throw docsError
      const docsWithUrls = await Promise.all(
        (docs || []).map(async (item) => ({
          ...item,
          url: item.file_path ? await getSignedUrl(item.file_path) : null,
        })),
      )
      docsByCloseoutId = docsWithUrls.reduce((accumulator, item) => {
        if (!accumulator[item.transaction_bond_closeout_id]) accumulator[item.transaction_bond_closeout_id] = []
        accumulator[item.transaction_bond_closeout_id].push(item)
        return accumulator
      }, {})
    }
  }

  const rows = eligibleTransactions.map((transaction) => {
    const closeout = closeoutsByTransactionId[transaction.id] || null
    const docRows = closeout?.id ? (docsByCloseoutId[closeout.id] || []).map(normalizeBondCloseoutDocumentRow) : []
    const unit = unitById[transaction.unit_id] || {}
    const statementDocument = docRows.find((item) => item.key === 'commission_statement')
    const confirmationDocument = docRows.find((item) => item.key === 'bond_approval_confirmation')
    const financeSnapshot = deriveBondFinanceSnapshot(
      transaction,
      onboardingFormDataByTransactionId[transaction.id] || null,
    )
    const commissionBase = deriveBondCommissionBase(transaction, unit, financeSnapshot)
    const budgetedAmount =
      closeout?.budgeted_amount ?? deriveBondCommissionBudget(config, transaction, unit, financeSnapshot)
    const money = deriveBondCloseoutVariance(budgetedAmount, closeout?.actual_paid_amount)
    const statuses = deriveBondCloseoutStatuses({
      transaction,
      closeout,
      documents: docRows,
    })

    return {
      transactionId: transaction.id,
      developmentId,
      unitId: transaction.unit_id || null,
      unitNumber: unitById[transaction.unit_id]?.unit_number || '—',
      buyerName: buyerById[transaction.buyer_id]?.name || 'Unassigned',
      bondOriginator:
        closeout?.bond_originator_name || config.bondOriginatorName || transaction.bond_originator || 'Unassigned',
      approvalDate: transaction.updated_at || transaction.created_at,
      financeType: financeSnapshot.financeType,
      purchasePrice: financeSnapshot.purchasePrice,
      cashAmount: financeSnapshot.cashAmount,
      bondAmount: financeSnapshot.bondAmount,
      commissionBaseAmount: commissionBase.amount,
      commissionBaseSource: commissionBase.source,
      budgetedAmount: money.budgetedAmount,
      actualPaidAmount: money.actualPaidAmount,
      varianceAmount: money.varianceAmount,
      variancePercent: money.variancePercent,
      statementUploaded: statuses.hasStatement,
      statementUrl: statementDocument?.url || null,
      statementFilename: statementDocument?.filename || null,
      confirmationUploaded: statuses.hasConfirmation,
      confirmationUrl: confirmationDocument?.url || null,
      confirmationFilename: confirmationDocument?.filename || null,
      closeOutStatus: closeout ? statuses.closeOutStatus : 'not_started',
      reconciliationStatus: closeout
        ? statuses.reconciliationStatus
        : money.budgetedAmount !== null
          ? 'budgeted'
          : 'not_budgeted',
      isClosed: normalizeBondCloseoutStatus(closeout?.close_out_status) === 'closed',
      closedAt: closeout?.closed_at || null,
    }
  })

  const summary = rows.reduce(
    (accumulator, item) => {
      accumulator.eligibleCount += 1
      accumulator.totalBudgeted += Number(item.budgetedAmount || 0)
      accumulator.totalActual += Number(item.actualPaidAmount || 0)
      accumulator.totalVariance += Number(item.varianceAmount || 0)
      if (!item.statementUploaded) accumulator.outstandingStatements += 1
      if (!item.confirmationUploaded) accumulator.outstandingConfirmations += 1
      if (item.closeOutStatus !== 'closed') accumulator.closeOutPending += 1
      return accumulator
    },
    {
      eligibleCount: 0,
      totalBudgeted: 0,
      totalActual: 0,
      totalVariance: 0,
      outstandingStatements: 0,
      outstandingConfirmations: 0,
      closeOutPending: 0,
    },
  )

  return { config, summary, rows }
}

export async function fetchBondCommissionDashboard() {
  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)

  const { data, error } = await client
    .from('transaction_bond_closeouts')
    .select(
      'id, transaction_id, development_id, bond_originator_id, bond_originator_name, budgeted_amount, actual_paid_amount, variance_amount, variance_percent, close_out_status, reconciliation_status, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })

  if (error) {
    if (isMissingSchemaError(error)) {
      return {
        summary: {
          eligibleTransactions: 0,
          totalBudgeted: 0,
          totalActual: 0,
          totalReconciled: 0,
          outstandingStatements: 0,
          outstandingCloseouts: 0,
        },
        rows: [],
      }
    }
    throw error
  }

  let closeouts = data || []
  if (normalizeRoleType(activeProfile.role) === 'bond_originator') {
    const comparableNames = new Set(
      [activeProfile.companyName, activeProfile.fullName, activeProfile.email]
        .map((item) =>
          String(item || '')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    )
    closeouts = closeouts.filter((item) => {
      const originatorName = String(item.bond_originator_name || '')
        .trim()
        .toLowerCase()
      return item.bond_originator_id === activeProfile.userId || comparableNames.has(originatorName)
    })
  }

  const transactionIds = closeouts.map((item) => item.transaction_id).filter(Boolean)
  const developmentIds = [...new Set(closeouts.map((item) => item.development_id).filter(Boolean))]
  const [{ data: transactions }, { data: developments }] = await Promise.all([
    transactionIds.length
      ? client.from('transactions').select('id, unit_id, buyer_id').in('id', transactionIds)
      : Promise.resolve({ data: [] }),
    developmentIds.length
      ? client.from('developments').select('id, name').in('id', developmentIds)
      : Promise.resolve({ data: [] }),
  ])
  const transactionById = Object.fromEntries((transactions || []).map((item) => [item.id, item]))
  const developmentById = Object.fromEntries((developments || []).map((item) => [item.id, item]))
  const unitIds = [...new Set((transactions || []).map((item) => item.unit_id).filter(Boolean))]
  const buyerIds = [...new Set((transactions || []).map((item) => item.buyer_id).filter(Boolean))]
  const [{ data: unitsData }, { data: buyersData }] = await Promise.all([
    unitIds.length ? client.from('units').select('id, unit_number').in('id', unitIds) : Promise.resolve({ data: [] }),
    buyerIds.length ? client.from('buyers').select('id, name').in('id', buyerIds) : Promise.resolve({ data: [] }),
  ])
  const unitById = Object.fromEntries((unitsData || []).map((item) => [item.id, item]))
  const buyerById = Object.fromEntries((buyersData || []).map((item) => [item.id, item]))

  const rows = closeouts.map((item) => {
    const transaction = transactionById[item.transaction_id] || {}
    return {
      id: item.id,
      transactionId: item.transaction_id,
      developmentName: developmentById[item.development_id]?.name || 'Unknown Development',
      unitNumber: unitById[transaction.unit_id]?.unit_number || '—',
      buyerName: buyerById[transaction.buyer_id]?.name || 'Unassigned',
      budgetedAmount: normalizeOptionalNumber(item.budgeted_amount),
      actualPaidAmount: normalizeOptionalNumber(item.actual_paid_amount),
      varianceAmount: normalizeOptionalNumber(item.variance_amount),
      variancePercent: normalizeOptionalNumber(item.variance_percent),
      closeOutStatus: normalizeBondCloseoutStatus(item.close_out_status),
      reconciliationStatus: normalizeBondReconciliationStatus(item.reconciliation_status),
    }
  })

  const summary = rows.reduce(
    (accumulator, item) => {
      accumulator.eligibleTransactions += 1
      accumulator.totalBudgeted += Number(item.budgetedAmount || 0)
      accumulator.totalActual += Number(item.actualPaidAmount || 0)
      if (item.reconciliationStatus === 'reconciled') accumulator.totalReconciled += 1
      if (item.reconciliationStatus === 'awaiting_statement') accumulator.outstandingStatements += 1
      if (item.closeOutStatus !== 'closed') accumulator.outstandingCloseouts += 1
      return accumulator
    },
    {
      eligibleTransactions: 0,
      totalBudgeted: 0,
      totalActual: 0,
      totalReconciled: 0,
      outstandingStatements: 0,
      outstandingCloseouts: 0,
    },
  )

  return { summary, rows }
}
