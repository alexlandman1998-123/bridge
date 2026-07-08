import {
  INVITE_ACCEPTANCE_AUDIT_VERSION,
  buildInviteAcceptanceAudit,
} from './invitationAcceptanceAudit.js'
import {
  INVITE_ACCEPTANCE_RECONCILIATION_MIGRATION,
  INVITE_ACCEPTANCE_RECONCILIATION_VERSION,
  buildInviteAcceptanceReconciliationPlan,
  renderInviteAcceptanceReconciliationSql,
} from './invitationAcceptanceReconciliation.js'
import {
  INVITE_ACCEPTANCE_HEALTH_VERSION,
  buildInviteAcceptanceHealthReport,
  renderInviteAcceptanceHealthText,
} from './invitationAcceptanceHealth.js'

export const INVITE_ACCEPTANCE_ROLLOUT_VERSION = 'invite_acceptance_rollout_v1'

export const INVITE_ACCEPTANCE_ROLLOUT_REQUIRED_MIGRATIONS = Object.freeze([
  '202607080005_transaction_partner_invite_partner_org_binding.sql',
  INVITE_ACCEPTANCE_RECONCILIATION_MIGRATION,
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function asInteger(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0
}

function normalizeAuditReport(input = {}, options = {}) {
  if (input?.version === INVITE_ACCEPTANCE_AUDIT_VERSION && Array.isArray(input.items)) return input
  return buildInviteAcceptanceAudit(input, {
    source: input?.source || options.source || 'invite_acceptance_rollout_input',
    now: options.now,
  })
}

function buildChecklist(healthReport = {}) {
  const totals = healthReport.totals || {}
  const checklist = [
    {
      key: 'apply_required_migrations',
      done: false,
      label: 'Apply required database migrations in order.',
      detail: INVITE_ACCEPTANCE_ROLLOUT_REQUIRED_MIGRATIONS.join(', '),
    },
    {
      key: 'run_repair_sql',
      done: asInteger(totals.repairWithoutReinvite) === 0,
      label: 'Run the generated service-role repair SQL for safe repair rows.',
      detail: `${asInteger(totals.repairWithoutReinvite)} safe repair row(s).`,
    },
    {
      key: 'resolve_manual_review',
      done: asInteger(totals.manualReviewRequired) === 0,
      label: 'Resolve manual-review rows before repair or reinvite.',
      detail: `${asInteger(totals.manualReviewRequired)} manual-review row(s).`,
    },
    {
      key: 'issue_terminal_reinvites',
      done: asInteger(totals.reinviteRequired) === 0,
      label: 'Reinvite only terminal rows that cannot be resumed.',
      detail: `${asInteger(totals.reinviteRequired)} terminal reinvite row(s).`,
    },
    {
      key: 'nudge_existing_links',
      done: asInteger(totals.waitOrResume) === 0,
      label: 'Nudge pending/resumable users through their existing invite link.',
      detail: `${asInteger(totals.waitOrResume)} existing-link follow-up row(s).`,
    },
    {
      key: 'rerun_health_gate',
      done: healthReport.status === 'healthy',
      label: 'Rerun the Phase 6 health gate after repairs and operator actions.',
      detail: `Current status: ${healthReport.status || 'unknown'}.`,
    },
  ]
  return checklist
}

function buildOperatorCommands(outputDir = '') {
  const auditInput = '<audit-or-live-payload.json>'
  const safeOutputDir = normalizeText(outputDir) || '<output-dir>'
  return [
    `INVITE_ACCEPTANCE_ROLLOUT_INPUT=${auditInput} INVITE_ACCEPTANCE_ROLLOUT_OUTPUT_DIR=${safeOutputDir} npm run prepare:invite-acceptance-rollout`,
    `INVITE_ACCEPTANCE_HEALTH_INPUT=${safeOutputDir}/invite-acceptance-reconciliation.json npm run verify:invite-acceptance-health`,
    `INVITE_ACCEPTANCE_RECONCILE_INPUT=${safeOutputDir}/invite-acceptance-audit.json INVITE_ACCEPTANCE_RECONCILE_FORMAT=sql npm run reconcile:invite-acceptance`,
  ]
}

export function buildInviteAcceptanceRolloutPacket(input = {}, options = {}) {
  const generatedAt = (options.now instanceof Date ? options.now : new Date(options.now || Date.now())).toISOString()
  const auditReport = normalizeAuditReport(input, options)
  const reconciliationPlan = buildInviteAcceptanceReconciliationPlan(auditReport, {
    source: auditReport.source || options.source,
    now: generatedAt,
  })
  const healthReport = buildInviteAcceptanceHealthReport(reconciliationPlan, {
    source: reconciliationPlan.source || options.source,
    now: generatedAt,
    failOnAttention: Boolean(options.failOnAttention),
  })
  const repairSql = renderInviteAcceptanceReconciliationSql(reconciliationPlan)
  const healthText = renderInviteAcceptanceHealthText(healthReport)
  const checklist = buildChecklist(healthReport)

  return {
    version: INVITE_ACCEPTANCE_ROLLOUT_VERSION,
    generatedAt,
    source: auditReport.source || options.source || null,
    status: healthReport.status,
    gate: healthReport.gate,
    requiredMigrations: [...INVITE_ACCEPTANCE_ROLLOUT_REQUIRED_MIGRATIONS],
    versions: {
      audit: auditReport.version || null,
      reconciliation: reconciliationPlan.version || null,
      health: healthReport.version || null,
    },
    summary: {
      audit: auditReport.summary || {},
      reconciliation: reconciliationPlan.summary || {},
      health: healthReport.totals || {},
    },
    checklist,
    operatorCommands: buildOperatorCommands(options.outputDir),
    nextActions: healthReport.nextActions || [],
    artifacts: [
      'invite-acceptance-rollout.json',
      'invite-acceptance-audit.json',
      'invite-acceptance-reconciliation.json',
      'invite-acceptance-health.json',
      'invite-acceptance-repair.sql',
      'invite-acceptance-runbook.md',
    ],
    auditReport,
    reconciliationPlan,
    healthReport,
    repairSql,
    healthText,
  }
}

export function renderInviteAcceptanceRolloutRunbook(packet = {}) {
  const health = packet.healthReport || {}
  const totals = health.totals || {}
  const checklist = packet.checklist || []
  const commands = packet.operatorCommands || []
  const nextActions = packet.nextActions || []
  const migrations = packet.requiredMigrations || []

  const lines = [
    '# Invite Acceptance Rollout Packet',
    '',
    `Generated: ${packet.generatedAt || ''}`,
    `Status: ${packet.status || 'unknown'}`,
    `Gate: ${packet.gate?.pass ? 'pass' : 'fail'} - ${packet.gate?.reason || ''}`,
    '',
    '## Totals',
    '',
    `- Total invite rows: ${asInteger(totals.total)}`,
    `- Complete: ${asInteger(totals.complete)}`,
    `- Repair without reinvite: ${asInteger(totals.repairWithoutReinvite)}`,
    `- Manual review: ${asInteger(totals.manualReviewRequired)}`,
    `- Reinvite required: ${asInteger(totals.reinviteRequired)}`,
    `- Existing-link follow-up: ${asInteger(totals.waitOrResume)}`,
    '',
    '## Required Migrations',
    '',
    ...migrations.map((migration) => `- ${migration}`),
    '',
    '## Checklist',
    '',
    ...checklist.map((item) => `- [${item.done ? 'x' : ' '}] ${item.label} ${item.detail}`),
    '',
    '## Operator Commands',
    '',
    ...commands.map((command) => `- \`${command}\``),
    '',
    '## Next Actions',
    '',
    ...nextActions.map((action) => `- ${action}`),
    '',
    '## Guardrails',
    '',
    '- Do not run generated repair SQL until the required migrations are applied.',
    '- Do not reinvite pending or resumable rows; reuse the existing invite link.',
    '- Do not repair manual-review rows until the accepting workspace and email are confirmed.',
    '- Rerun the health gate after every repair batch.',
    '',
    '## Versions',
    '',
    `- Audit: ${packet.versions?.audit || INVITE_ACCEPTANCE_AUDIT_VERSION}`,
    `- Reconciliation: ${packet.versions?.reconciliation || INVITE_ACCEPTANCE_RECONCILIATION_VERSION}`,
    `- Health: ${packet.versions?.health || INVITE_ACCEPTANCE_HEALTH_VERSION}`,
    '',
  ]

  return `${lines.join('\n')}`
}
