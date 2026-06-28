import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  api: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  addDevelopmentModal: await readFile(new URL('../src/components/AddDevelopmentModal.jsx', import.meta.url), 'utf8'),
  developmentDetail: await readFile(new URL('../src/pages/DevelopmentDetail.jsx', import.meta.url), 'utf8'),
  schema: await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'),
  patch: await readFile(new URL('../sql/20260628_development_financial_defaults_phase1.sql', import.meta.url), 'utf8'),
}

const requiredColumns = [
  'reservation_deposit_amount_type',
  'reservation_deposit_treatment',
  'reservation_deposit_payable_to',
  'default_alteration_charge_treatment',
]

for (const column of requiredColumns) {
  assert(files.api.includes(column), `api.js should read and persist ${column}`)
  assert(files.schema.includes(column), `schema.sql should include ${column}`)
  assert(files.patch.includes(column), `phase SQL patch should include ${column}`)
}

assert(
  files.api.includes("reservation_deposit_treatment: 'credited_to_purchase_price'"),
  'reservation deposit treatment should default to credited_to_purchase_price',
)
assert(
  files.api.includes("default_alteration_charge_treatment: 'included_in_purchase_price'"),
  'alteration charge treatment should default to included_in_purchase_price',
)

assert(
  files.addDevelopmentModal.includes('Transaction Defaults') &&
    files.addDevelopmentModal.includes('Reservation deposit applies') &&
    files.addDevelopmentModal.includes('Deduct from purchase price') &&
    files.addDevelopmentModal.includes('Include in purchase price'),
  'AddDevelopmentModal should ask the practical transaction default questions',
)

for (const stateKey of [
  'reservationDepositAmountType',
  'reservationDepositTreatment',
  'reservationDepositPayableTo',
  'defaultAlterationChargeTreatment',
]) {
  assert(files.addDevelopmentModal.includes(stateKey), `AddDevelopmentModal should manage ${stateKey}`)
}

assert(
  files.developmentDetail.includes('Deposit Amount Type') &&
    files.developmentDetail.includes('Deposit Treatment') &&
    files.developmentDetail.includes('Payable To') &&
    files.developmentDetail.includes('Alteration Cost Treatment'),
  'DevelopmentDetail should expose editable financial defaults',
)

console.log('Development financial defaults Phase 1 contract passed.')
