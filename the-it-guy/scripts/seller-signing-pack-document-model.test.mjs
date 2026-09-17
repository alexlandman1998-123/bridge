import assert from 'node:assert/strict'
import { buildSellerSigningDocumentModel } from '../src/lib/sellerSigningPackDocumentModel.js'

const disclosure = buildSellerSigningDocumentModel({
  disclosure: { responses: { electrical_faults: { answer: 'yes', note: 'Socket issue' } } },
}, 'disclosure')
assert.equal(disclosure.questions.length, 20)
assert.equal(disclosure.questions[0].answer, 'Yes')
assert.equal(disclosure.questions[0].note, 'Socket issue')

const mandate = buildSellerSigningDocumentModel({
  seller: { name: 'Alex' },
  mandate: { propertyAddress: '1 Main Street', commissionPercentage: '7', mandateType: 'sole' },
}, 'mandate')
assert.match(mandate.introduction, /authorise/)
assert.match(mandate.sections[0].rows.map((item) => item.label).join('|'), /Commission/)

const fica = buildSellerSigningDocumentModel({
  seller: { name: 'Alex', legalType: 'individual', idNumber: '9001015000000', residentialAddress: '1 Main Street' },
  property: { address: '1 Main Street', bondStatus: 'none' },
  signers: [{ name: 'Alex', role: 'Seller', email: 'alex@example.com' }],
}, 'fica')
assert.match(fica.sections[0].rows.map((item) => item.label).join('|'), /Authorised signer 1/)

console.log('seller signing pack document model checks passed')
