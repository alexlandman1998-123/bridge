import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getAgencyCrmUpdateDetail } from '../src/lib/agencyCrmUpdateBus.js'

assert.deepEqual(
  getAgencyCrmUpdateDetail({ detail: { organisationId: ' org-1 ', leadId: ' lead-1 ', mutation: 'created', occurredAt: 'now' } }),
  { organisationId: 'org-1', leadId: 'lead-1', mutation: 'created', occurredAt: 'now' },
)

const crmRepository = await readFile(new URL('../src/lib/agencyCrmRepository.js', import.meta.url), 'utf8')
const listRepository = await readFile(new URL('../src/pages/agency/agencyLeadListReadRepository.js', import.meta.url), 'utf8')
const listingService = await readFile(new URL('../src/services/listings/listingBuyerActionsService.js', import.meta.url), 'utf8')

assert.match(listingService, /createAgencyCrmLeadRecord/)
assert.match(listingService, /upsertLeadListingInterest/)
assert.match(crmRepository, /emitAgencyCrmUpdated\(\{ organisationId: workspaceId, leadId: createdLead\.leadId, mutation: 'created' \}\)/)
assert.match(listRepository, /window\.addEventListener\(AGENCY_CRM_UPDATED_EVENT/)
assert.match(listRepository, /key\.startsWith\(`\$\{workspaceId\}:`\)/)
assert.match(listRepository, /primaryRecordsCache\.clear\(\)/)
assert.match(listRepository, /leadCoreRequestCache\.delete\(`\$\{workspaceId\}:\$\{resolvedLeadId\}`\)/)

console.log('Listing Leads Phase 2 cross-screen synchronization contract passed')
