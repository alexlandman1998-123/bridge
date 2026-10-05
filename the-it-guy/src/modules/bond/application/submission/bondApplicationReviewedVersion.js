import { hashBondApplicationSnapshot } from './bondApplicationSnapshotHash.js'

export const BOND_REVIEWED_VERSION_FORMAT = 'bond-reviewed-version-v1'
const transactionId = (snapshot) => snapshot.transaction?.id || snapshot.application?.transactionId
const versionReference = (snapshot) => `${snapshot.transaction?.reference || transactionId(snapshot)}-V${snapshot.submissionVersion}`

// Signature events and document receipts can change without changing the
// application the person reviewed. Everything else is signed content.
export function getBondReviewedContent(snapshot) {
  const content = structuredClone(snapshot)
  for (const key of ['reviewedVersion', 'documentManifest', 'signatureEvidence', 'source', 'createdAt', 'submissionVersion']) delete content[key]
  content.declarations = (content.declarations || []).map((declaration) => {
    delete declaration.acceptedAt
    return declaration
  })
  content.signerManifest = (content.signerManifest || []).map((signer) => {
    delete signer.status
    return signer
  })
  for (const participant of content.participants || []) {
    delete participant.documents
    for (const declaration of participant.declarations || []) delete declaration.acceptedAt
  }
  if (content.application) {
    delete content.application.revision
    delete content.application.reviewContextHash
  }
  return content
}

export async function sealBondReviewedVersion(snapshot) {
  const frozen = structuredClone(snapshot)
  if (!transactionId(frozen) || !Number.isSafeInteger(frozen.submissionVersion) || frozen.submissionVersion < 1 || !Number.isFinite(Date.parse(frozen.createdAt))) {
    throw new Error('A transaction, numbered application version and creation time are required.')
  }
  if (frozen.reviewedVersion) {
    await assertBondReviewedVersionIntegrity(frozen)
    return frozen
  }
  frozen.reviewedVersion = {
    format: BOND_REVIEWED_VERSION_FORMAT,
    reference: versionReference(frozen),
    version: frozen.submissionVersion,
    createdAt: frozen.createdAt,
    algorithm: 'SHA-256',
    contentHash: await hashBondApplicationSnapshot(getBondReviewedContent(frozen)),
    documentBaselineHash: await hashBondApplicationSnapshot(frozen.documentManifest || []),
  }
  return frozen
}

export async function assertBondReviewedVersionIntegrity(snapshot) {
  const version = snapshot.reviewedVersion
  if (!version || version.format !== BOND_REVIEWED_VERSION_FORMAT || version.algorithm !== 'SHA-256' ||
    version.version !== snapshot.submissionVersion || version.createdAt !== snapshot.createdAt ||
    version.reference !== versionReference(snapshot) ||
    version.contentHash !== await hashBondApplicationSnapshot(getBondReviewedContent(snapshot)) ||
    version.documentBaselineHash !== await hashBondApplicationSnapshot(snapshot.documentManifest || [])) {
    throw new Error('The reviewed application version changed. Review and sign a new version.')
  }
  return true
}

export async function compareBondReviewedVersions(previous, candidate) {
  await assertBondReviewedVersionIntegrity(previous)
  if (transactionId(previous) !== transactionId(candidate)) throw new Error('The application versions belong to different transactions.')
  const contentChanged = previous.reviewedVersion.contentHash !== await hashBondApplicationSnapshot(getBondReviewedContent(candidate))
  const documentsChanged = previous.reviewedVersion.documentBaselineHash !== await hashBondApplicationSnapshot(candidate.documentManifest || [])
  return { contentChanged, documentsChanged, requiresFreshSignatures: contentChanged, requiresDocumentReview: documentsChanged }
}

export async function buildBondReviewedRevision(previous, candidate) {
  const changes = await compareBondReviewedVersions(previous, candidate)
  if (!changes.contentChanged) throw new Error('Supporting-document updates do not create a new application version.')
  if (candidate.submissionVersion !== previous.submissionVersion + 1) throw new Error('A revision must advance the application version by one.')
  const revision = structuredClone(candidate)
  delete revision.reviewedVersion
  revision.signatureEvidence = null
  revision.signerManifest = (revision.signerManifest || []).map((signer) => ({ ...signer, status: 'pending' }))
  revision.declarations = (revision.declarations || []).map((declaration) => ({ ...declaration, accepted: false, acceptedAt: null }))
  for (const participant of revision.participants || []) {
    if (participant.declarations) participant.declarations = participant.declarations.map((declaration) => ({ ...declaration, accepted: false, acceptedAt: null }))
  }
  revision.source = { ...revision.source, previousReviewedReference: previous.reviewedVersion.reference, previousReviewedContentHash: previous.reviewedVersion.contentHash }
  return sealBondReviewedVersion(revision)
}

// Separate supporting-document change register for the downloadable pack.
// This is a comparison to the signing baseline, not a complete audit event log.
export function buildBondDocumentChangeRegister(snapshot, checklist = {}) {
  const baseline = new Map()
  const current = new Map()
  const collect = (items, target, nested) => items.forEach((item) => {
    const requirementKey = nested ? item.requirement?.key : item.requirementKey
    for (const document of item.documents || []) {
      if (!document.id) continue
      const entry = {
        requirementKey, documentId: String(document.id),
        filePath: document.filePath || document.file_path || document.storage_path || null,
        status: document.review_status || document.status || null,
        uploadedAt: document.uploadedAt || document.uploaded_at || document.created_at || null,
      }
      target.set(`${requirementKey}:${entry.documentId}`, entry)
    }
  })
  collect(snapshot.documentManifest || [], baseline, false)
  collect(checklist.items || [], current, true)
  const changes = []
  for (const [key, entry] of current) {
    const old = baseline.get(key)
    if (!old) changes.push({ type: 'added_after_review', ...entry })
    else if (old.filePath !== entry.filePath) changes.push({ type: 'file_changed_requires_review', ...entry })
    else if (old.status !== entry.status) changes.push({ type: 'review_status_changed', previousStatus: old.status, ...entry })
  }
  for (const [key, entry] of baseline) if (!current.has(key)) changes.push({ type: 'no_longer_in_current_checklist', ...entry })
  return { applicationReference: snapshot.reviewedVersion?.reference || null, changes, requiresDocumentReview: changes.length > 0, requiresFreshSignatures: false }
}
