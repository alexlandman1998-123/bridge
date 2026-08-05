import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildOtpCommercialTermsPersistencePhase24Audit,
} from '../src/core/documents/otpCommercialTermsPersistencePhase24.js'
import {
  buildOtpCommercialTermsReviewPhase25Audit,
} from '../src/core/documents/otpCommercialTermsReviewPhase25.js'
import {
  buildOtpCommercialTermsRuntimePhase26Audit,
} from '../src/core/documents/otpCommercialTermsRuntimePhase26.js'
import {
  buildOtpGeneratedPdfProofPhase27Audit,
} from '../src/core/documents/otpGeneratedPdfProofPhase27.js'
import {
  buildOtpMatterAttorneyQuotePortalPhase28Audit,
} from '../src/core/documents/otpMatterAttorneyQuotePortalPhase28.js'
import {
  OTP_FINAL_PRODUCTION_READINESS_GATE_CONTRACT,
  OTP_FINAL_PRODUCTION_READINESS_GATE_PHASE29_VERSION,
  OTP_FINAL_PRODUCTION_READINESS_GATE_READY_STATUS,
  buildOtpFinalProductionReadinessGatePhase29Audit,
  formatOtpFinalProductionReadinessGatePhase29Markdown,
} from '../src/core/documents/otpFinalProductionReadinessGatePhase29.js'
import { renderOtpGeneratedPdfProofPhase27 } from './render-otp-generated-pdf-proof-phase27.mjs'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const migrationSql = await readFile(new URL('../../supabase/migrations/202608050010_otp_commercial_terms_persistence.sql', import.meta.url), 'utf8')
const persistenceServiceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsPersistenceService.js', import.meta.url), 'utf8')
const reviewComponentSource = await readFile(new URL('../src/components/documents/OtpCommercialTermsReviewPanel.jsx', import.meta.url), 'utf8')
const runtimeServiceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsRuntimeService.js', import.meta.url), 'utf8')
const portalServiceSource = await readFile(new URL('../src/services/documents/otpMatterAttorneyQuotePortalService.js', import.meta.url), 'utf8')
const phase29Source = await readFile(new URL('../src/core/documents/otpFinalProductionReadinessGatePhase29.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-final-production-readiness-gate-phase29'],
  'node scripts/otp-final-production-readiness-gate-phase29.test.mjs',
  'package.json should expose the OTP final production readiness gate Phase 29 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-final-production-readiness-gate-phase29'],
  'node scripts/report-otp-final-production-readiness-gate-phase29.mjs',
  'package.json should expose the OTP final production readiness gate Phase 29 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-final-production-readiness-gate-phase29'),
  'OTP vNext verification should include Phase 29 final production readiness gate.',
)

assert.equal(OTP_FINAL_PRODUCTION_READINESS_GATE_PHASE29_VERSION, 'otp_final_production_readiness_gate_phase29_v1')
assert.equal(OTP_FINAL_PRODUCTION_READINESS_GATE_READY_STATUS, 'OTP_FINAL_PRODUCTION_READINESS_GATE_READY_FOR_SEPARATE_AUTHORISED_APPLY_DECISION')
assert.equal(OTP_FINAL_PRODUCTION_READINESS_GATE_CONTRACT, 'otp-vnext-final-production-readiness-gate-phase29-v1')

for (const token of [
  'OTP_GENERATED_PDF_PROOF_READY_STATUS',
  'OTP_MATTER_ATTORNEY_QUOTE_PORTAL_READY_STATUS',
  'OTP_LIVE_WRITE_GUARD_READY_STATUS',
  'PHASE29_GENERATED_PDFS_PROVED_FOR_BOTH_ROUTES',
  'PHASE29_MATTER_ATTORNEY_QUOTE_FLOW_INCLUDED',
  'PHASE29_LIVE_WRITE_GUARD_BLOCKS_UNAUTHORISED_PRODUCTION_WRITES',
  'separate_authorised_apply_decision',
  'A later apply decision, if any, must be separately authorised.',
]) {
  assert.ok(phase29Source.includes(token), `Phase 29 source should include ${token}`)
}

const checkedAt = '2026-08-05T16:30:00.000Z'
const phase24Audit = buildOtpCommercialTermsPersistencePhase24Audit({
  checkedAt,
  migrationSql,
  serviceSource: persistenceServiceSource,
})
const phase25Audit = buildOtpCommercialTermsReviewPhase25Audit({
  checkedAt,
  phase24Audit,
  reviewComponentSource,
})
const phase26Audit = buildOtpCommercialTermsRuntimePhase26Audit({
  checkedAt,
  phase25Audit,
  serviceSource: runtimeServiceSource,
})
const renderEvidence = await renderOtpGeneratedPdfProofPhase27()
const phase27Audit = buildOtpGeneratedPdfProofPhase27Audit({
  checkedAt,
  phase26Audit,
  renderEvidence,
})
const phase28Audit = buildOtpMatterAttorneyQuotePortalPhase28Audit({
  checkedAt,
  phase27Audit,
  migrationSql,
  serviceSource: portalServiceSource,
})
const audit = buildOtpFinalProductionReadinessGatePhase29Audit({
  checkedAt,
  phase27Audit,
  phase28Audit,
})

assert.equal(audit.version, OTP_FINAL_PRODUCTION_READINESS_GATE_PHASE29_VERSION)
assert.equal(audit.contract, OTP_FINAL_PRODUCTION_READINESS_GATE_CONTRACT)
assert.equal(audit.status, OTP_FINAL_PRODUCTION_READINESS_GATE_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.canRequestSeparateAuthorisedApplyDecision, true)
assert.equal(audit.nextPhase.phase, 30)
assert.equal(audit.nextPhase.key, 'separate_authorised_apply_decision')
assert.equal(audit.summary.requiredPhaseCount, 11)
assert.equal(audit.summary.readyPhaseCount, 11)
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.pdfCount, 2)
assert.ok(audit.summary.renderedPngCount >= 8)
assert.equal(audit.summary.quotePortalActionProofCount, 4)
assert.equal(audit.summary.noProductionWriteExecuted, true)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

for (const check of [
  'PHASE29_REQUIRED_PHASES_READY',
  'PHASE29_GENERATED_PDFS_PROVED_FOR_BOTH_ROUTES',
  'PHASE29_MATTER_ATTORNEY_QUOTE_FLOW_INCLUDED',
  'PHASE29_SIGNING_AND_COMPLETION_CHAIN_INCLUDED',
  'PHASE29_PRODUCTION_PREFLIGHT_RECEIPT_CHAIN_INCLUDED',
  'PHASE29_LIVE_WRITE_GUARD_BLOCKS_UNAUTHORISED_PRODUCTION_WRITES',
  'PHASE29_NO_MUTATION_DURING_FINAL_GATE',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

assert.equal(audit.phaseRows.find((row) => row.phase === 27)?.pass, true)
assert.equal(audit.phaseRows.find((row) => row.phase === 28)?.pass, true)
assert.equal(audit.phaseRows.find((row) => row.phase === 22)?.pass, true)
assert.equal(audit.routeRows.every((row) => row.pdfProof && row.portalReady), true)
assert.equal(audit.evidence.liveWriteGuard.noProductionWriteExecuted, true)

const phase28Blocked = buildOtpFinalProductionReadinessGatePhase29Audit({
  checkedAt,
  phase27Audit,
  phase28Audit: { ...phase28Audit, status: 'OTP_MATTER_ATTORNEY_QUOTE_PORTAL_REMEDIATION_REQUIRED' },
})
assert.equal(phase28Blocked.status, 'OTP_FINAL_PRODUCTION_READINESS_GATE_REMEDIATION_REQUIRED')
assert.equal(phase28Blocked.canRequestSeparateAuthorisedApplyDecision, false)
assert.equal(phase28Blocked.nextPhase, null)
assert.equal(phase28Blocked.checks.find((item) => item.code === 'PHASE29_REQUIRED_PHASES_READY')?.pass, false)

const liveWriteBlocked = buildOtpFinalProductionReadinessGatePhase29Audit({
  checkedAt,
  phase27Audit,
  phase28Audit,
  coreAudits: {
    phase14: audit.phaseRows.find((row) => row.phase === 14),
    phase15: audit.phaseRows.find((row) => row.phase === 15),
    phase16: audit.phaseRows.find((row) => row.phase === 16),
    phase17: audit.phaseRows.find((row) => row.phase === 17),
    phase18: audit.phaseRows.find((row) => row.phase === 18),
    phase19: audit.phaseRows.find((row) => row.phase === 19),
    phase20: audit.phaseRows.find((row) => row.phase === 20),
    phase21: audit.phaseRows.find((row) => row.phase === 21),
    phase22: {
      status: 'OTP_LIVE_WRITE_GUARD_REMEDIATION_REQUIRED',
      mutatedData: false,
      summary: { blockerCount: 1, noProductionWriteExecuted: false },
    },
  },
})
assert.equal(liveWriteBlocked.status, 'OTP_FINAL_PRODUCTION_READINESS_GATE_REMEDIATION_REQUIRED')
assert.equal(liveWriteBlocked.checks.find((item) => item.code === 'PHASE29_LIVE_WRITE_GUARD_BLOCKS_UNAUTHORISED_PRODUCTION_WRITES')?.pass, false)

const markdown = formatOtpFinalProductionReadinessGatePhase29Markdown(audit)
for (const token of [
  'OTP Generator Phase 29 Final Production Readiness Gate',
  'OTP_FINAL_PRODUCTION_READINESS_GATE_READY_FOR_SEPARATE_AUTHORISED_APPLY_DECISION',
  'PHASE29_LIVE_WRITE_GUARD_BLOCKS_UNAUTHORISED_PRODUCTION_WRITES',
  'matter_attorney_quote_portal_flow',
  'Separate apply decision can be requested',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP final production readiness gate Phase 29 contract passed.')
