export const CONVEYANCER_QA_VERSION = 'conveyancer_quality_assurance_p10_v1'
export const CONVEYANCER_QA_CASES = Object.freeze([
  ['p0_baseline_integrity', 'P0', 'governance', 'Baseline approval, threat and continuity controls remain intact.'],
  ['p1_cross_firm_isolation', 'P1', 'tenancy', 'A user from another firm cannot read or mutate the matter records.'],
  ['p1_append_only_evidence', 'P1', 'audit', 'Immutable plans, events and evidence reject update and delete.'],
  ['p2_instruction_to_plan', 'P2', 'workflow', 'An accepted signed instruction creates one deterministic matter plan.'],
  ['p2_command_idempotency', 'P2', 'workflow', 'A repeated action command does not duplicate legal or operational state.'],
  ['p3_cockpit_projection', 'P3', 'experience', 'The cockpit is a projection and does not directly mutate persistence tables.'],
  ['p4_notification_continuity', 'P4', 'communications', 'Failed or disabled delivery leaves visible work and a manual communication route.'],
  ['p5_document_authority', 'P5', 'documents', 'Rendering and signing require the correct approval and release provenance.'],
  ['p6_provider_secret_boundary', 'P6', 'security', 'Credentials remain server-side and stored operations contain references only.'],
  ['p7_transport_recovery', 'P7', 'resilience', 'Retries, dead letters, replay protection and reconciliation behave deterministically.'],
  ['p8_kill_switch_scope', 'P8', 'operations', 'Profile, firm, organisation and global stops affect only their intended traffic.'],
  ['p8_release_separation', 'P8', 'release', 'Operations, security and legal approval come from three different users.'],
  ['p8_activation_replay', 'P8', 'release', 'Artifact-bound deployment authority expires and can be consumed only once.'],
  ['p9_single_next_action', 'P9', 'experience', 'The conveyancer sees one next action and progressive detail.'],
  ['p9_deliberate_legal_review', 'P9', 'legal_safety', 'Review work opens the review workspace and cannot be completed from the summary.'],
  ['manual_provider_independence', 'P6-P9', 'continuity', 'The complete workflow continues without banks, SARS, municipalities or Deeds integrations.'],
  ['keyboard_and_semantics', 'P9', 'accessibility', 'Core work controls are labelled, keyboard operable and use semantic elements.'],
  ['responsive_cockpit', 'P9', 'experience', 'The work view remains usable at supported mobile and desktop widths.'],
  ['production_build', 'P0-P9', 'release', 'The production client bundle builds successfully.'],
].map(([id, phase, domain, description]) => Object.freeze({ id, phase, domain, description, mandatory: true })))

const HASH = /^(sha256:)?[a-f0-9]{64}$/i
const text = (value = '') => String(value ?? '').trim()
const iso = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null
const freeze = (value) => { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.values(value).forEach(freeze); return Object.freeze(value) }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (!value || typeof value !== 'object') return value; return Object.keys(value).sort().reduce((result, key) => { result[key] = stable(value[key]); return result }, {}) }
function fingerprint(value) { const source = JSON.stringify(stable(value)); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193) } return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}` }
function containsSecret(value) { return /"(?:api.?key|access.?token|refresh.?token|password|private.?key|client.?secret|credential|secret)"\s*:/i.test(JSON.stringify(value || {})) }

export function buildConveyancerQaRun(input = {}) {
  const known = new Set(CONVEYANCER_QA_CASES.map((item) => item.id))
  const results = (input.results || []).map((result) => ({ caseId: text(result.caseId), status: text(result.status).toLowerCase(), evidenceReference: text(result.evidenceReference), evidenceHash: text(result.evidenceHash), note: text(result.note) })).sort((left, right) => left.caseId.localeCompare(right.caseId))
  const run = { version: CONVEYANCER_QA_VERSION, runId: text(input.runId), environment: text(input.environment).toLowerCase(), buildReference: text(input.buildReference), commitSha: text(input.commitSha), executedBy: text(input.executedBy), startedAt: iso(input.startedAt), completedAt: iso(input.completedAt), results }
  run.fingerprint = fingerprint(run)
  const errors = []
  if (!run.runId || !['staging', 'production'].includes(run.environment) || !run.buildReference || !/^[a-f0-9]{7,64}$/i.test(run.commitSha) || !run.executedBy || !run.startedAt || !run.completedAt || new Date(run.completedAt) < new Date(run.startedAt)) errors.push('qa_run_identity_invalid')
  if (new Set(results.map((item) => item.caseId)).size !== results.length || results.some((item) => !known.has(item.caseId) || !['passed', 'failed', 'blocked', 'not_run'].includes(item.status))) errors.push('qa_result_invalid')
  if (results.some((item) => item.status === 'passed' && (!item.evidenceReference || !HASH.test(item.evidenceHash)))) errors.push('qa_evidence_invalid')
  if (containsSecret(input)) errors.push('qa_run_contains_secret')
  return freeze({ ok: errors.length === 0, errors: [...new Set(errors)], run })
}

export function evaluateConveyancerQaReleaseGate({ run: input = {}, approval = null, asOf = new Date().toISOString(), maxAgeHours = 24 } = {}) {
  const built = buildConveyancerQaRun(input); const blockers = [...built.errors]; const byId = new Map(built.run.results.map((result) => [result.caseId, result]))
  for (const item of CONVEYANCER_QA_CASES) { const result = byId.get(item.id); if (!result) blockers.push(`qa_missing:${item.id}`); else if (result.status !== 'passed') blockers.push(`qa_${result.status}:${item.id}`) }
  if (built.run.completedAt && new Date(asOf).getTime() - new Date(built.run.completedAt).getTime() > maxAgeHours * 60 * 60 * 1000) blockers.push('qa_run_stale')
  if (built.run.environment === 'production') {
    if (!approval || text(approval.decision).toLowerCase() !== 'approved' || !text(approval.approvedBy) || text(approval.approvedBy) === built.run.executedBy || !text(approval.reason) || !iso(approval.approvedAt)) blockers.push('qa_independent_release_approval_required')
  }
  return freeze({ allowed: blockers.length === 0, blockers: [...new Set(blockers)], summary: { total: CONVEYANCER_QA_CASES.length, passed: built.run.results.filter((item) => item.status === 'passed').length, failed: built.run.results.filter((item) => item.status === 'failed').length, blocked: built.run.results.filter((item) => item.status === 'blocked').length }, run: built.run })
}

export function buildConveyancerQaReleaseEvidence(runInput = {}) {
  const built = buildConveyancerQaRun(runInput)
  if (!built.ok) return freeze({ ok: false, errors: built.errors })
  return freeze({ ok: true, evidence: { testsReference: built.run.buildReference, testsHash: built.run.results[0]?.evidenceHash || '', qaRunId: built.run.runId, qaFingerprint: built.run.fingerprint, completedAt: built.run.completedAt } })
}
