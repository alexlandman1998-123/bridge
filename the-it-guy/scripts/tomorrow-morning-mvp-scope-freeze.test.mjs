import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const contract = JSON.parse(readFileSync(new URL('../../docs/tomorrow-morning-mvp-scope-freeze.json', import.meta.url), 'utf8'))
const runbook = readFileSync(new URL('../../docs/tomorrow-morning-mvp-scope-freeze.md', import.meta.url), 'utf8')

const REQUIRED_PATH = [
  'manual_lead_capture',
  'lead_outreach_logging',
  'seller_onboarding_link',
  'buyer_onboarding_link',
  'mandate_generation',
  'mandate_signing_link',
  'accepted_offer_to_transaction',
  'otp_generation',
  'otp_signing_link',
  'roleplayer_workspace_access',
]

const REQUIRED_DEFERRED = [
  'multi_organisation_rollout',
  'attorney_accounting_depth',
  'attorney_calendar_depth',
  'bond_workflow_depth',
  'commercial_pipeline_scope',
  'settings_cosmetic_work',
  'dependency_audit_remediation',
  'broad_migration_freeze_retirement',
  'non_blocking_governance_recertification',
]

assert.equal(contract.version, 'arch9_tomorrow_morning_mvp_scope_freeze_v1')
assert.equal(contract.status, 'FROZEN')
assert.equal(contract.targetOperationalDate, '2026-07-21')

for (const step of REQUIRED_PATH) {
  assert.ok(contract.launchPath.includes(step), `launch path must include ${step}`)
}

for (const deferred of REQUIRED_DEFERRED) {
  assert.ok(contract.explicitlyDeferred.includes(deferred), `scope freeze must defer ${deferred}`)
}

for (const capability of [
  'Create or import a seller or buyer lead in the agency CRM.',
  'Send or copy a seller onboarding link after selecting a transfer attorney.',
  'Generate a Mandate from the completed seller facts.',
  'Generate an OTP from saved transaction, offer, and onboarding context.',
  'Verify agent, principal, seller, buyer, attorney, and invited partner access to their relevant workspace or portal.',
]) {
  assert.ok(contract.mustHaveCapabilities.includes(capability), `must-have capability missing: ${capability}`)
  assert.match(runbook, new RegExp(capability.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(runbook, /Lead capture -> outreach -> onboarding links -> Mandate -> OTP -> signing links -> shared roleplayer workspace/)
assert.match(runbook, /Default decision: \*\*defer\*\*/)
assert.match(runbook, /Manual lead creation is acceptable/)
assert.match(runbook, /Manual copy of onboarding and signing links is acceptable/)
assert.match(contract.changeControl.rule, /No capability may enter tomorrow morning's launch path/)
assert.equal(contract.changeControl.defaultDecision, 'defer')

console.log('tomorrow-morning-mvp-scope-freeze checks passed')
