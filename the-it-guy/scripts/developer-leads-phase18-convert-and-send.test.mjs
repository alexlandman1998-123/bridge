import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const conversionSource = readFileSync(resolve(appRoot, 'src/services/developerLeadConversionService.js'), 'utf8')
const pageSource = readFileSync(resolve(appRoot, 'src/pages/DeveloperLeadsPage.jsx'), 'utf8')
const appSource = readFileSync(resolve(appRoot, 'src/App.jsx'), 'utf8')
const handoffSource = readFileSync(resolve(appRoot, 'src/core/developerLeads/developerLeadTransactionHandoff.js'), 'utf8')
const intakeSource = readFileSync(resolve(appRoot, 'src/services/developerLeadService.js'), 'utf8')
const docsSource = readFileSync(resolve(appRoot, 'docs/developer-leads-phase18-convert-and-send.md'), 'utf8')
const phase5Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase5-release-readiness.test.mjs'), 'utf8')
const phase6Source = readFileSync(resolve(appRoot, 'scripts/developer-module-phase6-post-rollout-monitoring.mjs'), 'utf8')

const scripts = packageJson.scripts || {}

assert.equal(
  scripts['test:developer-module-phase18'],
  'node scripts/developer-leads-phase18-convert-and-send.test.mjs',
)
assert.match(scripts['verify:developer-module'] || '', /test:developer-module-phase18/)

for (const token of [
  'DEVELOPER_LEAD_PHASE18_CONTRACT',
  'convertDeveloperLeadToTransactionAndSendOnboarding',
  'buildDeveloperLeadTransactionHandoff',
  'createTransactionFromWizard',
  'getOrCreateTransactionOnboarding',
  'recordBuyerOnboardingSent',
  "invokeEdgeFunction('send-email'",
  "type: 'client_onboarding'",
  'manualBuyerOnboardingDelivery',
  "lead_status: buyerOnboardingDelivered ? 'onboarding_sent' : 'qualified'",
  'allowEarlyLeadStatus: manualDelivery && !sendBuyerOnboarding',
  'converted_transaction_id',
  'buyer_onboarding_sent',
  'developer_lead_activity',
  'developer_lead_phase18',
]) {
  assert.match(conversionSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(conversionSource, /if \(!handoff\.eligible\)/)
assert.match(conversionSource, /agency-fed|handover|eligible|blockers/i)
assert.doesNotMatch(conversionSource, /security\s+definer/i)
assert.doesNotMatch(conversionSource, /service_role|sb_secret_/i)

for (const token of [
  'DEVELOPER_LEAD_PHASE18_CONTRACT',
  'convertDeveloperLeadToTransactionAndSendOnboarding',
  'fetchUnitsForTransactionSetup',
  'preferredUnitId',
  'Send Onboarding',
  'Copy Link',
  'Copy Buyer Onboarding Link',
  'manualBuyerOnboardingDelivery: true',
  'Buyer onboarding link copied. You can paste it into WhatsApp.',
  'convertedOnboardingUrl',
  'Buyer onboarding link',
  'Buyer Lead Workspace',
  'data-developer-lead-workspace="true"',
  'onOpenLead={handleOpenLead}',
  'Send Buyer Onboarding',
  'buyerOnboardingSendEnabled: true',
  'data-contract={DEVELOPER_LEAD_PHASE18_CONTRACT}',
]) {
  assert.match(pageSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(appSource, /path="\/developer\/leads\/:developerLeadId"/)
assert.match(pageSource, /navigate\(`\/developer\/leads\/\$\{leadId\}`\)/)
assert.match(pageSource, /navigate\(`\/transactions\/\$\{normalizedTransactionId\}`\)/)
assert.match(pageSource, /event\.stopPropagation\(\)/)

assert.match(handoffSource, /preferredUnitId/)
assert.match(handoffSource, /unit_missing/)
assert.match(intakeSource, /preferred_unit_id: normalizeUuid\(input\.preferredUnitId\)/)
assert.equal(
  /createTransactionFromWizard|recordBuyerOnboardingSent|invokeEdgeFunction\('send-email'/.test(intakeSource),
  false,
  'Developer lead intake service must stay non-converting; Phase 18 conversion belongs in developerLeadConversionService',
)

assert.match(docsSource, /Developer Leads Phase 18 Buyer Onboarding Send/)
assert.match(docsSource, /existing transaction creation engine/)
assert.match(docsSource, /onboarding_sent/)
assert.match(docsSource, /Uploading the signed OTP/)
assert.match(docsSource, /send-email/)
assert.match(docsSource, /does not add\s+privileged database functions or bypass RLS/)
assert.match(phase5Source, /test:developer-module-phase18/)
assert.match(phase6Source, /test:developer-module-phase18/)

console.log(JSON.stringify({
  version: 'developer_leads_phase18_convert_and_send_v1',
  ready: true,
  coveredSurfaces: [
    'guarded lead conversion action',
    'developer sale transaction creation',
    'buyer onboarding token generation',
    'buyer onboarding email trigger',
    'lead conversion backlink',
    'preferred unit capture',
  ],
}, null, 2))
