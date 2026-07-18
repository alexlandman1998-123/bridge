import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { assessLegalDocumentPendingExpansion } from '../src/core/documents/legalDocumentPendingExpansion.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
let pendingState
let approvalState
try { pendingState = JSON.parse(fs.readFileSync('config/legal-document-pending-expansion.json', 'utf8')) } catch { pendingState = { status: 'unavailable', pending: null } }
try { approvalState = JSON.parse(fs.readFileSync('config/legal-document-expansion-approval.json', 'utf8')) } catch { approvalState = { status: 'unavailable', approval: null } }
const assessment = assessLegalDocumentPendingExpansion({ pending: pendingState.pending, approval: approvalState.approval, configuredOrganisationIds: pilot.organisationIds, digest })
console.log(JSON.stringify({ phase: 'P2', status: assessment.ready ? 'READY_FOR_P3' : 'NO_GO', ready: assessment.ready, blockerCount: assessment.blockers.length, blockers: assessment.blockers, evidence: { pendingState: pendingState.status || 'UNAVAILABLE', approvalState: approvalState.status || 'UNAVAILABLE', currentOrganisationIds: pilot.organisationIds || [], addedOrganisationId: pendingState.pending?.addedOrganisationId || null, proposedOrganisationIds: pendingState.pending?.proposedOrganisationIds || [], effectiveAllowlistChanged: false }, checkedAt: new Date().toISOString(), mutatedData: false }, null, 2))
if (!assessment.ready) process.exitCode = 1
