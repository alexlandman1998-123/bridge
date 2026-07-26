import assert from 'node:assert/strict'
import fs from 'node:fs'

const promotion = JSON.parse(fs.readFileSync('config/legal-document-final-mile-phase6-production-promotion.json', 'utf8'))
const audit = fs.readFileSync('docs/audits/document-generator-final-mile-phase-6.md', 'utf8')
const sharedAccess = fs.readFileSync('../supabase/functions/_shared/finalSignedArtifactAccess.ts', 'utf8')
const dispatch = fs.readFileSync('../supabase/functions/dispatch-final-signed-document/index.ts', 'utf8')

assert.equal(promotion.phase, 'document-generator-final-mile-phase-6')
assert.equal(promotion.production?.projectRef, 'isdowlnollckzvltkasn')
assert.equal(promotion.production?.appUrl, 'https://app.arch9.co.za')
assert.equal(promotion.production?.vercelProject, 'bridge')
assert.equal(promotion.source?.requiresCleanGitTree, true)
assert.equal(promotion.source?.buildCommand, 'npm run build:guarded')
assert.ok(promotion.databasePatches.includes('supabase/migrations/202607260001_corrective_final_completion_status_truth.sql'))
assert.ok(promotion.databasePatches.includes('supabase/migrations/202607260002_corrective_phase5_lifecycle_trace_hash_format.sql'))
assert.deepEqual(
  promotion.edgeFunctions,
  ['dispatch-final-signed-document', 'resolve-final-signed-document-access'],
)

for (const reference of [
  'isPhase5LegacyFinalDeliveryTraceExact',
  'final_delivery_completed',
  'sameSha256(trace.artifact_sha256, evidence.sha256)',
]) {
  assert.ok(sharedAccess.includes(reference), `Phase 6 legacy access must retain ${reference}`)
}

assert.match(dispatch, /assessControlledTestRecipient/)
assert.match(dispatch, /suppressed: providerMessageId\.startsWith\("suppressed:"\)/)

for (const reference of [
  'https://app.arch9.co.za',
  'isdowlnollckzvltkasn',
  'npm run build:guarded',
  'final_delivery_completed',
  'reserved test recipients',
]) {
  assert.ok(audit.includes(reference), `Phase 6 audit should keep: ${reference}`)
}

console.log('document-generator final-mile Phase 6 production promotion guard passed.')
