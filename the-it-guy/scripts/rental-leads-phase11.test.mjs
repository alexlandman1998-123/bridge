import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = await Promise.all([
  readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/modules/rentals/shell/rentalRouteLoaders.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/rentals/RentalLeadsPage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/rentals/rentalLeadService.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/rentals/rentalCrmLeadModel.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/rentals/rentalLeadAccessModel.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
])

const [app, loaders, page, service, model, accessModel, salesPage] = files
assert.match(loaders, /RentalLeadsPage/)
assert.match(app, /path="\/agent\/rentals\/pipeline\/leads"/)
assert.match(app, /<RentalLeadsPage\s*\/>/)
assert.match(page, /Landlord Leads/)
assert.match(page, /Tenant Leads/)
assert.match(service, /createRentalCrmLeadMetadata/)
assert.match(model, /arch9RentalLead: true/)
assert.match(accessModel, /includeAllOrganisationLeads/)
assert.match(salesPage, /effectiveSnapshot\.leads\.filter\(\(lead\) => !isRentalCrmLead\(lead\)\)/)
assert.match(salesPage, /if \(isRentalCrmLead\(lead\)\) return false/)

console.log('Rental leads phase 11 integration checks passed.')
