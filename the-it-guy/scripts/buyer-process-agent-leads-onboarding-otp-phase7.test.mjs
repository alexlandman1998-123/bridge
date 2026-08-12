import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const agentLeadsPageSource = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
const agencyPipelinePageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const packageSource = await readFile(new URL('../package.json', import.meta.url), 'utf8')

assert.match(agentLeadsPageSource, /BUYER_ONBOARDING_OTP_TAB_KEY = 'onboarding_otp'/)
assert.match(agentLeadsPageSource, /function normalizeBuyerLeadWorkspaceTabKey/)
assert.match(agentLeadsPageSource, /'offers'[\s\S]*return BUYER_ONBOARDING_OTP_TAB_KEY/)
assert.match(agentLeadsPageSource, /\{ key: BUYER_ONBOARDING_OTP_TAB_KEY, label: 'Onboarding \/ OTP' \}/)
assert.match(
  agentLeadsPageSource,
  /\{ key: 'overview', label: 'Overview' \},\s*\{ key: 'buyer_profile', label: 'Buyer Profile' \},\s*\{ key: BUYER_ONBOARDING_OTP_TAB_KEY, label: 'Onboarding \/ OTP' \},\s*\{ key: 'property_match', label: 'Properties' \},\s*\{ key: 'appointments', label: 'Appointments' \},\s*\{ key: 'activity', label: 'Activity' \}/,
)
assert.match(agentLeadsPageSource, /activeTab === BUYER_ONBOARDING_OTP_TAB_KEY/)
assert.match(agentLeadsPageSource, /Open Onboarding \/ OTP/)
assert.match(agentLeadsPageSource, /returnTo: `\/pipeline\/leads\/\$\{encodeURIComponent\(normalizeText\(lead\?\.leadId\)\)\}\?tab=onboarding_otp`/)
assert.match(agentLeadsPageSource, /source: 'manual_offer_capture'/)
assert.match(agentLeadsPageSource, /lead_workspace_manual_offer_capture/)
assert.doesNotMatch(agentLeadsPageSource, /lead_workspace_onboarding_otp_tab/)

assert.match(agencyPipelinePageSource, /BUYER_PROFILE_WORKSPACE_TAB_KEY = 'buyer_profile'/)
assert.match(
  agencyPipelinePageSource,
  /\{ key: 'overview', label: 'Overview', meta: '' \},\s*\{ key: BUYER_PROFILE_WORKSPACE_TAB_KEY, label: 'Buyer Profile', meta: '' \},\s*\{ key: BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY, label: 'Onboarding \/ OTP'[\s\S]*?\{ key: 'properties', label: 'Properties'[\s\S]*?\{ key: 'appointments', label: 'Appointments'[\s\S]*?\{ key: 'activity', label: 'Activity'/,
)
assert.match(agencyPipelinePageSource, /resolveBuyerWorkspaceTabKey\(leadWorkspaceTab\) === BUYER_PROFILE_WORKSPACE_TAB_KEY/)

assert.doesNotMatch(agentLeadsPageSource, /\{ key: 'offers', label: 'Offers' \}/)
assert.doesNotMatch(agentLeadsPageSource, /activeTab === 'offers'/)
assert.doesNotMatch(agentLeadsPageSource, /setActiveTab\('offers'\)/)
assert.doesNotMatch(agentLeadsPageSource, /\?tab=offers/)
assert.doesNotMatch(agentLeadsPageSource, /Open Offers/)
assert.doesNotMatch(agentLeadsPageSource, /Offers \/ Transactions/)
assert.doesNotMatch(agentLeadsPageSource, /lead_workspace_offers_tab/)

assert.match(
  packageSource,
  /"test:buyer-process-agent-leads-onboarding-otp-phase7": "node scripts\/buyer-process-agent-leads-onboarding-otp-phase7\.test\.mjs"/,
)

console.log('Buyer process Phase 7 Agent Leads onboarding / OTP workspace contract passed.')
