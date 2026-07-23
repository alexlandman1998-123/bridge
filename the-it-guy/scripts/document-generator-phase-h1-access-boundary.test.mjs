import assert from 'node:assert/strict'
import fs from 'node:fs'
import { documentGeneratorProtectedTables } from '../src/core/documents/documentGeneratorAccessBoundary.js'

const verifier = fs.readFileSync('scripts/document-generator-phase-h1-access-boundary.mjs', 'utf8')
for (const table of documentGeneratorProtectedTables) assert.match(verifier, new RegExp(table))
for (const token of ['H1_UNRELATED_EMAIL', 'STAGING_PROJECT_REF', 'SAFE_MISSING_VERSION_ID', 'rendered_file_bucket', 'final_signed_file_bucket', 'bridge_get_document_generator_launch_chain_g1', 'bridge_authorize_persisted_pdf_access_d4', 'bridge_get_final_completion_status_f5', 'bridge_rehearse_final_completion_recovery_g4', 'retry-final-document-completion', 'F5_ACCESS_DENIED', 'mutatedData: false']) assert.match(verifier, new RegExp(token))
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)

const generatedPolicy = fs.readFileSync('../supabase/migrations/202607180012_durable_transaction_pdf_link_d3.sql', 'utf8')
const finalPolicy = fs.readFileSync('../supabase/migrations/202607180020_final_signed_transaction_publication_f3.sql', 'utf8')
assert.match(generatedPolicy, /generated_legal_pdf_packet_access_d3[\s\S]*bridge_can_access_legal_packet_h2/)
assert.match(finalPolicy, /final_signed_legal_pdf_access_f3[\s\S]*bridge_can_access_legal_packet_h2/)
const mandateFinaliser = fs.readFileSync('../supabase/functions/generate-final-signed-document/index.ts', 'utf8')
const otpFinaliser = fs.readFileSync('../supabase/functions/generate-final-signed-otp/index.ts', 'utf8')
assert.match(mandateFinaliser, /authorizeFinalisation/)
assert.match(mandateFinaliser, /FINALISATION_FORBIDDEN/)
assert.match(otpFinaliser, /OTP_FINALISATION_DISABLED_UNSAFE_RECONSTRUCTION/)
const retry = fs.readFileSync('../supabase/functions/retry-final-document-completion/index.ts', 'utf8')
assert.ok(retry.indexOf('F5_ACCESS_DENIED') < retry.indexOf('if(rehearsal)'))

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-h1'])
assert.ok(pkg.scripts?.['verify:document-generator:phase-h1'])
console.log('Document generator H1 access-boundary contract passed.')
