import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('../supabase/migrations/202607180025_document_generator_recovery_rehearsal_g4.sql', 'utf8')
for (const token of ['bridge_rehearse_final_completion_recovery_g4', "'contract','g4-v1'", 'legal_final_artifact_evidence', 'legal_final_transaction_publications', 'legal_final_completion_receipts', 'legal_final_delivery_claims', 'legal_final_completion_retry_attempts', "'mutatedData',false"]) assert.match(migration, new RegExp(token))
assert.doesNotMatch(migration, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b/i)

const endpoint = fs.readFileSync('../supabase/functions/retry-final-document-completion/index.ts', 'utf8')
assert.match(endpoint, /rehearsal/)
assert.match(endpoint, /bridge_rehearse_final_completion_recovery_g4/)
assert.match(endpoint, /mutatedData:false/)
assert.ok(endpoint.indexOf('if(rehearsal)') < endpoint.indexOf('bridge_claim_final_completion_retry_f5'))

const verifier = fs.readFileSync('scripts/document-generator-phase-g4-recovery-rehearsal.mjs', 'utf8')
assert.match(verifier, /document-generator-phase-g3-operational-readiness\.mjs/)
assert.match(verifier, /document-generator-phase-g1-verify\.mjs/)
assert.match(verifier, /STAGING_PROJECT_REF/)
assert.match(verifier, /rehearsal: true/)
assert.match(verifier, /evidenceDigest/)
assert.match(verifier, /mutatedData: false/)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-g4'])
assert.ok(pkg.scripts?.['verify:document-generator:phase-g4'])
console.log('Document generator G4 recovery rehearsal contract passed.')
