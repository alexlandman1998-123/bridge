import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agentLeadsPageShimSource = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
const agencyPipelinePageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const packageSource = await readFile(new URL('../package.json', import.meta.url), 'utf8')

assert.match(agentLeadsPageShimSource, /import AgencyPipelinePage from '\.\/agency\/AgencyPipelinePage'/)
assert.match(agentLeadsPageShimSource, /<AgencyPipelinePage initialViewMode="leads" \/>/)

assert.match(agencyPipelinePageSource, /BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY = 'onboarding_otp'/)
assert.match(agencyPipelinePageSource, /function normalizeLeadWorkspaceTabKey/)
assert.match(agencyPipelinePageSource, /'offers'[\s\S]*return BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY/)
assert.match(
  agencyPipelinePageSource,
  /\{ key: 'overview', label: 'Overview', meta: '' \},\s*\{ key: BUYER_PROFILE_WORKSPACE_TAB_KEY, label: 'Buyer Profile', meta: '' \},\s*\{ key: BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY, label: 'Onboarding \/ OTP'[\s\S]*?\{ key: 'properties', label: 'Properties'[\s\S]*?\{ key: 'appointments', label: 'Appointments'[\s\S]*?\{ key: 'activity', label: 'Activity'/,
)
assert.match(agencyPipelinePageSource, /BUYER_PROFILE_WORKSPACE_TAB_KEY = 'buyer_profile'/)
assert.match(agencyPipelinePageSource, /resolveBuyerWorkspaceTabKey\(leadWorkspaceTab\) === BUYER_PROFILE_WORKSPACE_TAB_KEY/)
assert.match(agencyPipelinePageSource, /resolveBuyerWorkspaceTabKey\(leadWorkspaceTab\) === BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY/)
assert.match(agencyPipelinePageSource, /Open Onboarding \/ OTP/)

assert.doesNotMatch(agencyPipelinePageSource, /\{ key: 'offers', label: 'Offers' \}/)
assert.doesNotMatch(agencyPipelinePageSource, /activeTab === 'offers'/)
assert.doesNotMatch(agencyPipelinePageSource, /setActiveTab\('offers'\)/)
assert.doesNotMatch(agencyPipelinePageSource, /\?tab=offers/)
assert.doesNotMatch(agencyPipelinePageSource, /Open Offers/)
assert.doesNotMatch(agencyPipelinePageSource, /Offers \/ Transactions/)
assert.doesNotMatch(agencyPipelinePageSource, /lead_workspace_offers_tab/)

assert.match(
  packageSource,
  /"test:buyer-process-agent-leads-onboarding-otp-phase7": "node scripts\/buyer-process-agent-leads-onboarding-otp-phase7\.test\.mjs"/,
)

console.log('Buyer process Phase 7 Agent Leads onboarding / OTP workspace contract passed.')
