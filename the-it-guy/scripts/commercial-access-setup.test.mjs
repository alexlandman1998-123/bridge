import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.ok(source.includes(marker), message || `Expected source to include ${marker}`)
}

function excludes(source, marker, message) {
  assert.ok(!source.includes(marker), message || `Expected source not to include ${marker}`)
}

const commercialApi = await read('../src/modules/commercial/services/commercialApi.js')
for (const marker of [
  'export async function getCommercialPlatformInstallStatus',
  'COMMERCIAL_PLATFORM_INSTALL_ERROR_MESSAGE',
  'Commercial is not installed on this environment. Contact platform support.',
  'REQUIRED_COMMERCIAL_CORE_PLATFORM_PROBES',
  'REQUIRED_COMMERCIAL_ACCESS_WORKFLOW_PROBES',
  'await assertCommercialPlatformInstalled({ forceRefresh })',
  'assertCommercialAccessWorkflowInstalled',
  'isCommercialEnabledInOrganisationSettings',
  'organisationSettingsCommercialEnabled',
  'canReviewCommercialAccess',
  'eligibleForCommercialSelfActivation',
  'hasCommercialWorkspacePlannedAccess',
  'syncCommercialWorkspaceTeamAccessEntries',
  'mergeCommercialWorkspaceBranchDrafts',
  'export async function enableCommercialWorkspaceForCurrentUser',
  "source: 'commercial_workspace_enablement'",
  'teamAccess',
  'selectedOrganisationUserIds',
  'nextOrganisationBranchDrafts',
  'setCommercialOrganisationModuleEnabled(true, {',
  'export async function activateCommercialWorkspaceForCurrentUser',
  'COMMERCIAL_ACCESS_REVIEWER_ROLES.has(context.membershipRole)',
  "module_context: 'commercial'",
  "module: 'commercial'",
  "source: 'commercial_access_setup_prompt'",
  'pickPreferredOrganisationMembership',
  'isActiveMembershipStatus(row?.status)',
  'return resolveCommercialAccessContext({ forceRefresh: true })',
]) {
  includes(commercialApi, marker, `Commercial activation should persist and refresh the explicit commercial membership marker: ${marker}`)
}

excludes(
  commercialApi,
  "const REQUIRED_COMMERCIAL_PLATFORM_PROBES = [",
  'Core Commercial platform checks should not require optional access-request workflow setup before opening an enabled workspace.',
)
excludes(
  commercialApi,
  "role: 'commercial_hq_admin'",
  'Commercial activation must not silently rewrite the existing organisation role.',
)
excludes(
  commercialApi,
  "workspace_role: 'commercial_hq_admin'",
  'Commercial activation must not silently rewrite the existing workspace role.',
)

const commercialLayout = await read('../src/modules/commercial/components/CommercialLayout.jsx')
for (const marker of [
  'CommercialEnablementExperience',
  'onAccessGranted',
  'scope: scope || null',
]) {
  includes(commercialLayout, marker, `Commercial layout should hand no-access journeys to the new enablement experience: ${marker}`)
}

const enablementExperience = await read('../src/modules/commercial/components/CommercialEnablementExperience.jsx')
for (const marker of [
  'Commercial Workspace',
  'Enable Commercial',
  'How does your commercial business operate?',
  'Who should have access to Commercial?',
  'Invite Commercial User',
  'How would you like to structure Commercial?',
  'Select Commercial Features',
  'Enable Commercial Workspace',
  'Commercial Workspace Ready',
  'Go To Commercial',
  'Commercial Listings',
  'Commercial Leasing',
  'Heads of Terms',
  'Commercial Pipeline',
  'Commercial Reporting',
  'Brokerage Management',
]) {
  includes(enablementExperience, marker, `Commercial enablement experience should expose the new self-service flow: ${marker}`)
}

excludes(
  enablementExperience,
  'Commercial needs platform setup',
  'The new Commercial entry experience should not expose the old platform setup blocker.',
)
excludes(
  enablementExperience,
  'platform administrator needs to install the Commercial database setup',
  'The new Commercial entry experience should not instruct users to ask platform admins to install Commercial.',
)

const settingsApi = await read('../src/lib/settingsApi.js')
for (const marker of [
  'syncCommercialAccess',
  'buildAgencyOnboardingSettings',
  "commercial: hasCommercialModule",
  "commercial_activation_source: 'settings_update'",
  "source: 'manual'",
  'activateCommercialOrganisationModuleForAgencySignup',
  'activateCommercialMembershipForAgencySignup',
  'const workspaceResolution = await resolveCurrentWorkspace(user.id, {',
  "workspaceResolution.currentMembership?.source === 'organisation_users'",
]) {
  includes(settingsApi, marker, `Organisation settings save should synchronize mixed/commercial access setup: ${marker}`)
}

const settingsOrganisationPage = await read('../src/pages/settings/SettingsOrganisationPage.jsx')
includes(
  settingsOrganisationPage,
  '}, { syncCommercialAccess: true })',
  'Organisation settings form should request Commercial entitlement sync when saving agency type changes.',
)

console.log('commercial access setup diagnostics passed')
