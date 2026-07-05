import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  quickCreate: await readFile(new URL('../src/components/QuickCreateDropdown.jsx', import.meta.url), 'utf8'),
  partnersPage: await readFile(new URL('../src/pages/PartnersPage.jsx', import.meta.url), 'utf8'),
  partnersRepository: await readFile(new URL('../src/lib/partnersRepository.js', import.meta.url), 'utf8'),
  settingsPreferredPartners: await readFile(new URL('../src/pages/settings/SettingsPreferredPartnersPage.jsx', import.meta.url), 'utf8'),
  wizard: await readFile(new URL('../src/components/AgentNewDealWizard.jsx', import.meta.url), 'utf8'),
  partnerInvitationManagementMigration: await readFile(new URL('../../supabase/migrations/202607050007_partner_invitation_sender_management.sql', import.meta.url), 'utf8'),
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
  'resolvePartnersActiveTab(tabQuery, isBondPartnersRoute)',
  'new URLSearchParams(location.search).get(\'tab\')',
  'const isSimplifiedThirdPartyWorkspace = !isBondPartnersRoute && !isPartnerProfilePage',
  'ThirdPartyDirectoryModal',
  'getThirdPartyInviteWorkspaceType',
  'thirdPartyForm.sendInvite !== false',
  'source: \'third_party_directory\'',
  'Third party added and invite sent.',
  'Send invite',
  'handleResendInvitation',
  'handleRevokeInvitation',
  'handleDeleteInvitation',
  'resendPartnerInvitation',
  'revokePartnerInvitation',
  'deletePartnerInvitation',
  'Partner invitation revoked.',
  'Partner invitation deleted.',
]) {
  assert(files.partnersPage.includes(token), `PartnersPage should consume quick-create route state without bypassing the simplified modal: ${token}`)
}

for (const token of [
  'export async function resendPartnerInvitation',
  'export async function revokePartnerInvitation',
  'export async function deletePartnerInvitation',
  'recipientContactEmail',
  'status: \'revoked\'',
]) {
  assert(files.partnersRepository.includes(token), `partnersRepository should expose sent invite management behavior: ${token}`)
}

for (const token of [
  'partner_invitations_delete_sender_admin',
  'for delete',
  "coalesce(status, 'pending') <> 'accepted'",
  'grant delete on public.partner_invitations to authenticated',
]) {
  assert(files.partnerInvitationManagementMigration.includes(token), `partner invitation management migration should preserve: ${token}`)
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
