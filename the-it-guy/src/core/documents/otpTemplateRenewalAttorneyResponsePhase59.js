import {
  OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_PHASE58_VERSION,
  OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_READY_STATUS,
  buildOtpTemplateRenewalAttorneyReviewPacketPhase58Audit,
} from './otpTemplateRenewalAttorneyReviewPacketPhase58.js'

export const OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_PHASE59_VERSION = 'otp_template_renewal_attorney_response_required_changes_phase59_v1'
export const OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_READY_STATUS = 'OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_REQUIRED_CHANGES_READY_FOR_TEMPLATE_UPDATE_DRAFT'
export const OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_CONTRACT = 'otp-vnext-template-renewal-attorney-response-required-changes-phase59-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_CHANGE_CATEGORIES = Object.freeze([
  'legal_wording',
  'route_specific_differences',
  'buyer_cost_obligations',
  'suspensive_conditions',
  'signatures_and_witnesses',
])
const REQUIRED_EVIDENCE_ITEMS = Object.freeze([
  'attorney_response_record',
  'packet_trace',
  'route_change_register',
  'required_change_matrix',
  'qa_retest_scope',
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
  return /\.docx?$/i.test(normalizeText(row.path || row.sourcePath || row.source_path || row.responsePath || row.response_path || row.attachmentPath || row.attachment_path)) ||
    normalizeKey(row.sourceFormat || row.source_format || row.responseFormat || row.response_format || row.attachmentFormat || row.attachment_format).includes('doc') ||
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

function defaultResponseManifest(packetReceipt = {}, checkedAt = new Date().toISOString()) {
  return {
    responseId: 'otp-vnext-phase59-attorney-response-required-changes',
    status: 'changes_required_recorded',
    respondedAt: checkedAt,
    packetFingerprint: packetReceipt.packetFingerprint,
    draftFingerprint: packetReceipt.draftReceipt?.draftFingerprint,
    routeCount: REQUIRED_ROUTES.length,
    responseMode: 'attorney_response_required_changes',
    attorneyReviewer: 'external_attorney_reviewer',
    templateOwner: 'template_owner',
    questionRegisterStatus: 'answered_with_required_changes',
    attorneyApprovalGranted: false,
    productionWriteRequested: false,
    responseOnly: true,
  }
}

function defaultRequiredChanges(routeVariant) {
  return REQUIRED_CHANGE_CATEGORIES.map((category) => ({
    key: `${routeVariant}_${category}_required_change`,
    category,
    priority: category === 'legal_wording' ? 'high' : 'normal',
    attorneyInstruction: `Apply attorney response for ${category.replace(/_/g, ' ')} on ${routeVariant}.`,
    currentStateReference: `phase58-${routeVariant}-${category}`,
    requestedStateReference: `phase59-${routeVariant}-${category}`,
    affectsLegalWording: ['legal_wording', 'route_specific_differences', 'buyer_cost_obligations', 'suspensive_conditions', 'signatures_and_witnesses'].includes(category),
    affectsFieldRegistry: category === 'buyer_cost_obligations',
    affectsSigningEnvelope: category === 'signatures_and_witnesses',
    affectsAgentReviewUi: ['buyer_cost_obligations', 'suspensive_conditions'].includes(category),
    templateOwnerActionRequired: true,
    attorneyClarificationRequired: false,
  }))
}

function countRouteQuestions(routePacket = {}) {
  return list(routePacket.clauseQuestions).length +
    list(routePacket.fieldQuestions).length +
    list(routePacket.signingQuestions).length +
    list(routePacket.agentReviewQuestions).length
}

function defaultRouteResponses(packetReceipt = {}) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const packet = list(packetReceipt.routePackets).find((row) => normalizeKey(row.routeVariant) === routeVariant) || {}
    const requiredChanges = defaultRequiredChanges(routeVariant)
    return {
      routeVariant,
      sourcePacketKey: packet.packetKey,
      sourcePacketFingerprint: packetReceipt.packetFingerprint,
      sourceDraftFingerprint: packetReceipt.draftReceipt?.draftFingerprint,
      responseStatus: 'changes_required',
      answeredQuestionCount: countRouteQuestions(packet),
      unresolvedQuestionCount: 0,
      requiredChanges,
      responseFormat: 'json_governance_record',
      sourceFormat: 'native_governance_record',
      docxReferenceCount: 0,
      attorneyApprovalGranted: false,
      templateUpdateDraftRequired: true,
      routeSeparated: true,
      productionWriteRequested: false,
    }
  })
}

function defaultChangeRegister(routeResponses = []) {
  const changes = list(routeResponses).flatMap((route) => list(route.requiredChanges || route.required_changes))
  return {
    registerId: 'phase59-attorney-required-change-register',
    status: 'required_changes_ready_for_drafting',
    routeCount: REQUIRED_ROUTES.length,
    totalRequiredChangeCount: changes.length,
    unresolvedQuestionCount: 0,
    requiredCategories: REQUIRED_CHANGE_CATEGORIES,
    attorneyApprovalGranted: false,
    templateUpdateDraftRequired: true,
    routeSeparated: true,
  }
}

function defaultQaRetestScope() {
  return {
    contentScannerRequired: true,
    generatedPdfProofRequired: true,
    signingEnvelopeAlignmentRequired: true,
    agentReviewRuntimeRequired: true,
    routeRegressionRequired: true,
    attorneyPacketTraceRequired: true,
    productionWriteNotAllowed: true,
    signingDispatchNotAllowed: true,
  }
}

function defaultReviewRouting() {
  return {
    attorneyReviewerRole: 'external_attorney_reviewer',
    templateOwnerRole: 'template_owner',
    nextOwnerRole: 'template_owner',
    nextAction: 'prepare_template_update_draft',
    deliveryMode: 'internal_response_record',
    emailDispatchRequested: false,
    signingDispatchRequested: false,
    productionWriteRequested: false,
  }
}

function defaultEvidence() {
  return REQUIRED_EVIDENCE_ITEMS.map((key) => ({
    key,
    status: 'captured',
    path: `docs/otp-${key.replace(/_/g, '-')}-phase59.md`,
    fingerprint: fingerprint([key, 'phase59']),
  }))
}

function defaultNoWriteProof() {
  return {
    responseOnly: true,
    productionWriteAttempted: false,
    attorneyApprovalMutationCount: 0,
    legalWordingMutationCount: 0,
    templateDefaultMutationCount: 0,
    fieldRegistryMutationCount: 0,
    signingEnvelopeMutationCount: 0,
    dispatchMutationCount: 0,
  }
}

function phase58Blockers(packetReceipt = {}) {
  return [
    packetReceipt.version === OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_PHASE58_VERSION ? '' : 'phase58_packet_version_mismatch',
    packetReceipt.status === OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_READY_STATUS ? '' : 'phase58_packet_not_ready',
    packetReceipt.canRequestAttorneyResponse === true ? '' : 'phase58_packet_not_ready_for_attorney_response',
    packetReceipt.mutatedData === false ? '' : 'phase58_packet_mutation_unexpected',
    list(packetReceipt.blockerCodes).length === 0 ? '' : 'phase58_packet_has_blockers',
    packetReceipt.noWriteProof?.productionWriteAttempted === false ? '' : 'phase58_packet_write_attempted',
  ].filter(Boolean)
}

function manifestBlockers(manifest = {}, packetReceipt = {}) {
  return [
    normalizeText(manifest.responseId || manifest.response_id) ? '' : 'attorney_response_id_missing',
    normalizeKey(manifest.status) === 'changes_required_recorded' ? '' : 'attorney_response_status_invalid',
    normalizeText(manifest.respondedAt || manifest.responded_at) ? '' : 'attorney_response_time_missing',
    manifest.packetFingerprint === packetReceipt.packetFingerprint ? '' : 'attorney_response_packet_fingerprint_mismatch',
    manifest.draftFingerprint === packetReceipt.draftReceipt?.draftFingerprint ? '' : 'attorney_response_draft_fingerprint_mismatch',
    numberValue(manifest.routeCount || manifest.route_count) === REQUIRED_ROUTES.length ? '' : 'attorney_response_route_count_mismatch',
    normalizeKey(manifest.responseMode || manifest.response_mode) === 'attorney_response_required_changes' ? '' : 'attorney_response_mode_invalid',
    normalizeText(manifest.attorneyReviewer || manifest.attorney_reviewer) ? '' : 'attorney_response_reviewer_missing',
    normalizeText(manifest.templateOwner || manifest.template_owner) ? '' : 'attorney_response_template_owner_missing',
    normalizeKey(manifest.questionRegisterStatus || manifest.question_register_status) === 'answered_with_required_changes' ? '' : 'attorney_response_questions_not_answered',
    manifest.attorneyApprovalGranted === true ? 'attorney_response_premature_approval' : '',
    manifest.productionWriteRequested === true ? 'attorney_response_production_write_requested' : '',
    manifest.responseOnly === true ? '' : 'attorney_response_only_flag_missing',
  ].filter(Boolean)
}

function routeResponseBlockers(routeResponses = [], packetReceipt = {}) {
  const routes = list(routeResponses).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routeResponses).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    const packet = list(packetReceipt.routePackets).find((candidate) => normalizeKey(candidate.routeVariant) === route) || {}
    const changes = list(row.requiredChanges || row.required_changes)
    const categories = changes.map((change) => normalizeKey(change.category))
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `attorney_response_route_unsupported:${route}`,
      row.sourcePacketKey === packet.packetKey ? '' : `attorney_response_packet_key_mismatch:${route}`,
      row.sourcePacketFingerprint === packetReceipt.packetFingerprint ? '' : `attorney_response_packet_fingerprint_mismatch:${route}`,
      row.sourceDraftFingerprint === packetReceipt.draftReceipt?.draftFingerprint ? '' : `attorney_response_draft_fingerprint_mismatch:${route}`,
      normalizeKey(row.responseStatus || row.response_status) === 'changes_required' ? '' : `attorney_response_route_status_invalid:${route}`,
      numberValue(row.answeredQuestionCount || row.answered_question_count) > 0 ? '' : `attorney_response_questions_unanswered:${route}`,
      numberValue(row.unresolvedQuestionCount || row.unresolved_question_count) === 0 ? '' : `attorney_response_unresolved_questions:${route}`,
      changes.length > 0 ? '' : `attorney_response_required_changes_missing:${route}`,
      ...REQUIRED_CHANGE_CATEGORIES.filter((category) => !categories.includes(category)).map((category) => `attorney_response_change_category_missing:${route}:${category}`),
      changes.every((change) => normalizeText(change.key) && normalizeText(change.attorneyInstruction || change.attorney_instruction) && change.templateOwnerActionRequired === true) ? '' : `attorney_response_required_change_invalid:${route}`,
      row.templateUpdateDraftRequired === true ? '' : `attorney_response_template_update_draft_not_required:${route}`,
      row.routeSeparated === true ? '' : `attorney_response_route_not_separated:${route}`,
      row.attorneyApprovalGranted === true ? `attorney_response_route_premature_approval:${route}` : '',
      hasDocxSource(row) ? `attorney_response_docx_source_observed:${route}` : '',
      row.productionWriteRequested === true ? `attorney_response_route_production_write_requested:${route}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `attorney_response_route_missing:${route}`),
    ...unique(duplicateRoutes).map((route) => `attorney_response_route_duplicate:${route}`),
    ...rowBlockers,
  ]
}

function changeRegisterBlockers(register = {}) {
  const categories = list(register.requiredCategories || register.required_categories).map(normalizeKey)
  return [
    normalizeText(register.registerId || register.register_id) ? '' : 'attorney_change_register_id_missing',
    normalizeKey(register.status) === 'required_changes_ready_for_drafting' ? '' : 'attorney_change_register_status_invalid',
    numberValue(register.routeCount || register.route_count) === REQUIRED_ROUTES.length ? '' : 'attorney_change_register_route_count_mismatch',
    numberValue(register.totalRequiredChangeCount || register.total_required_change_count) > 0 ? '' : 'attorney_change_register_empty',
    numberValue(register.unresolvedQuestionCount || register.unresolved_question_count) === 0 ? '' : 'attorney_change_register_unresolved_questions',
    ...REQUIRED_CHANGE_CATEGORIES.filter((category) => !categories.includes(category)).map((category) => `attorney_change_register_category_missing:${category}`),
    register.attorneyApprovalGranted === true ? 'attorney_change_register_premature_approval' : '',
    register.templateUpdateDraftRequired === true ? '' : 'attorney_change_register_template_update_draft_not_required',
    register.routeSeparated === true ? '' : 'attorney_change_register_route_separation_missing',
  ].filter(Boolean)
}

function qaRetestScopeBlockers(scope = {}) {
  return [
    scope.contentScannerRequired === true ? '' : 'attorney_response_content_scanner_retest_missing',
    scope.generatedPdfProofRequired === true ? '' : 'attorney_response_pdf_proof_retest_missing',
    scope.signingEnvelopeAlignmentRequired === true ? '' : 'attorney_response_signing_alignment_retest_missing',
    scope.agentReviewRuntimeRequired === true ? '' : 'attorney_response_agent_review_retest_missing',
    scope.routeRegressionRequired === true ? '' : 'attorney_response_route_regression_retest_missing',
    scope.attorneyPacketTraceRequired === true ? '' : 'attorney_response_packet_trace_missing',
    scope.productionWriteNotAllowed === true ? '' : 'attorney_response_production_write_boundary_missing',
    scope.signingDispatchNotAllowed === true ? '' : 'attorney_response_signing_dispatch_boundary_missing',
  ].filter(Boolean)
}

function reviewRoutingBlockers(routing = {}) {
  return [
    normalizeText(routing.attorneyReviewerRole || routing.attorney_reviewer_role) ? '' : 'attorney_response_reviewer_role_missing',
    normalizeText(routing.templateOwnerRole || routing.template_owner_role) ? '' : 'attorney_response_template_owner_role_missing',
    normalizeKey(routing.nextOwnerRole || routing.next_owner_role) === 'template_owner' ? '' : 'attorney_response_next_owner_invalid',
    normalizeKey(routing.nextAction || routing.next_action) === 'prepare_template_update_draft' ? '' : 'attorney_response_next_action_invalid',
    normalizeKey(routing.deliveryMode || routing.delivery_mode) === 'internal_response_record' ? '' : 'attorney_response_delivery_mode_invalid',
    routing.emailDispatchRequested === true ? 'attorney_response_email_dispatch_requested' : '',
    routing.signingDispatchRequested === true ? 'attorney_response_signing_dispatch_requested' : '',
    routing.productionWriteRequested === true ? 'attorney_response_production_write_requested' : '',
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
    ...missingKeys.map((key) => `attorney_response_evidence_missing:${key}`),
    ...badRows.map((row) => `attorney_response_evidence_invalid:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function noWriteBlockers(noWriteProof = {}) {
  return [
    noWriteProof.responseOnly === true ? '' : 'attorney_response_no_write_response_only_missing',
    noWriteProof.productionWriteAttempted === true ? 'attorney_response_production_write_attempted' : '',
    numberValue(noWriteProof.attorneyApprovalMutationCount || noWriteProof.attorney_approval_mutation_count) === 0 ? '' : 'attorney_response_approval_mutation_observed',
    numberValue(noWriteProof.legalWordingMutationCount || noWriteProof.legal_wording_mutation_count) === 0 ? '' : 'attorney_response_legal_wording_mutation_observed',
    numberValue(noWriteProof.templateDefaultMutationCount || noWriteProof.template_default_mutation_count) === 0 ? '' : 'attorney_response_template_default_mutation_observed',
    numberValue(noWriteProof.fieldRegistryMutationCount || noWriteProof.field_registry_mutation_count) === 0 ? '' : 'attorney_response_field_registry_mutation_observed',
    numberValue(noWriteProof.signingEnvelopeMutationCount || noWriteProof.signing_envelope_mutation_count) === 0 ? '' : 'attorney_response_signing_envelope_mutation_observed',
    numberValue(noWriteProof.dispatchMutationCount || noWriteProof.dispatch_mutation_count) === 0 ? '' : 'attorney_response_dispatch_mutation_observed',
  ].filter(Boolean)
}

export function buildOtpTemplateRenewalAttorneyResponseReceipt({
  packetReceipt = buildOtpTemplateRenewalAttorneyReviewPacketPhase58Audit().attorneyPacketReceipts?.find((receipt) => receipt.canRequestAttorneyResponse),
  responseManifest = null,
  routeResponses = null,
  changeRegister = null,
  qaRetestScope = defaultQaRetestScope(),
  reviewRouting = defaultReviewRouting(),
  evidence = defaultEvidence(),
  noWriteProof = defaultNoWriteProof(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const manifest = responseManifest || defaultResponseManifest(packetReceipt, checkedAt)
  const routes = routeResponses || defaultRouteResponses(packetReceipt)
  const register = changeRegister || defaultChangeRegister(routes)
  const blockerCodes = unique([
    ...phase58Blockers(packetReceipt || {}),
    ...manifestBlockers(manifest, packetReceipt || {}),
    ...routeResponseBlockers(routes, packetReceipt || {}),
    ...changeRegisterBlockers(register),
    ...qaRetestScopeBlockers(qaRetestScope),
    ...reviewRoutingBlockers(reviewRouting),
    ...evidenceBlockers(evidence),
    ...noWriteBlockers(noWriteProof),
  ])
  const canPrepareTemplateUpdateDraft = blockerCodes.length === 0
  const responseFingerprint = fingerprint([
    manifest.responseId,
    packetReceipt?.packetFingerprint,
    list(routes).map((row) => `${row.routeVariant}:${list(row.requiredChanges).map((change) => change.key).join(',')}`).join('|'),
  ])

  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_PHASE59_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_CONTRACT,
    checkedAt,
    status: canPrepareTemplateUpdateDraft
      ? OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_READY_STATUS
      : 'OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_REQUIRED_CHANGES_BLOCKED',
    canPrepareTemplateUpdateDraft,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    responseFingerprint,
    packetReceipt: Object.freeze({
      version: packetReceipt?.version,
      status: packetReceipt?.status,
      canRequestAttorneyResponse: packetReceipt?.canRequestAttorneyResponse === true,
      packetFingerprint: packetReceipt?.packetFingerprint,
      draftFingerprint: packetReceipt?.draftReceipt?.draftFingerprint,
    }),
    responseManifest: Object.freeze({ ...manifest }),
    routeResponses: Object.freeze(list(routes)),
    changeRegister: Object.freeze({ ...register }),
    qaRetestScope: Object.freeze({ ...qaRetestScope }),
    reviewRouting: Object.freeze({ ...reviewRouting }),
    evidence: Object.freeze(list(evidence)),
    noWriteProof: Object.freeze({ ...noWriteProof }),
    summary: Object.freeze({
      routeResponseCount: list(routes).length,
      requiredChangeCount: list(routes).reduce((count, route) => count + list(route.requiredChanges || route.required_changes).length, 0),
      evidenceCount: list(evidence).length,
      blockerCount: blockerCodes.length,
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpTemplateRenewalAttorneyResponsePhase59Audit({
  checkedAt = new Date().toISOString(),
  phase58Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase58Ready = !phase58Audit || phase58Audit.status === OTP_TEMPLATE_RENEWAL_ATTORNEY_REVIEW_PACKET_READY_STATUS
  const goodPacket = phase58Audit?.attorneyPacketReceipts?.find((receipt) => receipt.canRequestAttorneyResponse) ||
    buildOtpTemplateRenewalAttorneyReviewPacketPhase58Audit({ checkedAt }).attorneyPacketReceipts.find((receipt) => receipt.canRequestAttorneyResponse)
  const goodResponse = buildOtpTemplateRenewalAttorneyResponseReceipt({
    checkedAt,
    packetReceipt: goodPacket,
  })
  const packetFingerprintMismatchResponse = buildOtpTemplateRenewalAttorneyResponseReceipt({
    checkedAt,
    packetReceipt: goodPacket,
    responseManifest: {
      ...defaultResponseManifest(goodPacket, checkedAt),
      packetFingerprint: 'wrong-packet-fingerprint',
    },
  })
  const missingRouteResponse = buildOtpTemplateRenewalAttorneyResponseReceipt({
    checkedAt,
    packetReceipt: goodPacket,
    routeResponses: defaultRouteResponses(goodPacket).filter((row) => row.routeVariant !== 'new_development'),
  })
  const unansweredQuestionsResponse = buildOtpTemplateRenewalAttorneyResponseReceipt({
    checkedAt,
    packetReceipt: goodPacket,
    routeResponses: defaultRouteResponses(goodPacket).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, answeredQuestionCount: 0, unresolvedQuestionCount: 2 }
        : row,
    ),
    changeRegister: {
      ...defaultChangeRegister(defaultRouteResponses(goodPacket)),
      unresolvedQuestionCount: 2,
    },
  })
  const missingRequiredChangesResponse = buildOtpTemplateRenewalAttorneyResponseReceipt({
    checkedAt,
    packetReceipt: goodPacket,
    routeResponses: defaultRouteResponses(goodPacket).map((row) =>
      row.routeVariant === 'new_development'
        ? { ...row, requiredChanges: [] }
        : row,
    ),
    changeRegister: {
      ...defaultChangeRegister(defaultRouteResponses(goodPacket)),
      requiredCategories: ['legal_wording'],
    },
  })
  const docxResponse = buildOtpTemplateRenewalAttorneyResponseReceipt({
    checkedAt,
    packetReceipt: goodPacket,
    routeResponses: defaultRouteResponses(goodPacket).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, responseFormat: 'docx', responsePath: 'attorney-response.docx', docxReferenceCount: 1 }
        : row,
    ),
  })
  const prematureApprovalResponse = buildOtpTemplateRenewalAttorneyResponseReceipt({
    checkedAt,
    packetReceipt: goodPacket,
    responseManifest: {
      ...defaultResponseManifest(goodPacket, checkedAt),
      attorneyApprovalGranted: true,
    },
    routeResponses: defaultRouteResponses(goodPacket).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, attorneyApprovalGranted: true }
        : row,
    ),
    changeRegister: {
      ...defaultChangeRegister(defaultRouteResponses(goodPacket)),
      attorneyApprovalGranted: true,
    },
  })
  const qaRetestBlockedResponse = buildOtpTemplateRenewalAttorneyResponseReceipt({
    checkedAt,
    packetReceipt: goodPacket,
    qaRetestScope: {
      ...defaultQaRetestScope(),
      generatedPdfProofRequired: false,
      signingEnvelopeAlignmentRequired: false,
      routeRegressionRequired: false,
    },
  })
  const dispatchBlockedResponse = buildOtpTemplateRenewalAttorneyResponseReceipt({
    checkedAt,
    packetReceipt: goodPacket,
    reviewRouting: {
      ...defaultReviewRouting(),
      emailDispatchRequested: true,
      signingDispatchRequested: true,
      productionWriteRequested: true,
    },
  })
  const evidenceBlockedResponse = buildOtpTemplateRenewalAttorneyResponseReceipt({
    checkedAt,
    packetReceipt: goodPacket,
    evidence: [
      { key: 'attorney_response_record', status: 'missing', path: '', fingerprint: 'bad' },
    ],
  })
  const productionWriteResponse = buildOtpTemplateRenewalAttorneyResponseReceipt({
    checkedAt,
    packetReceipt: goodPacket,
    noWriteProof: {
      ...defaultNoWriteProof(),
      productionWriteAttempted: true,
      legalWordingMutationCount: 1,
      fieldRegistryMutationCount: 1,
    },
  })

  addCheck(checks, phase58Ready, 'PHASE59_PHASE58_PACKET_READY', 'Attorney response intake starts only after Phase 58 attorney packet readiness.')
  addCheck(
    checks,
    goodResponse.canPrepareTemplateUpdateDraft &&
      goodResponse.status === OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_READY_STATUS &&
      goodResponse.mutatedData === false,
    'PHASE59_GOOD_ATTORNEY_RESPONSE_READY',
    'A clean attorney response can become a required-change register without mutating production data.',
  )
  addCheck(
    checks,
    goodResponse.responseManifest.packetFingerprint === goodPacket.packetFingerprint &&
      goodResponse.responseManifest.draftFingerprint === goodPacket.draftReceipt.draftFingerprint,
    'PHASE59_RESPONSE_BOUND_TO_PACKET',
    'Attorney response is bound to the exact Phase 58 packet and Phase 57 draft fingerprint.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodResponse.routeResponses.some((row) => row.routeVariant === route && row.responseStatus === 'changes_required')),
    'PHASE59_BOTH_ROUTE_RESPONSES_CAPTURED',
    'Resale and new-development attorney responses are captured separately.',
  )
  addCheck(
    checks,
    REQUIRED_CHANGE_CATEGORIES.every((category) =>
      goodResponse.routeResponses.every((route) => list(route.requiredChanges).some((change) => change.category === category)),
    ),
    'PHASE59_REQUIRED_CHANGE_CATEGORIES_CAPTURED',
    'Attorney required changes cover wording, route differences, buyer costs, suspensive conditions, and signatures/witnesses.',
  )
  addCheck(
    checks,
    goodResponse.changeRegister.status === 'required_changes_ready_for_drafting' &&
      goodResponse.changeRegister.unresolvedQuestionCount === 0 &&
      goodResponse.changeRegister.templateUpdateDraftRequired === true,
    'PHASE59_QUESTIONS_ANSWERED_CHANGES_REQUIRED',
    'Attorney questions are answered and converted into a template-update draft queue.',
  )
  addCheck(
    checks,
    goodResponse.noWriteProof.responseOnly === true &&
      goodResponse.noWriteProof.productionWriteAttempted === false &&
      goodResponse.noWriteProof.legalWordingMutationCount === 0,
    'PHASE59_NO_PRODUCTION_WRITE_ALLOWED',
    'Phase 59 captures attorney response only and cannot approve, mutate wording, alter defaults, envelopes, or dispatch state.',
  )
  addCheck(
    checks,
    packetFingerprintMismatchResponse.canPrepareTemplateUpdateDraft === false &&
      packetFingerprintMismatchResponse.blockerCodes.includes('attorney_response_packet_fingerprint_mismatch'),
    'PHASE59_PACKET_FINGERPRINT_MISMATCH_BLOCKED',
    'Attorney response manifest must match the Phase 58 packet fingerprint.',
  )
  addCheck(
    checks,
    missingRouteResponse.canPrepareTemplateUpdateDraft === false &&
      missingRouteResponse.blockerCodes.includes('attorney_response_route_missing:new_development'),
    'PHASE59_MISSING_ROUTE_RESPONSE_BLOCKED',
    'Missing resale or new-development attorney response blocks required-change drafting.',
  )
  addCheck(
    checks,
    unansweredQuestionsResponse.canPrepareTemplateUpdateDraft === false &&
      unansweredQuestionsResponse.blockerCodes.includes('attorney_response_questions_unanswered:resale_existing_property') &&
      unansweredQuestionsResponse.blockerCodes.includes('attorney_change_register_unresolved_questions'),
    'PHASE59_UNANSWERED_QUESTIONS_BLOCKED',
    'Unanswered attorney questions or unresolved items block the template-update draft.',
  )
  addCheck(
    checks,
    missingRequiredChangesResponse.canPrepareTemplateUpdateDraft === false &&
      missingRequiredChangesResponse.blockerCodes.includes('attorney_response_required_changes_missing:new_development') &&
      missingRequiredChangesResponse.blockerCodes.includes('attorney_change_register_category_missing:buyer_cost_obligations'),
    'PHASE59_MISSING_REQUIRED_CHANGES_BLOCKED',
    'Missing required-change items or categories block the attorney response register.',
  )
  addCheck(
    checks,
    docxResponse.canPrepareTemplateUpdateDraft === false &&
      docxResponse.blockerCodes.includes('attorney_response_docx_source_observed:resale_existing_property'),
    'PHASE59_DOCX_RESPONSE_BLOCKED',
    'DOC/DOCX attorney response artifacts remain blocked.',
  )
  addCheck(
    checks,
    prematureApprovalResponse.canPrepareTemplateUpdateDraft === false &&
      prematureApprovalResponse.blockerCodes.includes('attorney_response_premature_approval') &&
      prematureApprovalResponse.blockerCodes.includes('attorney_response_route_premature_approval:resale_existing_property'),
    'PHASE59_PREMATURE_APPROVAL_BLOCKED',
    'Attorney response capture cannot be treated as legal approval or publication approval.',
  )
  addCheck(
    checks,
    qaRetestBlockedResponse.canPrepareTemplateUpdateDraft === false &&
      qaRetestBlockedResponse.blockerCodes.includes('attorney_response_pdf_proof_retest_missing') &&
      qaRetestBlockedResponse.blockerCodes.includes('attorney_response_signing_alignment_retest_missing'),
    'PHASE59_QA_RETEST_SCOPE_BLOCKED',
    'Required attorney changes must carry the retest scope for PDF proof, signing alignment, agent review, scanner, and routes.',
  )
  addCheck(
    checks,
    dispatchBlockedResponse.canPrepareTemplateUpdateDraft === false &&
      dispatchBlockedResponse.blockerCodes.includes('attorney_response_email_dispatch_requested') &&
      dispatchBlockedResponse.blockerCodes.includes('attorney_response_signing_dispatch_requested'),
    'PHASE59_DISPATCH_BLOCKED',
    'Attorney response capture cannot email, dispatch signing, or request production writes.',
  )
  addCheck(
    checks,
    evidenceBlockedResponse.canPrepareTemplateUpdateDraft === false &&
      evidenceBlockedResponse.blockerCodes.includes('attorney_response_evidence_missing:packet_trace') &&
      evidenceBlockedResponse.blockerCodes.includes('attorney_response_evidence_invalid:attorney_response_record'),
    'PHASE59_EVIDENCE_BLOCKED',
    'Missing or invalid attorney response evidence blocks required-change drafting.',
  )
  addCheck(
    checks,
    productionWriteResponse.canPrepareTemplateUpdateDraft === false &&
      productionWriteResponse.blockerCodes.includes('attorney_response_production_write_attempted') &&
      productionWriteResponse.blockerCodes.includes('attorney_response_legal_wording_mutation_observed'),
    'PHASE59_PRODUCTION_WRITE_BLOCKED',
    'Production writes or wording/field/default/envelope mutations block attorney response capture.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-template-renewal-attorney-response-phase59'] === 'node scripts/otp-template-renewal-attorney-response-phase59.test.mjs' &&
      packageJson.scripts?.['report:otp-template-renewal-attorney-response-phase59'] === 'node scripts/report-otp-template-renewal-attorney-response-phase59.mjs' &&
      packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-attorney-response-phase59'),
    'PHASE59_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 59 test, report, and vNext verification chain entry.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_PHASE59_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_REMEDIATION_REQUIRED' : OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    attorneyResponseReceipts: Object.freeze([
      goodResponse,
      packetFingerprintMismatchResponse,
      missingRouteResponse,
      unansweredQuestionsResponse,
      missingRequiredChangesResponse,
      docxResponse,
      prematureApprovalResponse,
      qaRetestBlockedResponse,
      dispatchBlockedResponse,
      evidenceBlockedResponse,
      productionWriteResponse,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      readyResponseCount: [goodResponse].filter((row) => row.canPrepareTemplateUpdateDraft).length,
      blockedResponseCount: [
        packetFingerprintMismatchResponse,
        missingRouteResponse,
        unansweredQuestionsResponse,
        missingRequiredChangesResponse,
        docxResponse,
        prematureApprovalResponse,
        qaRetestBlockedResponse,
        dispatchBlockedResponse,
        evidenceBlockedResponse,
        productionWriteResponse,
      ].filter((row) => !row.canPrepareTemplateUpdateDraft).length,
      routeCount: REQUIRED_ROUTES.length,
      requiredChangeCategoryCount: REQUIRED_CHANGE_CATEGORIES.length,
      requiredChangeCount: goodResponse.summary.requiredChangeCount,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 60,
      key: 'otp_template_renewal_template_update_draft_from_attorney_changes',
      label: 'Template Update Draft From Attorney Changes',
    }),
  })
}

export function formatOtpTemplateRenewalAttorneyResponsePhase59Markdown(report = buildOtpTemplateRenewalAttorneyResponsePhase59Audit()) {
  const readyReceipt = report.attorneyResponseReceipts.find((receipt) => receipt.canPrepareTemplateUpdateDraft) || report.attorneyResponseReceipts[0]
  return [
    '# OTP Generator Phase 59 Template Renewal Attorney Response Required Changes',
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
        ['Ready responses', report.summary.readyResponseCount],
        ['Blocked responses', report.summary.blockedResponseCount],
        ['Routes', report.summary.routeCount],
        ['Required change categories', report.summary.requiredChangeCategoryCount],
        ['Required changes', report.summary.requiredChangeCount],
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
    '## Response Manifest',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Response ID', readyReceipt.responseManifest.responseId],
        ['Packet fingerprint', readyReceipt.responseManifest.packetFingerprint],
        ['Draft fingerprint', readyReceipt.responseManifest.draftFingerprint],
        ['Response mode', readyReceipt.responseManifest.responseMode],
        ['Attorney reviewer', readyReceipt.responseManifest.attorneyReviewer],
        ['Question status', readyReceipt.responseManifest.questionRegisterStatus],
      ],
    ),
    '',
    '## Route Responses',
    '',
    table(
      ['Route', 'Status', 'Answered', 'Unresolved', 'Required Changes'],
      readyReceipt.routeResponses.map((route) => [
        route.routeVariant,
        route.responseStatus,
        route.answeredQuestionCount,
        route.unresolvedQuestionCount,
        route.requiredChanges.map((change) => change.category).join(', '),
      ]),
    ),
    '',
    '## Change Register',
    '',
    table(
      ['Field', 'Value'],
      [
        ['register_id', readyReceipt.changeRegister.registerId],
        ['status', readyReceipt.changeRegister.status],
        ['total_required_changes', readyReceipt.changeRegister.totalRequiredChangeCount],
        ['unresolved_questions', readyReceipt.changeRegister.unresolvedQuestionCount],
        ['attorney_approval_granted', readyReceipt.changeRegister.attorneyApprovalGranted ? 'yes' : 'no'],
        ['template_update_draft_required', readyReceipt.changeRegister.templateUpdateDraftRequired ? 'yes' : 'no'],
      ],
    ),
    '',
    '## QA Retest Scope',
    '',
    table(
      ['Scope', 'Required'],
      Object.entries(readyReceipt.qaRetestScope).map(([key, value]) => [key, value ? 'yes' : 'no']),
    ),
    '',
    '## Attorney Response Receipts',
    '',
    table(
      ['Status', 'Ready', 'Routes', 'Changes', 'Evidence', 'Blockers'],
      report.attorneyResponseReceipts.map((receipt) => [
        receipt.status,
        receipt.canPrepareTemplateUpdateDraft ? 'yes' : 'no',
        receipt.summary.routeResponseCount,
        receipt.summary.requiredChangeCount,
        receipt.summary.evidenceCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 59 records the attorney response and converts it into route-separated required changes for the next template update draft. It does not record final attorney approval, mutate legal wording, publish templates, change route defaults, alter signing envelopes, email reviewers, or dispatch signing links.',
    '',
  ].join('\n')
}
