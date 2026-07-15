import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildLegalClausePackEscalationPlan,
  executeLegalClausePackEscalationPlan,
} from '../legalClausePackEscalationService.js'

function record(packetId, operationalState, overrides = {}) {
  return {
    packetId,
    versionId: `version-${packetId}`,
    versionNumber: 2,
    transactionId: `00000000-0000-4000-8000-${packetId.padStart(12, '0').slice(-12)}`,
    title: `OTP ${packetId}`,
    operationalState,
    requiresLegalSpecialist: false,
    ...overrides,
  }
}

test('routes specialist approvals to attorneys and ordinary approvals to agents', () => {
  const plan = buildLegalClausePackEscalationPlan({
    diagnostics: {
      schemaVersion: 'diagnostics-v1',
      records: [
        record('1', 'awaiting_attorney_approval', { requiresLegalSpecialist: true }),
        record('2', 'awaiting_operational_approval'),
      ],
    },
    generatedAt: '2026-07-15T08:00:00.000Z',
  })

  assert.equal(plan.summary.totalActions, 2)
  assert.deepEqual(plan.actions[0].targetRoles, ['attorney'])
  assert.deepEqual(plan.actions[1].targetRoles, ['agent'])
  assert.equal(plan.summary.attorneyActions, 1)
  assert.equal(plan.summary.agentActions, 1)
})

test('escalates critical unsafe releases to both agency and attorney roles', () => {
  const plan = buildLegalClausePackEscalationPlan({
    diagnostics: { records: [record('3', 'released_without_valid_approval')] },
  })

  assert.equal(plan.summary.criticalActions, 1)
  assert.deepEqual(plan.actions[0].targetRoles, ['agent', 'attorney'])
  assert.match(plan.actions[0].message, /Stop progression/)
})

test('does not notify healthy, safely released or legacy records', () => {
  const plan = buildLegalClausePackEscalationPlan({
    diagnostics: {
      records: [
        record('4', 'approved_ready_to_send'),
        record('5', 'released_with_valid_approval'),
        record('6', 'legacy_not_governed'),
      ],
    },
  })

  assert.equal(plan.summary.totalActions, 0)
  assert.equal(plan.summary.executableActions, 0)
})

test('keeps unlinked packet exceptions visible but non-executable', () => {
  const plan = buildLegalClausePackEscalationPlan({
    diagnostics: { records: [record('7', 'stale_approval', { transactionId: null })] },
  })

  assert.equal(plan.summary.totalActions, 1)
  assert.equal(plan.summary.executableActions, 0)
  assert.equal(plan.actions[0].executable, false)
  assert.match(plan.actions[0].skipReason, /not linked to a transaction/)
  assert.equal(plan.actionKeys.length, 1)
})

test('requires an exact reviewed dry-run plan before applying notifications', async () => {
  const diagnostics = { records: [record('8', 'awaiting_operational_approval')] }
  const dryRun = await executeLegalClausePackEscalationPlan({ diagnostics, dryRun: true })

  assert.equal(dryRun.dryRun, true)
  assert.equal(dryRun.actionKeys.length, 1)
  await assert.rejects(
    executeLegalClausePackEscalationPlan({
      diagnostics,
      dryRun: false,
      approvedPlanFingerprint: 'stale-plan',
      approvedActionKeys: dryRun.actionKeys,
    }),
    (error) => error?.code === 'LEGAL_ESCALATION_PLAN_STALE',
  )
})

test('includes non-executable findings in the reviewed plan fingerprint', () => {
  const linked = record('9', 'awaiting_operational_approval')
  const unlinked = record('10', 'stale_approval', { transactionId: null })
  const linkedOnly = buildLegalClausePackEscalationPlan({ diagnostics: { records: [linked] } })
  const withUnlinked = buildLegalClausePackEscalationPlan({ diagnostics: { records: [linked, unlinked] } })

  assert.notEqual(linkedOnly.planFingerprint, withUnlinked.planFingerprint)
  assert.equal(withUnlinked.actionKeys.length, 2)
})

test('refuses to apply a reviewed plan from incomplete diagnostics', async () => {
  const diagnostics = {
    records: [record('11', 'awaiting_operational_approval')],
    queryWarnings: [{ source: 'document_packet_versions', message: 'query incomplete' }],
  }
  const dryRun = await executeLegalClausePackEscalationPlan({ diagnostics, dryRun: true })
  assert.equal(dryRun.diagnosticsComplete, false)
  assert.equal(dryRun.canApply, false)
  await assert.rejects(
    executeLegalClausePackEscalationPlan({
      diagnostics,
      dryRun: false,
      approvedPlanFingerprint: dryRun.planFingerprint,
      approvedActionKeys: dryRun.actionKeys,
    }),
    (error) => error?.code === 'LEGAL_ESCALATION_DIAGNOSTICS_INCOMPLETE',
  )
})
