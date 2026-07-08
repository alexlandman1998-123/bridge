import {
  INVITE_ACCEPTANCE_RECONCILIATION_ACTIONS,
  INVITE_ACCEPTANCE_RECONCILIATION_VERSION,
  buildInviteAcceptanceReconciliationPlan,
} from './invitationAcceptanceReconciliation.js'

export const INVITE_ACCEPTANCE_HEALTH_VERSION = 'invite_acceptance_health_v1'

export const INVITE_ACCEPTANCE_HEALTH_STATUSES = Object.freeze({
  healthy: 'healthy',
  attention: 'attention',
  blocked: 'blocked',
})

const ACTIONS = INVITE_ACCEPTANCE_RECONCILIATION_ACTIONS
const STATUSES = INVITE_ACCEPTANCE_HEALTH_STATUSES

function normalizeText(value = '') {
  return String(value || '').trim()
}

function asInteger(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0
}

function normalizePlan(input = {}, options = {}) {
  if (input?.version === INVITE_ACCEPTANCE_RECONCILIATION_VERSION && Array.isArray(input.actions)) return input
  return buildInviteAcceptanceReconciliationPlan(input, options)
}

function countWhere(actions = [], predicate) {
  return actions.reduce((total, action) => total + (predicate(action) ? 1 : 0), 0)
}

function bySource(actions = []) {
  const counts = {}
  for (const action of actions) {
    const source = normalizeText(action.source) || 'unknown'
    counts[source] = (counts[source] || 0) + 1
  }
  return counts
}

function compactAction(action = {}) {
  return {
    id: action.id,
    source: action.source,
    action: action.action,
    category: action.category,
    email: action.email || null,
    senderOrganisationId: action.senderOrganisationId || null,
    acceptingOrganisationId: action.acceptingOrganisationId || null,
    transactionId: action.transactionId || null,
    roleType: action.roleType || null,
    reasonCodes: action.reasonCodes || [],
    note: action.note || '',
  }
}

function buildSections(actions = []) {
  return {
    repairNow: actions.filter((action) => action.safeToRepair).map(compactAction),
    manualReview: actions.filter((action) => action.manualReviewRequired).map(compactAction),
    reinvite: actions.filter((action) => action.requiresReinvite).map(compactAction),
    waitOrResume: actions
      .filter((action) => action.resendExistingLink || action.resumeExistingInvite)
      .map(compactAction),
  }
}

function buildChecks(totals = {}) {
  return [
    {
      key: 'no_safe_repairs_pending',
      ok: totals.repairWithoutReinvite === 0,
      count: totals.repairWithoutReinvite,
      message: totals.repairWithoutReinvite
        ? 'Accepted invites still need Phase 5 repair before the system is clean.'
        : 'No safe repair rows remain.',
    },
    {
      key: 'no_manual_review_pending',
      ok: totals.manualReviewRequired === 0,
      count: totals.manualReviewRequired,
      message: totals.manualReviewRequired
        ? 'Some invites have ambiguous workspace/email state and need manual review.'
        : 'No manual review rows remain.',
    },
    {
      key: 'no_reinvite_required',
      ok: totals.reinviteRequired === 0,
      count: totals.reinviteRequired,
      message: totals.reinviteRequired
        ? 'Some terminal invites need a fresh invite.'
        : 'No terminal reinvite rows remain.',
    },
    {
      key: 'existing_links_reusable',
      ok: true,
      count: totals.waitOrResume,
      message: totals.waitOrResume
        ? 'Pending/resumable rows should reuse the current invite link, not trigger blanket reinvites.'
        : 'No pending/resumable rows require operator nudges.',
    },
  ]
}

function resolveStatus(totals = {}) {
  if (totals.repairWithoutReinvite || totals.manualReviewRequired || totals.reinviteRequired) return STATUSES.blocked
  if (totals.waitOrResume) return STATUSES.attention
  return STATUSES.healthy
}

function buildNextActions(status, totals = {}) {
  if (status === STATUSES.healthy) {
    return ['Invite acceptance is clean; keep the health gate in the rollout checklist.']
  }

  const actions = []
  if (totals.repairWithoutReinvite) {
    actions.push('Run the Phase 5 service-role repair SQL for safeToRepair rows, then rerun the health gate.')
  }
  if (totals.manualReviewRequired) {
    actions.push('Resolve manual_review_required rows before repair or reinvite; do not guess the workspace.')
  }
  if (totals.reinviteRequired) {
    actions.push('Reinvite only terminal rows after confirming the original invite cannot be resumed.')
  }
  if (totals.waitOrResume) {
    actions.push('For wait/resume rows, resend or reopen the existing invite link instead of creating a new invite.')
  }
  return actions
}

export function buildInviteAcceptanceHealthReport(input = {}, options = {}) {
  const plan = normalizePlan(input, options)
  const actions = Array.isArray(plan.actions) ? plan.actions : []
  const totals = {
    total: actions.length,
    complete: countWhere(actions, (action) => action.action === ACTIONS.noAction),
    repairWithoutReinvite: countWhere(actions, (action) => action.safeToRepair),
    manualReviewRequired: countWhere(actions, (action) => action.manualReviewRequired),
    reinviteRequired: countWhere(actions, (action) => action.requiresReinvite),
    waitOrResume: countWhere(actions, (action) => action.resendExistingLink || action.resumeExistingInvite),
    pendingExistingLink: countWhere(actions, (action) => action.resendExistingLink),
    resumeExistingInvite: countWhere(actions, (action) => action.resumeExistingInvite),
    bySource: bySource(actions),
  }
  totals.unresolved = totals.repairWithoutReinvite + totals.manualReviewRequired + totals.reinviteRequired

  const status = resolveStatus(totals)
  const failOnAttention = Boolean(options.failOnAttention)
  const exitCode = status === STATUSES.blocked || (failOnAttention && status === STATUSES.attention) ? 1 : 0
  const sections = buildSections(actions)

  return {
    version: INVITE_ACCEPTANCE_HEALTH_VERSION,
    reconciliationVersion: plan.version || null,
    source: plan.source || options.source || null,
    generatedAt: (options.now instanceof Date ? options.now : new Date(options.now || Date.now())).toISOString(),
    status,
    gate: {
      pass: exitCode === 0,
      exitCode,
      failOnAttention,
      reason: status === STATUSES.blocked
        ? 'Invite acceptance has repair/manual-review/reinvite work outstanding.'
        : status === STATUSES.attention
          ? 'Invite acceptance is structurally safe, with pending users to nudge through existing links.'
          : 'Invite acceptance is clean.',
    },
    totals,
    checks: buildChecks(totals),
    sections,
    nextActions: buildNextActions(status, totals),
    planSummary: {
      migrationRequired: plan.migrationRequired || null,
      sqlRepairCalls: asInteger(plan.summary?.sqlRepairCalls),
      noAction: asInteger(plan.summary?.noAction),
    },
  }
}

export function renderInviteAcceptanceHealthText(report = {}) {
  const totals = report.totals || {}
  const lines = [
    `Invite acceptance health: ${report.status || 'unknown'}`,
    `Total: ${asInteger(totals.total)} | complete: ${asInteger(totals.complete)} | repair: ${asInteger(totals.repairWithoutReinvite)} | manual review: ${asInteger(totals.manualReviewRequired)} | reinvite: ${asInteger(totals.reinviteRequired)} | wait/resume: ${asInteger(totals.waitOrResume)}`,
    `Gate: ${report.gate?.pass ? 'pass' : 'fail'} (${report.gate?.reason || 'No reason provided.'})`,
    '',
    'Next actions:',
    ...(report.nextActions || []).map((action) => `- ${action}`),
  ]
  return `${lines.join('\n')}\n`
}
