import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_FIELD_DATA_LOCK_STATUS_READY,
  OTP_FIELD_DATA_LOCK_VERSION,
  buildOtpFieldDataLockAudit,
  buildOtpFieldDataLockRoute,
  collectOtpFieldDataLockUsage,
  formatOtpFieldDataLockMarkdown,
} from '../src/core/documents/otpFieldDataLock.js'
import {
  OTP_FIELD_POLICIES,
  getOtpFieldDefinition,
} from '../src/core/documents/otpFieldRegistry.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-field-data-lock-phase4'],
  'node scripts/otp-field-data-lock-phase4.test.mjs',
  'package.json should expose the OTP vNext Phase 4 field/data lock contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-field-data-lock-phase4'),
  'OTP vNext verification should include the Phase 4 field/data lock before legacy downstream checks.',
)

assert.equal(OTP_FIELD_DATA_LOCK_VERSION, 'otp_field_data_lock_phase4_v1')
assert.equal(OTP_FIELD_DATA_LOCK_STATUS_READY, 'OTP_FIELD_DATA_LOCK_READY_FOR_TEMPLATE_PERSISTENCE')

const audit = buildOtpFieldDataLockAudit({ generatedAt: '2026-08-03T00:00:00.000Z' })
assert.equal(audit.status, OTP_FIELD_DATA_LOCK_STATUS_READY)
assert.equal(audit.mutatedData, false)
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.dependencies.fieldRegistryStatus, 'OTP_FIELD_REGISTRY_READY_FOR_CONTENT_RULES')
assert.equal(audit.dependencies.legalWordingStatus, 'OTP_LEGAL_WORDING_DRAFT_READY_FOR_COUNSEL_REVIEW')
assert.equal(audit.dependencies.templateShellStatus, 'OTP_TEMPLATE_SHELL_TARGET_READY_FOR_PERSISTENCE')
assert.deepEqual(audit.blockers, [])

for (const routeLock of audit.routeLocks) {
  assert.equal(routeLock.status, OTP_FIELD_DATA_LOCK_STATUS_READY)
  assert.ok(routeLock.tokenCount > 0, `${routeLock.routeKey} should lock at least one token.`)
  assert.ok(routeLock.sectionUsageCount >= routeLock.tokenCount, `${routeLock.routeKey} should expose token usage rows.`)
  assert.equal(routeLock.registryValidation.isValid, true)
  assert.deepEqual(routeLock.registryValidation.unknown, [])
  assert.deepEqual(routeLock.registryValidation.deprecated, [])
  assert.deepEqual(routeLock.unknownTokens, [])
  assert.deepEqual(routeLock.sourceOwnerMismatches, [])
  assert.deepEqual(routeLock.sourcePathGaps, [])
  assert.deepEqual(routeLock.policyGaps, [])
  assert.deepEqual(routeLock.routeForbiddenTokens, [])
  assert.deepEqual(routeLock.ownerGaps, [])
  assert.deepEqual(routeLock.requiredOwnerGaps, [])
}

const resaleLock = buildOtpFieldDataLockRoute({ routeKey: 'resale_existing_property' })
const resaleTokens = new Set(resaleLock.tokens)
for (const token of ['seller_full_name', 'mandatory_disclosure_annexure', 'property_address', 'seller_signature']) {
  assert.equal(resaleTokens.has(token), true, `resale OTP should lock ${token}.`)
}
for (const token of ['developer_name', 'development_name', 'developer_signature', 'vat_inclusive_purchase_price']) {
  assert.equal(resaleTokens.has(token), false, `resale OTP must not lock ${token}.`)
}

const developmentLock = buildOtpFieldDataLockRoute({ routeKey: 'new_development' })
const developmentTokens = new Set(developmentLock.tokens)
for (const token of ['developer_name', 'development_name', 'vat_inclusive_purchase_price', 'developer_signature']) {
  assert.equal(developmentTokens.has(token), true, `new-development OTP should lock ${token}.`)
}
for (const token of ['seller_full_name', 'mandatory_disclosure_annexure', 'seller_signature']) {
  assert.equal(developmentTokens.has(token), false, `new-development OTP must not lock ${token}.`)
}

const ownerExpectations = new Map([
  ['seller_full_name', 'seller_onboarding'],
  ['developer_name', 'development_setup'],
  ['development_name', 'development_setup'],
  ['property_unit_number', 'development_unit_setup'],
  ['transfer_attorney_company_name', 'conveyancer_transfer_assignment'],
  ['organisation_logo_url', 'organisation_agent_settings'],
  ['template_version', 'legal_template_registry'],
  ['buyer_signature', 'signing_runtime'],
])
for (const [token, expectedOwner] of ownerExpectations.entries()) {
  assert.equal(getOtpFieldDefinition(token)?.owner, expectedOwner, `${token} should be owned by ${expectedOwner}.`)
}

for (const token of [...resaleLock.tokens, ...developmentLock.tokens]) {
  const definition = getOtpFieldDefinition(token)
  assert.ok(definition, `${token} should have a field definition.`)
  assert.ok(Object.values(OTP_FIELD_POLICIES).includes(definition.policy), `${token} should have a known policy.`)
  assert.ok(definition.sourcePaths.length > 0, `${token} should have at least one source path.`)
}

const resaleUsage = collectOtpFieldDataLockUsage({ routeKey: 'resale_existing_property' })
assert.equal(
  resaleUsage.some((usage) => usage.source === 'template_shell' && usage.token === 'organisation_logo_url'),
  true,
  'field/data lock should include shell placeholder usage.',
)
assert.equal(
  resaleUsage.some((usage) => usage.source === 'legal_wording_draft' && usage.token === 'mandatory_disclosure_annexure'),
  true,
  'field/data lock should include legal wording placeholder usage.',
)

const markdown = formatOtpFieldDataLockMarkdown(audit)
assert.ok(markdown.includes('# OTP Template vNext Phase 4 Field and Data Lock'))
assert.ok(markdown.includes('OTP_FIELD_DATA_LOCK_READY_FOR_TEMPLATE_PERSISTENCE'))
assert.ok(markdown.includes('resale_existing_property'))
assert.ok(markdown.includes('new_development'))
assert.ok(markdown.includes('Field registry'))
assert.ok(markdown.includes('Legal wording draft'))

console.log('OTP vNext Phase 4 field/data lock contract passed.')
