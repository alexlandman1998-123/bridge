export const LEGAL_CLAUSE_PACK_ESCALATION_VERSION = 'sa_legal_clause_pack_escalation_v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function stableHash(value = '') {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function escalationDefinition(record = {}) {
  const state = normalizeText(record.operationalState)
  if (state === 'awaiting_attorney_approval') {
    return {
      priority: 'high',
      targetRoles: ['attorney'],
      title: 'OTP requires attorney review',
      message: `Review ${record.title || 'the OTP'} and clear its specialist legal items before signature release.`,
    }
  }
  if (['released_without_valid_approval', 'invalid_approval_role', 'generated_with_readiness_blockers', 'missing_generated_version'].includes(state)) {
    return {
      priority: 'critical',
      targetRoles: ['agent', 'attorney'],
      title: 'Critical OTP release exception',
      message: `${record.title || 'An OTP'} has an unsafe legal release state: ${state.replace(/_/g, ' ')}. Stop progression and review immediately.`,
    }
  }
  if (state === 'stale_approval') {
    return {
      priority: 'high',
      targetRoles: record.requiresLegalSpecialist ? ['attorney'] : ['agent'],
      title: 'OTP approval expired after changes',
      message: `${record.title || 'The OTP'} changed after approval. Review and approve the current version before signature release.`,
    }
  }
  if (state === 'awaiting_operational_approval') {
    return {
      priority: 'normal',
      targetRoles: ['agent'],
      title: 'OTP approval required',
      message: `Review and approve ${record.title || 'the generated OTP'} before sending it for signature.`,
    }
  }
  return null
}

export function buildLegalClausePackEscalationPlan({ diagnostics = null, generatedAt = new Date().toISOString() } = {}) {
  const diagnosticsWarnings = asArray(diagnostics?.queryWarnings)
  const diagnosticsComplete = diagnosticsWarnings.length === 0
  const actions = asArray(diagnostics?.records).flatMap((record) => {
    const definition = escalationDefinition(record)
    if (!definition) return []
    const transactionId = normalizeText(record.transactionId)
    const packetId = normalizeText(record.packetId)
    const versionId = normalizeText(record.versionId)
    const operationalState = normalizeText(record.operationalState)
    const actionKey = [packetId, versionId, operationalState, ...definition.targetRoles].join(':')
    return [{
      actionKey,
      actionId: stableHash(actionKey),
      packetId,
      versionId: versionId || null,
      versionNumber: Number(record.versionNumber || 0) || null,
      transactionId: transactionId || null,
      operationalState,
      priority: definition.priority,
      targetRoles: definition.targetRoles,
      title: definition.title,
      message: definition.message,
      executable: Boolean(transactionId),
      skipReason: transactionId ? null : 'Packet is not linked to a transaction, so no role notification can be routed.',
    }]
  })
  const executableActions = actions.filter((action) => action.executable)
  const actionKeys = actions.map((action) => action.actionKey).sort()
  const planFingerprint = stableHash(actionKeys.join('|'))
  return {
    schemaVersion: LEGAL_CLAUSE_PACK_ESCALATION_VERSION,
    diagnosticsVersion: diagnostics?.schemaVersion || null,
    diagnosticsGeneratedAt: diagnostics?.generatedAt || null,
    generatedAt,
    planFingerprint,
    diagnosticsComplete,
    diagnosticsWarnings,
    canApply: diagnosticsComplete && executableActions.length > 0,
    summary: {
      totalActions: actions.length,
      executableActions: executableActions.length,
      skippedActions: actions.length - executableActions.length,
      criticalActions: actions.filter((action) => action.priority === 'critical').length,
      attorneyActions: actions.filter((action) => action.targetRoles.includes('attorney')).length,
      agentActions: actions.filter((action) => action.targetRoles.includes('agent')).length,
    },
    actionKeys,
    actions,
  }
}

export async function executeLegalClausePackEscalationPlan({
  diagnostics = null,
  dryRun = true,
  approvedPlanFingerprint = '',
  approvedActionKeys = [],
  actorUserId = null,
} = {}) {
  const plan = buildLegalClausePackEscalationPlan({ diagnostics })
  if (dryRun) return { ...plan, dryRun: true, applied: [], failed: [] }

  if (!plan.diagnosticsComplete) {
    const error = new Error('The OTP diagnostics are incomplete. Repair the audit data path and run a new review plan before applying notifications.')
    error.code = 'LEGAL_ESCALATION_DIAGNOSTICS_INCOMPLETE'
    error.currentPlan = plan
    throw error
  }

  const expectedKeys = [...asArray(approvedActionKeys)].map(normalizeText).filter(Boolean).sort()
  const planLocked = normalizeText(approvedPlanFingerprint) === plan.planFingerprint &&
    expectedKeys.length === plan.actionKeys.length &&
    expectedKeys.every((key, index) => key === plan.actionKeys[index])
  if (!planLocked) {
    const error = new Error('The OTP escalation plan changed after review. Run a new dry-run before applying notifications.')
    error.code = 'LEGAL_ESCALATION_PLAN_STALE'
    error.currentPlan = plan
    throw error
  }

  const { notifyTransactionRoles } = await import('../../lib/api.js')
  const applied = []
  const failed = []
  for (const action of plan.actions.filter((item) => item.executable)) {
    try {
      const notifications = await notifyTransactionRoles({
        transactionId: action.transactionId,
        roleTypes: action.targetRoles,
        title: action.title,
        message: action.message,
        notificationType: 'readiness_updated',
        eventType: 'TransactionUpdated',
        eventData: {
          source: 'legal_clause_pack_phase9_escalation',
          schemaVersion: LEGAL_CLAUSE_PACK_ESCALATION_VERSION,
          packetId: action.packetId,
          versionId: action.versionId,
          versionNumber: action.versionNumber,
          operationalState: action.operationalState,
          priority: action.priority,
          planFingerprint: plan.planFingerprint,
        },
        dedupePrefix: `legal-otp-escalation:${action.actionId}`,
        excludeUserId: actorUserId,
      })
      applied.push({
        actionKey: action.actionKey,
        actionId: action.actionId,
        notificationCount: asArray(notifications).length,
        status: asArray(notifications).length ? 'notified' : 'no_active_recipients',
      })
    } catch (error) {
      failed.push({ actionKey: action.actionKey, actionId: action.actionId, message: error?.message || 'Notification failed.' })
    }
  }

  return {
    ...plan,
    dryRun: false,
    planLocked: true,
    applied,
    failed,
    applySummary: {
      attempted: plan.actions.filter((action) => action.executable).length,
      notified: applied.filter((item) => item.status === 'notified').length,
      noActiveRecipients: applied.filter((item) => item.status === 'no_active_recipients').length,
      failed: failed.length,
    },
  }
}
