import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  api: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  newTransactionWizard: await readFile(new URL('../src/components/NewTransactionWizard.jsx', import.meta.url), 'utf8'),
  agentNewDealWizard: await readFile(new URL('../src/components/AgentNewDealWizard.jsx', import.meta.url), 'utf8'),
  schema: await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'),
  patch: await readFile(new URL('../sql/20260628_transaction_financial_terms_phase2.sql', import.meta.url), 'utf8'),
}

const transactionColumns = [
  'reservation_amount_type',
  'reservation_treatment',
  'reservation_payable_to',
  'alteration_charge_treatment',
]

for (const column of transactionColumns) {
  assert(files.api.includes(column), `api.js should persist/read ${column}`)
  assert(files.schema.includes(column), `schema.sql should define ${column}`)
  assert(files.patch.includes(column), `phase SQL patch should add ${column}`)
}

assert(
  files.api.includes('normalizeReservationTreatment') &&
    files.api.includes('normalizeReservationPayableTo') &&
    files.api.includes('normalizeAlterationChargeTreatment'),
  'api.js should normalize transaction financial term choices',
)

for (const field of [
  'reservationAmountType',
  'reservationTreatment',
  'reservationPayableTo',
  'alterationChargeTreatment',
]) {
  assert(files.newTransactionWizard.includes(field), `NewTransactionWizard should manage ${field}`)
  assert(files.agentNewDealWizard.includes(field), `AgentNewDealWizard should carry ${field}`)
}

assert(
  files.newTransactionWizard.includes('Reservation Treatment') &&
    files.newTransactionWizard.includes('Reservation Payable To') &&
    files.newTransactionWizard.includes('Alteration Cost Treatment'),
  'NewTransactionWizard should expose confirmation/override controls',
)

assert(
  files.api.includes('reservationAmountType: transactionPayload.reservation_amount_type') &&
    files.api.includes('alterationChargeTreatment: transactionPayload.alteration_charge_treatment'),
  'createTransactionFromWizard should return copied financial terms',
)

console.log('Transaction financial terms Phase 2 contract passed.')
