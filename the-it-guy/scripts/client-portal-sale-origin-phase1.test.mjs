import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const api = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')

function functionBody(source, name) {
  const start = source.indexOf(`export async function ${name}(`)
  assert.notEqual(start, -1, `${name} should exist`)
  const nextExport = source.indexOf('\nexport async function ', start + 1)
  return source.slice(start, nextExport === -1 ? source.length : nextExport)
}

const requiredOriginFields = [
  'transaction_type',
  'sale_route',
  'sale_channel',
  'seller_party_type',
  'lead_owner',
  'ownership_model',
  'source_agency_org_id',
]

for (const functionName of ['fetchClientPortalByToken', 'fetchClientPortalCoreByToken']) {
  const body = functionBody(api, functionName)
  const primarySelect = body.match(/\.select\(\s*'([^']+)'/)?.[1] || ''

  for (const field of requiredOriginFields) {
    assert.match(
      primarySelect,
      new RegExp(`(?:^|, )${field}(?:,|$)`),
      `${functionName} primary transaction select should include ${field}`,
    )
    assert.match(
      body,
      new RegExp(`isMissingColumnError\\(transactionQuery\\.error, '${field}'\\)`),
      `${functionName} should safely fall back if ${field} is missing`,
    )
  }
}

console.log('client portal sale origin Phase 1 checks passed')
