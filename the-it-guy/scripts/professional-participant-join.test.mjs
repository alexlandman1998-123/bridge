import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

for (const file of ['src/lib/api.js', 'src/lib/api/dashboardTransactionSummaryApi.js']) {
  const source = readFileSync(file, 'utf8')
  const start = source.indexOf('async function fetchDirectParticipantRowsByIdentity(')
  assert.ok(start >= 0, `${file}: participant reader exists`)
  const reader = source.slice(start, source.indexOf('const runWithSchemaFallback', start))
  assert.ok(reader.includes('transaction:transactions!transaction_participants_transaction_id_fkey!inner(organisation_id)'), `${file}: explicit forward FK avoids ambiguous reverse relationship`)
  assert.ok(reader.includes(".eq('transaction.organisation_id', normalizedOrganisationId)"), `${file}: retain organisation boundary`)
  assert.ok(!reader.includes('transaction:transactions!inner('), `${file}: no ambiguous embed`)
}
console.log('PASS: professional participant joins name their FK and retain organisation filtering')
