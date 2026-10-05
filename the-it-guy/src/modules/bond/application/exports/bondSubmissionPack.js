import { isDocumentAccepted, isBuyerVisibleDocument } from '../documents/bondApplicationDocumentStatus.js'
import { isBondStatementHandoff } from '../documents/bondDocumentWorkspacePresentation.js'
import { assertBondReviewedVersionIntegrity, buildBondDocumentChangeRegister } from '../submission/bondApplicationReviewedVersion.js'
import { hashBondApplicationSnapshot } from '../submission/bondApplicationSnapshotHash.js'
import { assessBondBankSubmission } from '../submission/bondBankSubmissionAssessment.js'
import { BOND_DOWNLOAD_LIMITS } from './bondApplicationDownloadPack.js'

const safeName = value => String(value || 'document').normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^\.+/, '').slice(0, 100) || 'document'
const current = doc => !doc.archived_at && !doc.deleted_at && ![doc.review_status, doc.status].some(status => ['rejected', 'superseded', 'cancelled', 'inactive'].includes(status))
const statement = value => isBondStatementHandoff({ key: [value.canonicalDocumentType, value.key, value.requirementKey, value.baseRequirementKey, value.requirement_key, value.document_key, value.document_type, value.documentType, value.documentDefinitionKey, value.title, value.name].filter(Boolean).map(key => String(key).replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_')).join(' ') })

export function buildBondSubmissionPackPlan(context = {}) {
  const { transactionId, submission, originalEvidence, documents = [], documentChecklist = {}, readiness } = context
  const snapshot = submission?.snapshot_json
  if (!transactionId || !snapshot || String(snapshot.transaction?.id || snapshot.application?.transactionId) !== String(transactionId) || submission.transaction_id !== transactionId || !['signed', 'submitted'].includes(submission.status) || !submission.signed_at || !submission.snapshot_hash) throw new Error('An accepted signed application version is required for this pack.')
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > 5 * 1024 * 1024) throw new Error('The application exceeds the download size limit.')
  const lookup = new Map(documents.map(doc => [String(doc.id), doc]))
  const original = lookup.get(String(submission.signed_document_id))
  if (!original || !current(original) || !original.file_path || original.transaction_id !== transactionId) throw new Error('The accepted original signed PDF is not accessible.')
  const wetInk = submission.metadata?.signingMethod === 'wet_ink_upload'
  if (wetInk && (!originalEvidence || originalEvidence.status !== 'accepted' || originalEvidence.documentId !== original.id || originalEvidence.submissionId !== submission.id || originalEvidence.filePath !== original.file_path || !/^[a-f0-9]{64}$/.test(originalEvidence.sha256) || !(originalEvidence.bytes >= 5))) throw new Error('The accepted signed-original evidence could not be verified.')
  if (!wetInk && !isDocumentAccepted(original)) throw new Error('The original signed PDF still needs approval.')
  // An ID appearing under another requirement must never smuggle statement bytes into a ZIP.
  const excluded = new Set(documents.filter(statement).map(doc => String(doc.id)))
  for (const item of [...(documentChecklist.items || []), ...(snapshot.documentManifest || [])]) {
    if (statement(item.requirement || item)) {
      if (item.matchedDocumentId) excluded.add(String(item.matchedDocumentId))
      for (const doc of item.documents || []) excluded.add(String(doc.id))
    }
  }
  excluded.add(String(original.id))
  const files = new Map()
  const rows = (documentChecklist.items || []).filter(item => item.requirement?.active !== false).map(item => {
    const requirement = item.requirement || {}
    const title = requirement.title || requirement.key || 'Supporting document'
    if (statement(requirement)) return { key: requirement.key, title, participantRole: requirement.participantRole, status: 'Secure handoff not connected', included: [], outstanding: true, external: true, blocking: requirement.required !== false && requirement.requiredBefore !== 'requested_after_originator_review' }
    const approved = [...new Set((item.documents || []).map(doc => String(doc.id)))].map(id => lookup.get(id)).filter(doc => doc && !excluded.has(String(doc.id)) && isBuyerVisibleDocument(doc) && isDocumentAccepted(doc) && current(doc) && doc.transaction_id === transactionId && (doc.file_path || doc.storage_path))
    for (const doc of approved) {
      const existing = files.get(String(doc.id))
      if (existing) existing.requirements = [...new Set([...existing.requirements, title])]
      else files.set(String(doc.id), { id: String(doc.id), document: doc, requirements: [title] })
    }
    const required = Math.max(1, Number(item.requiredCount || requirement.minimumFileCount || 1))
    return { key: requirement.key, title, participantRole: requirement.participantRole, status: approved.length >= required ? 'Approved' : approved.length ? 'More approved files needed' : (item.documents || []).length ? 'Awaiting review or replacement' : 'Missing', included: approved.map(doc => String(doc.id)), required, outstanding: approved.length < required, external: false, blocking: requirement.required !== false && requirement.requiredBefore !== 'requested_after_originator_review' }
  })
  if (files.size + 1 > BOND_DOWNLOAD_LIMITS.files) throw new Error('The pack exceeds 100 files.')
  const entries = [...files.values()].map((entry, index) => {
    const doc = entry.document
    const extension = (doc.file_path || doc.storage_path).match(/\.[a-zA-Z0-9]{1,8}$/)?.[0] || '.bin'
    const name = safeName(doc.name || doc.file_name || doc.id)
    return { ...entry, archivePath: `supporting-documents/${String(index + 1).padStart(3, '0')}-${name.toLowerCase().endsWith(extension.toLowerCase()) ? name : name + extension}` }
  })
  const ready = readiness?.stage === 'bank_submission' && readiness.ready === true && !(readiness.issues || []).length && rows.every(row => !row.outstanding || row.blocking === false)
  const plan = { transactionId, submission, snapshot: structuredClone(snapshot), original, originalEvidence: wetInk ? originalEvidence : null, files: entries, rows, ready, issues: readiness?.issues || [], documentChanges: buildBondDocumentChangeRegister(snapshot, documentChecklist), filename: `bond-application-${safeName(transactionId)}-v${submission.submission_version || snapshot.submissionVersion || 1}` }
  plan.reviewContext = context.reviewContext
  plan.releaseGate = context.releaseGate
  plan.assessment = assessBondBankSubmission({ plan, reviewContext: context.reviewContext, releaseGate: context.releaseGate })
  plan.ready = plan.assessment.ready
  plan.issues = plan.assessment.issues
  return plan
}

export function bondSubmissionPackFingerprint(plan) {
  return JSON.stringify({ submission: [plan.submission.id, plan.submission.snapshot_hash, plan.submission.signed_document_id], evidence: plan.originalEvidence, original: fileVersion(plan.original), files: plan.files.map(entry => fileVersion(entry.document)), rows: plan.rows, ready: plan.ready, issues: plan.issues, reviewContext: plan.reviewContext, releaseGate: plan.releaseGate })
}
function fileVersion(doc) { return [doc.id, doc.file_path || doc.storage_path, doc.file_bucket || doc.bucket, doc.updated_at, doc.review_status, doc.status] }

export async function createBondSubmissionPack({ plan, output, loadFile, renderChecklist, generatedAt = new Date().toISOString() }) {
  if (!['application', 'supporting', 'checklist'].includes(output)) throw new Error('Choose an application, supporting documents or checklist download.')
  if (plan.snapshot.reviewedVersion) await assertBondReviewedVersionIntegrity(plan.snapshot)
  if (await hashBondApplicationSnapshot(plan.snapshot) !== plan.submission.snapshot_hash) throw new Error('The signed application version could not be verified.')
  const { zipSync, strToU8 } = await import('fflate')
  const archive = {}, index = []
  let total = 0
  async function read(doc, signed = false) {
    const bytes = new Uint8Array(await loadFile(doc))
    total += bytes.length
    if (!bytes.length || bytes.length > BOND_DOWNLOAD_LIMITS.fileBytes || total > BOND_DOWNLOAD_LIMITS.totalBytes) throw new Error('A file is empty or exceeds the pack size limit. No partial download was created.')
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    const sha256 = [...digest].map(value => value.toString(16).padStart(2, '0')).join('')
    if (signed && (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-' || (plan.originalEvidence && (bytes.length !== plan.originalEvidence.bytes || sha256 !== plan.originalEvidence.sha256)))) throw new Error('The original signed PDF could not be verified.')
    return { bytes, sha256 }
  }
  if (output === 'application') return { bytes: (await read(plan.original, true)).bytes, filename: `${plan.filename}-signed.pdf`, type: 'application/pdf' }
  if (output === 'supporting') for (const entry of plan.files) {
    const file = await read(entry.document)
    archive[entry.archivePath] = file.bytes
    index.push({ path: entry.archivePath, documentId: entry.id, requirements: entry.requirements, bytes: file.bytes.length, sha256: file.sha256 })
  }
  const checklist = { formatVersion: 'bond-submission-pack-v1', reference: plan.snapshot.reviewedVersion?.reference || plan.filename, submissionId: plan.submission.id, submissionVersion: plan.submission.submission_version, signedAt: plan.submission.signed_at, snapshotHash: plan.submission.snapshot_hash, generatedAt, ready: plan.ready, consultantReview: plan.reviewContext?.review || null, releaseVersion: plan.releaseGate?.version || null, rows: plan.rows, issues: plan.issues, files: plan.files.map(entry => ({ path: entry.archivePath, documentId: entry.id, requirements: entry.requirements, ...index.find(file => file.documentId === entry.id) })), documentChanges: plan.documentChanges, statementHandoff: 'not_connected' }
  const pdf = await renderChecklist(checklist)
  if (output === 'checklist') return { bytes: pdf, filename: `${plan.filename}-checklist.pdf`, type: 'application/pdf' }
  archive['pack-checklist.pdf'] = pdf
  archive['document-index.json'] = strToU8(JSON.stringify(checklist, null, 2))
  archive['READ-ME.txt'] = strToU8(`${plan.ready ? 'Ready for bank submission' : 'INCOMPLETE - resolve the checklist before bank submission'}\nDownload the accepted signed application separately.\nOnly approved current supporting files are included.\nBank statements are excluded. Secure consultant handoff is not connected; receipt is unverified.\nThis download does not send anything to a bank.\nApplication reference: ${checklist.reference}`)
  if (Object.values(archive).reduce((sum, bytes) => sum + bytes.length, 0) > BOND_DOWNLOAD_LIMITS.totalBytes) throw new Error('The completed pack exceeds 100 MB.')
  return { bytes: zipSync(archive, { level: 0 }), filename: `${plan.filename}-supporting.zip`, type: 'application/zip' }
}
