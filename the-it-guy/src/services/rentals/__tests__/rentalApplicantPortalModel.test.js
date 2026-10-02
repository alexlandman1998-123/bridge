import assert from 'node:assert/strict'
import { isRentalApplicantPortalReadyToSubmit } from '../rentalApplicantPortalModel.js'

const ready = { data: { identity: { firstName: 'Sam', lastName: 'Tenant', email: 'sam@example.test' }, employment: { employer: 'Arch9', employmentType: 'employed' }, income: { monthlyIncome: '20000' }, rentalHistory: { currentAddress: 'Cape Town', reasonForMoving: 'Work' } }, documents: [{ document_type: 'identity', status: 'uploaded' }, { document_type: 'proof_of_income', status: 'accepted' }], consents: { privacy: true, credit_check: true, identity_verification: true } }
assert.equal(isRentalApplicantPortalReadyToSubmit(ready), true)
assert.equal(isRentalApplicantPortalReadyToSubmit({ ...ready, consents: { ...ready.consents, privacy: false } }), false)
assert.equal(isRentalApplicantPortalReadyToSubmit({ ...ready, documents: [] }), false)
assert.equal(isRentalApplicantPortalReadyToSubmit({ ...ready, data: { ...ready.data, identity: { firstName: '' } } }), false)
console.log('rentalApplicantPortalModel.test.js passed')
