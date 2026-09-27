import { SELLER_BASE_PACK_KEYS, normalizeSellerBasePackKey } from '../../lib/sellerBasePackContract.js'
import { SELLER_DOCUMENT_SIGNING_CONTRACT } from './sellerDocumentSigningContract.js'

export const SELLER_REVIEWED_DOCUMENT_VERSIONS_CONTRACT = 'arch9-seller-reviewed-document-versions-v1'

const text = (value) => String(value ?? '').trim()
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const keys = new Set(Object.values(SELLER_BASE_PACK_KEYS))

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => ({ ...result, [key]: canonical(value[key]) }), {})
  }
  return value
}

const canonicalJson = (value) => JSON.stringify(canonical(value))

function requiredSigners(signingPack = {}) {
  const signers = Array.isArray(signingPack?.signers) ? signingPack.signers : []
  if (!signers.length || signers.some((signer) => !text(signer?.name) || !text(signer?.role))) {
    throw new Error('Identify every required seller signer before approving the documents.')
  }
  return signers.map((signer) => ({
    name: text(signer.name),
    role: text(signer.role),
    email: text(signer.email).toLowerCase(),
  }))
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure document versioning is unavailable in this browser.')
  const bytes = new TextEncoder().encode(value)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

/** Freeze the exact reviewed HTML, signer matrix, and mandate terms for later issuance. */
export async function createSellerReviewedDocumentVersions({
  existing = {},
  manualSigningPack = {},
  formalPackApproval = {},
  signingPack = {},
  actor = '',
  approvedAt = new Date().toISOString(),
} = {}) {
  const approval = record(formalPackApproval)
  if (approval.status !== 'approved' || approval.signingRoute !== 'manual_upload') {
    throw new Error('Approve the seller documents before freezing their signing versions.')
  }
  if (!text(actor) || !text(approvedAt)) throw new Error('Record the agent and approval time before freezing documents.')
  const signers = requiredSigners(signingPack)
  const documents = Array.isArray(manualSigningPack?.documents) ? manualSigningPack.documents : []
  const seen = new Set()
  if (!documents.length) throw new Error('No reviewed seller documents are available to freeze.')
  const mandateTerms = record(signingPack?.mandate)
  const reviewedDocuments = await Promise.all(documents.map(async (document) => {
    const key = normalizeSellerBasePackKey(document?.key || document?.requirementKey)
    if (!keys.has(key) || seen.has(key)) throw new Error('Each reviewed seller document needs one distinct requirement row.')
    seen.add(key)
    const generatedHtml = String(document?.generatedHtml || document?.generated_html || '')
    if (!text(generatedHtml)) throw new Error(`The reviewed ${key} document has no frozen content.`)
    if (key === SELLER_BASE_PACK_KEYS.SIGNED_MANDATE && !approval.commission?.confirmed) {
      throw new Error('Confirm the mandate commission and VAT treatment before freezing its version.')
    }
    const contentDigest = await sha256(generatedHtml)
    const frozenMandateTerms = key === SELLER_BASE_PACK_KEYS.SIGNED_MANDATE ? { ...mandateTerms } : null
    const sourceDraftFingerprint = text(document?.sourceDraftFingerprint)
    const versionDigest = await sha256(canonicalJson({ key, contentDigest, sourceDraftFingerprint, signers, mandateTerms: frozenMandateTerms }))
    return {
      ...document,
      key,
      requirementKey: key,
      versionId: globalThis.crypto.randomUUID(),
      versionDigest,
      contentDigest,
      sourceDraftFingerprint,
      requiredSigners: signers,
      mandateTerms: frozenMandateTerms,
      approvedAt: text(approvedAt),
      approvedBy: text(actor),
      status: 'awaiting_signed_hard_copy',
      signingContract: SELLER_DOCUMENT_SIGNING_CONTRACT,
    }
  }))
  const current = record(existing)
  return {
    contract: SELLER_REVIEWED_DOCUMENT_VERSIONS_CONTRACT,
    approvedAt: text(approvedAt),
    approvedBy: text(actor),
    documents: reviewedDocuments,
    history: [...(Array.isArray(current.history) ? current.history : []), ...(Array.isArray(current.documents) && current.documents.length ? [{ approvedAt: current.approvedAt, approvedBy: current.approvedBy, documents: current.documents }] : [])],
  }
}

export async function verifySellerReviewedDocumentVersion(document = {}) {
  const key = normalizeSellerBasePackKey(document?.key || document?.requirementKey)
  if (!keys.has(key) || !text(document?.versionId) || !text(document?.versionDigest)) return false
  const html = String(document?.generatedHtml || document?.generated_html || '')
  if (!text(html) || await sha256(html) !== document.contentDigest) return false
  const signers = Array.isArray(document.requiredSigners) ? document.requiredSigners : []
  const mandateTerms = key === SELLER_BASE_PACK_KEYS.SIGNED_MANDATE ? record(document?.mandateTerms) : null
  return await sha256(canonicalJson({ key, contentDigest: document.contentDigest, sourceDraftFingerprint: text(document?.sourceDraftFingerprint), signers, mandateTerms })) === document.versionDigest
}

/** Persist a compact lookup beside the existing HTML signing copies. */
export function buildSellerReviewedDocumentVersionIndex(pack = {}) {
  const project = (document = {}) => ({
    key: document.key,
    versionId: document.versionId,
    versionDigest: document.versionDigest,
    contentDigest: document.contentDigest,
    sourceDraftFingerprint: document.sourceDraftFingerprint,
    requiredSigners: document.requiredSigners,
    mandateTerms: document.mandateTerms,
    approvedAt: document.approvedAt,
    approvedBy: document.approvedBy,
  })
  return {
    contract: pack.contract,
    approvedAt: pack.approvedAt,
    approvedBy: pack.approvedBy,
    documents: (Array.isArray(pack.documents) ? pack.documents : []).map(project),
    history: (Array.isArray(pack.history) ? pack.history : []).map((entry) => ({
      approvedAt: entry.approvedAt,
      approvedBy: entry.approvedBy,
      documents: (Array.isArray(entry.documents) ? entry.documents : []).map(project),
    })),
  }
}
