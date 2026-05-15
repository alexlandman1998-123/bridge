const LANE_BY_ROLE = {
  transfer_attorney: {
    laneKey: 'transfer',
    label: 'Transfer Attorney',
    requiredStageForLodgement: 'lodgement_ready',
    requiredStageForRegistration: 'registered',
  },
  bond_attorney: {
    laneKey: 'bond',
    label: 'Bond Attorney',
    requiredStageForLodgement: 'bond_lodgement_ready',
    requiredStageForRegistration: 'bond_registered',
  },
  cancellation_attorney: {
    laneKey: 'cancellation',
    label: 'Cancellation Attorney',
    requiredStageForLodgement: 'cancellation_lodged',
    requiredStageForRegistration: 'cancellation_registered',
  },
}

const ROLE_BY_LANE = Object.fromEntries(Object.entries(LANE_BY_ROLE).map(([role, meta]) => [meta.laneKey, role]))

const WEIGHTS = {
  workflowStageProgress: 40,
  documents: 25,
  signatures: 20,
  blockers: 10,
  assignment: 5,
}

const SEVERITY_ORDER = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

function clampScore(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function normalizeLaneKey(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/_attorney$/, '')
  if (normalized === 'bond') return 'bond'
  if (normalized === 'cancellation') return 'cancellation'
  return 'transfer'
}

function normalizeRole(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'bond' || normalized === 'bond_attorney') return 'bond_attorney'
  if (normalized === 'cancellation' || normalized === 'cancellation_attorney') return 'cancellation_attorney'
  return 'transfer_attorney'
}

function normalizeStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'complete') return 'completed'
  return normalized
}

function normalizeSeverity(value = 'medium') {
  const normalized = String(value || '').trim().toLowerCase()
  return SEVERITY_ORDER[normalized] ? normalized : 'medium'
}

function highestSeverity(blockers = []) {
  return (blockers || []).reduce((highest, blocker) => {
    const severity = normalizeSeverity(blocker.severity)
    return SEVERITY_ORDER[severity] > SEVERITY_ORDER[highest] ? severity : highest
  }, 'low')
}

function blocker({
  id,
  label,
  severity = 'medium',
  laneKey = 'transfer',
  attorneyRole = null,
  blockingStage = null,
  source = 'workflow',
  owner = 'attorney',
  recommendedAction = '',
  clientVisibleSafe = false,
  category = 'dependency_not_met',
  visibility = 'internal',
  manual = false,
  dueDate = null,
  resolvedAt = null,
}) {
  const normalizedLaneKey = normalizeLaneKey(laneKey || attorneyRole)
  const normalizedRole = normalizeRole(attorneyRole || ROLE_BY_LANE[normalizedLaneKey])
  return {
    id,
    label,
    severity: normalizeSeverity(severity),
    laneKey: normalizedLaneKey,
    attorneyRole: normalizedRole,
    blockingStage,
    source,
    owner,
    recommendedAction,
    clientVisibleSafe,
    category,
    visibility,
    manual,
    dueDate,
    resolvedAt,
  }
}

function nextActionFromBlocker(item) {
  return {
    id: `action_${item.id}`,
    label: item.recommendedAction || item.label,
    laneKey: item.laneKey,
    attorneyRole: item.attorneyRole,
    priority: item.severity === 'critical' ? 'critical' : item.severity === 'high' ? 'high' : item.severity === 'medium' ? 'medium' : 'low',
    actionType: actionTypeForBlocker(item),
    target: item.owner || 'attorney',
    relatedBlockerId: item.id,
  }
}

function actionTypeForBlocker(item = {}) {
  if (item.category === 'missing_document' || item.source === 'document_requirement') return 'request_document'
  if (item.category === 'unsigned_document') return 'manage_signing'
  if (item.category === 'missing_assignment') return 'assign_attorney'
  if (item.category === 'manual_blocker') return 'resolve_blocker'
  return 'update_workflow'
}

function stepIsComplete(lane, stepKeys = []) {
  const keys = new Set(stepKeys)
  return (lane?.steps || []).some((step) => keys.has(step.stepKey) && normalizeStatus(step.status) === 'completed')
}

function requirementComplete(requirements = [], requirementId) {
  const requirement = requirements.find((item) => item.id === requirementId)
  if (!requirement) return false
  return Boolean(requirement.complete || ['approved', 'completed'].includes(normalizeStatus(requirement.status)))
}

function requiredDocumentRequirements(lane = {}) {
  return (lane.documentRequirements || []).filter((item) => item.required !== false && item.affectsReadiness !== false)
}

function documentCompletionRatio(requirements = []) {
  const required = requirements.filter((item) => item.required !== false && item.affectsReadiness !== false)
  if (!required.length) return 1
  const complete = required.filter((item) => item.complete || ['approved', 'completed'].includes(normalizeStatus(item.status)))
  return complete.length / required.length
}

function signatureCompletion(lane = {}) {
  const signingRequirements = (lane.signingRequirements || []).filter((item) => item.required !== false)
  if (!signingRequirements.length) return { completed: 1, total: 1, ratio: 1, outstanding: [] }

  const outstanding = []
  let completed = 0
  for (const requirement of signingRequirements) {
    let isComplete = false
    if (requirement.id === 'buyer_transfer_signature') {
      isComplete = stepIsComplete(lane, ['buyer_signed'])
    } else if (requirement.id === 'seller_transfer_signature') {
      isComplete = stepIsComplete(lane, ['seller_signed'])
    } else if (requirement.id === 'buyer_bond_documents_signature') {
      isComplete = stepIsComplete(lane, ['buyer_signed_bond_documents'])
    } else if (requirement.id === 'seller_cancellation_documents_signature') {
      isComplete = requirementComplete(lane.documentRequirements, requirement.sourceRequirementId) || stepIsComplete(lane, ['cancellation_documents_prepared', 'cancellation_lodged', 'cancellation_registered'])
    } else if (requirement.sourceRequirementId) {
      isComplete = requirementComplete(lane.documentRequirements, requirement.sourceRequirementId)
    }
    if (isComplete) completed += 1
    else outstanding.push(requirement)
  }

  return {
    completed,
    total: signingRequirements.length,
    ratio: signingRequirements.length ? completed / signingRequirements.length : 1,
    outstanding,
  }
}

function detectDocumentBlockers(lane = {}) {
  const items = []
  for (const requirement of requiredDocumentRequirements(lane)) {
    const status = normalizeStatus(requirement.status)
    if (requirement.complete || ['approved', 'completed'].includes(status)) continue
    const id = `${requirement.id}_${status || 'missing'}`
    const isRejected = status === 'rejected'
    const isFica = requirement.category === 'fica' || /fica|id document|proof of address/i.test(requirement.label || '')
    items.push(blocker({
      id,
      label: isRejected ? `${requirement.label} rejected` : `${requirement.label} outstanding`,
      severity: isRejected ? 'high' : isFica ? 'medium' : 'medium',
      laneKey: requirement.laneKey || lane.laneKey,
      attorneyRole: requirement.attorneyRole || lane.attorneyRole,
      blockingStage: requirement.category === 'fica' ? 'fica_received' : requirement.category === 'property_compliance' ? 'clearances_received' : null,
      source: 'document_requirement',
      owner: requirement.requiredFrom || requirement.appliesTo || 'client',
      recommendedAction: isRejected ? `Request corrected ${requirement.label}` : `Request ${requirement.label}`,
      clientVisibleSafe: ['buyer', 'seller', 'client'].includes(String(requirement.requiredFrom || '').toLowerCase()),
      category: isRejected ? 'rejected_document' : 'missing_document',
      visibility: requirement.visibilityDefault || 'professional_shared',
    }))
  }
  return items
}

function detectSignatureBlockers(lane = {}) {
  const signatureState = signatureCompletion(lane)
  return signatureState.outstanding.map((requirement) => blocker({
    id: `${requirement.id}_outstanding`,
    label: `${requirement.label} outstanding`,
    severity: lane.laneKey === 'transfer' ? 'high' : 'medium',
    laneKey: requirement.laneKey || lane.laneKey,
    attorneyRole: requirement.attorneyRole || lane.attorneyRole,
    blockingStage: requirement.sourceRequirementId || 'signing',
    source: 'signing_requirement',
    owner: requirement.signerType || 'client',
    recommendedAction: `Send or follow up ${requirement.label}`,
    clientVisibleSafe: Boolean(requirement.clientVisible),
    category: 'unsigned_document',
    visibility: requirement.clientVisible ? 'client_visible' : 'professional_shared',
  }))
}

function detectWorkflowBlockers(lane = {}) {
  const items = []
  if (lane.laneStatus === 'blocked') {
    items.push(blocker({
      id: `${lane.laneKey}_lane_blocked`,
      label: `${lane.label} lane is blocked`,
      severity: 'high',
      laneKey: lane.laneKey,
      attorneyRole: lane.attorneyRole,
      blockingStage: lane.currentStage,
      source: 'workflow_lane',
      owner: 'attorney',
      recommendedAction: 'Review the lane blocker and update the workflow',
      category: 'manual_blocker',
    }))
  }

  const updatedAt = lane.updatedAt || lane.steps?.find((step) => step.updatedAt)?.updatedAt
  const staleDays = updatedAt ? Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000) : null
  if (staleDays !== null && staleDays >= 10 && lane.laneStatus !== 'completed') {
    items.push(blocker({
      id: `${lane.laneKey}_no_activity_${staleDays}d`,
      label: `No ${lane.label.toLowerCase()} activity for ${staleDays} days`,
      severity: staleDays >= 21 ? 'critical' : 'high',
      laneKey: lane.laneKey,
      attorneyRole: lane.attorneyRole,
      blockingStage: lane.currentStage,
      source: 'activity_age',
      owner: 'attorney',
      recommendedAction: 'Review matter progress and capture the next legal update',
      category: 'inactive_matter',
    }))
  }

  return items
}

function detectAssignmentBlocker(lane = {}) {
  if (lane.assignment) return []
  return [blocker({
    id: `${lane.attorneyRole}_missing_assignment`,
    label: `${lane.label} not assigned`,
    severity: 'critical',
    laneKey: lane.laneKey,
    attorneyRole: lane.attorneyRole,
    source: 'assignment',
    owner: 'management',
    recommendedAction: `Assign ${lane.label}`,
    category: 'missing_assignment',
  })]
}

function normalizeManualBlockers(manualBlockers = []) {
  return (manualBlockers || [])
    .filter((item) => !item.resolvedAt && !item.resolved_at)
    .map((item) => blocker({
      id: item.id || `manual_${item.title}`,
      label: item.title || item.label || 'Manual blocker',
      severity: item.severity || 'medium',
      laneKey: item.laneKey || item.lane_key || item.attorneyRole || item.attorney_role || 'transfer',
      attorneyRole: item.attorneyRole || item.attorney_role || null,
      source: 'manual_blocker',
      owner: item.owner || 'attorney',
      recommendedAction: item.recommendedAction || item.recommended_action || 'Resolve manual blocker',
      clientVisibleSafe: item.visibility === 'client_visible' || item.clientVisibleSafe === true,
      category: 'manual_blocker',
      visibility: item.visibility || 'internal',
      manual: true,
      dueDate: item.dueDate || item.due_date || null,
      resolvedAt: item.resolvedAt || item.resolved_at || null,
    }))
}

function calculateLaneReadiness(lane = {}, manualBlockers = []) {
  const assignmentBlockers = detectAssignmentBlocker(lane)
  const documentBlockers = detectDocumentBlockers(lane)
  const signatureBlockers = detectSignatureBlockers(lane)
  const workflowBlockers = detectWorkflowBlockers(lane)
  const laneManualBlockers = normalizeManualBlockers(manualBlockers).filter((item) => item.laneKey === lane.laneKey || item.attorneyRole === lane.attorneyRole)
  const blockers = [...assignmentBlockers, ...documentBlockers, ...signatureBlockers, ...workflowBlockers, ...laneManualBlockers]

  const workflowScore = Math.round(((lane.summary?.completionPercent || 0) / 100) * WEIGHTS.workflowStageProgress)
  const documentScore = Math.round(documentCompletionRatio(lane.documentRequirements || []) * WEIGHTS.documents)
  const signatureScore = Math.round(signatureCompletion(lane).ratio * WEIGHTS.signatures)
  const blockerSeverity = highestSeverity(blockers)
  const blockerScore = blockers.length
    ? blockerSeverity === 'critical' || blockerSeverity === 'high'
      ? 0
      : 5
    : WEIGHTS.blockers
  const assignmentScore = lane.assignment ? WEIGHTS.assignment : 0
  const scoreBreakdown = {
    workflowStageProgress: workflowScore,
    documents: documentScore,
    signatures: signatureScore,
    blockers: blockerScore,
    assignment: assignmentScore,
  }
  const readiness = clampScore(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0))

  return {
    required: true,
    readiness,
    status: blockers.some((item) => ['critical', 'high'].includes(item.severity))
      ? 'blocked'
      : lane.laneStatus === 'completed'
        ? 'complete'
        : lane.laneStatus || 'in_progress',
    blockers,
    nextActions: blockers.map(nextActionFromBlocker).sort(sortActions),
    scoreBreakdown,
    currentStage: lane.currentStage,
    completionPercent: lane.summary?.completionPercent || 0,
  }
}

function sortActions(left, right) {
  const order = { critical: 0, high: 1, medium: 2, low: 3 }
  return (order[left.priority] ?? 4) - (order[right.priority] ?? 4)
}

function roleReadinessSkeleton(required = false) {
  return {
    required,
    readiness: required ? 0 : null,
    status: required ? 'not_started' : 'not_required',
    blockers: [],
    nextActions: [],
    scoreBreakdown: required ? { workflowStageProgress: 0, documents: 0, signatures: 0, blockers: 0, assignment: 0 } : null,
  }
}

function getRequiredRoles(operations = {}) {
  return new Set(operations.workflow?.requiredAttorneyRoles || (operations.lanes || []).map((lane) => lane.attorneyRole))
}

function getRequiredLanes(operations = {}) {
  const requiredRoles = getRequiredRoles(operations)
  return (operations.lanes || []).filter((lane) => requiredRoles.has(lane.attorneyRole))
}

function calculateAverageReadiness(lanes = {}) {
  const required = Object.values(lanes).filter((lane) => lane.required)
  if (!required.length) return 0
  return clampScore(required.reduce((sum, lane) => sum + Number(lane.readiness || 0), 0) / required.length)
}

function stageCompleteForLane(lane = {}, stageKey) {
  if (!stageKey) return false
  return stepIsComplete(lane, [stageKey]) || lane.currentStage === stageKey || lane.summary?.allComplete
}

function calculateLodgementFromOperations(operations = {}, laneResults = {}) {
  const missing = []
  let checks = 0
  let complete = 0
  for (const lane of getRequiredLanes(operations)) {
    const role = lane.attorneyRole
    const meta = LANE_BY_ROLE[role]
    if (!meta) continue
    checks += 1
    if (laneResults[role]?.blockers?.some((item) => item.severity === 'critical')) {
      missing.push(`${lane.label} has critical blockers`)
      continue
    }
    const readyStage = stageCompleteForLane(lane, meta.requiredStageForLodgement)
    const readiness = Number(laneResults[role]?.readiness || 0)
    if (readyStage || readiness >= 75) complete += 1
    else missing.push(`${lane.label} not ready for lodgement`)
  }

  const readiness = checks ? clampScore((complete / checks) * 100) : 0
  return {
    ready: readiness >= 80 && !missing.length,
    readiness,
    missing,
  }
}

function calculateRegistrationFromOperations(operations = {}, laneResults = {}) {
  const missing = []
  let checks = 0
  let complete = 0
  for (const lane of getRequiredLanes(operations)) {
    const role = lane.attorneyRole
    const meta = LANE_BY_ROLE[role]
    if (!meta) continue
    checks += 1
    const finalReady = stageCompleteForLane(lane, meta.requiredStageForRegistration)
    if (finalReady || laneResults[role]?.status === 'complete') complete += 1
    else missing.push(`${lane.label} not registered yet`)
  }

  const readiness = checks ? clampScore((complete / checks) * 100) : 0
  return {
    ready: readiness === 100 && !missing.length,
    readiness,
    missing,
  }
}

function riskSummary(blockers = [], operations = {}) {
  const criticalOrHigh = blockers.filter((item) => ['critical', 'high'].includes(item.severity))
  const rejected = blockers.filter((item) => item.category === 'rejected_document')
  const missingAssignments = blockers.filter((item) => item.category === 'missing_assignment')
  const stale = blockers.filter((item) => item.category === 'inactive_matter')
  const reasons = [
    ...criticalOrHigh.map((item) => item.label),
    ...rejected.map((item) => item.label),
    ...missingAssignments.map((item) => item.label),
    ...stale.map((item) => item.label),
  ]
  const warnings = operations.workflow?.warnings || operations.legalDocuments?.warnings || []
  return {
    atRisk: reasons.length > 0,
    riskReasons: [...new Set(reasons)].slice(0, 8),
    warnings,
  }
}

export function calculateAttorneyReadinessForOperations(operations = {}, manualBlockers = []) {
  const requiredRoles = getRequiredRoles(operations)
  const laneResults = {
    transfer_attorney: roleReadinessSkeleton(requiredRoles.has('transfer_attorney')),
    bond_attorney: roleReadinessSkeleton(requiredRoles.has('bond_attorney')),
    cancellation_attorney: roleReadinessSkeleton(requiredRoles.has('cancellation_attorney')),
  }

  for (const lane of getRequiredLanes(operations)) {
    laneResults[lane.attorneyRole] = calculateLaneReadiness(lane, manualBlockers)
  }

  const allBlockers = Object.values(laneResults).flatMap((lane) => lane.blockers || [])
  const nextActions = allBlockers.map(nextActionFromBlocker).sort(sortActions)
  const lodgement = calculateLodgementFromOperations(operations, laneResults)
  const registration = calculateRegistrationFromOperations(operations, laneResults)
  const risk = riskSummary(allBlockers, operations)

  return {
    transactionId: operations.transaction?.id || operations.workflow?.transactionId || null,
    overallReadiness: calculateAverageReadiness(laneResults),
    lanes: laneResults,
    lodgementReadiness: lodgement.readiness,
    registrationReadiness: registration.readiness,
    lodgement,
    registration,
    blockers: allBlockers.sort((left, right) => SEVERITY_ORDER[right.severity] - SEVERITY_ORDER[left.severity]),
    nextActions,
    atRisk: risk.atRisk,
    riskReasons: risk.riskReasons,
    readyForLodgement: lodgement.ready,
    nearReadyForLodgement: !lodgement.ready && lodgement.readiness >= 70 && lodgement.missing.length <= 2,
    warnings: risk.warnings,
  }
}

async function insertTransactionEvent(client, {
  transactionId,
  eventType,
  actorId = null,
  visibility = 'internal',
  eventData = {},
}) {
  const { isMissingColumnError, isMissingTableError } = await import('../attorneyFirmServiceShared.js')
  const payload = {
    transaction_id: transactionId,
    event_type: eventType,
    event_data: eventData,
    created_by: actorId,
    created_by_role: 'attorney',
    visibility_scope: visibility,
  }
  let result = await client.from('transaction_events').insert(payload)
  if (result.error && isMissingColumnError(result.error, 'visibility_scope')) {
    const fallback = { ...payload }
    delete fallback.visibility_scope
    result = await client.from('transaction_events').insert(fallback)
  }
  if (result.error && !isMissingTableError(result.error, 'transaction_events')) throw result.error
}

function mapManualBlockerRow(row = {}) {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    title: row.title,
    description: row.description || '',
    laneKey: row.lane_key || normalizeLaneKey(row.attorney_role),
    attorneyRole: row.attorney_role || normalizeRole(row.lane_key),
    severity: normalizeSeverity(row.severity),
    owner: row.owner || 'attorney',
    visibility: row.visibility || 'internal',
    dueDate: row.due_date || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    resolvedAt: row.resolved_at || null,
    resolvedBy: row.resolved_by || null,
    metadata: row.metadata || {},
  }
}

export async function getAttorneyManualBlockers(transactionId) {
  const { isMissingTableError, requireClient } = await import('../attorneyFirmServiceShared.js')
  const client = requireClient()
  const normalizedTransactionId = String(transactionId || '').trim()
  if (!normalizedTransactionId) return []
  const query = await client
    .from('attorney_workflow_blockers')
    .select('id, transaction_id, title, description, lane_key, attorney_role, severity, owner, visibility, due_date, created_by, created_at, resolved_at, resolved_by, metadata')
    .eq('transaction_id', normalizedTransactionId)
    .order('created_at', { ascending: false })

  if (query.error) {
    if (isMissingTableError(query.error, 'attorney_workflow_blockers')) return []
    throw query.error
  }
  return (query.data || []).map(mapManualBlockerRow)
}

export async function calculateAttorneyReadiness(transactionId) {
  const { getAttorneyWorkflowOperationsForTransaction } = await import('./attorneyWorkflowLaneService.js')
  const [operations, manualBlockers] = await Promise.all([
    getAttorneyWorkflowOperationsForTransaction(transactionId),
    getAttorneyManualBlockers(transactionId),
  ])
  return calculateAttorneyReadinessForOperations(operations, manualBlockers)
}

export async function detectAttorneyBlockers(transactionId) {
  const readiness = await calculateAttorneyReadiness(transactionId)
  return readiness.blockers
}

export async function getAttorneyNextActions(transactionId) {
  const readiness = await calculateAttorneyReadiness(transactionId)
  return readiness.nextActions
}

export async function calculateLodgementReadiness(transactionId) {
  const readiness = await calculateAttorneyReadiness(transactionId)
  return readiness.lodgement
}

export async function calculateRegistrationReadiness(transactionId) {
  const readiness = await calculateAttorneyReadiness(transactionId)
  return readiness.registration
}

export async function addAttorneyManualBlocker({
  transactionId,
  laneKey = 'transfer',
  title,
  description = '',
  severity = 'medium',
  owner = 'attorney',
  visibility = 'internal',
  dueDate = null,
} = {}) {
  const { assertCanPublishVisibility, getAttorneyLegalPermissionContext } = await import('../permissions/attorneyPermissionService.js')
  const { getAuthenticatedUser, isMissingTableError, requireClient } = await import('../attorneyFirmServiceShared.js')
  const client = requireClient()
  const actor = await getAuthenticatedUser(client)
  const normalizedTransactionId = String(transactionId || '').trim()
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  const attorneyRole = ROLE_BY_LANE[normalizedLaneKey] || 'transfer_attorney'
  const normalizedTitle = String(title || '').trim()
  if (!normalizedTransactionId) throw new Error('Transaction id is required.')
  if (!normalizedTitle) throw new Error('Blocker title is required.')

  const permissionContext = await getAttorneyLegalPermissionContext({
    userId: actor.id,
    transactionId: normalizedTransactionId,
    attorneyRole,
  })
  if (!permissionContext.canAddInternalNote && !permissionContext.canUpdateLane) {
    throw new Error('You do not have permission to add attorney blockers.')
  }
  assertCanPublishVisibility(permissionContext, visibility)

  const payload = {
    transaction_id: normalizedTransactionId,
    title: normalizedTitle,
    description: String(description || '').trim() || null,
    lane_key: normalizedLaneKey,
    attorney_role: attorneyRole,
    severity: normalizeSeverity(severity),
    owner: String(owner || 'attorney').trim().toLowerCase(),
    visibility,
    due_date: dueDate || null,
    created_by: actor.id,
    metadata: {},
  }

  const insert = await client.from('attorney_workflow_blockers').insert(payload).select('id').maybeSingle()
  if (insert.error) {
    if (isMissingTableError(insert.error, 'attorney_workflow_blockers')) {
      throw new Error('Attorney blocker tracking is not set up yet.')
    }
    throw insert.error
  }

  await insertTransactionEvent(client, {
    transactionId: normalizedTransactionId,
    eventType: payload.severity === 'critical' ? 'AttorneyCriticalBlockerCreated' : 'AttorneyManualBlockerAdded',
    actorId: actor.id,
    visibility: payload.visibility,
    eventData: {
      blockerId: insert.data?.id || null,
      title: payload.title,
      laneKey: payload.lane_key,
      attorneyRole: payload.attorney_role,
      severity: payload.severity,
    },
  }).catch(() => null)

  return calculateAttorneyReadiness(normalizedTransactionId)
}

export async function resolveAttorneyManualBlocker({ transactionId, blockerId } = {}) {
  const { getAttorneyLegalPermissionContext } = await import('../permissions/attorneyPermissionService.js')
  const { getAuthenticatedUser, isMissingTableError, requireClient } = await import('../attorneyFirmServiceShared.js')
  const client = requireClient()
  const actor = await getAuthenticatedUser(client)
  const normalizedTransactionId = String(transactionId || '').trim()
  const normalizedBlockerId = String(blockerId || '').trim()
  if (!normalizedTransactionId || !normalizedBlockerId) throw new Error('Blocker is required.')

  const existing = await client
    .from('attorney_workflow_blockers')
    .select('id, transaction_id, lane_key, attorney_role, title, visibility')
    .eq('id', normalizedBlockerId)
    .eq('transaction_id', normalizedTransactionId)
    .maybeSingle()

  if (existing.error) {
    if (isMissingTableError(existing.error, 'attorney_workflow_blockers')) {
      throw new Error('Attorney blocker tracking is not set up yet.')
    }
    throw existing.error
  }
  if (!existing.data) throw new Error('Blocker not found.')

  const permissionContext = await getAttorneyLegalPermissionContext({
    userId: actor.id,
    transactionId: normalizedTransactionId,
    attorneyRole: existing.data.attorney_role || normalizeRole(existing.data.lane_key),
  })
  if (!permissionContext.canAddInternalNote && !permissionContext.canUpdateLane) {
    throw new Error('You do not have permission to resolve attorney blockers.')
  }

  const update = await client
    .from('attorney_workflow_blockers')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: actor.id,
    })
    .eq('id', normalizedBlockerId)
    .eq('transaction_id', normalizedTransactionId)

  if (update.error) throw update.error

  await insertTransactionEvent(client, {
    transactionId: normalizedTransactionId,
    eventType: 'AttorneyManualBlockerResolved',
    actorId: actor.id,
    visibility: existing.data.visibility || 'internal',
    eventData: {
      blockerId: existing.data.id,
      title: existing.data.title,
      laneKey: existing.data.lane_key,
      attorneyRole: existing.data.attorney_role,
    },
  }).catch(() => null)

  return calculateAttorneyReadiness(normalizedTransactionId)
}

export async function reopenAttorneyManualBlocker({ transactionId, blockerId } = {}) {
  const { getAuthenticatedUser, isMissingTableError, requireClient } = await import('../attorneyFirmServiceShared.js')
  const client = requireClient()
  const actor = await getAuthenticatedUser(client)
  const normalizedTransactionId = String(transactionId || '').trim()
  const normalizedBlockerId = String(blockerId || '').trim()
  if (!normalizedTransactionId || !normalizedBlockerId) throw new Error('Blocker is required.')

  const update = await client
    .from('attorney_workflow_blockers')
    .update({
      resolved_at: null,
      resolved_by: null,
    })
    .eq('id', normalizedBlockerId)
    .eq('transaction_id', normalizedTransactionId)

  if (update.error) {
    if (isMissingTableError(update.error, 'attorney_workflow_blockers')) {
      throw new Error('Attorney blocker tracking is not set up yet.')
    }
    throw update.error
  }

  await insertTransactionEvent(client, {
    transactionId: normalizedTransactionId,
    eventType: 'AttorneyManualBlockerReopened',
    actorId: actor.id,
    visibility: 'internal',
    eventData: { blockerId: normalizedBlockerId },
  }).catch(() => null)

  return calculateAttorneyReadiness(normalizedTransactionId)
}

export async function getReadyForLodgementMatters(firmId, { limit = 100 } = {}) {
  const { getFirmAttorneyAssignments } = await import('../transactionAttorneyAssignments.js')
  const assignments = await getFirmAttorneyAssignments(firmId).catch(() => [])
  const transactionIds = [...new Set(assignments.map((assignment) => assignment.transactionId).filter(Boolean))].slice(0, limit)
  const rows = []
  for (const transactionId of transactionIds) {
    try {
      const readiness = await calculateAttorneyReadiness(transactionId)
      if (readiness.readyForLodgement || readiness.nearReadyForLodgement) {
        rows.push({
          transactionId,
          readiness: readiness.lodgementReadiness,
          ready: readiness.readyForLodgement,
          nearReady: readiness.nearReadyForLodgement,
          missingCount: readiness.lodgement?.missing?.length || 0,
          blockers: readiness.blockers,
          nextActions: readiness.nextActions,
        })
      }
    } catch {
      // Skip rows the current user cannot read; the queue must not leak matters.
    }
  }
  return rows.sort((left, right) => Number(right.readiness || 0) - Number(left.readiness || 0))
}

export function summarizeAttorneyReadinessForManagement(readinessRows = []) {
  const rows = readinessRows || []
  return {
    mattersAtRisk: rows.filter((row) => row.atRisk).length,
    readyForLodgement: rows.filter((row) => row.readyForLodgement).length,
    missingAttorneyAssignment: rows.filter((row) => (row.blockers || []).some((item) => item.category === 'missing_assignment')).length,
    outstandingSignatures: rows.filter((row) => (row.blockers || []).some((item) => item.category === 'unsigned_document')).length,
    documentsRejected: rows.filter((row) => (row.blockers || []).some((item) => item.category === 'rejected_document')).length,
    noActivityOverThreshold: rows.filter((row) => (row.blockers || []).some((item) => item.category === 'inactive_matter')).length,
    criticalBlockers: rows.reduce((count, row) => count + (row.blockers || []).filter((item) => item.severity === 'critical').length, 0),
  }
}
