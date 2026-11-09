// finance owns these operations and their existing recovery behavior.
import { uploadToDocumentsBucket, removeUploadedDocumentObject } from '../../lib/api/shared/storage.js'
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { getSignedUrl } from '../documents/listReadApi.js'
import { normalizeNullableText, normalizeOptionalDate, requireClient, isMissingTableError, isMissingSchemaError, normalizeOptionalNumber } from '../../lib/api/shared/readHelpers.js'
import { runRecoverableDocumentUpload, readSavedUploadByPath } from '../../lib/documentUploadRecovery.js'
import { DOCUMENTS_BUCKET_CANDIDATES } from '../../lib/supabaseClient'
import { validateDocumentUploadFile } from '../../lib/documentUploadPolicy'
import { evaluateMatterFinancialAccountReadiness, summarizeMatterFinancialAccountReadiness } from '../../core/attorneyAccounting/matterAccountReadiness'
import { buildMatterFinancialReviewQueue, summarizeMatterFinancialReviewQueue } from '../../core/attorneyAccounting/matterAccountReviewQueue'
import { buildMatterFinancialSubmissionFollowUps, summarizeMatterFinancialSubmissionFollowUps } from '../../core/attorneyAccounting/matterAccountSubmissionFollowUps'
import { summarizeMatterFinancialSubmissionPack } from '../../core/attorneyAccounting/matterAccountSubmissionPack'
import { requireClientPortalTokenClient } from '../clientPortal/appointmentRead.js'
import { isPrivateTransactionType } from '../transactions/workspaceHydration.js'
import { normalizeAttorneyCloseoutStatus } from '../attorney/closeoutApi.js'
import { isMissingRpcFunctionError } from './schemaCompatibility.js'
import { fetchTransactionsByParticipant } from '../transactions/detailApi.js'
import { removeDocumentUploadObjectAfterFailedPersistence } from '../documents/uploadWorkflow.js'

function normalizeTransactionFinancialPaymentStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return ['not_invoiced', 'invoiced', 'paid', 'needs_attention'].includes(normalized) ? normalized : 'not_invoiced'
}

function buildFinancialRecordViewModel(row = {}) {
  return {
    id: row.id || null,
    transactionId: row.transaction_id || null,
    expectedFee: normalizeOptionalNumber(row.expected_fee),
    invoicedAmount: normalizeOptionalNumber(row.invoiced_amount),
    paymentStatus: normalizeTransactionFinancialPaymentStatus(row.payment_status),
    invoiceReference: row.invoice_reference || '',
    invoiceDate: row.invoice_date || '',
    invoiceFilePath: row.invoice_file_path || null,
    invoiceFilename: row.invoice_filename || null,
    paymentDate: row.payment_date || '',
    notes: row.notes || '',
    updatedAt: row.updated_at || row.created_at || null,
    createdAt: row.created_at || null,
  }
}

async function loadTransactionFinancialRecords(client, transactionIds = []) {
  if (!transactionIds.length) {
    return {}
  }

  const query = await client
    .from('transaction_financial_records')
    .select(
      'id, transaction_id, expected_fee, invoiced_amount, payment_status, invoice_reference, invoice_date, invoice_file_path, invoice_filename, payment_date, notes, created_at, updated_at',
    )
    .in('transaction_id', transactionIds)

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_financial_records')) {
      return {}
    }
    throw query.error
  }

  const rows = await Promise.all(
    (query.data || []).map(async (item) => ({
      ...buildFinancialRecordViewModel(item),
      invoiceUrl: item.invoice_file_path ? await getSignedUrl(item.invoice_file_path) : null,
    })),
  )

  return rows.reduce((accumulator, item) => {
    accumulator[item.transactionId] = item
    return accumulator
  }, {})
}

async function loadDevelopmentAttorneyConfigMap(client, developmentIds = []) {
  if (!developmentIds.length) {
    return {}
  }

  const query = await client
    .from('development_attorney_configs')
    .select('development_id, attorney_firm_name, default_fee_amount')
    .in('development_id', developmentIds)

  if (query.error) {
    if (isMissingSchemaError(query.error)) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, item) => {
    if (!accumulator[item.development_id]) {
      accumulator[item.development_id] = item
    }
    return accumulator
  }, {})
}

async function loadAttorneyCloseoutMap(client, transactionIds = []) {
  if (!transactionIds.length) {
    return {}
  }

  const query = await client
    .from('transaction_attorney_closeouts')
    .select(
      'id, transaction_id, attorney_firm_name, budgeted_amount, actual_billed_amount, invoice_reference, invoice_date, close_out_status, reconciliation_status, notes, updated_at, created_at',
    )
    .in('transaction_id', transactionIds)

  if (query.error) {
    if (isMissingSchemaError(query.error)) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, item) => {
    accumulator[item.transaction_id] = item
    return accumulator
  }, {})
}

function deriveFinancialRow(row, financialRecord = null, closeout = null, developmentConfig = null) {
  const transaction = row?.transaction || {}
  const expectedFee =
    financialRecord?.expectedFee ??
    normalizeOptionalNumber(developmentConfig?.default_fee_amount) ??
    normalizeOptionalNumber(closeout?.budgeted_amount)

  const invoicedAmount = financialRecord?.invoicedAmount ?? normalizeOptionalNumber(closeout?.actual_billed_amount)

  const paymentStatus = financialRecord?.paymentStatus
    ? financialRecord.paymentStatus
    : invoicedAmount !== null
      ? normalizeTransactionFinancialPaymentStatus(
          normalizeAttorneyCloseoutStatus(closeout?.close_out_status) === 'closed' ? 'paid' : 'invoiced',
        )
      : 'not_invoiced'

  const paidAmount = paymentStatus === 'paid' ? Number(invoicedAmount || 0) : 0
  const outstandingAmount = Math.max(Number(expectedFee || 0) - Number(paidAmount || 0), 0)
  const needsAttention =
    paymentStatus === 'needs_attention' ||
    (String(row?.stage || '').toLowerCase() === 'registered' && paymentStatus !== 'paid') ||
    (expectedFee !== null && invoicedAmount !== null && Number(invoicedAmount) > Number(expectedFee))

  return {
    transactionId: transaction.id || null,
    unitId: row?.unit?.id || null,
    type: isPrivateTransactionType(transaction?.transaction_type) ? 'private' : 'development',
    stage: row?.stage || transaction?.stage || 'Unknown',
    clientName: row?.buyer?.name || 'Unassigned',
    developmentName: row?.development?.name || null,
    unitNumber: row?.unit?.unit_number || null,
    propertyAddress:
      [transaction?.property_address_line_1, transaction?.suburb || transaction?.city].filter(Boolean).join(', ') ||
      transaction?.property_description ||
      null,
    expectedFee,
    invoicedAmount,
    paidAmount,
    outstandingAmount,
    paymentStatus: needsAttention ? 'needs_attention' : paymentStatus,
    invoiceReference: financialRecord?.invoiceReference || closeout?.invoice_reference || '',
    invoiceDate: financialRecord?.invoiceDate || closeout?.invoice_date || '',
    invoiceUploaded: Boolean(financialRecord?.invoiceUrl || financialRecord?.invoiceFilePath),
    invoiceUrl: financialRecord?.invoiceUrl || null,
    invoiceFilename: financialRecord?.invoiceFilename || null,
    paymentDate: financialRecord?.paymentDate || '',
    notes: financialRecord?.notes || closeout?.notes || '',
    attorneyFirmName:
      closeout?.attorney_firm_name || developmentConfig?.attorney_firm_name || transaction?.attorney || 'Unassigned',
    lastUpdated:
      financialRecord?.updatedAt ||
      closeout?.updated_at ||
      transaction?.updated_at ||
      transaction?.created_at ||
      row?.unit?.updated_at ||
      row?.unit?.created_at ||
      null,
  }
}

export async function fetchAttorneyFinancials({ userId } = {}) {
  const client = requireClient()
  const rows = await fetchTransactionsByParticipant({
    userId,
    roleType: 'attorney',
  })
  const transactionIds = rows.map((row) => row?.transaction?.id).filter(Boolean)
  const developmentIds = [...new Set(rows.map((row) => row?.development?.id).filter(Boolean))]

  const [financialRecordMap, closeoutMap, developmentConfigMap] = await Promise.all([
    loadTransactionFinancialRecords(client, transactionIds),
    loadAttorneyCloseoutMap(client, transactionIds),
    loadDevelopmentAttorneyConfigMap(client, developmentIds),
  ])

  const financialRows = rows
    .filter((row) => row?.transaction?.id)
    .map((row) =>
      deriveFinancialRow(
        row,
        financialRecordMap[row.transaction.id] || null,
        closeoutMap[row.transaction.id] || null,
        developmentConfigMap[row?.development?.id] || null,
      ),
    )
    .sort((left, right) => new Date(right.lastUpdated || 0) - new Date(left.lastUpdated || 0))

  const summary = financialRows.reduce(
    (accumulator, item) => {
      accumulator.totalExpectedFees += Number(item.expectedFee || 0)
      accumulator.totalInvoiced += Number(item.invoicedAmount || 0)
      accumulator.totalPaid += Number(item.paidAmount || 0)
      accumulator.outstanding += Number(item.outstandingAmount || 0)
      if (String(item.stage || '').toLowerCase() === 'registered') {
        const updatedAt = new Date(item.lastUpdated || 0)
        const now = new Date()
        if (updatedAt.getMonth() === now.getMonth() && updatedAt.getFullYear() === now.getFullYear()) {
          accumulator.registeredThisMonth += 1
        }
      }
      return accumulator
    },
    {
      totalExpectedFees: 0,
      totalInvoiced: 0,
      totalPaid: 0,
      outstanding: 0,
      registeredThisMonth: 0,
    },
  )

  return {
    rows: financialRows,
    summary,
  }
}

export async function fetchTransactionFinancialRecord(transactionId) {
  const client = requireClient()
  if (!transactionId) {
    return null
  }

  const financialMap = await loadTransactionFinancialRecords(client, [transactionId])
  return financialMap[transactionId] || null
}

export async function saveTransactionFinancialRecord(transactionId, input = {}) {
  const client = requireClient()
  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  const payload = {
    transaction_id: transactionId,
    expected_fee: normalizeOptionalNumber(input.expectedFee),
    invoiced_amount: normalizeOptionalNumber(input.invoicedAmount),
    payment_status: normalizeTransactionFinancialPaymentStatus(input.paymentStatus),
    invoice_reference: normalizeNullableText(input.invoiceReference),
    invoice_date: normalizeOptionalDate(input.invoiceDate),
    payment_date: normalizeOptionalDate(input.paymentDate),
    notes: normalizeNullableText(input.notes),
    updated_at: new Date().toISOString(),
  }

  const result = await client
    .from('transaction_financial_records')
    .upsert(payload, { onConflict: 'transaction_id' })
    .select(
      'id, transaction_id, expected_fee, invoiced_amount, payment_status, invoice_reference, invoice_date, invoice_file_path, invoice_filename, payment_date, notes, created_at, updated_at',
    )
    .single()

  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_financial_records')) {
      throw new Error('Transaction financial records are not set up yet. Run sql/schema.sql first.')
    }
    throw result.error
  }

  return {
    ...buildFinancialRecordViewModel(result.data),
    invoiceUrl: result.data?.invoice_file_path ? await getSignedUrl(result.data.invoice_file_path) : null,
  }
}

export async function uploadTransactionFinancialInvoice({ transactionId, file }) {
  const client = requireClient()

  if (!transactionId) {
    throw new Error('Transaction is required.')
  }

  if (!file) {
    throw new Error('Select an invoice file to upload.')
  }

  const safeName = String(file.name || 'invoice')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
  validateDocumentUploadFile(file, { surface: 'transaction_invoice' })
  return runRecoverableDocumentUpload({ client: client, scope: ['transaction_invoice', transactionId], file, storageBuckets: DOCUMENTS_BUCKET_CANDIDATES,
    toSavedReceipt: result => ({ ...buildFinancialRecordViewModel(result.data), invoiceUrl: null }),
    run: async attempt => {
      const filePath = attempt.path(`transaction-financial-invoices/${transactionId}/${crypto.randomUUID()}-${safeName}`)

      const uploadedBucket = await attempt.upload(() => uploadToDocumentsBucket(client, filePath, file))

      const upsert = await attempt.persist({
        save: async () => {
          const upsert = await client
            .from('transaction_financial_records')
            .upsert(
              {
                transaction_id: transactionId,
                invoice_file_path: filePath,
                invoice_filename: safeName,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'transaction_id' },
            )
            .select(
              'id, transaction_id, expected_fee, invoiced_amount, payment_status, invoice_reference, invoice_date, invoice_file_path, invoice_filename, payment_date, notes, created_at, updated_at',
            )
            .single()

          if (upsert.error) {
            await removeDocumentUploadObjectAfterFailedPersistence(client, {
              bucket: uploadedBucket,
              filePath,
              error: upsert.error,
            })
            if (isMissingTableError(upsert.error, 'transaction_financial_records')) {
              throw new Error('Transaction financial records are not set up yet. Run sql/schema.sql first.')
            }
            throw upsert.error
          }
          return upsert
        },
        read: () => readSavedUploadByPath(client, { table: 'transaction_financial_records', column: 'invoice_file_path', path: filePath, filters: { transaction_id: transactionId } }),
      })

      return {
        ...buildFinancialRecordViewModel(upsert.data),
        invoiceUrl: upsert.data?.invoice_file_path ? await getSignedUrl(upsert.data.invoice_file_path) : null,
      }
    },
  })
}

const MATTER_FINANCIAL_DOCUMENT_TYPES = new Set([
  'invoice',
  'statement',
  'receipt',
  'proof_of_payment',
  'credit_note',
  'debit_note',
  'other',
])

const MATTER_FINANCIAL_AUDIENCE_ROLES = new Set(['buyer', 'seller', 'client', 'shared', 'internal'])

const MATTER_FINANCIAL_ENTRY_TYPES = new Set([
  'opening_balance',
  'charge',
  'payment',
  'credit',
  'debit',
  'adjustment',
  'write_off',
])

const MATTER_FINANCIAL_CREDIT_ENTRY_TYPES = new Set(['payment', 'credit', 'write_off'])

export function normalizeMatterFinancialDocumentType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return MATTER_FINANCIAL_DOCUMENT_TYPES.has(normalized) ? normalized : 'other'
}

export function normalizeMatterFinancialAudienceRole(value, fallback = 'internal') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (MATTER_FINANCIAL_AUDIENCE_ROLES.has(normalized)) return normalized
  return MATTER_FINANCIAL_AUDIENCE_ROLES.has(fallback) ? fallback : 'internal'
}

function normalizeMatterFinancialEntryType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return MATTER_FINANCIAL_ENTRY_TYPES.has(normalized) ? normalized : 'payment'
}

export function normalizeMatterFinancialCurrencyCode(value, fallback = 'ZAR') {
  const normalized = String(value || fallback || 'ZAR')
    .trim()
    .toUpperCase()
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'ZAR'
}

function normalizeMatterFinancialEntryAmount(entryType, value) {
  const amount = normalizeOptionalNumber(value)
  if (!amount) {
    throw new Error('Enter a non-zero amount.')
  }

  const absoluteAmount = Math.abs(amount)
  return MATTER_FINANCIAL_CREDIT_ENTRY_TYPES.has(entryType) ? -absoluteAmount : absoluteAmount
}

function buildMatterFinancialBalanceViewModel(row = {}) {
  return {
    financialAccountId: row.financial_account_id || null,
    transactionId: row.transaction_id || null,
    openingBalance: normalizeOptionalNumber(row.opening_balance) || 0,
    postedEntryTotal: normalizeOptionalNumber(row.posted_entry_total) || 0,
    balanceDue: normalizeOptionalNumber(row.balance_due) || 0,
    totalCharged: normalizeOptionalNumber(row.total_charged) || 0,
    totalCredited: normalizeOptionalNumber(row.total_credited) || 0,
    lastPostedAt: row.last_posted_at || null,
  }
}

function buildMatterFinancialDocumentViewModel(row = {}, url = null) {
  return {
    id: row.id || null,
    financialAccountId: row.financial_account_id || null,
    transactionId: row.transaction_id || null,
    attorneyFirmId: row.attorney_firm_id || null,
    sourceDocumentId: row.source_document_id || null,
    uploadedBy: row.uploaded_by || null,
    publishedBy: row.published_by || null,
    supersedesDocumentId: row.supersedes_document_id || null,
    documentType: row.document_type || 'other',
    documentStatus: row.document_status || 'draft',
    audienceRole: row.audience_role || 'internal',
    externalReference: row.external_reference || '',
    title: row.title || row.file_name || 'Financial document',
    storageBucket: row.storage_bucket || null,
    storagePath: row.storage_path || null,
    fileName: row.file_name || '',
    mimeType: row.mime_type || '',
    fileSizeBytes: normalizeOptionalNumber(row.file_size_bytes),
    currencyCode: row.currency_code || 'ZAR',
    amountTotal: normalizeOptionalNumber(row.amount_total),
    amountDue: normalizeOptionalNumber(row.amount_due),
    issuedOn: row.issued_on || '',
    dueOn: row.due_on || '',
    uploadedAt: row.uploaded_at || null,
    publishedAt: row.published_at || null,
    voidedAt: row.voided_at || null,
    notes: row.notes || '',
    metadata: row.metadata_json || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    url,
  }
}

function buildMatterFinancialEntryViewModel(row = {}) {
  return {
    id: row.id || null,
    financialAccountId: row.financial_account_id || null,
    transactionId: row.transaction_id || null,
    financialDocumentId: row.financial_document_id || null,
    evidenceDocumentId: row.evidence_document_id || null,
    reversalOfEntryId: row.reversal_of_entry_id || null,
    entryType: row.entry_type || 'payment',
    entryStatus: row.entry_status || 'draft',
    entryVisibility: row.entry_visibility || 'internal',
    amount: normalizeOptionalNumber(row.amount) || 0,
    currencyCode: row.currency_code || 'ZAR',
    description: row.description || '',
    occurredOn: row.occurred_on || '',
    postedAt: row.posted_at || null,
    postedBy: row.posted_by || null,
    reversedAt: row.reversed_at || null,
    reversedBy: row.reversed_by || null,
    sourceType: row.source_type || null,
    sourceId: row.source_id || null,
    metadata: row.metadata_json || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function buildMatterFinancialAccountEventViewModel(row = {}) {
  return {
    id: row.id || null,
    financialAccountId: row.financial_account_id || null,
    transactionId: row.transaction_id || null,
    eventType: row.event_type || 'account_update',
    eventVisibility: row.event_visibility || 'internal',
    actorUserId: row.actor_user_id || null,
    actorRole: row.actor_role || null,
    payload: row.payload_json || {},
    createdAt: row.created_at || null,
  }
}

export function buildMatterFinancialDocumentRequestViewModel(row = {}) {
  return {
    id: row.id || null,
    financialAccountId: row.financial_account_id || row.financialAccountId || null,
    transactionId: row.transaction_id || row.transactionId || null,
    attorneyFirmId: row.attorney_firm_id || row.attorneyFirmId || null,
    requestedBy: row.requested_by || row.requestedBy || null,
    completedBy: row.completed_by || row.completedBy || null,
    linkedDocumentId: row.linked_document_id || row.linkedDocumentId || null,
    requestType: row.request_type || row.requestType || 'proof_of_payment',
    requestStatus: row.request_status || row.requestStatus || 'requested',
    audienceRole: row.audience_role || row.audienceRole || 'client',
    portalVisible: row.portal_visible ?? row.portalVisible ?? true,
    title: row.title || 'Finance document request',
    description: row.description || '',
    externalReference: row.external_reference || row.externalReference || '',
    currencyCode: row.currency_code || row.currencyCode || 'ZAR',
    amountDue: normalizeOptionalNumber(row.amount_due ?? row.amountDue),
    dueOn: row.due_on || row.dueOn || '',
    requestedAt: row.requested_at || row.requestedAt || null,
    submittedAt: row.submitted_at || row.submittedAt || null,
    reviewedAt: row.reviewed_at || row.reviewedAt || null,
    completedAt: row.completed_at || row.completedAt || null,
    reviewNotes: row.review_notes || row.reviewNotes || '',
    metadata: row.metadata_json || row.metadata || {},
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

function normalizeMatterFinancialPaymentInstructions(
  source = {},
  { published = false, actorUserId = null, updatedAt = null } = {},
) {
  const input = source && typeof source === 'object' ? source : {}
  return {
    published: published === true || input.published === true,
    accountHolder: normalizeNullableText(input.accountHolder ?? input.account_holder),
    bankName: normalizeNullableText(input.bankName ?? input.bank_name),
    accountNumber: normalizeNullableText(input.accountNumber ?? input.account_number),
    branchCode: normalizeNullableText(input.branchCode ?? input.branch_code),
    accountType: normalizeNullableText(input.accountType ?? input.account_type),
    paymentReference: normalizeNullableText(input.paymentReference ?? input.payment_reference),
    instructions: normalizeNullableText(input.instructions ?? input.paymentInstructions ?? input.payment_instructions),
    updatedAt: updatedAt || input.updatedAt || input.updated_at || null,
    updatedBy: actorUserId || input.updatedBy || input.updated_by || null,
  }
}

function buildMatterFinancialPaymentInstructionsViewModel(metadata = {}) {
  return normalizeMatterFinancialPaymentInstructions(
    metadata?.paymentInstructions || metadata?.payment_instructions || {},
  )
}

function buildMatterFinancialAccountViewModel(
  row = {},
  { balance = null, documents = [], entries = [], events = [], requests = [] } = {},
) {
  const normalizedBalance =
    balance ||
    buildMatterFinancialBalanceViewModel({
      financial_account_id: row.id,
      transaction_id: row.transaction_id,
      opening_balance: row.opening_balance,
    })
  const account = {
    id: row.id || null,
    transactionId: row.transaction_id || null,
    attorneyFirmId: row.attorney_firm_id || null,
    attorneyAssignmentId: row.attorney_assignment_id || null,
    participantId: row.participant_id || null,
    partyRole: row.party_role || 'client',
    partyRef: row.party_ref || 'primary',
    partyLabel: row.party_label || '',
    partyEmail: row.party_email || '',
    partyPhone: row.party_phone || '',
    currencyCode: row.currency_code || 'ZAR',
    status: row.status || 'active',
    openingBalance: normalizeOptionalNumber(row.opening_balance) || 0,
    portalEnabled: row.portal_enabled === true,
    notes: row.notes || '',
    metadata: row.metadata_json || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    balance: normalizedBalance,
    requests,
    documents,
    entries,
    events,
    paymentInstructions: buildMatterFinancialPaymentInstructionsViewModel(row.metadata_json || {}),
  }
  return {
    ...account,
    readiness: evaluateMatterFinancialAccountReadiness(account),
  }
}

function summarizeMatterFinancialAccounts(accounts = []) {
  const readinessSummary = summarizeMatterFinancialAccountReadiness(accounts)
  const reviewQueueSummary = summarizeMatterFinancialReviewQueue(buildMatterFinancialReviewQueue(accounts))
  const followUpSummary = summarizeMatterFinancialSubmissionFollowUps(buildMatterFinancialSubmissionFollowUps(accounts))
  const submissionPackSummary = summarizeMatterFinancialSubmissionPack(accounts)
  return accounts.reduce(
    (summary, account) => {
      summary.balanceDue += account.balance?.balanceDue || 0
      summary.totalCharged += account.balance?.totalCharged || 0
      summary.totalCredited += account.balance?.totalCredited || 0
      summary.documentCount += account.documents.length
      summary.draftDocuments += account.documents.filter((document) => document.documentStatus === 'draft').length
      summary.publishedDocuments += account.documents.filter(
        (document) => document.documentStatus === 'published',
      ).length
      summary.postedEntries += account.entries.filter((entry) => entry.entryStatus === 'posted').length
      summary.eventCount += account.events.length
      summary.requestCount += account.requests.length
      summary.openRequests += account.requests.filter((request) =>
        ['requested', 'submitted', 'awaiting_review', 'rejected'].includes(request.requestStatus),
      ).length
      summary.requestsAwaitingReview += account.requests.filter((request) =>
        ['submitted', 'awaiting_review'].includes(request.requestStatus),
      ).length
      summary.overdueRequests += account.requests.filter((request) => {
        if (!['requested', 'rejected'].includes(request.requestStatus) || !request.dueOn) return false
        const dueDate = new Date(request.dueOn)
        if (Number.isNaN(dueDate.getTime())) return false
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return dueDate < today
      }).length
      return summary
    },
    {
      balanceDue: 0,
      totalCharged: 0,
      totalCredited: 0,
      documentCount: 0,
      draftDocuments: 0,
      publishedDocuments: 0,
      postedEntries: 0,
      eventCount: 0,
      requestCount: 0,
      openRequests: 0,
      requestsAwaitingReview: 0,
      overdueRequests: 0,
      readyAccounts: readinessSummary.readyAccounts,
      accountsNeedingAttention: readinessSummary.accountsNeedingAttention,
      blockedAccounts: readinessSummary.blockedAccounts,
      proofsNeedingReview: readinessSummary.proofsNeedingReview,
      draftDocumentCount: readinessSummary.draftDocumentCount,
      reviewQueueItems: reviewQueueSummary.total,
      reviewQueueAttorneyAction: reviewQueueSummary.attorneyAction,
      reviewQueueClientAction: reviewQueueSummary.clientAction,
      reviewQueueProofReviews: reviewQueueSummary.proofReviews,
      reviewQueueRequestReviews: reviewQueueSummary.requestReviews,
      followUpItems: followUpSummary.total,
      followUpOverdue: followUpSummary.overdue,
      followUpDueSoon: followUpSummary.dueSoon,
      followUpResubmissions: followUpSummary.resubmissions,
      followUpPortalPaused: followUpSummary.portalPaused,
      submissionPackDocuments: submissionPackSummary.documentCount,
      submissionPackRequests: submissionPackSummary.requestCount,
      submissionPackEntries: submissionPackSummary.postedEntries,
    },
  )
}

export async function insertMatterFinancialAccountEventIfPossible(client, payload = {}) {
  if (!payload.transactionId || !payload.financialAccountId || !payload.eventType) {
    return null
  }

  try {
    const actorProfile = payload.actorProfile || (await resolveActiveProfileContext(client))
    const { data, error } = await client
      .from('matter_financial_account_events')
      .insert({
        financial_account_id: payload.financialAccountId,
        transaction_id: payload.transactionId,
        event_type: String(payload.eventType || '').trim(),
        event_visibility: payload.eventVisibility || 'internal',
        actor_user_id: actorProfile.userId || null,
        actor_role: actorProfile.role || null,
        payload_json: payload.payload && typeof payload.payload === 'object' ? payload.payload : {},
      })
      .select('id')
      .maybeSingle()

    if (error && !isMissingTableError(error, 'matter_financial_account_events')) {
      console.warn('[api] matter financial event insert failed', error)
    }
    return data || null
  } catch (eventError) {
    console.warn('[api] matter financial event unavailable', eventError)
    return null
  }
}

export async function fetchMatterFinancialAccountForMutation(client, accountId, transactionId = null) {
  const normalizedAccountId = normalizeNullableText(accountId)
  if (!normalizedAccountId) {
    throw new Error('Choose a buyer or seller account.')
  }

  let query = client
    .from('matter_financial_accounts')
    .select(
      'id, transaction_id, attorney_firm_id, attorney_assignment_id, participant_id, party_role, party_ref, party_label, party_email, party_phone, currency_code, status, opening_balance, portal_enabled, notes, metadata_json, created_at, updated_at',
    )
    .eq('id', normalizedAccountId)

  if (transactionId) {
    query = query.eq('transaction_id', transactionId)
  }

  const { data, error } = await query.maybeSingle()
  if (error) {
    if (isMissingTableError(error, 'matter_financial_accounts')) {
      throw new Error(
        'Matter financial accounts are not set up yet. Apply the attorney accounting Phase 1 migrations first.',
      )
    }
    throw error
  }

  if (!data?.id) {
    throw new Error('The selected matter financial account could not be found.')
  }

  return data
}

export async function fetchMatterFinancialAccounts(transactionId) {
  const client = requireClient()
  const normalizedTransactionId = normalizeNullableText(transactionId)
  if (!normalizedTransactionId) {
    throw new Error('Transaction is required.')
  }

  const accountQuery = await client
    .from('matter_financial_accounts')
    .select(
      'id, transaction_id, attorney_firm_id, attorney_assignment_id, participant_id, party_role, party_ref, party_label, party_email, party_phone, currency_code, status, opening_balance, portal_enabled, notes, metadata_json, created_at, updated_at',
    )
    .eq('transaction_id', normalizedTransactionId)
    .order('party_role', { ascending: true })
    .order('created_at', { ascending: true })

  if (accountQuery.error) {
    if (isMissingTableError(accountQuery.error, 'matter_financial_accounts')) {
      return {
        accounts: [],
        summary: summarizeMatterFinancialAccounts([]),
        reviewQueue: [],
        reviewQueueSummary: summarizeMatterFinancialReviewQueue([]),
        followUps: [],
        followUpSummary: summarizeMatterFinancialSubmissionFollowUps([]),
        submissionPackSummary: summarizeMatterFinancialSubmissionPack([]),
        unavailable: true,
        message:
          'Matter financial accounts are not set up yet. Apply the attorney accounting Phase 1 migrations first.',
      }
    }
    throw accountQuery.error
  }

  const accountRows = accountQuery.data || []
  const accountIds = accountRows.map((account) => account.id).filter(Boolean)
  if (!accountIds.length) {
    return {
      accounts: [],
      summary: summarizeMatterFinancialAccounts([]),
      reviewQueue: [],
      reviewQueueSummary: summarizeMatterFinancialReviewQueue([]),
      followUps: [],
      followUpSummary: summarizeMatterFinancialSubmissionFollowUps([]),
      submissionPackSummary: summarizeMatterFinancialSubmissionPack([]),
      unavailable: false,
      message: 'No buyer/seller financial accounts have been bootstrapped yet.',
    }
  }

  const [balancesQuery, documentsQuery, entriesQuery, eventsQuery, requestsQuery] = await Promise.all([
    client.from('matter_financial_account_balances').select('*').in('financial_account_id', accountIds),
    client
      .from('matter_financial_documents')
      .select(
        'id, financial_account_id, transaction_id, attorney_firm_id, source_document_id, uploaded_by, published_by, supersedes_document_id, document_type, document_status, audience_role, external_reference, title, storage_bucket, storage_path, file_name, mime_type, file_size_bytes, currency_code, amount_total, amount_due, issued_on, due_on, uploaded_at, published_at, voided_at, notes, metadata_json, created_at, updated_at',
      )
      .in('financial_account_id', accountIds)
      .order('created_at', { ascending: false }),
    client
      .from('matter_financial_entries')
      .select(
        'id, financial_account_id, transaction_id, financial_document_id, evidence_document_id, reversal_of_entry_id, entry_type, entry_status, entry_visibility, amount, currency_code, description, occurred_on, posted_at, posted_by, reversed_at, reversed_by, source_type, source_id, metadata_json, created_at, updated_at',
      )
      .in('financial_account_id', accountIds)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false }),
    client
      .from('matter_financial_account_events')
      .select(
        'id, financial_account_id, transaction_id, event_type, event_visibility, actor_user_id, actor_role, payload_json, created_at',
      )
      .in('financial_account_id', accountIds)
      .order('created_at', { ascending: false }),
    client
      .from('matter_financial_document_requests')
      .select(
        'id, financial_account_id, transaction_id, attorney_firm_id, requested_by, completed_by, linked_document_id, request_type, request_status, audience_role, portal_visible, title, description, external_reference, currency_code, amount_due, due_on, requested_at, submitted_at, reviewed_at, completed_at, review_notes, metadata_json, created_at, updated_at',
      )
      .in('financial_account_id', accountIds)
      .order('due_on', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false }),
  ])

  if (balancesQuery.error && !isMissingTableError(balancesQuery.error, 'matter_financial_account_balances')) {
    throw balancesQuery.error
  }
  if (documentsQuery.error) {
    if (isMissingTableError(documentsQuery.error, 'matter_financial_documents')) {
      throw new Error(
        'Matter financial documents are not set up yet. Apply the attorney accounting Phase 1 migrations first.',
      )
    }
    throw documentsQuery.error
  }
  if (entriesQuery.error) {
    if (isMissingTableError(entriesQuery.error, 'matter_financial_entries')) {
      throw new Error(
        'Matter financial entries are not set up yet. Apply the attorney accounting Phase 1 migrations first.',
      )
    }
    throw entriesQuery.error
  }
  if (eventsQuery.error && !isMissingTableError(eventsQuery.error, 'matter_financial_account_events')) {
    throw eventsQuery.error
  }
  if (requestsQuery.error && !isMissingTableError(requestsQuery.error, 'matter_financial_document_requests')) {
    throw requestsQuery.error
  }

  const balancesByAccountId = new Map(
    (balancesQuery.data || []).map((row) => [row.financial_account_id, buildMatterFinancialBalanceViewModel(row)]),
  )
  const documentsByAccountId = new Map()
  const entriesByAccountId = new Map()
  const eventsByAccountId = new Map()
  const requestsByAccountId = new Map()

  const documents = await Promise.all(
    (documentsQuery.data || []).map(async (row) =>
      buildMatterFinancialDocumentViewModel(row, row.storage_path ? await getSignedUrl(row.storage_path) : null),
    ),
  )
  for (const document of documents) {
    if (!documentsByAccountId.has(document.financialAccountId))
      documentsByAccountId.set(document.financialAccountId, [])
    documentsByAccountId.get(document.financialAccountId).push(document)
  }

  for (const row of entriesQuery.data || []) {
    const entry = buildMatterFinancialEntryViewModel(row)
    if (!entriesByAccountId.has(entry.financialAccountId)) entriesByAccountId.set(entry.financialAccountId, [])
    entriesByAccountId.get(entry.financialAccountId).push(entry)
  }

  for (const row of eventsQuery.data || []) {
    const event = buildMatterFinancialAccountEventViewModel(row)
    if (!eventsByAccountId.has(event.financialAccountId)) eventsByAccountId.set(event.financialAccountId, [])
    eventsByAccountId.get(event.financialAccountId).push(event)
  }

  for (const row of requestsQuery.data || []) {
    const request = buildMatterFinancialDocumentRequestViewModel(row)
    if (!requestsByAccountId.has(request.financialAccountId)) requestsByAccountId.set(request.financialAccountId, [])
    requestsByAccountId.get(request.financialAccountId).push(request)
  }

  const accounts = accountRows.map((account) =>
    buildMatterFinancialAccountViewModel(account, {
      balance: balancesByAccountId.get(account.id) || null,
      documents: documentsByAccountId.get(account.id) || [],
      entries: entriesByAccountId.get(account.id) || [],
      events: eventsByAccountId.get(account.id) || [],
      requests: requestsByAccountId.get(account.id) || [],
    }),
  )

  const reviewQueue = buildMatterFinancialReviewQueue(accounts)
  const followUps = buildMatterFinancialSubmissionFollowUps(accounts)

  return {
    accounts,
    summary: summarizeMatterFinancialAccounts(accounts),
    reviewQueue,
    reviewQueueSummary: summarizeMatterFinancialReviewQueue(reviewQueue),
    followUps,
    followUpSummary: summarizeMatterFinancialSubmissionFollowUps(followUps),
    submissionPackSummary: summarizeMatterFinancialSubmissionPack(accounts, { reviewQueue, followUps }),
    unavailable: false,
    message: '',
  }
}

export async function registerMatterFinancialDocument({
  accountId,
  transactionId,
  file,
  documentType = 'invoice',
  audienceRole,
  title,
  externalReference,
  amountTotal,
  amountDue,
  issuedOn,
  dueOn,
  notes,
  publishNow = false,
  supersedesDocumentId = null,
} = {}) {
  const client = requireClient()
  if (!file) {
    throw new Error('Select an invoice, statement, or proof document to upload.')
  }

  const filePolicy = validateDocumentUploadFile(file, { surface: 'matter_financial_document' })
  const account = await fetchMatterFinancialAccountForMutation(client, accountId, transactionId)
  const actorProfile = await resolveActiveProfileContext(client)
  const safeName = filePolicy.safeName
  return runRecoverableDocumentUpload({ client, scope: ['matter_financial_document', account.id, account.transaction_id, documentType, audienceRole, title, externalReference, amountTotal, amountDue, issuedOn, dueOn, notes, publishNow, supersedesDocumentId], file, storageBuckets: DOCUMENTS_BUCKET_CANDIDATES,
    toSavedReceipt: result => buildMatterFinancialDocumentViewModel(result.data, null),
    run: async attempt => {
      const filePath = attempt.path(`matter-financial-documents/${account.transaction_id}/${account.id}/${crypto.randomUUID()}-${safeName}`)
      const storageBucket = await attempt.upload(() => uploadToDocumentsBucket(client, filePath, file, {
        upsert: false,
        contentType: filePolicy.mimeType,
      }))

      const normalizedDocumentType = normalizeMatterFinancialDocumentType(documentType)
      const normalizedAudienceRole = normalizeMatterFinancialAudienceRole(audienceRole, account.party_role || 'internal')
      const normalizedStatus = publishNow ? 'published' : 'draft'
      const now = new Date().toISOString()
      const payload = {
        financial_account_id: account.id,
        transaction_id: account.transaction_id,
        attorney_firm_id: account.attorney_firm_id || null,
        uploaded_by: actorProfile.userId || null,
        published_by: publishNow ? actorProfile.userId || null : null,
        supersedes_document_id: normalizeNullableText(supersedesDocumentId),
        document_type: normalizedDocumentType,
        document_status: normalizedStatus,
        audience_role: normalizedAudienceRole,
        external_reference: normalizeNullableText(externalReference),
        title: normalizeNullableText(title) || safeName,
        storage_bucket: storageBucket || null,
        storage_path: filePath,
        file_name: safeName,
        mime_type: filePolicy.mimeType,
        file_size_bytes: normalizeOptionalNumber(file.size),
        currency_code: normalizeMatterFinancialCurrencyCode(account.currency_code),
        amount_total: normalizeOptionalNumber(amountTotal),
        amount_due: normalizeOptionalNumber(amountDue),
        issued_on: normalizeOptionalDate(issuedOn),
        due_on: normalizeOptionalDate(dueOn),
        published_at: publishNow ? now : null,
        notes: normalizeNullableText(notes),
        metadata_json: {
          source: 'attorney_matter_accounts_panel',
          protocol: 'external_document_upload',
        },
      }

      const { data } = await attempt.persist({
        save: async () => {
          const { data, error } = await client
            .from('matter_financial_documents')
            .insert(payload)
            .select(
              'id, financial_account_id, transaction_id, attorney_firm_id, source_document_id, uploaded_by, published_by, supersedes_document_id, document_type, document_status, audience_role, external_reference, title, storage_bucket, storage_path, file_name, mime_type, file_size_bytes, currency_code, amount_total, amount_due, issued_on, due_on, uploaded_at, published_at, voided_at, notes, metadata_json, created_at, updated_at',
            )
            .single()

          if (error) {
            if (isMissingTableError(error, 'matter_financial_documents')) {
              throw new Error(
                'Matter financial documents are not set up yet. Apply the attorney accounting Phase 1 migrations first.',
              )
            }
            throw error
          }

          return { data }
        },
        read: () => readSavedUploadByPath(client, { table: 'matter_financial_documents', column: 'storage_path', path: filePath, filters: { financial_account_id: account.id, transaction_id: account.transaction_id } }),
        cleanup: () => removeUploadedDocumentObject(client, storageBucket, filePath),
      })

      if (payload.supersedes_document_id) {
        const supersedeResult = await client
          .from('matter_financial_documents')
          .update({
            document_status: 'superseded',
            updated_at: now,
          })
          .eq('id', payload.supersedes_document_id)
          .eq('financial_account_id', account.id)
        if (supersedeResult.error && !isMissingTableError(supersedeResult.error, 'matter_financial_documents')) {
          throw supersedeResult.error
        }
      }

      await insertMatterFinancialAccountEventIfPossible(client, {
        financialAccountId: account.id,
        transactionId: account.transaction_id,
        eventType: publishNow ? 'financial_document_uploaded_and_published' : 'financial_document_uploaded_as_draft',
        actorProfile,
        payload: {
          documentId: data.id,
          documentType: normalizedDocumentType,
          audienceRole: normalizedAudienceRole,
          title: payload.title,
          amountTotal: payload.amount_total,
          amountDue: payload.amount_due,
        },
      })

      return buildMatterFinancialDocumentViewModel(data, data.storage_path ? await getSignedUrl(data.storage_path) : null)
    },
  })
}

export async function publishMatterFinancialDocument(documentId) {
  const client = requireClient()
  const normalizedDocumentId = normalizeNullableText(documentId)
  if (!normalizedDocumentId) {
    throw new Error('Choose a document to publish.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  const now = new Date().toISOString()
  const { data, error } = await client
    .from('matter_financial_documents')
    .update({
      document_status: 'published',
      published_at: now,
      published_by: actorProfile.userId || null,
      updated_at: now,
    })
    .eq('id', normalizedDocumentId)
    .select(
      'id, financial_account_id, transaction_id, attorney_firm_id, source_document_id, uploaded_by, published_by, supersedes_document_id, document_type, document_status, audience_role, external_reference, title, storage_bucket, storage_path, file_name, mime_type, file_size_bytes, currency_code, amount_total, amount_due, issued_on, due_on, uploaded_at, published_at, voided_at, notes, metadata_json, created_at, updated_at',
    )
    .single()

  if (error) {
    if (isMissingTableError(error, 'matter_financial_documents')) {
      throw new Error(
        'Matter financial documents are not set up yet. Apply the attorney accounting Phase 1 migrations first.',
      )
    }
    throw error
  }

  await insertMatterFinancialAccountEventIfPossible(client, {
    financialAccountId: data.financial_account_id,
    transactionId: data.transaction_id,
    eventType: 'financial_document_published',
    eventVisibility: data.audience_role === 'internal' ? 'internal' : 'client_visible',
    actorProfile,
    payload: {
      documentId: data.id,
      documentType: data.document_type,
      audienceRole: data.audience_role,
      title: data.title,
    },
  })

  return buildMatterFinancialDocumentViewModel(data, data.storage_path ? await getSignedUrl(data.storage_path) : null)
}

export async function recordMatterFinancialEntry({
  accountId,
  transactionId,
  financialDocumentId = null,
  entryType = 'payment',
  amount,
  description,
  occurredOn,
  entryVisibility = 'internal',
} = {}) {
  const client = requireClient()
  const account = await fetchMatterFinancialAccountForMutation(client, accountId, transactionId)
  const actorProfile = await resolveActiveProfileContext(client)
  const normalizedEntryType = normalizeMatterFinancialEntryType(entryType)
  const normalizedAmount = normalizeMatterFinancialEntryAmount(normalizedEntryType, amount)
  const normalizedDescription = normalizeNullableText(description)
  if (!normalizedDescription) {
    throw new Error('Add a short description for this account entry.')
  }

  const now = new Date().toISOString()
  const payload = {
    financial_account_id: account.id,
    transaction_id: account.transaction_id,
    financial_document_id: normalizeNullableText(financialDocumentId),
    entry_type: normalizedEntryType,
    entry_status: 'posted',
    entry_visibility: entryVisibility === 'client_visible' ? 'client_visible' : 'internal',
    amount: normalizedAmount,
    currency_code: normalizeMatterFinancialCurrencyCode(account.currency_code),
    description: normalizedDescription,
    occurred_on: normalizeOptionalDate(occurredOn) || now.slice(0, 10),
    posted_at: now,
    posted_by: actorProfile.userId || null,
    source_type: 'manual',
    metadata_json: {
      source: 'attorney_matter_accounts_panel',
      protocol: 'manual_operational_ledger_entry',
    },
  }

  const { data, error } = await client
    .from('matter_financial_entries')
    .insert(payload)
    .select(
      'id, financial_account_id, transaction_id, financial_document_id, evidence_document_id, reversal_of_entry_id, entry_type, entry_status, entry_visibility, amount, currency_code, description, occurred_on, posted_at, posted_by, reversed_at, reversed_by, source_type, source_id, metadata_json, created_at, updated_at',
    )
    .single()

  if (error) {
    if (isMissingTableError(error, 'matter_financial_entries')) {
      throw new Error(
        'Matter financial entries are not set up yet. Apply the attorney accounting Phase 1 migrations first.',
      )
    }
    throw error
  }

  await insertMatterFinancialAccountEventIfPossible(client, {
    financialAccountId: account.id,
    transactionId: account.transaction_id,
    eventType: 'financial_entry_posted',
    eventVisibility: payload.entry_visibility,
    actorProfile,
    payload: {
      entryId: data.id,
      entryType: normalizedEntryType,
      amount: normalizedAmount,
      description: normalizedDescription,
    },
  })

  return buildMatterFinancialEntryViewModel(data)
}

export async function reconcileMatterFinancialProofDocument({
  documentId,
  accountId,
  transactionId,
  amount,
  occurredOn,
  description,
  reviewNotes,
} = {}) {
  const client = requireClient()
  const normalizedDocumentId = normalizeNullableText(documentId)
  if (!normalizedDocumentId) {
    throw new Error('Choose the proof of payment to reconcile.')
  }

  let documentQuery = client
    .from('matter_financial_documents')
    .select(
      'id, financial_account_id, transaction_id, attorney_firm_id, source_document_id, uploaded_by, published_by, supersedes_document_id, document_type, document_status, audience_role, external_reference, title, storage_bucket, storage_path, file_name, mime_type, file_size_bytes, currency_code, amount_total, amount_due, issued_on, due_on, uploaded_at, published_at, voided_at, notes, metadata_json, created_at, updated_at',
    )
    .eq('id', normalizedDocumentId)

  if (accountId) {
    documentQuery = documentQuery.eq('financial_account_id', accountId)
  }
  if (transactionId) {
    documentQuery = documentQuery.eq('transaction_id', transactionId)
  }

  const documentResult = await documentQuery.maybeSingle()
  if (documentResult.error) {
    if (isMissingTableError(documentResult.error, 'matter_financial_documents')) {
      throw new Error(
        'Matter financial documents are not set up yet. Apply the attorney accounting Phase 1 migrations first.',
      )
    }
    throw documentResult.error
  }

  const document = documentResult.data
  if (!document?.id) {
    throw new Error('The selected proof of payment could not be found.')
  }
  if (document.document_type !== 'proof_of_payment') {
    throw new Error('Only proof-of-payment documents can be reconciled from this action.')
  }

  const account = await fetchMatterFinancialAccountForMutation(
    client,
    document.financial_account_id,
    transactionId || document.transaction_id,
  )
  const existingEntry = await client
    .from('matter_financial_entries')
    .select('id, entry_status')
    .eq('financial_document_id', document.id)
    .eq('source_type', 'client_payment_proof')
    .eq('entry_status', 'posted')
    .maybeSingle()

  if (existingEntry.error) {
    if (isMissingTableError(existingEntry.error, 'matter_financial_entries')) {
      throw new Error(
        'Matter financial entries are not set up yet. Apply the attorney accounting Phase 1 migrations first.',
      )
    }
    throw existingEntry.error
  }
  if (existingEntry.data?.id) {
    throw new Error('This proof of payment has already been posted to the ledger.')
  }

  const submittedAmount = normalizeOptionalNumber(amount)
  const normalizedAmount = normalizeMatterFinancialEntryAmount(
    'payment',
    submittedAmount || document.amount_total || document.amount_due,
  )
  const normalizedDescription =
    normalizeNullableText(description) ||
    `Payment received from ${String(account.party_role || 'client').replace(/_/g, ' ')} proof${document.external_reference ? ` ${document.external_reference}` : ''}`
  const actorProfile = await resolveActiveProfileContext(client)
  const now = new Date().toISOString()
  const payload = {
    financial_account_id: account.id,
    transaction_id: account.transaction_id,
    financial_document_id: document.id,
    entry_type: 'payment',
    entry_status: 'posted',
    entry_visibility: document.audience_role === 'internal' ? 'internal' : 'client_visible',
    amount: normalizedAmount,
    currency_code: normalizeMatterFinancialCurrencyCode(document.currency_code || account.currency_code),
    description: normalizedDescription,
    occurred_on: normalizeOptionalDate(occurredOn) || document.issued_on || now.slice(0, 10),
    posted_at: now,
    posted_by: actorProfile.userId || null,
    source_type: 'client_payment_proof',
    source_id: document.id,
    metadata_json: {
      source: 'attorney_matter_accounts_panel',
      protocol: 'client_payment_proof_reconciliation',
      proofDocumentId: document.id,
      proofUploadedBy: document.uploaded_by || null,
    },
  }

  const { data, error } = await client
    .from('matter_financial_entries')
    .insert(payload)
    .select(
      'id, financial_account_id, transaction_id, financial_document_id, evidence_document_id, reversal_of_entry_id, entry_type, entry_status, entry_visibility, amount, currency_code, description, occurred_on, posted_at, posted_by, reversed_at, reversed_by, source_type, source_id, metadata_json, created_at, updated_at',
    )
    .single()

  if (error) {
    if (isMissingTableError(error, 'matter_financial_entries')) {
      throw new Error(
        'Matter financial entries are not set up yet. Apply the attorney accounting Phase 1 migrations first.',
      )
    }
    if (error.code === '23505') {
      throw new Error('This proof of payment has already been posted to the ledger.')
    }
    throw error
  }

  const nextDocumentMetadata = {
    ...(document.metadata_json || {}),
    requiresAttorneyReview: false,
    reviewStatus: 'posted',
    reviewedAt: now,
    reviewedBy: actorProfile.userId || null,
    postedEntryId: data.id,
    reviewNotes: normalizeNullableText(reviewNotes),
  }
  const updateDocument = await client
    .from('matter_financial_documents')
    .update({
      metadata_json: nextDocumentMetadata,
      updated_at: now,
    })
    .eq('id', document.id)

  if (updateDocument.error && !isMissingTableError(updateDocument.error, 'matter_financial_documents')) {
    throw updateDocument.error
  }

  await insertMatterFinancialAccountEventIfPossible(client, {
    financialAccountId: account.id,
    transactionId: account.transaction_id,
    eventType: 'client_payment_proof_posted',
    eventVisibility: payload.entry_visibility,
    actorProfile,
    payload: {
      documentId: document.id,
      entryId: data.id,
      amount: normalizedAmount,
      description: normalizedDescription,
      occurredOn: payload.occurred_on,
    },
  })

  return buildMatterFinancialEntryViewModel(data)
}

export async function reverseMatterFinancialEntry(entryId, { reason } = {}) {
  const client = requireClient()
  const normalizedEntryId = normalizeNullableText(entryId)
  if (!normalizedEntryId) {
    throw new Error('Choose an entry to reverse.')
  }

  const existingQuery = await client
    .from('matter_financial_entries')
    .select(
      'id, financial_account_id, transaction_id, financial_document_id, evidence_document_id, reversal_of_entry_id, entry_type, entry_status, entry_visibility, amount, currency_code, description, occurred_on, posted_at, posted_by, reversed_at, reversed_by, source_type, source_id, metadata_json, created_at, updated_at',
    )
    .eq('id', normalizedEntryId)
    .maybeSingle()

  if (existingQuery.error) {
    if (isMissingTableError(existingQuery.error, 'matter_financial_entries')) {
      throw new Error(
        'Matter financial entries are not set up yet. Apply the attorney accounting Phase 1 migrations first.',
      )
    }
    throw existingQuery.error
  }
  if (!existingQuery.data?.id) {
    throw new Error('The selected entry could not be found.')
  }
  if (existingQuery.data.entry_status !== 'posted') {
    throw new Error('Only posted entries can be reversed.')
  }

  const actorProfile = await resolveActiveProfileContext(client)
  const now = new Date().toISOString()
  const { data, error } = await client
    .from('matter_financial_entries')
    .update({
      entry_status: 'reversed',
      reversed_at: now,
      reversed_by: actorProfile.userId || null,
      metadata_json: {
        ...(existingQuery.data.metadata_json || {}),
        reversalReason: normalizeNullableText(reason),
      },
      updated_at: now,
    })
    .eq('id', normalizedEntryId)
    .select(
      'id, financial_account_id, transaction_id, financial_document_id, evidence_document_id, reversal_of_entry_id, entry_type, entry_status, entry_visibility, amount, currency_code, description, occurred_on, posted_at, posted_by, reversed_at, reversed_by, source_type, source_id, metadata_json, created_at, updated_at',
    )
    .single()

  if (error) {
    throw error
  }

  await insertMatterFinancialAccountEventIfPossible(client, {
    financialAccountId: data.financial_account_id,
    transactionId: data.transaction_id,
    eventType: 'financial_entry_reversed',
    eventVisibility: data.entry_visibility,
    actorProfile,
    payload: {
      entryId: data.id,
      entryType: data.entry_type,
      amount: data.amount,
      reason: normalizeNullableText(reason),
    },
  })

  return buildMatterFinancialEntryViewModel(data)
}

export async function updateMatterFinancialAccountPortal({ accountId, transactionId, portalEnabled } = {}) {
  const client = requireClient()
  const account = await fetchMatterFinancialAccountForMutation(client, accountId, transactionId)
  const actorProfile = await resolveActiveProfileContext(client)
  const { data, error } = await client
    .from('matter_financial_accounts')
    .update({
      portal_enabled: portalEnabled === true,
      updated_by: actorProfile.userId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', account.id)
    .select(
      'id, transaction_id, attorney_firm_id, attorney_assignment_id, participant_id, party_role, party_ref, party_label, party_email, party_phone, currency_code, status, opening_balance, portal_enabled, notes, metadata_json, created_at, updated_at',
    )
    .single()

  if (error) {
    if (isMissingTableError(error, 'matter_financial_accounts')) {
      throw new Error(
        'Matter financial accounts are not set up yet. Apply the attorney accounting Phase 1 migrations first.',
      )
    }
    throw error
  }

  await insertMatterFinancialAccountEventIfPossible(client, {
    financialAccountId: account.id,
    transactionId: account.transaction_id,
    eventType: portalEnabled ? 'financial_account_portal_enabled' : 'financial_account_portal_disabled',
    eventVisibility: 'internal',
    actorProfile,
    payload: {
      portalEnabled: portalEnabled === true,
    },
  })

  return buildMatterFinancialAccountViewModel(data)
}

export async function updateMatterFinancialAccountPaymentInstructions({
  accountId,
  transactionId,
  paymentInstructions = {},
  publishToPortal = false,
} = {}) {
  const client = requireClient()
  const account = await fetchMatterFinancialAccountForMutation(client, accountId, transactionId)
  const actorProfile = await resolveActiveProfileContext(client)
  const now = new Date().toISOString()
  const normalizedInstructions = normalizeMatterFinancialPaymentInstructions(paymentInstructions, {
    published: publishToPortal === true,
    actorUserId: actorProfile.userId || null,
    updatedAt: now,
  })

  if (normalizedInstructions.published) {
    if (
      !normalizedInstructions.accountHolder ||
      !normalizedInstructions.bankName ||
      !normalizedInstructions.accountNumber
    ) {
      throw new Error('Add the account holder, bank name, and account number before publishing payment instructions.')
    }
  }

  const nextMetadata = {
    ...(account.metadata_json || {}),
    paymentInstructions: normalizedInstructions,
  }

  const { data, error } = await client
    .from('matter_financial_accounts')
    .update({
      metadata_json: nextMetadata,
      updated_by: actorProfile.userId || null,
      updated_at: now,
    })
    .eq('id', account.id)
    .select(
      'id, transaction_id, attorney_firm_id, attorney_assignment_id, participant_id, party_role, party_ref, party_label, party_email, party_phone, currency_code, status, opening_balance, portal_enabled, notes, metadata_json, created_at, updated_at',
    )
    .single()

  if (error) {
    if (isMissingTableError(error, 'matter_financial_accounts')) {
      throw new Error(
        'Matter financial accounts are not set up yet. Apply the attorney accounting Phase 1 migrations first.',
      )
    }
    throw error
  }

  await insertMatterFinancialAccountEventIfPossible(client, {
    financialAccountId: account.id,
    transactionId: account.transaction_id,
    eventType: normalizedInstructions.published ? 'payment_instructions_published' : 'payment_instructions_saved',
    eventVisibility: normalizedInstructions.published ? 'client_visible' : 'internal',
    actorProfile,
    payload: {
      paymentReference: normalizedInstructions.paymentReference,
      hasBankDetails: Boolean(
        normalizedInstructions.accountHolder && normalizedInstructions.bankName && normalizedInstructions.accountNumber,
      ),
      published: normalizedInstructions.published,
    },
  })

  return buildMatterFinancialAccountViewModel(data)
}

function buildClientPortalMatterFinancialDocumentViewModel(document = {}) {
  return {
    id: document.id || null,
    documentType: document.documentType || document.document_type || 'other',
    documentStatus: document.documentStatus || document.document_status || 'published',
    audienceRole: document.audienceRole || document.audience_role || 'client',
    externalReference: document.externalReference || document.external_reference || '',
    title: document.title || document.fileName || document.file_name || 'Financial document',
    storageBucket: document.storageBucket || document.storage_bucket || null,
    storagePath: document.storagePath || document.storage_path || null,
    fileName: document.fileName || document.file_name || '',
    mimeType: document.mimeType || document.mime_type || '',
    fileSizeBytes: normalizeOptionalNumber(document.fileSizeBytes ?? document.file_size_bytes),
    currencyCode: document.currencyCode || document.currency_code || 'ZAR',
    amountTotal: normalizeOptionalNumber(document.amountTotal ?? document.amount_total),
    amountDue: normalizeOptionalNumber(document.amountDue ?? document.amount_due),
    issuedOn: document.issuedOn || document.issued_on || '',
    dueOn: document.dueOn || document.due_on || '',
    publishedAt: document.publishedAt || document.published_at || null,
    notes: document.notes || '',
    url: document.url || null,
  }
}

function buildClientPortalMatterFinancialEntryViewModel(entry = {}) {
  return {
    id: entry.id || null,
    financialDocumentId: entry.financialDocumentId || entry.financial_document_id || null,
    entryType: entry.entryType || entry.entry_type || 'payment',
    entryStatus: entry.entryStatus || entry.entry_status || 'posted',
    entryVisibility: entry.entryVisibility || entry.entry_visibility || 'client_visible',
    amount: normalizeOptionalNumber(entry.amount) || 0,
    currencyCode: entry.currencyCode || entry.currency_code || 'ZAR',
    description: entry.description || '',
    occurredOn: entry.occurredOn || entry.occurred_on || '',
    postedAt: entry.postedAt || entry.posted_at || null,
  }
}

function buildClientPortalMatterFinancialEventViewModel(event = {}) {
  return {
    id: event.id || null,
    eventType: event.eventType || event.event_type || 'account_update',
    eventVisibility: event.eventVisibility || event.event_visibility || 'client_visible',
    actorRole: event.actorRole || event.actor_role || null,
    payload: event.payload || event.payload_json || {},
    createdAt: event.createdAt || event.created_at || null,
  }
}

function buildClientPortalMatterFinancialPaymentInstructionsViewModel(source = {}) {
  return normalizeMatterFinancialPaymentInstructions(source || {})
}

function buildClientPortalMatterFinancialRequestViewModel(request = {}) {
  return buildMatterFinancialDocumentRequestViewModel(request)
}

function buildClientPortalMatterFinancialAccountViewModel(account = {}) {
  const balance = account.balance && typeof account.balance === 'object' ? account.balance : {}
  return {
    id: account.id || null,
    transactionId: account.transactionId || account.transaction_id || null,
    partyRole: account.partyRole || account.party_role || 'client',
    partyRef: account.partyRef || account.party_ref || 'primary',
    partyLabel: account.partyLabel || account.party_label || '',
    partyEmail: account.partyEmail || account.party_email || '',
    currencyCode: account.currencyCode || account.currency_code || 'ZAR',
    status: account.status || 'active',
    portalEnabled: account.portalEnabled ?? account.portal_enabled ?? true,
    updatedAt: account.updatedAt || account.updated_at || null,
    balance: {
      openingBalance: normalizeOptionalNumber(balance.openingBalance ?? balance.opening_balance) || 0,
      postedEntryTotal: normalizeOptionalNumber(balance.postedEntryTotal ?? balance.posted_entry_total) || 0,
      balanceDue: normalizeOptionalNumber(balance.balanceDue ?? balance.balance_due) || 0,
      totalCharged: normalizeOptionalNumber(balance.totalCharged ?? balance.total_charged) || 0,
      totalCredited: normalizeOptionalNumber(balance.totalCredited ?? balance.total_credited) || 0,
      lastPostedAt: balance.lastPostedAt || balance.last_posted_at || null,
    },
    requests: (Array.isArray(account.requests) ? account.requests : []).map(
      buildClientPortalMatterFinancialRequestViewModel,
    ),
    documents: (Array.isArray(account.documents) ? account.documents : []).map(
      buildClientPortalMatterFinancialDocumentViewModel,
    ),
    entries: (Array.isArray(account.entries) ? account.entries : []).map(
      buildClientPortalMatterFinancialEntryViewModel,
    ),
    events: (Array.isArray(account.events) ? account.events : []).map(buildClientPortalMatterFinancialEventViewModel),
    paymentInstructions: buildClientPortalMatterFinancialPaymentInstructionsViewModel(
      account.paymentInstructions || account.payment_instructions || {},
    ),
  }
}

function summarizeClientPortalMatterFinancialAccounts(accounts = []) {
  return accounts.reduce(
    (summary, account) => {
      summary.balanceDue += account.balance?.balanceDue || 0
      summary.totalCharged += account.balance?.totalCharged || 0
      summary.totalCredited += account.balance?.totalCredited || 0
      summary.documentCount += account.documents.length
      summary.postedEntries += account.entries.length
      summary.eventCount += account.events.length
      summary.requestCount += account.requests.length
      summary.openRequests += account.requests.filter((request) =>
        ['requested', 'submitted', 'awaiting_review', 'rejected'].includes(request.requestStatus),
      ).length
      summary.overdueRequests += account.requests.filter((request) => {
        if (!['requested', 'rejected'].includes(request.requestStatus) || !request.dueOn) return false
        const dueDate = new Date(request.dueOn)
        if (Number.isNaN(dueDate.getTime())) return false
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return dueDate < today
      }).length
      return summary
    },
    {
      balanceDue: 0,
      totalCharged: 0,
      totalCredited: 0,
      documentCount: 0,
      postedEntries: 0,
      eventCount: 0,
      requestCount: 0,
      openRequests: 0,
      overdueRequests: 0,
    },
  )
}

export async function fetchClientPortalMatterFinancialAccounts({ token, workspace = 'buyer', sellerAccessToken = '' } = {}) {
  const normalizedToken = normalizeNullableText(token)
  if (!normalizedToken) {
    throw new Error('Client portal token is required.')
  }

  const client = requireClientPortalTokenClient(normalizedToken,sellerAccessToken)
  const rpc = await client.rpc('bridge_client_portal_matter_financial_accounts', {
    p_workspace: String(workspace || 'buyer')
      .trim()
      .toLowerCase(),
  })

  if (rpc.error) {
    if (isMissingRpcFunctionError(rpc.error, 'bridge_client_portal_matter_financial_accounts')) {
      return {
        accounts: [],
        summary: summarizeClientPortalMatterFinancialAccounts([]),
        workspace,
        unavailable: true,
        message: 'Matter account details are not available yet.',
      }
    }
    throw rpc.error
  }

  const payload = rpc.data && typeof rpc.data === 'object' ? rpc.data : {}
  const accounts = await Promise.all(
    (Array.isArray(payload.accounts) ? payload.accounts : []).map(async (account) => {
      const normalizedAccount = buildClientPortalMatterFinancialAccountViewModel(account)
      const documents = await Promise.all(
        normalizedAccount.documents.map(async (document) => ({
          ...document,
          url: document.storagePath
            ? await getSignedUrl(document.storagePath, {
                client,
                fileBucket: document.storageBucket || document.fileBucket || '',
              })
            : null,
        })),
      )
      return {
        ...normalizedAccount,
        documents,
      }
    }),
  )

  return {
    accounts,
    summary: {
      ...summarizeClientPortalMatterFinancialAccounts(accounts),
      ...(payload.summary && typeof payload.summary === 'object'
        ? {
            balanceDue:
              normalizeOptionalNumber(payload.summary.balanceDue ?? payload.summary.balance_due) ??
              summarizeClientPortalMatterFinancialAccounts(accounts).balanceDue,
            totalCharged:
              normalizeOptionalNumber(payload.summary.totalCharged ?? payload.summary.total_charged) ??
              summarizeClientPortalMatterFinancialAccounts(accounts).totalCharged,
            totalCredited:
              normalizeOptionalNumber(payload.summary.totalCredited ?? payload.summary.total_credited) ??
              summarizeClientPortalMatterFinancialAccounts(accounts).totalCredited,
            documentCount:
              normalizeOptionalNumber(payload.summary.documentCount ?? payload.summary.document_count) ??
              summarizeClientPortalMatterFinancialAccounts(accounts).documentCount,
            postedEntries:
              normalizeOptionalNumber(payload.summary.postedEntries ?? payload.summary.posted_entries) ??
              summarizeClientPortalMatterFinancialAccounts(accounts).postedEntries,
            eventCount: normalizeOptionalNumber(payload.summary.eventCount ?? payload.summary.event_count) ?? summarizeClientPortalMatterFinancialAccounts(accounts).eventCount,
            requestCount:
              normalizeOptionalNumber(payload.summary.requestCount ?? payload.summary.request_count) ??
              summarizeClientPortalMatterFinancialAccounts(accounts).requestCount,
            openRequests:
              normalizeOptionalNumber(payload.summary.openRequests ?? payload.summary.open_requests) ??
              summarizeClientPortalMatterFinancialAccounts(accounts).openRequests,
            overdueRequests:
              normalizeOptionalNumber(payload.summary.overdueRequests ?? payload.summary.overdue_requests) ??
              summarizeClientPortalMatterFinancialAccounts(accounts).overdueRequests,
          }
        : {}),
    },
    workspace: payload.workspace || workspace,
    unavailable: payload.unavailable === true,
    message: payload.message || '',
  }
}

export async function uploadClientPortalMatterFinancialProof({
  token,
  workspace = 'buyer',
  sellerAccessToken = '',
  accountId,
  file,
  amount = null,
  paidOn = null,
  reference = '',
  notes = '',
  requestId = null,
} = {}) {
  const normalizedToken = normalizeNullableText(token)
  const normalizedAccountId = normalizeNullableText(accountId)
  if (!normalizedToken) {
    throw new Error('Client portal token is required.')
  }
  if (!normalizedAccountId) {
    throw new Error('Choose the account this payment proof belongs to.')
  }
  if (!file) {
    throw new Error('Select a proof of payment file to upload.')
  }

  const filePolicy = validateDocumentUploadFile(file, { surface: 'client_financial_proof' })
  const client = requireClientPortalTokenClient(normalizedToken,sellerAccessToken)
  const safeName = filePolicy.safeName
  return runRecoverableDocumentUpload({ client, scope: ['uploadClientPortalMatterFinancialProof', normalizedToken, workspace, normalizedAccountId, requestId, amount, paidOn, reference, notes], file, storageBuckets: DOCUMENTS_BUCKET_CANDIDATES,
    toSavedReceipt: result => ({ document: buildClientPortalMatterFinancialDocumentViewModel(result.data.document), request: result.data.request || null, message: 'Document saved for attorney review.' }),
    run: async attempt => {
      const filePath = attempt.path(`matter-financial-proof/${String(workspace || 'buyer')
        .trim()
        .toLowerCase()}/${normalizedAccountId}/${crypto.randomUUID()}-${safeName}`)
      const storageBucket = await attempt.upload(() => uploadToDocumentsBucket(client, filePath, file, {
        upsert: false,
        contentType: filePolicy.mimeType,
      }))

      const rpc = await attempt.persist({
        save: async () => {
          const rpc = await client.rpc('bridge_client_portal_upload_matter_financial_proof', {
            p_workspace: String(workspace || 'buyer')
              .trim()
              .toLowerCase(),
            p_financial_account_id: normalizedAccountId,
            p_storage_bucket: storageBucket || null,
            p_storage_path: filePath,
            p_file_name: safeName,
            p_mime_type: filePolicy.mimeType,
            p_file_size_bytes: normalizeOptionalNumber(file.size),
            p_amount: normalizeOptionalNumber(amount),
            p_paid_on: normalizeOptionalDate(paidOn),
            p_reference: normalizeNullableText(reference),
            p_notes: normalizeNullableText(notes),
            p_request_id: normalizeNullableText(requestId),
          })

          if (rpc.error) {
            if (isMissingRpcFunctionError(rpc.error, 'bridge_client_portal_upload_matter_financial_proof')) {
              throw new Error(
                'Payment proof upload is not available yet. Please ask your legal team to enable matter account uploads.',
              )
            }
            throw rpc.error
          }

          return rpc
        },
        read: async () => {
          const reopened = await client.rpc('bridge_client_portal_matter_financial_accounts', { p_workspace: String(workspace || 'buyer').trim().toLowerCase() })
          if (reopened.error) throw reopened.error
          const account = reopened.data?.accounts?.find(row => row.id === normalizedAccountId)
          const document = account?.documents?.find(row => (row.storagePath || row.storage_path) === filePath)
          return document ? { data: { document, request: account.requests?.find(row => row.id === requestId) || null } } : null
        },
        cleanup: () => removeUploadedDocumentObject(client, storageBucket, filePath),
      })

      const payload = rpc.data && typeof rpc.data === 'object' ? rpc.data : {}
      const document = payload.document ? buildClientPortalMatterFinancialDocumentViewModel(payload.document) : null
      return {
        document: document
          ? {
              ...document,
              url: document.storagePath
                ? await getSignedUrl(document.storagePath, {
                    client,
                    fileBucket: document.storageBucket || document.fileBucket || storageBucket || '',
                  })
                : null,
            }
          : null,
        message: payload.message || 'Proof of payment uploaded for attorney review.',
      }
    },
  })
}

export async function uploadClientPortalMatterFinancialRequestDocument({
  token,
  workspace = 'buyer',
  sellerAccessToken = '',
  accountId,
  requestId,
  file,
  amount = null,
  documentDate = null,
  reference = '',
  notes = '',
} = {}) {
  const normalizedToken = normalizeNullableText(token)
  const normalizedAccountId = normalizeNullableText(accountId)
  const normalizedRequestId = normalizeNullableText(requestId)
  if (!normalizedToken) {
    throw new Error('Client portal token is required.')
  }
  if (!normalizedAccountId) {
    throw new Error('Choose the account this finance request belongs to.')
  }
  if (!normalizedRequestId) {
    throw new Error('Choose the finance request you are submitting against.')
  }
  if (!file) {
    throw new Error('Select the requested finance document to upload.')
  }

  const filePolicy = validateDocumentUploadFile(file, { surface: 'client_financial_request' })
  const client = requireClientPortalTokenClient(normalizedToken,sellerAccessToken)
  const safeName = filePolicy.safeName
  return runRecoverableDocumentUpload({ client, scope: ['uploadClientPortalMatterFinancialRequestDocument', normalizedToken, workspace, normalizedAccountId, normalizedRequestId, amount, documentDate, reference, notes], file, storageBuckets: DOCUMENTS_BUCKET_CANDIDATES,
    toSavedReceipt: result => ({ document: buildClientPortalMatterFinancialDocumentViewModel(result.data.document), request: result.data.request || null, message: 'Document saved for attorney review.' }),
    run: async attempt => {
      const filePath = attempt.path(`matter-financial-request-documents/${String(workspace || 'buyer')
        .trim()
        .toLowerCase()}/${normalizedAccountId}/${normalizedRequestId}/${crypto.randomUUID()}-${safeName}`)
      const storageBucket = await attempt.upload(() => uploadToDocumentsBucket(client, filePath, file, {
        upsert: false,
        contentType: filePolicy.mimeType,
      }))

      const rpc = await attempt.persist({
        save: async () => {
          const rpc = await client.rpc('bridge_client_portal_submit_matter_financial_request_document', {
            p_workspace: String(workspace || 'buyer')
              .trim()
              .toLowerCase(),
            p_financial_account_id: normalizedAccountId,
            p_request_id: normalizedRequestId,
            p_storage_bucket: storageBucket || null,
            p_storage_path: filePath,
            p_file_name: safeName,
            p_mime_type: filePolicy.mimeType,
            p_file_size_bytes: normalizeOptionalNumber(file.size),
            p_amount: normalizeOptionalNumber(amount),
            p_document_date: normalizeOptionalDate(documentDate),
            p_reference: normalizeNullableText(reference),
            p_notes: normalizeNullableText(notes),
          })

          if (rpc.error) {
            if (isMissingRpcFunctionError(rpc.error, 'bridge_client_portal_submit_matter_financial_request_document')) {
              throw new Error(
                'Finance request uploads are not available yet. Please ask your legal team to enable the submission checklist.',
              )
            }
            throw rpc.error
          }

          return rpc
        },
        read: async () => {
          const reopened = await client.rpc('bridge_client_portal_matter_financial_accounts', { p_workspace: String(workspace || 'buyer').trim().toLowerCase() })
          if (reopened.error) throw reopened.error
          const account = reopened.data?.accounts?.find(row => row.id === normalizedAccountId)
          const document = account?.documents?.find(row => (row.storagePath || row.storage_path) === filePath)
          return document ? { data: { document, request: account.requests?.find(row => row.id === normalizedRequestId) || null } } : null
        },
        cleanup: () => removeUploadedDocumentObject(client, storageBucket, filePath),
      })

      const payload = rpc.data && typeof rpc.data === 'object' ? rpc.data : {}
      const document = payload.document ? buildClientPortalMatterFinancialDocumentViewModel(payload.document) : null
      return {
        document: document
          ? {
              ...document,
              url: document.storagePath
                ? await getSignedUrl(document.storagePath, {
                    client,
                    fileBucket: document.storageBucket || document.fileBucket || storageBucket || '',
                  })
                : null,
            }
          : null,
        request: payload.request || null,
        message: payload.message || 'Document uploaded against the request for attorney review.',
      }
    },
  })
}
