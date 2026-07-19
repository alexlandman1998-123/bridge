import assert from 'node:assert/strict'
import { buildMvpTransactionDocumentBootstrap } from '../mvpTransactionDocumentBootstrap.js'
const rows = buildMvpTransactionDocumentBootstrap({ financeType: 'hybrid', buyerEntityType: 'trust', sellerEntityType: 'company', requiresCancellationAttorney: true }).requirements
assert.ok(rows.some((row) => row.key === 'buyer_trust_authority'))
assert.ok(rows.some((row) => row.key === 'seller_company_authority'))
assert.ok(rows.some((row) => row.key === 'proof_of_funds'))
assert.ok(rows.some((row) => row.key === 'bond_preapproval'))
assert.ok(rows.some((row) => row.key === 'bond_cancellation_figures'))
console.log('mvp transaction document bootstrap tests passed')
