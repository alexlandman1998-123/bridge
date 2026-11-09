// attorney owns these operations and their existing recovery behavior.
import { uploadToDocumentsBucket, removeUploadedDocumentObject } from '../../lib/api/shared/storage.js'
import { logTransactionEventIfPossible } from '../transactions/eventActions.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { getSignedUrl } from '../documents/listReadApi.js'
import { normalizeNullableText, normalizeOptionalDate, requireClient, isMissingSchemaError, isPermissionDeniedError, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { fetchDevelopmentAttorneyConfig, normalizeDevelopmentAttorneyConfigRow, normalizeDevelopmentAttorneyDocumentRow, ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS, buildDefaultDevelopmentAttorneyDocuments } from '../developments/configurationApi.js'
import { runRecoverableDocumentUpload, readSavedUploadByPath } from '../../lib/documentUploadRecovery.js'
import { DOCUMENTS_BUCKET_CANDIDATES } from '../../lib/supabaseClient'
import { validateDocumentUploadFile } from '../../lib/documentUploadPolicy'
import { createDocumentUploadProgressReporter } from '../../lib/documentUploadLifecycle'
import { getMainStageFromDetailedStage, normalizeStageLabel } from '../../core/transactions/stageConfig'
import { normalizeRequiredStatus } from '../../core/documents/documentVaultArchitecture'
import { normalizeRoleType } from '../../core/transactions/permissions'

const ATTORNEY_CLOSEOUT_STATUS_VALUES = ['not_started', 'in_progress', 'ready_to_close', 'closed']

const ATTORNEY_RECONCILIATION_STATUS_VALUES = [
  'not_budgeted',
  'budgeted',
  'awaiting_invoice',
  'awaiting_statement',
  'awaiting_review',
  'reconciled',
]

export function normalizeAttorneyCloseoutStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return ATTORNEY_CLOSEOUT_STATUS_VALUES.includes(normalized) ? normalized : 'not_started'
}

function normalizeAttorneyReconciliationStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return ATTORNEY_RECONCILIATION_STATUS_VALUES.includes(normalized) ? normalized : 'not_budgeted'
}

function isRegisteredTransactionForCloseout(transaction) {
  if (!transaction) {
    return false
  }

  const normalizedMainStage = String(
    transaction.current_main_stage || getMainStageFromDetailedStage(transaction.stage || ''),
  ).toUpperCase()

  return normalizedMainStage === 'REG' || normalizeStageLabel(transaction.stage || '') === 'Registered'
}

function deriveAttorneyCloseoutVariance(budgetedAmount, actualBilledAmount) {
  const budgeted = normalizeOptionalNumber(budgetedAmount)
  const actual = normalizeOptionalNumber(actualBilledAmount)
  const varianceAmount = budgeted !== null && actual !== null ? actual - budgeted : null
  const variancePercent =
    varianceAmount !== null && budgeted && budgeted !== 0
      ? Number(((varianceAmount / budgeted) * 100).toFixed(2))
      : null

  return {
    budgetedAmount: budgeted,
    actualBilledAmount: actual,
    varianceAmount,
    variancePercent,
  }
}

function deriveAttorneyCloseoutStatuses({ transaction, closeout, documents = [] }) {
  const isRegistered = isRegisteredTransactionForCloseout(transaction)
  const requiredDocs = documents.filter((item) => item.isRequired)
  const uploadedRequiredCount = requiredDocs.filter(
    (item) => item.status === 'uploaded' || item.status === 'accepted',
  ).length
  const allRequiredDocsUploaded = requiredDocs.every((item) => item.status === 'uploaded' || item.status === 'accepted')
  const hasActual = normalizeOptionalNumber(closeout?.actual_billed_amount ?? closeout?.actualBilledAmount) !== null
  const hasBudget = normalizeOptionalNumber(closeout?.budgeted_amount ?? closeout?.budgetedAmount) !== null
  const hasInvoice = documents.some(
    (item) => item.key === 'attorney_invoice' && (item.status === 'uploaded' || item.status === 'accepted'),
  )
  const hasStatement = documents.some(
    (item) => item.key === 'attorney_statement' && (item.status === 'uploaded' || item.status === 'accepted'),
  )
  const readyToClose = Boolean(isRegistered && hasActual && allRequiredDocsUploaded)

  let reconciliationStatus = 'not_budgeted'
  if (hasBudget) {
    reconciliationStatus = 'budgeted'
  }
  if (hasBudget && !hasInvoice) {
    reconciliationStatus = 'awaiting_invoice'
  } else if (hasInvoice && !hasStatement) {
    reconciliationStatus = 'awaiting_statement'
  } else if (readyToClose) {
    reconciliationStatus =
      normalizeAttorneyCloseoutStatus(closeout?.close_out_status) === 'closed' ? 'reconciled' : 'awaiting_review'
  }

  let closeOutStatus = normalizeAttorneyCloseoutStatus(closeout?.close_out_status)
  if (closeOutStatus === 'not_started' && (uploadedRequiredCount > 0 || hasActual || hasBudget)) {
    closeOutStatus = readyToClose ? 'ready_to_close' : 'in_progress'
  }
  if (closeOutStatus === 'in_progress' && readyToClose) {
    closeOutStatus = 'ready_to_close'
  }

  return {
    isRegistered,
    readyToClose,
    hasActual,
    hasBudget,
    hasInvoice,
    hasStatement,
    allRequiredDocsUploaded,
    uploadedRequiredCount,
    requiredCount: requiredDocs.length,
    closeOutStatus,
    reconciliationStatus,
  }
}

function normalizeAttorneyCloseoutDocumentRow(row = {}) {
  const fallback =
    ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS.find((item) => item.key === row.document_type_key || item.key === row.key) ||
    {}

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

async function syncTransactionAttorneyCloseoutDocuments(client, closeoutId, configDocuments = [], {persistDefinitions=true} = {}) {
  const definitions = (configDocuments.length ? configDocuments : buildDefaultDevelopmentAttorneyDocuments()).map(
    (item) => normalizeDevelopmentAttorneyDocumentRow(item),
  )

  const payload = definitions.map((item) => ({
    transaction_attorney_closeout_id: closeoutId,
    document_type_key: item.key,
    label: item.label,
    is_required: Boolean(item.requiredForCloseOut),
  }))

  const { error } = persistDefinitions ? await client.from('transaction_attorney_closeout_documents').upsert(payload, {
    onConflict: 'transaction_attorney_closeout_id,document_type_key',ignoreDuplicates:true,
  }) : {error:null}

  if (error) {
    if (isMissingSchemaError(error)) {
      return definitions.map((item) =>
        normalizeAttorneyCloseoutDocumentRow({
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
    .from('transaction_attorney_closeout_documents')
    .select(
      'id, transaction_attorney_closeout_id, document_type_key, label, file_path, filename, uploaded_by, uploaded_at, is_required, status',
    )
    .eq('transaction_attorney_closeout_id', closeoutId)

  if (docsError) {
    if (isMissingSchemaError(docsError)) {
      return definitions.map((item) =>
        normalizeAttorneyCloseoutDocumentRow({
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
      normalizeAttorneyCloseoutDocumentRow({
        ...item,
        url: item.file_path ? await getSignedUrl(item.file_path) : null,
      }),
    ),
  )
}

async function ensureTransactionAttorneyCloseout(client, transaction) {
  if (!transaction?.id || !isRegisteredTransactionForCloseout(transaction)) {
    return null
  }

  const { data: existing, error: existingError } = await client
    .from('transaction_attorney_closeouts')
    .select(
      'id, transaction_id, development_id, responsible_attorney_firm_id, attorney_firm_id, attorney_firm_name, budgeted_amount, budget_source, budget_notes, actual_billed_amount, variance_amount, variance_percent, vat_included, invoice_reference, invoice_date, statement_date, close_out_status, reconciliation_status, ready_for_review_at, ready_for_review_by, closed_at, closed_by, notes, created_at, updated_at',
    )
    .eq('transaction_id', transaction.id)
    .maybeSingle()

  if (existingError) {
    if (isMissingSchemaError(existingError)) {
      return null
    }

    throw existingError
  }

  const config = transaction.development_id ? await fetchDevelopmentAttorneyConfig(transaction.development_id) : null
  const budgetedAmount = normalizeOptionalNumber(config?.defaultFeeAmount)

  if (existing) {
    const authority=await client.rpc('bridge_can_manage_attorney_closeout',{p_transaction_id:transaction.id,p_firm_id:existing.responsible_attorney_firm_id})
    if(authority.error)throw authority.error
    const documents = await syncTransactionAttorneyCloseoutDocuments(
      client,
      existing.id,
      config?.requiredDocuments || [],
      {persistDefinitions:authority.data===true},
    )
    return { closeout: existing, config, documents }
  }

  const assignment = await client.from('transaction_attorney_assignments')
    .select('attorney_firm_id,firm_id,attorney_role,assignment_type,assignment_status,status')
    .eq('transaction_id', transaction.id)
  if (assignment.error) throw assignment.error
  const responsible = (assignment.data || []).find(row =>
    (row.attorney_role === 'transfer_attorney' || ['transfer','transfer_and_bond'].includes(row.assignment_type)) &&
    (row.assignment_status || row.status) === 'active' && !['removed','revoked','inactive','paused'].includes(row.status))
  const responsibleFirmId = responsible?.attorney_firm_id || responsible?.firm_id || null
  if (!responsibleFirmId) return null
  const authority = await client.rpc('bridge_can_manage_attorney_closeout', {
    p_transaction_id: transaction.id, p_firm_id: responsibleFirmId,
  })
  if (authority.error) {
    if (isPermissionDeniedError(authority.error)) return null
    throw authority.error
  }
  if (authority.data !== true) return null

  const seedPayload = {
    transaction_id: transaction.id,
    development_id: transaction.development_id || null,
    responsible_attorney_firm_id: responsibleFirmId,
    attorney_firm_id: null,
    attorney_firm_name: config?.attorneyFirmName || transaction.attorney || null,
    budgeted_amount: budgetedAmount,
    budget_source: budgetedAmount !== null ? 'development_default' : 'development_default',
    vat_included: config?.vatIncluded ?? true,
    close_out_status: 'not_started',
    reconciliation_status: budgetedAmount !== null ? 'budgeted' : 'not_budgeted',
  }

  const { data: inserted, error: insertError } = await client
    .from('transaction_attorney_closeouts')
    .upsert(seedPayload, {onConflict:'transaction_id',ignoreDuplicates:true})
    .select(
      'id, transaction_id, development_id, responsible_attorney_firm_id, attorney_firm_id, attorney_firm_name, budgeted_amount, budget_source, budget_notes, actual_billed_amount, variance_amount, variance_percent, vat_included, invoice_reference, invoice_date, statement_date, close_out_status, reconciliation_status, ready_for_review_at, ready_for_review_by, closed_at, closed_by, notes, created_at, updated_at',
    )
    .maybeSingle()

  if (insertError) {
    if (isMissingSchemaError(insertError)) {
      return null
    }

    throw insertError
  }

  const saved = inserted || (await client.from('transaction_attorney_closeouts').select('*').eq('transaction_id',transaction.id).single()).data
  if (!saved) throw new Error('The attorney closeout could not be loaded after creation.')
  const documents = await syncTransactionAttorneyCloseoutDocuments(client, saved.id, config?.requiredDocuments || [])

  return {
    closeout: saved,
    config,
    documents,
  }
}

function buildAttorneyCloseoutViewModel({ transaction, closeout, documents = [], config = null }) {
  const money = deriveAttorneyCloseoutVariance(closeout?.budgeted_amount, closeout?.actual_billed_amount)
  const statuses = deriveAttorneyCloseoutStatuses({
    transaction,
    closeout,
    documents,
  })

  return {
    id: closeout?.id || null,
    transactionId: transaction?.id || null,
    developmentId: transaction?.development_id || null,
    attorneyFirmName: closeout?.attorney_firm_name || config?.attorneyFirmName || transaction?.attorney || 'Unassigned',
    budgetedAmount: money.budgetedAmount,
    budgetSource: closeout?.budget_source || 'development_default',
    budgetNotes: closeout?.budget_notes || '',
    actualBilledAmount: money.actualBilledAmount,
    varianceAmount: money.varianceAmount,
    variancePercent: money.variancePercent,
    vatIncluded: closeout?.vat_included ?? config?.vatIncluded ?? true,
    invoiceReference: closeout?.invoice_reference || '',
    invoiceDate: closeout?.invoice_date || '',
    statementDate: closeout?.statement_date || '',
    closeOutStatus: statuses.closeOutStatus,
    reconciliationStatus: statuses.reconciliationStatus,
    readyForReviewAt: closeout?.ready_for_review_at || null,
    closedAt: closeout?.closed_at || null,
    closedBy: closeout?.closed_by || null,
    notes: closeout?.notes || '',
    documents,
    readiness: {
      ...statuses,
    },
    config,
  }
}

export async function fetchTransactionAttorneyCloseout(transactionId) {
  const client = requireClient()

  if (!transactionId) {
    return null
  }

  const { data: transaction, error: transactionError } = await client
    .from('transactions')
    .select('id, development_id, unit_id, buyer_id, stage, current_main_stage, attorney, assigned_attorney_email')
    .eq('id', transactionId)
    .maybeSingle()

  if (transactionError) {
    throw transactionError
  }

  if (!transaction) {
    return null
  }

  const ensured = await ensureTransactionAttorneyCloseout(client, transaction)
  if (!ensured) {
    return null
  }

  return buildAttorneyCloseoutViewModel({
    transaction,
    closeout: ensured.closeout,
    documents: ensured.documents,
    config: ensured.config,
  })
}

export async function saveTransactionAttorneyCloseout(transactionId, input = {}) {
  const client = requireClient()
  const actorProfile = await resolveActiveProfileContext(client)

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const { data: transaction, error: transactionError } = await client
    .from('transactions')
    .select('id, development_id, stage, current_main_stage, attorney')
    .eq('id', transactionId)
    .maybeSingle()

  if (transactionError) {
    throw transactionError
  }

  if (!transaction) {
    throw new Error('Transaction not found.')
  }

  if (!isRegisteredTransactionForCloseout(transaction)) {
    throw new Error('Attorney close-out only becomes available once the transaction is registered.')
  }

  const ensured = await ensureTransactionAttorneyCloseout(client, transaction)
  if (!ensured?.closeout?.id) {
    throw new Error('Attorney close-out tables are not set up yet. Run sql/schema.sql first.')
  }

  const documents = await syncTransactionAttorneyCloseoutDocuments(
    client,
    ensured.closeout.id,
    ensured.config?.requiredDocuments || [],
  )
  const budgetedAmount = normalizeOptionalNumber(input.budgetedAmount ?? ensured.closeout.budgeted_amount)
  const actualBilledAmount = normalizeOptionalNumber(input.actualBilledAmount ?? ensured.closeout.actual_billed_amount)
  const variance = deriveAttorneyCloseoutVariance(budgetedAmount, actualBilledAmount)
  const currentCloseout = {
    ...ensured.closeout,
    budgeted_amount: budgetedAmount,
    actual_billed_amount: actualBilledAmount,
    close_out_status: input.closeOutStatus ?? ensured.closeout.close_out_status,
  }
  const statusMeta = deriveAttorneyCloseoutStatuses({
    transaction,
    closeout: currentCloseout,
    documents,
  })

  let closeOutStatus = normalizeAttorneyCloseoutStatus(input.closeOutStatus ?? statusMeta.closeOutStatus)
  if (input.markReadyForReview) {
    if (!statusMeta.readyToClose) {
      throw new Error('All required close-out items must be complete before marking the transaction ready for review.')
    }
    closeOutStatus = 'ready_to_close'
  }

  if (input.markClosed) {
    if (!statusMeta.readyToClose) {
      throw new Error(
        'You cannot close this transaction until the actual amount and required close-out documents are complete.',
      )
    }
    closeOutStatus = 'closed'
  }

  const reconciliationStatus =
    closeOutStatus === 'closed'
      ? 'reconciled'
      : normalizeAttorneyReconciliationStatus(input.reconciliationStatus ?? statusMeta.reconciliationStatus)

  const payload = {
    budgeted_amount: budgetedAmount,
    budget_source: input.budgetSource || ensured.closeout.budget_source || 'development_default',
    budget_notes: normalizeNullableText(input.budgetNotes ?? ensured.closeout.budget_notes),
    actual_billed_amount: actualBilledAmount,
    variance_amount: variance.varianceAmount,
    variance_percent: variance.variancePercent,
    vat_included: input.vatIncluded ?? ensured.closeout.vat_included ?? true,
    invoice_reference: normalizeNullableText(input.invoiceReference ?? ensured.closeout.invoice_reference),
    invoice_date: normalizeOptionalDate(input.invoiceDate ?? ensured.closeout.invoice_date),
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
    attorney_firm_name: normalizeNullableText(
      input.attorneyFirmName ?? ensured.closeout.attorney_firm_name ?? transaction.attorney,
    ),
  }

  const { error } = await client.from('transaction_attorney_closeouts').update(payload).eq('id', ensured.closeout.id)

  if (error) {
    if (isMissingSchemaError(error)) {
      throw new Error('Attorney close-out tables are not set up yet. Run sql/schema.sql first.')
    }

    throw error
  }

  await logTransactionEventIfPossible(client, {
    transactionId,
    createdBy: actorProfile.userId || null,
    createdByRole: actorProfile.role || 'developer',
    eventType: 'TransactionUpdated',
    eventData: {
      source: 'attorney_closeout',
      closeOutStatus,
      reconciliationStatus,
      actualBilledAmount,
      budgetedAmount,
    },
  })

  return fetchTransactionAttorneyCloseout(transactionId)
}

export async function uploadTransactionAttorneyCloseoutDocument({
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
  const closeout = closeoutId ? { id: closeoutId } : await fetchTransactionAttorneyCloseout(transactionId)

  const targetCloseoutId = closeout?.id || closeout?.closeoutId || null
  if (!targetCloseoutId) {
    throw new Error('Attorney close-out is not available for this transaction yet.')
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-')
  validateDocumentUploadFile(file, { surface: 'attorney_closeout' })
  return runRecoverableDocumentUpload({ client: client, scope: ['attorney_closeout', transactionId, targetCloseoutId, documentTypeKey], file, storageBuckets: DOCUMENTS_BUCKET_CANDIDATES,
    toSavedReceipt: result => ({ ...closeout, savedDocument: result.data, saved: true }),
    run: async attempt => {
      const filePath = attempt.path(`transaction-${transactionId}/closeout-${targetCloseoutId}/${Date.now()}-${safeName}`)

      reportProgress('uploading')
      const uploadedBucket = await attempt.upload(() => uploadToDocumentsBucket(client, filePath, file))

      const definition = ATTORNEY_CLOSEOUT_DOCUMENT_DEFINITIONS.find((item) => item.key === documentTypeKey) || null

      const payload = {
        transaction_attorney_closeout_id: targetCloseoutId,
        document_type_key: documentTypeKey,
        label: label || definition?.label || 'Close-Out Document',
        file_path: filePath,
        filename: file.name,
        uploaded_by: actorProfile.userId || null,
        uploaded_at: new Date().toISOString(),
        is_required: definition?.requiredForCloseOut ?? true,
        status: 'uploaded',
      }

      reportProgress('saving')
      await attempt.persist({
        save: () => client.from('transaction_attorney_closeout_documents').upsert(payload, { onConflict: 'transaction_attorney_closeout_id,document_type_key' }).select('*').single(),
        read: () => readSavedUploadByPath(client, { table: 'transaction_attorney_closeout_documents', column: 'file_path', path: filePath, filters: { transaction_attorney_closeout_id: targetCloseoutId, document_type_key: documentTypeKey } }),
        cleanup: () => removeUploadedDocumentObject(client, uploadedBucket, filePath),
      })

      await logTransactionEventIfPossible(client, {
        transactionId,
        createdBy: actorProfile.userId || null,
        createdByRole: actorProfile.role || 'developer',
        eventType: 'DocumentUploaded',
        eventData: {
          source: 'attorney_closeout',
          documentTypeKey,
          documentName: file.name,
        },
      })

      reportProgress('complete', 'Document saved successfully.')

      return fetchTransactionAttorneyCloseout(transactionId)
    },
  })
}

export async function fetchDevelopmentAttorneyReconciliationReport(developmentId) {
  const client = requireClient()

  if (!developmentId) {
    return {
      config: normalizeDevelopmentAttorneyConfigRow(null, []),
      summary: {
        registeredCount: 0,
        totalBudgeted: 0,
        totalActual: 0,
        totalVariance: 0,
        outstandingInvoices: 0,
        outstandingStatements: 0,
        closeOutPending: 0,
      },
      rows: [],
    }
  }

  const config = await fetchDevelopmentAttorneyConfig(developmentId)

  const { data: transactions, error } = await client
    .from('transactions')
    .select(
      'id, unit_id, buyer_id, development_id, stage, current_main_stage, attorney, sales_price, purchase_price, created_at, updated_at',
    )
    .eq('development_id', developmentId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw error
  }

  const registeredTransactions = (transactions || []).filter((item) => isRegisteredTransactionForCloseout(item))
  const transactionIds = registeredTransactions.map((item) => item.id)
  const unitIds = [...new Set(registeredTransactions.map((item) => item.unit_id).filter(Boolean))]
  const buyerIds = [...new Set(registeredTransactions.map((item) => item.buyer_id).filter(Boolean))]

  const [{ data: unitsData }, { data: buyersData }] = await Promise.all([
    unitIds.length ? client.from('units').select('id, unit_number').in('id', unitIds) : Promise.resolve({ data: [] }),
    buyerIds.length ? client.from('buyers').select('id, name').in('id', buyerIds) : Promise.resolve({ data: [] }),
  ])

  const unitById = Object.fromEntries((unitsData || []).map((item) => [item.id, item]))
  const buyerById = Object.fromEntries((buyersData || []).map((item) => [item.id, item]))

  let closeoutsByTransactionId = {}
  let docsByCloseoutId = {}
  if (transactionIds.length) {
    const { data: closeouts, error: closeoutsError } = await client
      .from('transaction_attorney_closeouts')
      .select(
        'id, transaction_id, attorney_firm_name, budgeted_amount, actual_billed_amount, variance_amount, variance_percent, close_out_status, reconciliation_status, invoice_reference, invoice_date, statement_date, closed_at',
      )
      .in('transaction_id', transactionIds)

    if (closeoutsError && !isMissingSchemaError(closeoutsError)) {
      throw closeoutsError
    }

    const closeoutRows = closeouts || []
    closeoutsByTransactionId = Object.fromEntries(closeoutRows.map((item) => [item.transaction_id, item]))

    const closeoutIds = closeoutRows.map((item) => item.id)
    if (closeoutIds.length) {
      const { data: docs, error: docsError } = await client
        .from('transaction_attorney_closeout_documents')
        .select('transaction_attorney_closeout_id, document_type_key, status, file_path, filename')
        .in('transaction_attorney_closeout_id', closeoutIds)

      if (docsError && !isMissingSchemaError(docsError)) {
        throw docsError
      }

      const docsWithUrls = await Promise.all(
        (docs || []).map(async (item) => ({
          ...item,
          url: item.file_path ? await getSignedUrl(item.file_path) : null,
        })),
      )

      docsByCloseoutId = docsWithUrls.reduce((accumulator, item) => {
        if (!accumulator[item.transaction_attorney_closeout_id]) {
          accumulator[item.transaction_attorney_closeout_id] = []
        }
        accumulator[item.transaction_attorney_closeout_id].push(item)
        return accumulator
      }, {})
    }
  }

  const rows = registeredTransactions.map((transaction) => {
    const closeout = closeoutsByTransactionId[transaction.id] || null
    const docRows = closeout?.id ? (docsByCloseoutId[closeout.id] || []).map(normalizeAttorneyCloseoutDocumentRow) : []
    const invoiceDocument = docRows.find((item) => item.key === 'attorney_invoice')
    const statementDocument = docRows.find((item) => item.key === 'attorney_statement')
    const money = deriveAttorneyCloseoutVariance(closeout?.budgeted_amount, closeout?.actual_billed_amount)
    const statuses = deriveAttorneyCloseoutStatuses({
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
      attorney: closeout?.attorney_firm_name || config.attorneyFirmName || transaction.attorney || 'Unassigned',
      registrationDate: transaction.updated_at || transaction.created_at,
      budgetedAmount: money.budgetedAmount,
      actualBilledAmount: money.actualBilledAmount,
      varianceAmount: money.varianceAmount,
      variancePercent: money.variancePercent,
      invoiceUploaded: statuses.hasInvoice,
      invoiceUrl: invoiceDocument?.url || null,
      invoiceFilename: invoiceDocument?.filename || null,
      statementUploaded: statuses.hasStatement,
      statementUrl: statementDocument?.url || null,
      statementFilename: statementDocument?.filename || null,
      closeOutStatus: closeout ? statuses.closeOutStatus : 'not_started',
      reconciliationStatus: closeout
        ? statuses.reconciliationStatus
        : money.budgetedAmount !== null
          ? 'budgeted'
          : 'not_budgeted',
      isClosed: normalizeAttorneyCloseoutStatus(closeout?.close_out_status) === 'closed',
      closedAt: closeout?.closed_at || null,
    }
  })

  const summary = rows.reduce(
    (accumulator, item) => {
      accumulator.registeredCount += 1
      accumulator.totalBudgeted += Number(item.budgetedAmount || 0)
      accumulator.totalActual += Number(item.actualBilledAmount || 0)
      accumulator.totalVariance += Number(item.varianceAmount || 0)
      if (!item.invoiceUploaded) accumulator.outstandingInvoices += 1
      if (!item.statementUploaded) accumulator.outstandingStatements += 1
      if (item.closeOutStatus !== 'closed') accumulator.closeOutPending += 1
      return accumulator
    },
    {
      registeredCount: 0,
      totalBudgeted: 0,
      totalActual: 0,
      totalVariance: 0,
      outstandingInvoices: 0,
      outstandingStatements: 0,
      closeOutPending: 0,
    },
  )

  return {
    config,
    summary,
    rows,
  }
}

export async function fetchAttorneyBillablesDashboard() {
  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)

  let closeouts = []
  const { data, error } = await client
    .from('transaction_attorney_closeouts')
    .select(
      'id, transaction_id, development_id, attorney_firm_id, attorney_firm_name, budgeted_amount, actual_billed_amount, variance_amount, variance_percent, close_out_status, reconciliation_status, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })

  if (error) {
    if (isMissingSchemaError(error)) {
      return {
        summary: {
          registeredTransactions: 0,
          totalBudgeted: 0,
          totalActual: 0,
          totalReconciled: 0,
          outstandingInvoices: 0,
          outstandingCloseouts: 0,
        },
        rows: [],
      }
    }

    throw error
  }

  closeouts = data || []
  if (normalizeRoleType(activeProfile.role) === 'attorney') {
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
      const attorneyName = String(item.attorney_firm_name || '')
        .trim()
        .toLowerCase()
      return item.attorney_firm_id === activeProfile.userId || comparableNames.has(attorneyName)
    })
  }

  const transactionIds = closeouts.map((item) => item.transaction_id).filter(Boolean)
  const developmentIds = [...new Set(closeouts.map((item) => item.development_id).filter(Boolean))]
  const [{ data: transactions }, { data: developments }] = await Promise.all([
    transactionIds.length
      ? client.from('transactions').select('id, unit_id, buyer_id, assigned_attorney_email').in('id', transactionIds)
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
    unitIds.length
      ? client.from('units').select('id, unit_number, list_price, price').in('id', unitIds)
      : Promise.resolve({ data: [] }),
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
      registrationDate: item.updated_at || item.created_at,
      budgetedAmount: normalizeOptionalNumber(item.budgeted_amount),
      actualBilledAmount: normalizeOptionalNumber(item.actual_billed_amount),
      varianceAmount: normalizeOptionalNumber(item.variance_amount),
      variancePercent: normalizeOptionalNumber(item.variance_percent),
      closeOutStatus: normalizeAttorneyCloseoutStatus(item.close_out_status),
      reconciliationStatus: normalizeAttorneyReconciliationStatus(item.reconciliation_status),
    }
  })

  const summary = rows.reduce(
    (accumulator, item) => {
      accumulator.registeredTransactions += 1
      accumulator.totalBudgeted += Number(item.budgetedAmount || 0)
      accumulator.totalActual += Number(item.actualBilledAmount || 0)
      if (item.reconciliationStatus === 'reconciled') {
        accumulator.totalReconciled += 1
      }
      if (item.reconciliationStatus === 'awaiting_invoice') {
        accumulator.outstandingInvoices += 1
      }
      if (item.closeOutStatus !== 'closed') {
        accumulator.outstandingCloseouts += 1
      }
      return accumulator
    },
    {
      registeredTransactions: 0,
      totalBudgeted: 0,
      totalActual: 0,
      totalReconciled: 0,
      outstandingInvoices: 0,
      outstandingCloseouts: 0,
    },
  )

  return { summary, rows }
}
