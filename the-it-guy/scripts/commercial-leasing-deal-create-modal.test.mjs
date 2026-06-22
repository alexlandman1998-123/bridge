import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const source = readFileSync(new URL('../src/modules/commercial/components/CommercialLeasingDealCreateModal.jsx', import.meta.url), 'utf8')

assert.match(source, /max-w-\[880px\]/, 'leasing deal modal should use the refined 880px max width')
assert.match(source, /Create Leasing Deal/, 'modal should use leasing-specific title and primary action')
assert.match(source, /Link the tenant, landlord, property and broker details for this lease opportunity\./, 'modal should use the leasing-specific subtitle')

assert.doesNotMatch(source, /DEAL_TYPE_OPTIONS/, 'deal type selector options should be removed from the leasing modal')
assert.doesNotMatch(source, /<Field label="Deal Type"/, 'deal type field should not render in the leasing modal')
assert.match(source, /deal_type:\s*'lease'/, 'leasing modal should force deal_type to lease in the submit payload')

for (const label of ['Deal Overview', 'Parties', 'Property & Vacancy', 'Assignment', 'Commercials']) {
  assert.match(source, new RegExp(label), `section "${label}" should be present`)
}

for (const stage of ['Lead', 'Qualification', 'Viewing', 'Heads of Terms', 'Negotiation', 'Lease Drafting', 'Signed', 'Completed', 'Lost']) {
  assert.match(source, new RegExp(`label:\\s*'${stage}'`), `stage "${stage}" should be available`)
}

assert.match(source, /label="Linked Vacancy"/, 'leasing modal should label the stock field as Linked Vacancy')
assert.doesNotMatch(source, /Linked Vacancy \/ Listing|Linked Listing|Unnamed listing/, 'leasing modal should not expose listing terminology in the UI')
assert.match(source, /Use custom address/, 'modal should provide a custom address toggle')
assert.match(source, /No property linked yet\. Search for a property or use a custom address\./, 'modal should show the no-property helper')
assert.match(source, /No tenant linked\. Select an existing tenant or create one from the tenant workspace\./, 'modal should show the tenant workspace helper')
assert.match(source, /placeholder="R 2 500 000"/, 'deal value should use rand currency formatting in the placeholder')

console.log('commercial leasing deal create modal contract passed')
