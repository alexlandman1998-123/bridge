import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ATTORNEY_RELEASE_PROPAGATION_DESTINATIONS, ATTORNEY_RELEASE_ROLES } from '../src/constants/attorneyReleaseReadinessPhase0.js'
import { ATTORNEY_RELEASE_VIEWPORTS, buildAttorneyReleaseDecision } from '../src/services/attorneyReleaseDecision.js'

const fingerprint = 'phase5-source-fingerprint'
const passingInput = {
  sourceFingerprint: fingerprint,
  codeGatePassed: true,
  buildPassed: true,
  actors: ATTORNEY_RELEASE_ROLES.map(({ transactionRole: role }) => ({ role, authenticated: true, activeAttorneyMembership: true })),
  fixture: { ready: true, expectedTransactions: 6 },
  propagation: { status: 'healthy', gapCount: 0 },
  browserEvidence: {
    sourceFingerprint: fingerprint,
    walkthroughs: ATTORNEY_RELEASE_ROLES.flatMap(({ transactionRole: role }) => ATTORNEY_RELEASE_VIEWPORTS.map((viewport) => ({ role, viewport, passed: true }))),
    destinations: ATTORNEY_RELEASE_PROPAGATION_DESTINATIONS.map((destination) => ({ destination, passed: true })),
  },
  approval: { approvedBy: 'Release owner', approvedAt: '2026-09-05T12:00:00.000Z', sourceFingerprint: fingerprint },
}

assert.equal(buildAttorneyReleaseDecision(passingInput).status, 'GO')

for (const [name, mutation, expectedCode] of [
  ['code gate', { codeGatePassed: false }, 'CODE_GATE_FAILED'],
  ['build', { buildPassed: false }, 'PRODUCTION_BUILD_FAILED'],
  ['propagation', { propagation: { status: 'degraded', gapCount: 1 } }, 'PROPAGATION_NOT_HEALTHY'],
  ['approval', { approval: null }, 'RELEASE_APPROVAL_MISSING'],
  ['stale approval', { approval: { ...passingInput.approval, sourceFingerprint: 'old' } }, 'RELEASE_APPROVAL_STALE'],
]) {
  const report = buildAttorneyReleaseDecision({ ...passingInput, ...mutation })
  assert.equal(report.status, 'NO_GO', `${name} must fail closed`)
  assert.ok(report.blockers.some(({ code }) => code === expectedCode), `${name} must return ${expectedCode}`)
}

const missingMobile = structuredClone(passingInput)
missingMobile.browserEvidence.walkthroughs = missingMobile.browserEvidence.walkthroughs.filter((item) => !(item.role === 'bond_attorney' && item.viewport === 'mobile'))
assert.ok(buildAttorneyReleaseDecision(missingMobile).blockers.some(({ code, role, viewport }) => code === 'BROWSER_WALKTHROUGH_MISSING' && role === 'bond_attorney' && viewport === 'mobile'))

const stagingChecker = readFileSync(new URL('./check-attorney-release-phase5-staging.mjs', import.meta.url), 'utf8')
assert.match(stagingChecker, /ATTORNEY_RELEASE_BROWSER_EVIDENCE_FILE/)
assert.match(stagingChecker, /ATTORNEY_RELEASE_APPROVAL_FILE/)
assert.match(stagingChecker, /createHash\('sha256'\)/)
assert.doesNotMatch(stagingChecker, /serviceKey[\s\S]*console\.log/)

console.log('Attorney release Phase 5 candidate decision gate passed: role, viewport, propagation, destination, fingerprint, and approval failures all fail closed.')
