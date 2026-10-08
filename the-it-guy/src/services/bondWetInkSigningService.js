import { getDocumentUploadPolicy, validateDocumentUploadFile } from '../lib/documentUploadPolicy.js'
import { assertBondReviewedVersionIntegrity } from '../modules/bond/application/submission/bondApplicationReviewedVersion.js'
import { readBoundedDownload } from './bondApplicationDownloadService.js'

export const BOND_WET_INK_BUCKET = 'bond-signed-applications'
const maximumBytes = getDocumentUploadPolicy({ surface: 'bond_signed_application' }).maxBytes
const digest = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('')
const rpc = async (client, name, args) => {
  const result = await client.rpc(name, args)
  if (result.error) throw result.error
  return result.data
}

export async function validateBondSignedPdf(file) {
  validateDocumentUploadFile(file, { surface: 'bond_signed_application' })
  if (file.size < 5) throw new Error('Choose a PDF of the complete signed application, up to 25 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('The selected file is not a PDF. Scan all signed pages into one PDF.')
  return { bytes, sha256: await digest(bytes) }
}

export function createBondWetInkSigningService(client) {
  const load = () => rpc(client, 'bridge_bond_wet_ink_context')
  const readOriginal = async (upload) => {
    const result = await client.storage.from(BOND_WET_INK_BUCKET).createSignedUrl(upload.file_path, 120)
    if (result.error || !result.data?.signedUrl) throw new Error('The signed original is not accessible. Refresh and retry.')
    const bytes = await readBoundedDownload(result.data.signedUrl, { maximumBytes })
    if (bytes.length !== upload.bytes || await digest(bytes) !== upload.sha256) throw new Error('The signed original could not be verified. Do not accept this upload.')
    return bytes
  }
  return {
    load,
    async prepare({ expectedRevision, declarationValues }) {
      const result = await rpc(client, 'bridge_prepare_bond_wet_ink', { p_revision: expectedRevision, p_declarations: declarationValues })
      await assertBondReviewedVersionIntegrity(result.version.snapshot_json)
      return result
    },
    async upload({ version, file, attempt }) {
      const validated = await validateBondSignedPdf(file)
      const retry = attempt && attempt.versionId === version.id && attempt.sha256 === validated.sha256
        ? attempt : { id: crypto.randomUUID(), versionId: version.id, sha256: validated.sha256 }
      const path = `${version.bond_application_id}/${version.id}/${retry.id}.pdf`
      try {
        if (!retry.stored) {
          const result = await client.storage.from(BOND_WET_INK_BUCKET).upload(path, validated.bytes, { upsert: false, contentType: 'application/pdf' })
          if (result.error) {
            // An uncertain previous response may have committed the immutable
            // object. Verify it before retrying metadata; never overwrite it.
            if (String(result.error.statusCode || result.error.status) !== '409') throw result.error
            await readOriginal({ file_path: path, bytes: validated.bytes.length, sha256: validated.sha256 })
          }
          retry.stored = true
        }
        return await rpc(client, 'bridge_upload_bond_wet_ink', { p_version: version.id, p_upload: retry.id, p_name: file.name, p_bytes: validated.bytes.length, p_sha256: validated.sha256 })
      } catch (failure) {
        const error = new Error(failure.message || 'The signed copy could not be recorded. Retry this file.')
        error.retryAttempt = retry
        throw error
      }
    },
    cancel: (versionId) => rpc(client, 'bridge_cancel_bond_wet_ink', { p_version: versionId }),
    queue: () => rpc(client, 'bridge_bond_wet_ink_review_queue'),
    review: ({ uploadId, action, feedback = '', checks = {} }) => rpc(client, 'bridge_review_bond_wet_ink', { p_upload: uploadId, p_action: action, p_feedback: feedback, p_checks: checks }),
    readOriginal,
    async signingPdf(version) {
      await assertBondReviewedVersionIntegrity(version.snapshot_json)
      const { renderBondApplicationPackPdf } = await import('../modules/bond/application/exports/bondApplicationPackPdf.js')
      return renderBondApplicationPackPdf({ snapshot: version.snapshot_json, brand: { name: version.snapshot_json.source?.originatorName || 'Bond application' }, manifest: { mode: 'draft', purpose: 'wet_ink_signing', transactionId: version.transaction_id, submissionVersion: version.version, generatedAt: version.created_at, snapshotHash: version.snapshot_hash, files: [], warnings: [] } })
    },
  }
}

export function downloadBondSigningBytes(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url; link.download = filename; document.body.appendChild(link)
  try { link.click() } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000) }
}
