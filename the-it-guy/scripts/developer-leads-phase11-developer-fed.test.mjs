import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const appSource = readFileSync(resolve(appRoot, 'src/App.jsx'), 'utf8')
const rolesSource = readFileSync(resolve(appRoot, 'src/lib/roles.js'), 'utf8')
const sidebarSource = readFileSync(resolve(appRoot, 'src/components/Sidebar.jsx'), 'utf8')
const serviceSource = readFileSync(resolve(appRoot, 'src/services/developerLeadService.js'), 'utf8')
const pageSource = readFileSync(resolve(appRoot, 'src/pages/DeveloperLeadsPage.jsx'), 'utf8')
const phase5Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase5-release-readiness.test.mjs'), 'utf8')
const phase6Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase6-post-rollout-monitoring.mjs'), 'utf8')

const scripts = packageJson.scripts || {}

assert.equal(
  scripts['test:developer-module-phase11'],
  'node scripts/developer-leads-phase11-developer-fed.test.mjs',
)
assert.match(scripts['verify:developer-module'] || '', /test:developer-module-phase11/)

assert.match(appSource, /const DeveloperLeadsPage = lazy\(\(\) => import\('\.\/pages\/DeveloperLeadsPage'\)\)/)
assert.match(appSource, /path="\/developer\/leads"/)
assert.match(appSource, /scope="developer-leads-workspace"/)
assert.match(rolesSource, /key: 'developer_leads'/)
assert.match(rolesSource, /to: '\/developer\/leads'/)
assert.match(sidebarSource, /developer_leads: Users/)

for (const token of [
  'DEVELOPER_LEAD_PHASE11_CONTRACT',
  'listDeveloperFedLeads',
  'createDeveloperFedLead',
  'findDeveloperLeadDuplicateWarnings',
  'developer_leads',
  'developer_lead_private_details',
  'developer_lead_development_interests',
  'developer_lead_activity',
  "lead_owner', 'developer'",
  "ownership_model: assignedAgentId ? 'developer_assigned' : 'developer_direct'",
  "selling_model: assignedAgentId ? 'agent_led' : 'developer_led'",
  "visibility_state: 'full'",
]) {
  assert.match(serviceSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

const developerCreateStart = serviceSource.indexOf('export async function createDeveloperFedLead')
const developerCreateEnd = serviceSource.indexOf('export async function updateDeveloperFedLead')
const developerCreateSource = serviceSource.slice(developerCreateStart, developerCreateEnd)
assert.equal(/lead_owner['"]?\s*:\s*['"]agency/i.test(developerCreateSource), false, 'Phase 11 developer-fed create path must not create agency-fed leads')
assert.equal(/visibility_state['"]?\s*:\s*['"]limited/i.test(developerCreateSource), false, 'Phase 11 developer-fed create path must not create protected agency cards')
assert.equal(/send.*onboarding|recordBuyerOnboardingSent|createTransactionFromWizard/i.test(serviceSource), false, 'Phase 11 must not send onboarding or convert transactions')

for (const token of [
  'Create Developer-Fed Lead',
  'Primary development',
  'Other development interests',
  'Assigned agent',
  'Possible duplicate lead',
  'Developer direct',
  'Agent-led',
  'Developer-led',
  'data-contract={DEVELOPER_LEAD_PHASE11_CONTRACT}',
]) {
  assert.match(pageSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(phase5Source, /test:developer-module-phase11/)
assert.match(phase6Source, /test:developer-module-phase11/)

console.log(JSON.stringify({
  version: 'developer_leads_phase11_developer_fed_v1',
  ready: true,
  coveredSurfaces: [
    'developer leads route',
    'developer sidebar navigation',
    'developer-fed lead create flow',
    'agent assignment',
    'single and multi-development interest',
    'duplicate contact warning',
    'agency-fed privacy boundary preserved',
  ],
}, null, 2))
