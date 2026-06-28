import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const files = {
  api: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  developmentDetail: await readFile(new URL('../src/pages/DevelopmentDetail.jsx', import.meta.url), 'utf8'),
}

assert(
  files.api.includes(".from('alteration_requests')") &&
    files.api.includes('amount_inc_vat, charge_treatment') &&
    files.api.includes('alterations,'),
  'fetchDevelopmentDetail should return development alteration rows with charge treatment',
)

assert(
  files.api.includes("isMissingColumnError(alterationsQuery.error, 'charge_treatment')") &&
    files.api.includes("isMissingTableError(alterationsQuery.error, 'alteration_requests')"),
  'development alteration fetch should tolerate older schemas and missing tables',
)

assert(
  files.developmentDetail.includes('const alterations = useMemo(() => data?.alterations || []') &&
    files.developmentDetail.includes('const developerFinancialRollup = useMemo') &&
    files.developmentDetail.includes('reservation.byTreatment.credited_to_purchase_price') &&
    files.developmentDetail.includes('alteration.byTreatment.separate_invoice'),
  'DevelopmentDetail should calculate reservation and alteration financial roll-ups',
)

assert(
  files.developmentDetail.includes('Developer Transaction Financial Roll-up') &&
    files.developmentDetail.includes('Reservation exposure') &&
    files.developmentDetail.includes('Outstanding Controls') &&
    files.developmentDetail.includes('Operator Actions'),
  'commercial dashboard should surface the development-level financial roll-up',
)

assert(
  files.developmentDetail.includes('Deduct ${currency.format(reservation.byTreatment.credited_to_purchase_price)} reservation deposits') &&
    files.developmentDetail.includes('Track separate alteration invoices totalling') &&
    files.developmentDetail.includes('Confirm ${currency.format(alteration.byTreatment.included_in_purchase_price)} alterations'),
  'roll-up should give practical operator actions for reservation credits and alteration costing',
)

console.log('Developer financial development roll-up Phase 6 contract passed.')
