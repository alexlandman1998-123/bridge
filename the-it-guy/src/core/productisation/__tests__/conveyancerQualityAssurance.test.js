import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildConveyancerQaReleaseEvidence, buildConveyancerQaRun, CONVEYANCER_QA_CASES, evaluateConveyancerQaReleaseGate } from '../conveyancerQualityAssurance.js'

const packageJson = JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'))
const config = readFileSync(new URL('../../../../../supabase/config.toml', import.meta.url), 'utf8')
const hash = `sha256:${'a'.repeat(64)}`; const startedAt = '2026-07-16T12:00:00.000Z'; const completedAt = '2026-07-16T12:30:00.000Z'
function results(overrides = {}) { return CONVEYANCER_QA_CASES.map((item) => ({ caseId: item.id, status: overrides[item.id] || 'passed', evidenceReference: `ci://p10/${item.id}`, evidenceHash: hash })) }
function run(overrides = {}) { return buildConveyancerQaRun({ runId: 'qa:p10:1', environment: 'production', buildReference: 'ci://build/101', commitSha: 'abcdef1234567890', executedBy: 'user:qa', startedAt, completedAt, results: results(), ...overrides }) }
function test(name, fn) { try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }

test('catalog covers every productisation phase and the cross-cutting safety domains', () => {
  for (let phase = 0; phase <= 9; phase += 1) assert.ok(CONVEYANCER_QA_CASES.some((item) => item.phase.includes(`P${phase}`)), `P${phase} missing`)
  for (const domain of ['tenancy', 'security', 'workflow', 'documents', 'resilience', 'operations', 'accessibility', 'continuity', 'release', 'legal_safety']) assert.ok(CONVEYANCER_QA_CASES.some((item) => item.domain === domain), `${domain} missing`)
})

test('builds secret-free, hash-evidenced and chronologically valid QA runs', () => {
  assert.equal(run().ok, true, JSON.stringify(run().errors)); assert.match(run().run.fingerprint, /^fnv1a_/)
  assert.ok(run({ results: [{ caseId: 'unknown', status: 'passed', evidenceReference: 'ci://x', evidenceHash: hash }] }).errors.includes('qa_result_invalid'))
  assert.ok(run({ results: results(), accessToken: 'raw' }).errors.includes('qa_run_contains_secret'))
  assert.ok(run({ results: results().map((item, index) => index ? item : { ...item, evidenceHash: 'weak' }) }).errors.includes('qa_evidence_invalid'))
})

test('fails closed for missing, failed, blocked or stale mandatory assurance', () => {
  const approved = { decision: 'approved', approvedBy: 'user:release', reason: 'All evidence reviewed.', approvedAt: completedAt }
  const open = evaluateConveyancerQaReleaseGate({ run: run().run, approval: approved, asOf: '2026-07-16T13:00:00.000Z' }); assert.equal(open.allowed, true, JSON.stringify(open.blockers))
  const failedRun = run({ results: results({ p8_kill_switch_scope: 'failed' }) }).run; assert.ok(evaluateConveyancerQaReleaseGate({ run: failedRun, approval: approved, asOf: completedAt }).blockers.includes('qa_failed:p8_kill_switch_scope'))
  assert.ok(evaluateConveyancerQaReleaseGate({ run: run().run, approval: approved, asOf: '2026-07-18T13:00:00.000Z' }).blockers.includes('qa_run_stale'))
})

test('requires production approval independent from the QA executor', () => {
  const gate = evaluateConveyancerQaReleaseGate({ run: run().run, approval: { decision: 'approved', approvedBy: 'user:qa', reason: 'self approval', approvedAt: completedAt }, asOf: completedAt })
  assert.ok(gate.blockers.includes('qa_independent_release_approval_required'))
})

test('emits P8-compatible immutable test evidence', () => {
  const evidence = buildConveyancerQaReleaseEvidence(run().run); assert.equal(evidence.ok, true); assert.equal(evidence.evidence.testsReference, 'ci://build/101'); assert.equal(evidence.evidence.testsHash, hash); assert.match(evidence.evidence.qaFingerprint, /^fnv1a_/)
})

test('P10 command executes the complete P0-P9 regression before its release gate', () => {
  const command = packageJson.scripts['test:conveyancer-productisation-p10']; for (let phase = 0; phase <= 9; phase += 1) assert.match(command, new RegExp(`test:conveyancer-productisation-p${phase}`))
  assert.match(command, /conveyancerQualityAssurance\.test\.js/)
  for (const fn of ['conveyancer-provider-runtime', 'dispatch-conveyancer-provider-commands', 'conveyancer-provider-webhook', 'conveyancer-operations-monitor']) assert.match(config, new RegExp(`\\[functions\\.${fn}\\]`))
})

console.log('P10 conveyancer quality-assurance tests passed.')
