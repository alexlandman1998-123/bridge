import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_SIGNATURE_FIELD_LAYOUT_CONTRACT,
  OTP_SIGNATURE_INITIALS_VERSION,
  buildOtpSignatureInitialsAudit,
  buildOtpSignatureInitialsManifest,
  formatOtpSignatureInitialsAuditMarkdown,
  listOtpSignatureRoles,
} from '../src/core/documents/otpSignatureInitials.js'
import {
  buildOtpBrandedShellManifest,
} from '../src/core/documents/otpTemplateBrandedShell.js'
import {
  getOtpFieldDefinition,
} from '../src/core/documents/otpFieldRegistry.js'
import {
  validateTemplateTokensAgainstRegistry,
} from '../src/core/documents/mergeFieldRegistry.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-signature-initials-phase8'],
  'node scripts/otp-signature-initials-phase8.test.mjs',
  'package.json should expose the OTP signatures and initials Phase 8 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-signature-initials'],
  'node scripts/report-otp-signature-initials.mjs',
  'package.json should expose the OTP signatures and initials report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-signature-initials-phase8'),
  'OTP vNext verification should include Phase 8 signatures and initials checks.',
)

assert.equal(OTP_SIGNATURE_INITIALS_VERSION, 'otp_signature_initials_phase8_v1')
assert.equal(OTP_SIGNATURE_FIELD_LAYOUT_CONTRACT, 'otp_signature_initials_field_layout_phase8_v1')

assert.deepEqual(
  new Set(listOtpSignatureRoles().map((role) => role.role)),
  new Set(['purchaser_1', 'seller', 'developer_authorised_signatory', 'contractor_authorised_signatory', 'agent']),
)
assert.deepEqual(
  listOtpSignatureRoles({ variant: 'resale_existing_property' }).map((role) => role.role),
  ['purchaser_1', 'seller'],
)
assert.deepEqual(
  listOtpSignatureRoles({ variant: 'new_development' }).map((role) => role.role),
  ['purchaser_1', 'developer_authorised_signatory', 'contractor_authorised_signatory', 'agent'],
)

const resaleManifest = buildOtpSignatureInitialsManifest({ variant: 'resale_existing_property' })
const developmentManifest = buildOtpSignatureInitialsManifest({ variant: 'new_development' })
assert.equal(resaleManifest.layoutContract, OTP_SIGNATURE_FIELD_LAYOUT_CONTRACT)
assert.equal(developmentManifest.layoutContract, OTP_SIGNATURE_FIELD_LAYOUT_CONTRACT)
assert.equal(resaleManifest.fields.length, 6)
assert.equal(developmentManifest.fields.length, 12)
assert.equal(resaleManifest.initialsRepeatPolicy, 'every_page')
assert.equal(developmentManifest.dateFieldPolicy, 'per_signer_signature_date')

for (const token of ['buyer_signature', 'buyer_initials', 'seller_signature', 'seller_initials', 'signed_date']) {
  assert.ok(resaleManifest.placeholderKeys.includes(token), `resale signing plan should include ${token}.`)
  assert.equal(getOtpFieldDefinition(token)?.owner, 'signing_runtime')
}
for (const token of ['developer_signature', 'developer_initials', 'contractor_signature', 'contractor_initials', 'agent_signature', 'agent_initials']) {
  assert.ok(developmentManifest.placeholderKeys.includes(token), `development signing plan should include ${token}.`)
  assert.equal(getOtpFieldDefinition(token)?.owner, 'signing_runtime')
}

assert.equal(developmentManifest.placeholderKeys.includes('seller_signature'), false)
assert.equal(developmentManifest.placeholderKeys.includes('seller_initials'), false)
assert.equal(resaleManifest.placeholderKeys.includes('developer_signature'), false)
assert.equal(resaleManifest.placeholderKeys.includes('contractor_signature'), false)
assert.equal(resaleManifest.placeholderKeys.includes('agent_signature'), false)

for (const manifest of [resaleManifest, developmentManifest]) {
  for (const role of manifest.roles) {
    assert.equal(manifest.fields.some((field) => field.signerRole === role.role && field.fieldType === 'signature' && field.required === true), true, `${role.role} should have a required signature.`)
    assert.equal(manifest.fields.some((field) => field.signerRole === role.role && field.fieldType === 'initial' && field.repeat === 'every_page'), true, `${role.role} should initial every page.`)
    assert.equal(manifest.fields.some((field) => field.signerRole === role.role && field.fieldType === 'date'), true, `${role.role} should have a date field.`)
  }
  const registryValidation = validateTemplateTokensAgainstRegistry({
    packetType: 'otp',
    tokens: manifest.placeholderKeys,
  })
  assert.deepEqual(registryValidation.unknown, [])
  assert.equal(registryValidation.isValid, true)
}

const resaleShellSignature = buildOtpBrandedShellManifest({ variant: 'resale_existing_property' }).slots.find((slot) => slot.slotType === 'signature_zone')
const developmentShellSignature = buildOtpBrandedShellManifest({ variant: 'new_development' }).slots.find((slot) => slot.slotType === 'signature_zone')
assert.deepEqual(
  resaleShellSignature.signing.planned_fields.map((field) => `${field.signer_role}:${field.field_type}:${field.required}:${field.repeat || ''}`),
  [
    'purchaser_1:signature:true:',
    'purchaser_1:initial:true:every_page',
    'purchaser_1:date:true:',
    'seller:signature:true:',
    'seller:initial:true:every_page',
    'seller:date:true:',
  ],
)
assert.deepEqual(
  developmentShellSignature.signing.planned_fields.map((field) => `${field.signer_role}:${field.field_type}:${field.required}:${field.repeat || ''}`),
  [
    'purchaser_1:signature:true:',
    'purchaser_1:initial:true:every_page',
    'purchaser_1:date:true:',
    'developer_authorised_signatory:signature:true:',
    'developer_authorised_signatory:initial:true:every_page',
    'developer_authorised_signatory:date:true:',
    'contractor_authorised_signatory:signature:true:',
    'contractor_authorised_signatory:initial:true:every_page',
    'contractor_authorised_signatory:date:true:',
    'agent:signature:true:',
    'agent:initial:true:every_page',
    'agent:date:true:',
  ],
)
assert.equal(developmentShellSignature.placeholderKeys.includes('seller_signature'), false)
assert.equal(resaleShellSignature.placeholderKeys.includes('developer_signature'), false)

const audit = buildOtpSignatureInitialsAudit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(audit.version, OTP_SIGNATURE_INITIALS_VERSION)
assert.equal(audit.status, 'OTP_SIGNATURE_INITIALS_READY_FOR_RENDERER_WIRING')
assert.equal(audit.mutatedData, false)
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.resaleSignerCount, 2)
assert.equal(audit.summary.developmentSignerCount, 4)
assert.equal(audit.summary.fieldCount, 18)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])
assert.deepEqual(audit.fieldRegistryGaps, [])
assert.deepEqual(audit.mergeRegistryGaps, [])
assert.deepEqual(audit.routeFieldGaps, [])
assert.deepEqual(audit.shellFieldGaps, [])
assert.deepEqual(audit.missingInitials, [])
assert.deepEqual(audit.missingDates, [])

for (const check of [
  'PHASE8_SIGNATURE_INITIALS_BOTH_ROUTES_PRESENT',
  'PHASE8_RESALE_SIGNERS_BOUND',
  'PHASE8_DEVELOPMENT_SIGNERS_BOUND',
  'PHASE8_NO_RESALE_SIGNATURES_IN_DEVELOPMENT',
  'PHASE8_NO_DEVELOPMENT_SIGNATURES_IN_RESALE',
  'PHASE8_SIGNATURE_FIELDS_IN_FIELD_REGISTRY',
  'PHASE8_SIGNATURE_FIELDS_IN_MERGE_REGISTRY',
  'PHASE8_SIGNATURE_FIELDS_ROUTE_ELIGIBLE',
  'PHASE8_SHELL_SIGNATURE_PLAN_MATCHES',
  'PHASE8_INITIALS_REQUIRED_FOR_EVERY_SIGNER',
  'PHASE8_DATE_FIELD_REQUIRED_FOR_EVERY_SIGNER',
  'PHASE8_NO_FREE_TEXT_SIGNING_FALLBACKS',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const markdown = formatOtpSignatureInitialsAuditMarkdown(audit)
for (const token of [
  'OTP Template vNext Phase 8 Signatures And Initials',
  'OTP_SIGNATURE_INITIALS_READY_FOR_RENDERER_WIRING',
  'contractor_authorised_signatory',
  'agent_initials',
  'every_page',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpSignatureInitials.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_SIGNATURE_INITIALS_VERSION',
  'OTP_SIGNATURE_ROLES',
  'buildOtpSignatureInitialsManifest',
  'buildOtpSignatureInitialsAudit',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP signatures and initials Phase 8 contract passed.')
