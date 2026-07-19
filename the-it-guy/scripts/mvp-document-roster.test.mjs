import assert from 'node:assert/strict'
import { buildMvpTransactionDocumentBootstrap } from '../src/core/transactions/mvpTransactionDocumentBootstrap.js'
import { buildMvpDocumentRoster } from '../src/core/transactions/mvpDocumentRoster.js'

const bootstrap = buildMvpTransactionDocumentBootstrap({ financeType: 'hybrid', buyerEntityType: 'trust', sellerEntityType: 'company' })
const pendingRoster = buildMvpDocumentRoster({
  requiredDocuments: bootstrap.requirements.map((item) => ({
    document_key: item.key,
    document_label: item.label,
    required_from_role: item.requiredFromRole,
    group_key: item.groupKey,
    description: item.description,
    is_required: item.required,
    enabled: true,
    status: 'pending',
  })),
})
assert.ok(pendingRoster.requirements.some((item) => item.documentKey === 'proof_of_funds'))
assert.ok(pendingRoster.requirements.some((item) => item.documentKey === 'bond_preapproval'))
assert.equal(pendingRoster.summary.outstanding, bootstrap.requirements.length)

const resolvedRoster = buildMvpDocumentRoster({
  requiredDocuments: [{ document_key: 'proof_of_funds', document_label: 'Proof of funds', required_from_role: 'buyer', is_required: true, enabled: true, status: 'pending' }],
  documentRequests: [{ id: 'request-1', document_type: 'proof_of_funds', title: 'Proof of funds', requested_from: 'buyer', status: 'verified' }],
})
assert.equal(resolvedRoster.requirements[0].status, 'verified')
assert.equal(resolvedRoster.requirements[0].complete, true)
assert.equal(resolvedRoster.summary.outstanding, 0)

const rejectedRoster = buildMvpDocumentRoster({
  requiredDocuments: [{ document_key: 'buyer_identity', document_label: 'Buyer identity', is_required: true, enabled: true, status: 'rejected' }],
})
assert.equal(rejectedRoster.blockers[0].documentKey, 'buyer_identity')
assert.match(rejectedRoster.blockers[0].reason, /rejected/i)
console.log('mvp-document-roster: passed')
