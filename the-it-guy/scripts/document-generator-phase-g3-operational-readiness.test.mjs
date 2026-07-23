import assert from 'node:assert/strict'
import fs from 'node:fs'

const watchdog = fs.readFileSync('../supabase/functions/legal-document-watchdog/index.ts', 'utf8')
for (const token of [
  'legal_final_transaction_publications',
  'legal_final_completion_receipts',
  'legal_final_completion_retry_attempts',
  'FINAL_TRANSACTION_PUBLICATION_MISSING',
  'FINAL_SURFACE_COMPLETION_MISSING',
  'FINAL_COMPLETION_RETRY_STUCK',
  'FINAL_DOCUMENT_PUBLICATION_INVALID',
  'FINAL_ARTIFACT_STORAGE_MISMATCH',
  'missingTransactionPublications',
  'missingCompletionReceipts',
  'stuckCompletionRetries',
]) assert.match(watchdog, new RegExp(token))

const verifier = fs.readFileSync('scripts/document-generator-phase-g3-operational-readiness.mjs', 'utf8')
assert.match(verifier, /document-generator-phase-g1-verify\.mjs/)
assert.match(verifier, /document-generator-phase-g2-browser-usability\.mjs/)
assert.match(verifier, /legal-document-phase5-reconcile\.mjs/)
assert.match(verifier, /system_health_snapshots/)
assert.match(verifier, /mutatedData: false/)
assert.doesNotMatch(verifier, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-g3'])
assert.ok(pkg.scripts?.['verify:document-generator:phase-g3'])
console.log('Document generator G3 operational launch gate contract passed.')
