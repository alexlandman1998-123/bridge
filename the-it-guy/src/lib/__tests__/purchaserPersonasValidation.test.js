import assert from 'node:assert/strict'
import { isBuyerSpouseContactRequired, validateOnboardingSubmission } from '../purchaserPersonas.js'

const buyer = {
  first_name: 'Alex',
  last_name: 'Buyer',
  date_of_birth: '1990-01-01',
  identity_number: '9001015009087',
  nationality: 'South African',
  residency_status: 'resident',
  tax_number: '1234567890',
  email: 'alex.buyer@example.com',
  phone: '0821234567',
  street_address: '1 Main Road',
  suburb: 'Sea Point',
  city: 'Cape Town',
  postal_code: '8005',
  marital_status: 'single',
  number_of_dependants: '0',
  monthly_credit_commitments: '0',
  first_time_buyer: 'yes',
  primary_residence: 'yes',
  investment_purchase: 'no',
}

const formData = {
  purchaser_type: 'individual',
  purchaser_entity_type: 'individual',
  natural_person_purchase_mode: 'individual',
  purchase_finance_type: 'cash',
  purchasers: [buyer],
  // This mirrors the sanitised buyer payload: commercial amounts are absent.
  finance: {
    purchase_price: '',
    cash_amount: '',
    proof_of_funds_available: 'yes',
    source_of_funds: 'Savings',
    cash_funds_confirmed: 'yes',
  },
}

assert.throws(
  () => validateOnboardingSubmission(formData),
  /Purchase Price is required/,
)

assert.doesNotThrow(() =>
  validateOnboardingSubmission(formData, {
    transaction: {
      purchase_price: 2850000,
      finance_type: 'cash',
    },
  }),
)

const transaction = { purchase_price: 2850000, finance_type: 'cash' }
for (const regime of ['out_of_community', 'out_of_community_with_accrual', 'anc']) {
  const spouse = { ...buyer, marital_status: 'married', marital_regime: regime,
    spouse_full_name: 'Pat Buyer', spouse_identity_number: '9001015009087', spouse_is_co_purchaser: 'no' }
  assert.equal(isBuyerSpouseContactRequired(spouse), false)
  assert.doesNotThrow(() => validateOnboardingSubmission({ ...formData, purchasers: [spouse] }, { transaction }))
  assert.throws(() => validateOnboardingSubmission({ ...formData, purchasers: [{ ...spouse, spouse_email: 'invalid' }] }, { transaction }), /Spouse Email/)
  for (const requiredSpouse of [{ ...spouse, marital_regime: 'in_community' }, { ...spouse, spouse_is_co_purchaser: 'yes' }]) {
    assert.equal(isBuyerSpouseContactRequired(requiredSpouse), true)
    assert.throws(() => validateOnboardingSubmission({ ...formData, purchasers: [requiredSpouse] }, { transaction }), /Spouse Email/)
    assert.throws(() => validateOnboardingSubmission({ ...formData, purchasers: [{ ...requiredSpouse, spouse_email: 'pat@example.com' }] }, { transaction }), /Spouse Phone/)
  }
}

const threePurchasers = [30, 30, 40].map((share, index) => ({ ...buyer, first_name: `Buyer ${index + 1}`, ownership_share: share, consent_to_purchase: 'yes' }))
const joint = { ...formData, natural_person_purchase_mode: 'co_purchasing', purchasers: threePurchasers }
assert.doesNotThrow(() => validateOnboardingSubmission(joint, { transaction }))
assert.throws(() => validateOnboardingSubmission({ ...joint, purchasers: threePurchasers.map((person, index) => index === 2 ? { ...person, tax_number: '' } : person) }, { transaction }), /Purchaser 3 Tax Number/)
assert.throws(() => validateOnboardingSubmission({ ...joint, purchasers: threePurchasers.map((person, index) => index === 2 ? { ...person, ownership_share: 20 } : person) }, { transaction }), /Ownership shares must add up/)
assert.doesNotThrow(() => validateOnboardingSubmission({ ...formData, purchasers: [{ ...buyer, number_of_dependants: 0, monthly_credit_commitments: 0 }] }, { transaction }))

console.log('purchaser-personas validation tests passed')
