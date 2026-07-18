function text(value, fallback = '') {
  return String(value || fallback).trim()
}

function dateValue(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDay(value = new Date()) {
  const date = dateValue(value) || new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function daysUntil(value, today = new Date()) {
  const dueDate = startOfDay(value)
  const comparisonDate = startOfDay(today)
  return Math.ceil((dueDate.getTime() - comparisonDate.getTime()) / 86400000)
}

function formatDueLine(request = {}, today = new Date()) {
  if (!request.dueOn) return 'No due date has been set, but we would appreciate this as soon as possible.'
  const remainingDays = daysUntil(request.dueOn, today)
  if (remainingDays < 0) return `This item is overdue by ${Math.abs(remainingDays)} day${Math.abs(remainingDays) === 1 ? '' : 's'}.`
  if (remainingDays === 0) return 'This item is due today.'
  return `This item is due in ${remainingDays} day${remainingDays === 1 ? '' : 's'}.`
}

function classifyFollowUp(request = {}, today = new Date()) {
  if (request.requestStatus === 'rejected') {
    return {
      urgency: 'resubmission',
      label: 'Resubmission needed',
      tone: 'The previous submission needs a correction before we can mark it complete.',
    }
  }

  if (request.dueOn) {
    const remainingDays = daysUntil(request.dueOn, today)
    if (remainingDays < 0) {
      return {
        urgency: 'overdue',
        label: 'Overdue follow-up',
        tone: 'This item is overdue and is holding up the accounting pack.',
      }
    }
    if (remainingDays <= 2) {
      return {
        urgency: 'due_soon',
        label: 'Due soon',
        tone: 'This item is coming due shortly.',
      }
    }
  }

  return {
    urgency: 'standard',
    label: 'Client follow-up',
    tone: 'This item is still outstanding on the buyer/seller checklist.',
  }
}

function title(value) {
  return text(value, 'Finance document').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function buildMessage({ account, request, classification, today }) {
  const partyName = text(account.partyLabel || account.partyEmail || account.partyRole, 'there')
  const requestTitle = text(request.title, title(request.requestType))
  const dueLine = formatDueLine(request, today)
  const referenceLine = request.externalReference ? `Reference: ${request.externalReference}.` : ''
  const amountLine = request.amountDue ? `Amount noted on the request: ${request.amountDue} ${request.currencyCode || account.currencyCode || 'ZAR'}.` : ''
  const reviewLine = request.reviewNotes ? `Attorney note: ${request.reviewNotes}` : ''
  const descriptionLine = request.description ? `Details: ${request.description}` : ''
  const subject = `${classification.label}: ${requestTitle}`
  const bodyLines = [
    `Hi ${partyName},`,
    '',
    `Please upload the following item on your matter portal: ${requestTitle}.`,
    classification.tone,
    dueLine,
    ...(referenceLine ? [referenceLine] : []),
    ...(amountLine ? [amountLine] : []),
    ...(descriptionLine ? [descriptionLine] : []),
    ...(reviewLine ? [reviewLine] : []),
    '',
    'If you are unsure which file to upload, please send the clearest available invoice, statement, proof of payment, or supporting document and we will review it.',
    '',
    'Thank you.',
  ]
  const body = bodyLines.join('\n')

  return {
    subject,
    body,
    copyText: `${subject}\n\n${body}`,
  }
}

function shouldFollowUp(request = {}) {
  return ['requested', 'rejected'].includes(request.requestStatus)
}

function urgencyPriority(urgency) {
  if (urgency === 'overdue') return 0
  if (urgency === 'resubmission') return 1
  if (urgency === 'due_soon') return 2
  return 3
}

export function buildMatterFinancialSubmissionFollowUps(accounts = [], options = {}) {
  const today = options.today || new Date()
  const followUps = []

  for (const account of Array.isArray(accounts) ? accounts : []) {
    for (const request of Array.isArray(account.requests) ? account.requests : []) {
      if (!shouldFollowUp(request)) continue
      const classification = classifyFollowUp(request, today)
      const message = buildMessage({ account, request, classification, today })
      followUps.push({
        id: `follow-up-${request.id}`,
        requestId: request.id || null,
        accountId: account.id || null,
        transactionId: account.transactionId || null,
        partyRole: account.partyRole || request.audienceRole || 'client',
        partyLabel: account.partyLabel || account.partyEmail || account.partyRole || 'Client',
        partyEmail: account.partyEmail || '',
        requestType: request.requestType || 'other',
        requestStatus: request.requestStatus || 'requested',
        title: text(request.title, title(request.requestType)),
        description: request.description || '',
        dueOn: request.dueOn || '',
        dueInDays: request.dueOn ? daysUntil(request.dueOn, today) : null,
        urgency: classification.urgency,
        label: classification.label,
        subject: message.subject,
        body: message.body,
        copyText: message.copyText,
        portalEnabled: account.portalEnabled === true,
        portalWarning: account.portalEnabled === true ? '' : 'Portal visibility is paused for this account, so enable it before sending this follow-up.',
        request,
      })
    }
  }

  return followUps.sort((left, right) => {
    const urgencyDelta = urgencyPriority(left.urgency) - urgencyPriority(right.urgency)
    if (urgencyDelta !== 0) return urgencyDelta
    if (left.dueInDays === null && right.dueInDays === null) return left.title.localeCompare(right.title)
    if (left.dueInDays === null) return 1
    if (right.dueInDays === null) return -1
    return left.dueInDays - right.dueInDays
  })
}

export function summarizeMatterFinancialSubmissionFollowUps(followUps = []) {
  return (Array.isArray(followUps) ? followUps : []).reduce(
    (summary, item) => {
      summary.total += 1
      if (item.urgency === 'overdue') summary.overdue += 1
      if (item.urgency === 'due_soon') summary.dueSoon += 1
      if (item.urgency === 'resubmission') summary.resubmissions += 1
      if (item.urgency === 'standard') summary.standard += 1
      if (item.portalEnabled === false) summary.portalPaused += 1
      return summary
    },
    {
      total: 0,
      overdue: 0,
      dueSoon: 0,
      resubmissions: 0,
      standard: 0,
      portalPaused: 0,
    },
  )
}
