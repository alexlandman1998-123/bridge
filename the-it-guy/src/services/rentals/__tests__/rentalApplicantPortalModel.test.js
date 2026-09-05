import assert from 'node:assert/strict'
import { isRentalApplicantPortalReadyToSubmit } from '../rentalApplicantPortalModel.js'

const ready = { data: { identity: { firstName: 'Sam' }, employment: { employer: 'Arch9' }, income: { monthlyIncome: '20000' }, rentalHistory: { currentAddress: 'Cape Town' } }, documents: [{ document_type: 'identity', status: 'uploaded' }, { document_type: 'proof_of_income', status: 'accepted' }], consents: { privacy: true, credit_check: true, identity_verification: true } }
assert.equal(isRentalApplicantPortalReadyToSubmit(ready), true)
assert.equal(isRentalApplicantPortalReadyToSubmit({ ...ready, consents: { ...ready.consents, privacy: false } }), false)
assert.equal(isRentalApplicantPortalReadyToSubmit({ ...ready, documents: [] }), false)
console.log('rentalApplicantPortalModel.test.js passed')
