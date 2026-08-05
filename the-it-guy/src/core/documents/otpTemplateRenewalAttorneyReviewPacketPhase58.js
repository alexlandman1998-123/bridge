import {
  OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_PHASE57_VERSION,
  OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_READY_STATUS,
  buildOtpTemplateRenewalWorkPackageDraftPhase57Audit,
} from './otpTemplateRenewalWorkPackageDraftPhase57.js'

export const OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_PHASE58_VERSION = 'otp_template_renewal_attorney_review_packet_phase58_v1'
export const OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_READY_STATUS = 'OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_READY_FOR_ATTORNEY_RESPONSE'
export const OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_CONTRACT = 'otp-vnext-template-renewal-attorney-review-packet-phase58-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_PACKET_SECTIONS = Object.freeze([
  'route_summary',
  'clause_questions',
  'field_questions',
  'signing_questions',
  'agent_review_questions',
  'acceptance_criteria',
])
const REQUIRED_ATTORNEY_INSTRUCTIONS = Object.freeze([
  'review_legal_wording',
  'confirm_route_specific_differences',
  'confirm_buyer_cost_obligations',
  'confirm_suspensive_condition_handling',
  'confirm_signature_and_witness_requirements',
])
const REQUIRED_EVIDENCE_ITEMS = Object.freeze([
  'work_package_trace',
  'route_packet_bundle',
  'attorney_instruction_sheet',
  'question_register',
  'qa_and_rollback_context',
  'no_write_attestation',
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
  return /\.docx?$/i.test(normalizeText(row.path || row.sourcePath || row.source_path || row.packetPath || row.packet_path || row.sourceTemplatePath || row.source_template_path)) ||
    normalizeKey(row.sourceFormat || row.source_format || row.packetFormat || row.packet_format).includes('doc') ||
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

function defaultPacketManifest(draftReceipt = {}, checkedAt = new Date().toISOString()) {
  return {
    packetId: 'otp-vnext-phase58-attorney-review-packet',
    status: 'prepared_for_attorney_response',
    preparedAt: checkedAt,
    draftFingerprint: draftReceipt.draftFingerprint,
    routeCount: REQUIRED_ROUTES.length,
    routeSeparationMode: 'separate_route_packets',
    packetMode: 'attorney_review_only',
    templateOwner: 'template_owner',
    attorneyCoordinator: 'attorney_coordinator',
    qaContextIncluded: true,
    rollbackContextIncluded: true,
    productionWriteRequested: false,
    attorneyApprovalGranted: false,
    packetOnly: true,
  }
}

function defaultRoutePackets(draftReceipt = {}) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const draft = list(draftReceipt.routeDrafts).find((row) => normalizeKey(row.routeVariant) === routeVariant) || {}
    return {
      routeVariant,
      packetKey: `${routeVariant}-attorney-review-packet-phase58`,
      sourceDraftArtifactKey: draft.draftArtifactKey,
      sourceDraftFingerprint: draftReceipt.draftFingerprint,
      packetStatus: 'prepared',
      routeSummary: `${routeVariant} attorney review packet prepared from Phase 57 work-package draft.`,
      clauseQuestions: list(draft.clauseWorkItems).map((item) => ({
        key: item.key,
        question: `Confirm legal wording treatment for ${item.key}.`,
        responseRequired: true,
      })),
      fieldQuestions: list(draft.fieldWorkItems).map((item) => ({
        key: item.key,
        question: `Confirm field/runtime requirement for ${item.key}.`,
        responseRequired: true,
      })),
      signingQuestions: list(draft.signingEnvelopeWorkItems).map((item) => ({
        key: item.key,
        question: `Confirm signing envelope requirement for ${item.key}.`,
        responseRequired: true,
      })),
      agentReviewQuestions: list(draft.agentReviewUiWorkItems).map((item) => ({
        key: item.key,
        question: `Confirm agent review UI control for ${item.key}.`,
        responseRequired: true,
      })),
      acceptanceCriteria: list(draft.acceptanceCriteria),
      packetFormat: 'json_governance_record',
      sourceFormat: 'native_governance_record',
      docxReferenceCount: 0,
      routeSeparated: true,
      attorneyResponseRequired: true,
      attorneyApprovalGranted: false,
      productionWriteRequested: false,
    }
  })
}

function defaultInstructionSet() {
  return REQUIRED_ATTORNEY_INSTRUCTIONS.map((key) => ({
    key,
    status: 'included',
    responseRequired: true,
    owner: 'attorney_coordinator',
    instructionReference: `phase58-${key}`,
  }))
}

function defaultQuestionRegister(draftReceipt = {}) {
  return {
    registerId: 'phase58-attorney-question-register',
    status: 'open',
    routeCount: REQUIRED_ROUTES.length,
    totalQuestionCount: list(draftReceipt.routeDrafts).reduce((count, draft) =>
      count +
      list(draft.clauseWorkItems).length +
      list(draft.fieldWorkItems).length +
      list(draft.signingEnvelopeWorkItems).length +
      list(draft.agentReviewUiWorkItems).length,
    0),
    unresolvedQuestionCount: 1,
    attorneyResponseRequired: true,
    attorneyApprovalGranted: false,
  }
}

function defaultQaRollbackContext(draftReceipt = {}) {
  return {
    qaTraceIncluded: true,
    contentScannerMapped: draftReceipt.qaTraceability?.contentScannerMapped === true,
    generatedPdfProofMapped: draftReceipt.qaTraceability?.generatedPdfProofMapped === true,
    signingEnvelopeAlignmentMapped: draftReceipt.qaTraceability?.signingEnvelopeAlignmentMapped === true,
    rollbackTraceIncluded: true,
    rollbackReference: draftReceipt.rollbackTrace?.rollbackReference,
    stopSigningDispatchTraced: draftReceipt.rollbackTrace?.stopSigningDispatchTraced === true,
    noWriteGuardMapped: draftReceipt.qaTraceability?.noWriteGuardMapped === true,
  }
}

function defaultReviewRouting() {
  return {
    attorneyRecipientRole: 'external_attorney_reviewer',
    templateOwnerRole: 'template_owner',
    responseDuePolicy: 'before_template_update_draft',
    deliveryMode: 'internal_review_packet',
    emailDispatchRequested: false,
    signingDispatchRequested: false,
    productionWriteRequested: false,
  }
}

function defaultEvidence() {
  return REQUIRED_EVIDENCE_ITEMS.map((key) => ({
    key,
    status: 'captured',
    path: `docs/otp-${key.replace(/_/g, '-')}-phase58.md`,
    fingerprint: fingerprint([key, 'phase58']),
  }))
}

function defaultNoWriteProof() {
  return {
    packetOnly: true,
    productionWriteAttempted: false,
    attorneyApprovalMutationCount: 0,
    legalWordingMutationCount: 0,
    templateDefaultMutationCount: 0,
    signingEnvelopeMutationCount: 0,
    dispatchMutationCount: 0,
  }
}

function phase57Blockers(draftReceipt = {}) {
  return [
    draftReceipt.version === OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_PHASE57_VERSION ? '' : 'phase57_draft_version_mismatch',
    draftReceipt.status === OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_READY_STATUS ? '' : 'phase57_draft_not_ready',
    draftReceipt.canPrepareAttorneyReviewPacket === true ? '' : 'phase57_draft_not_ready_for_attorney_packet',
    draftReceipt.mutatedData === false ? '' : 'phase57_draft_mutation_unexpected',
    list(draftReceipt.blockerCodes).length === 0 ? '' : 'phase57_draft_has_blockers',
    draftReceipt.noWriteProof?.productionWriteAttempted === false ? '' : 'phase57_draft_write_attempted',
  ].filter(Boolean)
}

function manifestBlockers(manifest = {}, draftReceipt = {}) {
  return [
    normalizeText(manifest.packetId || manifest.packet_id) ? '' : 'attorney_packet_id_missing',
    normalizeKey(manifest.status) === 'prepared_for_attorney_response' ? '' : 'attorney_packet_status_invalid',
    normalizeText(manifest.preparedAt || manifest.prepared_at) ? '' : 'attorney_packet_time_missing',
    manifest.draftFingerprint === draftReceipt.draftFingerprint ? '' : 'attorney_packet_draft_fingerprint_mismatch',
    numberValue(manifest.routeCount || manifest.route_count) === REQUIRED_ROUTES.length ? '' : 'attorney_packet_route_count_mismatch',
    normalizeKey(manifest.routeSeparationMode || manifest.route_separation_mode) === 'separate_route_packets' ? '' : 'attorney_packet_route_separation_missing',
    normalizeKey(manifest.packetMode || manifest.packet_mode) === 'attorney_review_only' ? '' : 'attorney_packet_mode_invalid',
    normalizeText(manifest.templateOwner || manifest.template_owner) ? '' : 'attorney_packet_template_owner_missing',
    normalizeText(manifest.attorneyCoordinator || manifest.attorney_coordinator) ? '' : 'attorney_packet_coordinator_missing',
    manifest.qaContextIncluded === true ? '' : 'attorney_packet_qa_context_missing',
    manifest.rollbackContextIncluded === true ? '' : 'attorney_packet_rollback_context_missing',
    manifest.productionWriteRequested === true ? 'attorney_packet_production_write_requested' : '',
    manifest.attorneyApprovalGranted === true ? 'attorney_packet_premature_approval' : '',
    manifest.packetOnly === true ? '' : 'attorney_packet_only_flag_missing',
  ].filter(Boolean)
}

function routePacketBlockers(routePackets = [], draftReceipt = {}) {
  const routes = list(routePackets).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routePackets).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    const draft = list(draftReceipt.routeDrafts).find((candidate) => normalizeKey(candidate.routeVariant) === route) || {}
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `attorney_packet_route_unsupported:${route}`,
      normalizeText(row.packetKey || row.packet_key) ? '' : `attorney_packet_key_missing:${route}`,
      row.sourceDraftArtifactKey === draft.draftArtifactKey ? '' : `attorney_packet_source_draft_mismatch:${route}`,
      row.sourceDraftFingerprint === draftReceipt.draftFingerprint ? '' : `attorney_packet_source_fingerprint_mismatch:${route}`,
      normalizeKey(row.packetStatus || row.packet_status) === 'prepared' ? '' : `attorney_packet_route_not_prepared:${route}`,
      normalizeText(row.routeSummary || row.route_summary) ? '' : `attorney_packet_route_summary_missing:${route}`,
      list(row.clauseQuestions || row.clause_questions).length ? '' : `attorney_packet_clause_questions_missing:${route}`,
      list(row.fieldQuestions || row.field_questions).length ? '' : `attorney_packet_field_questions_missing:${route}`,
      list(row.signingQuestions || row.signing_questions).length ? '' : `attorney_packet_signing_questions_missing:${route}`,
      list(row.agentReviewQuestions || row.agent_review_questions).length ? '' : `attorney_packet_agent_review_questions_missing:${route}`,
      list(row.acceptanceCriteria || row.acceptance_criteria).length ? '' : `attorney_packet_acceptance_criteria_missing:${route}`,
      row.routeSeparated === true ? '' : `attorney_packet_route_not_separated:${route}`,
      row.attorneyResponseRequired === true ? '' : `attorney_packet_response_not_required:${route}`,
      row.attorneyApprovalGranted === true ? `attorney_packet_route_premature_approval:${route}` : '',
      hasDocxSource(row) ? `attorney_packet_docx_source_observed:${route}` : '',
      row.productionWriteRequested === true ? `attorney_packet_route_production_write_requested:${route}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `attorney_packet_route_missing:${route}`),
    ...unique(duplicateRoutes).map((route) => `attorney_packet_route_duplicate:${route}`),
    ...rowBlockers,
  ]
}

function instructionBlockers(instructions = []) {
  const keys = list(instructions).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_ATTORNEY_INSTRUCTIONS.filter((key) => !keys.includes(key))
  const badRows = list(instructions).filter((row) =>
    REQUIRED_ATTORNEY_INSTRUCTIONS.includes(normalizeKey(row.key)) &&
      (normalizeKey(row.status) !== 'included' || row.responseRequired !== true || !normalizeText(row.owner) || !normalizeText(row.instructionReference || row.instruction_reference)),
  )
  return [
    ...missingKeys.map((key) => `attorney_instruction_missing:${key}`),
    ...badRows.map((row) => `attorney_instruction_invalid:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function questionRegisterBlockers(register = {}) {
  return [
    normalizeText(register.registerId || register.register_id) ? '' : 'attorney_question_register_id_missing',
    normalizeKey(register.status) === 'open' ? '' : 'attorney_question_register_not_open',
    numberValue(register.routeCount || register.route_count) === REQUIRED_ROUTES.length ? '' : 'attorney_question_register_route_count_mismatch',
    numberValue(register.totalQuestionCount || register.total_question_count) > 0 ? '' : 'attorney_question_register_empty',
    numberValue(register.unresolvedQuestionCount || register.unresolved_question_count) > 0 ? '' : 'attorney_question_register_no_unresolved_questions',
    register.attorneyResponseRequired === true ? '' : 'attorney_question_response_not_required',
    register.attorneyApprovalGranted === true ? 'attorney_question_register_premature_approval' : '',
  ].filter(Boolean)
}

function qaRollbackContextBlockers(context = {}) {
  return [
    context.qaTraceIncluded === true ? '' : 'attorney_packet_qa_trace_missing',
    context.contentScannerMapped === true ? '' : 'attorney_packet_content_scanner_not_mapped',
    context.generatedPdfProofMapped === true ? '' : 'attorney_packet_pdf_proof_not_mapped',
    context.signingEnvelopeAlignmentMapped === true ? '' : 'attorney_packet_signing_alignment_not_mapped',
    context.rollbackTraceIncluded === true ? '' : 'attorney_packet_rollback_trace_missing',
    normalizeText(context.rollbackReference || context.rollback_reference) ? '' : 'attorney_packet_rollback_reference_missing',
    context.stopSigningDispatchTraced === true ? '' : 'attorney_packet_stop_dispatch_not_traced',
    context.noWriteGuardMapped === true ? '' : 'attorney_packet_no_write_guard_not_mapped',
  ].filter(Boolean)
}

function reviewRoutingBlockers(routing = {}) {
  return [
    normalizeText(routing.attorneyRecipientRole || routing.attorney_recipient_role) ? '' : 'attorney_review_recipient_missing',
    normalizeText(routing.templateOwnerRole || routing.template_owner_role) ? '' : 'attorney_review_template_owner_missing',
    normalizeKey(routing.responseDuePolicy || routing.response_due_policy) === 'before_template_update_draft' ? '' : 'attorney_review_due_policy_invalid',
    normalizeKey(routing.deliveryMode || routing.delivery_mode) === 'internal_review_packet' ? '' : 'attorney_review_delivery_mode_invalid',
    routing.emailDispatchRequested === true ? 'attorney_review_email_dispatch_requested' : '',
    routing.signingDispatchRequested === true ? 'attorney_review_signing_dispatch_requested' : '',
    routing.productionWriteRequested === true ? 'attorney_review_production_write_requested' : '',
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
    ...missingKeys.map((key) => `attorney_packet_evidence_missing:${key}`),
    ...badRows.map((row) => `attorney_packet_evidence_invalid:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function noWriteBlockers(noWriteProof = {}) {
  return [
    noWriteProof.packetOnly === true ? '' : 'attorney_packet_no_write_packet_only_missing',
    noWriteProof.productionWriteAttempted === true ? 'attorney_packet_production_write_attempted' : '',
    numberValue(noWriteProof.attorneyApprovalMutationCount || noWriteProof.attorney_approval_mutation_count) === 0 ? '' : 'attorney_packet_approval_mutation_observed',
    numberValue(noWriteProof.legalWordingMutationCount || noWriteProof.legal_wording_mutation_count) === 0 ? '' : 'attorney_packet_legal_wording_mutation_observed',
    numberValue(noWriteProof.templateDefaultMutationCount || noWriteProof.template_default_mutation_count) === 0 ? '' : 'attorney_packet_template_default_mutation_observed',
    numberValue(noWriteProof.signingEnvelopeMutationCount || noWriteProof.signing_envelope_mutation_count) === 0 ? '' : 'attorney_packet_signing_envelope_mutation_observed',
    numberValue(noWriteProof.dispatchMutationCount || noWriteProof.dispatch_mutation_count) === 0 ? '' : 'attorney_packet_dispatch_mutation_observed',
  ].filter(Boolean)
}

export function buildOtpTemplateRenewalAttorneyReviewPacketReceipt({
  draftReceipt = buildOtpTemplateRenewalWorkPackageDraftPhase57Audit().draftReceipts?.find((receipt) => receipt.canPrepareAttorneyReviewPacket),
  packetManifest = null,
  routePackets = null,
  instructionSet = defaultInstructionSet(),
  questionRegister = null,
  qaRollbackContext = null,
  reviewRouting = defaultReviewRouting(),
  evidence = defaultEvidence(),
  noWriteProof = defaultNoWriteProof(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const manifest = packetManifest || defaultPacketManifest(draftReceipt, checkedAt)
  const routes = routePackets || defaultRoutePackets(draftReceipt)
  const register = questionRegister || defaultQuestionRegister(draftReceipt)
  const context = qaRollbackContext || defaultQaRollbackContext(draftReceipt)
  const blockerCodes = unique([
    ...phase57Blockers(draftReceipt || {}),
    ...manifestBlockers(manifest, draftReceipt),
    ...routePacketBlockers(routes, draftReceipt),
    ...instructionBlockers(instructionSet),
    ...questionRegisterBlockers(register),
    ...qaRollbackContextBlockers(context),
    ...reviewRoutingBlockers(reviewRouting),
    ...evidenceBlockers(evidence),
    ...noWriteBlockers(noWriteProof),
  ])
  const canRequestAttorneyResponse = blockerCodes.length === 0
  const packetFingerprint = fingerprint([
    manifest.packetId,
    draftReceipt?.draftFingerprint,
    list(routes).map((row) => `${row.routeVariant}:${row.packetKey}`).join(','),
  ])

  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_PHASE58_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_CONTRACT,
    checkedAt,
    status: canRequestAttorneyResponse
      ? OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_READY_STATUS
      : 'OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_BLOCKED',
    canRequestAttorneyResponse,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    packetFingerprint,
    draftReceipt: Object.freeze({
      version: draftReceipt?.version,
      status: draftReceipt?.status,
      canPrepareAttorneyReviewPacket: draftReceipt?.canPrepareAttorneyReviewPacket === true,
      draftFingerprint: draftReceipt?.draftFingerprint,
    }),
    packetManifest: Object.freeze({ ...manifest }),
    routePackets: Object.freeze(list(routes)),
    instructionSet: Object.freeze(list(instructionSet)),
    questionRegister: Object.freeze({ ...register }),
    qaRollbackContext: Object.freeze({ ...context }),
    reviewRouting: Object.freeze({ ...reviewRouting }),
    evidence: Object.freeze(list(evidence)),
    noWriteProof: Object.freeze({ ...noWriteProof }),
    summary: Object.freeze({
      routeCount: REQUIRED_ROUTES.length,
      routePacketCount: list(routes).length,
      instructionCount: list(instructionSet).length,
      evidenceCount: list(evidence).length,
      blockerCount: blockerCodes.length,
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpTemplateRenewalAttorneyReviewPacketPhase58Audit({
  checkedAt = new Date().toISOString(),
  phase57Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase57Ready = !phase57Audit || phase57Audit.status === OTP_TEMPLATE_RENEWAL_WORK_PACKAGE_DRAFT_READY_STATUS
  const goodDraft = phase57Audit?.draftReceipts?.find((receipt) => receipt.canPrepareAttorneyReviewPacket) ||
    buildOtpTemplateRenewalWorkPackageDraftPhase57Audit({ checkedAt }).draftReceipts.find((receipt) => receipt.canPrepareAttorneyReviewPacket)
  const goodPacket = buildOtpTemplateRenewalAttorneyReviewPacketReceipt({
    checkedAt,
    draftReceipt: goodDraft,
  })
  const fingerprintMismatchPacket = buildOtpTemplateRenewalAttorneyReviewPacketReceipt({
    checkedAt,
    draftReceipt: goodDraft,
    packetManifest: {
      ...defaultPacketManifest(goodDraft, checkedAt),
      draftFingerprint: 'wrong-fingerprint',
    },
  })
  const missingRoutePacket = buildOtpTemplateRenewalAttorneyReviewPacketReceipt({
    checkedAt,
    draftReceipt: goodDraft,
    routePackets: defaultRoutePackets(goodDraft).filter((row) => row.routeVariant !== 'new_development'),
  })
  const incompleteRoutePacket = buildOtpTemplateRenewalAttorneyReviewPacketReceipt({
    checkedAt,
    draftReceipt: goodDraft,
    routePackets: defaultRoutePackets(goodDraft).map((row) =>
      row.routeVariant === 'new_development'
        ? { ...row, clauseQuestions: [], fieldQuestions: [], acceptanceCriteria: [] }
        : row,
    ),
  })
  const docxPacket = buildOtpTemplateRenewalAttorneyReviewPacketReceipt({
    checkedAt,
    draftReceipt: goodDraft,
    routePackets: defaultRoutePackets(goodDraft).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, packetFormat: 'docx', packetPath: 'attorney-review-packet.docx', docxReferenceCount: 1 }
        : row,
    ),
  })
  const prematureApprovalPacket = buildOtpTemplateRenewalAttorneyReviewPacketReceipt({
    checkedAt,
    draftReceipt: goodDraft,
    packetManifest: {
      ...defaultPacketManifest(goodDraft, checkedAt),
      attorneyApprovalGranted: true,
    },
    routePackets: defaultRoutePackets(goodDraft).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, attorneyApprovalGranted: true }
        : row,
    ),
    questionRegister: {
      ...defaultQuestionRegister(goodDraft),
      attorneyApprovalGranted: true,
    },
  })
  const instructionBlockedPacket = buildOtpTemplateRenewalAttorneyReviewPacketReceipt({
    checkedAt,
    draftReceipt: goodDraft,
    instructionSet: [
      { key: 'review_legal_wording', status: 'missing', responseRequired: false, owner: '', instructionReference: '' },
    ],
  })
  const qaContextBlockedPacket = buildOtpTemplateRenewalAttorneyReviewPacketReceipt({
    checkedAt,
    draftReceipt: goodDraft,
    qaRollbackContext: {
      ...defaultQaRollbackContext(goodDraft),
      generatedPdfProofMapped: false,
      signingEnvelopeAlignmentMapped: false,
      stopSigningDispatchTraced: false,
    },
  })
  const routingBlockedPacket = buildOtpTemplateRenewalAttorneyReviewPacketReceipt({
    checkedAt,
    draftReceipt: goodDraft,
    reviewRouting: {
      ...defaultReviewRouting(),
      emailDispatchRequested: true,
      signingDispatchRequested: true,
      productionWriteRequested: true,
    },
  })
  const evidenceBlockedPacket = buildOtpTemplateRenewalAttorneyReviewPacketReceipt({
    checkedAt,
    draftReceipt: goodDraft,
    evidence: [
      { key: 'work_package_trace', status: 'missing', path: '', fingerprint: 'bad' },
    ],
  })
  const productionWritePacket = buildOtpTemplateRenewalAttorneyReviewPacketReceipt({
    checkedAt,
    draftReceipt: goodDraft,
    noWriteProof: {
      ...defaultNoWriteProof(),
      productionWriteAttempted: true,
      attorneyApprovalMutationCount: 1,
      legalWordingMutationCount: 1,
    },
  })

  addCheck(checks, phase57Ready, 'PHASE58_PHASE57_DRAFT_READY', 'Attorney review packet preparation starts only after Phase 57 draft packaging is ready.')
  addCheck(
    checks,
    goodPacket.canRequestAttorneyResponse &&
      goodPacket.status === OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_READY_STATUS &&
      goodPacket.mutatedData === false,
    'PHASE58_GOOD_ATTORNEY_PACKET_READY',
    'A clean draft package can become an attorney review packet without mutating production data.',
  )
  addCheck(
    checks,
    goodPacket.packetManifest.draftFingerprint === goodDraft.draftFingerprint,
    'PHASE58_PACKET_BOUND_TO_DRAFT',
    'Attorney packet is bound to the exact Phase 57 draft fingerprint.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodPacket.routePackets.some((row) => row.routeVariant === route && row.packetStatus === 'prepared')),
    'PHASE58_BOTH_ROUTE_PACKETS_PREPARED',
    'Resale and new-development attorney packets are both prepared.',
  )
  addCheck(
    checks,
    REQUIRED_PACKET_SECTIONS.every((section) =>
      goodPacket.routePackets.every((row) => normalizeText(row[section.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] || row[section]) || list(row[section.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] || row[section]).length > 0),
    ),
    'PHASE58_REQUIRED_PACKET_SECTIONS_PRESENT',
    'Each route packet contains route summary, questions, and acceptance criteria.',
  )
  addCheck(
    checks,
    REQUIRED_ATTORNEY_INSTRUCTIONS.every((key) => goodPacket.instructionSet.some((row) => row.key === key && row.status === 'included' && row.responseRequired === true)),
    'PHASE58_ATTORNEY_INSTRUCTIONS_INCLUDED',
    'Attorney instruction set covers wording, route differences, buyer costs, suspensive conditions, and signatures/witnesses.',
  )
  addCheck(
    checks,
    goodPacket.questionRegister.status === 'open' &&
      goodPacket.questionRegister.attorneyResponseRequired === true &&
      goodPacket.questionRegister.attorneyApprovalGranted === false,
    'PHASE58_QUESTION_REGISTER_OPEN_NOT_APPROVED',
    'Question register is open for attorney response and not legally approved.',
  )
  addCheck(
    checks,
    goodPacket.noWriteProof.packetOnly === true &&
      goodPacket.noWriteProof.productionWriteAttempted === false &&
      goodPacket.noWriteProof.attorneyApprovalMutationCount === 0,
    'PHASE58_NO_PRODUCTION_WRITE_ALLOWED',
    'Phase 58 prepares attorney review packets only and cannot approve, mutate wording, alter defaults, envelopes, or dispatch state.',
  )
  addCheck(
    checks,
    fingerprintMismatchPacket.canRequestAttorneyResponse === false &&
      fingerprintMismatchPacket.blockerCodes.includes('attorney_packet_draft_fingerprint_mismatch'),
    'PHASE58_DRAFT_FINGERPRINT_MISMATCH_BLOCKED',
    'Attorney packet manifest must match the Phase 57 draft fingerprint.',
  )
  addCheck(
    checks,
    missingRoutePacket.canRequestAttorneyResponse === false &&
      missingRoutePacket.blockerCodes.includes('attorney_packet_route_missing:new_development'),
    'PHASE58_MISSING_ROUTE_PACKET_BLOCKED',
    'Missing resale or new-development attorney packet blocks attorney response request.',
  )
  addCheck(
    checks,
    incompleteRoutePacket.canRequestAttorneyResponse === false &&
      incompleteRoutePacket.blockerCodes.includes('attorney_packet_clause_questions_missing:new_development') &&
      incompleteRoutePacket.blockerCodes.includes('attorney_packet_field_questions_missing:new_development'),
    'PHASE58_INCOMPLETE_ROUTE_PACKET_BLOCKED',
    'Route packets without clause, field, or acceptance content are blocked.',
  )
  addCheck(
    checks,
    docxPacket.canRequestAttorneyResponse === false &&
      docxPacket.blockerCodes.includes('attorney_packet_docx_source_observed:resale_existing_property'),
    'PHASE58_DOCX_SOURCE_BLOCKED',
    'DOC/DOCX attorney packet artifacts remain blocked.',
  )
  addCheck(
    checks,
    prematureApprovalPacket.canRequestAttorneyResponse === false &&
      prematureApprovalPacket.blockerCodes.includes('attorney_packet_premature_approval') &&
      prematureApprovalPacket.blockerCodes.includes('attorney_packet_route_premature_approval:resale_existing_property'),
    'PHASE58_PREMATURE_APPROVAL_BLOCKED',
    'Attorney approval cannot be granted during packet preparation.',
  )
  addCheck(
    checks,
    instructionBlockedPacket.canRequestAttorneyResponse === false &&
      instructionBlockedPacket.blockerCodes.includes('attorney_instruction_missing:confirm_route_specific_differences') &&
      instructionBlockedPacket.blockerCodes.includes('attorney_instruction_invalid:review_legal_wording'),
    'PHASE58_INSTRUCTION_SET_BLOCKED',
    'Missing or invalid attorney instructions block packet preparation.',
  )
  addCheck(
    checks,
    qaContextBlockedPacket.canRequestAttorneyResponse === false &&
      qaContextBlockedPacket.blockerCodes.includes('attorney_packet_pdf_proof_not_mapped') &&
      qaContextBlockedPacket.blockerCodes.includes('attorney_packet_stop_dispatch_not_traced'),
    'PHASE58_QA_ROLLBACK_CONTEXT_BLOCKED',
    'QA and rollback context must be included in the attorney packet.',
  )
  addCheck(
    checks,
    routingBlockedPacket.canRequestAttorneyResponse === false &&
      routingBlockedPacket.blockerCodes.includes('attorney_review_email_dispatch_requested') &&
      routingBlockedPacket.blockerCodes.includes('attorney_review_signing_dispatch_requested'),
    'PHASE58_DISPATCH_BLOCKED',
    'Attorney packet preparation cannot email, dispatch signing, or request production writes.',
  )
  addCheck(
    checks,
    evidenceBlockedPacket.canRequestAttorneyResponse === false &&
      evidenceBlockedPacket.blockerCodes.includes('attorney_packet_evidence_missing:route_packet_bundle') &&
      evidenceBlockedPacket.blockerCodes.includes('attorney_packet_evidence_invalid:work_package_trace'),
    'PHASE58_EVIDENCE_BLOCKED',
    'Missing or invalid attorney packet evidence blocks attorney response request.',
  )
  addCheck(
    checks,
    productionWritePacket.canRequestAttorneyResponse === false &&
      productionWritePacket.blockerCodes.includes('attorney_packet_production_write_attempted') &&
      productionWritePacket.blockerCodes.includes('attorney_packet_approval_mutation_observed'),
    'PHASE58_PRODUCTION_WRITE_BLOCKED',
    'Production writes or approval/legal wording mutations block attorney packet preparation.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-template-renewal-attorney-review-packet-phase58'] === 'node scripts/otp-template-renewal-attorney-review-packet-phase58.test.mjs' &&
      packageJson.scripts?.['report:otp-template-renewal-attorney-review-packet-phase58'] === 'node scripts/report-otp-template-renewal-attorney-review-packet-phase58.mjs' &&
      packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-attorney-review-packet-phase58'),
    'PHASE58_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 58 test, report, and vNext verification chain entry.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_PHASE58_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_REMEDIATION_REQUIRED' : OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    attorneyPacketReceipts: Object.freeze([
      goodPacket,
      fingerprintMismatchPacket,
      missingRoutePacket,
      incompleteRoutePacket,
      docxPacket,
      prematureApprovalPacket,
      instructionBlockedPacket,
      qaContextBlockedPacket,
      routingBlockedPacket,
      evidenceBlockedPacket,
      productionWritePacket,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      readyPacketCount: [goodPacket].filter((row) => row.canRequestAttorneyResponse).length,
      blockedPacketCount: [
        fingerprintMismatchPacket,
        missingRoutePacket,
        incompleteRoutePacket,
        docxPacket,
        prematureApprovalPacket,
        instructionBlockedPacket,
        qaContextBlockedPacket,
        routingBlockedPacket,
        evidenceBlockedPacket,
        productionWritePacket,
      ].filter((row) => !row.canRequestAttorneyResponse).length,
      routeCount: REQUIRED_ROUTES.length,
      instructionCount: REQUIRED_ATTORNEY_INSTRUCTIONS.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 59,
      key: 'otp_template_renewal_attorney_response_required_changes',
      label: 'Attorney Review Response And Required Changes',
    }),
  })
}

export function formatOtpTemplateRenewalAttorneyReviewPacketPhase58Markdown(report = buildOtpTemplateRenewalAttorneyReviewPacketPhase58Audit()) {
  const readyReceipt = report.attorneyPacketReceipts.find((receipt) => receipt.canRequestAttorneyResponse) || report.attorneyPacketReceipts[0]
  return [
    '# OTP Generator Phase 58 Template Renewal Attorney Review Packet',
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
        ['Ready packets', report.summary.readyPacketCount],
        ['Blocked packets', report.summary.blockedPacketCount],
        ['Routes', report.summary.routeCount],
        ['Instructions', report.summary.instructionCount],
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
    '## Packet Manifest',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Packet ID', readyReceipt.packetManifest.packetId],
        ['Draft fingerprint', readyReceipt.packetManifest.draftFingerprint],
        ['Packet fingerprint', readyReceipt.packetFingerprint],
        ['Route separation', readyReceipt.packetManifest.routeSeparationMode],
        ['Packet mode', readyReceipt.packetManifest.packetMode],
        ['Attorney coordinator', readyReceipt.packetManifest.attorneyCoordinator],
      ],
    ),
    '',
    '## Route Packets',
    '',
    table(
      ['Route', 'Packet', 'Clauses', 'Fields', 'Signing', 'Agent Review'],
      readyReceipt.routePackets.map((route) => [
        route.routeVariant,
        route.packetKey,
        route.clauseQuestions.map((item) => item.key).join(', '),
        route.fieldQuestions.map((item) => item.key).join(', '),
        route.signingQuestions.map((item) => item.key).join(', '),
        route.agentReviewQuestions.map((item) => item.key).join(', '),
      ]),
    ),
    '',
    '## Attorney Instructions',
    '',
    table(
      ['Instruction', 'Status', 'Response Required'],
      readyReceipt.instructionSet.map((item) => [
        item.key,
        item.status,
        item.responseRequired ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Question Register',
    '',
    table(
      ['Field', 'Value'],
      [
        ['register_id', readyReceipt.questionRegister.registerId],
        ['status', readyReceipt.questionRegister.status],
        ['total_questions', readyReceipt.questionRegister.totalQuestionCount],
        ['unresolved_questions', readyReceipt.questionRegister.unresolvedQuestionCount],
        ['approval_granted', readyReceipt.questionRegister.attorneyApprovalGranted ? 'yes' : 'no'],
      ],
    ),
    '',
    '## Attorney Packet Receipts',
    '',
    table(
      ['Status', 'Ready', 'Routes', 'Instructions', 'Evidence', 'Blockers'],
      report.attorneyPacketReceipts.map((receipt) => [
        receipt.status,
        receipt.canRequestAttorneyResponse ? 'yes' : 'no',
        receipt.summary.routePacketCount,
        receipt.summary.instructionCount,
        receipt.summary.evidenceCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 58 prepares a route-separated attorney review packet and question register from the Phase 57 work-package drafts. It requests attorney response readiness only. It does not record attorney approval, mutate legal wording, publish templates, change route defaults, alter signing envelopes, email reviewers, or dispatch signing links.',
    '',
  ].join('\n')
}
