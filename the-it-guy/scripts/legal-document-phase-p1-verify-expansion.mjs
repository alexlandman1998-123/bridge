import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentExpansionApproval } from '../src/core/documents/legalDocumentExpansionApproval.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
let approvalState
let continuationState
try { approvalState = JSON.parse(fs.readFileSync('config/legal-document-expansion-approval.json', 'utf8')) } catch { approvalState = { status: 'unavailable', approval: null } }
try { continuationState = JSON.parse(fs.readFileSync('config/legal-document-cohort-continuation.json', 'utf8')) } catch { continuationState = { status: 'unavailable', record: null } }
const assessment = assessLegalDocumentExpansionApproval({ approval: approvalState.approval, continuation: continuationState.record, configuredOrganisationIds: pilot.organisationIds, digest })
console.log(JSON.stringify({ phase: 'P1', status: assessment.ready ? 'READY_FOR_P2' : 'NO_GO', ready: assessment.ready, blockerCount: assessment.blockers.length, blockers: assessment.blockers, evidence: { approvalState: approvalState.status || 'UNAVAILABLE', continuationState: continuationState.status || 'UNAVAILABLE', approvedBy: approvalState.approval?.approvedBy || null, approvalReference: approvalState.approval?.approvalReference || null, addedOrganisationId: approvalState.approval?.addedOrganisationId || null, proposedOrganisationIds: approvalState.approval?.proposedOrganisationIds || [] }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
