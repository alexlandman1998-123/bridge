// Offline browser verification only. This module is never imported by the production application.
import { buildBondApplicationSubmissionSnapshot } from '../../../src/modules/bond/application/submission/buildBondApplicationSubmissionSnapshot.js'
import { hashBondApplicationSnapshot } from '../../../src/modules/bond/application/submission/bondApplicationSnapshotHash.js'
import { createEmptyBondApplicationState } from '../../../src/modules/bond/application/bondApplicationState.js'
const initial = () => ({ requests: [{ id: 'request-1', title: 'Latest bank statements', instruction: 'Upload all pages.', status: 'awaiting_review', documentId: 'document-1', history: [] }], corrections: [], records: [], currentVersion: { id: 'signed-1', number: 1, signedAt: '2026-09-01T10:00:00Z' } })
const read = () => JSON.parse(localStorage.getItem('bond-verification-handoff') || 'null') || initial()
const write = (data) => localStorage.setItem('bond-verification-handoff', JSON.stringify(data))
const pkg = { exportPackageId: 'package-1', transactionId: 'transaction-1', recipientName: 'Verification applicant', packageStatus: 'accepted_by_originator', actions: { canRequestDocuments: true, canIssueAccessLink: false } }
export const fetchBondApplicationOriginatorActionCentre = async () => ({ items: [structuredClone(pkg)] })
export const fetchBondApplicationPortalDeliveryActionCentre = async () => ({ items: [] })
export const fetchBondApplicationPortalOriginatorDocumentContinuity = async () => ({ items: [] })
export const fetchBondApplicationExternalSubmissions = async () => ({ items: [{ exportPackageId: pkg.exportPackageId, records: read().records }] })
export const fetchBondApplicationHandoff = async () => read()
export const fetchBondApplicationBuyerNotices = async () => ({ documents: read().requests, corrections: read().corrections })
const assessment = () => ({ status: read().requests.some((r) => !['accepted','withdrawn'].includes(r.status)) || read().corrections.some((r) => r.status !== 'resolved') ? 'blocked' : 'ready', blockers: [] })
export const fetchBondApplicationSubmissionReadiness = async () => ({ items: [{ exportPackageId: pkg.exportPackageId, assessment: assessment() }] })
export const assessBondApplicationSubmissionReadiness = async () => assessment()
export async function reviewBondApplicationHandoffDocument({ requestId, action, feedback }) {
  const state = read(), request = state.requests.find((r) => r.id === requestId)
  request.status = { accept: 'accepted', reject: 'rejected', more_information: 'needs_more_information', withdraw: 'withdrawn' }[action]
  request.feedback = feedback
  request.history.push({ status: request.status, feedback, at: new Date().toISOString(), documentId: request.documentId, actorId: 'test-originator' })
  write(state)
}
export async function createBondOriginatorWorkspaceDocumentRequest({ title, buyerInstruction }) {
  const state = read(); state.requests.push({ id: `request-${state.requests.length+1}`, title, instruction: buyerInstruction, status: 'sent', history: [] }); write(state)
}
export async function updateBondApplicationCorrection({ action, instruction }) {
  if (action === 'resolve') throw new Error('A newly signed current application version is required before resolving corrections.')
  const state = read(); state.corrections.push({ id: 'correction-1', status: 'sent', instruction, createdAt: new Date().toISOString() }); write(state)
}
export async function recordBondApplicationExternalSubmission(values) {
  const state = read()
  if (values.expectedSubmissionId !== state.currentVersion.id) throw new Error('The signed application changed. Refresh and confirm which version was submitted.')
  state.records.push({ id: `record-${state.records.length+1}`, status: 'recorded', lenderNames: values.lenderNames, externalReference: values.externalReference, submittedAt: values.submittedAt, submittedBy: 'Test originator', version: { submissionVersion: 1, applicationRevision: 1, snapshotHash: 'synthetic-version-hash' } }); write(state)
}
export const issueBondApplicationPortalAccessLinkForOriginator = async () => { throw new Error('Email/access issuance is disabled in offline verification.') }
export const revokeBondApplicationPortalAccessLinkForOriginator = issueBondApplicationPortalAccessLinkForOriginator
export const sendBondApplicationPortalDeliveryForOriginator = issueBondApplicationPortalAccessLinkForOriginator
export const fetchBondApplicationPackDocumentUrl = async () => '/verification-file.pdf'
export async function fetchBondApplicationDownloadContext() {
  const state = createEmptyBondApplicationState()
  state.application.transactionId = 'transaction-1'
  state.participants.primaryApplicant.personal = { first_name: 'Zoë', surname: 'Verification' }
  const snapshot = buildBondApplicationSubmissionSnapshot({ applicationState: state, submissionVersion: 1, createdAt: '2026-09-01T10:00:00Z' })
  const snapshotHash = await hashBondApplicationSnapshot(snapshot)
  return { transactionId: 'transaction-1', draftSnapshot: snapshot, submission: { id: 'signed-1', transaction_id: 'transaction-1', status: 'submitted', signed_at: '2026-09-01T10:00:00Z', snapshot_json: snapshot, snapshot_hash: snapshotHash, submission_version: 1, signed_document_id: 'document-1' }, documents: [{ id: 'document-1', transaction_id: 'transaction-1', file_path: 'synthetic-signed.pdf', status: 'uploaded' }], readiness: { ready: true, stage: 'bank_submission', issues: [] }, documentChecklist: { items: [] } }
}
