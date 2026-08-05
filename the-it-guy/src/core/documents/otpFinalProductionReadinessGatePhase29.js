import {
  OTP_SIGNING_ENVELOPE_QA_READY_STATUS,
  buildOtpSigningEnvelopeQaPhase14Audit,
} from './otpSigningEnvelopeQaPhase14.js'
import {
  OTP_SIGNING_DISPATCH_DRY_RUN_READY_STATUS,
  buildOtpSigningDispatchDryRunPhase15Audit,
} from './otpSigningDispatchDryRunPhase15.js'
import {
  OTP_SIGNER_SESSION_QA_READY_STATUS,
  buildOtpSignerSessionQaPhase16Audit,
} from './otpSignerSessionQaPhase16.js'
import {
  OTP_FINAL_COMPLETION_DRY_RUN_READY_STATUS,
  buildOtpFinalCompletionDryRunPhase17Audit,
} from './otpFinalCompletionDryRunPhase17.js'
import {
  OTP_RELEASE_CANDIDATE_LOCK_READY_STATUS,
  buildOtpReleaseCandidateLockPhase18Audit,
} from './otpReleaseCandidateLockPhase18.js'
import {
  OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_STATUS,
  buildOtpProductionPromotionPreflightPhase19Audit,
} from './otpProductionPromotionPreflightPhase19.js'
import {
  OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_STATUS,
  buildOtpControlledProductionActivationDryRunPhase20Audit,
} from './otpControlledProductionActivationDryRunPhase20.js'
import {
  OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_STATUS,
  buildOtpProductionActivationReceiptPhase21Audit,
} from './otpProductionActivationReceiptPhase21.js'
import {
  OTP_LIVE_WRITE_GUARD_READY_STATUS,
  buildOtpLiveWriteGuardPhase22Audit,
} from './otpLiveWriteGuardPhase22.js'
import {
  OTP_GENERATED_PDF_PROOF_READY_STATUS,
} from './otpGeneratedPdfProofPhase27.js'
import {
  OTP_MATTER_ATTORNEY_QUOTE_PORTAL_READY_STATUS,
} from './otpMatterAttorneyQuotePortalPhase28.js'
import { OTP_DOCUMENT_VARIANTS } from './otpRouteUniverse.js'

export const OTP_FINAL_PRODUCTION_READINESS_GATE_PHASE29_VERSION = 'otp_final_production_readiness_gate_phase29_v1'
export const OTP_FINAL_PRODUCTION_READINESS_GATE_READY_STATUS = 'OTP_FINAL_PRODUCTION_READINESS_GATE_READY_FOR_SEPARATE_AUTHORISED_APPLY_DECISION'
export const OTP_FINAL_PRODUCTION_READINESS_GATE_CONTRACT = 'otp-vnext-final-production-readiness-gate-phase29-v1'

const REQUIRED_PHASES = Object.freeze([
  Object.freeze({ phase: 14, key: 'signing_envelope_qa', label: 'Signing Envelope QA', readyStatus: OTP_SIGNING_ENVELOPE_QA_READY_STATUS }),
  Object.freeze({ phase: 15, key: 'signing_dispatch_dry_run', label: 'Signing Dispatch Dry Run', readyStatus: OTP_SIGNING_DISPATCH_DRY_RUN_READY_STATUS }),
  Object.freeze({ phase: 16, key: 'signer_session_qa', label: 'Signer Session QA', readyStatus: OTP_SIGNER_SESSION_QA_READY_STATUS }),
  Object.freeze({ phase: 17, key: 'final_completion_dry_run', label: 'Final Completion Dry Run', readyStatus: OTP_FINAL_COMPLETION_DRY_RUN_READY_STATUS }),
  Object.freeze({ phase: 18, key: 'release_candidate_lock', label: 'Release Candidate Lock', readyStatus: OTP_RELEASE_CANDIDATE_LOCK_READY_STATUS }),
  Object.freeze({ phase: 19, key: 'production_promotion_preflight', label: 'Production Promotion Preflight', readyStatus: OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_STATUS }),
  Object.freeze({ phase: 20, key: 'controlled_production_activation_dry_run', label: 'Controlled Production Activation Dry Run', readyStatus: OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_STATUS }),
  Object.freeze({ phase: 21, key: 'production_activation_receipt', label: 'Production Activation Receipt', readyStatus: OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_STATUS }),
  Object.freeze({ phase: 22, key: 'live_write_guard', label: 'Live Write Guard', readyStatus: OTP_LIVE_WRITE_GUARD_READY_STATUS }),
  Object.freeze({ phase: 27, key: 'generated_pdf_proof', label: 'Generated PDF Proof', readyStatus: OTP_GENERATED_PDF_PROOF_READY_STATUS }),
  Object.freeze({ phase: 28, key: 'matter_attorney_quote_portal_flow', label: 'Matter Attorney Quote Portal Flow', readyStatus: OTP_MATTER_ATTORNEY_QUOTE_PORTAL_READY_STATUS }),
])

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

function buildDefaultCoreAudits(checkedAt = new Date().toISOString()) {
  return {
    phase14: buildOtpSigningEnvelopeQaPhase14Audit({ checkedAt }),
    phase15: buildOtpSigningDispatchDryRunPhase15Audit({ checkedAt }),
    phase16: buildOtpSignerSessionQaPhase16Audit({ checkedAt }),
    phase17: buildOtpFinalCompletionDryRunPhase17Audit({ checkedAt }),
    phase18: buildOtpReleaseCandidateLockPhase18Audit({ checkedAt }),
    phase19: buildOtpProductionPromotionPreflightPhase19Audit({ checkedAt }),
    phase20: buildOtpControlledProductionActivationDryRunPhase20Audit({ checkedAt }),
    phase21: buildOtpProductionActivationReceiptPhase21Audit({ checkedAt }),
    phase22: buildOtpLiveWriteGuardPhase22Audit({ checkedAt }),
  }
}

function auditByPhase(audits = {}, phase) {
  return audits[`phase${phase}`] || null
}

function summarizePhase(phaseConfig, audit = {}) {
  const blockerCount = Number(audit?.summary?.blockerCount ?? audit?.blockers?.length ?? 0)
  const mutatedData = audit?.mutatedData === false ? false : audit?.mutatedData
  const status = normalizeText(audit?.status)
  return Object.freeze({
    phase: phaseConfig.phase,
    key: phaseConfig.key,
    label: phaseConfig.label,
    status,
    readyStatus: phaseConfig.readyStatus,
    pass: status === phaseConfig.readyStatus && blockerCount === 0 && mutatedData === false,
    blockerCount,
    mutatedData,
  })
}

function routeProofRows(phase27Audit = {}, phase28Audit = {}) {
  return OTP_DOCUMENT_VARIANTS.map((variant) => {
    const pdfRow = list(phase27Audit.routeRows).find((row) => row.routeKey === variant.key) || {}
    const portalRow = list(phase28Audit.routeRows).find((row) => row.routeKey === variant.key) || {}
    return Object.freeze({
      routeKey: variant.key,
      label: variant.label,
      pdfProof: pdfRow.validPdf === true && pdfRow.visualProof === true && pdfRow.routeProof === true,
      pageCount: Number(pdfRow.pageCount || 0),
      renderedPagePngCount: Number(pdfRow.renderedPagePngCount || 0),
      portalReady: portalRow.portalReady === true && portalRow.transactionScoped === true && portalRow.separatedFromAttorneyLeadQuote === true,
      portalStatus: normalizeText(portalRow.status),
    })
  })
}

function allFalse(values = []) {
  return values.every((value) => value === false)
}

export function buildOtpFinalProductionReadinessGatePhase29Audit({
  checkedAt = new Date().toISOString(),
  phase27Audit = null,
  phase28Audit = null,
  coreAudits = buildDefaultCoreAudits(checkedAt),
} = {}) {
  const checks = []
  const phaseRows = REQUIRED_PHASES.map((phaseConfig) => {
    const audit = phaseConfig.phase === 27
      ? phase27Audit
      : phaseConfig.phase === 28
        ? phase28Audit
        : auditByPhase(coreAudits, phaseConfig.phase)
    return summarizePhase(phaseConfig, audit || {})
  })
  const commercialRows = routeProofRows(phase27Audit || {}, phase28Audit || {})
  const liveWriteGuard = auditByPhase(coreAudits, 22) || {}
  const productionReceipt = auditByPhase(coreAudits, 21) || {}
  const completionDryRun = auditByPhase(coreAudits, 17) || {}
  const releaseCandidateLock = auditByPhase(coreAudits, 18) || {}
  const preflight = auditByPhase(coreAudits, 19) || {}
  const activation = auditByPhase(coreAudits, 20) || {}
  const phaseMutations = phaseRows.map((row) => row.mutatedData)

  addCheck(
    checks,
    phaseRows.every((row) => row.pass),
    'PHASE29_REQUIRED_PHASES_READY',
    'Required OTP generated PDF, signing, completion, release, production guard and matter quote portal phases are all ready with zero blockers.',
  )
  addCheck(
    checks,
    (phase27Audit?.summary?.pdfCount === 2) &&
      (phase27Audit?.summary?.renderedPngCount >= 8) &&
      commercialRows.every((row) => row.pdfProof && row.pageCount >= 4 && row.renderedPagePngCount === row.pageCount),
    'PHASE29_GENERATED_PDFS_PROVED_FOR_BOTH_ROUTES',
    'Both resale and new-development generated PDFs remain native PDF proofs with rendered page evidence and route-specific content.',
  )
  addCheck(
    checks,
    phase28Audit?.summary?.actionProofCount >= 4 &&
      commercialRows.every((row) => row.portalReady) &&
      list(phase28Audit?.actionRows).some((row) => row.actionKey === 'buyer_query_quote' && row.allowed === true) &&
      list(phase28Audit?.actionRows).some((row) => row.actionKey === 'attorney_revise_quote' && row.allowed === true) &&
      list(phase28Audit?.actionRows).some((row) => row.actionKey === 'buyer_acknowledge_quote' && row.allowed === true),
    'PHASE29_MATTER_ATTORNEY_QUOTE_FLOW_INCLUDED',
    'Matter attorney quote upload/revision, buyer query and acknowledgement proof is included in final readiness for both routes.',
  )
  addCheck(
    checks,
    completionDryRun.status === OTP_FINAL_COMPLETION_DRY_RUN_READY_STATUS &&
      releaseCandidateLock.status === OTP_RELEASE_CANDIDATE_LOCK_READY_STATUS,
    'PHASE29_SIGNING_AND_COMPLETION_CHAIN_INCLUDED',
    'Signing envelope, dispatch, signer session and final completion dry-run chain is included through the release-candidate lock.',
  )
  addCheck(
    checks,
    preflight.status === OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_STATUS &&
      activation.status === OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_STATUS &&
      productionReceipt.status === OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_STATUS,
    'PHASE29_PRODUCTION_PREFLIGHT_RECEIPT_CHAIN_INCLUDED',
    'Production preflight, controlled activation dry-run and activation receipt authority are included before live write guard.',
  )
  addCheck(
    checks,
    liveWriteGuard.status === OTP_LIVE_WRITE_GUARD_READY_STATUS &&
      liveWriteGuard.summary?.noProductionWriteExecuted === true &&
      liveWriteGuard.summary?.receiptFingerprintMatches === true &&
      liveWriteGuard.summary?.operatorConfirmationMatches === true &&
      liveWriteGuard.summary?.projectRefMatches === true &&
      liveWriteGuard.summary?.rollbackPlanMatches === true &&
      liveWriteGuard.summary?.exactOperationsAuthorised === true,
    'PHASE29_LIVE_WRITE_GUARD_BLOCKS_UNAUTHORISED_PRODUCTION_WRITES',
    'Live write guard confirms receipt fingerprint, operator confirmation, project ref, rollback plan and exact operations, while executing no production writes.',
  )
  addCheck(
    checks,
    allFalse(phaseMutations),
    'PHASE29_NO_MUTATION_DURING_FINAL_GATE',
    'Final production readiness gate is evidence-only and all required phase audits report mutatedData=false.',
  )

  const blockers = checks.filter((check) => !check.pass)

  return Object.freeze({
    version: OTP_FINAL_PRODUCTION_READINESS_GATE_PHASE29_VERSION,
    contract: OTP_FINAL_PRODUCTION_READINESS_GATE_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_FINAL_PRODUCTION_READINESS_GATE_REMEDIATION_REQUIRED' : OTP_FINAL_PRODUCTION_READINESS_GATE_READY_STATUS,
    mutatedData: false,
    canRequestSeparateAuthorisedApplyDecision: blockers.length === 0,
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 30,
      key: 'separate_authorised_apply_decision',
      label: 'Separate Authorised Apply Decision',
      boundary: 'Not automatic. Requires explicit operator authority outside this readiness proof.',
    }),
    summary: Object.freeze({
      requiredPhaseCount: phaseRows.length,
      readyPhaseCount: phaseRows.filter((row) => row.pass).length,
      routeCount: commercialRows.length,
      pdfCount: Number(phase27Audit?.summary?.pdfCount || 0),
      renderedPngCount: Number(phase27Audit?.summary?.renderedPngCount || 0),
      quotePortalActionProofCount: Number(phase28Audit?.summary?.actionProofCount || 0),
      liveWriteGuardDecisionCount: Number(liveWriteGuard.summary?.decisionCount || 0),
      noProductionWriteExecuted: liveWriteGuard.summary?.noProductionWriteExecuted === true,
      blockerCount: blockers.length,
    }),
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    phaseRows: Object.freeze(phaseRows),
    routeRows: Object.freeze(commercialRows),
    evidence: Object.freeze({
      generatedPdfProof: Object.freeze({
        version: phase27Audit?.version || '',
        status: phase27Audit?.status || '',
        pdfCount: Number(phase27Audit?.summary?.pdfCount || 0),
        renderedPngCount: Number(phase27Audit?.summary?.renderedPngCount || 0),
      }),
      matterAttorneyQuotePortal: Object.freeze({
        version: phase28Audit?.version || '',
        status: phase28Audit?.status || '',
        actionProofCount: Number(phase28Audit?.summary?.actionProofCount || 0),
      }),
      liveWriteGuard: Object.freeze({
        version: liveWriteGuard.version || '',
        status: liveWriteGuard.status || '',
        noProductionWriteExecuted: liveWriteGuard.summary?.noProductionWriteExecuted === true,
        guardFingerprint: liveWriteGuard.guard?.guardFingerprint || '',
      }),
    }),
  })
}

export function formatOtpFinalProductionReadinessGatePhase29Markdown(report = buildOtpFinalProductionReadinessGatePhase29Audit()) {
  return [
    '# OTP Generator Phase 29 Final Production Readiness Gate',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Contract: ${report.contract}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Required phases', report.summary.requiredPhaseCount],
        ['Ready phases', report.summary.readyPhaseCount],
        ['Routes', report.summary.routeCount],
        ['PDFs', report.summary.pdfCount],
        ['Rendered PNG proofs', report.summary.renderedPngCount],
        ['Quote portal action proofs', report.summary.quotePortalActionProofCount],
        ['Live write guard decisions', report.summary.liveWriteGuardDecisionCount],
        ['No production write executed', report.summary.noProductionWriteExecuted ? 'yes' : 'no'],
        ['Blockers', report.summary.blockerCount],
        ['Separate apply decision can be requested', report.canRequestSeparateAuthorisedApplyDecision ? 'yes' : 'no'],
      ],
    ),
    '',
    '## Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Phase Readiness',
    '',
    table(
      ['Phase', 'Key', 'Status', 'Blockers', 'Mutated data', 'Pass'],
      report.phaseRows.map((row) => [
        row.phase,
        row.key,
        row.status,
        row.blockerCount,
        row.mutatedData === false ? 'false' : row.mutatedData,
        row.pass ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Route Proof',
    '',
    table(
      ['Route', 'PDF proof', 'Pages', 'Rendered pages', 'Quote portal ready', 'Quote status'],
      report.routeRows.map((row) => [
        row.routeKey,
        row.pdfProof ? 'yes' : 'no',
        row.pageCount,
        row.renderedPagePngCount,
        row.portalReady ? 'yes' : 'no',
        row.portalStatus,
      ]),
    ),
    '',
    '## Runtime Boundary',
    '',
    'Phase 29 is a final evidence gate only. It does not apply production changes, publish templates, mutate route defaults, dispatch signing envelopes, publish attorney quote documents, or bypass the Phase 22 live-write guard. A later apply decision, if any, must be separately authorised.',
    '',
  ].join('\n')
}
