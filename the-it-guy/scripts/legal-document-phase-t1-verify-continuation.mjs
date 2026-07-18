import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentExpandedCohortContinuationRecord } from '../src/core/documents/legalDocumentExpandedCohortContinuationRecord.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
let state
let claimState
let activationState
try { state = JSON.parse(fs.readFileSync('config/legal-document-expanded-cohort-continuation.json', 'utf8')) } catch { state = { status: 'unavailable', record: null } }
try { claimState = JSON.parse(fs.readFileSync('config/legal-document-expanded-release-claim.json', 'utf8')) } catch { claimState = { status: 'unavailable', claim: null } }
try { activationState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation.json', 'utf8')) } catch { activationState = { status: 'unavailable', activation: null } }
const assessment = assessLegalDocumentExpandedCohortContinuationRecord({ record: state.record, claim: claimState.claim, activation: activationState.activation, digest })
console.log(JSON.stringify({ phase: 'T1', status: assessment.ready ? 'READY_FOR_T2' : 'NO_GO', ready: assessment.ready, blockerCount: assessment.blockers.length, blockers: assessment.blockers, evidence: { continuationState: state.status || 'UNAVAILABLE', claimState: claimState.status || 'UNAVAILABLE', activationState: activationState.status || 'UNAVAILABLE', decision: state.record?.decision || null, releaseTarget: state.record?.releaseTarget || null, addedOrganisationId: state.record?.addedOrganisationId || null, recordedAt: state.record?.recordedAt || null, recordedBy: state.record?.recordedBy || null }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
