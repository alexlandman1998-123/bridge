import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentNextPendingExpansion } from '../src/core/documents/legalDocumentNextPendingExpansion.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
const pilot = read('config/legal-document-pilot.json', {})
const pendingState = read('config/legal-document-next-pending-expansion.json', { status: 'unavailable', pending: null })
const approvalState = read('config/legal-document-next-expansion-approval.json', { status: 'unavailable', approval: null })
const continuationState = read('config/legal-document-expanded-cohort-continuation.json', { status: 'unavailable', record: null })
const activationState = read('config/legal-document-expansion-activation.json', { status: 'unavailable', activation: null })
const assessment = assessLegalDocumentNextPendingExpansion({ pending: pendingState.pending, approval: approvalState.approval, continuation: continuationState.record, activation: activationState.activation, pilot, digest })
console.log(JSON.stringify({
  phase: 'U2', status: assessment.ready ? 'READY_FOR_U3' : 'NO_GO', ready: assessment.ready,
  blockerCount: assessment.blockers.length, blockers: assessment.blockers,
  evidence: {
    pendingState: pendingState.status || 'UNAVAILABLE', approvalState: approvalState.status || 'UNAVAILABLE', continuationState: continuationState.status || 'UNAVAILABLE', activationState: activationState.status || 'UNAVAILABLE',
    currentOrganisationIds: pilot.organisationIds || [], addedOrganisationId: pendingState.pending?.addedOrganisationId || null,
    proposedOrganisationIds: pendingState.pending?.proposedOrganisationIds || [], effectiveAllowlistChanged: false, runtimeActivationChanged: false,
  },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!assessment.ready) process.exitCode = 1
