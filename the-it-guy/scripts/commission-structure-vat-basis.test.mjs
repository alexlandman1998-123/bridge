import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  commissionPage: await readFile(new URL('../src/pages/settings/SettingsCommissionStructuresPage.jsx', import.meta.url), 'utf8'),
  settingsApi: await readFile(new URL('../src/lib/settingsApi.js', import.meta.url), 'utf8'),
  commissionService: await readFile(new URL('../src/services/commissionService.js', import.meta.url), 'utf8'),
  migration: await readFile(new URL('../../supabase/migrations/202608120002_commission_structure_vat_basis.sql', import.meta.url), 'utf8'),
}

for (const token of [
  'function VatBasisSwitch',
  'role="switch"',
  'Inc VAT',
  'Ex VAT',
  'commissionVatBasis',
  "onChange={(nextBasis) => updateDraft('commissionVatBasis', nextBasis)}",
]) {
  assert.ok(files.commissionPage.includes(token), `commission page should expose the VAT basis toggle: ${token}`)
}

for (const token of [
  'normalizeCommissionVatBasis',
  'commission_vat_basis',
  'commissionVatBasis: row.commission_vat_basis',
  "isMissingColumnError(baseQuery.error, 'commission_vat_basis')",
  "isMissingColumnError(saveResult.error, 'commission_vat_basis')",
]) {
  assert.ok(files.settingsApi.includes(token), `settings API should persist the VAT basis: ${token}`)
}

for (const token of [
  'listingCommissionVatBasis',
  'listingCommissionVatBasisLabel',
  'formatCommissionVatBasis',
  'vatBasisLabel',
]) {
  assert.ok(files.commissionService.includes(token), `commission service should expose the VAT basis summary: ${token}`)
}

for (const token of [
  'add column if not exists commission_vat_basis text not null default',
  'organisation_commission_structures_vat_basis_check',
  "check (commission_vat_basis in ('inclusive', 'exclusive'))",
  'commission_vat_basis,',
  "'commission_vat_basis', v_vat_basis",
  'trg_legacy_commission_structure_canonical_sync',
]) {
  assert.ok(files.migration.includes(token), `migration should add and sync the VAT basis: ${token}`)
}

console.log('commission structure VAT basis contract passed.')
