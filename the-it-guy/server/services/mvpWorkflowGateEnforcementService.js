import { evaluateMvpOtpGate } from '../../src/core/transactions/mvpOtpGate.js'
import { evaluateMvpFinanceGate } from '../../src/core/transactions/mvpFinanceGate.js'
import { evaluateMvpTransferGate } from '../../src/core/transactions/mvpTransferGate.js'

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function isMissingTableError(error, tableName = '') {
  const code = normalize(error?.code)
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return code === '42p01' || code === 'pgrst205' || (
    message.includes(String(tableName || '').toLowerCase()) &&
    (message.includes('does not exist') || message.includes('not found') || message.includes('schema cache'))
  )
}

function mvpRoutingProfile(transaction = {}) {
  const profile = transaction.routing_profile_json || transaction.routingProfile || {}
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null
  return profile.launchScope?.supported === true ? profile : null
}

async function selectRows(client, table, transactionId) {
  const query = await client.from(table).select('*').eq('transaction_id', transactionId)
  if (!query.error) return { rows: query.data || [], unavailable: false }
  if (isMissingTableError(query.error, table)) return { rows: [], unavailable: true }
  throw query.error
}

function toWorkflowBlocker(gate, blocker, actionKey) {
  return {
    code: `MVP_${String(gate.gateKey || 'gate').toUpperCase()}_REQUIRED`,
    message: blocker.reason || 'This MVP transaction requirement must be completed before the stage can advance.',
    severity: 'hard',
    ownerRole: blocker.ownerRole || 'transaction_coordinator',
    workflowKey: 'mvp_transaction_gate',
    stepKey: String(actionKey || '').toLowerCase(),
    requiredEvidence: [blocker.key].filter(Boolean),
    gateKey: gate.gateKey,
    mvpGateVersion: gate.version,
  }
}

function unavailableBlocker(actionKey) {
  return {
    code: 'MVP_GATE_DATA_UNAVAILABLE',
    message: 'MVP participant or document requirements could not be read. The transaction cannot advance safely.',
    severity: 'hard',
    ownerRole: 'system',
    workflowKey: 'mvp_transaction_gate',
    stepKey: String(actionKey || '').toLowerCase(),
    requiredEvidence: [],
  }
}

function normalizeDocumentRequirement(row = {}) {
  return {
    ...row,
    documentKey: row.documentKey || row.document_key || row.key,
    documentLabel: row.documentLabel || row.document_label || row.label,
    requiredFromRole: row.requiredFromRole || row.required_from_role,
    isRequired: row.isRequired ?? row.is_required,
  }
}

/**
 * Applies the MVP transaction contract at the server boundary. UI state is not
 * trusted: any route that calls runWorkflowAction receives the same gate.
 */
export async function collectMvpStageTransitionBlockers({ transactionId, actionKey, transaction = {}, client } = {}) {
  const profile = mvpRoutingProfile(transaction)
  const normalizedAction = normalize(actionKey).toUpperCase()
  if (!profile || !['MOVE_TO_FINANCE', 'MOVE_TO_TRANSFER', 'MARK_READY_FOR_REGISTRATION'].includes(normalizedAction)) {
    return []
  }

  const [participants, documentRequirements] = await Promise.all([
    selectRows(client, 'transaction_participants', transactionId),
    selectRows(client, 'transaction_required_documents', transactionId),
  ])
  if (participants.unavailable || documentRequirements.unavailable) return [unavailableBlocker(normalizedAction)]

  const input = {
    routingProfile: profile,
    participants: participants.rows,
    documentRequirements: documentRequirements.rows.map(normalizeDocumentRequirement),
  }
  const gate = normalizedAction === 'MOVE_TO_FINANCE'
    ? evaluateMvpOtpGate(input)
    : normalizedAction === 'MOVE_TO_TRANSFER'
      ? evaluateMvpFinanceGate(input)
      : evaluateMvpTransferGate(input)

  return gate.satisfied ? [] : gate.blockers.map((blocker) => toWorkflowBlocker(gate, blocker, normalizedAction))
}
