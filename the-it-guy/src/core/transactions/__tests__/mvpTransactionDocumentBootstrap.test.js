import assert from 'node:assert/strict'
import { buildMvpTransactionDocumentBootstrap } from '../mvpTransactionDocumentBootstrap.js'
const rows = buildMvpTransactionDocumentBootstrap({ financeType: 'hybrid', buyerEntityType: 'trust', sellerEntityType: 'company', requiresCancellationAttorney: true }).requirements
assert.ok(rows.some((row) => row.key === 'buyer_trust_authority'))
assert.ok(rows.some((row) => row.key === 'seller_company_authority'))
assert.ok(rows.some((row) => row.key === 'proof_of_funds'))
const bondPreapproval = rows.find((row) => row.key === 'bond_preapproval')
assert.ok(bondPreapproval)
assert.equal(bondPreapproval.documentType, 'bond_preapproval')
const bondGrant = rows.find((row) => row.key === 'bond_grant')
assert.ok(bondGrant)
assert.equal(bondGrant.groupKey, 'finance')
assert.equal(bondGrant.requiredFromRole, 'bond_originator')
assert.equal(bondGrant.collectionGroupKey, 'buyer')
assert.ok(rows.some((row) => row.key === 'bond_cancellation_figures'))

const cashRows = buildMvpTransactionDocumentBootstrap({ financeType: 'cash' }).requirements
assert.ok(cashRows.some((row) => row.key === 'proof_of_funds'))
assert.equal(cashRows.some((row) => row.key === 'bond_grant'), false)
console.log('mvp transaction document bootstrap tests passed')
