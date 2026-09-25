import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const crmRepository = await readFile(new URL('../src/lib/agencyCrmRepository.js', import.meta.url), 'utf8')
const listingDetail = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const leadsTabStart = listingDetail.indexOf("sellerWorkspaceTab === 'leads'")
const leadsTabEnd = listingDetail.indexOf("sellerWorkspaceTab === 'marketing'", leadsTabStart)
const leadsTab = listingDetail.slice(leadsTabStart, leadsTabEnd > leadsTabStart ? leadsTabEnd : undefined)

assert.match(crmRepository, /emitAgencyCrmUpdated\(\{ organisationId: normalizedOrganisationId, leadId: dbLeadId, mutation: 'updated' \}\)/)
assert.match(crmRepository, /emitAgencyCrmUpdated\(\{ organisationId: normalizedOrganisationId, mutation: 'contact_updated' \}\)/)
assert.match(leadsTab, /aria-label="Search listing leads"/)
assert.match(leadsTab, /aria-expanded=\{listingLeadFiltersOpen\}/)
assert.match(leadsTab, /aria-controls="listing-lead-filters"/)
assert.match(leadsTab, /id="listing-lead-filters"/)
assert.match(leadsTab, /<caption className="sr-only">Leads linked to this property<\/caption>/)
assert.match(leadsTab, /aria-label="Previous leads page"/)
assert.match(leadsTab, /aria-label="Next leads page"/)
assert.match(leadsTab, /aria-current="page"/)
assert.match(leadsTab, /role="alert"/)
assert.match(leadsTab, /role="status" aria-live="polite"/)
assert.match(leadsTab, /View offer history/)

console.log('Listing Leads Phase 5 production-readiness contract passed')
