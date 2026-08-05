import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_RELEASE_CANDIDATE_LOCK_CONTRACT,
  OTP_RELEASE_CANDIDATE_LOCK_PHASE18_VERSION,
  OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE,
  OTP_RELEASE_CANDIDATE_LOCK_READY_STATUS,
  buildOtpReleaseCandidateLockPhase18Audit,
  formatOtpReleaseCandidateLockPhase18Markdown,
} from '../src/core/documents/otpReleaseCandidateLockPhase18.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-release-candidate-lock-phase18'],
  'node scripts/otp-release-candidate-lock-phase18.test.mjs',
  'package.json should expose the OTP release-candidate lock Phase 18 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-release-candidate-lock-phase18'],
  'node scripts/report-otp-release-candidate-lock-phase18.mjs',
  'package.json should expose the OTP Phase 18 release-candidate lock report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-release-candidate-lock-phase18'),
  'OTP vNext verification should include Phase 18 release-candidate lock checks.',
)

assert.equal(OTP_RELEASE_CANDIDATE_LOCK_PHASE18_VERSION, 'otp_release_candidate_lock_phase18_v1')
assert.equal(OTP_RELEASE_CANDIDATE_LOCK_READY_STATUS, 'OTP_RELEASE_CANDIDATE_LOCK_READY_FOR_PRODUCTION_PROMOTION_PREFLIGHT')
assert.equal(OTP_RELEASE_CANDIDATE_LOCK_CONTRACT, 'otp-vnext-release-candidate-lock-phase18-v1')

const audit = buildOtpReleaseCandidateLockPhase18Audit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(audit.version, OTP_RELEASE_CANDIDATE_LOCK_PHASE18_VERSION)
assert.equal(audit.contract, OTP_RELEASE_CANDIDATE_LOCK_CONTRACT)
assert.equal(audit.status, OTP_RELEASE_CANDIDATE_LOCK_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.canProceedToProductionPromotionPreflight, true)
assert.equal(audit.finalCompletionDryRun.status, 'OTP_FINAL_COMPLETION_DRY_RUN_READY_FOR_RELEASE_CANDIDATE_LOCK')
assert.equal(audit.lock.lockId, 'otp-vnext-release-candidate-lock-2026-08-05')
assert.equal(audit.lock.approvalReference, 'otp-vnext-phase18-release-candidate-lock')
assert.ok(audit.lock.releaseCandidateFingerprint.startsWith('otp-rc-lock:'))
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.frozenRouteCount, 2)
assert.equal(audit.summary.routeOutputDriftCount, 0)
assert.equal(audit.summary.qaEvidenceDriftCount, 0)
assert.equal(audit.summary.routeFingerprintMismatchCount, 0)
assert.equal(audit.summary.routeLeakCount, 0)
assert.equal(audit.summary.mutationBlocked, true)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

const resale = audit.routeRows.find((row) => row.routeKey === 'resale_existing_property')
const development = audit.routeRows.find((row) => row.routeKey === 'new_development')
assert.deepEqual(resale.signerRoles, ['purchaser_1', 'seller'])
assert.equal(resale.renderedSha256, 'sha256:phase13-resale-pdf-proof')
assert.ok(resale.lockedRouteFingerprint.startsWith('otp-rc-route-resale_existing_property:'))
assert.deepEqual(development.signerRoles, ['purchaser_1', 'developer_authorised_signatory', 'contractor_authorised_signatory', 'agent'])
assert.equal(development.renderedSha256, 'sha256:phase13-development-pdf-proof')
assert.ok(development.lockedRouteFingerprint.startsWith('otp-rc-route-new_development:'))

for (const check of [
  'PHASE18_FINAL_COMPLETION_DRY_RUN_READY',
  'PHASE18_RELEASE_LOCK_PRESENT',
  'PHASE18_BOTH_ROUTE_OUTPUTS_FROZEN',
  'PHASE18_ROUTE_OUTPUT_FINGERPRINTS_MATCH',
  'PHASE18_QA_EVIDENCE_CHAIN_FROZEN',
  'PHASE18_RELEASE_CANDIDATE_FINGERPRINT_MATCHES',
  'PHASE18_PRODUCTION_PROMOTION_MUTATION_BLOCKED',
  'PHASE18_RESALE_AND_NEW_DEVELOPMENT_LOCKED_SEPARATELY',
  'PHASE18_APPROVAL_REFERENCE_BOUND',
  'PHASE18_DRIFT_STOP_CONDITIONS_BOUND',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const pdfDrift = buildOtpReleaseCandidateLockPhase18Audit({
  releaseCandidateLock: {
    ...OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE,
    routes: OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE.routes.map((route) => route.routeKey === 'resale_existing_property'
      ? { ...route, renderedSha256: 'sha256:drifted-resale-release-candidate-pdf' }
      : route),
  },
})
assert.equal(pdfDrift.status, 'OTP_RELEASE_CANDIDATE_LOCK_REMEDIATION_REQUIRED')
assert.equal(pdfDrift.checks.find((item) => item.code === 'PHASE18_ROUTE_OUTPUT_FINGERPRINTS_MATCH')?.pass, false)

const qaDrift = buildOtpReleaseCandidateLockPhase18Audit({
  releaseCandidateLock: {
    ...OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE,
    routes: OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE.routes.map((route) => route.routeKey === 'new_development'
      ? {
          ...route,
          qaEvidence: route.qaEvidence.map((evidence) => evidence.phase === 'phase17_final_completion_dry_run'
            ? { ...evidence, status: 'OTP_FINAL_COMPLETION_DRY_RUN_REMEDIATION_REQUIRED' }
            : evidence),
        }
      : route),
  },
})
assert.equal(qaDrift.status, 'OTP_RELEASE_CANDIDATE_LOCK_REMEDIATION_REQUIRED')
assert.equal(qaDrift.checks.find((item) => item.code === 'PHASE18_QA_EVIDENCE_CHAIN_FROZEN')?.pass, false)

const fingerprintDrift = buildOtpReleaseCandidateLockPhase18Audit({
  releaseCandidateLock: {
    ...OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE,
    releaseCandidateFingerprint: 'otp-rc-lock:00000000:0',
  },
})
assert.equal(fingerprintDrift.status, 'OTP_RELEASE_CANDIDATE_LOCK_REMEDIATION_REQUIRED')
assert.equal(fingerprintDrift.checks.find((item) => item.code === 'PHASE18_RELEASE_CANDIDATE_FINGERPRINT_MATCHES')?.pass, false)

const routeLeak = buildOtpReleaseCandidateLockPhase18Audit({
  releaseCandidateLock: {
    ...OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE,
    routes: OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE.routes.map((route) => route.routeKey === 'new_development'
      ? { ...route, signerRoles: [...route.signerRoles, 'seller'] }
      : route),
  },
})
assert.equal(routeLeak.status, 'OTP_RELEASE_CANDIDATE_LOCK_REMEDIATION_REQUIRED')
assert.equal(routeLeak.checks.find((item) => item.code === 'PHASE18_RESALE_AND_NEW_DEVELOPMENT_LOCKED_SEPARATELY')?.pass, false)

const mutationUnlocked = buildOtpReleaseCandidateLockPhase18Audit({
  releaseCandidateLock: {
    ...OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE,
    mutationAllowed: true,
  },
})
assert.equal(mutationUnlocked.status, 'OTP_RELEASE_CANDIDATE_LOCK_REMEDIATION_REQUIRED')
assert.equal(mutationUnlocked.checks.find((item) => item.code === 'PHASE18_PRODUCTION_PROMOTION_MUTATION_BLOCKED')?.pass, false)

const markdown = formatOtpReleaseCandidateLockPhase18Markdown(audit)
for (const token of [
  'OTP Template vNext Phase 18 Release Candidate Lock',
  'OTP_RELEASE_CANDIDATE_LOCK_READY_FOR_PRODUCTION_PROMOTION_PREFLIGHT',
  'PHASE18_QA_EVIDENCE_CHAIN_FROZEN',
  'otp-vnext-phase18-release-candidate-lock',
  'developer_authorised_signatory',
  'otp-rc-lock:',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpReleaseCandidateLockPhase18.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_RELEASE_CANDIDATE_LOCK_PHASE18_VERSION',
  'OTP_RELEASE_CANDIDATE_LOCK_READY_EVIDENCE',
  'buildOtpFinalCompletionDryRunPhase17Audit',
  'releaseCandidateFingerprint',
  'route_output_drift_detected',
  'qa_evidence_drift_detected',
  'productionPromotionBlockedUntilLock',
  'mutationAllowed: false',
  'mutatedData: false',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP release-candidate lock Phase 18 contract passed.')
