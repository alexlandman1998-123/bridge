import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const serviceSource = readFileSync(resolve(appRoot, 'src/services/developerLeadService.js'), 'utf8')
const pageSource = readFileSync(resolve(appRoot, 'src/pages/DeveloperLeadsPage.jsx'), 'utf8')
const contractSource = readFileSync(resolve(appRoot, 'src/core/developerLeads/developerLeadContract.js'), 'utf8')
const phase5Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase5-release-readiness.test.mjs'), 'utf8')
const phase6Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase6-post-rollout-monitoring.mjs'), 'utf8')

const scripts = packageJson.scripts || {}

assert.equal(
  scripts['test:developer-module-phase12'],
  'node scripts/developer-leads-phase12-agency-fed.test.mjs',
)
assert.match(scripts['verify:developer-module'] || '', /test:developer-module-phase12/)

for (const token of [
  'DEVELOPER_LEAD_PHASE12_CONTRACT',
  'DEVELOPER_LEAD_SOURCE_FILTER_OPTIONS',
  'listDeveloperLeadIntake',
  'listAgencyFedDeveloperLeads',
  'createAgencyIntroducedDeveloperLead',
  'requestAgencyLeadHandover',
  "lead_owner: 'agency'",
  "ownership_model: 'agency_introduced'",
  "selling_model: 'agent_led'",
  "visibility_state: 'limited'",
  "visibility_state: 'consent_pending'",
  "activity_type: 'handover_requested'",
  "visibility_scope: 'shared'",
  'developer_limited_until_handover',
  'All lead sources',
  'Developer-fed',
  'Agency-fed',
]) {
  assert.match(serviceSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

for (const token of [
  'Agency-fed',
  'Agency protected',
  'Details hidden until handover',
  'Request Handover',
  'Handover requested',
  'DEVELOPER_LEAD_PHASE12_CONTRACT',
]) {
  assert.match(pageSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(contractSource, /AGENCY_FED_REDACTED_FIELDS/)
assert.match(contractSource, /requiresHandoverBeforePrivateDetails/)
assert.match(contractSource, /canDeveloperSeePrivateDetails/)
assert.match(contractSource, /visibilityState === 'handed_over'/)

assert.equal(/recordBuyerOnboardingSent|createTransactionFromWizard|send.*onboarding/i.test(serviceSource), false, 'Phase 12 must not send onboarding or convert transactions')
assert.match(phase5Source, /test:developer-module-phase12/)
assert.match(phase6Source, /test:developer-module-phase12/)

console.log(JSON.stringify({
  version: 'developer_leads_phase12_agency_fed_privacy_v1',
  ready: true,
  coveredSurfaces: [
    'agency-fed protected lead shells',
    'developer source filtering',
    'buyer PII redaction before handover',
    'handover request workflow',
    'no onboarding send or transaction conversion',
  ],
}, null, 2))
