export const MVP_TRANSACTION_HEALTH_PANEL_VERSION = 'arch9_mvp_transaction_health_panel_v1'

function text(value) {
  return String(value || '').trim()
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function items(value) {
  return Array.isArray(value) ? value : []
}

function currentGateKey(stage = {}) {
  const rank = number(stage.rank)
  if (rank <= 0) return 'onboarding'
  if (rank === 1) return 'otp'
  if (rank === 2) return 'finance'
  return 'transfer'
}

function displayStatus(readiness = {}) {
  const status = text(readiness.status).toLowerCase()
  if (status === 'ready') return { key: 'ready', label: 'Ready to progress', tone: 'clear' }
  if (status === 'attention_required') return { key: 'attention_required', label: 'Needs review', tone: 'attention' }
  if (status === 'out_of_scope') return { key: 'out_of_scope', label: 'Outside MVP scope', tone: 'blocked' }
  if (status === 'blocked') return { key: 'blocked', label: 'Action required', tone: 'blocked' }
  return { key: status || 'incomplete', label: 'Setup incomplete', tone: 'attention' }
}

function blockerPriority(blocker = {}, currentGate = '') {
  const type = text(blocker.type).toLowerCase()
  if (type === currentGate) return 0
  if (type === 'scope') return 1
  if (type === 'participant') return 2
  if (type === 'document') return 3
  if (type === 'workflow') return 4
  return 5
}

function buildAttentionItems({ blockers = [], currentGate, participantRoster = {}, documentRoster = {} } = {}) {
  const direct = items(blockers)
    .map((blocker) => ({
      key: text(blocker.key) || `${text(blocker.type)}:${text(blocker.label)}`,
      type: text(blocker.type) || 'workflow',
      label: text(blocker.reason || blocker.label) || 'Transaction action required.',
      ownerRole: text(blocker.ownerRole || blocker.owner_role) || 'transaction_coordinator',
      priority: blockerPriority(blocker, currentGate),
    }))
    .sort((left, right) => left.priority - right.priority || left.label.localeCompare(right.label))

  const creationRoles = items(participantRoster.creationBlockers)
    .map((blocker) => ({
      key: text(blocker.key),
      type: 'participant',
      label: text(blocker.reason),
      ownerRole: text(blocker.ownerRole) || 'agent',
      priority: 2,
    }))
  const documents = items(documentRoster.blockers)
    .map((blocker) => ({
      key: text(blocker.key),
      type: 'document',
      label: text(blocker.reason),
      ownerRole: text(blocker.ownerRole) || 'transaction_coordinator',
      priority: 3,
    }))

  return [...new Map([...direct, ...creationRoles, ...documents].map((item) => [item.key, item])).values()]
    .sort((left, right) => left.priority - right.priority || left.label.localeCompare(right.label))
}

/**
 * Produces one role-neutral answer to “is this transaction healthy and what
 * needs attention next?” It is presentation-safe and does not change workflow
 * state or gate decisions.
 */
export function buildMvpTransactionHealthPanel({ truth = {}, transaction = {}, participantRoster = {}, documentRoster = {} } = {}) {
  const readiness = truth.readiness || {}
  const stage = truth.stage || { key: 'UNKNOWN', label: 'Stage not set', rank: 0 }
  const status = displayStatus(readiness)
  const gates = items(truth.gates)
  const currentGate = currentGateKey(stage)
  const currentGateState = gates.find((gate) => gate.key === currentGate) || null
  const participantSummary = participantRoster.summary || truth.participants || {}
  const documentSummary = documentRoster.summary || truth.documents || {}
  const attention = buildAttentionItems({
    blockers: truth.blockers,
    currentGate,
    participantRoster,
    documentRoster,
  })
  const testDataProtection = transaction.testDataProtection || transaction.test_data_protection || {}
  const isTestData = testDataProtection.isTestData === true || testDataProtection.is_test_data === true

  return {
    version: MVP_TRANSACTION_HEALTH_PANEL_VERSION,
    transactionId: truth.transactionId || transaction.id || transaction.transactionId || null,
    status,
    stage: {
      key: stage.key || 'UNKNOWN',
      label: stage.label || 'Stage not set',
    },
    nextAction: truth.nextAction || null,
    currentGate: {
      key: currentGate,
      label: currentGateState?.label || 'Workflow gate',
      satisfied: currentGateState?.satisfied === true,
      blockerCount: items(currentGateState?.blockers).length,
    },
    summary: {
      gatesClear: gates.filter((gate) => gate.satisfied === true).length,
      gatesTotal: gates.length,
      participantsAssigned: number(participantSummary.assigned ?? participantSummary.activeCount),
      participantsRequired: number(participantSummary.required ?? participantSummary.requiredNow?.length),
      documentsComplete: number(documentSummary.complete ?? documentSummary.completedCount),
      documentsRequired: number(documentSummary.required ?? documentSummary.requiredCount),
      outstandingDocuments: number(documentSummary.outstanding ?? documentSummary.outstandingCount),
      attentionCount: attention.length,
    },
    attention: attention.slice(0, 5),
    testData: {
      isTestData,
      marker: isTestData ? text(testDataProtection.marker) || 'TEST — DO NOT ACTION' : '',
      externalDeliveryAllowed: testDataProtection.externalDeliveryAllowed !== false,
    },
  }
}
