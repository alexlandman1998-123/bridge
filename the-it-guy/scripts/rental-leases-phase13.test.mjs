import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [applications, tenancies, service, model] = await Promise.all([
  readFile(new URL('../src/pages/rentals/RentalApplicationsPage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/rentals/RentalTenanciesPage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/rentals/rentalLeaseWorkflowService.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/rentals/rentalLeaseWorkflowModel.js', import.meta.url), 'utf8'),
])

assert.match(applications, /tenancies\?applicationRef=/)
assert.match(tenancies, /LeaseWorkflowUpdatePanel/)
assert.match(tenancies, /updateRentalLeaseWorkflow/)
assert.match(service, /rental_lease_workflow_updated/)
assert.match(model, /RENTAL_LEASE_UPDATE_VERSION/)

console.log('Rental leases phase 13 integration checks passed.')
