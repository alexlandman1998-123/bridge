import { validateDocumentUploadFile } from '../../lib/documentUploadPolicy.js'
export const legacyCompanyDocumentKey = actorId => `itg:developer-company-docs:v1:${actorId}`
export function readLegacyCompanyDocuments(actorId, storage = globalThis.localStorage) {
  if (!actorId || !storage) return []
  const value = storage.getItem(legacyCompanyDocumentKey(actorId))
  if (!value) return []
  let rows
  try { rows = JSON.parse(value) } catch { throw new Error('The browser-saved company documents could not be read. Their original data has been kept; contact support to recover it.') }
  if (!Array.isArray(rows) || rows.some(row => !row?.id || typeof row.fileUrl !== 'string')) throw new Error('The browser-saved company documents have an unexpected format. Their original data has been kept; contact support.')
  return rows
}
export function legacyCompanyDocumentFile(row) {
  const match = /^data:([^;,]*);base64,([A-Za-z0-9+/=\s]+)$/.exec(row?.fileUrl || '')
  if (!match) throw new Error('This browser copy does not contain a readable file. Choose its original file and upload it securely; the browser copy has been kept.')
  let decoded
  try { decoded = atob(match[2].replace(/\s/g,'')) } catch { throw new Error('This browser file is damaged. Choose its original file and upload it securely; the browser copy has been kept.') }
  const file = new File([Uint8Array.from(decoded, character => character.charCodeAt(0))], row.fileName || 'document.pdf', { type: match[1] || 'application/octet-stream', lastModified: 0 })
  validateDocumentUploadFile(file, { surface: 'company_document' })
  return file
}
export function clearRecoveredCompanyDocument({ actorId, legacy, receipt, storage = globalThis.localStorage }) {
  if (receipt?.saved !== true || !receipt.id || receipt.uploaded_by !== actorId || !receipt.legacy_import_key?.startsWith(`${legacy.id}:`)) throw new Error('The secure save was not confirmed. The browser copy has been kept.')
  const current = readLegacyCompanyDocuments(actorId, storage)
  // Do not delete a local replacement made in another tab while upload ran.
  const remaining = current.filter(row => JSON.stringify(row) !== JSON.stringify(legacy))
  storage.setItem(legacyCompanyDocumentKey(actorId), JSON.stringify(remaining))
  return remaining
}
