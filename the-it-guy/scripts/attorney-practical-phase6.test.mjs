import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { ATTORNEY_PRACTICAL_PHASE6_CONFIRMATION, ATTORNEY_PRACTICAL_PHASE6_VERSION, ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF, ATTORNEY_PRACTICAL_STAGING_PROJECT_REF, buildAttorneyPracticalPhase6Decision } from '../src/services/attorneyPracticalReleaseCandidatePhase6.js'

const bytes = readFileSync(new URL('../config/attorney-practical-release-bar.json', import.meta.url)); const contract = JSON.parse(bytes)
const contractFingerprint = createHash('sha256').update(bytes).digest('hex'); const phase5EvidenceFingerprint = 'phase5-hash'
const chain = { phase0Report: { status: 'ACCEPTED', contractFingerprint }, phase0Approval: { contractFingerprint, confirmation: 'ACCEPT_ATTORNEY_RELEASE_BAR' }, phase5Report: { status: 'STABILIZED', evidenceFingerprint: phase5EvidenceFingerprint }, phase5Evidence: { contractFingerprint }, phase5EvidenceFingerprint }
assert.equal(buildAttorneyPracticalPhase6Decision({ contract, contractFingerprint }).status, 'BLOCKED')
assert.equal(buildAttorneyPracticalPhase6Decision({ contract, contractFingerprint, ...chain }).status, 'READY_TO_PREPARE')
const candidate = { version: ATTORNEY_PRACTICAL_PHASE6_VERSION, sourceEnvironment: 'staging', contractFingerprint, phase5EvidenceFingerprint, codeRevision: 'abc123', buildArtifactHash: 'build-hash', buildEvidencePath: 'output/build.txt', preparedBy: 'Release engineer', preparedAt: '2026-09-07T12:00:00.000Z', cumulativeTestsPassed: true, productionBuildPassed: true, environmentSafety: { stagingProjectRef: ATTORNEY_PRACTICAL_STAGING_PROJECT_REF, productionProjectRef: ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF, productionTargetConfirmed: true, secretsSeparated: true, productionBackupVerified: true, migrationPlanStatus: 'none' }, rollback: { owner: 'Release owner', runbookPath: 'docs/rollback.md', verifiedAt: '2026-09-07T11:00:00.000Z', killSwitchVerified: true, maximumMinutes: 15 }, rollout: { mode: 'controlled', maximumOrganisations: 2, featureFlag: 'attorney_release', cohortReference: 'pilot-1' }, monitoring: { owner: 'Operations', dashboardPath: 'monitoring/attorney', securityAlertReady: true, visibilityAlertReady: true, propagationAlertReady: true, dataIntegrityAlertReady: true, destinations: [...contract.destinations] }, support: { owner: 'Support lead', escalationPath: 'runbooks/attorney', coverageWindow: 'launch + 24h' } }
const candidateFingerprint = createHash('sha256').update(JSON.stringify(candidate)).digest('hex')
assert.equal(buildAttorneyPracticalPhase6Decision({ contract, contractFingerprint, ...chain, candidate, candidateFingerprint }).status, 'READY_FOR_APPROVAL')
const approval = { candidateFingerprint, approvedBy: 'Release owner', approvedAt: '2026-09-07T12:30:00.000Z', approvalReference: 'release-1', confirmation: ATTORNEY_PRACTICAL_PHASE6_CONFIRMATION }
assert.equal(buildAttorneyPracticalPhase6Decision({ contract, contractFingerprint, ...chain, candidate, candidateFingerprint, approval }).status, 'APPROVED')
const unsafe = structuredClone(candidate); unsafe.environmentSafety.productionProjectRef = ATTORNEY_PRACTICAL_STAGING_PROJECT_REF
assert.equal(buildAttorneyPracticalPhase6Decision({ contract, contractFingerprint, ...chain, candidate: unsafe, candidateFingerprint: 'unsafe', approval }).status, 'INVALID')
const stale = { ...approval, candidateFingerprint: 'stale' }
assert.equal(buildAttorneyPracticalPhase6Decision({ contract, contractFingerprint, ...chain, candidate, candidateFingerprint, approval: stale }).status, 'READY_FOR_APPROVAL')
console.log('Attorney practical release candidate Phase 6 gate passed.')
