import { SELLER_BASE_PACK_KEYS, normalizeSellerBasePackKey } from '../../lib/sellerBasePackContract.js'
import { SELLER_DOCUMENT_SIGNING_CONTRACT } from './sellerDocumentSigningContract.js'
import { createMandateSigningContract, verifyMandateSigningContract, mandateRequiredSigners, mandateSigningInputsUnchanged, isFullMandateSigningCopy } from './sellerMandateSigningApproval.js'
import { buildSellerMandateFrozenDocumentMarkup } from './sellerMandateDocumentMarkup.js'
import { normalizeSellerMandateType } from '../../lib/sellerMandateCapture.js'

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

function legacyMandateTermsEqual(left, right) {
  const comparable = value => ({ ...record(value), ...(value?.mandateType !== undefined ? { mandateType: normalizeSellerMandateType(value.mandateType) } : {}) })
  return canonicalJson(comparable(left)) === canonicalJson(comparable(right))
}

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

/**
 * Shared by browser freezing/verification and the signing Edge Function.
 * Omit an empty facts fingerprint to preserve already-approved legacy hashes.
 * A present fingerprint is always bound into the hash, with no legacy fallback.
 * @param {Record<string, unknown>} document
 */
export async function computeSellerReviewedDocumentVersionDigest(document = {}) {
  const key = normalizeSellerBasePackKey(document.key || document.requirementKey)
  const signers = Array.isArray(document.requiredSigners) ? document.requiredSigners : []
  const mandateTerms = key === SELLER_BASE_PACK_KEYS.SIGNED_MANDATE ? record(document.mandateTerms) : null
  const sourceFactsFingerprint = text(document.sourceFactsFingerprint)
  return sha256(canonicalJson({
    key, contentDigest: text(document.contentDigest), sourceDraftFingerprint: text(document.sourceDraftFingerprint),
    signers, mandateTerms, ...(sourceFactsFingerprint ? { sourceFactsFingerprint } : {}),
    ...(document.mandateContract ? { mandateContract: document.mandateContract } : {}),
  }))
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
  if (approval.status !== 'approved' || !['manual_upload', 'digital_pack'].includes(approval.signingRoute)) {
    throw new Error('Approve the seller documents before freezing their signing versions.')
  }
  if (!text(actor) || !text(approvedAt)) throw new Error('Record the agent and approval time before freezing documents.')
  const signers = requiredSigners(signingPack)
  if (approval.signingRoute === 'digital_pack') {
    const emails = signers.map((signer) => signer.email)
    if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || new Set(emails).size !== emails.length) {
      throw new Error('Give every required signer a distinct valid email before preparing portal signing.')
    }
  }
  const documents = Array.isArray(manualSigningPack?.documents) ? manualSigningPack.documents : []
  const selected = Array.isArray(approval.selectedDocuments) ? approval.selectedDocuments.map(text) : ['fica', 'mandate']
  const selectedKeys = new Set(selected.map((value) => value === 'fica' ? SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION : value === 'mandate' ? SELLER_BASE_PACK_KEYS.SIGNED_MANDATE : value === 'disclosure' ? SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM : value))
  const seen = new Set()
  if (!documents.length) throw new Error('No reviewed seller documents are available to freeze.')
  const mandateTerms = record(signingPack?.mandate)
  const fullMandateContract = documents.some(document => normalizeSellerBasePackKey(document.key || document.requirementKey) === SELLER_BASE_PACK_KEYS.SIGNED_MANDATE && !text(document.versionId) && !text(document.versionDigest)) && mandateTerms.mandateCapture !== undefined
    ? await createMandateSigningContract({ ...signingPack, renderedAt: manualSigningPack.generatedAt || signingPack.frozenAt }) : null
  const reviewedDocuments = await Promise.all(documents.map(async (document) => {
    const key = normalizeSellerBasePackKey(document?.key || document?.requirementKey)
    if (!keys.has(key) || seen.has(key)) throw new Error('Each reviewed seller document needs one distinct requirement row.')
    seen.add(key)
    const documentSigners = key === SELLER_BASE_PACK_KEYS.SIGNED_MANDATE && mandateTerms.mandateCapture !== undefined ? mandateRequiredSigners(signingPack) : signers
    if (text(document?.versionId) || text(document?.versionDigest)) {
      if (selectedKeys.has(key) || !await verifySellerReviewedDocumentVersion(document)) throw new Error(`The existing ${key} copy cannot be reused. Include it in this signing pack for review.`)
      if (canonicalJson(document.requiredSigners) !== canonicalJson(documentSigners)) throw new Error(`The required signers changed. Include ${key} in this signing pack for review.`)
      if (document.mandateContract && !mandateSigningInputsUnchanged(document.mandateContract, signingPack)) throw new Error('The approved mandate inputs changed. Prepare a replacement mandate for review.')
      if (key === SELLER_BASE_PACK_KEYS.SIGNED_MANDATE && (document.mandateContract
        ? canonicalJson(record(document.mandateTerms)) !== canonicalJson(record(signingPack.mandate))
        : !legacyMandateTermsEqual(document.mandateTerms, signingPack.mandate))) {
        throw new Error('The mandate terms changed. Include the mandate in this signing pack for review.')
      }
      return document
    }
    const generatedHtml = String(document?.generatedHtml || document?.generated_html || '')
    if (!text(generatedHtml)) throw new Error(`The reviewed ${key} document has no frozen content.`)
    if (fullMandateContract && key === SELLER_BASE_PACK_KEYS.SIGNED_MANDATE && generatedHtml !== buildSellerMandateFrozenDocumentMarkup(fullMandateContract)) throw new Error('The full mandate copy must match the approved wording and every frozen input.')
    if (key === SELLER_BASE_PACK_KEYS.SIGNED_MANDATE && !approval.commission?.confirmed) {
      throw new Error('Confirm the mandate commission and VAT treatment before freezing its version.')
    }
    const contentDigest = await sha256(generatedHtml)
    const frozenMandateTerms = key === SELLER_BASE_PACK_KEYS.SIGNED_MANDATE ? structuredClone(mandateTerms) : null
    const sourceDraftFingerprint = text(document?.sourceDraftFingerprint)
    const sourceFactsFingerprint = text(document?.sourceFactsFingerprint)
    const mandateContract = key === SELLER_BASE_PACK_KEYS.SIGNED_MANDATE ? fullMandateContract : null
    const versionDigest = await computeSellerReviewedDocumentVersionDigest({ key, contentDigest, sourceDraftFingerprint, sourceFactsFingerprint, requiredSigners: documentSigners, mandateTerms: frozenMandateTerms, ...(mandateContract ? { mandateContract } : {}) })
    return {
      ...document,
      key,
      requirementKey: key,
      versionId: globalThis.crypto.randomUUID(),
      versionDigest,
      contentDigest,
      sourceDraftFingerprint,
      sourceFactsFingerprint,
      requiredSigners: structuredClone(documentSigners),
      ...(mandateContract ? { mandateContract: structuredClone(mandateContract) } : {}),
      mandateTerms: frozenMandateTerms,
      approvedAt: text(approvedAt),
      approvedBy: text(actor),
      status: (document.signingRoute || approval.signingRoute) === 'digital_pack'
        ? (Array.isArray(approval.selectedDocuments) ? 'ready_for_portal_signature' : 'awaiting_signature')
        : 'awaiting_signed_hard_copy',
      signingRoute: document.signingRoute || approval.signingRoute,
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
  const fullMandate = key === SELLER_BASE_PACK_KEYS.SIGNED_MANDATE && isFullMandateSigningCopy(document, html)
  if (fullMandate && (!await verifyMandateSigningContract(document.mandateContract) || canonicalJson(document.requiredSigners) !== canonicalJson(document.mandateContract.requiredSigners) || canonicalJson(document.mandateTerms) !== canonicalJson(document.mandateContract.inputs.mandate))) return false
  if (document.mandateContract && html !== buildSellerMandateFrozenDocumentMarkup(document.mandateContract)) return false
  return await computeSellerReviewedDocumentVersionDigest(document) === document.versionDigest
}

/** Persist a compact lookup beside the existing HTML signing copies. */
export function buildSellerReviewedDocumentVersionIndex(pack = {}) {
  const project = (document = {}) => ({
    key: document.key,
    versionId: document.versionId,
    versionDigest: document.versionDigest,
    contentDigest: document.contentDigest,
    sourceDraftFingerprint: document.sourceDraftFingerprint,
    sourceFactsFingerprint: document.sourceFactsFingerprint,
    requiredSigners: document.requiredSigners,
    mandateTerms: document.mandateTerms,
    ...(document.mandateContract ? { mandateContract: document.mandateContract } : {}),
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
