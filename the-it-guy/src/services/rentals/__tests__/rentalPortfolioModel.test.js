import assert from 'node:assert/strict'
import { buildRentalPortfolioListQuery, createRentalPortfolioAssignmentPayload, createRentalPortfolioPayload, mapRentalPortfolio, validateRentalPortfolio } from '../rentalPortfolioModel.js'

const portfolio = createRentalPortfolioPayload({ organisationId: 'org-1', branchId: 'branch-1', assignedManagerId: 'manager-1', createdBy: 'user-1', name: 'Atlantic Coast', description: 'Premium coastal homes' })
assert.equal(portfolio.status, 'active')
assert.equal(portfolio.name, 'Atlantic Coast')
assert.equal(validateRentalPortfolio({ organisationId: 'org-1' }).valid, false)
assert.deepEqual(createRentalPortfolioAssignmentPayload({ portfolioId: 'portfolio-1', propertyId: 'property-1', organisationId: 'org-1' }), { portfolio_id: 'portfolio-1', property_id: 'property-1', organisation_id: 'org-1', assigned_by: null })
assert.equal(mapRentalPortfolio({ id: 'portfolio-1', ...portfolio, property_count: '2', unit_count: '5' }).unitCount, 5)
assert.deepEqual(buildRentalPortfolioListQuery({ organisationId: 'org-1', limit: 999 }), { organisationId: 'org-1', branchId: '', status: '', search: '', limit: 100 })
console.log('Rental portfolio model tests passed.')
