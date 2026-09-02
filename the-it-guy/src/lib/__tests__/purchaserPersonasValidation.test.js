import assert from 'node:assert/strict'
import { validateOnboardingSubmission } from '../purchaserPersonas.js'

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

console.log('purchaser-personas validation tests passed')
