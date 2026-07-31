import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

const packageJson = JSON.parse(await read('../package.json'))
const packetApi = await read('../src/lib/documentPacketsApi.js')
const workspace = await read('../src/components/documents/LegalDocumentWorkspace.jsx')
const workspacePage = await read('../src/pages/LegalDocumentWorkspacePage.jsx')
const api = await read('../src/lib/api.js')

assert.equal(
  packageJson.scripts?.['test:physical-signed-upload-phaseA'],
  'node scripts/physical-signed-upload-phaseA.test.mjs',
  'package.json should expose the physical signed upload Phase A audit.',
)

for (const reference of [
  'completePhysicalSignedPacketUpload',
  'uploadFinalSignedPacketArtifact',
  'updateDocumentPacketVersionFinalArtifact',
  'signed_physical_otp_uploaded',
  'signed_physical_mandate_uploaded',
  'manualSignedFilePath',
  'physicalSigningUpload',
  'canonicalPhysicalUpload',
]) {
  assertIncludes(packetApi, reference, `documentPacketsApi should keep canonical physical upload behavior: ${reference}.`)
}

for (const reference of [
  'PhysicalSignedUploadPanel',
  'Signed Physical',
  'This is the signed copy of the generated',
  'All required parties have signed',
  'No pages were substituted',
  'I understand this will lock the legal record',
  'handlePhysicalSignedUpload',
  'completePhysicalSignedPacketUpload',
  'Upload Signed',
  'physical_signed_upload',
]) {
  assertIncludes(workspace, reference, `LegalDocumentWorkspace should keep physical upload UI/action: ${reference}.`)
}

for (const reference of [
  'finalizeCanonicalPhysicalSignedOtpWorkflow',
  'canonical_physical_signed_otp_workflow_completed',
]) {
  assertIncludes(workspacePage, reference, `LegalDocumentWorkspacePage should keep canonical OTP physical upload finalization: ${reference}.`)
}

for (const reference of [
  'finalizeCanonicalPhysicalSignedOtpWorkflow',
  'canonical_physical_signed_otp_upload',
  'PHASE0_LEGACY_OTP_SIGNING_DISABLED',
]) {
  assertIncludes(api, reference, `api.js should keep canonical OTP finalizer and disabled legacy guard: ${reference}.`)
}

console.log('physical signed upload Phase A audit passed')
