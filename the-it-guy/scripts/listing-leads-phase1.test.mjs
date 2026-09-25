import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sharedDialog = await readFile(new URL('../src/components/leads/LeadCreateDialog.jsx', import.meta.url), 'utf8')
const leadList = await readFile(new URL('../src/pages/agency/AgencyLeadListRoutePage.jsx', import.meta.url), 'utf8')
const listingDetail = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const listingActions = await readFile(new URL('../src/components/listings/ListingBuyerActionModals.jsx', import.meta.url), 'utf8')

for (const field of ['First name', 'Last name', 'Mobile', 'Email', 'Lead source', 'Property or area of interest', 'Notes']) {
  assert.match(sharedDialog, new RegExp(field), `Shared lead dialog should include ${field}.`)
}
assert.match(sharedDialog, /lockProperty/)
assert.match(sharedDialog, /AgentAssignmentSelect/)

assert.match(leadList, /import LeadCreateDialog from '\.\.\/\.\.\/components\/leads\/LeadCreateDialog'/)
assert.match(leadList, /<LeadCreateDialog/)
assert.doesNotMatch(leadList, /function LeadCreateDialog/)

assert.match(listingDetail, /import LeadCreateDialog from '\.\.\/components\/leads\/LeadCreateDialog'/)
assert.match(listingDetail, /sourceField="leadSource"/)
assert.match(listingDetail, /lockProperty/)
assert.match(listingDetail, /showAgentAssignment=\{false\}/)
assert.doesNotMatch(listingActions, /ListingBuyerLeadModal/)

const leadsStart = listingDetail.indexOf("{sellerWorkspaceTab === 'leads'")
const sellerStart = listingDetail.indexOf("{sellerWorkspaceTab === 'seller'")
const leadsTab = listingDetail.slice(leadsStart, sellerStart)
assert.match(leadsTab, /onClick=\{openBuyerLeadModal\}/)
assert.doesNotMatch(leadsTab, /openShowDayCaptureModal/)
assert.doesNotMatch(leadsTab, /Capture Show Day Lead/)

console.log('Listing Leads Phase 1 shared buyer-lead form contract passed')
