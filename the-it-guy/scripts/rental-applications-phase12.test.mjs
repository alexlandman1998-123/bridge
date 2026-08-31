import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [applications, leadPage, model] = await Promise.all([
  readFile(new URL('../src/pages/rentals/RentalApplicationsPage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/rentals/RentalLeadsPage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/rentals/rentalApplicationDraftModel.js', import.meta.url), 'utf8'),
])

assert.match(applications, /listRentalLeads/)
assert.match(applications, /tenantLeadId/)
assert.match(applications, /Linked tenant lead/)
assert.match(leadPage, /pipeline\/applications\?leadId=/)
assert.match(model, /tenantLeadId/)

console.log('Rental applications phase 12 integration checks passed.')
