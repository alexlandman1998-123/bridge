import { hashBondApplicationSnapshot } from '../submission/bondApplicationSnapshotHash.js'
import { isDocumentUploaded } from '../documents/bondApplicationDocumentStatus.js'

export const BOND_DOWNLOAD_LIMITS = { fileBytes: 25 * 1024 * 1024, totalBytes: 100 * 1024 * 1024, files: 100 }

function safeName(value) {
  return String(value || 'document').normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^\.+/, '').slice(0, 100) || 'document'
}

function documentFilename(document) {
  const name = safeName(document.name || document.file_name || document.id)
  const extension = String(document.file_path || document.storage_path || '').match(/\.[a-zA-Z0-9]{1,8}$/)?.[0]
    || ({ 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg' }[document.mime_type || document.content_type]) || '.bin'
  return name.toLowerCase().endsWith(extension.toLowerCase()) ? name : `${name}${extension}`
}

export function resolveBondSignedDocumentId(submission, version) {
  if (submission?.signed_document_id) return submission.signed_document_id
  if (!submission?.generated_document_id || !submission?.signing_request_id || !version?.finalised_at) return null
  if (version.id !== submission.generated_document_id || version.packet_id !== submission.signing_request_id) return null
  return version.final_signed_document_id || null
}

export function buildBondApplicationDownloadPlan({ mode = 'draft', transactionId, draftSnapshot, submission, readiness, documentChecklist = {}, documents = [] } = {}) {
  if (!['draft', 'final'].includes(mode)) throw new Error('Choose a draft or final application pack.')
  const final = mode === 'final'
  if (final && (readiness?.stage !== 'bank_submission' || !readiness.ready || readiness.issues?.length)) {
    throw new Error('Resolve the application readiness items before downloading the final pack. A draft is still available.')
  }
  const snapshot = structuredClone(final ? submission?.snapshot_json : draftSnapshot)
  if (snapshot && new TextEncoder().encode(JSON.stringify(snapshot)).length > 5 * 1024 * 1024) throw new Error('The application data is too large for a single download. Review unusually long answers.')
  if (!snapshot || !transactionId || String(snapshot.transaction?.id || snapshot.application?.transactionId) !== String(transactionId)) {
    throw new Error('The application snapshot does not belong to this transaction.')
  }
  if (final && (!submission?.id || submission.transaction_id !== transactionId || !['signed', 'submitted'].includes(submission.status) || !submission.signed_at || !submission.snapshot_hash)) {
    throw new Error('A verified signed submission is required for the final pack.')
  }
  if (final && !submission.signed_document_id) throw new Error('The original signed application PDF is not linked. Link the signed evidence before downloading a final pack; a draft is available.')
  const lookup = new Map(documents.map((document) => [String(document.id), document]))
  const entries = new Map()
  const warnings = []
  const add = (id, requirement, source, expected = null, signed = false) => {
    if (!id) return
    const document = lookup.get(String(id))
    if (!document || !isDocumentUploaded(document) || document.archived_at || document.deleted_at) {
      const message = `${requirement}: the referenced file is missing, rejected or inaccessible.`
      if (final) throw new Error(message)
      warnings.push(message)
      return
    }
    if (document.transaction_id && document.transaction_id !== transactionId) throw new Error('A supporting document belongs to another transaction.')
    if (expected?.filePath && expected.filePath !== (document.file_path || document.storage_path)) throw new Error(`${requirement}: the stored file version changed. Review the application again.`)
    if (expected?.fileBucket && expected.fileBucket !== (document.file_bucket || document.bucket)) throw new Error(`${requirement}: the stored file location changed. Review the application again.`)
    const existing = entries.get(String(id))
    if (existing) { existing.requirements = [...new Set([...existing.requirements, requirement])]; return }
    entries.set(String(id), { id: String(id), document, requirements: [requirement], source, signed })
  }
  if (final) add(submission.signed_document_id, 'Original signed application', 'signed_evidence', null, true)
  for (const item of snapshot.documentManifest || []) {
    const files = item.documents?.length ? item.documents : (item.matchedDocumentId ? [{ id: item.matchedDocumentId }] : [])
    files.forEach((file) => add(file.id, item.title || item.requirementKey || 'Supporting document', final ? 'recorded_at_signing' : 'draft', file))
  }
  // Later evidence is explicitly identified; it never rewrites the signed answers or original PDF.
  for (const item of documentChecklist.items || []) {
    if (item.requirement?.active === false) continue
    for (const document of item.documents || []) {
      if (isDocumentUploaded(document)) add(document.id, item.requirement?.title || 'Supporting document', final ? 'collected_after_signing' : 'draft')
    }
  }
  if (entries.size > BOND_DOWNLOAD_LIMITS.files) throw new Error('This pack exceeds 100 files. Download the documents separately or reduce the pack size.')
  const files = [...entries.values()].map((entry, index) => ({
    ...entry,
    archivePath: entry.signed ? 'signed-evidence/original-signed-application.pdf' : `supporting-documents/${String(index + 1).padStart(3, '0')}-${documentFilename(entry.document)}`,
  }))
  return { mode, transactionId, snapshot, submission: final ? submission : null, files, warnings, readiness, filename: `bond-application-${safeName(transactionId)}-${final ? `signed-v${submission.submission_version || snapshot.submissionVersion || 1}` : 'draft'}` }
}

export async function createBondApplicationDownload({ plan, brand = {}, loadFile, renderPdf, generatedAt = new Date().toISOString() } = {}) {
  const snapshotHash = await hashBondApplicationSnapshot(plan.snapshot)
  if (plan.mode === 'final' && snapshotHash !== plan.submission.snapshot_hash) throw new Error('The signed snapshot could not be verified. Refresh the application before downloading.')
  const { zipSync, strToU8 } = await import('fflate')
  const zipFiles = {}
  const fileIndex = []
  let total = 0
  for (const entry of plan.files) {
    let bytes
    try { bytes = new Uint8Array(await loadFile(entry.document)) } catch { throw new Error(`${entry.requirements[0]}: the file could not be downloaded. No partial pack was created.`) }
    if (!bytes.length) throw new Error(`${entry.requirements[0]}: the file is empty. No pack was downloaded.`)
    total += bytes.length
    if (bytes.length > BOND_DOWNLOAD_LIMITS.fileBytes || total > BOND_DOWNLOAD_LIMITS.totalBytes) throw new Error('The pack exceeds the download size limit (25 MB per file, 100 MB total). No partial pack was downloaded.')
    if (entry.signed && new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('The original signed application must be a PDF.')
    zipFiles[entry.archivePath] = bytes
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
    fileIndex.push({ path: entry.archivePath, documentId: entry.id, requirements: entry.requirements, source: entry.source, bytes: bytes.length, sha256: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('') })
  }
  const manifest = { formatVersion: 'bond-download-v1', mode: plan.mode, transactionId: plan.transactionId, submissionId: plan.submission?.id || null, submissionVersion: plan.submission?.submission_version || null, signedAt: plan.submission?.signed_at || null, snapshotHash, generatedAt, files: fileIndex, warnings: plan.warnings }
  const pdf = await renderPdf({ snapshot: plan.snapshot, manifest, brand, submission: plan.submission, readiness: plan.readiness })
  zipFiles['application.pdf'] = pdf
  zipFiles['application-data.json'] = strToU8(JSON.stringify(plan.snapshot, null, 2))
  zipFiles['document-index.json'] = strToU8(JSON.stringify(manifest, null, 2))
  zipFiles['READ-ME.txt'] = strToU8([
    plan.mode === 'final' ? 'SIGNED APPLICATION PACK' : 'DRAFT - NOT FOR BANK SUBMISSION',
    'application.pdf is a readable rendering of the captured application. It is not a newly signed document.',
    plan.mode === 'final' ? 'The unchanged original signed PDF is in signed-evidence/. Supporting documents collected after signing are identified in the index.' : 'This draft may be incomplete and has not been certified for submission.',
    `Application version: ${manifest.submissionVersion || 'draft'}`, `Snapshot SHA-256: ${snapshotHash}`,
    '', ...fileIndex.map((file) => `${file.path} | ${file.requirements.join('; ')} | ${file.source} | SHA-256 ${file.sha256}`),
    '', ...plan.warnings,
  ].join('\n'))
  if (Object.values(zipFiles).reduce((sum, bytes) => sum + bytes.length, 0) > BOND_DOWNLOAD_LIMITS.totalBytes) throw new Error('The completed pack exceeds 100 MB. No partial pack was downloaded.')
  return { pdf, zip: zipSync(zipFiles, { level: 0 }), manifest, filename: plan.filename }
}
