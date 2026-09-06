import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ATTORNEY_RELEASE_PHASE8_CONFIRMATION, ATTORNEY_PRODUCTION_PROJECT_REF, buildAttorneyReleasePhase8Decision } from '../src/services/attorneyReleasePhase8.js'
const releaseFingerprint = 'release-fingerprint'
const phase7Receipt = { status: 'GO', immutable: true, releaseFingerprint }
const candidate = { releaseFingerprint, deploymentId: 'dpl_candidate', deploymentUrl: 'https://candidate.vercel.app', verifiedAt: '2026-09-08T12:00:00.000Z', browserSmokePassed: true, rollbackDeploymentId: 'dpl_previous', rollbackTested: true, productionProjectRef: ATTORNEY_PRODUCTION_PROJECT_REF, organisationIds: ['11111111-1111-4111-8111-111111111111'], monitoringOwner: 'Monitor', rollbackOwner: 'Rollback' }
const approval = { releaseFingerprint, candidateDeploymentId: candidate.deploymentId, approvedBy: 'Release owner', approvedAt: '2026-09-08T12:05:00.000Z', approvalReference: 'cutover-1', confirmation: ATTORNEY_RELEASE_PHASE8_CONFIRMATION }
const ready = { phase7Receipt, receiptIntegrityPassed: true, candidate, approval }
assert.equal(buildAttorneyReleasePhase8Decision(ready).status, 'READY_FOR_CANARY')
assert.equal(buildAttorneyReleasePhase8Decision({ ...ready, phase7Receipt: { ...phase7Receipt, status: 'NO_GO' } }).status, 'BLOCKED')
assert.equal(buildAttorneyReleasePhase8Decision({ ...ready, receiptIntegrityPassed: false }).status, 'BLOCKED')
assert.equal(buildAttorneyReleasePhase8Decision({ ...ready, candidate: { ...candidate, organisationIds: [] } }).status, 'BLOCKED')
assert.equal(buildAttorneyReleasePhase8Decision({ ...ready, candidate: { ...candidate, organisationIds: ['1', '2', '3', '4'] } }).status, 'BLOCKED')
assert.equal(buildAttorneyReleasePhase8Decision({ ...ready, candidate: { ...candidate, organisationIds: ['not-an-id'] } }).status, 'BLOCKED')
assert.equal(buildAttorneyReleasePhase8Decision({ ...ready, candidate: { ...candidate, rollbackTested: false } }).status, 'BLOCKED')
assert.equal(buildAttorneyReleasePhase8Decision({ ...ready, approval: { ...approval, confirmation: 'yes' } }).status, 'BLOCKED')
const planner = readFileSync(new URL('./plan-attorney-release-phase8.mjs', import.meta.url), 'utf8')
assert.match(planner, /mutatedProduction: false/)
assert.match(planner, /deploymentPerformed: false/)
assert.match(planner, /cohortDigest/)
assert.doesNotMatch(planner, /vercel (deploy|promote|rollback)/)
assert.doesNotMatch(planner, /db\.from\([^\n]+\)\.(insert|update|upsert|delete)\(/)
console.log('Attorney release Phase 8 controlled cutover planning contract passed.')
