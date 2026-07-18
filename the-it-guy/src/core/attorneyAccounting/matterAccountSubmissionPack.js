import {
  buildMatterFinancialReviewQueue,
  summarizeMatterFinancialReviewQueue,
} from './matterAccountReviewQueue.js'
import {
  buildMatterFinancialSubmissionFollowUps,
  summarizeMatterFinancialSubmissionFollowUps,
} from './matterAccountSubmissionFollowUps.js'

function title(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isoDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value || '')
  return date.toISOString().slice(0, 10)
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvLine(values = []) {
  return values.map(csvCell).join(',')
}

function safeFilePart(value, fallback = 'matter') {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function proofNeedsReview(document = {}) {
  return (
    document.documentType === 'proof_of_payment' &&
    document.metadata?.requiresAttorneyReview === true &&
    document.metadata?.reviewStatus !== 'posted' &&
    !document.metadata?.postedEntryId
  )
}

function accountLabel(account = {}) {
  return account.partyLabel || account.partyEmail || title(account.partyRole) || 'Matter account'
}

function requestAction(request = {}) {
  if (['requested', 'rejected'].includes(request.requestStatus)) return 'Waiting on buyer/seller'
  if (['submitted', 'awaiting_review'].includes(request.requestStatus)) return 'Attorney review required'
  if (request.requestStatus === 'accepted') return 'Attorney completion required'
  if (request.requestStatus === 'complete') return 'Complete'
  if (request.requestStatus === 'cancelled') return 'Cancelled'
  return 'Monitor'
}

function documentAction(document = {}) {
  if (proofNeedsReview(document)) return 'Attorney POP reconciliation required'
  if (document.documentStatus === 'draft') return 'Review and publish if client-facing'
  if (document.documentStatus === 'published') return 'Published'
  return 'Monitor'
}

export function summarizeMatterFinancialSubmissionPack(accounts = [], options = {}) {
  const normalizedAccounts = Array.isArray(accounts) ? accounts : []
  const reviewQueue = options.reviewQueue || buildMatterFinancialReviewQueue(normalizedAccounts)
  const followUps = options.followUps || buildMatterFinancialSubmissionFollowUps(normalizedAccounts)
  const reviewQueueSummary = summarizeMatterFinancialReviewQueue(reviewQueue)
  const followUpSummary = summarizeMatterFinancialSubmissionFollowUps(followUps)

  return normalizedAccounts.reduce(
    (summary, account) => {
      const documents = Array.isArray(account.documents) ? account.documents : []
      const requests = Array.isArray(account.requests) ? account.requests : []
      const entries = Array.isArray(account.entries) ? account.entries : []
      summary.documentCount += documents.length
      summary.publishedDocuments += documents.filter((document) => document.documentStatus === 'published').length
      summary.draftDocuments += documents.filter((document) => document.documentStatus === 'draft').length
      summary.proofsNeedingReview += documents.filter(proofNeedsReview).length
      summary.requestCount += requests.length
      summary.openRequests += requests.filter((request) => ['requested', 'rejected'].includes(request.requestStatus)).length
      summary.awaitingReviewRequests += requests.filter((request) => ['submitted', 'awaiting_review'].includes(request.requestStatus)).length
      summary.acceptedRequests += requests.filter((request) => request.requestStatus === 'accepted').length
      summary.completedRequests += requests.filter((request) => request.requestStatus === 'complete').length
      summary.postedEntries += entries.filter((entry) => entry.entryStatus === 'posted').length
      summary.balanceDue += numberValue(account.balance?.balanceDue || account.openingBalance)
      return summary
    },
    {
      accountCount: normalizedAccounts.length,
      documentCount: 0,
      publishedDocuments: 0,
      draftDocuments: 0,
      proofsNeedingReview: 0,
      requestCount: 0,
      openRequests: 0,
      awaitingReviewRequests: 0,
      acceptedRequests: 0,
      completedRequests: 0,
      postedEntries: 0,
      balanceDue: 0,
      reviewQueueItems: reviewQueueSummary.total,
      reviewQueueAttorneyAction: reviewQueueSummary.attorneyAction,
      reviewQueueClientAction: reviewQueueSummary.clientAction,
      followUpItems: followUpSummary.total,
      followUpOverdue: followUpSummary.overdue,
      followUpResubmissions: followUpSummary.resubmissions,
      followUpDueSoon: followUpSummary.dueSoon,
    },
  )
}

export function buildMatterFinancialSubmissionPackCsv(accounts = [], options = {}) {
  const normalizedAccounts = Array.isArray(accounts) ? accounts : []
  const reviewQueue = options.reviewQueue || buildMatterFinancialReviewQueue(normalizedAccounts)
  const followUps = options.followUps || buildMatterFinancialSubmissionFollowUps(normalizedAccounts)
  const summary = summarizeMatterFinancialSubmissionPack(normalizedAccounts, { reviewQueue, followUps })
  const generatedAt = new Date().toISOString()
  const matterLabel = options.matterLabel || options.transactionId || 'Matter'
  const rows = [
    ['Bridge attorney finance handover pack'],
    ['Generated at', generatedAt],
    ['Matter', matterLabel],
    ['Purpose', 'Operational manifest for invoices, statements, POPs, client submissions, follow-ups, and attorney review actions.'],
    [],
    ['Summary'],
    ['Accounts', summary.accountCount],
    ['Documents', summary.documentCount],
    ['Published documents', summary.publishedDocuments],
    ['Draft documents', summary.draftDocuments],
    ['Requests', summary.requestCount],
    ['Open requests waiting on buyer/seller', summary.openRequests],
    ['Requests awaiting attorney review', summary.awaitingReviewRequests],
    ['Accepted requests awaiting completion', summary.acceptedRequests],
    ['Proofs needing reconciliation', summary.proofsNeedingReview],
    ['Review queue items', summary.reviewQueueItems],
    ['Follow-up items', summary.followUpItems],
    ['Follow-ups overdue', summary.followUpOverdue],
    ['Balance due', summary.balanceDue],
    [],
    ['Accounts'],
    ['Party role', 'Party', 'Email', 'Portal enabled', 'Readiness', 'Balance due', 'Documents', 'Requests', 'Posted entries'],
    ...normalizedAccounts.map((account) => [
      title(account.partyRole),
      accountLabel(account),
      account.partyEmail || '',
      account.portalEnabled === true ? 'Yes' : 'No',
      account.readiness?.label || 'Not assessed',
      numberValue(account.balance?.balanceDue || account.openingBalance),
      Array.isArray(account.documents) ? account.documents.length : 0,
      Array.isArray(account.requests) ? account.requests.length : 0,
      (account.entries || []).filter((entry) => entry.entryStatus === 'posted').length,
    ]),
    [],
    ['Client submission requests'],
    ['Party role', 'Party', 'Type', 'Title', 'Reference', 'Status', 'Due date', 'Amount due', 'Linked document', 'Next action', 'Review notes'],
    ...normalizedAccounts.flatMap((account) =>
      (account.requests || []).map((request) => [
        title(account.partyRole),
        accountLabel(account),
        title(request.requestType),
        request.title || '',
        request.externalReference || '',
        title(request.requestStatus),
        isoDate(request.dueOn),
        numberValue(request.amountDue),
        request.linkedDocumentId || '',
        requestAction(request),
        request.reviewNotes || '',
      ]),
    ),
    [],
    ['Uploaded financial documents'],
    ['Party role', 'Party', 'Type', 'Title', 'Reference', 'Status', 'Visibility', 'Issued on', 'Due on', 'Total', 'Due', 'File name', 'Next action', 'Notes'],
    ...normalizedAccounts.flatMap((account) =>
      (account.documents || []).map((document) => [
        title(account.partyRole),
        accountLabel(account),
        title(document.documentType),
        document.title || '',
        document.externalReference || '',
        title(document.documentStatus),
        title(document.audienceRole),
        isoDate(document.issuedOn),
        isoDate(document.dueOn),
        numberValue(document.amountTotal),
        numberValue(document.amountDue),
        document.fileName || '',
        documentAction(document),
        document.notes || '',
      ]),
    ),
    [],
    ['Attorney review queue'],
    ['Party role', 'Party', 'Kind', 'Title', 'Status', 'Action required by', 'Due date', 'Submitted at', 'Document id', 'Request id', 'Amount'],
    ...reviewQueue.map((item) => [
      title(item.partyRole),
      item.partyLabel || '',
      title(item.kind),
      item.title || '',
      title(item.status),
      title(item.actionRequiredBy),
      isoDate(item.dueOn),
      isoDate(item.submittedAt),
      item.documentId || '',
      item.requestId || '',
      numberValue(item.amount),
    ]),
    [],
    ['Follow-up pack'],
    ['Party role', 'Party', 'Email', 'Urgency', 'Title', 'Due date', 'Subject', 'Portal warning'],
    ...followUps.map((followUp) => [
      title(followUp.partyRole),
      followUp.partyLabel || '',
      followUp.partyEmail || '',
      title(followUp.urgency),
      followUp.title || '',
      isoDate(followUp.dueOn),
      followUp.subject || '',
      followUp.portalWarning || '',
    ]),
    [],
    ['Ledger summary'],
    ['Party role', 'Party', 'Date', 'Type', 'Description', 'Amount', 'Status', 'Visibility', 'Document id'],
    ...normalizedAccounts.flatMap((account) =>
      (account.entries || []).map((entry) => [
        title(account.partyRole),
        accountLabel(account),
        isoDate(entry.occurredOn),
        title(entry.entryType),
        entry.description || '',
        numberValue(entry.amount),
        title(entry.entryStatus),
        title(entry.entryVisibility),
        entry.financialDocumentId || '',
      ]),
    ),
  ]

  return `${rows.map(csvLine).join('\n')}\n`
}

export function buildMatterFinancialSubmissionPackFileName({ matterLabel = 'matter' } = {}) {
  const date = new Date().toISOString().slice(0, 10)
  return `bridge-${safeFilePart(matterLabel)}-finance-handover-pack-${date}.csv`
}

export function downloadMatterFinancialSubmissionPack(accounts = [], options = {}) {
  const csv = buildMatterFinancialSubmissionPackCsv(accounts, options)
  const fileName = buildMatterFinancialSubmissionPackFileName(options)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
  return { fileName, csv }
}
