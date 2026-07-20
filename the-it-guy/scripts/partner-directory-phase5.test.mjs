import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  app: await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  partnersPage: await readFile(new URL('../src/pages/PartnersPage.jsx', import.meta.url), 'utf8'),
  preferredPartners: await readFile(new URL('../src/lib/preferredPartners.js', import.meta.url), 'utf8'),
  settingsPreferredPartners: await readFile(new URL('../src/pages/settings/SettingsPreferredPartnersPage.jsx', import.meta.url), 'utf8'),
  wizard: await readFile(new URL('../src/components/AgentNewDealWizard.jsx', import.meta.url), 'utf8'),
  schema: await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'),
  cancellationMigration: await readFile(new URL('../../supabase/migrations/202607050006_preferred_partner_cancellation_attorney.sql', import.meta.url), 'utf8'),
}

for (const token of [
  "{ value: 'cancellation_attorney', label: 'Cancellation Attorney' }",
  "return 'cancellation_attorney'",
  'bond_cancellation_attorney',
]) {
  assert(files.preferredPartners.includes(token), `preferredPartners.js should preserve ${token}`)
}

assert(
  files.schema.includes("'cancellation_attorney'") &&
    files.cancellationMigration.includes("'cancellation_attorney'"),
  'schema and migration should allow cancellation attorneys as preferred partners',
)

assert(
  files.settingsPreferredPartners.includes("import { Navigate } from 'react-router-dom'") &&
    files.settingsPreferredPartners.includes('to="/partners"') &&
    !files.settingsPreferredPartners.includes('saveOrganisationPreferredPartner') &&
    !files.settingsPreferredPartners.includes('listOrganisationPreferredPartners'),
  'legacy settings preferred-partners route should redirect to the simplified /partners workspace',
)

assert(
  files.app.includes("path=\"preferred-partners\"") &&
    files.app.includes('<SettingsPreferredPartnersPage />'),
  'legacy /settings/preferred-partners route should remain registered for bookmark compatibility',
)

for (const token of [
  'ThirdPartyDirectoryModal',
  'thirdPartyDirectoryRows',
  'saveOrganisationPreferredPartner',
  'removeOrganisationPreferredPartner',
  "new Set(['transfer_attorney', 'bond_attorney', 'cancellation_attorney'])",
  'Referral Agency',
  'Add partner',
]) {
  assert(files.partnersPage.includes(token), `PartnersPage should preserve the unified partner directory behavior: ${token}`)
}

for (const token of [
  'CANCELLATION_PARTNER_ROLE_FIELD_OPTIONS',
  'FINANCE_TYPE_OPTIONS',
  'Seller has existing bond to cancel',
  'cancellationAttorneyPreferredPartnerId',
  'const cancellationAttorneySelection',
  "roleType: 'cancellation_attorney'",
  "cancellationAttorney: cancellationAttorneyLabel",
  'Existing bond cancellation attorney not assigned yet.',
]) {
  assert(files.wizard.includes(token), `AgentNewDealWizard should preserve cancellation attorney transaction setup: ${token}`)
}

assert(
  files.wizard.includes("partnerType: 'cancellation_attorney'") &&
    files.wizard.includes("const roleTypes = ['transfer_attorney', 'bond_originator', 'bond_attorney', 'cancellation_attorney']"),
  'AgentNewDealWizard fallback partner snapshot should include cancellation attorney options',
)

console.log('Partner directory Phase 5 contract passed.')
