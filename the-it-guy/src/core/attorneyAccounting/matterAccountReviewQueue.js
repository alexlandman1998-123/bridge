function amount(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatTitle(value, fallback = 'Review item') {
  return String(value || fallback).trim() || fallback
}

function dateValue(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function isOverdueRequest(request = {}) {
  if (!request.dueOn || !['requested', 'rejected'].includes(request.requestStatus)) return false
  const dueDate = dateValue(request.dueOn)
  if (!dueDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return dueDate < today
}

function proofNeedsReview(document = {}) {
  return (
    document.documentType === 'proof_of_payment' &&
    document.metadata?.requiresAttorneyReview === true &&
    document.metadata?.reviewStatus !== 'posted' &&
    !document.metadata?.postedEntryId
  )
}

function getRequestReviewKind(request = {}) {
  if (['submitted', 'awaiting_review'].includes(request.requestStatus)) return 'request_review'
  if (request.requestStatus === 'accepted') return 'accepted_request'
  if (isOverdueRequest(request)) return 'overdue_request'
  if (request.requestStatus === 'rejected') return 'rejected_request'
  if (request.requestStatus === 'requested') return 'open_request'
  return null
}

function getSortTime(item = {}) {
  const date = dateValue(item.submittedAt || item.dueOn || item.createdAt)
  return date ? date.getTime() : 0
}

function queuePriority(item = {}) {
  if (item.kind === 'proof_review') return 0
  if (item.kind === 'request_review') return 1
  if (item.kind === 'accepted_request') return 2
  if (item.kind === 'overdue_request') return 3
  if (item.kind === 'rejected_request') return 4
  return 4
}

export function buildMatterFinancialReviewQueue(accounts = []) {
  const queue = []

  for (const account of Array.isArray(accounts) ? accounts : []) {
    const accountSummary = {
      accountId: account.id || null,
      transactionId: account.transactionId || null,
      partyRole: account.partyRole || 'client',
      partyLabel: account.partyLabel || account.partyEmail || account.partyRole || 'Client',
      partyEmail: account.partyEmail || '',
    }

    for (const request of Array.isArray(account.requests) ? account.requests : []) {
      const kind = getRequestReviewKind(request)
      if (!kind) continue

      const linkedDocument = (account.documents || []).find((document) => document.id === request.linkedDocumentId) || null
      queue.push({
        id: `request-${request.id}`,
        kind,
        status: request.requestStatus,
        label:
          kind === 'request_review'
            ? 'Submitted request'
            : kind === 'accepted_request'
              ? 'Accepted request'
            : kind === 'overdue_request'
              ? 'Overdue request'
              : kind === 'rejected_request'
                ? 'Rejected request'
                : 'Open request',
        title: formatTitle(request.title, 'Finance document request'),
        description: request.description || '',
        requestId: request.id || null,
        documentId: linkedDocument?.id || request.linkedDocumentId || null,
        documentUrl: linkedDocument?.url || null,
        documentType: linkedDocument?.documentType || request.requestType || 'other',
        amount: amount(linkedDocument?.amountTotal ?? linkedDocument?.amountDue ?? request.amountDue),
        dueOn: request.dueOn || '',
        submittedAt: request.submittedAt || linkedDocument?.uploadedAt || linkedDocument?.publishedAt || null,
        createdAt: request.createdAt || request.requestedAt || null,
        actionRequiredBy: ['request_review', 'accepted_request'].includes(kind) ? 'attorney' : 'client',
        canAccept: kind === 'request_review',
        canReject: kind === 'request_review',
        canComplete: request.requestStatus === 'accepted',
        canCancel: !['complete', 'cancelled'].includes(request.requestStatus),
        request,
        document: linkedDocument,
        ...accountSummary,
      })
    }

    for (const document of Array.isArray(account.documents) ? account.documents : []) {
      if (!proofNeedsReview(document)) continue
      const request = (account.requests || []).find((item) => item.id === document.metadata?.requestId) || null
      queue.push({
        id: `proof-${document.id}`,
        kind: 'proof_review',
        status: 'awaiting_review',
        label: 'Proof to reconcile',
        title: formatTitle(document.title, 'Proof of payment'),
        description: document.notes || request?.description || '',
        requestId: request?.id || document.metadata?.requestId || null,
        documentId: document.id || null,
        documentUrl: document.url || null,
        documentType: document.documentType || 'proof_of_payment',
        amount: amount(document.amountTotal ?? document.amountDue ?? request?.amountDue),
        dueOn: request?.dueOn || document.dueOn || '',
        submittedAt: document.uploadedAt || document.publishedAt || document.createdAt || null,
        createdAt: document.createdAt || null,
        actionRequiredBy: 'attorney',
        canPostPayment: true,
        document,
        request,
        ...accountSummary,
      })
    }
  }

  return queue.sort((left, right) => {
    const priorityDelta = queuePriority(left) - queuePriority(right)
    if (priorityDelta !== 0) return priorityDelta
    return getSortTime(right) - getSortTime(left)
  })
}

export function summarizeMatterFinancialReviewQueue(queue = []) {
  return (Array.isArray(queue) ? queue : []).reduce(
    (summary, item) => {
      summary.total += 1
      if (item.actionRequiredBy === 'attorney') summary.attorneyAction += 1
      if (item.actionRequiredBy === 'client') summary.clientAction += 1
      if (item.kind === 'proof_review') summary.proofReviews += 1
      if (item.kind === 'request_review') summary.requestReviews += 1
      if (item.kind === 'overdue_request') summary.overdueRequests += 1
      if (item.kind === 'accepted_request') summary.acceptedRequests += 1
      if (item.kind === 'rejected_request') summary.rejectedRequests += 1
      if (item.kind === 'open_request') summary.openRequests += 1
      return summary
    },
    {
      total: 0,
      attorneyAction: 0,
      clientAction: 0,
      proofReviews: 0,
      requestReviews: 0,
      overdueRequests: 0,
      acceptedRequests: 0,
      rejectedRequests: 0,
      openRequests: 0,
    },
  )
}
