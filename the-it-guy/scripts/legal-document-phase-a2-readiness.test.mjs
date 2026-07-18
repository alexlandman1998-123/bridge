import assert from 'node:assert/strict'
import fs from 'node:fs'

const config = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
const source = fs.readFileSync('scripts/legal-document-phase-a2-readiness.mjs', 'utf8')
const phase3 = fs.readFileSync('scripts/legal-document-phase3-launch-readiness.mjs', 'utf8')
const releaseGate = fs.readFileSync('scripts/legal-document-phase4-release-gate.mjs', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))

assert.ok(!config.enabled || config.releasePreparation.status === 'approved', 'Production may be enabled only after explicit A2 approval.')
assert.ok(['pending_evidence', 'approved'].includes(config.releasePreparation.status))
assert.ok(config.releasePreparation.organisationIds.every((id) => config.cohortPreparation.candidateOrganisationIds.includes(id)))
assert.deepEqual([...config.organisationIds].sort(), [...config.releasePreparation.organisationIds].sort())
if (config.releasePreparation.status === 'approved') {
  assert.ok(config.releasePreparation.approvedBy)
  assert.ok(Number.isFinite(Date.parse(config.releasePreparation.approvedAt)))
  assert.ok(config.releasePreparation.approvalReference)
}
assert.ok(config.releasePreparation.requiredChecks.includes('all_routable_templates_legally_approved'))
for (const script of [
  'scripts/legal-document-phase-c1-verify.mjs',
  'scripts/legal-document-phase-c2-verify.mjs',
  'scripts/legal-document-phase-c3-verify.mjs',
  'scripts/legal-document-phase-d1-verify.mjs',
  'scripts/legal-document-phase-d2-verify.mjs',
  'scripts/legal-document-phase-d3-verify.mjs',
  'scripts/legal-document-phase-e1-verify.mjs',
  'scripts/legal-document-phase-e2-verify.mjs',
  'scripts/legal-document-phase-e3-verify.mjs',
  'scripts/legal-document-phase-e4-verify.mjs',
  'scripts/legal-document-phase-f1-verify.mjs',
  'scripts/legal-document-phase-f2-verify.mjs',
  'scripts/legal-document-phase-f3-verify.mjs',
  'scripts/legal-document-phase-g1-verify.mjs',
  'scripts/legal-document-phase-g2-browser-usability.mjs',
  'scripts/legal-document-phase-g3-operational-readiness.mjs',
  'scripts/legal-document-phase-g4-recovery-rehearsal.mjs',
  'scripts/legal-document-phase-h1-access-boundary.mjs',
  'scripts/legal-document-phase-h2-least-privilege.mjs',
  'scripts/legal-document-phase-h3-authority-continuity.mjs',
  'scripts/legal-document-phase-h4-public-surface.mjs',
  'scripts/legal-document-phase-i1-concurrency.mjs',
  'scripts/legal-document-phase-i2-renderer-capacity.mjs',
  'scripts/legal-document-phase-i3-backpressure.mjs',
  'scripts/legal-document-phase-b1-verify.mjs',
  'scripts/legal-document-phase-b2-verify.mjs',
  'scripts/legal-document-phase-b3-verify.mjs',
  'scripts/legal-document-phase4-cohort-readiness.mjs',
  'scripts/legal-document-phase3-launch-readiness.mjs',
  'scripts/legal-document-phase4-staging-smoke.mjs',
  'scripts/legal-document-phase4-monitor.mjs',
]) assert.ok(source.includes(script), `A2 must run ${script}`)
for (const code of [
  'A2_PREMATURE_ACTIVATION',
  'A2_RELEASE_ORGANISATION_NOT_READY',
  'A2_EFFECTIVE_ALLOWLIST_MISMATCH',
  'A2_RELEASE_APPROVER_MISSING',
  'A2_RELEASE_APPROVAL_REFERENCE_MISSING',
]) assert.match(source, new RegExp(code))
assert.match(phase3, /routableTemplates/)
assert.match(phase3, /legal_approval_content_digest/)
assert.match(phase3, /legal_counsel_review_evidence_digest/)
assert.match(phase3, /mandateTemplates\.some\(\(row\) => !approved\(row\)\)/)
assert.match(releaseGate, /legal-document-phase-a2-readiness\.mjs/)
assert.ok(pkg.scripts['test:legal-documents-phase-a2'])
assert.ok(pkg.scripts['verify:legal-documents:phase-a2'])
assert.match(source, /mutatedData: false/)
assert.match(source, /timeout/)
assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)

console.log('Legal document Phase A2 release-preparation contract passed')
