import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const unitDetail = await readFile(new URL('../src/pages/UnitDetail.jsx', import.meta.url), 'utf8')

assert(
  unitDetail.includes('function normalizeReservationTreatment') &&
    unitDetail.includes('function normalizeAlterationChargeTreatment') &&
    unitDetail.includes('getReservationPayableToLabel') &&
    unitDetail.includes('getAlterationChargeTreatmentLabel'),
  'UnitDetail should define operator-facing reservation and alteration term helpers',
)

assert(
  unitDetail.includes('alterationIncludedPurchasePriceAmount') &&
    unitDetail.includes('alterationSeparateInvoiceAmount') &&
    unitDetail.includes('reservationCreditedAmount') &&
    unitDetail.includes('developerNetAfterReservationCredit'),
  'UnitDetail should calculate credited deposits, included alteration totals, separate invoices, and net impact',
)

assert(
  unitDetail.includes('title="Developer Financial Terms"') &&
    unitDetail.includes('Reservation Terms') &&
    unitDetail.includes('Operator Actions') &&
    unitDetail.includes('Default alteration treatment'),
  'UnitDetail finance workspace should surface the developer financial terms panel',
)

assert(
  unitDetail.includes('Confirm ${currency.format(alterationIncludedPurchasePriceAmount)} of alterations') &&
    unitDetail.includes('Raise or track separate alteration invoices') &&
    unitDetail.includes('Credit ${currency.format(reservationCreditedAmount)} against the purchase price'),
  'UnitDetail should give practical operator actions for included alterations, separate invoices, and reservation credits',
)

assert(
  unitDetail.includes('{developerFinancialTermsPanel}') &&
    unitDetail.includes('{financeCommandCenterPanel}'),
  'financials workspace should render the new terms panel with the existing finance command center',
)

console.log('Developer financial operations Phase 5 contract passed.')
