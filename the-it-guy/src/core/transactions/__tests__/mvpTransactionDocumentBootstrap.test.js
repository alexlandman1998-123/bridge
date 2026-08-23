import assert from 'node:assert/strict'
import { buildMvpTransactionDocumentBootstrap } from '../mvpTransactionDocumentBootstrap.js'
const rows = buildMvpTransactionDocumentBootstrap({ financeType: 'hybrid', buyerEntityType: 'trust', sellerEntityType: 'company', requiresCancellationAttorney: true }).requirements
assert.ok(rows.some((row) => row.key === 'buyer_trust_authority'))
assert.ok(rows.some((row) => row.key === 'seller_company_authority'))
assert.ok(rows.some((row) => row.key === 'seller_director_fica'))
assert.ok(rows.some((row) => row.key === 'proof_of_funds'))
assert.ok(rows.some((row) => row.key === 'bond_preapproval'))
assert.ok(rows.some((row) => row.key === 'bond_cancellation_figures'))
assert.ok(rows.every((row) => row.requiresUpload === true))
const developerRows = buildMvpTransactionDocumentBootstrap({ transactionType: 'developer_sale' }).requirements
assert.equal(developerRows.find((row) => row.key === 'seller_identity')?.requiredFromRole, 'developer')
assert.equal(developerRows.find((row) => row.key === 'seller_identity')?.label, 'Developer entity / representative authority')
assert.equal(developerRows.find((row) => row.key === 'seller_identity')?.groupLabel, 'Developer Documents')
assert.equal(developerRows.find((row) => row.key === 'seller_identity')?.sellerPartyType, 'developer')
assert.equal(developerRows.find((row) => row.key === 'property_title_deed')?.requiredFromRole, 'developer')
assert.equal(developerRows.find((row) => row.key === 'property_title_deed')?.groupKey, 'seller_development_pack')
assert.equal(developerRows.some((row) => row.key === 'seller_spouse_consent'), false)
const developerCompanyRows = buildMvpTransactionDocumentBootstrap({ transactionType: 'developer_sale', sellerEntityType: 'company' }).requirements
assert.equal(developerCompanyRows.find((row) => row.key === 'seller_company_authority')?.label, 'Developer company authority')
assert.equal(developerCompanyRows.find((row) => row.key === 'seller_company_authority')?.requiredFromRole, 'developer')
assert.equal(developerCompanyRows.find((row) => row.key === 'seller_director_fica')?.label, 'Developer director FICA')
console.log('mvp transaction document bootstrap tests passed')
