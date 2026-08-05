import {
  OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_PHASE56_VERSION,
  OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_READY_STATUS,
  buildOtpTemplateRenewalScopingAndTriagePhase56Audit,
} from './otpTemplateRenewalScopingAndTriagePhase56.js'

export const OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_PHASE57_VERSION = 'otp_template_renewal_work_package_draft_phase57_v1'
export const OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_READY_STATUS = 'OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_READY_FOR_ATTORNEY_REVIEW_PACKET'
export const OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_CONTRACT = 'otp-vnext-template-renewal-work-package-draft-phase57-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_DRAFT_SECTIONS = Object.freeze([
  'clause_work_items',
  'field_work_items',
  'signing_envelope_work_items',
  'agent_review_ui_work_items',
  'acceptance_criteria',
])
const REQUIRED_REVIEW_GATES = Object.freeze([
  'template_owner_review',
  'attorney_review',
  'qa_review',
  'rollback_review',
  'no_write_review',
])
const REQUIRED_EVIDENCE_ITEMS = Object.freeze([
  'scope_traceability',
  'route_work_package_draft',
  'attorney_review_packet_stub',
  'qa_test_plan_trace',
  'rollback_trace',
  'no_write_proof',
])

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function hasDocxSource(row = {}) {
  return /\.docx?$/i.test(normalizeText(row.path || row.sourcePath || row.source_path || row.draftArtifactPath || row.draft_artifact_path || row.sourceTemplatePath || row.source_template_path)) ||
    normalizeKey(row.sourceFormat || row.source_format || row.draftFormat || row.draft_format).includes('doc') ||
    numberValue(row.docxReferenceCount || row.docx_reference_count) > 0
}

function fingerprint(parts = []) {
  const text = parts.map((part) => normalizeText(part)).join('|')
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) >>> 0
  }
  return `${hash.toString(16).padStart(8, '0')}${'0'.repeat(56)}`
}

function defaultDraftManifest(scopingReceipt = {}, checkedAt = new Date().toISOString()) {
  return {
    draftManifestId: 'otp-vnext-phase57-work-package-draft-manifest',
    status: 'drafted',
    draftedAt: checkedAt,
    scopingFingerprint: scopingReceipt.scopingFingerprint,
    routeCount: REQUIRED_ROUTES.length,
    routeSeparationMode: 'separate_route_work_packages',
    draftMode: 'governance_draft_only',
    templateOwner: 'template_owner',
    qaOwner: 'qa_owner',
    attorneyCoordinator: 'attorney_coordinator',
    productionWriteRequested: false,
    emergencyOverride: false,
    draftOnly: true,
  }
}

function defaultRouteDrafts(scopingReceipt = {}) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const scope = list(scopingReceipt.routeScopePlans).find((row) => normalizeKey(row.routeVariant) === routeVariant) || {}
    return {
      routeVariant,
      workPackageKey: scope.workPackageKey,
      draftArtifactKey: `${scope.workPackageKey || routeVariant}-draft-phase57`,
      draftStatus: 'drafted',
      sourceScopingFingerprint: scopingReceipt.scopingFingerprint,
      clauseWorkItems: list(scope.clausesToReview).map((clause) => ({
        key: clause,
        action: 'review_and_prepare_attorney_packet',
        owner: 'template_owner',
        attorneyReviewRequired: true,
      })),
      fieldWorkItems: list(scope.fieldsToReview).map((field) => ({
        key: field,
        action: 'verify_registry_and_runtime_mapping',
        owner: 'template_owner',
        qaReviewRequired: true,
      })),
      signingEnvelopeWorkItems: list(scope.signingEnvelopeImpacts).map((impact) => ({
        key: impact,
        action: 'prepare_signing_alignment_test',
        owner: 'qa_owner',
      })),
      agentReviewUiWorkItems: list(scope.agentReviewUiImpacts).map((impact) => ({
        key: impact,
        action: 'prepare_agent_review_ui_validation',
        owner: 'qa_owner',
      })),
      acceptanceCriteria: list(scope.acceptanceCriteria),
      sourceFormat: 'native_governance_record',
      draftFormat: 'json_governance_record',
      docxReferenceCount: 0,
      attorneyReviewRequired: true,
      attorneyApprovalGranted: false,
      routeDefaultMutationRequested: false,
      signingEnvelopeMutationRequested: false,
      productionWriteRequested: false,
    }
  })
}

function defaultReviewGates() {
  return REQUIRED_REVIEW_GATES.map((key) => ({
    key,
    status: 'queued',
    owner: key === 'attorney_review' ? 'attorney_coordinator' : key === 'qa_review' ? 'qa_owner' : 'governance_owner',
    requiredBeforePublication: true,
    evidencePath: `docs/otp-${key.replace(/_/g, '-')}-phase57.md`,
    approvalGranted: false,
  }))
}

function defaultAttorneyPacketStub() {
  return {
    required: true,
    packetStatus: 'prepared_for_review',
    attorneyApprovalGranted: false,
    unresolvedLegalHoldCount: 0,
    routeSeparatedPacket: true,
    packetReference: 'phase57-attorney-review-packet-stub',
    evidencePath: 'docs/otp-attorney-review-packet-stub-phase57.md',
  }
}

function defaultQaTraceability(scopingReceipt = {}) {
  const scopedTests = list(scopingReceipt.testPlan).map((item) => normalizeKey(item.key))
  return {
    sourceTestPlanCount: scopedTests.length,
    contentScannerMapped: scopedTests.includes('content_scanner'),
    generatedPdfProofMapped: scopedTests.includes('generated_pdf_proof'),
    signingEnvelopeAlignmentMapped: scopedTests.includes('signing_envelope_alignment'),
    agentReviewRuntimeMapped: scopedTests.includes('agent_review_runtime'),
    routeRegressionMapped: scopedTests.includes('route_regression'),
    rollbackRehearsalMapped: scopedTests.includes('rollback_rehearsal'),
    noWriteGuardMapped: scopedTests.includes('no_write_guard'),
  }
}

function defaultRollbackTrace(scopingReceipt = {}) {
  return {
    rollbackReference: scopingReceipt.rollbackPlan?.rollbackScopeReference,
    owner: scopingReceipt.rollbackPlan?.owner || 'release_operator',
    restorePreviousDefaultsTraced: true,
    restorePreviousSigningEnvelopesTraced: true,
    restoreVersionPointerTraced: true,
    stopSigningDispatchTraced: true,
    dryRunStillRequired: true,
    productionWriteNotAllowed: true,
  }
}

function defaultEvidence() {
  return REQUIRED_EVIDENCE_ITEMS.map((key) => ({
    key,
    status: 'captured',
    path: `docs/otp-${key.replace(/_/g, '-')}-phase57.md`,
    fingerprint: fingerprint([key, 'phase57']),
  }))
}

function defaultNoWriteProof() {
  return {
    draftOnly: true,
    productionWriteAttempted: false,
    templateDefaultMutationCount: 0,
    legalWordingMutationCount: 0,
    signingEnvelopeMutationCount: 0,
    versionPointerMutationCount: 0,
    dispatchMutationCount: 0,
  }
}

function phase56Blockers(scopingReceipt = {}) {
  return [
    scopingReceipt.version === OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_PHASE56_VERSION ? '' : 'phase56_scoping_version_mismatch',
    scopingReceipt.status === OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_READY_STATUS ? '' : 'phase56_scoping_not_ready',
    scopingReceipt.canPrepareWorkPackageDraft === true ? '' : 'phase56_scoping_not_ready_for_draft',
    scopingReceipt.mutatedData === false ? '' : 'phase56_scoping_mutation_unexpected',
    list(scopingReceipt.blockerCodes).length === 0 ? '' : 'phase56_scoping_has_blockers',
    scopingReceipt.noWriteProof?.productionWriteAttempted === false ? '' : 'phase56_scoping_write_attempted',
  ].filter(Boolean)
}

function manifestBlockers(manifest = {}, scopingReceipt = {}) {
  return [
    normalizeText(manifest.draftManifestId || manifest.draft_manifest_id) ? '' : 'draft_manifest_id_missing',
    normalizeKey(manifest.status) === 'drafted' ? '' : 'draft_manifest_not_drafted',
    normalizeText(manifest.draftedAt || manifest.drafted_at) ? '' : 'draft_manifest_time_missing',
    manifest.scopingFingerprint === scopingReceipt.scopingFingerprint ? '' : 'draft_scoping_fingerprint_mismatch',
    numberValue(manifest.routeCount || manifest.route_count) === REQUIRED_ROUTES.length ? '' : 'draft_route_count_mismatch',
    normalizeKey(manifest.routeSeparationMode || manifest.route_separation_mode) === 'separate_route_work_packages' ? '' : 'draft_route_separation_missing',
    normalizeKey(manifest.draftMode || manifest.draft_mode) === 'governance_draft_only' ? '' : 'draft_mode_not_governance_only',
    normalizeText(manifest.templateOwner || manifest.template_owner) ? '' : 'draft_template_owner_missing',
    normalizeText(manifest.qaOwner || manifest.qa_owner) ? '' : 'draft_qa_owner_missing',
    normalizeText(manifest.attorneyCoordinator || manifest.attorney_coordinator) ? '' : 'draft_attorney_coordinator_missing',
    manifest.productionWriteRequested === true ? 'draft_production_write_requested' : '',
    manifest.emergencyOverride === true ? 'draft_emergency_override_requested' : '',
    manifest.draftOnly === true ? '' : 'draft_only_flag_missing',
  ].filter(Boolean)
}

function routeDraftBlockers(routeDrafts = [], scopingReceipt = {}) {
  const routes = list(routeDrafts).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routeDrafts).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    const scope = list(scopingReceipt.routeScopePlans).find((candidate) => normalizeKey(candidate.routeVariant) === route) || {}
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `draft_route_unsupported:${route}`,
      row.workPackageKey === scope.workPackageKey ? '' : `draft_work_package_mismatch:${route}`,
      normalizeText(row.draftArtifactKey || row.draft_artifact_key) ? '' : `draft_artifact_key_missing:${route}`,
      normalizeKey(row.draftStatus || row.draft_status) === 'drafted' ? '' : `draft_route_not_drafted:${route}`,
      row.sourceScopingFingerprint === scopingReceipt.scopingFingerprint ? '' : `draft_route_scoping_fingerprint_mismatch:${route}`,
      list(row.clauseWorkItems || row.clause_work_items).length ? '' : `draft_clause_work_items_missing:${route}`,
      list(row.fieldWorkItems || row.field_work_items).length ? '' : `draft_field_work_items_missing:${route}`,
      list(row.signingEnvelopeWorkItems || row.signing_envelope_work_items).length ? '' : `draft_signing_work_items_missing:${route}`,
      list(row.agentReviewUiWorkItems || row.agent_review_ui_work_items).length ? '' : `draft_agent_review_ui_work_items_missing:${route}`,
      list(row.acceptanceCriteria || row.acceptance_criteria).length ? '' : `draft_acceptance_criteria_missing:${route}`,
      row.attorneyReviewRequired === true ? '' : `draft_attorney_review_not_required:${route}`,
      row.attorneyApprovalGranted === true ? `draft_attorney_approval_premature:${route}` : '',
      hasDocxSource(row) ? `draft_docx_source_observed:${route}` : '',
      row.routeDefaultMutationRequested === true ? `draft_route_default_mutation_requested:${route}` : '',
      row.signingEnvelopeMutationRequested === true ? `draft_signing_envelope_mutation_requested:${route}` : '',
      row.productionWriteRequested === true ? `draft_route_production_write_requested:${route}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `draft_route_missing:${route}`),
    ...unique(duplicateRoutes).map((route) => `draft_route_duplicate:${route}`),
    ...rowBlockers,
  ]
}

function reviewGateBlockers(reviewGates = []) {
  const keys = list(reviewGates).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_REVIEW_GATES.filter((key) => !keys.includes(key))
  const badRows = list(reviewGates).filter((row) =>
    REQUIRED_REVIEW_GATES.includes(normalizeKey(row.key)) &&
      (normalizeKey(row.status) !== 'queued' || !normalizeText(row.owner) || row.requiredBeforePublication !== true || !normalizeText(row.evidencePath || row.evidence_path)),
  )
  const prematureApprovals = list(reviewGates).filter((row) => row.approvalGranted === true)
  return [
    ...missingKeys.map((key) => `draft_review_gate_missing:${key}`),
    ...badRows.map((row) => `draft_review_gate_invalid:${normalizeKey(row.key) || 'unknown'}`),
    ...prematureApprovals.map((row) => `draft_review_gate_premature_approval:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function attorneyPacketBlockers(packet = {}) {
  return [
    packet.required === true ? '' : 'draft_attorney_packet_not_required',
    normalizeKey(packet.packetStatus || packet.packet_status) === 'prepared_for_review' ? '' : 'draft_attorney_packet_not_prepared',
    packet.attorneyApprovalGranted === true ? 'draft_attorney_packet_premature_approval' : '',
    numberValue(packet.unresolvedLegalHoldCount || packet.unresolved_legal_hold_count) === 0 ? '' : 'draft_attorney_packet_legal_holds_unresolved',
    packet.routeSeparatedPacket === true ? '' : 'draft_attorney_packet_not_route_separated',
    normalizeText(packet.packetReference || packet.packet_reference) ? '' : 'draft_attorney_packet_reference_missing',
    normalizeText(packet.evidencePath || packet.evidence_path) ? '' : 'draft_attorney_packet_evidence_missing',
  ].filter(Boolean)
}

function qaTraceabilityBlockers(trace = {}) {
  return [
    numberValue(trace.sourceTestPlanCount || trace.source_test_plan_count) >= 7 ? '' : 'draft_qa_source_test_plan_incomplete',
    trace.contentScannerMapped === true ? '' : 'draft_content_scanner_not_mapped',
    trace.generatedPdfProofMapped === true ? '' : 'draft_generated_pdf_proof_not_mapped',
    trace.signingEnvelopeAlignmentMapped === true ? '' : 'draft_signing_alignment_not_mapped',
    trace.agentReviewRuntimeMapped === true ? '' : 'draft_agent_review_runtime_not_mapped',
    trace.routeRegressionMapped === true ? '' : 'draft_route_regression_not_mapped',
    trace.rollbackRehearsalMapped === true ? '' : 'draft_rollback_rehearsal_not_mapped',
    trace.noWriteGuardMapped === true ? '' : 'draft_no_write_guard_not_mapped',
  ].filter(Boolean)
}

function rollbackTraceBlockers(trace = {}) {
  return [
    normalizeText(trace.rollbackReference || trace.rollback_reference) ? '' : 'draft_rollback_reference_missing',
    normalizeText(trace.owner) ? '' : 'draft_rollback_owner_missing',
    trace.restorePreviousDefaultsTraced === true ? '' : 'draft_restore_defaults_not_traced',
    trace.restorePreviousSigningEnvelopesTraced === true ? '' : 'draft_restore_envelopes_not_traced',
    trace.restoreVersionPointerTraced === true ? '' : 'draft_restore_pointer_not_traced',
    trace.stopSigningDispatchTraced === true ? '' : 'draft_stop_dispatch_not_traced',
    trace.dryRunStillRequired === true ? '' : 'draft_rollback_dry_run_not_required',
    trace.productionWriteNotAllowed === true ? '' : 'draft_rollback_production_write_not_blocked',
  ].filter(Boolean)
}

function evidenceBlockers(evidence = []) {
  const keys = list(evidence).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_EVIDENCE_ITEMS.filter((key) => !keys.includes(key))
  const badRows = list(evidence).filter((row) =>
    REQUIRED_EVIDENCE_ITEMS.includes(normalizeKey(row.key)) &&
      (normalizeKey(row.status) !== 'captured' || !normalizeText(row.path) || !/^[a-f0-9]{64}$/i.test(normalizeText(row.fingerprint || row.sha256))),
  )
  return [
    ...missingKeys.map((key) => `draft_evidence_missing:${key}`),
    ...badRows.map((row) => `draft_evidence_invalid:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function noWriteBlockers(noWriteProof = {}) {
  return [
    noWriteProof.draftOnly === true ? '' : 'draft_no_write_draft_only_missing',
    noWriteProof.productionWriteAttempted === true ? 'draft_production_write_attempted' : '',
    numberValue(noWriteProof.templateDefaultMutationCount || noWriteProof.template_default_mutation_count) === 0 ? '' : 'draft_template_default_mutation_observed',
    numberValue(noWriteProof.legalWordingMutationCount || noWriteProof.legal_wording_mutation_count) === 0 ? '' : 'draft_legal_wording_mutation_observed',
    numberValue(noWriteProof.signingEnvelopeMutationCount || noWriteProof.signing_envelope_mutation_count) === 0 ? '' : 'draft_signing_envelope_mutation_observed',
    numberValue(noWriteProof.versionPointerMutationCount || noWriteProof.version_pointer_mutation_count) === 0 ? '' : 'draft_version_pointer_mutation_observed',
    numberValue(noWriteProof.dispatchMutationCount || noWriteProof.dispatch_mutation_count) === 0 ? '' : 'draft_dispatch_mutation_observed',
  ].filter(Boolean)
}

export function buildOtpTemplateRenewalWorkPackageDraftReceipt({
  scopingReceipt = buildOtpTemplateRenewalScopingAndTriagePhase56Audit().scopingReceipts?.find((receipt) => receipt.canPrepareWorkPackageDraft),
  draftManifest = null,
  routeDrafts = null,
  reviewGates = defaultReviewGates(),
  attorneyPacketStub = defaultAttorneyPacketStub(),
  qaTraceability = null,
  rollbackTrace = null,
  evidence = defaultEvidence(),
  noWriteProof = defaultNoWriteProof(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const manifest = draftManifest || defaultDraftManifest(scopingReceipt, checkedAt)
  const drafts = routeDrafts || defaultRouteDrafts(scopingReceipt)
  const qaTrace = qaTraceability || defaultQaTraceability(scopingReceipt)
  const rollback = rollbackTrace || defaultRollbackTrace(scopingReceipt)
  const blockerCodes = unique([
    ...phase56Blockers(scopingReceipt || {}),
    ...manifestBlockers(manifest, scopingReceipt),
    ...routeDraftBlockers(drafts, scopingReceipt),
    ...reviewGateBlockers(reviewGates),
    ...attorneyPacketBlockers(attorneyPacketStub),
    ...qaTraceabilityBlockers(qaTrace),
    ...rollbackTraceBlockers(rollback),
    ...evidenceBlockers(evidence),
    ...noWriteBlockers(noWriteProof),
  ])
  const canPrepareAttorneyReviewPacket = blockerCodes.length === 0
  const draftFingerprint = fingerprint([
    manifest.draftManifestId,
    scopingReceipt?.scopingFingerprint,
    list(drafts).map((row) => `${row.routeVariant}:${row.draftArtifactKey}`).join(','),
  ])

  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_PHASE57_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_CONTRACT,
    checkedAt,
    status: canPrepareAttorneyReviewPacket
      ? OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_READY_STATUS
      : 'OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_BLOCKED',
    canPrepareAttorneyReviewPacket,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    draftFingerprint,
    scopingReceipt: Object.freeze({
      version: scopingReceipt?.version,
      status: scopingReceipt?.status,
      canPrepareWorkPackageDraft: scopingReceipt?.canPrepareWorkPackageDraft === true,
      scopingFingerprint: scopingReceipt?.scopingFingerprint,
    }),
    draftManifest: Object.freeze({ ...manifest }),
    routeDrafts: Object.freeze(list(drafts)),
    reviewGates: Object.freeze(list(reviewGates)),
    attorneyPacketStub: Object.freeze({ ...attorneyPacketStub }),
    qaTraceability: Object.freeze({ ...qaTrace }),
    rollbackTrace: Object.freeze({ ...rollback }),
    evidence: Object.freeze(list(evidence)),
    noWriteProof: Object.freeze({ ...noWriteProof }),
    summary: Object.freeze({
      routeCount: REQUIRED_ROUTES.length,
      routeDraftCount: list(drafts).length,
      reviewGateCount: list(reviewGates).length,
      evidenceCount: list(evidence).length,
      blockerCount: blockerCodes.length,
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpTemplateRenewalWorkPackageDraftPhase57Audit({
  checkedAt = new Date().toISOString(),
  phase56Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase56Ready = !phase56Audit || phase56Audit.status === OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_READY_STATUS
  const goodScoping = phase56Audit?.scopingReceipts?.find((receipt) => receipt.canPrepareWorkPackageDraft) ||
    buildOtpTemplateRenewalScopingAndTriagePhase56Audit({ checkedAt }).scopingReceipts.find((receipt) => receipt.canPrepareWorkPackageDraft)
  const goodDraft = buildOtpTemplateRenewalWorkPackageDraftReceipt({
    checkedAt,
    scopingReceipt: goodScoping,
  })
  const fingerprintMismatchDraft = buildOtpTemplateRenewalWorkPackageDraftReceipt({
    checkedAt,
    scopingReceipt: goodScoping,
    draftManifest: {
      ...defaultDraftManifest(goodScoping, checkedAt),
      scopingFingerprint: 'wrong-fingerprint',
    },
  })
  const missingRouteDraft = buildOtpTemplateRenewalWorkPackageDraftReceipt({
    checkedAt,
    scopingReceipt: goodScoping,
    routeDrafts: defaultRouteDrafts(goodScoping).filter((row) => row.routeVariant !== 'new_development'),
  })
  const incompleteRouteDraft = buildOtpTemplateRenewalWorkPackageDraftReceipt({
    checkedAt,
    scopingReceipt: goodScoping,
    routeDrafts: defaultRouteDrafts(goodScoping).map((row) =>
      row.routeVariant === 'new_development'
        ? { ...row, clauseWorkItems: [], fieldWorkItems: [], acceptanceCriteria: [] }
        : row,
    ),
  })
  const docxDraft = buildOtpTemplateRenewalWorkPackageDraftReceipt({
    checkedAt,
    scopingReceipt: goodScoping,
    routeDrafts: defaultRouteDrafts(goodScoping).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, draftFormat: 'docx', draftArtifactPath: 'resale-work-package.docx', docxReferenceCount: 1 }
        : row,
    ),
  })
  const prematureApprovalDraft = buildOtpTemplateRenewalWorkPackageDraftReceipt({
    checkedAt,
    scopingReceipt: goodScoping,
    routeDrafts: defaultRouteDrafts(goodScoping).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, attorneyApprovalGranted: true }
        : row,
    ),
    reviewGates: defaultReviewGates().map((row) =>
      row.key === 'attorney_review' ? { ...row, approvalGranted: true } : row,
    ),
    attorneyPacketStub: {
      ...defaultAttorneyPacketStub(),
      attorneyApprovalGranted: true,
    },
  })
  const reviewGateBlockedDraft = buildOtpTemplateRenewalWorkPackageDraftReceipt({
    checkedAt,
    scopingReceipt: goodScoping,
    reviewGates: [
      { key: 'template_owner_review', status: 'failed', owner: '', requiredBeforePublication: false, evidencePath: '' },
    ],
  })
  const qaBlockedDraft = buildOtpTemplateRenewalWorkPackageDraftReceipt({
    checkedAt,
    scopingReceipt: goodScoping,
    qaTraceability: {
      ...defaultQaTraceability(goodScoping),
      generatedPdfProofMapped: false,
      signingEnvelopeAlignmentMapped: false,
    },
  })
  const rollbackBlockedDraft = buildOtpTemplateRenewalWorkPackageDraftReceipt({
    checkedAt,
    scopingReceipt: goodScoping,
    rollbackTrace: {
      ...defaultRollbackTrace(goodScoping),
      owner: '',
      stopSigningDispatchTraced: false,
      dryRunStillRequired: false,
    },
  })
  const evidenceBlockedDraft = buildOtpTemplateRenewalWorkPackageDraftReceipt({
    checkedAt,
    scopingReceipt: goodScoping,
    evidence: [
      { key: 'scope_traceability', status: 'missing', path: '', fingerprint: 'bad' },
    ],
  })
  const productionWriteDraft = buildOtpTemplateRenewalWorkPackageDraftReceipt({
    checkedAt,
    scopingReceipt: goodScoping,
    draftManifest: {
      ...defaultDraftManifest(goodScoping, checkedAt),
      productionWriteRequested: true,
      emergencyOverride: true,
      draftOnly: false,
    },
    noWriteProof: {
      ...defaultNoWriteProof(),
      productionWriteAttempted: true,
      legalWordingMutationCount: 1,
    },
  })

  addCheck(checks, phase56Ready, 'PHASE57_PHASE56_SCOPING_READY', 'Template renewal work-package drafting starts only after Phase 56 scoping is ready.')
  addCheck(
    checks,
    goodDraft.canPrepareAttorneyReviewPacket &&
      goodDraft.status === OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_READY_STATUS &&
      goodDraft.mutatedData === false,
    'PHASE57_GOOD_WORK_PACKAGE_DRAFT_READY',
    'A clean scoped package can become draft route work packages without mutating production data.',
  )
  addCheck(
    checks,
    goodDraft.draftManifest.scopingFingerprint === goodScoping.scopingFingerprint,
    'PHASE57_DRAFT_BOUND_TO_SCOPING',
    'Draft work packages are bound to the exact Phase 56 scoping fingerprint.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodDraft.routeDrafts.some((row) => row.routeVariant === route && row.draftStatus === 'drafted')),
    'PHASE57_BOTH_ROUTE_DRAFTS_CREATED',
    'Resale and new-development work-package drafts are both present.',
  )
  addCheck(
    checks,
    REQUIRED_DRAFT_SECTIONS.every((section) =>
      goodDraft.routeDrafts.every((row) => list(row[section.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] || row[section]).length > 0),
    ),
    'PHASE57_REQUIRED_DRAFT_SECTIONS_PRESENT',
    'Each route draft contains clause, field, signing, agent-review, and acceptance-criteria sections.',
  )
  addCheck(
    checks,
    REQUIRED_REVIEW_GATES.every((key) => goodDraft.reviewGates.some((row) => row.key === key && row.status === 'queued' && row.requiredBeforePublication === true)),
    'PHASE57_REVIEW_GATES_QUEUED',
    'Template owner, attorney, QA, rollback, and no-write review gates are queued.',
  )
  addCheck(
    checks,
    goodDraft.attorneyPacketStub.required === true &&
      goodDraft.attorneyPacketStub.packetStatus === 'prepared_for_review' &&
      goodDraft.attorneyPacketStub.attorneyApprovalGranted === false,
    'PHASE57_ATTORNEY_PACKET_PREPARED_NOT_APPROVED',
    'Attorney packet stub is prepared for review but not legally approved.',
  )
  addCheck(
    checks,
    goodDraft.noWriteProof.draftOnly === true &&
      goodDraft.noWriteProof.productionWriteAttempted === false &&
      goodDraft.noWriteProof.legalWordingMutationCount === 0,
    'PHASE57_NO_PRODUCTION_WRITE_ALLOWED',
    'Phase 57 drafts governance work packages only and cannot mutate legal wording, defaults, envelopes, pointers, or dispatch state.',
  )
  addCheck(
    checks,
    fingerprintMismatchDraft.canPrepareAttorneyReviewPacket === false &&
      fingerprintMismatchDraft.blockerCodes.includes('draft_scoping_fingerprint_mismatch'),
    'PHASE57_SCOPING_FINGERPRINT_MISMATCH_BLOCKED',
    'Draft manifest must match the Phase 56 scoping fingerprint.',
  )
  addCheck(
    checks,
    missingRouteDraft.canPrepareAttorneyReviewPacket === false &&
      missingRouteDraft.blockerCodes.includes('draft_route_missing:new_development'),
    'PHASE57_MISSING_ROUTE_DRAFT_BLOCKED',
    'Missing resale or new-development route draft blocks attorney packet preparation.',
  )
  addCheck(
    checks,
    incompleteRouteDraft.canPrepareAttorneyReviewPacket === false &&
      incompleteRouteDraft.blockerCodes.includes('draft_clause_work_items_missing:new_development') &&
      incompleteRouteDraft.blockerCodes.includes('draft_field_work_items_missing:new_development'),
    'PHASE57_INCOMPLETE_ROUTE_DRAFT_BLOCKED',
    'Route drafts without clause, field, or acceptance sections are blocked.',
  )
  addCheck(
    checks,
    docxDraft.canPrepareAttorneyReviewPacket === false &&
      docxDraft.blockerCodes.includes('draft_docx_source_observed:resale_existing_property'),
    'PHASE57_DOCX_SOURCE_BLOCKED',
    'DOC/DOCX draft artifacts remain blocked.',
  )
  addCheck(
    checks,
    prematureApprovalDraft.canPrepareAttorneyReviewPacket === false &&
      prematureApprovalDraft.blockerCodes.includes('draft_attorney_approval_premature:resale_existing_property') &&
      prematureApprovalDraft.blockerCodes.includes('draft_attorney_packet_premature_approval'),
    'PHASE57_PREMATURE_APPROVAL_BLOCKED',
    'Attorney or review-gate approvals cannot be granted during draft packaging.',
  )
  addCheck(
    checks,
    reviewGateBlockedDraft.canPrepareAttorneyReviewPacket === false &&
      reviewGateBlockedDraft.blockerCodes.includes('draft_review_gate_missing:attorney_review') &&
      reviewGateBlockedDraft.blockerCodes.includes('draft_review_gate_invalid:template_owner_review'),
    'PHASE57_REVIEW_GATE_BLOCKED',
    'Missing or invalid review gates block draft packaging.',
  )
  addCheck(
    checks,
    qaBlockedDraft.canPrepareAttorneyReviewPacket === false &&
      qaBlockedDraft.blockerCodes.includes('draft_generated_pdf_proof_not_mapped') &&
      qaBlockedDraft.blockerCodes.includes('draft_signing_alignment_not_mapped'),
    'PHASE57_QA_TRACEABILITY_BLOCKED',
    'QA traceability must map the Phase 56 test plan into the draft package.',
  )
  addCheck(
    checks,
    rollbackBlockedDraft.canPrepareAttorneyReviewPacket === false &&
      rollbackBlockedDraft.blockerCodes.includes('draft_rollback_owner_missing') &&
      rollbackBlockedDraft.blockerCodes.includes('draft_stop_dispatch_not_traced'),
    'PHASE57_ROLLBACK_TRACE_BLOCKED',
    'Rollback traceability and dispatch stop trace are required.',
  )
  addCheck(
    checks,
    evidenceBlockedDraft.canPrepareAttorneyReviewPacket === false &&
      evidenceBlockedDraft.blockerCodes.includes('draft_evidence_missing:route_work_package_draft') &&
      evidenceBlockedDraft.blockerCodes.includes('draft_evidence_invalid:scope_traceability'),
    'PHASE57_EVIDENCE_BLOCKED',
    'Missing or invalid draft evidence blocks attorney packet preparation.',
  )
  addCheck(
    checks,
    productionWriteDraft.canPrepareAttorneyReviewPacket === false &&
      productionWriteDraft.blockerCodes.includes('draft_production_write_requested') &&
      productionWriteDraft.blockerCodes.includes('draft_legal_wording_mutation_observed'),
    'PHASE57_PRODUCTION_WRITE_BLOCKED',
    'Production write requests or observed legal wording mutations block draft packaging.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-template-renewal-work-package-draft-phase57'] === 'node scripts/otp-template-renewal-work-package-draft-phase57.test.mjs' &&
      packageJson.scripts?.['report:otp-template-renewal-work-package-draft-phase57'] === 'node scripts/report-otp-template-renewal-work-package-draft-phase57.mjs' &&
      packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-work-package-draft-phase57'),
    'PHASE57_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 57 test, report, and vNext verification chain entry.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_PHASE57_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_REMEDIATION_REQUIRED' : OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    draftReceipts: Object.freeze([
      goodDraft,
      fingerprintMismatchDraft,
      missingRouteDraft,
      incompleteRouteDraft,
      docxDraft,
      prematureApprovalDraft,
      reviewGateBlockedDraft,
      qaBlockedDraft,
      rollbackBlockedDraft,
      evidenceBlockedDraft,
      productionWriteDraft,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      readyDraftCount: [goodDraft].filter((row) => row.canPrepareAttorneyReviewPacket).length,
      blockedDraftCount: [
        fingerprintMismatchDraft,
        missingRouteDraft,
        incompleteRouteDraft,
        docxDraft,
        prematureApprovalDraft,
        reviewGateBlockedDraft,
        qaBlockedDraft,
        rollbackBlockedDraft,
        evidenceBlockedDraft,
        productionWriteDraft,
      ].filter((row) => !row.canPrepareAttorneyReviewPacket).length,
      routeCount: REQUIRED_ROUTES.length,
      reviewGateCount: REQUIRED_REVIEW_GATES.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 58,
      key: 'otp_template_renewal_attorney_review_packet',
      label: 'Template Renewal Attorney Review Packet',
    }),
  })
}

export function formatOtpTemplateRenewalWorkPackageDraftPhase57Markdown(report = buildOtpTemplateRenewalWorkPackageDraftPhase57Audit()) {
  const readyReceipt = report.draftReceipts.find((receipt) => receipt.canPrepareAttorneyReviewPacket) || report.draftReceipts[0]
  return [
    '# OTP Generator Phase 57 Template Renewal Work Package Draft',
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
        ['Ready drafts', report.summary.readyDraftCount],
        ['Blocked drafts', report.summary.blockedDraftCount],
        ['Routes', report.summary.routeCount],
        ['Review gates', report.summary.reviewGateCount],
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
    '## Draft Manifest',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Manifest ID', readyReceipt.draftManifest.draftManifestId],
        ['Scoping fingerprint', readyReceipt.draftManifest.scopingFingerprint],
        ['Draft fingerprint', readyReceipt.draftFingerprint],
        ['Route separation', readyReceipt.draftManifest.routeSeparationMode],
        ['Draft mode', readyReceipt.draftManifest.draftMode],
        ['Attorney coordinator', readyReceipt.draftManifest.attorneyCoordinator],
      ],
    ),
    '',
    '## Route Drafts',
    '',
    table(
      ['Route', 'Draft Artifact', 'Clauses', 'Fields', 'Signing Items', 'Agent UI Items'],
      readyReceipt.routeDrafts.map((route) => [
        route.routeVariant,
        route.draftArtifactKey,
        route.clauseWorkItems.map((item) => item.key).join(', '),
        route.fieldWorkItems.map((item) => item.key).join(', '),
        route.signingEnvelopeWorkItems.map((item) => item.key).join(', '),
        route.agentReviewUiWorkItems.map((item) => item.key).join(', '),
      ]),
    ),
    '',
    '## Review Gates',
    '',
    table(
      ['Gate', 'Status', 'Owner', 'Approval Granted'],
      readyReceipt.reviewGates.map((gate) => [
        gate.key,
        gate.status,
        gate.owner,
        gate.approvalGranted ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Attorney Packet Stub',
    '',
    table(
      ['Field', 'Value'],
      [
        ['required', readyReceipt.attorneyPacketStub.required ? 'yes' : 'no'],
        ['packet_status', readyReceipt.attorneyPacketStub.packetStatus],
        ['approval_granted', readyReceipt.attorneyPacketStub.attorneyApprovalGranted ? 'yes' : 'no'],
        ['route_separated', readyReceipt.attorneyPacketStub.routeSeparatedPacket ? 'yes' : 'no'],
        ['reference', readyReceipt.attorneyPacketStub.packetReference],
      ],
    ),
    '',
    '## Draft Receipts',
    '',
    table(
      ['Status', 'Ready', 'Routes', 'Review Gates', 'Evidence', 'Blockers'],
      report.draftReceipts.map((receipt) => [
        receipt.status,
        receipt.canPrepareAttorneyReviewPacket ? 'yes' : 'no',
        receipt.summary.routeDraftCount,
        receipt.summary.reviewGateCount,
        receipt.summary.evidenceCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 57 drafts governance work packages from the scoped route plans. It prepares route-separated task records, review gates, attorney packet stubs, QA traceability, rollback traceability, evidence, and no-write proof. It does not draft final legal wording, approve attorney changes, publish a template version, mutate route defaults, alter signing envelopes, or dispatch signing links.',
    '',
  ].join('\n')
}
