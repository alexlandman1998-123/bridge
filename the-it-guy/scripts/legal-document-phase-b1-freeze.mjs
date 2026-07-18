import { buildLegalDocumentReviewSnapshot, sha256, stableJson } from './legal-document-review-fingerprint.mjs'

const snapshot = await buildLegalDocumentReviewSnapshot()
const generatedAt = new Date().toISOString()
const manifest = {
  version: 1,
  phase: 'B1',
  status: 'frozen_for_counsel_review',
  digestAlgorithm: 'sha256',
  projectRef: snapshot.projectRef,
  candidateOrganisationIds: snapshot.candidateOrganisationIds,
  generatedAt,
  templates: snapshot.templates,
}
manifest.manifestDigest = `sha256:${sha256(stableJson({ ...manifest, generatedAt: undefined, manifestDigest: undefined }))}`
console.log(JSON.stringify(manifest, null, 2))
