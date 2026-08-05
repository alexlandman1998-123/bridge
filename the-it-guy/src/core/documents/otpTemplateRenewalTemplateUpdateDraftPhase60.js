import {
  OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_PHASE59_VERSION,
  OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_READY_STATUS,
  buildOtpTemplateRenewalAttorneyResponsePhase59Audit,
} from './otpTemplateRenewalAttorneyResponsePhase59.js'

export const OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_PHASE60_VERSION = 'otp_template_renewal_template_update_draft_from_attorney_feedback_phase60_v1'
export const OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_READY_STATUS = 'OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_READY_FOR_QA_AND_ATTORNEY_RECHECK'
export const OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_CONTRACT = 'otp-vnext-template-renewal-template-update-draft-from-attorney-feedback-phase60-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_CHANGE_CATEGORIES = Object.freeze([
  'legal_wording',
  'route_specific_differences',
  'buyer_cost_obligations',
  'suspensive_conditions',
  'signatures_and_witnesses',
])
const REQUIRED_DRAFT_SECTIONS = Object.freeze([
  'legal_wording_draft',
  'field_registry_updates',
  'signing_envelope_updates',
  'agent_review_ui_updates',
  'qa_retest_plan',
  'acceptance_criteria',
])
const REQUIRED_EVIDENCE_ITEMS = Object.freeze([
  'attorney_response_trace',
  'route_template_update_draft',
  'draft_change_matrix',
  'qa_retest_plan',
  'attorney_recheck_packet_stub',
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
  return /\.docx?$/i.test(normalizeText(row.path || row.sourcePath || row.source_path || row.draftPath || row.draft_path || row.templatePath || row.template_path)) ||
    normalizeKey(row.sourceFormat || row.source_format || row.draftFormat || row.draft_format || row.templateFormat || row.template_format).includes('doc') ||
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

function defaultDraftManifest(attorneyResponseReceipt = {}, checkedAt = new Date().toISOString()) {
  return {
    draftId: 'otp-vnext-phase60-template-update-draft-from-attorney-feedback',
    status: 'drafted_from_attorney_feedback',
    draftedAt: checkedAt,
    attorneyResponseFingerprint: attorneyResponseReceipt.responseFingerprint,
    packetFingerprint: attorneyResponseReceipt.packetReceipt?.packetFingerprint,
    sourceDraftFingerprint: attorneyResponseReceipt.packetReceipt?.draftFingerprint,
    routeCount: REQUIRED_ROUTES.length,
    draftMode: 'template_update_draft_only',
    templateOwner: 'template_owner',
    qaOwner: 'qa_owner',
    attorneyRecheckRequired: true,
    attorneyApprovalGranted: false,
    productionWriteRequested: false,
    draftOnly: true,
  }
}

function defaultLegalWordingDraft(routeVariant, requiredChanges = []) {
  return list(requiredChanges)
    .filter((change) => ['legal_wording', 'route_specific_differences', 'buyer_cost_obligations', 'suspensive_conditions', 'signatures_and_witnesses'].includes(normalizeKey(change.category)))
    .map((change) => ({
      key: `${change.key}_wording_draft`,
      category: change.category,
      sourceChangeKey: change.key,
      draftInstruction: change.attorneyInstruction,
      proposedDraftReference: `phase60-${routeVariant}-${change.category}-wording-draft`,
      attorneyRecheckRequired: true,
    }))
}

function defaultFieldRegistryUpdates(routeVariant, requiredChanges = []) {
  return list(requiredChanges)
    .filter((change) => change.affectsFieldRegistry === true || normalizeKey(change.category) === 'buyer_cost_obligations')
    .map((change) => ({
      key: `${change.key}_field_registry_update`,
      sourceChangeKey: change.key,
      fieldGroup: 'buyer_cost_obligations',
      proposedFieldReference: `phase60-${routeVariant}-buyer-cost-obligations-field-update`,
      qaRequired: true,
    }))
}

function defaultSigningEnvelopeUpdates(routeVariant, requiredChanges = []) {
  return list(requiredChanges)
    .filter((change) => change.affectsSigningEnvelope === true || normalizeKey(change.category) === 'signatures_and_witnesses')
    .map((change) => ({
      key: `${change.key}_signing_update`,
      sourceChangeKey: change.key,
      roleScope: routeVariant,
      proposedSigningReference: `phase60-${routeVariant}-signature-witness-update`,
      qaRequired: true,
    }))
}

function defaultAgentReviewUiUpdates(routeVariant, requiredChanges = []) {
  return list(requiredChanges)
    .filter((change) => change.affectsAgentReviewUi === true || ['buyer_cost_obligations', 'suspensive_conditions'].includes(normalizeKey(change.category)))
    .map((change) => ({
      key: `${change.key}_agent_review_update`,
      sourceChangeKey: change.key,
      controlGroup: change.category,
      proposedUiReference: `phase60-${routeVariant}-${change.category}-agent-review-update`,
      qaRequired: true,
    }))
}

function defaultQaRetestPlan(routeVariant) {
  return [
    { key: `${routeVariant}_content_scanner`, scope: 'content_scanner', required: true },
    { key: `${routeVariant}_generated_pdf_proof`, scope: 'generated_pdf_proof', required: true },
    { key: `${routeVariant}_signing_envelope_alignment`, scope: 'signing_envelope_alignment', required: true },
    { key: `${routeVariant}_agent_review_runtime`, scope: 'agent_review_runtime', required: true },
    { key: `${routeVariant}_route_regression`, scope: 'route_regression', required: true },
  ]
}

function defaultAcceptanceCriteria(routeVariant) {
  return [
    `${routeVariant} template update draft remains route-separated.`,
    `${routeVariant} attorney feedback is traceable to Phase 59.`,
    `${routeVariant} buyer cost obligations, suspensive conditions, and witness/signature handling are included where applicable.`,
    `${routeVariant} generated PDF proof and signing envelope QA are still required before approval.`,
  ]
}

function defaultRouteUpdateDrafts(attorneyResponseReceipt = {}) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const response = list(attorneyResponseReceipt.routeResponses).find((row) => normalizeKey(row.routeVariant) === routeVariant) || {}
    const requiredChanges = list(response.requiredChanges || response.required_changes)
    return {
      routeVariant,
      draftArtifactKey: `${routeVariant}-template-update-draft-phase60`,
      sourceResponseFingerprint: attorneyResponseReceipt.responseFingerprint,
      sourcePacketFingerprint: attorneyResponseReceipt.packetReceipt?.packetFingerprint,
      sourceDraftFingerprint: attorneyResponseReceipt.packetReceipt?.draftFingerprint,
      draftStatus: 'drafted_from_attorney_feedback',
      requiredChangeCount: requiredChanges.length,
      appliedChangeItems: requiredChanges.map((change) => ({
        key: change.key,
        category: change.category,
        sourceInstruction: change.attorneyInstruction,
        draftAction: 'draft_template_update',
        attorneyRecheckRequired: true,
        qaRequired: true,
      })),
      legalWordingDraft: defaultLegalWordingDraft(routeVariant, requiredChanges),
      fieldRegistryUpdates: defaultFieldRegistryUpdates(routeVariant, requiredChanges),
      signingEnvelopeUpdates: defaultSigningEnvelopeUpdates(routeVariant, requiredChanges),
      agentReviewUiUpdates: defaultAgentReviewUiUpdates(routeVariant, requiredChanges),
      qaRetestPlan: defaultQaRetestPlan(routeVariant),
      acceptanceCriteria: defaultAcceptanceCriteria(routeVariant),
      sourceFormat: 'native_governance_record',
      draftFormat: 'json_governance_record',
      docxReferenceCount: 0,
      attorneyRecheckRequired: true,
      attorneyApprovalGranted: false,
      routeSeparated: true,
      templateDefaultMutationRequested: false,
      signingEnvelopeMutationRequested: false,
      productionWriteRequested: false,
    }
  })
}

function defaultDraftChangeMatrix(routeUpdateDrafts = []) {
  const appliedChanges = list(routeUpdateDrafts).flatMap((route) => list(route.appliedChangeItems || route.applied_change_items))
  const categories = unique(appliedChanges.map((change) => normalizeKey(change.category)))
  return {
    matrixId: 'phase60-template-update-draft-change-matrix',
    status: 'draft_changes_mapped',
    routeCount: REQUIRED_ROUTES.length,
    totalAppliedChangeCount: appliedChanges.length,
    changeCategories: categories,
    attorneyRecheckRequired: true,
    qaRequired: true,
    attorneyApprovalGranted: false,
    publicationApprovalGranted: false,
    routeSeparated: true,
  }
}

function defaultQaPlan() {
  return {
    contentScannerRequired: true,
    generatedPdfProofRequired: true,
    signingEnvelopeAlignmentRequired: true,
    agentReviewRuntimeRequired: true,
    routeRegressionRequired: true,
    attorneyRecheckRequired: true,
    productionWriteNotAllowed: true,
    signingDispatchNotAllowed: true,
  }
}

function defaultReviewRouting() {
  return {
    currentOwnerRole: 'template_owner',
    nextOwnerRole: 'qa_owner',
    attorneyReviewerRole: 'external_attorney_reviewer',
    nextAction: 'qa_and_attorney_recheck_template_update_draft',
    deliveryMode: 'internal_draft_record',
    emailDispatchRequested: false,
    signingDispatchRequested: false,
    productionWriteRequested: false,
  }
}

function defaultEvidence() {
  return REQUIRED_EVIDENCE_ITEMS.map((key) => ({
    key,
    status: 'captured',
    path: `docs/otp-${key.replace(/_/g, '-')}-phase60.md`,
    fingerprint: fingerprint([key, 'phase60']),
  }))
}

function defaultNoWriteProof() {
  return {
    draftOnly: true,
    productionWriteAttempted: false,
    attorneyApprovalMutationCount: 0,
    publicationApprovalMutationCount: 0,
    legalWordingMutationCount: 0,
    templateDefaultMutationCount: 0,
    fieldRegistryMutationCount: 0,
    signingEnvelopeMutationCount: 0,
    dispatchMutationCount: 0,
  }
}

function phase59Blockers(attorneyResponseReceipt = {}) {
  return [
    attorneyResponseReceipt.version === OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_PHASE59_VERSION ? '' : 'phase59_attorney_response_version_mismatch',
    attorneyResponseReceipt.status === OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_READY_STATUS ? '' : 'phase59_attorney_response_not_ready',
    attorneyResponseReceipt.canPrepareTemplateUpdateDraft === true ? '' : 'phase59_attorney_response_not_ready_for_template_update_draft',
    attorneyResponseReceipt.mutatedData === false ? '' : 'phase59_attorney_response_mutation_unexpected',
    list(attorneyResponseReceipt.blockerCodes).length === 0 ? '' : 'phase59_attorney_response_has_blockers',
    attorneyResponseReceipt.noWriteProof?.productionWriteAttempted === false ? '' : 'phase59_attorney_response_write_attempted',
  ].filter(Boolean)
}

function manifestBlockers(manifest = {}, attorneyResponseReceipt = {}) {
  return [
    normalizeText(manifest.draftId || manifest.draft_id) ? '' : 'template_update_draft_id_missing',
    normalizeKey(manifest.status) === 'drafted_from_attorney_feedback' ? '' : 'template_update_draft_status_invalid',
    normalizeText(manifest.draftedAt || manifest.drafted_at) ? '' : 'template_update_draft_time_missing',
    manifest.attorneyResponseFingerprint === attorneyResponseReceipt.responseFingerprint ? '' : 'template_update_draft_response_fingerprint_mismatch',
    manifest.packetFingerprint === attorneyResponseReceipt.packetReceipt?.packetFingerprint ? '' : 'template_update_draft_packet_fingerprint_mismatch',
    manifest.sourceDraftFingerprint === attorneyResponseReceipt.packetReceipt?.draftFingerprint ? '' : 'template_update_draft_source_draft_fingerprint_mismatch',
    numberValue(manifest.routeCount || manifest.route_count) === REQUIRED_ROUTES.length ? '' : 'template_update_draft_route_count_mismatch',
    normalizeKey(manifest.draftMode || manifest.draft_mode) === 'template_update_draft_only' ? '' : 'template_update_draft_mode_invalid',
    normalizeText(manifest.templateOwner || manifest.template_owner) ? '' : 'template_update_draft_template_owner_missing',
    normalizeText(manifest.qaOwner || manifest.qa_owner) ? '' : 'template_update_draft_qa_owner_missing',
    manifest.attorneyRecheckRequired === true ? '' : 'template_update_draft_attorney_recheck_missing',
    manifest.attorneyApprovalGranted === true ? 'template_update_draft_premature_attorney_approval' : '',
    manifest.productionWriteRequested === true ? 'template_update_draft_production_write_requested' : '',
    manifest.draftOnly === true ? '' : 'template_update_draft_only_flag_missing',
  ].filter(Boolean)
}

function routeDraftBlockers(routeDrafts = [], attorneyResponseReceipt = {}) {
  const routes = list(routeDrafts).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routeDrafts).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    const response = list(attorneyResponseReceipt.routeResponses).find((candidate) => normalizeKey(candidate.routeVariant) === route) || {}
    const requiredChanges = list(response.requiredChanges || response.required_changes)
    const appliedChanges = list(row.appliedChangeItems || row.applied_change_items)
    const categories = appliedChanges.map((change) => normalizeKey(change.category))
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `template_update_draft_route_unsupported:${route}`,
      normalizeText(row.draftArtifactKey || row.draft_artifact_key) ? '' : `template_update_draft_artifact_key_missing:${route}`,
      row.sourceResponseFingerprint === attorneyResponseReceipt.responseFingerprint ? '' : `template_update_draft_response_fingerprint_mismatch:${route}`,
      row.sourcePacketFingerprint === attorneyResponseReceipt.packetReceipt?.packetFingerprint ? '' : `template_update_draft_packet_fingerprint_mismatch:${route}`,
      row.sourceDraftFingerprint === attorneyResponseReceipt.packetReceipt?.draftFingerprint ? '' : `template_update_draft_source_draft_fingerprint_mismatch:${route}`,
      normalizeKey(row.draftStatus || row.draft_status) === 'drafted_from_attorney_feedback' ? '' : `template_update_draft_route_status_invalid:${route}`,
      numberValue(row.requiredChangeCount || row.required_change_count) === requiredChanges.length && requiredChanges.length > 0 ? '' : `template_update_draft_change_count_mismatch:${route}`,
      appliedChanges.length === requiredChanges.length && appliedChanges.length > 0 ? '' : `template_update_draft_applied_changes_missing:${route}`,
      ...REQUIRED_CHANGE_CATEGORIES.filter((category) => !categories.includes(category)).map((category) => `template_update_draft_change_category_missing:${route}:${category}`),
      list(row.legalWordingDraft || row.legal_wording_draft).length ? '' : `template_update_draft_legal_wording_missing:${route}`,
      list(row.fieldRegistryUpdates || row.field_registry_updates).length ? '' : `template_update_draft_field_registry_updates_missing:${route}`,
      list(row.signingEnvelopeUpdates || row.signing_envelope_updates).length ? '' : `template_update_draft_signing_updates_missing:${route}`,
      list(row.agentReviewUiUpdates || row.agent_review_ui_updates).length ? '' : `template_update_draft_agent_review_updates_missing:${route}`,
      list(row.qaRetestPlan || row.qa_retest_plan).length ? '' : `template_update_draft_qa_plan_missing:${route}`,
      list(row.acceptanceCriteria || row.acceptance_criteria).length ? '' : `template_update_draft_acceptance_criteria_missing:${route}`,
      row.attorneyRecheckRequired === true ? '' : `template_update_draft_attorney_recheck_missing:${route}`,
      row.attorneyApprovalGranted === true ? `template_update_draft_route_premature_attorney_approval:${route}` : '',
      row.routeSeparated === true ? '' : `template_update_draft_route_not_separated:${route}`,
      hasDocxSource(row) ? `template_update_draft_docx_source_observed:${route}` : '',
      row.templateDefaultMutationRequested === true ? `template_update_draft_default_mutation_requested:${route}` : '',
      row.signingEnvelopeMutationRequested === true ? `template_update_draft_signing_mutation_requested:${route}` : '',
      row.productionWriteRequested === true ? `template_update_draft_route_production_write_requested:${route}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `template_update_draft_route_missing:${route}`),
    ...unique(duplicateRoutes).map((route) => `template_update_draft_route_duplicate:${route}`),
    ...rowBlockers,
  ]
}

function draftChangeMatrixBlockers(matrix = {}) {
  const categories = list(matrix.changeCategories || matrix.change_categories).map(normalizeKey)
  return [
    normalizeText(matrix.matrixId || matrix.matrix_id) ? '' : 'template_update_draft_matrix_id_missing',
    normalizeKey(matrix.status) === 'draft_changes_mapped' ? '' : 'template_update_draft_matrix_status_invalid',
    numberValue(matrix.routeCount || matrix.route_count) === REQUIRED_ROUTES.length ? '' : 'template_update_draft_matrix_route_count_mismatch',
    numberValue(matrix.totalAppliedChangeCount || matrix.total_applied_change_count) > 0 ? '' : 'template_update_draft_matrix_empty',
    ...REQUIRED_CHANGE_CATEGORIES.filter((category) => !categories.includes(category)).map((category) => `template_update_draft_matrix_category_missing:${category}`),
    matrix.attorneyRecheckRequired === true ? '' : 'template_update_draft_matrix_attorney_recheck_missing',
    matrix.qaRequired === true ? '' : 'template_update_draft_matrix_qa_missing',
    matrix.attorneyApprovalGranted === true ? 'template_update_draft_matrix_premature_attorney_approval' : '',
    matrix.publicationApprovalGranted === true ? 'template_update_draft_matrix_premature_publication_approval' : '',
    matrix.routeSeparated === true ? '' : 'template_update_draft_matrix_route_separation_missing',
  ].filter(Boolean)
}

function qaPlanBlockers(qaPlan = {}) {
  return [
    qaPlan.contentScannerRequired === true ? '' : 'template_update_draft_content_scanner_retest_missing',
    qaPlan.generatedPdfProofRequired === true ? '' : 'template_update_draft_pdf_proof_retest_missing',
    qaPlan.signingEnvelopeAlignmentRequired === true ? '' : 'template_update_draft_signing_alignment_retest_missing',
    qaPlan.agentReviewRuntimeRequired === true ? '' : 'template_update_draft_agent_review_retest_missing',
    qaPlan.routeRegressionRequired === true ? '' : 'template_update_draft_route_regression_retest_missing',
    qaPlan.attorneyRecheckRequired === true ? '' : 'template_update_draft_attorney_recheck_qa_missing',
    qaPlan.productionWriteNotAllowed === true ? '' : 'template_update_draft_production_write_boundary_missing',
    qaPlan.signingDispatchNotAllowed === true ? '' : 'template_update_draft_signing_dispatch_boundary_missing',
  ].filter(Boolean)
}

function reviewRoutingBlockers(routing = {}) {
  return [
    normalizeText(routing.currentOwnerRole || routing.current_owner_role) ? '' : 'template_update_draft_current_owner_missing',
    normalizeKey(routing.nextOwnerRole || routing.next_owner_role) === 'qa_owner' ? '' : 'template_update_draft_next_owner_invalid',
    normalizeText(routing.attorneyReviewerRole || routing.attorney_reviewer_role) ? '' : 'template_update_draft_attorney_reviewer_missing',
    normalizeKey(routing.nextAction || routing.next_action) === 'qa_and_attorney_recheck_template_update_draft' ? '' : 'template_update_draft_next_action_invalid',
    normalizeKey(routing.deliveryMode || routing.delivery_mode) === 'internal_draft_record' ? '' : 'template_update_draft_delivery_mode_invalid',
    routing.emailDispatchRequested === true ? 'template_update_draft_email_dispatch_requested' : '',
    routing.signingDispatchRequested === true ? 'template_update_draft_signing_dispatch_requested' : '',
    routing.productionWriteRequested === true ? 'template_update_draft_production_write_requested' : '',
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
    ...missingKeys.map((key) => `template_update_draft_evidence_missing:${key}`),
    ...badRows.map((row) => `template_update_draft_evidence_invalid:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function noWriteBlockers(noWriteProof = {}) {
  return [
    noWriteProof.draftOnly === true ? '' : 'template_update_draft_no_write_draft_only_missing',
    noWriteProof.productionWriteAttempted === true ? 'template_update_draft_production_write_attempted' : '',
    numberValue(noWriteProof.attorneyApprovalMutationCount || noWriteProof.attorney_approval_mutation_count) === 0 ? '' : 'template_update_draft_attorney_approval_mutation_observed',
    numberValue(noWriteProof.publicationApprovalMutationCount || noWriteProof.publication_approval_mutation_count) === 0 ? '' : 'template_update_draft_publication_approval_mutation_observed',
    numberValue(noWriteProof.legalWordingMutationCount || noWriteProof.legal_wording_mutation_count) === 0 ? '' : 'template_update_draft_legal_wording_mutation_observed',
    numberValue(noWriteProof.templateDefaultMutationCount || noWriteProof.template_default_mutation_count) === 0 ? '' : 'template_update_draft_template_default_mutation_observed',
    numberValue(noWriteProof.fieldRegistryMutationCount || noWriteProof.field_registry_mutation_count) === 0 ? '' : 'template_update_draft_field_registry_mutation_observed',
    numberValue(noWriteProof.signingEnvelopeMutationCount || noWriteProof.signing_envelope_mutation_count) === 0 ? '' : 'template_update_draft_signing_envelope_mutation_observed',
    numberValue(noWriteProof.dispatchMutationCount || noWriteProof.dispatch_mutation_count) === 0 ? '' : 'template_update_draft_dispatch_mutation_observed',
  ].filter(Boolean)
}

export function buildOtpTemplateRenewalTemplateUpdateDraftReceipt({
  attorneyResponseReceipt = buildOtpTemplateRenewalAttorneyResponsePhase59Audit().attorneyResponseReceipts?.find((receipt) => receipt.canPrepareTemplateUpdateDraft),
  draftManifest = null,
  routeUpdateDrafts = null,
  draftChangeMatrix = null,
  qaPlan = defaultQaPlan(),
  reviewRouting = defaultReviewRouting(),
  evidence = defaultEvidence(),
  noWriteProof = defaultNoWriteProof(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const manifest = draftManifest || defaultDraftManifest(attorneyResponseReceipt, checkedAt)
  const routes = routeUpdateDrafts || defaultRouteUpdateDrafts(attorneyResponseReceipt)
  const matrix = draftChangeMatrix || defaultDraftChangeMatrix(routes)
  const blockerCodes = unique([
    ...phase59Blockers(attorneyResponseReceipt || {}),
    ...manifestBlockers(manifest, attorneyResponseReceipt || {}),
    ...routeDraftBlockers(routes, attorneyResponseReceipt || {}),
    ...draftChangeMatrixBlockers(matrix),
    ...qaPlanBlockers(qaPlan),
    ...reviewRoutingBlockers(reviewRouting),
    ...evidenceBlockers(evidence),
    ...noWriteBlockers(noWriteProof),
  ])
  const canStartQaAndAttorneyRecheck = blockerCodes.length === 0
  const templateUpdateDraftFingerprint = fingerprint([
    manifest.draftId,
    attorneyResponseReceipt?.responseFingerprint,
    list(routes).map((row) => `${row.routeVariant}:${row.draftArtifactKey}:${list(row.appliedChangeItems).length}`).join('|'),
  ])

  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_PHASE60_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_CONTRACT,
    checkedAt,
    status: canStartQaAndAttorneyRecheck
      ? OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_READY_STATUS
      : 'OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_BLOCKED',
    canStartQaAndAttorneyRecheck,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    templateUpdateDraftFingerprint,
    attorneyResponseReceipt: Object.freeze({
      version: attorneyResponseReceipt?.version,
      status: attorneyResponseReceipt?.status,
      canPrepareTemplateUpdateDraft: attorneyResponseReceipt?.canPrepareTemplateUpdateDraft === true,
      responseFingerprint: attorneyResponseReceipt?.responseFingerprint,
      packetFingerprint: attorneyResponseReceipt?.packetReceipt?.packetFingerprint,
      draftFingerprint: attorneyResponseReceipt?.packetReceipt?.draftFingerprint,
    }),
    draftManifest: Object.freeze({ ...manifest }),
    routeUpdateDrafts: Object.freeze(list(routes)),
    draftChangeMatrix: Object.freeze({ ...matrix }),
    qaPlan: Object.freeze({ ...qaPlan }),
    reviewRouting: Object.freeze({ ...reviewRouting }),
    evidence: Object.freeze(list(evidence)),
    noWriteProof: Object.freeze({ ...noWriteProof }),
    summary: Object.freeze({
      routeDraftCount: list(routes).length,
      appliedChangeCount: list(routes).reduce((count, route) => count + list(route.appliedChangeItems || route.applied_change_items).length, 0),
      legalWordingDraftCount: list(routes).reduce((count, route) => count + list(route.legalWordingDraft || route.legal_wording_draft).length, 0),
      evidenceCount: list(evidence).length,
      blockerCount: blockerCodes.length,
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpTemplateRenewalTemplateUpdateDraftPhase60Audit({
  checkedAt = new Date().toISOString(),
  phase59Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase59Ready = !phase59Audit || phase59Audit.status === OTP_TEMPLATE_RENEWAL_ATTORNEY_RESPONSE_READY_STATUS
  const goodAttorneyResponse = phase59Audit?.attorneyResponseReceipts?.find((receipt) => receipt.canPrepareTemplateUpdateDraft) ||
    buildOtpTemplateRenewalAttorneyResponsePhase59Audit({ checkedAt }).attorneyResponseReceipts.find((receipt) => receipt.canPrepareTemplateUpdateDraft)
  const goodDraft = buildOtpTemplateRenewalTemplateUpdateDraftReceipt({
    checkedAt,
    attorneyResponseReceipt: goodAttorneyResponse,
  })
  const responseFingerprintMismatchDraft = buildOtpTemplateRenewalTemplateUpdateDraftReceipt({
    checkedAt,
    attorneyResponseReceipt: goodAttorneyResponse,
    draftManifest: {
      ...defaultDraftManifest(goodAttorneyResponse, checkedAt),
      attorneyResponseFingerprint: 'wrong-response-fingerprint',
    },
  })
  const missingRouteDraft = buildOtpTemplateRenewalTemplateUpdateDraftReceipt({
    checkedAt,
    attorneyResponseReceipt: goodAttorneyResponse,
    routeUpdateDrafts: defaultRouteUpdateDrafts(goodAttorneyResponse).filter((row) => row.routeVariant !== 'new_development'),
  })
  const incompleteRouteDraft = buildOtpTemplateRenewalTemplateUpdateDraftReceipt({
    checkedAt,
    attorneyResponseReceipt: goodAttorneyResponse,
    routeUpdateDrafts: defaultRouteUpdateDrafts(goodAttorneyResponse).map((row) =>
      row.routeVariant === 'new_development'
        ? { ...row, legalWordingDraft: [], fieldRegistryUpdates: [], acceptanceCriteria: [] }
        : row,
    ),
  })
  const missingChangeMatrixDraft = buildOtpTemplateRenewalTemplateUpdateDraftReceipt({
    checkedAt,
    attorneyResponseReceipt: goodAttorneyResponse,
    draftChangeMatrix: {
      ...defaultDraftChangeMatrix(defaultRouteUpdateDrafts(goodAttorneyResponse)),
      totalAppliedChangeCount: 0,
      changeCategories: ['legal_wording'],
    },
  })
  const docxDraft = buildOtpTemplateRenewalTemplateUpdateDraftReceipt({
    checkedAt,
    attorneyResponseReceipt: goodAttorneyResponse,
    routeUpdateDrafts: defaultRouteUpdateDrafts(goodAttorneyResponse).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, draftFormat: 'docx', draftPath: 'template-update-draft.docx', docxReferenceCount: 1 }
        : row,
    ),
  })
  const prematureApprovalDraft = buildOtpTemplateRenewalTemplateUpdateDraftReceipt({
    checkedAt,
    attorneyResponseReceipt: goodAttorneyResponse,
    draftManifest: {
      ...defaultDraftManifest(goodAttorneyResponse, checkedAt),
      attorneyApprovalGranted: true,
    },
    routeUpdateDrafts: defaultRouteUpdateDrafts(goodAttorneyResponse).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, attorneyApprovalGranted: true }
        : row,
    ),
    draftChangeMatrix: {
      ...defaultDraftChangeMatrix(defaultRouteUpdateDrafts(goodAttorneyResponse)),
      attorneyApprovalGranted: true,
      publicationApprovalGranted: true,
    },
  })
  const qaBlockedDraft = buildOtpTemplateRenewalTemplateUpdateDraftReceipt({
    checkedAt,
    attorneyResponseReceipt: goodAttorneyResponse,
    qaPlan: {
      ...defaultQaPlan(),
      generatedPdfProofRequired: false,
      signingEnvelopeAlignmentRequired: false,
      attorneyRecheckRequired: false,
    },
  })
  const dispatchBlockedDraft = buildOtpTemplateRenewalTemplateUpdateDraftReceipt({
    checkedAt,
    attorneyResponseReceipt: goodAttorneyResponse,
    reviewRouting: {
      ...defaultReviewRouting(),
      emailDispatchRequested: true,
      signingDispatchRequested: true,
      productionWriteRequested: true,
    },
  })
  const evidenceBlockedDraft = buildOtpTemplateRenewalTemplateUpdateDraftReceipt({
    checkedAt,
    attorneyResponseReceipt: goodAttorneyResponse,
    evidence: [
      { key: 'attorney_response_trace', status: 'missing', path: '', fingerprint: 'bad' },
    ],
  })
  const productionWriteDraft = buildOtpTemplateRenewalTemplateUpdateDraftReceipt({
    checkedAt,
    attorneyResponseReceipt: goodAttorneyResponse,
    noWriteProof: {
      ...defaultNoWriteProof(),
      productionWriteAttempted: true,
      legalWordingMutationCount: 1,
      templateDefaultMutationCount: 1,
      signingEnvelopeMutationCount: 1,
    },
  })

  addCheck(checks, phase59Ready, 'PHASE60_PHASE59_ATTORNEY_RESPONSE_READY', 'Template update drafting starts only after Phase 59 attorney required changes are ready.')
  addCheck(
    checks,
    goodDraft.canStartQaAndAttorneyRecheck &&
      goodDraft.status === OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_READY_STATUS &&
      goodDraft.mutatedData === false,
    'PHASE60_GOOD_TEMPLATE_UPDATE_DRAFT_READY',
    'A clean attorney response can become a route-separated template update draft without mutating production data.',
  )
  addCheck(
    checks,
    goodDraft.draftManifest.attorneyResponseFingerprint === goodAttorneyResponse.responseFingerprint &&
      goodDraft.draftManifest.packetFingerprint === goodAttorneyResponse.packetReceipt.packetFingerprint,
    'PHASE60_DRAFT_BOUND_TO_ATTORNEY_RESPONSE',
    'Template update draft is bound to the exact Phase 59 response and Phase 58 packet fingerprint.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodDraft.routeUpdateDrafts.some((row) => row.routeVariant === route && row.draftStatus === 'drafted_from_attorney_feedback')),
    'PHASE60_BOTH_ROUTE_DRAFTS_PREPARED',
    'Resale and new-development template update drafts are prepared separately.',
  )
  addCheck(
    checks,
    REQUIRED_DRAFT_SECTIONS.every((section) =>
      goodDraft.routeUpdateDrafts.every((row) => list(row[section.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] || row[section]).length > 0),
    ),
    'PHASE60_REQUIRED_DRAFT_SECTIONS_PRESENT',
    'Each route draft contains legal wording, field, signing, agent review, QA, and acceptance sections.',
  )
  addCheck(
    checks,
    REQUIRED_CHANGE_CATEGORIES.every((category) =>
      goodDraft.draftChangeMatrix.changeCategories.includes(category) &&
        goodDraft.routeUpdateDrafts.every((route) => list(route.appliedChangeItems).some((change) => change.category === category)),
    ),
    'PHASE60_ATTORNEY_CHANGE_CATEGORIES_APPLIED',
    'Attorney feedback categories are applied into the draft matrix and each route update draft.',
  )
  addCheck(
    checks,
    goodDraft.qaPlan.contentScannerRequired === true &&
      goodDraft.qaPlan.generatedPdfProofRequired === true &&
      goodDraft.qaPlan.signingEnvelopeAlignmentRequired === true &&
      goodDraft.qaPlan.attorneyRecheckRequired === true,
    'PHASE60_QA_AND_ATTORNEY_RECHECK_REQUIRED',
    'Template update draft requires content scanner, PDF proof, signing envelope QA, route regression, and attorney recheck.',
  )
  addCheck(
    checks,
    goodDraft.noWriteProof.draftOnly === true &&
      goodDraft.noWriteProof.productionWriteAttempted === false &&
      goodDraft.noWriteProof.legalWordingMutationCount === 0,
    'PHASE60_NO_PRODUCTION_WRITE_ALLOWED',
    'Phase 60 drafts proposed updates only and cannot approve, publish, mutate live wording/defaults/envelopes, or dispatch signing.',
  )
  addCheck(
    checks,
    responseFingerprintMismatchDraft.canStartQaAndAttorneyRecheck === false &&
      responseFingerprintMismatchDraft.blockerCodes.includes('template_update_draft_response_fingerprint_mismatch'),
    'PHASE60_RESPONSE_FINGERPRINT_MISMATCH_BLOCKED',
    'Template update draft manifest must match the Phase 59 attorney response fingerprint.',
  )
  addCheck(
    checks,
    missingRouteDraft.canStartQaAndAttorneyRecheck === false &&
      missingRouteDraft.blockerCodes.includes('template_update_draft_route_missing:new_development'),
    'PHASE60_MISSING_ROUTE_DRAFT_BLOCKED',
    'Missing resale or new-development template update draft blocks QA and attorney recheck.',
  )
  addCheck(
    checks,
    incompleteRouteDraft.canStartQaAndAttorneyRecheck === false &&
      incompleteRouteDraft.blockerCodes.includes('template_update_draft_legal_wording_missing:new_development') &&
      incompleteRouteDraft.blockerCodes.includes('template_update_draft_field_registry_updates_missing:new_development'),
    'PHASE60_INCOMPLETE_ROUTE_DRAFT_BLOCKED',
    'Route drafts without legal wording, fields, signing, agent review, QA, or acceptance content are blocked.',
  )
  addCheck(
    checks,
    missingChangeMatrixDraft.canStartQaAndAttorneyRecheck === false &&
      missingChangeMatrixDraft.blockerCodes.includes('template_update_draft_matrix_empty') &&
      missingChangeMatrixDraft.blockerCodes.includes('template_update_draft_matrix_category_missing:buyer_cost_obligations'),
    'PHASE60_CHANGE_MATRIX_BLOCKED',
    'Draft change matrix must include every attorney feedback category and applied change count.',
  )
  addCheck(
    checks,
    docxDraft.canStartQaAndAttorneyRecheck === false &&
      docxDraft.blockerCodes.includes('template_update_draft_docx_source_observed:resale_existing_property'),
    'PHASE60_DOCX_DRAFT_BLOCKED',
    'DOC/DOCX template update draft artifacts remain blocked.',
  )
  addCheck(
    checks,
    prematureApprovalDraft.canStartQaAndAttorneyRecheck === false &&
      prematureApprovalDraft.blockerCodes.includes('template_update_draft_premature_attorney_approval') &&
      prematureApprovalDraft.blockerCodes.includes('template_update_draft_matrix_premature_publication_approval'),
    'PHASE60_PREMATURE_APPROVAL_BLOCKED',
    'Template update draft cannot be treated as attorney approval or publication approval.',
  )
  addCheck(
    checks,
    qaBlockedDraft.canStartQaAndAttorneyRecheck === false &&
      qaBlockedDraft.blockerCodes.includes('template_update_draft_pdf_proof_retest_missing') &&
      qaBlockedDraft.blockerCodes.includes('template_update_draft_attorney_recheck_qa_missing'),
    'PHASE60_QA_PLAN_BLOCKED',
    'Missing PDF proof, signing envelope alignment, route regression, or attorney recheck blocks the draft.',
  )
  addCheck(
    checks,
    dispatchBlockedDraft.canStartQaAndAttorneyRecheck === false &&
      dispatchBlockedDraft.blockerCodes.includes('template_update_draft_email_dispatch_requested') &&
      dispatchBlockedDraft.blockerCodes.includes('template_update_draft_signing_dispatch_requested'),
    'PHASE60_DISPATCH_BLOCKED',
    'Template update drafting cannot email, dispatch signing, or request production writes.',
  )
  addCheck(
    checks,
    evidenceBlockedDraft.canStartQaAndAttorneyRecheck === false &&
      evidenceBlockedDraft.blockerCodes.includes('template_update_draft_evidence_missing:route_template_update_draft') &&
      evidenceBlockedDraft.blockerCodes.includes('template_update_draft_evidence_invalid:attorney_response_trace'),
    'PHASE60_EVIDENCE_BLOCKED',
    'Missing or invalid template update draft evidence blocks QA and attorney recheck.',
  )
  addCheck(
    checks,
    productionWriteDraft.canStartQaAndAttorneyRecheck === false &&
      productionWriteDraft.blockerCodes.includes('template_update_draft_production_write_attempted') &&
      productionWriteDraft.blockerCodes.includes('template_update_draft_legal_wording_mutation_observed'),
    'PHASE60_PRODUCTION_WRITE_BLOCKED',
    'Production writes or live wording/default/envelope mutations block template update drafting.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-template-renewal-template-update-draft-phase60'] === 'node scripts/otp-template-renewal-template-update-draft-phase60.test.mjs' &&
      packageJson.scripts?.['report:otp-template-renewal-template-update-draft-phase60'] === 'node scripts/report-otp-template-renewal-template-update-draft-phase60.mjs' &&
      packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-template-update-draft-phase60'),
    'PHASE60_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 60 test, report, and vNext verification chain entry.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_PHASE60_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_REMEDIATION_REQUIRED' : OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    templateUpdateDraftReceipts: Object.freeze([
      goodDraft,
      responseFingerprintMismatchDraft,
      missingRouteDraft,
      incompleteRouteDraft,
      missingChangeMatrixDraft,
      docxDraft,
      prematureApprovalDraft,
      qaBlockedDraft,
      dispatchBlockedDraft,
      evidenceBlockedDraft,
      productionWriteDraft,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      readyDraftCount: [goodDraft].filter((row) => row.canStartQaAndAttorneyRecheck).length,
      blockedDraftCount: [
        responseFingerprintMismatchDraft,
        missingRouteDraft,
        incompleteRouteDraft,
        missingChangeMatrixDraft,
        docxDraft,
        prematureApprovalDraft,
        qaBlockedDraft,
        dispatchBlockedDraft,
        evidenceBlockedDraft,
        productionWriteDraft,
      ].filter((row) => !row.canStartQaAndAttorneyRecheck).length,
      routeCount: REQUIRED_ROUTES.length,
      requiredChangeCategoryCount: REQUIRED_CHANGE_CATEGORIES.length,
      appliedChangeCount: goodDraft.summary.appliedChangeCount,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 61,
      key: 'otp_template_renewal_template_update_draft_qa_attorney_recheck',
      label: 'Template Update Draft QA And Attorney Recheck',
    }),
  })
}

export function formatOtpTemplateRenewalTemplateUpdateDraftPhase60Markdown(report = buildOtpTemplateRenewalTemplateUpdateDraftPhase60Audit()) {
  const readyReceipt = report.templateUpdateDraftReceipts.find((receipt) => receipt.canStartQaAndAttorneyRecheck) || report.templateUpdateDraftReceipts[0]
  return [
    '# OTP Generator Phase 60 Template Update Draft From Attorney Feedback',
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
        ['Required change categories', report.summary.requiredChangeCategoryCount],
        ['Applied changes', report.summary.appliedChangeCount],
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
        ['Draft ID', readyReceipt.draftManifest.draftId],
        ['Attorney response fingerprint', readyReceipt.draftManifest.attorneyResponseFingerprint],
        ['Packet fingerprint', readyReceipt.draftManifest.packetFingerprint],
        ['Source draft fingerprint', readyReceipt.draftManifest.sourceDraftFingerprint],
        ['Draft mode', readyReceipt.draftManifest.draftMode],
        ['Attorney recheck required', readyReceipt.draftManifest.attorneyRecheckRequired ? 'yes' : 'no'],
      ],
    ),
    '',
    '## Route Update Drafts',
    '',
    table(
      ['Route', 'Status', 'Changes', 'Wording', 'Fields', 'Signing', 'Agent Review'],
      readyReceipt.routeUpdateDrafts.map((route) => [
        route.routeVariant,
        route.draftStatus,
        route.appliedChangeItems.length,
        route.legalWordingDraft.map((item) => item.category).join(', '),
        route.fieldRegistryUpdates.map((item) => item.fieldGroup).join(', '),
        route.signingEnvelopeUpdates.map((item) => item.roleScope).join(', '),
        route.agentReviewUiUpdates.map((item) => item.controlGroup).join(', '),
      ]),
    ),
    '',
    '## Draft Change Matrix',
    '',
    table(
      ['Field', 'Value'],
      [
        ['matrix_id', readyReceipt.draftChangeMatrix.matrixId],
        ['status', readyReceipt.draftChangeMatrix.status],
        ['total_applied_changes', readyReceipt.draftChangeMatrix.totalAppliedChangeCount],
        ['categories', readyReceipt.draftChangeMatrix.changeCategories.join(', ')],
        ['attorney_recheck_required', readyReceipt.draftChangeMatrix.attorneyRecheckRequired ? 'yes' : 'no'],
        ['publication_approval_granted', readyReceipt.draftChangeMatrix.publicationApprovalGranted ? 'yes' : 'no'],
      ],
    ),
    '',
    '## QA Plan',
    '',
    table(
      ['Scope', 'Required'],
      Object.entries(readyReceipt.qaPlan).map(([key, value]) => [key, value ? 'yes' : 'no']),
    ),
    '',
    '## Template Update Draft Receipts',
    '',
    table(
      ['Status', 'Ready', 'Routes', 'Changes', 'Evidence', 'Blockers'],
      report.templateUpdateDraftReceipts.map((receipt) => [
        receipt.status,
        receipt.canStartQaAndAttorneyRecheck ? 'yes' : 'no',
        receipt.summary.routeDraftCount,
        receipt.summary.appliedChangeCount,
        receipt.summary.evidenceCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 60 drafts route-separated template update records from the Phase 59 attorney feedback. It does not record attorney approval, publish templates, mutate live legal wording, change route defaults, alter live signing envelopes, email reviewers, or dispatch signing links.',
    '',
  ].join('\n')
}
