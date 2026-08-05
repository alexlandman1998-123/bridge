import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_GENERATOR_RECONCILIATION_CONTRACT,
  OTP_GENERATOR_RECONCILIATION_PHASE23_VERSION,
  OTP_GENERATOR_RECONCILIATION_READY_STATUS,
  buildOtpGeneratorReconciliationPhase23Audit,
  formatOtpGeneratorReconciliationPhase23Markdown,
  listOtpGeneratorCommercialGapItems,
  listOtpGeneratorReconciliationTemplatePhases,
  listOtpGeneratorRemainingPhases,
} from '../src/core/documents/otpGeneratorReconciliationPhase23.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-generator-reconciliation-phase23'],
  'node scripts/otp-generator-reconciliation-phase23.test.mjs',
  'package.json should expose the OTP generator reconciliation Phase 23 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-generator-reconciliation-phase23'],
  'node scripts/report-otp-generator-reconciliation-phase23.mjs',
  'package.json should expose the OTP generator reconciliation Phase 23 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-generator-reconciliation-phase23'),
  'OTP vNext verification should include Phase 23 reconciliation.',
)

assert.equal(OTP_GENERATOR_RECONCILIATION_PHASE23_VERSION, 'otp_generator_reconciliation_phase23_v1')
assert.equal(OTP_GENERATOR_RECONCILIATION_READY_STATUS, 'OTP_GENERATOR_RECONCILIATION_READY_FOR_PHASE24_PERSISTENCE')
assert.equal(OTP_GENERATOR_RECONCILIATION_CONTRACT, 'otp-vnext-generator-reconciliation-phase23-v1')

const templatePhases = listOtpGeneratorReconciliationTemplatePhases()
assert.equal(templatePhases.length, 23)
assert.deepEqual(templatePhases.map((phase) => phase.phase), Array.from({ length: 23 }, (_, index) => index))
assert.equal(templatePhases.every((phase) => phase.status === 'verified'), true)
assert.equal(templatePhases.at(-1).key, 'live_write_guard')

const commercialGaps = listOtpGeneratorCommercialGapItems()
assert.deepEqual(
  commercialGaps.map((gap) => gap.key),
  [
    'commission_variation',
    'buyer_cost_obligations',
    'matter_attorney_cost_quote',
    'resale_development_separation',
  ],
)
assert.equal(commercialGaps.every((gap) => gap.status === 'foundation_verified'), true)
assert.ok(commercialGaps.find((gap) => gap.key === 'commission_variation')?.boundary.includes('Mandate commission is preserved'))
assert.ok(commercialGaps.find((gap) => gap.key === 'matter_attorney_cost_quote')?.boundary.includes('transaction_id'))

const remaining = listOtpGeneratorRemainingPhases()
assert.deepEqual(remaining.map((phase) => phase.phase), [24, 25, 26, 27, 28, 29])
assert.equal(remaining[0].key, 'commercial_terms_persistence')
assert.equal(remaining[0].status, 'next')
assert.equal(remaining.at(-1).key, 'final_production_readiness_gate')
for (const phase of remaining) {
  assert.ok(phase.entryCriteria.length > 0, `${phase.key} should have entry criteria.`)
  assert.ok(phase.exitCriteria.length > 0, `${phase.key} should have exit criteria.`)
}

const audit = buildOtpGeneratorReconciliationPhase23Audit({ checkedAt: '2026-08-05T12:00:00.000Z' })
assert.equal(audit.version, OTP_GENERATOR_RECONCILIATION_PHASE23_VERSION)
assert.equal(audit.contract, OTP_GENERATOR_RECONCILIATION_CONTRACT)
assert.equal(audit.status, OTP_GENERATOR_RECONCILIATION_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.summary.verifiedTemplatePhaseCount, 23)
assert.equal(audit.summary.commercialGapCount, 4)
assert.equal(audit.summary.remainingPhaseCount, 6)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 24)
assert.equal(audit.nextPhase.key, 'commercial_terms_persistence')
assert.deepEqual(audit.blockers, [])
assert.equal(audit.evidence.liveWriteGuard.status, 'OTP_LIVE_WRITE_GUARD_READY_FOR_APPLY_COMMAND_REHEARSAL')
assert.equal(audit.evidence.commercialTerms.status, 'OTP_COMMERCIAL_TERMS_FOUNDATION_READY')

for (const check of [
  'PHASE23_TEMPLATE_STREAM_0_TO_22_VERIFIED',
  'PHASE23_PHASE22_LIVE_WRITE_GUARD_READY',
  'PHASE23_COMMERCIAL_GAP_FOUNDATION_READY',
  'PHASE23_ALL_KNOWN_GAPS_CLASSIFIED',
  'PHASE23_RESALE_AND_NEW_DEVELOPMENT_ROUTES_REMAIN_PRIMARY',
  'PHASE23_REMAINING_PHASES_LOCKED',
  'PHASE23_NEXT_PHASE_IS_PERSISTENCE',
  'PHASE23_REMAINING_PHASES_HAVE_ENTRY_EXIT_CRITERIA',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const blockedByPhase22 = buildOtpGeneratorReconciliationPhase23Audit({
  checkedAt: '2026-08-05T12:00:00.000Z',
  liveWriteGuardAudit: {
    version: 'otp_live_write_guard_phase22_v1',
    status: 'OTP_LIVE_WRITE_GUARD_REMEDIATION_REQUIRED',
    mutatedData: false,
    summary: { blockerCount: 1 },
    blockers: [{ code: 'bad_guard' }],
  },
})
assert.equal(blockedByPhase22.status, 'OTP_GENERATOR_RECONCILIATION_REMEDIATION_REQUIRED')
assert.equal(blockedByPhase22.nextPhase, null)
assert.equal(blockedByPhase22.checks.find((item) => item.code === 'PHASE23_PHASE22_LIVE_WRITE_GUARD_READY')?.pass, false)

const blockedByCommercial = buildOtpGeneratorReconciliationPhase23Audit({
  checkedAt: '2026-08-05T12:00:00.000Z',
  commercialTermsAudit: {
    version: 'otp_commercial_terms_phase1_v1',
    status: 'OTP_COMMERCIAL_TERMS_FOUNDATION_REMEDIATION_REQUIRED',
    mutatedData: false,
    summary: { blockerCount: 1 },
    blockers: [{ code: 'bad_commercial_terms' }],
  },
})
assert.equal(blockedByCommercial.status, 'OTP_GENERATOR_RECONCILIATION_REMEDIATION_REQUIRED')
assert.equal(blockedByCommercial.checks.find((item) => item.code === 'PHASE23_COMMERCIAL_GAP_FOUNDATION_READY')?.pass, false)

const markdown = formatOtpGeneratorReconciliationPhase23Markdown(audit)
for (const token of [
  'OTP Generator Phase 23 Reconciliation',
  'OTP_GENERATOR_RECONCILIATION_READY_FOR_PHASE24_PERSISTENCE',
  'Phase 24: Commercial Terms Persistence',
  'Matter-level attorney transfer-cost quote/status',
  'PHASE23_REMAINING_PHASES_LOCKED',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpGeneratorReconciliationPhase23.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_GENERATOR_RECONCILIATION_PHASE23_VERSION',
  'buildOtpLiveWriteGuardPhase22Audit',
  'buildOtpCommercialTermsFoundationAudit',
  'commercial_terms_persistence',
  'matter_attorney_quote_portal_flow',
  'final_production_readiness_gate',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP generator reconciliation Phase 23 contract passed.')
