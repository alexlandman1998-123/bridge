import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const files = {
  api: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  portal: await readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8'),
}

assert(
  files.api.includes('reservation_amount_type, reservation_treatment, reservation_payable_to') &&
    files.api.includes('alteration_charge_treatment, onboarding_status'),
  'client portal transaction fetch should include reservation and alteration financial terms',
)

assert(
  files.api.includes("isMissingColumnError(transactionQuery.error, 'reservation_treatment')") &&
    files.api.includes("isMissingColumnError(transactionQuery.error, 'alteration_charge_treatment')"),
  'client portal transaction fetch should fall back when financial term columns are missing',
)

assert(
  files.portal.includes('getReservationTreatmentLabel') &&
    files.portal.includes('getReservationPayableToLabel') &&
    files.portal.includes('getAlterationChargeTreatmentLabel'),
  'client portal should define buyer-facing financial term labels',
)

assert(
  files.portal.includes('Treatment: {reservationTreatmentLabel}') &&
    files.portal.includes('Payable to: {reservationPayableToLabel}') &&
    files.portal.includes('reservationTreatmentDescription'),
  'reservation cards should explain how the reservation deposit is treated',
)

assert(
  files.portal.includes('Default cost treatment') &&
    files.portal.includes('Included in purchase price') &&
    files.portal.includes('Separate invoices') &&
    files.portal.includes('Cost treatment: {getAlterationChargeTreatmentLabel(itemChargeTreatment)}'),
  'alteration portal should surface default and per-request charge treatment',
)

console.log('Developer financial client portal Phase 4 contract passed.')
