import assert from 'node:assert/strict'
import fs from 'node:fs'

const script = fs.readFileSync('scripts/document-generator-final-mile-phase7-production-observation.mjs', 'utf8')
const config = JSON.parse(fs.readFileSync('config/legal-document-final-mile-phase7-production-observation.json', 'utf8'))
const audit = fs.readFileSync('docs/audits/document-generator-final-mile-phase-7.md', 'utf8')

assert.equal(config.phase, 'document-generator-final-mile-phase-7')
assert.equal(config.production.appUrl, 'https://app.arch9.co.za')
assert.equal(config.production.projectRef, 'isdowlnollckzvltkasn')
assert.equal(config.release.expectedReleaseId, '05f5f20d14ee3a6e1ef50b8c180b078cf28a7b77')
assert.equal(config.controls.invokesDispatcher, false)
assert.equal(config.controls.sendsEmail, false)
assert.equal(config.controls.mutatesCustomerData, false)
assert.equal(config.controls.mayRecordFinalAccessTrace, true)
assert.equal(config.controls.signedDownloadUrlsRedacted, true)
assert.equal(config.controls.recipientEmailsRedacted, true)

for (const packet of [
  '9ea0cf58-0e0f-47f4-b120-c4cde8d70c7c',
  '5f3dc0d7-7e6d-428e-8404-90bdc9bc3051',
  '92d1a77a-26a6-4373-87d4-ec1871851f39',
  'e06150db-596c-476d-a99d-d3f1cac442c9',
]) {
  assert.match(script, new RegExp(packet), `Phase 7 monitor should keep pinned target ${packet}`)
}

for (const reference of [
  'release-manifest.json',
  'bridge_get_final_completion_status_f5',
  'bridge_get_document_generator_launch_chain_g1',
  'resolve-final-signed-document-access',
  'legal_final_artifact_deliveries',
  'legal_document_pilot_lifecycle_traces_phase5',
  'final_delivery_completed',
  'final_access_authorized',
]) {
  assert.ok(script.includes(reference), `Phase 7 monitor should verify ${reference}`)
}

assert.match(script, /hasDownloadUrl: Boolean\(finalArtifact\.downloadUrl\)/)
assert.doesNotMatch(script, /downloadUrl:\s*finalArtifact\.downloadUrl/)
assert.match(script, /recipientEmailsRedacted:\s*true/)
assert.doesNotMatch(script, /recipient_email/)
assert.doesNotMatch(script, /dispatch-final-signed-document/)

for (const reference of [
  'post-live observation',
  'non-dispatching',
  'does not send email',
  'normal access trace',
  'signed download URL is redacted',
  'https://app.arch9.co.za',
]) {
  assert.ok(audit.includes(reference), `Phase 7 audit should keep ${reference}`)
}

console.log('document-generator final-mile Phase 7 production observation guard passed.')
