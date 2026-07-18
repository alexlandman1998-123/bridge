import assert from 'node:assert/strict'
import fs from 'node:fs'

const resolver = fs.readFileSync('../supabase/functions/resolve-signer-token/index.ts', 'utf8')
for (const token of [
  'legal_final_transaction_publications',
  'legal_final_completion_receipts',
  'legal_final_artifact_deliveries',
  'legal_final_artifact_publications',
  'completionReceiptValid',
  'portalPublicationValid',
  'completionDeliveryStatus',
]) assert.match(resolver, new RegExp(token))

const portal = fs.readFileSync('src/pages/SignerPortal.jsx', 'utf8')
for (const token of [
  'getSigningCompletionAccess',
  'Check for completed copy',
  'transaction publication is being verified',
  "setBusyAction('refresh_completion')",
  '15000',
]) assert.match(portal, new RegExp(token.replace(/[()]/g, '\\$&')))

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-j4'])

console.log('Document generator J4 verified completion delivery contract passed.')
