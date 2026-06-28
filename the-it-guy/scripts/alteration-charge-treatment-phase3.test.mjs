import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  api: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  panel: await readFile(new URL('../src/components/AlterationRequestsPanel.jsx', import.meta.url), 'utf8'),
  unitDetail: await readFile(new URL('../src/pages/UnitDetail.jsx', import.meta.url), 'utf8'),
  schema: await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'),
  patch: await readFile(new URL('../sql/20260628_alteration_charge_treatment_phase3.sql', import.meta.url), 'utf8'),
}

assert(files.schema.includes('charge_treatment text not null default'), 'schema should define alteration charge_treatment')
assert(files.patch.includes('add column if not exists charge_treatment'), 'phase SQL patch should add charge_treatment')

assert(
  files.api.includes('charge_treatment: normalizeAlterationChargeTreatment') &&
    files.api.includes('isMissingColumnError(createResult.error, \'charge_treatment\')'),
  'api should persist charge_treatment with a missing-column fallback',
)

assert(
  files.api.includes('amount_inc_vat, charge_treatment, invoice_path') &&
    files.api.includes('select(\'id, alteration_charge_treatment\')'),
  'api should read alteration charge_treatment and prefer transaction defaults for portal submissions',
)

assert(
  files.panel.includes('Cost Treatment') &&
    files.panel.includes('Include in purchase price') &&
    files.panel.includes('Separate invoices') &&
    files.panel.includes('Cost treatment:'),
  'AlterationRequestsPanel should capture and display cost treatment',
)

assert(
  files.unitDetail.includes('defaultChargeTreatment') &&
    files.unitDetail.includes('transaction?.alteration_charge_treatment') &&
    files.unitDetail.includes('payload.chargeTreatment'),
  'UnitDetail should default alteration creation from transaction charge treatment',
)

console.log('Alteration charge treatment Phase 3 contract passed.')
