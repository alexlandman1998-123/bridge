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
  'setCommercialOrganisationModuleEnabled(true)',
  'export async function activateCommercialWorkspaceForCurrentUser',
  "module_context: 'commercial'",
  "module: 'commercial'",
  "source: 'commercial_access_setup_prompt'",
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
  'isCommercialPlatformInstallError',
  'Commercial needs platform setup',
  'platform administrator needs to install the Commercial database setup',
  'Set up Commercial workspace',
  'organisation_module_ready_to_activate',
  'Commercial is selected in organisation settings',
  'Activate Commercial',
  'activateCommercialWorkspaceForCurrentUser',
  'Back to Residential',
]) {
  includes(commercialLayout, marker, `Commercial no-access state should be actionable without weakening the gate: ${marker}`)
}

const settingsApi = await read('../src/lib/settingsApi.js')
for (const marker of [
  'syncCommercialAccess',
  'buildAgencyOnboardingSettings',
  "commercial: hasCommercialModule",
  "commercial_activation_source: 'settings_update'",
  "source: 'manual'",
  'activateCommercialOrganisationModuleForAgencySignup',
  'activateCommercialMembershipForAgencySignup',
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
