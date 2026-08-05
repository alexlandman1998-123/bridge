import {
  OTP_COMMERCIAL_TERMS_FOUNDATION_VERSION,
  buildOtpCommercialTermsFoundationAudit,
} from './otpCommercialTermsFoundation.js'
import {
  OTP_LIVE_WRITE_GUARD_PHASE22_VERSION,
  OTP_LIVE_WRITE_GUARD_READY_STATUS,
  buildOtpLiveWriteGuardPhase22Audit,
} from './otpLiveWriteGuardPhase22.js'
import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'

export const OTP_GENERATOR_RECONCILIATION_PHASE23_VERSION = 'otp_generator_reconciliation_phase23_v1'
export const OTP_GENERATOR_RECONCILIATION_READY_STATUS = 'OTP_GENERATOR_RECONCILIATION_READY_FOR_PHASE24_PERSISTENCE'
export const OTP_GENERATOR_RECONCILIATION_CONTRACT = 'otp-vnext-generator-reconciliation-phase23-v1'

const TEMPLATE_STREAM_PHASES = Object.freeze([
  Object.freeze({ phase: 0, key: 'lock_the_rules', label: 'Lock The Rules', status: 'verified' }),
  Object.freeze({ phase: 1, key: 'reference_extraction_shell_target', label: 'Reference Extraction and Shell Target', status: 'verified' }),
  Object.freeze({ phase: 2, key: 'route_split', label: 'Resale and New-Development Route Split', status: 'verified' }),
  Object.freeze({ phase: 3, key: 'field_registry', label: 'Field Registry and Legal Wording Draft', status: 'verified' }),
  Object.freeze({ phase: 4, key: 'resale_legal_content', label: 'Resale Legal Content and Data Lock', status: 'verified' }),
  Object.freeze({ phase: 5, key: 'new_development_legal_content', label: 'New-Development Legal Content', status: 'verified' }),
  Object.freeze({ phase: 6, key: 'branded_pdf_shell', label: 'Branded PDF Shell and Legal Content Templates', status: 'verified' }),
  Object.freeze({ phase: 7, key: 'structured_terms', label: 'Structured Terms', status: 'verified' }),
  Object.freeze({ phase: 8, key: 'signatures_initials', label: 'Signatures and Initials', status: 'verified' }),
  Object.freeze({ phase: 9, key: 'content_scanner', label: 'Content Scanner', status: 'verified' }),
  Object.freeze({ phase: 10, key: 'settings_admin_readiness', label: 'Settings and Admin Readiness', status: 'verified' }),
  Object.freeze({ phase: 11, key: 'runtime_integration', label: 'Runtime Integration', status: 'verified' }),
  Object.freeze({ phase: 12, key: 'staging_activation', label: 'Staging Activation', status: 'verified' }),
  Object.freeze({ phase: 13, key: 'staging_smoke_pdf_proof', label: 'Staging Smoke / Generated PDF Proof', status: 'verified' }),
  Object.freeze({ phase: 14, key: 'signing_envelope_qa', label: 'Signing Envelope QA', status: 'verified' }),
  Object.freeze({ phase: 15, key: 'signing_dispatch_dry_run', label: 'Signing Dispatch Dry Run', status: 'verified' }),
  Object.freeze({ phase: 16, key: 'signer_session_qa', label: 'Signer Session QA', status: 'verified' }),
  Object.freeze({ phase: 17, key: 'final_completion_dry_run', label: 'Final Completion Dry Run', status: 'verified' }),
  Object.freeze({ phase: 18, key: 'release_candidate_lock', label: 'Release Candidate Lock', status: 'verified' }),
  Object.freeze({ phase: 19, key: 'production_promotion_preflight', label: 'Production Promotion Preflight', status: 'verified' }),
  Object.freeze({ phase: 20, key: 'controlled_production_activation_dry_run', label: 'Controlled Production Activation Dry Run', status: 'verified' }),
  Object.freeze({ phase: 21, key: 'production_activation_receipt', label: 'Production Activation Receipt', status: 'verified' }),
  Object.freeze({ phase: 22, key: 'live_write_guard', label: 'Live Write Guard', status: 'verified' }),
])

const COMMERCIAL_GAP_ITEMS = Object.freeze([
  Object.freeze({
    key: 'commission_variation',
    label: 'Mandate commission vs negotiated OTP commission',
    status: 'foundation_verified',
    remainingPhase: 24,
    boundary: 'Mandate commission is preserved as a snapshot; negotiated OTP commission requires approval before transaction commission lock.',
  }),
  Object.freeze({
    key: 'buyer_cost_obligations',
    label: 'Buyer cost obligations and scheme costs',
    status: 'foundation_verified',
    remainingPhase: 24,
    boundary: 'Resale and new-development cost obligations are route-scoped structured records, with known, estimated and pending states.',
  }),
  Object.freeze({
    key: 'matter_attorney_cost_quote',
    label: 'Matter-level attorney transfer-cost quote/status',
    status: 'foundation_verified',
    remainingPhase: 24,
    boundary: 'Transaction attorney quote state is scoped by transaction_id and transaction_attorney_assignment_id, separate from public attorney lead quotes.',
  }),
  Object.freeze({
    key: 'resale_development_separation',
    label: 'Resale and new-development separation',
    status: 'foundation_verified',
    remainingPhase: 26,
    boundary: 'Commercial records must stay route-aware all the way through persistence, UI, runtime input and generated PDF proof.',
  }),
])

const REMAINING_PHASES = Object.freeze([
  Object.freeze({
    phase: 24,
    key: 'commercial_terms_persistence',
    label: 'Commercial Terms Persistence',
    status: 'next',
    purpose: 'Persist OTP commission variation approvals, buyer cost obligation items and matter attorney cost quote state.',
    entryCriteria: Object.freeze([
      'Phase 23 reconciliation ready',
      'Phase 1 commercial foundation contract green',
      'No production write required',
    ]),
    exitCriteria: Object.freeze([
      'SQL tables, constraints and RLS are additive and route-aware',
      'Service functions can create/read/update commission variation, cost obligations and matter quote state',
      'Attorney lead quotes remain excluded from transaction matter quote source of truth',
    ]),
  }),
  Object.freeze({
    phase: 25,
    key: 'otp_review_ui',
    label: 'OTP Review UI',
    status: 'planned',
    purpose: 'Expose commercial records before generation for agent/admin review and approval.',
    entryCriteria: Object.freeze(['Phase 24 persistence verified']),
    exitCriteria: Object.freeze([
      'Negotiated commission approval status is visible before generation',
      'Buyer cost obligations show known, estimated and pending states',
      'Resale and new-development review screens stay separate',
    ]),
  }),
  Object.freeze({
    phase: 26,
    key: 'runtime_data_wiring',
    label: 'Runtime Data Wiring',
    status: 'planned',
    purpose: 'Connect seller onboarding, transaction offer terms, commission records, attorney assignment and cost obligations into generator input.',
    entryCriteria: Object.freeze(['Phase 24 persistence verified', 'Phase 25 review UI verified']),
    exitCriteria: Object.freeze([
      'Seller rates, levies, HOA/body-corporate facts flow into resale OTP inputs',
      'Development levy, rates and utility charges flow into new-development OTP inputs',
      'Commission lock decision gates transaction commission finalisation',
    ]),
  }),
  Object.freeze({
    phase: 27,
    key: 'generated_pdf_proof',
    label: 'Generated PDF Proof',
    status: 'planned',
    purpose: 'Generate actual resale and new-development PDFs proving branding, legal wording, commercial fields, signatures and route separation.',
    entryCriteria: Object.freeze(['Phase 26 runtime wiring verified']),
    exitCriteria: Object.freeze([
      'Resale PDF renders commission variation and buyer cost schedule correctly',
      'New-development PDF renders development costs without resale seller-onboarding leakage',
      'Logo, company details, footer positions, page numbers, signatures and initials are visually proved',
    ]),
  }),
  Object.freeze({
    phase: 28,
    key: 'matter_attorney_quote_portal_flow',
    label: 'Matter Attorney Quote Portal Flow',
    status: 'planned',
    purpose: 'Wire attorney upload, buyer view/query, revision and acknowledgement for transaction-scoped transfer-cost quote/state.',
    entryCriteria: Object.freeze(['Phase 24 persistence verified', 'Phase 26 runtime wiring verified']),
    exitCriteria: Object.freeze([
      'Attorney can upload/revise quote or statement against the transaction assignment',
      'Buyer can view, query and acknowledge only their matter quote',
      'Public attorney lead quote workflow remains separate',
    ]),
  }),
  Object.freeze({
    phase: 29,
    key: 'final_production_readiness_gate',
    label: 'Final Production Readiness Gate',
    status: 'planned',
    purpose: 'Run the full generated PDF, signing, completion, live-write guard and rollback/receipt evidence chain with commercial terms included.',
    entryCriteria: Object.freeze(['Phases 24-28 verified']),
    exitCriteria: Object.freeze([
      'Full OTP generator proof passes for both routes',
      'Signing envelope/session/finalisation dry runs include commercial terms',
      'Production activation remains blocked without valid receipt, operator confirmation and live-write guard match',
    ]),
  }),
])

function normalizeText(value) {
  return String(value ?? '').trim()
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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

export function listOtpGeneratorReconciliationTemplatePhases() {
  return TEMPLATE_STREAM_PHASES.map((phase) => ({ ...phase }))
}

export function listOtpGeneratorCommercialGapItems() {
  return COMMERCIAL_GAP_ITEMS.map((item) => ({ ...item }))
}

export function listOtpGeneratorRemainingPhases() {
  return REMAINING_PHASES.map((phase) => ({
    ...phase,
    entryCriteria: [...phase.entryCriteria],
    exitCriteria: [...phase.exitCriteria],
  }))
}

export function buildOtpGeneratorReconciliationPhase23Audit({
  checkedAt = new Date().toISOString(),
  liveWriteGuardAudit = buildOtpLiveWriteGuardPhase22Audit({ checkedAt }),
  commercialTermsAudit = buildOtpCommercialTermsFoundationAudit({ checkedAt }),
} = {}) {
  const templatePhases = listOtpGeneratorReconciliationTemplatePhases()
  const commercialGapItems = listOtpGeneratorCommercialGapItems()
  const remainingPhases = listOtpGeneratorRemainingPhases()
  const checks = []

  addCheck(
    checks,
    templatePhases.length === 23 && templatePhases.every((phase) => phase.status === 'verified'),
    'PHASE23_TEMPLATE_STREAM_0_TO_22_VERIFIED',
    'OTP Template vNext Phases 0-22 are represented as verified before Phase 23 starts.',
  )
  addCheck(
    checks,
    liveWriteGuardAudit.version === OTP_LIVE_WRITE_GUARD_PHASE22_VERSION && liveWriteGuardAudit.status === OTP_LIVE_WRITE_GUARD_READY_STATUS,
    'PHASE23_PHASE22_LIVE_WRITE_GUARD_READY',
    'The Phase 22 live-write guard remains ready and no production write is executed.',
  )
  addCheck(
    checks,
    commercialTermsAudit.version === OTP_COMMERCIAL_TERMS_FOUNDATION_VERSION && commercialTermsAudit.status === 'OTP_COMMERCIAL_TERMS_FOUNDATION_READY',
    'PHASE23_COMMERCIAL_GAP_FOUNDATION_READY',
    'Commercial gap foundation for commission variation, buyer costs and matter attorney quote state is ready.',
  )
  addCheck(
    checks,
    commercialGapItems.length === 4 && commercialGapItems.every((item) => item.status === 'foundation_verified'),
    'PHASE23_ALL_KNOWN_GAPS_CLASSIFIED',
    'Known commercial gaps are classified and mapped into the remaining OTP generator phases.',
  )
  addCheck(
    checks,
    OTP_DOCUMENT_VARIANTS.map((variant) => variant.key).includes('resale_existing_property') &&
      OTP_DOCUMENT_VARIANTS.map((variant) => variant.key).includes('new_development'),
    'PHASE23_RESALE_AND_NEW_DEVELOPMENT_ROUTES_REMAIN_PRIMARY',
    'The reconciliation keeps resale and new-development as separate primary OTP routes.',
  )
  addCheck(
    checks,
    remainingPhases.map((phase) => phase.phase).join(',') === '24,25,26,27,28,29',
    'PHASE23_REMAINING_PHASES_LOCKED',
    'The remaining work is consolidated into Phases 24-29.',
  )
  addCheck(
    checks,
    remainingPhases[0]?.key === 'commercial_terms_persistence' && remainingPhases[0]?.status === 'next',
    'PHASE23_NEXT_PHASE_IS_PERSISTENCE',
    'Phase 24 is the next actionable phase: commercial terms persistence.',
  )
  addCheck(
    checks,
    remainingPhases.every((phase) => phase.entryCriteria.length > 0 && phase.exitCriteria.length > 0),
    'PHASE23_REMAINING_PHASES_HAVE_ENTRY_EXIT_CRITERIA',
    'Every remaining phase has explicit entry and exit criteria.',
  )

  const blockers = checks.filter((check) => !check.pass)

  return {
    version: OTP_GENERATOR_RECONCILIATION_PHASE23_VERSION,
    contract: OTP_GENERATOR_RECONCILIATION_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_GENERATOR_RECONCILIATION_REMEDIATION_REQUIRED' : OTP_GENERATOR_RECONCILIATION_READY_STATUS,
    mutatedData: false,
    nextPhase: blockers.length ? null : remainingPhases[0],
    summary: {
      routeCount: OTP_DOCUMENT_VARIANTS.length,
      verifiedTemplatePhaseCount: templatePhases.length,
      commercialGapCount: commercialGapItems.length,
      remainingPhaseCount: remainingPhases.length,
      blockerCount: blockers.length,
    },
    checks,
    blockers,
    templatePhases,
    commercialGapItems,
    remainingPhases,
    evidence: {
      liveWriteGuard: {
        version: liveWriteGuardAudit.version,
        status: liveWriteGuardAudit.status,
        mutatedData: liveWriteGuardAudit.mutatedData,
        blockerCount: liveWriteGuardAudit.summary?.blockerCount ?? liveWriteGuardAudit.blockers?.length ?? 0,
      },
      commercialTerms: {
        version: commercialTermsAudit.version,
        status: commercialTermsAudit.status,
        mutatedData: commercialTermsAudit.mutatedData,
        blockerCount: commercialTermsAudit.summary?.blockerCount ?? commercialTermsAudit.blockers?.length ?? 0,
      },
    },
  }
}

export function formatOtpGeneratorReconciliationPhase23Markdown(report = buildOtpGeneratorReconciliationPhase23Audit()) {
  return [
    '# OTP Generator Phase 23 Reconciliation',
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
        ['Routes', report.summary.routeCount],
        ['Verified template phases', report.summary.verifiedTemplatePhaseCount],
        ['Commercial gaps classified', report.summary.commercialGapCount],
        ['Remaining phases', report.summary.remainingPhaseCount],
        ['Blockers', report.summary.blockerCount],
        ['Next phase', report.nextPhase ? `Phase ${report.nextPhase.phase}: ${report.nextPhase.label}` : 'Blocked'],
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
    '## Completed Template Stream',
    '',
    table(
      ['Phase', 'Key', 'Status', 'Label'],
      report.templatePhases.map((phase) => [phase.phase, phase.key, phase.status, phase.label]),
    ),
    '',
    '## Commercial Gap Stream',
    '',
    table(
      ['Gap', 'Status', 'Remaining Phase', 'Boundary'],
      report.commercialGapItems.map((item) => [item.label, item.status, item.remainingPhase, item.boundary]),
    ),
    '',
    '## Remaining Work',
    '',
    table(
      ['Phase', 'Status', 'Purpose', 'Exit Criteria'],
      report.remainingPhases.map((phase) => [
        `Phase ${phase.phase}: ${phase.label}`,
        phase.status,
        phase.purpose,
        phase.exitCriteria.join('; '),
      ]),
    ),
    '',
    '## Evidence',
    '',
    '```json',
    JSON.stringify(cloneJson(report.evidence), null, 2),
    '```',
    '',
    '## Boundary',
    '',
    'Phase 23 reconciles the OTP generator roadmap. It does not create database persistence, alter production defaults, send signing envelopes, publish attorney quote documents, or mutate live data. Phase 24 is the next implementation phase.',
    '',
  ].join('\n')
}
