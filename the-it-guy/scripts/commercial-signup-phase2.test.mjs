import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.ok(source.includes(marker), message || `Expected source to include ${marker}`)
}

const signupIntents = await read('../src/constants/signupIntents.js')
for (const marker of [
  "commercialBrokerage: 'commercial_brokerage'",
  "mixedAgency: 'mixed_agency'",
  'Commercial Real Estate Brokerage',
  'Mixed Residential + Commercial Agency',
  "commercialOwner: 'commercial_owner'",
  "commercialBroker: 'commercial_broker'",
  "mixedAgencyOwner: 'mixed_agency_owner'",
  "mixedAgencyOperational: 'mixed_agency_operational'",
  'commercial_owner: {',
  'commercial_broker: {',
  'mixed_agency_owner: {',
  'mixed_agency_operational: {',
  "workspace_type: WORKSPACE_TYPES.agency",
  "onboarding_path: SIGNUP_ONBOARDING_PATHS.commercialOwner",
  "onboarding_path: SIGNUP_ONBOARDING_PATHS.mixedAgencyOwner",
]) {
  includes(signupIntents, marker, `Commercial signup intent contract should include ${marker}`)
}

const authSource = await read('../src/pages/Auth.jsx')
for (const marker of [
  'Commercial Real Estate Brokerage',
  'Mixed Residential + Commercial Agency',
  'Tell us about your commercial brokerage',
  'Tell us about your mixed agency',
  'SIGNUP_BUSINESS_TYPES.commercialBrokerage',
  'SIGNUP_BUSINESS_TYPES.mixedAgency',
]) {
  includes(authSource, marker, `Auth signup UI should include ${marker}`)
}

const setupSource = await read('../src/pages/PostDashboardSetup.jsx')
for (const marker of [
  'getAgencyTypeForSignupIntent',
  'Set up your commercial brokerage',
  'Set up your mixed agency workspace',
  "completedAgencyType === 'commercial' ? '/commercial' : '/dashboard'",
]) {
  includes(setupSource, marker, `Post-dashboard setup should include ${marker}`)
}

const settingsSource = await read('../src/lib/settingsApi.js')
for (const marker of [
  'activateCommercialMembershipForAgencySignup',
  'assertCommercialSignupSchemaInstalled',
  "module_context: 'commercial'",
  "source: 'signup'",
  'Commercial is not installed on this environment',
]) {
  includes(settingsSource, marker, `Commercial signup persistence should include ${marker}`)
}

console.log('commercial signup phase 2 diagnostics passed')
