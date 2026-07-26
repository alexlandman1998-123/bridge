import assert from 'node:assert/strict'
import fs from 'node:fs'

const helper = fs.readFileSync('src/core/documents/finalCompletionTruth.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const operationalStatus = fs.readFileSync('src/core/documents/signingOperationalStatus.js', 'utf8')
const certificate = fs.readFileSync('src/core/documents/signingCompletionCertificate.js', 'utf8')
const audit = fs.readFileSync('docs/audits/document-generator-final-mile-phase-4.md', 'utf8')

assert.match(helper, /export function normalizeFinalCompletionState/)
assert.match(helper, /explicitDeliveryReady === false\s*\?\s*false/)
assert.match(helper, /deliveryCountsComplete/)
assert.match(helper, /stage === 'completed_everywhere' && !deliveryReady/)
assert.match(helper, /'awaiting_recipient_delivery'/)

assert.match(workspace, /import \{ normalizeFinalCompletionState \}/)
assert.match(workspace, /const safeFinalCompletionState = useMemo/)
assert.match(workspace, /finalCompletion: safeFinalCompletionState/)
assert.match(workspace, /safeFinalCompletionState\.ready \? 'Completed everywhere' : 'Signed PDF safe/)
assert.doesNotMatch(workspace, /finalCompletionState\.ready \? 'Completed everywhere'/)

assert.match(operationalStatus, /normalizeFinalCompletionState\(finalCompletion\)/)
assert.match(certificate, /normalizeFinalCompletionState\(finalCompletion\)/)

for (const reference of [
  'Make the workspace UI truthful',
  'downgraded to `awaiting_recipient_delivery`',
  '`Signed PDF safe — completion pending`',
  'must not show `Completed everywhere`',
]) {
  assert.ok(audit.includes(reference), `Phase 4 audit should keep: ${reference}`)
}

console.log('document-generator final-mile Phase 4 UI truth passed.')
