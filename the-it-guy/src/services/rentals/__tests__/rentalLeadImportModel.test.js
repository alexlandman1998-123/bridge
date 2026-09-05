import assert from 'node:assert/strict'
import { createRentalLeadImportTemplateCsv, buildRentalLeadImportPreview, mapRentalLeadImportRow } from '../rentalLeadImportModel.js'

assert.match(createRentalLeadImportTemplateCsv(), /^Role,First Name,Last Name,Email/)

const landlord = mapRentalLeadImportRow({ 'First Name': 'Lebo', Phone: '082 555 1234', 'Property Address': '1 Main Road', 'Expected Monthly Rent': '22000' }, { organisationId: 'org-1' })
assert.equal(landlord.role, 'landlord')
assert.equal(landlord.expectedMonthlyRent, 22000)

const preview = buildRentalLeadImportPreview([
  { __rowNumber: 2, Role: 'Tenant', 'First Name': 'Sam', Email: 'sam@example.com', 'Desired Area': 'Sea Point' },
  { __rowNumber: 3, Role: 'Tenant', 'First Name': 'Sam Two', Email: 'sam@example.com', 'Desired Area': 'Sea Point' },
  { __rowNumber: 4, Role: 'Landlord', 'First Name': 'Pat', Phone: '0820000000' },
], { organisationId: 'org-1', existingLeads: [{ email: 'existing@example.com' }] })

assert.equal(preview.summary.ready, 1)
assert.equal(preview.summary.possibleDuplicates, 1)
assert.equal(preview.summary.invalid, 1)
assert.equal(preview.rows[1].duplicateReason, 'Duplicates another row in this file.')

console.log('Rental lead import model tests passed.')
