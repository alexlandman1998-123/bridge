import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  quickCreate: await readFile(new URL('../src/components/QuickCreateDropdown.jsx', import.meta.url), 'utf8'),
  partnersPage: await readFile(new URL('../src/pages/PartnersPage.jsx', import.meta.url), 'utf8'),
  settingsPreferredPartners: await readFile(new URL('../src/pages/settings/SettingsPreferredPartnersPage.jsx', import.meta.url), 'utf8'),
  wizard: await readFile(new URL('../src/components/AgentNewDealWizard.jsx', import.meta.url), 'utf8'),
}

for (const token of [
  "label: 'Organisation'",
  "type: 'third-party'",
  "label: 'Third Party'",
  "helper: 'Add an attorney, bond originator, or referral agency'",
  "to: '/partners'",
  'openAddThirdParty: true',
  "partnerType: 'transfer_attorney'",
  'data-testid={`quick-create-${item.type}`}',
  'navigate(item.to, state ? { state } : undefined)',
]) {
  assert(files.quickCreate.includes(token), `QuickCreateDropdown should expose the third-party create route contract: ${token}`)
}

assert(
  files.quickCreate.includes("if (role === 'bond_originator') return BOND_ORIGINATOR_QUICK_CREATE_GROUPS"),
  'bond originator quick-create groups should stay isolated from residential third-party shortcuts',
)

for (const token of [
  'const openThirdPartyInvite = useCallback',
  'location.state?.openAddThirdParty',
  "openThirdPartyInvite(location.state?.partnerType || 'transfer_attorney')",
  'navigate(location.pathname, { replace: true, state: null })',
  'const isSimplifiedThirdPartyWorkspace = !isBondPartnersRoute && !isPartnerProfilePage',
  'ThirdPartyDirectoryModal',
]) {
  assert(files.partnersPage.includes(token), `PartnersPage should consume quick-create route state without bypassing the simplified modal: ${token}`)
}

assert(
  files.settingsPreferredPartners.includes('to="/partners"') &&
    !files.settingsPreferredPartners.includes('saveOrganisationPreferredPartner') &&
    !files.settingsPreferredPartners.includes('listOrganisationPreferredPartners'),
  'legacy settings preferred-partners route should keep redirecting to the simplified partners workspace',
)

for (const token of [
  'Seller has existing bond to cancel',
  "partnerType: 'cancellation_attorney'",
  "roleType: 'cancellation_attorney'",
]) {
  assert(files.wizard.includes(token), `transaction onboarding should retain cancellation attorney wiring: ${token}`)
}

console.log('Partner directory Phase 6 contract passed.')
