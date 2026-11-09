import { readDomainDeclarationSource } from './helpers/domainApiSource.mjs'
import assert from 'node:assert/strict'

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
  const body = readDomainDeclarationSource(functionName)
  const primarySelect = [...body.matchAll(/\.select\(\s*((?:'[^']*'\s*\+?\s*)+)/g)][0]?.[1].replace(/'\s*\+\s*'/g, '').replace(/^'|'$/g, '') || ''

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
