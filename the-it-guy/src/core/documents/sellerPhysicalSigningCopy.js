import { SELLER_BASE_PACK_KEYS, normalizeSellerBasePackKey } from '../../lib/sellerBasePackContract.js'
import { verifySellerReviewedDocumentVersion } from './sellerReviewedDocumentVersions.js'

const SIGNING_KEYS = new Set([
  SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM,
  SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION,
  SELLER_BASE_PACK_KEYS.SIGNED_MANDATE,
])

/** The uploaded signed file can outrank the printable copy in the document projection. */
export function getSellerPhysicalSigningCopy(row = {}) {
  const candidates = [row]
  const visited = new Set()
  while (candidates.length) {
    const document = candidates.shift()
    if (!document || typeof document !== 'object' || visited.has(document)) continue
    visited.add(document)
    if (
      document.source === 'seller_onboarding.manual_signing_pack' &&
      SIGNING_KEYS.has(normalizeSellerBasePackKey(document.key || document.requirementKey || document.requirement_key || document.document_type)) &&
      document.versionId && document.versionDigest && document.contentDigest &&
      (document.generatedHtml || document.generated_html)
    ) return document
    candidates.push(document.originalDocument, document.original?.document)
    if (Array.isArray(document.originalRows)) candidates.push(...document.originalRows)
  }
  return null
}

export async function requireSellerPhysicalSigningCopy(row) {
  const document = getSellerPhysicalSigningCopy(row)
  if (!document) throw new Error('The reviewed physical-signing copy is unavailable. Reopen the approved signing pack.')
  if (!await verifySellerReviewedDocumentVersion(document)) {
    throw new Error('This signing copy has changed since approval. Review and approve a new version before using it.')
  }
  return document
}

export async function downloadSellerPhysicalSigningCopy(row, downloadPdf) {
  const document = await requireSellerPhysicalSigningCopy(row)
  const key = normalizeSellerBasePackKey(document.key || document.requirementKey || document.requirement_key || document.document_type)
  const fileName = document.generatedFileName || document.generated_file_name || `${key}.pdf`
  await downloadPdf(document.generatedHtml || document.generated_html, fileName)
}
