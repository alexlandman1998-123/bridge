function amount(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function hasText(value) {
  return String(value || '').trim().length > 0
}

function proofNeedsReview(document = {}) {
  return (
    document.documentType === 'proof_of_payment' &&
    document.metadata?.requiresAttorneyReview === true &&
    document.metadata?.reviewStatus !== 'posted' &&
    !document.metadata?.postedEntryId
  )
}

function paymentInstructionsComplete(instructions = {}) {
  return hasText(instructions.accountHolder) && hasText(instructions.bankName) && hasText(instructions.accountNumber)
}

export function evaluateMatterFinancialAccountReadiness(account = {}) {
  const documents = Array.isArray(account.documents) ? account.documents : []
  const entries = Array.isArray(account.entries) ? account.entries : []
  const requests = Array.isArray(account.requests) ? account.requests : []
  const balanceDue = amount(account.balance?.balanceDue ?? account.openingBalance)
  const draftDocuments = documents.filter((document) => document.documentStatus === 'draft')
  const proofsNeedingReview = documents.filter(proofNeedsReview)
  const openRequests = requests.filter((request) => ['requested', 'submitted', 'awaiting_review', 'rejected'].includes(request.requestStatus))
  const overdueRequests = openRequests.filter((request) => {
    if (!request.dueOn || !['requested', 'rejected'].includes(request.requestStatus)) return false
    const dueDate = new Date(request.dueOn)
    if (Number.isNaN(dueDate.getTime())) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return dueDate < today
  })
  const postedClientEntries = entries.filter((entry) => entry.entryStatus === 'posted' && entry.entryVisibility === 'client_visible')
  const paymentInstructions = account.paymentInstructions || {}
  const issues = []
  const warnings = []

  if (!account.portalEnabled) {
    issues.push('Portal visibility is paused for this account.')
  }

  if (balanceDue > 0 && !paymentInstructions.published) {
    issues.push('Payment instructions are not published while a balance is due.')
  }

  if (paymentInstructions.published && !paymentInstructionsComplete(paymentInstructions)) {
    issues.push('Published payment instructions are missing core banking details.')
  }

  if (proofsNeedingReview.length) {
    issues.push(`${proofsNeedingReview.length} proof${proofsNeedingReview.length === 1 ? '' : 's'} of payment still need attorney review.`)
  }

  if (draftDocuments.length) {
    warnings.push(`${draftDocuments.length} document${draftDocuments.length === 1 ? '' : 's'} remain in draft.`)
  }

  if (openRequests.length) {
    warnings.push(`${openRequests.length} client submission request${openRequests.length === 1 ? '' : 's'} remain open.`)
  }

  if (overdueRequests.length) {
    warnings.push(`${overdueRequests.length} client submission request${overdueRequests.length === 1 ? '' : 's'} are overdue.`)
  }

  if (balanceDue > 0 && paymentInstructions.published && !hasText(paymentInstructions.paymentReference)) {
    warnings.push('Published payment instructions do not include a payment reference.')
  }

  if (postedClientEntries.length === 0 && balanceDue <= 0 && documents.length === 0) {
    warnings.push('No published account activity or documents are available yet.')
  }

  const status = issues.length ? 'blocked' : warnings.length ? 'attention' : 'ready'
  return {
    status,
    label: status === 'ready' ? 'Ready' : status === 'attention' ? 'Needs attention' : 'Blocked',
    isReady: status === 'ready',
    issues,
    warnings,
    balanceDue,
    draftDocumentCount: draftDocuments.length,
    proofsNeedingReview: proofsNeedingReview.length,
    openRequestCount: openRequests.length,
    overdueRequestCount: overdueRequests.length,
    paymentInstructionsPublished: paymentInstructions.published === true,
    paymentInstructionsComplete: paymentInstructionsComplete(paymentInstructions),
  }
}

export function summarizeMatterFinancialAccountReadiness(accounts = []) {
  return accounts.reduce(
    (summary, account) => {
      const readiness = account.readiness || evaluateMatterFinancialAccountReadiness(account)
      if (readiness.status === 'ready') summary.readyAccounts += 1
      if (readiness.status === 'attention') summary.accountsNeedingAttention += 1
      if (readiness.status === 'blocked') summary.blockedAccounts += 1
      summary.proofsNeedingReview += readiness.proofsNeedingReview || 0
      summary.draftDocumentCount += readiness.draftDocumentCount || 0
      summary.openRequestCount += readiness.openRequestCount || 0
      summary.overdueRequestCount += readiness.overdueRequestCount || 0
      return summary
    },
    {
      readyAccounts: 0,
      accountsNeedingAttention: 0,
      blockedAccounts: 0,
      proofsNeedingReview: 0,
      draftDocumentCount: 0,
      openRequestCount: 0,
      overdueRequestCount: 0,
    },
  )
}
