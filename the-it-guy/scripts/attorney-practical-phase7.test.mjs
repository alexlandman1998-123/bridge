import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF } from '../src/services/attorneyPracticalReleaseCandidatePhase6.js'
import { ATTORNEY_PRACTICAL_PHASE7_CONFIRMATION, ATTORNEY_PRACTICAL_PHASE7_VERSION, buildAttorneyPracticalPhase7Decision } from '../src/services/attorneyPracticalControlledRolloutPhase7.js'

const contract = JSON.parse(readFileSync(new URL('../config/attorney-practical-release-bar.json', import.meta.url), 'utf8'))
const phase6Candidate = { codeRevision: 'abc123', buildArtifactHash: 'build-hash', environmentSafety: { productionProjectRef: ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF }, rollout: { maximumOrganisations: 2, featureFlag: 'attorney_release', cohortReference: 'pilot-1' } }
const phase6CandidateFingerprint = createHash('sha256').update(JSON.stringify(phase6Candidate)).digest('hex')
const chain = { phase6Report: { status: 'APPROVED', releaseAuthorized: true, candidateFingerprint: phase6CandidateFingerprint }, phase6Candidate, phase6CandidateFingerprint, phase6Approval: { candidateFingerprint: phase6CandidateFingerprint } }
assert.equal(buildAttorneyPracticalPhase7Decision({ contract }).status, 'BLOCKED')
assert.equal(buildAttorneyPracticalPhase7Decision({ contract, ...chain }).status, 'READY_FOR_AUTHORIZATION')
const request = { version: ATTORNEY_PRACTICAL_PHASE7_VERSION, candidateFingerprint: phase6CandidateFingerprint, productionProjectRef: ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF, authorizedBy: 'Release owner', authorizedAt: '2026-09-07T13:00:00.000Z', changeReference: 'change-1', confirmation: ATTORNEY_PRACTICAL_PHASE7_CONFIRMATION, organisationIds: ['org-1', 'org-2'], featureFlag: 'attorney_release', cohortReference: 'pilot-1' }
const requestFingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex')
assert.equal(buildAttorneyPracticalPhase7Decision({ contract, ...chain, request, requestFingerprint }).status, 'AUTHORIZED_TO_EXECUTE')
const receipt = { version: ATTORNEY_PRACTICAL_PHASE7_VERSION, candidateFingerprint: phase6CandidateFingerprint, requestFingerprint, productionProjectRef: ATTORNEY_PRACTICAL_PRODUCTION_PROJECT_REF, target: 'production', deploymentStatus: 'READY', deploymentId: 'deploy-1', deploymentUrl: 'https://example.vercel.app', deployedAt: '2026-09-07T13:10:00.000Z', deployedBy: 'Release engineer', codeRevision: 'abc123', buildArtifactHash: 'build-hash', deploymentMethod: 'promote_prevalidated_artifact', featureFlag: 'attorney_release', cohortReference: 'pilot-1', organisationIds: ['org-1', 'org-2'], killSwitchAvailable: true, roleSmokes: Object.keys(contract.roles).map((role) => ({ role, authenticated: true, assignedMatterOpened: true, safeMutationPassed: true, evidencePath: `output/${role}.json` })), destinationSmokes: contract.destinations.map((destination) => ({ destination, passed: true, evidencePath: `output/${destination}.json` })), securityIncidents: 0, visibilityIncidents: 0, dataIntegrityIncidents: 0, propagationGaps: 0, unexpectedPermissionAllows: 0, productionErrorCount: 0, monitoringSnapshotPath: 'output/monitoring.json', smokeCompletedAt: '2026-09-07T13:20:00.000Z' }
assert.equal(buildAttorneyPracticalPhase7Decision({ contract, ...chain, request, requestFingerprint, receipt, receiptFingerprint: 'receipt-hash' }).status, 'PILOT_ACTIVE')
const leaked = structuredClone(receipt); leaked.visibilityIncidents = 1
assert.equal(buildAttorneyPracticalPhase7Decision({ contract, ...chain, request, requestFingerprint, receipt: leaked }).status, 'ROLLBACK')
const wrongArtifact = structuredClone(receipt); wrongArtifact.buildArtifactHash = 'rebuilt'
assert.equal(buildAttorneyPracticalPhase7Decision({ contract, ...chain, request, requestFingerprint, receipt: wrongArtifact, receiptFingerprint: 'receipt-hash' }).status, 'HOLD')
const staleDeployment = structuredClone(receipt); staleDeployment.deployedAt = '2026-09-07T12:50:00.000Z'
assert.equal(buildAttorneyPracticalPhase7Decision({ contract, ...chain, request, requestFingerprint, receipt: staleDeployment, receiptFingerprint: 'receipt-hash' }).status, 'HOLD')
console.log('Attorney practical controlled rollout Phase 7 gate passed.')
