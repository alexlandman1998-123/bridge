import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentNextExpansionApproval } from '../src/core/documents/legalDocumentNextExpansionApproval.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
let pilot
let approvalState
let continuationState
let activationState
try { pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8')) } catch { pilot = {} }
try { approvalState = JSON.parse(fs.readFileSync('config/legal-document-next-expansion-approval.json', 'utf8')) } catch { approvalState = { status: 'unavailable', approval: null } }
try { continuationState = JSON.parse(fs.readFileSync('config/legal-document-expanded-cohort-continuation.json', 'utf8')) } catch { continuationState = { status: 'unavailable', record: null } }
try { activationState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation.json', 'utf8')) } catch { activationState = { status: 'unavailable', activation: null } }
const assessment = assessLegalDocumentNextExpansionApproval({ approval: approvalState.approval, continuation: continuationState.record, activation: activationState.activation, pilot, digest })
console.log(JSON.stringify({
  phase: 'U1', status: assessment.ready ? 'READY_FOR_U2' : 'NO_GO', ready: assessment.ready,
  blockerCount: assessment.blockers.length, blockers: assessment.blockers,
  evidence: {
    approvalState: approvalState.status || 'UNAVAILABLE', continuationState: continuationState.status || 'UNAVAILABLE', activationState: activationState.status || 'UNAVAILABLE',
    approvedBy: approvalState.approval?.approvedBy || null, approvalReference: approvalState.approval?.approvalReference || null,
    sourceHandoffDigest: approvalState.approval?.sourceHandoffDigest || null, addedOrganisationId: approvalState.approval?.addedOrganisationId || null,
    proposedOrganisationIds: approvalState.approval?.proposedOrganisationIds || [],
  },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!assessment.ready) process.exitCode = 1
