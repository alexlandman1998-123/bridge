import {
  INVITE_ACCEPTANCE_AUDIT_CATEGORIES,
  INVITE_ACCEPTANCE_AUDIT_VERSION,
  buildInviteAcceptanceAudit,
} from './invitationAcceptanceAudit.js'

export const INVITE_ACCEPTANCE_RECONCILIATION_VERSION = 'invite_acceptance_reconciliation_v1'
export const INVITE_ACCEPTANCE_RECONCILIATION_MIGRATION = '202607080006_invite_acceptance_reconciliation_phase5.sql'

export const INVITE_ACCEPTANCE_RECONCILIATION_ACTIONS = Object.freeze({
  noAction: 'no_action',
  waitOrResendExistingLink: 'wait_or_resend_existing_link',
  resumeExistingInvite: 'resume_existing_invite_acceptance',
  repairPartnerConnection: 'repair_partner_connection_without_reinvite',
  repairTransactionConnection: 'repair_transaction_connection_without_reinvite',
  reinvite: 'reinvite_required',
  manualReview: 'manual_review_required',
})

const CATEGORIES = INVITE_ACCEPTANCE_AUDIT_CATEGORIES
const ACTIONS = INVITE_ACCEPTANCE_RECONCILIATION_ACTIONS

const REPAIR_BLOCKING_REASON_CODES = new Set([
  'accepted_user_email_mismatch',
  'ambiguous_accepting_organisation',
  'accepting_workspace_membership_missing',
  'accepting_membership_not_confirmed',
  'self_relationship',
  'transaction_owner_organisation_missing',
])

const REPAIRABLE_CATEGORIES = new Set([
  CATEGORIES.signedUpButNoPartnerConnection,
  CATEGORIES.acceptedInviteButMissingOrganisationPartners,
  CATEGORIES.transactionAccessExistsButNoPartnerConnection,
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeStatus(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function isUuid(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function sqlLiteral(value = '') {
  return `'${normalizeText(value).replace(/'/g, "''")}'`
}

function hasRepairBlockingReason(item = {}) {
  return (item.reasonCodes || []).some((code) => REPAIR_BLOCKING_REASON_CODES.has(normalizeStatus(code)))
}

function hasRequiredRelationshipShape(item = {}) {
  const senderOrganisationId = normalizeText(item.senderOrganisationId)
  const acceptingOrganisationId = normalizeText(item.acceptingOrganisationId)
  return Boolean(senderOrganisationId && acceptingOrganisationId && senderOrganisationId !== acceptingOrganisationId)
}

function isAcceptedLike(item = {}) {
  return normalizeStatus(item.status) === 'accepted' || Boolean(item.acceptedUserId)
}

function resolveRepairAction(item = {}) {
  if (item.source === 'transaction_partner') return ACTIONS.repairTransactionConnection
  return ACTIONS.repairPartnerConnection
}

function resolveAction(item = {}) {
  const category = item.category
  if (category === CATEGORIES.complete) return ACTIONS.noAction
  if (category === CATEGORIES.pendingInviteNoSignup) return ACTIONS.waitOrResendExistingLink
  if (category === CATEGORIES.readyToAccept) return ACTIONS.resumeExistingInvite
  if (category === CATEGORIES.expiredOrRevoked) return ACTIONS.reinvite
  if (category === CATEGORIES.wrongEmailOrWrongWorkspace || category === CATEGORIES.manualReviewRequired) return ACTIONS.manualReview
  if (category === CATEGORIES.signedUpButNoPartnerConnection && !isAcceptedLike(item)) return ACTIONS.resumeExistingInvite
  if (REPAIRABLE_CATEGORIES.has(category)) return resolveRepairAction(item)
  return ACTIONS.manualReview
}

function buildSqlCall(item = {}, action = '') {
  if (!isUuid(item.id)) return ''
  if (action === ACTIONS.repairPartnerConnection) {
    return `select public.bridge_repair_partner_invitation_acceptance(${sqlLiteral(item.id)}::uuid) as result;`
  }
  if (action === ACTIONS.repairTransactionConnection) {
    return `select public.bridge_repair_transaction_partner_invitation_acceptance(${sqlLiteral(item.id)}::uuid) as result;`
  }
  return ''
}

function buildReconciliationItem(item = {}) {
  const action = resolveAction(item)
  const repairAction = action === ACTIONS.repairPartnerConnection || action === ACTIONS.repairTransactionConnection
  const safeRelationshipShape = hasRequiredRelationshipShape(item)
  const repairBlocked = hasRepairBlockingReason(item)
  const sql = repairAction && safeRelationshipShape && !repairBlocked ? buildSqlCall(item, action) : ''
  const safeToRepair = Boolean(repairAction && sql)
  const requiresReinvite = action === ACTIONS.reinvite
  const manualReviewRequired = action === ACTIONS.manualReview || (repairAction && !safeToRepair)

  return {
    id: normalizeText(item.id),
    source: item.source,
    category: item.category,
    action: manualReviewRequired && repairAction ? ACTIONS.manualReview : action,
    originalAction: item.action || null,
    safeToRepair,
    canRepairWithoutReinvite: safeToRepair,
    requiresReinvite,
    manualReviewRequired,
    resendExistingLink: action === ACTIONS.waitOrResendExistingLink,
    resumeExistingInvite: action === ACTIONS.resumeExistingInvite,
    senderOrganisationId: item.senderOrganisationId || null,
    acceptingOrganisationId: item.acceptingOrganisationId || null,
    transactionId: item.transactionId || null,
    roleType: item.roleType || null,
    acceptedUserId: item.acceptedUserId || null,
    email: item.email || null,
    reasonCodes: item.reasonCodes || [],
    contract: item.contract || null,
    sql,
    note: buildActionNote({ item, action, safeToRepair, manualReviewRequired, repairBlocked, safeRelationshipShape }),
  }
}

function buildActionNote({ item, action, safeToRepair, manualReviewRequired, repairBlocked, safeRelationshipShape }) {
  if (safeToRepair) return 'Repair with the Phase 5 service-role RPC; no reinvite is needed.'
  if (action === ACTIONS.noAction) return 'Already complete.'
  if (action === ACTIONS.waitOrResendExistingLink) return 'Do not reinvite yet; wait for signup or resend the existing live link.'
  if (action === ACTIONS.resumeExistingInvite) return 'Do not reinvite; ask the user to reopen the existing invite after workspace setup/sign-in.'
  if (action === ACTIONS.reinvite) return 'The invite is terminal or expired; issue a new invite.'
  if (manualReviewRequired && repairBlocked) return 'Manual review required before repair because the audit found a mismatch or ambiguous workspace.'
  if (manualReviewRequired && !safeRelationshipShape) return 'Manual review required because the owner or accepting organisation could not be resolved safely.'
  return `Manual review required for ${item.category}.`
}

function buildSummary(actions = []) {
  const summary = {
    total: actions.length,
    noAction: 0,
    repairWithoutReinvite: 0,
    waitOrResendExistingLink: 0,
    resumeExistingInvite: 0,
    reinviteRequired: 0,
    manualReviewRequired: 0,
    sqlRepairCalls: 0,
    byAction: {},
  }

  for (const action of actions) {
    summary.byAction[action.action] = (summary.byAction[action.action] || 0) + 1
    if (action.action === ACTIONS.noAction) summary.noAction += 1
    if (action.safeToRepair) summary.repairWithoutReinvite += 1
    if (action.resendExistingLink) summary.waitOrResendExistingLink += 1
    if (action.resumeExistingInvite) summary.resumeExistingInvite += 1
    if (action.requiresReinvite) summary.reinviteRequired += 1
    if (action.manualReviewRequired) summary.manualReviewRequired += 1
    if (action.sql) summary.sqlRepairCalls += 1
  }

  return summary
}

export function normalizeInviteAcceptanceAuditReport(input = {}, options = {}) {
  if (input?.version === INVITE_ACCEPTANCE_AUDIT_VERSION && Array.isArray(input.items)) return input
  return buildInviteAcceptanceAudit(input, {
    source: input?.source || options.source || 'invite_acceptance_reconciliation_input',
    now: options.now,
  })
}

export function buildInviteAcceptanceReconciliationPlan(input = {}, options = {}) {
  const auditReport = normalizeInviteAcceptanceAuditReport(input, options)
  const actions = (auditReport.items || []).map(buildReconciliationItem)
  return {
    version: INVITE_ACCEPTANCE_RECONCILIATION_VERSION,
    auditVersion: auditReport.version || null,
    source: auditReport.source || options.source || null,
    generatedAt: (options.now instanceof Date ? options.now : new Date(options.now || Date.now())).toISOString(),
    migrationRequired: INVITE_ACCEPTANCE_RECONCILIATION_MIGRATION,
    summary: buildSummary(actions),
    actions,
    nextSteps: [
      'Apply the Phase 5 reconciliation migration before executing generated repair SQL.',
      'Execute only service-role repair calls for safeToRepair rows.',
      'Do not reinvite wait/resume rows; reuse the existing invite link.',
      'Reinvite only rows marked reinvite_required after confirming the old invite is terminal.',
      'Resolve manual_review_required rows before repair or reinvite.',
    ],
  }
}

export function renderInviteAcceptanceReconciliationSql(plan = {}) {
  const lines = [
    '-- Invite acceptance reconciliation repair packet',
    `-- Version: ${INVITE_ACCEPTANCE_RECONCILIATION_VERSION}`,
    `-- Required migration: ${INVITE_ACCEPTANCE_RECONCILIATION_MIGRATION}`,
    '-- Review before running. Execute with the Supabase service role only.',
    'begin;',
    '',
  ]

  for (const action of plan.actions || []) {
    lines.push(`-- ${action.id} (${action.source}): ${action.action}`)
    lines.push(`-- ${action.note}`)
    if (action.sql) {
      lines.push(action.sql)
    } else {
      lines.push('-- no SQL generated')
    }
    lines.push('')
  }

  lines.push('commit;')
  lines.push('')
  return lines.join('\n')
}
