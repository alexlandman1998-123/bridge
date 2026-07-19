import { evaluateMvpLaunchScope } from './mvpLaunchScope.js'
import { resolveMvpLaunchRolePlan } from './mvpLaunchRoles.js'
import { evaluateMvpOnboardingGate } from './mvpOnboardingGate.js'
import { evaluateMvpOtpGate } from './mvpOtpGate.js'
import { evaluateMvpFinanceGate } from './mvpFinanceGate.js'
import { evaluateMvpTransferGate } from './mvpTransferGate.js'

export const MVP_TRANSACTION_TRUTH_VERSION = 'arch9_mvp_transaction_truth_v1'

const COMPLETE_DOCUMENT_STATUSES = new Set(['approved', 'completed', 'signed', 'waived', 'not_applicable'])
const INACTIVE_PARTICIPANT_STATUSES = new Set(['removed', 'inactive', 'declined', 'expired'])

const STAGE_META = Object.freeze({
  AVAIL: { rank: 0, label: 'Available' },
  DEP: { rank: 0, label: 'Deal Setup' },
  OTP: { rank: 1, label: 'OTP / Onboarding' },
  FIN: { rank: 2, label: 'Finance' },
  ATTY: { rank: 3, label: 'Attorney / Transfer' },
  REG: { rank: 4, label: 'Registration' },
  REGISTRATION: { rank: 4, label: 'Registration' },
  COMPLETE: { rank: 5, label: 'Complete' },
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeStage(value) {
  const key = normalizeKey(value).toUpperCase()
  if (['AVAILABLE', 'AVAIL'].includes(key)) return 'AVAIL'
  if (['DEAL_SETUP', 'RESERVED', 'DEP'].includes(key)) return 'DEP'
  if (key.includes('OTP') || key.includes('ONBOARD')) return 'OTP'
  if (key.includes('FIN') || key.includes('BOND')) return 'FIN'
  if (key.includes('ATTORNEY') || key.includes('TRANSFER') || key === 'ATTY') return 'ATTY'
  if (key.includes('REGISTRATION') || key === 'REG') return 'REG'
  if (['COMPLETE', 'COMPLETED', 'REGISTERED'].includes(key)) return 'COMPLETE'
  return key || 'UNKNOWN'
}

function uniqueByKey(items = []) {
  return [...new Map(items.map((item) => [item.key, item])).values()]
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function readDate(item = {}) {
  const value = item.createdAt || item.created_at || item.updatedAt || item.updated_at || item.occurredAt || item.occurred_at || null
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function resolveParticipantRoleKeys(participant = {}) {
  const metadata = participant.metadata || participant.metadata_json || {}
  const explicitRole = normalizeKey(
    participant.mvpLaunchRoleKey ||
      participant.mvp_launch_role_key ||
      metadata.mvpLaunchRoleKey ||
      metadata.mvp_launch_role_key,
  )
  if (explicitRole) return [explicitRole]

  const transactionRole = normalizeKey(participant.transactionRole || participant.transaction_role)
  if (transactionRole) return [transactionRole]

  const roleType = normalizeKey(participant.roleType || participant.role_type)
  const legalRole = normalizeKey(participant.legalRole || participant.legal_role)
  if (roleType === 'attorney') {
    if (legalRole === 'bond') return ['bond_attorney']
    if (legalRole === 'cancellation') return ['cancellation_attorney']
    return ['transfer_attorney']
  }
  if (roleType === 'developer') return ['developer_representative']
  return roleType ? [roleType] : []
}

function isActiveParticipant(participant = {}) {
  return !INACTIVE_PARTICIPANT_STATUSES.has(normalizeKey(participant.status || 'active'))
}

function isRequiredDocument(requirement = {}) {
  if (requirement.required === false) return false
  const level = normalizeKey(requirement.requirementLevel || requirement.requirement_level)
  return level !== 'optional' && level !== 'not_applicable'
}

function isCompletedDocument(requirement = {}) {
  return COMPLETE_DOCUMENT_STATUSES.has(normalizeKey(requirement.status))
}

function documentLabel(requirement = {}) {
  return normalizeText(
    requirement.label ||
      requirement.displayLabel ||
      requirement.display_label ||
      requirement.documentLabel ||
      requirement.document_definition_key ||
      requirement.key,
  ) || 'Required document'
}

function documentOwner(requirement = {}) {
  return normalizeKey(
    requirement.requestedFrom ||
      requirement.requested_from ||
      requirement.responsibleRole ||
      requirement.responsible_role ||
      requirement.assignedToRole ||
      requirement.assigned_to_role ||
      'transaction_coordinator',
  )
}

function buildDocumentSummary(requirements = []) {
  const required = toArray(requirements).filter(isRequiredDocument)
  const completed = required.filter(isCompletedDocument)
  const outstanding = required.filter((item) => !isCompletedDocument(item))
  const rejected = outstanding.filter((item) => normalizeKey(item.status) === 'rejected')
  const pendingReview = outstanding.filter((item) => ['uploaded', 'under_review'].includes(normalizeKey(item.status)))
  const blocking = outstanding.filter((item) => {
    const level = normalizeKey(item.requirementLevel || item.requirement_level)
    return level === 'blocker' || normalizeKey(item.status) === 'rejected'
  })

  return {
    requiredCount: required.length,
    completedCount: completed.length,
    outstandingCount: outstanding.length,
    rejectedCount: rejected.length,
    pendingReviewCount: pendingReview.length,
    blocking,
    outstanding,
  }
}

function requiredRolesForStage(rolePlan = {}, stageRank = 0) {
  const roles = [...toArray(rolePlan.requiredAtCreation)]
  if (stageRank >= 1) roles.push(...toArray(rolePlan.requiredByOtp))
  if (stageRank >= 2) roles.push(...toArray(rolePlan.requiredByFinance))
  if (stageRank >= 3) roles.push(...toArray(rolePlan.requiredByTransfer))
  return uniqueByKey(roles).filter((role) => role.key !== 'internal_admin')
}

function buildParticipantSummary(participants = [], rolePlan = {}, stageRank = 0) {
  const activeParticipants = toArray(participants).filter(isActiveParticipant)
  const activeRoleKeys = new Set(activeParticipants.flatMap(resolveParticipantRoleKeys))
  const requiredNow = requiredRolesForStage(rolePlan, stageRank)
  const missing = requiredNow.filter((role) => !activeRoleKeys.has(role.key))

  return {
    activeCount: activeParticipants.length,
    requiredNow,
    missing,
    upcoming: toArray(rolePlan.roles).filter((role) => !requiredNow.some((requiredRole) => requiredRole.key === role.key) && role.key !== 'internal_admin'),
  }
}

function buildWorkflowBlockers(lanes = []) {
  return toArray(lanes)
    .filter((lane) => normalizeKey(lane.status) === 'blocked' || normalizeText(lane.blockedReason || lane.blocked_reason))
    .map((lane) => ({
      key: `workflow:${normalizeKey(lane.laneKey || lane.lane_key || lane.processType || lane.process_type || 'lane')}`,
      type: 'workflow',
      label: normalizeText(lane.laneLabel || lane.lane_label || lane.label || lane.laneKey || lane.process_type) || 'Workflow lane',
      ownerRole: normalizeKey(lane.ownerRole || lane.owner_role || lane.ownerType || lane.owner_type || 'transaction_coordinator'),
      reason: normalizeText(lane.blockedReason || lane.blocked_reason) || 'Workflow lane is blocked.',
    }))
}

function buildRecentActivity(events = []) {
  const sorted = [...toArray(events)]
    .map((event) => ({ event, date: readDate(event) }))
    .sort((left, right) => (right.date?.getTime() || 0) - (left.date?.getTime() || 0))
  const latest = sorted[0]?.event || null
  if (!latest) {
    return { recorded: false, label: 'No transaction activity has been recorded yet.', at: null, type: null }
  }
  return {
    recorded: true,
    label: normalizeText(latest.label || latest.description || latest.eventType || latest.event_type) || 'Transaction activity recorded',
    at: latest.createdAt || latest.created_at || latest.updatedAt || latest.updated_at || null,
    type: normalizeKey(latest.eventType || latest.event_type) || null,
  }
}

export function buildMvpTransactionTruth({
  transaction = {},
  routingProfile = {},
  participants = [],
  documentRequirements = [],
  workflowLanes = [],
  events = [],
} = {}) {
  const stageKey = normalizeStage(transaction.currentMainStage || transaction.current_main_stage || transaction.stage)
  const stageMeta = STAGE_META[stageKey] || { rank: 0, label: 'Stage not set' }
  const launchScope = routingProfile.launchScope || evaluateMvpLaunchScope(routingProfile)
  const rolePlan = routingProfile.launchRolePlan || resolveMvpLaunchRolePlan(routingProfile)
  const documents = buildDocumentSummary(documentRequirements)
  const participantSummary = buildParticipantSummary(participants, rolePlan, stageMeta.rank)
  const onboardingGate = evaluateMvpOnboardingGate({ participants, documentRequirements })
  const otpGate = evaluateMvpOtpGate({ routingProfile, participants, documentRequirements })
  const financeGate = evaluateMvpFinanceGate({ routingProfile, participants, documentRequirements })
  const transferGate = evaluateMvpTransferGate({ routingProfile, participants, documentRequirements })
  const workflowBlockers = buildWorkflowBlockers(workflowLanes)
  const scopeBlockers = launchScope.issues.map((item) => ({
    key: `scope:${item.field}:${item.code}`,
    type: 'scope',
    label: item.label,
    ownerRole: 'agent',
    reason: item.code === 'missing_required_routing_fact'
      ? `${item.label} is required before the transaction can progress through the MVP workflow.`
      : `${item.label} is outside the MVP transaction scope.`,
  }))
  const participantBlockers = participantSummary.missing.map((role) => ({
    key: `participant:${role.key}`,
    type: 'participant',
    label: role.label,
    ownerRole: 'agent',
    reason: `${role.label} is required by ${role.requiredBy.replace(/_/g, ' ')}.`,
  }))
  const documentBlockers = documents.blocking.map((requirement) => ({
    key: `document:${normalizeKey(requirement.id || requirement.key || requirement.document_definition_key || documentLabel(requirement))}`,
    type: 'document',
    label: documentLabel(requirement),
    ownerRole: documentOwner(requirement),
    reason: normalizeKey(requirement.status) === 'rejected'
      ? `${documentLabel(requirement)} was rejected and needs replacement or review.`
      : `${documentLabel(requirement)} is required before this workflow can progress.`,
  }))
  const onboardingBlockers = stageMeta.rank === 0
    ? onboardingGate.blockers.map((blocker) => ({ ...blocker, type: 'onboarding', label: 'Onboarding gate' }))
    : []
  const otpBlockers = stageMeta.rank === 1
    ? otpGate.blockers.map((blocker) => ({ ...blocker, type: 'otp', label: 'OTP execution gate' }))
    : []
  const financeBlockers = stageMeta.rank === 2
    ? financeGate.blockers.map((blocker) => ({ ...blocker, type: 'finance', label: 'Finance readiness gate' }))
    : []
  const transferBlockers = stageMeta.rank === 3
    ? transferGate.blockers.map((blocker) => ({ ...blocker, type: 'transfer', label: 'Transfer readiness gate' }))
    : []
  const blockers = uniqueByKey([...scopeBlockers, ...workflowBlockers, ...participantBlockers, ...documentBlockers, ...onboardingBlockers, ...otpBlockers, ...financeBlockers, ...transferBlockers])
  const explicitNextAction = normalizeText(transaction.nextAction || transaction.next_action)
  const firstOutstandingDocument = documents.outstanding[0] || null
  const nextAction = blockers[0]
    ? { ownerRole: blockers[0].ownerRole, label: blockers[0].reason, source: blockers[0].type }
    : explicitNextAction
      ? { ownerRole: normalizeKey(transaction.waitingOnRole || transaction.waiting_on_role || 'transaction_coordinator'), label: explicitNextAction, source: 'transaction' }
      : firstOutstandingDocument
        ? { ownerRole: documentOwner(firstOutstandingDocument), label: `Complete ${documentLabel(firstOutstandingDocument)}.`, source: 'document' }
        : { ownerRole: 'transaction_coordinator', label: 'Monitor the transaction and progress the next workflow step.', source: 'default' }
  const recentActivity = buildRecentActivity(events)
  const summaryStatus = !launchScope.supported
    ? launchScope.status === 'out_of_scope' ? 'out_of_scope' : 'incomplete'
    : blockers.length ? 'blocked'
      : documents.outstandingCount ? 'attention_required'
        : 'ready'
  const missingAnswers = []
  if (stageKey === 'UNKNOWN') missingAnswers.push('stage')
  if (!transaction.id && !transaction.transactionId) missingAnswers.push('transaction_id')

  return {
    version: MVP_TRANSACTION_TRUTH_VERSION,
    transactionId: transaction.id || transaction.transactionId || null,
    stage: { key: stageKey, label: stageMeta.label, rank: stageMeta.rank },
    blockers,
    nextAction,
    documents,
    participants: participantSummary,
    recentActivity,
    readiness: {
      status: summaryStatus,
      canProgress: launchScope.supported && blockers.length === 0,
      launchScopeStatus: launchScope.status,
      outstandingDocumentCount: documents.outstandingCount,
      missingParticipantCount: participantSummary.missing.length,
      onboardingGateSatisfied: onboardingGate.satisfied,
      otpGateSatisfied: otpGate.satisfied,
      financeGateSatisfied: financeGate.satisfied,
      transferGateSatisfied: transferGate.satisfied,
    },
    answers: {
      stage: stageKey !== 'UNKNOWN',
      blockers: true,
      nextAction: Boolean(nextAction.label),
      documents: true,
      participants: true,
      recentActivity: true,
      readiness: true,
    },
    missingAnswers,
    satisfiesMvpTruthContract: missingAnswers.length === 0,
  }
}
