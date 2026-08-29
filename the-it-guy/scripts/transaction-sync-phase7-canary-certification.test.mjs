import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  buildTransactionSyncReadModel,
} from '../src/services/transactionSyncReadModelService.js'
import {
  buildTransactionSyncCanaryCertification,
  TRANSACTION_SYNC_CERTIFICATION_ROLES,
} from '../server/services/transactionSyncPhase7CanaryCertificationService.js'
import {
  assertPhase7Target,
  parsePhase7Args,
} from './transaction-sync-phase7-canary-certification.mjs'

const migrationUrl = new URL('../../supabase/migrations/20260829112135_transaction_sync_phase7_canary_certification.sql', import.meta.url)
const workflow = {
  mainStage: { key: 'XFER', label: 'Transfer' },
  detailedStage: { key: 'Transfer Initiated', label: 'Transfer Initiated' },
  lanes: [{ key: 'transfer', status: 'in_progress', currentStep: 'documents_signed' }],
}
const signal = { version: 9, changed_at: '2026-08-29T12:00:00Z' }
const activities = [
  { id: 'buyer', canonical_event_type: 'BuyerOnboardingCompleted', lane_key: 'buyer', visibility: 'client_visible', audience_json: ['buyer', 'agent'], title: 'Buyer ready', description: 'Buyer onboarding completed.', payload_json: {}, occurred_at: '2026-08-29T10:00:00Z' },
  { id: 'seller', canonical_event_type: 'SellerOnboardingCompleted', lane_key: 'seller', visibility: 'client_visible', audience_json: ['seller', 'agent'], title: 'Seller ready', description: 'Seller onboarding completed.', payload_json: {}, occurred_at: '2026-08-29T10:01:00Z' },
  { id: 'professional', canonical_event_type: 'OriginatorProgressUpdated', lane_key: 'bond_originator', visibility: 'professional_shared', audience_json: ['agent', 'bond_originator', 'transfer_attorney'], title: 'Finance progressed', description: 'The assessment progressed.', payload_json: { status: 'in_progress' }, occurred_at: '2026-08-29T10:02:00Z' },
  { id: 'attorney-note', canonical_event_type: 'TransferAttorneyCommentAdded', lane_key: 'transfer', visibility: 'internal', audience_json: ['transfer_attorney'], title: 'Internal legal note', description: 'An internal note was added.', payload_json: { laneKey: 'transfer' }, occurred_at: '2026-08-29T10:03:00Z' },
  { id: 'agent-override', canonical_event_type: 'AgentWorkflowOverrideApplied', lane_key: 'sales_otp', visibility: 'internal', audience_json: ['agent', 'transfer_attorney'], title: 'Override applied', description: 'An authorised workflow override was recorded.', payload_json: { status: 'approved' }, occurred_at: '2026-08-29T10:04:00Z' },
]

function roleModels(rows = activities, overrides = {}) {
  return Object.fromEntries(TRANSACTION_SYNC_CERTIFICATION_ROLES.map((role) => [
    role,
    buildTransactionSyncReadModel({
      transactionId: 'tx-1',
      viewerRole: role,
      workflowReadModel: overrides[role]?.workflow || workflow,
      activityRows: rows,
      refreshSignal: overrides[role]?.signal || signal,
    }),
  ]))
}

test('five-role canary passes with one version, one lane snapshot, and scoped activity', () => {
  const certification = buildTransactionSyncCanaryCertification({
    transactionId: 'tx-1',
    phase5Assessment: { status: 'healthy' },
    roleModels: roleModels(),
    activityRows: activities,
  })
  assert.equal(certification.status, 'passed')
  assert.equal(certification.certified, true)
  assert.equal(certification.canonicalVersion, 9)
  assert.match(certification.evidenceHash, /^[a-f0-9]{64}$/)
})

test('agent sees its own exact override but not attorney-internal notes', () => {
  const agentActivity = roleModels().agent.activity.map((row) => row.id)
  assert.equal(agentActivity.includes('agent-override'), true)
  assert.equal(agentActivity.includes('attorney-note'), false)
})

test('canary fails closed on client payload leakage and role drift', () => {
  const unsafe = activities.map((row) => row.id === 'buyer' ? { ...row, payload_json: { private: true } } : row)
  const models = roleModels(unsafe, {
    seller: { signal: { ...signal, version: 8 } },
    attorney: { workflow: { ...workflow, lanes: [{ key: 'transfer', status: 'completed' }] } },
  })
  const certification = buildTransactionSyncCanaryCertification({
    transactionId: 'tx-1',
    phase5Assessment: { status: 'warning' },
    roleModels: models,
    activityRows: unsafe,
  })
  assert.equal(certification.status, 'failed')
  const codes = new Set(certification.issues.map((issue) => issue.code))
  for (const code of ['phase5_health_not_green', 'role_version_mismatch', 'role_lane_mismatch', 'client_activity_payload_not_empty']) {
    assert.equal(codes.has(code), true, `expected ${code}`)
  }
})

test('certification receipt is immutable, RLS-protected, and service-role-written', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /create table if not exists public\.transaction_sync_certification_runs/i)
  assert.match(sql, /alter table public\.transaction_sync_certification_runs enable row level security/i)
  assert.match(sql, /grant select on table public\.transaction_sync_certification_runs to authenticated/i)
  assert.match(sql, /grant select, insert on table public\.transaction_sync_certification_runs to service_role/i)
  assert.doesNotMatch(sql, /update public\.transaction_sync_certification_runs|delete from public\.transaction_sync_certification_runs/i)
})

test('agent override policy is exact and does not broadly expose internal activity', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /canonical_event_type = 'AgentWorkflowOverrideApplied'/)
  assert.match(sql, /audience_json \? 'agent'/)
  assert.match(sql, /lower\(coalesce\(profile\.role, ''\)\) = 'agent'/)
  assert.doesNotMatch(sql, /visibility = 'internal'\s+and audience_json \? 'agent'\s+or/i)
})

test('certification write requires explicit canary, project, and production confirmation', () => {
  const plan = parsePhase7Args(['--environment=staging', '--transaction-id=tx-1'])
  assert.doesNotThrow(() => assertPhase7Target(plan, 'project-a'))
  const certify = parsePhase7Args([
    '--certify', '--environment=staging', '--transaction-id=tx-1',
    '--confirm-canary-certification', '--confirm-project-ref=project-a',
  ])
  assert.doesNotThrow(() => assertPhase7Target(certify, 'project-a'))
  assert.throws(() => assertPhase7Target({ ...certify, confirmCanaryCertification: false }, 'project-a'), /confirm-canary-certification/)
  assert.throws(() => assertPhase7Target(certify, 'project-b'), /confirm-project-ref=project-b/)
  assert.throws(() => assertPhase7Target({ ...certify, environment: 'production' }, 'project-a'), /confirm-production/)
})

test('runtime certification always consumes Phase 5 and writes only when requested', async () => {
  const source = await readFile(new URL('../server/services/transactionSyncPhase7CanaryCertificationService.js', import.meta.url), 'utf8')
  assert.match(source, /runTransactionSyncPhase5OperationalAssurance/)
  assert.match(source, /TRANSACTION_SYNC_CERTIFICATION_ROLES/)
  assert.match(source, /if \(options\.certify === true\)/)
  assert.match(source, /transaction_sync_certification_runs/)
})

