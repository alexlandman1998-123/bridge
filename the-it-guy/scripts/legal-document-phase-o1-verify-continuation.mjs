import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentCohortContinuationRecord } from '../src/core/documents/legalDocumentCohortContinuationRecord.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
let state
let claimState
try { state = JSON.parse(fs.readFileSync('config/legal-document-cohort-continuation.json', 'utf8')) } catch { state = { status: 'unavailable', record: null } }
try { claimState = JSON.parse(fs.readFileSync('config/legal-document-release-claim.json', 'utf8')) } catch { claimState = { status: 'unavailable', claim: null } }
const assessment = assessLegalDocumentCohortContinuationRecord({ record: state.record, claim: claimState.claim, digest })
console.log(JSON.stringify({ phase: 'O1', status: assessment.ready ? 'READY_FOR_O2' : 'NO_GO', ready: assessment.ready, blockerCount: assessment.blockers.length, blockers: assessment.blockers, evidence: { continuationState: state.status || 'UNAVAILABLE', claimState: claimState.status || 'UNAVAILABLE', decision: state.record?.decision || null, releaseTarget: state.record?.releaseTarget || null, recordedAt: state.record?.recordedAt || null, recordedBy: state.record?.recordedBy || null, continuationReference: state.record?.continuationReference || null }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
