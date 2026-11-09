// bond owns these operations and their existing recovery behavior.
import { requireClient } from '../../lib/api/shared/readHelpers.js'
import { createBuyerBondApplicationRuntimeService } from '../../modules/bond/application/workspace/bondApplicationRuntimeService.js'
import { validateDocumentUploadFile } from '../../lib/documentUploadPolicy'
import { requireClientPortalTokenClient } from '../clientPortal/appointmentRead.js'
import { requireBondApplicationPortalTokenClient, fetchBondApplicationDownloadContext } from './portalApi.js'
import { createBondWetInkSigningService } from '../../services/bondWetInkSigningService.js'

function buyerBondApplicationRuntime({ token, accessToken } = {}) {
  const client = accessToken ? requireBondApplicationPortalTokenClient(accessToken) : requireClientPortalTokenClient(token)
  return createBuyerBondApplicationRuntimeService({ client, validateFile: (file) => validateDocumentUploadFile(file, { surface: 'buyer_portal' }) })
}

export const fetchBuyerBondApplicationRuntime = (args) => buyerBondApplicationRuntime(args).load()

export const startBuyerBondApplicationRuntime = (args) => buyerBondApplicationRuntime(args).start()

export const saveBuyerBondApplicationRuntimeDraft = (args) => buyerBondApplicationRuntime(args).save(args)

export const reconcileBuyerBondApplicationRuntimeDocuments = (args) => buyerBondApplicationRuntime(args).reconcile(args)

export const uploadBuyerBondApplicationRuntimeDocument = (args) => buyerBondApplicationRuntime(args).upload(args)

export const submitBuyerBondApplicationRuntime = (args) => buyerBondApplicationRuntime(args).submit(args)

export const refreshBuyerBondApplicationRuntimeSubmission = (args) => buyerBondApplicationRuntime(args).refreshSubmission()

export const cancelBuyerBondApplicationRuntimeSubmission = (args) => buyerBondApplicationRuntime(args).cancel(args)

const buyerWetInkService = ({ token, accessToken } = {}) => createBondWetInkSigningService(accessToken ? requireBondApplicationPortalTokenClient(accessToken) : requireClientPortalTokenClient(token))

export const fetchBuyerBondWetInkSigning = (args) => buyerWetInkService(args).load()

export const prepareBuyerBondWetInkSigning = (args) => buyerWetInkService(args).prepare(args)

export const uploadBuyerBondWetInkSignedCopy = (args) => buyerWetInkService(args).upload(args)

export const cancelBuyerBondWetInkSigning = (args) => buyerWetInkService(args).cancel(args.versionId)

export const renderBuyerBondWetInkSigningPdf = (args) => buyerWetInkService(args).signingPdf(args.version)

export const readBuyerBondWetInkOriginal = (args) => buyerWetInkService(args).readOriginal(args.upload)

export const fetchBondWetInkReviewQueue = () => createBondWetInkSigningService(requireClient()).queue()

export const readBondWetInkReviewOriginal = (upload) => createBondWetInkSigningService(requireClient()).readOriginal(upload)

export const reviewBondWetInkSignedCopy = (args) => createBondWetInkSigningService(requireClient()).review(args)

export async function fetchBondSubmissionPackContext({ transactionId } = {}) {
  const proof = await requireClient().rpc('bridge_bond_submission_pack_original', { p_transaction: transactionId })
  if (proof.error) throw proof.error
  const manual = await fetchBondManualContext({ transactionId })
  const context = await fetchBondApplicationDownloadContext({ transactionId, externalReceipts: manual.externalReceipts || [] })
  if (proof.data?.submissionId !== context.submission?.id) throw new Error('The signed application changed. Refresh and retry.')
  const review = await requireClient().rpc('bridge_bond_submission_review_context', { p_transaction: transactionId })
  if (review.error) throw review.error
  if (review.data?.submissionId !== context.submission?.id) throw new Error('The signed application changed. Refresh and retry.')
  return { ...context, originalEvidence: proof.data?.originalEvidence || null, reviewContext: review.data, manualContext: manual }
}

export async function fetchBondSubmissionPackQueue() {
  const result = await requireClient().rpc('bridge_bond_submission_pack_queue')
  if (result.error) throw result.error
  return result.data || []
}

export async function recordBondSubmissionConsultantReview({ transactionId, submissionId, contextHash, checks } = {}) {
  const result = await requireClient().rpc('bridge_record_bond_submission_review', { p_transaction: transactionId, p_submission: submissionId, p_context_hash: contextHash, p_checks: checks })
  if (result.error) throw result.error
  return result.data
}

export async function fetchBondManualContext({ transactionId }) {
  const result = await requireClient().rpc('bridge_bond_manual_context', { p_transaction: transactionId })
  if (result.error) throw result.error
  return result.data
}

export async function prepareOriginatorBondApplication({ transactionId }) {
  const result = await requireClient().rpc('bridge_prepare_originator_bond_application', { p_transaction: transactionId })
  if (result.error) throw result.error
  return result.data
}

export async function recordBondStatementReceipt({ transactionId, submissionId, requirementKey, receivedAt, reference }) {
  const result = await requireClient().rpc('bridge_record_bond_statement_receipt', { p_transaction: transactionId, p_submission: submissionId, p_requirement_key: requirementKey, p_received_at: receivedAt, p_reference: reference })
  if (result.error) throw result.error
  return result.data
}

export async function revokeBondStatementReceipt({ transactionId, submissionId, requirementKey }) {
  const result = await requireClient().rpc('bridge_revoke_bond_statement_receipt', { p_transaction: transactionId, p_submission: submissionId, p_requirement_key: requirementKey })
  if (result.error) throw result.error
}

export async function recordManualBondSubmission({ transactionId, submissionId, contextHash, bankId, bankName, submittedAt, reference }) {
  const result = await requireClient().rpc('bridge_record_manual_bond_submission', { p_transaction: transactionId, p_submission: submissionId, p_context_hash: contextHash, p_bank_id: bankId, p_bank_name: bankName, p_submitted_at: submittedAt, p_reference: reference })
  if (result.error) throw result.error
  return result.data
}

export async function requestManualBondDocument({ transactionId, requestId, type, title, instruction }) {
  const result = await requireClient().rpc('bridge_request_manual_bond_document', { p_transaction: transactionId, p_request: requestId, p_type: type, p_title: title, p_instruction: instruction })
  if (result.error) throw result.error
  return result.data
}

export async function reviewManualBondDocument({ transactionId, requirementId, documentId, expectedPath, action, feedback = '' }) {
  const result = await requireClient().rpc('bridge_review_manual_bond_document', { p_transaction: transactionId, p_requirement: requirementId, p_document: documentId, p_expected_path: expectedPath, p_action: action, p_feedback: feedback })
  if (result.error) throw result.error
  return result.data
}

export async function recordBondTrackerSubmission({ transactionId, bankName, submittedAt, reference = '', notes = '' }) {
  const result = await requireClient().rpc('bridge_record_bond_tracker_submission', { p_transaction: transactionId, p_bank_name: bankName, p_submitted_at: submittedAt, p_reference: reference, p_notes: notes })
  if (result.error) throw result.error
  return result.data
}

export async function fetchBuyerBondTrackerContext({ token, accessToken } = {}) {
  const client = accessToken ? requireBondApplicationPortalTokenClient(accessToken) : requireClientPortalTokenClient(token)
  const result = await client.rpc('bridge_buyer_bond_tracker_context')
  if (result.error) throw result.error
  return result.data
}
