import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const releasePolicy = await readFile(new URL('../src/core/documents/legalClausePackSignatureRelease.js', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const packetService = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:legal-clause-pack-signature-release-phase7'],
  'node src/core/documents/__tests__/legalClausePackSignatureRelease.test.js && node scripts/legal-clause-pack-signature-release-phase7.test.mjs',
  'package.json should expose the Phase 7 signature-release regression.',
)

for (const token of [
  'sa_legal_clause_pack_signature_release_v1',
  'requiresLegalSpecialist',
  'contentFingerprint',
  'packetVersionId',
  'LEGAL_REVIEWER_ROLES',
  'canSendForSignature',
]) {
  assert.ok(releasePolicy.includes(token), `Signature-release policy should preserve ${token}.`)
}

for (const token of [
  'LegalSignatureReleasePanel',
  'Attorney review required',
  'Attorney Approve OTP',
  'buildLegalSignatureReleaseApproval',
  "runReviewAction('approve_draft')",
  'legal_signature_release',
]) {
  assert.ok(workspace.includes(token), `Legal workspace should expose Phase 7 review behaviour: ${token}`)
}

for (const token of [
  'resolveLegalClausePackSignatureRelease',
  'LEGAL_SIGNATURE_RELEASE_BLOCKED',
  'signatureRelease.canSendForSignature',
  'includeVersions: true',
]) {
  assert.ok(packetService.includes(token), `Shared signing service should enforce Phase 7: ${token}`)
}

console.log('Legal clause-pack signature release Phase 7 contract passed.')

