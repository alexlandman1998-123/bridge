import assert from 'node:assert/strict'
import fs from 'node:fs'
import { documentGeneratorProtectedTables } from '../src/core/documents/documentGeneratorAccessBoundary.js'
import { documentGeneratorAuthorisedReadTables } from '../src/core/documents/documentGeneratorAuthorityContinuity.js'

const verifier = fs.readFileSync('scripts/document-generator-phase-h3-authority-continuity.mjs', 'utf8')
const accessSource = fs.readFileSync('src/core/documents/documentGeneratorAccessBoundary.js', 'utf8')
const authoritySource = fs.readFileSync('src/core/documents/documentGeneratorAuthorityContinuity.js', 'utf8')
for (const table of documentGeneratorProtectedTables) assert.match(accessSource, new RegExp(table))
for (const table of documentGeneratorAuthorisedReadTables) assert.match(authoritySource, new RegExp(table))
for (const token of ['H3_AUTHORISED_EMAIL', 'H3_REVOKED_EMAIL', 'STAGING_PROJECT_REF', 'SAFE_MISSING_VERSION_ID', 'bridge_can_access_legal_packet_h2', 'rendered_file_bucket', 'final_signed_file_bucket', 'bridge_get_document_generator_launch_chain_g1', 'bridge_authorize_persisted_pdf_access_d4', 'bridge_get_final_completion_status_f5', 'bridge_rehearse_final_completion_recovery_g4', 'NO_GENERATED_VERSION', 'FINALISATION_FORBIDDEN', 'retry-final-document-completion', 'F5_ACCESS_DENIED', 'mutatedData: false']) assert.match(verifier, new RegExp(token))
assert.match(verifier, /documentGeneratorProtectedTables/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)

const mandateFinaliser = fs.readFileSync('../supabase/functions/generate-final-signed-document/index.ts', 'utf8')
const otpFinaliser = fs.readFileSync('../supabase/functions/generate-final-signed-otp/index.ts', 'utf8')
for (const marker of [/authorizeFinalisation/, /\["active", "accepted"\]/, /FINALISATION_FORBIDDEN/]) {
  assert.match(mandateFinaliser, marker)
}
assert.match(otpFinaliser, /OTP_FINALISATION_DISABLED_UNSAFE_RECONSTRUCTION/)
const retry = fs.readFileSync('../supabase/functions/retry-final-document-completion/index.ts', 'utf8')
assert.ok(retry.indexOf('F5_ACCESS_DENIED') < retry.indexOf('if(rehearsal)'))

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-h3'])
assert.ok(pkg.scripts?.['verify:document-generator:phase-h3'])
console.log('Document generator H3 authority-continuity contract passed.')
