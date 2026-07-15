import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLegalClausePackEscalationPlan } from '../legalClausePackEscalationService.js'
import { buildLegalClausePackResolutionReport } from '../legalClausePackResolutionService.js'

function record(overrides = {}) {
  return {
    packetId: 'packet-1',
    versionId: 'version-1',
    versionNumber: 1,
    transactionId: 'transaction-1',
    title: 'OTP 1',
    operationalState: 'awaiting_operational_approval',
    requiresLegalSpecialist: false,
    ...overrides,
  }
}

function notification(action, overrides = {}) {
  return {
    id: 'notification-1',
    transaction_id: action.transactionId,
    is_read: false,
    dedupe_key: `legal-otp-escalation:${action.actionId}:user-1`,
    event_data: {
      source: 'legal_clause_pack_phase9_escalation',
      packetId: action.packetId,
      versionId: action.versionId,
      operationalState: action.operationalState,
    },
    created_at: '2026-07-15T10:00:00.000Z',
    ...overrides,
  }
}

test('flags an active routable finding with no notification evidence', () => {
  const report = buildLegalClausePackResolutionReport({ diagnostics: { records: [record()] } })
  assert.equal(report.gate.status, 'fail')
  assert.equal(report.current[0].resolutionState, 'notification_missing')
})

test('distinguishes acknowledgement from resolution', () => {
  const diagnostics = { records: [record()] }
  const action = buildLegalClausePackEscalationPlan({ diagnostics }).actions[0]
  const report = buildLegalClausePackResolutionReport({
    diagnostics,
    notifications: [notification(action, { is_read: true, read_at: '2026-07-15T11:00:00.000Z' })],
    generatedAt: '2026-07-15T12:00:00.000Z',
  })
  assert.equal(report.current[0].resolutionState, 'acknowledged_unresolved')
  assert.equal(report.gate.status, 'warning')
})

test('marks unread follow-up overdue using priority-specific SLA', () => {
  const diagnostics = { records: [record()] }
  const action = buildLegalClausePackEscalationPlan({ diagnostics }).actions[0]
  const report = buildLegalClausePackResolutionReport({
    diagnostics,
    notifications: [notification(action)],
    generatedAt: '2026-07-18T12:00:00.000Z',
  })
  assert.equal(report.current[0].resolutionState, 'overdue_unread')
  assert.equal(report.summary.overdue, 1)
})

test('reports a prior notification as resolved only after its finding disappears', () => {
  const originalDiagnostics = { records: [record()] }
  const action = buildLegalClausePackEscalationPlan({ diagnostics: originalDiagnostics }).actions[0]
  const report = buildLegalClausePackResolutionReport({
    diagnostics: { records: [] },
    notifications: [notification(action)],
  })
  assert.equal(report.current.length, 0)
  assert.equal(report.resolved[0].resolutionState, 'resolved_after_notification')
  assert.equal(report.gate.status, 'pass')
})

test('keeps unlinked findings visible as unresolved and unroutable', () => {
  const report = buildLegalClausePackResolutionReport({ diagnostics: { records: [record({ transactionId: null })] } })
  assert.equal(report.current[0].resolutionState, 'unroutable')
  assert.equal(report.gate.status, 'warning')
})

test('fails closed when Phase 8 or notification queries are incomplete', () => {
  const report = buildLegalClausePackResolutionReport({
    diagnostics: { records: [], queryWarnings: [{ source: 'document_packets', message: 'partial' }] },
  })
  assert.equal(report.dataComplete, false)
  assert.equal(report.gate.status, 'incomplete')
})
