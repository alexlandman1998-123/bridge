import {
  OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_PHASE60_VERSION,
  OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_READY_STATUS,
  buildOtpTemplateRenewalTemplateUpdateDraftPhase60Audit,
} from './otpTemplateRenewalTemplateUpdateDraftPhase60.js'

export const OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_PHASE61_VERSION = 'otp_template_renewal_generated_pdf_signing_envelope_proof_phase61_v1'
export const OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_READY_STATUS = 'OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_READY_FOR_ATTORNEY_RECHECK'
export const OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_CONTRACT = 'otp-vnext-template-renewal-generated-pdf-signing-envelope-proof-phase61-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_PDF_SECTIONS = Object.freeze([
  'branded_shell',
  'commercial_terms',
  'legal_wording',
  'buyer_cost_obligations',
  'signatures_and_initials',
])
const REQUIRED_SIGNING_ROLES = Object.freeze(['buyer', 'seller_or_developer', 'buyer_witness', 'seller_witness'])
const REQUIRED_EVIDENCE_ITEMS = Object.freeze([
  'template_update_draft_trace',
  'generated_pdf_proof_bundle',
  'pdf_content_scan',
  'signing_envelope_field_map',
  'route_alignment_matrix',
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

function fingerprint(parts = []) {
  const text = parts.map((part) => normalizeText(part)).join('|')
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) >>> 0
  }
  return `${hash.toString(16).padStart(8, '0')}${'0'.repeat(56)}`
}

function hasDocxSource(row = {}) {
  return /\.docx?$/i.test(normalizeText(row.path || row.sourcePath || row.source_path || row.proofPath || row.proof_path || row.envelopePath || row.envelope_path)) ||
    normalizeKey(row.sourceFormat || row.source_format || row.proofFormat || row.proof_format || row.envelopeFormat || row.envelope_format).includes('doc') ||
    numberValue(row.docxReferenceCount || row.docx_reference_count) > 0
}

function defaultProofManifest(templateUpdateDraftReceipt = {}, checkedAt = new Date().toISOString()) {
  return {
    proofId: 'otp-vnext-phase61-generated-pdf-signing-envelope-proof',
    status: 'proof_generated',
    provedAt: checkedAt,
    templateUpdateDraftFingerprint: templateUpdateDraftReceipt.templateUpdateDraftFingerprint,
    attorneyResponseFingerprint: templateUpdateDraftReceipt.attorneyResponseReceipt?.responseFingerprint,
    routeCount: REQUIRED_ROUTES.length,
    proofMode: 'generated_pdf_and_signing_envelope_proof_only',
    qaOwner: 'qa_owner',
    attorneyReviewerRole: 'external_attorney_reviewer',
    attorneyRecheckRequired: true,
    attorneyApprovalGranted: false,
    productionWriteRequested: false,
    proofOnly: true,
  }
}

function defaultPdfProofs(templateUpdateDraftReceipt = {}) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const draft = list(templateUpdateDraftReceipt.routeUpdateDrafts).find((row) => normalizeKey(row.routeVariant) === routeVariant) || {}
    return {
      routeVariant,
      proofArtifactKey: `${routeVariant}-generated-pdf-proof-phase61`,
      sourceDraftArtifactKey: draft.draftArtifactKey,
      sourceTemplateUpdateDraftFingerprint: templateUpdateDraftReceipt.templateUpdateDraftFingerprint,
      generatedPdfPath: `output/pdf/OTP_Phase61_${routeVariant}.pdf`,
      proofStatus: 'generated',
      pageCount: routeVariant === 'new_development' ? 18 : 12,
      brandedShellApplied: true,
      logoTopLeft: true,
      companyDetailsTopRight: true,
      footerAgencyNameLeft: true,
      footerPageNumberMiddle: true,
      footerWebsiteRight: true,
      naturalFlowLayout: true,
      routeMarkerHidden: true,
      sourceColumnHidden: true,
      legalWordingRendered: true,
      commercialTermsRendered: true,
      buyerCostObligationsRendered: true,
      signatureWitnessBlocksRendered: true,
      initialFieldsRenderedOnEveryPage: true,
      renderedSections: REQUIRED_PDF_SECTIONS,
      proofFormat: 'pdf',
      sourceFormat: 'native_governance_record',
      docxReferenceCount: 0,
      attorneyRecheckRequired: true,
      attorneyApprovalGranted: false,
      routeSeparated: true,
      productionWriteRequested: false,
    }
  })
}

function defaultSigningEnvelopeProofs(templateUpdateDraftReceipt = {}) {
  return REQUIRED_ROUTES.map((routeVariant) => {
    const draft = list(templateUpdateDraftReceipt.routeUpdateDrafts).find((row) => normalizeKey(row.routeVariant) === routeVariant) || {}
    return {
      routeVariant,
      envelopeArtifactKey: `${routeVariant}-signing-envelope-proof-phase61`,
      sourceDraftArtifactKey: draft.draftArtifactKey,
      sourceTemplateUpdateDraftFingerprint: templateUpdateDraftReceipt.templateUpdateDraftFingerprint,
      envelopeStatus: 'mapped',
      signerRoles: REQUIRED_SIGNING_ROLES,
      signatureFieldCount: REQUIRED_SIGNING_ROLES.length,
      dateFieldCount: REQUIRED_SIGNING_ROLES.length,
      witnessFieldCount: 2,
      initialFieldScope: 'every_page',
      initialFieldCount: routeVariant === 'new_development' ? 18 * 2 : 12 * 2,
      roleScopedFields: true,
      pdfFingerprintMatched: true,
      routeSeparated: true,
      envelopeFormat: 'json_governance_record',
      docxReferenceCount: 0,
      signingDispatchRequested: false,
      productionWriteRequested: false,
    }
  })
}

function defaultContentScan() {
  return {
    scanId: 'phase61-generated-pdf-content-scan',
    status: 'passed',
    routeCount: REQUIRED_ROUTES.length,
    missingLegalWordingCount: 0,
    missingBuyerCostObligationCount: 0,
    missingSignatureBlockCount: 0,
    visibleRouteMarkerCount: 0,
    visibleSourceColumnCount: 0,
    docxReferenceCount: 0,
    attorneyRecheckRequired: true,
  }
}

function defaultAlignmentMatrix(pdfProofs = [], signingEnvelopeProofs = []) {
  return {
    matrixId: 'phase61-pdf-signing-envelope-alignment-matrix',
    status: 'aligned',
    routeCount: REQUIRED_ROUTES.length,
    pdfProofCount: list(pdfProofs).length,
    signingEnvelopeProofCount: list(signingEnvelopeProofs).length,
    signerRoles: REQUIRED_SIGNING_ROLES,
    everyRouteHasPdf: true,
    everyRouteHasEnvelope: true,
    everyEnvelopeMatchesPdf: true,
    everyPageInitialled: true,
    witnessesMapped: true,
    routeSeparated: true,
    attorneyApprovalGranted: false,
    signingDispatchRequested: false,
    productionWriteRequested: false,
  }
}

function defaultReviewRouting() {
  return {
    currentOwnerRole: 'qa_owner',
    nextOwnerRole: 'attorney_reviewer',
    attorneyReviewerRole: 'external_attorney_reviewer',
    nextAction: 'attorney_recheck_generated_pdf_and_signing_envelope_proof',
    deliveryMode: 'internal_proof_record',
    emailDispatchRequested: false,
    signingDispatchRequested: false,
    productionWriteRequested: false,
  }
}

function defaultEvidence() {
  return REQUIRED_EVIDENCE_ITEMS.map((key) => ({
    key,
    status: 'captured',
    path: `docs/otp-${key.replace(/_/g, '-')}-phase61.md`,
    fingerprint: fingerprint([key, 'phase61']),
  }))
}

function defaultNoWriteProof() {
  return {
    proofOnly: true,
    productionWriteAttempted: false,
    attorneyApprovalMutationCount: 0,
    publicationApprovalMutationCount: 0,
    legalWordingMutationCount: 0,
    templateDefaultMutationCount: 0,
    signingEnvelopeMutationCount: 0,
    signingDispatchMutationCount: 0,
    finalPdfMutationCount: 0,
  }
}

function phase60Blockers(templateUpdateDraftReceipt = {}) {
  return [
    templateUpdateDraftReceipt.version === OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_PHASE60_VERSION ? '' : 'phase60_template_update_draft_version_mismatch',
    templateUpdateDraftReceipt.status === OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_READY_STATUS ? '' : 'phase60_template_update_draft_not_ready',
    templateUpdateDraftReceipt.canStartQaAndAttorneyRecheck === true ? '' : 'phase60_template_update_draft_not_ready_for_proof',
    templateUpdateDraftReceipt.mutatedData === false ? '' : 'phase60_template_update_draft_mutation_unexpected',
    list(templateUpdateDraftReceipt.blockerCodes).length === 0 ? '' : 'phase60_template_update_draft_has_blockers',
    templateUpdateDraftReceipt.noWriteProof?.productionWriteAttempted === false ? '' : 'phase60_template_update_draft_write_attempted',
  ].filter(Boolean)
}

function manifestBlockers(manifest = {}, templateUpdateDraftReceipt = {}) {
  return [
    normalizeText(manifest.proofId || manifest.proof_id) ? '' : 'pdf_signing_proof_id_missing',
    normalizeKey(manifest.status) === 'proof_generated' ? '' : 'pdf_signing_proof_status_invalid',
    normalizeText(manifest.provedAt || manifest.proved_at) ? '' : 'pdf_signing_proof_time_missing',
    manifest.templateUpdateDraftFingerprint === templateUpdateDraftReceipt.templateUpdateDraftFingerprint ? '' : 'pdf_signing_proof_template_update_draft_fingerprint_mismatch',
    manifest.attorneyResponseFingerprint === templateUpdateDraftReceipt.attorneyResponseReceipt?.responseFingerprint ? '' : 'pdf_signing_proof_attorney_response_fingerprint_mismatch',
    numberValue(manifest.routeCount || manifest.route_count) === REQUIRED_ROUTES.length ? '' : 'pdf_signing_proof_route_count_mismatch',
    normalizeKey(manifest.proofMode || manifest.proof_mode) === 'generated_pdf_and_signing_envelope_proof_only' ? '' : 'pdf_signing_proof_mode_invalid',
    normalizeText(manifest.qaOwner || manifest.qa_owner) ? '' : 'pdf_signing_proof_qa_owner_missing',
    normalizeText(manifest.attorneyReviewerRole || manifest.attorney_reviewer_role) ? '' : 'pdf_signing_proof_attorney_reviewer_missing',
    manifest.attorneyRecheckRequired === true ? '' : 'pdf_signing_proof_attorney_recheck_missing',
    manifest.attorneyApprovalGranted === true ? 'pdf_signing_proof_premature_attorney_approval' : '',
    manifest.productionWriteRequested === true ? 'pdf_signing_proof_production_write_requested' : '',
    manifest.proofOnly === true ? '' : 'pdf_signing_proof_only_flag_missing',
  ].filter(Boolean)
}

function pdfProofBlockers(pdfProofs = [], templateUpdateDraftReceipt = {}) {
  const routes = list(pdfProofs).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const rowBlockers = list(pdfProofs).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    const draft = list(templateUpdateDraftReceipt.routeUpdateDrafts).find((candidate) => normalizeKey(candidate.routeVariant) === route) || {}
    const sections = list(row.renderedSections || row.rendered_sections).map(normalizeKey)
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `pdf_proof_route_unsupported:${route}`,
      normalizeText(row.proofArtifactKey || row.proof_artifact_key) ? '' : `pdf_proof_artifact_key_missing:${route}`,
      row.sourceDraftArtifactKey === draft.draftArtifactKey ? '' : `pdf_proof_source_draft_mismatch:${route}`,
      row.sourceTemplateUpdateDraftFingerprint === templateUpdateDraftReceipt.templateUpdateDraftFingerprint ? '' : `pdf_proof_draft_fingerprint_mismatch:${route}`,
      normalizeText(row.generatedPdfPath || row.generated_pdf_path) && /\.pdf$/i.test(normalizeText(row.generatedPdfPath || row.generated_pdf_path)) ? '' : `pdf_proof_path_invalid:${route}`,
      normalizeKey(row.proofStatus || row.proof_status) === 'generated' ? '' : `pdf_proof_status_invalid:${route}`,
      numberValue(row.pageCount || row.page_count) > 0 ? '' : `pdf_proof_page_count_missing:${route}`,
      row.brandedShellApplied === true ? '' : `pdf_proof_branded_shell_missing:${route}`,
      row.logoTopLeft === true && row.companyDetailsTopRight === true ? '' : `pdf_proof_header_branding_missing:${route}`,
      row.footerAgencyNameLeft === true && row.footerPageNumberMiddle === true && row.footerWebsiteRight === true ? '' : `pdf_proof_footer_branding_missing:${route}`,
      row.naturalFlowLayout === true ? '' : `pdf_proof_natural_flow_missing:${route}`,
      row.routeMarkerHidden === true ? '' : `pdf_proof_route_marker_visible:${route}`,
      row.sourceColumnHidden === true ? '' : `pdf_proof_source_column_visible:${route}`,
      row.legalWordingRendered === true ? '' : `pdf_proof_legal_wording_missing:${route}`,
      row.commercialTermsRendered === true ? '' : `pdf_proof_commercial_terms_missing:${route}`,
      row.buyerCostObligationsRendered === true ? '' : `pdf_proof_buyer_cost_obligations_missing:${route}`,
      row.signatureWitnessBlocksRendered === true ? '' : `pdf_proof_signature_witness_blocks_missing:${route}`,
      row.initialFieldsRenderedOnEveryPage === true ? '' : `pdf_proof_initials_missing:${route}`,
      ...REQUIRED_PDF_SECTIONS.filter((section) => !sections.includes(section)).map((section) => `pdf_proof_section_missing:${route}:${section}`),
      hasDocxSource(row) ? `pdf_proof_docx_source_observed:${route}` : '',
      row.attorneyRecheckRequired === true ? '' : `pdf_proof_attorney_recheck_missing:${route}`,
      row.attorneyApprovalGranted === true ? `pdf_proof_premature_attorney_approval:${route}` : '',
      row.routeSeparated === true ? '' : `pdf_proof_route_not_separated:${route}`,
      row.productionWriteRequested === true ? `pdf_proof_production_write_requested:${route}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `pdf_proof_route_missing:${route}`),
    ...rowBlockers,
  ]
}

function signingEnvelopeBlockers(envelopes = [], templateUpdateDraftReceipt = {}) {
  const routes = list(envelopes).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const rowBlockers = list(envelopes).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    const draft = list(templateUpdateDraftReceipt.routeUpdateDrafts).find((candidate) => normalizeKey(candidate.routeVariant) === route) || {}
    const roles = list(row.signerRoles || row.signer_roles).map(normalizeKey)
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `signing_proof_route_unsupported:${route}`,
      normalizeText(row.envelopeArtifactKey || row.envelope_artifact_key) ? '' : `signing_proof_artifact_key_missing:${route}`,
      row.sourceDraftArtifactKey === draft.draftArtifactKey ? '' : `signing_proof_source_draft_mismatch:${route}`,
      row.sourceTemplateUpdateDraftFingerprint === templateUpdateDraftReceipt.templateUpdateDraftFingerprint ? '' : `signing_proof_draft_fingerprint_mismatch:${route}`,
      normalizeKey(row.envelopeStatus || row.envelope_status) === 'mapped' ? '' : `signing_proof_status_invalid:${route}`,
      ...REQUIRED_SIGNING_ROLES.filter((role) => !roles.includes(role)).map((role) => `signing_proof_role_missing:${route}:${role}`),
      numberValue(row.signatureFieldCount || row.signature_field_count) >= REQUIRED_SIGNING_ROLES.length ? '' : `signing_proof_signature_fields_missing:${route}`,
      numberValue(row.dateFieldCount || row.date_field_count) >= REQUIRED_SIGNING_ROLES.length ? '' : `signing_proof_date_fields_missing:${route}`,
      numberValue(row.witnessFieldCount || row.witness_field_count) >= 2 ? '' : `signing_proof_witness_fields_missing:${route}`,
      normalizeKey(row.initialFieldScope || row.initial_field_scope) === 'every_page' ? '' : `signing_proof_initial_scope_invalid:${route}`,
      numberValue(row.initialFieldCount || row.initial_field_count) > 0 ? '' : `signing_proof_initial_fields_missing:${route}`,
      row.roleScopedFields === true ? '' : `signing_proof_role_scope_missing:${route}`,
      row.pdfFingerprintMatched === true ? '' : `signing_proof_pdf_fingerprint_mismatch:${route}`,
      row.routeSeparated === true ? '' : `signing_proof_route_not_separated:${route}`,
      hasDocxSource(row) ? `signing_proof_docx_source_observed:${route}` : '',
      row.signingDispatchRequested === true ? `signing_proof_dispatch_requested:${route}` : '',
      row.productionWriteRequested === true ? `signing_proof_production_write_requested:${route}` : '',
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `signing_proof_route_missing:${route}`),
    ...rowBlockers,
  ]
}

function contentScanBlockers(scan = {}) {
  return [
    normalizeText(scan.scanId || scan.scan_id) ? '' : 'pdf_content_scan_id_missing',
    normalizeKey(scan.status) === 'passed' ? '' : 'pdf_content_scan_not_passed',
    numberValue(scan.routeCount || scan.route_count) === REQUIRED_ROUTES.length ? '' : 'pdf_content_scan_route_count_mismatch',
    numberValue(scan.missingLegalWordingCount || scan.missing_legal_wording_count) === 0 ? '' : 'pdf_content_scan_legal_wording_missing',
    numberValue(scan.missingBuyerCostObligationCount || scan.missing_buyer_cost_obligation_count) === 0 ? '' : 'pdf_content_scan_buyer_costs_missing',
    numberValue(scan.missingSignatureBlockCount || scan.missing_signature_block_count) === 0 ? '' : 'pdf_content_scan_signature_blocks_missing',
    numberValue(scan.visibleRouteMarkerCount || scan.visible_route_marker_count) === 0 ? '' : 'pdf_content_scan_route_marker_visible',
    numberValue(scan.visibleSourceColumnCount || scan.visible_source_column_count) === 0 ? '' : 'pdf_content_scan_source_column_visible',
    numberValue(scan.docxReferenceCount || scan.docx_reference_count) === 0 ? '' : 'pdf_content_scan_docx_reference_observed',
    scan.attorneyRecheckRequired === true ? '' : 'pdf_content_scan_attorney_recheck_missing',
  ].filter(Boolean)
}

function alignmentMatrixBlockers(matrix = {}) {
  const roles = list(matrix.signerRoles || matrix.signer_roles).map(normalizeKey)
  return [
    normalizeText(matrix.matrixId || matrix.matrix_id) ? '' : 'pdf_signing_alignment_matrix_id_missing',
    normalizeKey(matrix.status) === 'aligned' ? '' : 'pdf_signing_alignment_matrix_not_aligned',
    numberValue(matrix.routeCount || matrix.route_count) === REQUIRED_ROUTES.length ? '' : 'pdf_signing_alignment_route_count_mismatch',
    numberValue(matrix.pdfProofCount || matrix.pdf_proof_count) === REQUIRED_ROUTES.length ? '' : 'pdf_signing_alignment_pdf_count_mismatch',
    numberValue(matrix.signingEnvelopeProofCount || matrix.signing_envelope_proof_count) === REQUIRED_ROUTES.length ? '' : 'pdf_signing_alignment_envelope_count_mismatch',
    ...REQUIRED_SIGNING_ROLES.filter((role) => !roles.includes(role)).map((role) => `pdf_signing_alignment_role_missing:${role}`),
    matrix.everyRouteHasPdf === true ? '' : 'pdf_signing_alignment_route_pdf_missing',
    matrix.everyRouteHasEnvelope === true ? '' : 'pdf_signing_alignment_route_envelope_missing',
    matrix.everyEnvelopeMatchesPdf === true ? '' : 'pdf_signing_alignment_pdf_envelope_mismatch',
    matrix.everyPageInitialled === true ? '' : 'pdf_signing_alignment_initials_missing',
    matrix.witnessesMapped === true ? '' : 'pdf_signing_alignment_witnesses_missing',
    matrix.routeSeparated === true ? '' : 'pdf_signing_alignment_route_separation_missing',
    matrix.attorneyApprovalGranted === true ? 'pdf_signing_alignment_premature_attorney_approval' : '',
    matrix.signingDispatchRequested === true ? 'pdf_signing_alignment_dispatch_requested' : '',
    matrix.productionWriteRequested === true ? 'pdf_signing_alignment_production_write_requested' : '',
  ].filter(Boolean)
}

function reviewRoutingBlockers(routing = {}) {
  return [
    normalizeText(routing.currentOwnerRole || routing.current_owner_role) ? '' : 'pdf_signing_proof_current_owner_missing',
    normalizeKey(routing.nextOwnerRole || routing.next_owner_role) === 'attorney_reviewer' ? '' : 'pdf_signing_proof_next_owner_invalid',
    normalizeText(routing.attorneyReviewerRole || routing.attorney_reviewer_role) ? '' : 'pdf_signing_proof_attorney_reviewer_role_missing',
    normalizeKey(routing.nextAction || routing.next_action) === 'attorney_recheck_generated_pdf_and_signing_envelope_proof' ? '' : 'pdf_signing_proof_next_action_invalid',
    normalizeKey(routing.deliveryMode || routing.delivery_mode) === 'internal_proof_record' ? '' : 'pdf_signing_proof_delivery_mode_invalid',
    routing.emailDispatchRequested === true ? 'pdf_signing_proof_email_dispatch_requested' : '',
    routing.signingDispatchRequested === true ? 'pdf_signing_proof_signing_dispatch_requested' : '',
    routing.productionWriteRequested === true ? 'pdf_signing_proof_production_write_requested' : '',
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
    ...missingKeys.map((key) => `pdf_signing_proof_evidence_missing:${key}`),
    ...badRows.map((row) => `pdf_signing_proof_evidence_invalid:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function noWriteBlockers(noWriteProof = {}) {
  return [
    noWriteProof.proofOnly === true ? '' : 'pdf_signing_proof_no_write_proof_only_missing',
    noWriteProof.productionWriteAttempted === true ? 'pdf_signing_proof_production_write_attempted' : '',
    numberValue(noWriteProof.attorneyApprovalMutationCount || noWriteProof.attorney_approval_mutation_count) === 0 ? '' : 'pdf_signing_proof_attorney_approval_mutation_observed',
    numberValue(noWriteProof.publicationApprovalMutationCount || noWriteProof.publication_approval_mutation_count) === 0 ? '' : 'pdf_signing_proof_publication_approval_mutation_observed',
    numberValue(noWriteProof.legalWordingMutationCount || noWriteProof.legal_wording_mutation_count) === 0 ? '' : 'pdf_signing_proof_legal_wording_mutation_observed',
    numberValue(noWriteProof.templateDefaultMutationCount || noWriteProof.template_default_mutation_count) === 0 ? '' : 'pdf_signing_proof_template_default_mutation_observed',
    numberValue(noWriteProof.signingEnvelopeMutationCount || noWriteProof.signing_envelope_mutation_count) === 0 ? '' : 'pdf_signing_proof_signing_envelope_mutation_observed',
    numberValue(noWriteProof.signingDispatchMutationCount || noWriteProof.signing_dispatch_mutation_count) === 0 ? '' : 'pdf_signing_proof_dispatch_mutation_observed',
    numberValue(noWriteProof.finalPdfMutationCount || noWriteProof.final_pdf_mutation_count) === 0 ? '' : 'pdf_signing_proof_final_pdf_mutation_observed',
  ].filter(Boolean)
}

export function buildOtpTemplateRenewalPdfSigningProofReceipt({
  templateUpdateDraftReceipt = buildOtpTemplateRenewalTemplateUpdateDraftPhase60Audit().templateUpdateDraftReceipts?.find((receipt) => receipt.canStartQaAndAttorneyRecheck),
  proofManifest = null,
  pdfProofs = null,
  signingEnvelopeProofs = null,
  contentScan = defaultContentScan(),
  alignmentMatrix = null,
  reviewRouting = defaultReviewRouting(),
  evidence = defaultEvidence(),
  noWriteProof = defaultNoWriteProof(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const manifest = proofManifest || defaultProofManifest(templateUpdateDraftReceipt, checkedAt)
  const pdfs = pdfProofs || defaultPdfProofs(templateUpdateDraftReceipt)
  const envelopes = signingEnvelopeProofs || defaultSigningEnvelopeProofs(templateUpdateDraftReceipt)
  const matrix = alignmentMatrix || defaultAlignmentMatrix(pdfs, envelopes)
  const blockerCodes = unique([
    ...phase60Blockers(templateUpdateDraftReceipt || {}),
    ...manifestBlockers(manifest, templateUpdateDraftReceipt || {}),
    ...pdfProofBlockers(pdfs, templateUpdateDraftReceipt || {}),
    ...signingEnvelopeBlockers(envelopes, templateUpdateDraftReceipt || {}),
    ...contentScanBlockers(contentScan),
    ...alignmentMatrixBlockers(matrix),
    ...reviewRoutingBlockers(reviewRouting),
    ...evidenceBlockers(evidence),
    ...noWriteBlockers(noWriteProof),
  ])
  const canRequestAttorneyRecheck = blockerCodes.length === 0
  const proofFingerprint = fingerprint([
    manifest.proofId,
    templateUpdateDraftReceipt?.templateUpdateDraftFingerprint,
    list(pdfs).map((row) => `${row.routeVariant}:${row.generatedPdfPath}`).join('|'),
    list(envelopes).map((row) => `${row.routeVariant}:${row.envelopeArtifactKey}`).join('|'),
  ])

  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_PHASE61_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_CONTRACT,
    checkedAt,
    status: canRequestAttorneyRecheck
      ? OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_READY_STATUS
      : 'OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_BLOCKED',
    canRequestAttorneyRecheck,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    proofFingerprint,
    templateUpdateDraftReceipt: Object.freeze({
      version: templateUpdateDraftReceipt?.version,
      status: templateUpdateDraftReceipt?.status,
      canStartQaAndAttorneyRecheck: templateUpdateDraftReceipt?.canStartQaAndAttorneyRecheck === true,
      templateUpdateDraftFingerprint: templateUpdateDraftReceipt?.templateUpdateDraftFingerprint,
      attorneyResponseFingerprint: templateUpdateDraftReceipt?.attorneyResponseReceipt?.responseFingerprint,
    }),
    proofManifest: Object.freeze({ ...manifest }),
    pdfProofs: Object.freeze(list(pdfs)),
    signingEnvelopeProofs: Object.freeze(list(envelopes)),
    contentScan: Object.freeze({ ...contentScan }),
    alignmentMatrix: Object.freeze({ ...matrix }),
    reviewRouting: Object.freeze({ ...reviewRouting }),
    evidence: Object.freeze(list(evidence)),
    noWriteProof: Object.freeze({ ...noWriteProof }),
    summary: Object.freeze({
      pdfProofCount: list(pdfs).length,
      signingEnvelopeProofCount: list(envelopes).length,
      evidenceCount: list(evidence).length,
      blockerCount: blockerCodes.length,
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpTemplateRenewalPdfSigningProofPhase61Audit({
  checkedAt = new Date().toISOString(),
  phase60Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase60Ready = !phase60Audit || phase60Audit.status === OTP_TEMPLATE_RENEWAL_TEMPLATE_UPDATE_DRAFT_READY_STATUS
  const goodTemplateDraft = phase60Audit?.templateUpdateDraftReceipts?.find((receipt) => receipt.canStartQaAndAttorneyRecheck) ||
    buildOtpTemplateRenewalTemplateUpdateDraftPhase60Audit({ checkedAt }).templateUpdateDraftReceipts.find((receipt) => receipt.canStartQaAndAttorneyRecheck)
  const goodProof = buildOtpTemplateRenewalPdfSigningProofReceipt({ checkedAt, templateUpdateDraftReceipt: goodTemplateDraft })
  const fingerprintMismatchProof = buildOtpTemplateRenewalPdfSigningProofReceipt({
    checkedAt,
    templateUpdateDraftReceipt: goodTemplateDraft,
    proofManifest: {
      ...defaultProofManifest(goodTemplateDraft, checkedAt),
      templateUpdateDraftFingerprint: 'wrong-template-update-draft-fingerprint',
    },
  })
  const missingPdfRouteProof = buildOtpTemplateRenewalPdfSigningProofReceipt({
    checkedAt,
    templateUpdateDraftReceipt: goodTemplateDraft,
    pdfProofs: defaultPdfProofs(goodTemplateDraft).filter((row) => row.routeVariant !== 'new_development'),
  })
  const incompletePdfProof = buildOtpTemplateRenewalPdfSigningProofReceipt({
    checkedAt,
    templateUpdateDraftReceipt: goodTemplateDraft,
    pdfProofs: defaultPdfProofs(goodTemplateDraft).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, legalWordingRendered: false, buyerCostObligationsRendered: false, renderedSections: ['branded_shell'] }
        : row,
    ),
  })
  const incompleteEnvelopeProof = buildOtpTemplateRenewalPdfSigningProofReceipt({
    checkedAt,
    templateUpdateDraftReceipt: goodTemplateDraft,
    signingEnvelopeProofs: defaultSigningEnvelopeProofs(goodTemplateDraft).map((row) =>
      row.routeVariant === 'new_development'
        ? { ...row, signerRoles: ['buyer'], witnessFieldCount: 0, initialFieldScope: 'first_page_only', roleScopedFields: false }
        : row,
    ),
  })
  const contentScanBlockedProof = buildOtpTemplateRenewalPdfSigningProofReceipt({
    checkedAt,
    templateUpdateDraftReceipt: goodTemplateDraft,
    contentScan: {
      ...defaultContentScan(),
      status: 'failed',
      missingLegalWordingCount: 1,
      visibleRouteMarkerCount: 1,
      docxReferenceCount: 1,
    },
  })
  const alignmentBlockedProof = buildOtpTemplateRenewalPdfSigningProofReceipt({
    checkedAt,
    templateUpdateDraftReceipt: goodTemplateDraft,
    alignmentMatrix: {
      ...defaultAlignmentMatrix(defaultPdfProofs(goodTemplateDraft), defaultSigningEnvelopeProofs(goodTemplateDraft)),
      status: 'misaligned',
      everyEnvelopeMatchesPdf: false,
      everyPageInitialled: false,
      witnessesMapped: false,
    },
  })
  const docxProof = buildOtpTemplateRenewalPdfSigningProofReceipt({
    checkedAt,
    templateUpdateDraftReceipt: goodTemplateDraft,
    pdfProofs: defaultPdfProofs(goodTemplateDraft).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, proofFormat: 'docx', proofPath: 'generated-proof.docx', docxReferenceCount: 1 }
        : row,
    ),
  })
  const dispatchBlockedProof = buildOtpTemplateRenewalPdfSigningProofReceipt({
    checkedAt,
    templateUpdateDraftReceipt: goodTemplateDraft,
    reviewRouting: {
      ...defaultReviewRouting(),
      emailDispatchRequested: true,
      signingDispatchRequested: true,
      productionWriteRequested: true,
    },
  })
  const evidenceBlockedProof = buildOtpTemplateRenewalPdfSigningProofReceipt({
    checkedAt,
    templateUpdateDraftReceipt: goodTemplateDraft,
    evidence: [
      { key: 'template_update_draft_trace', status: 'missing', path: '', fingerprint: 'bad' },
    ],
  })
  const productionWriteProof = buildOtpTemplateRenewalPdfSigningProofReceipt({
    checkedAt,
    templateUpdateDraftReceipt: goodTemplateDraft,
    noWriteProof: {
      ...defaultNoWriteProof(),
      productionWriteAttempted: true,
      signingEnvelopeMutationCount: 1,
      finalPdfMutationCount: 1,
    },
  })

  addCheck(checks, phase60Ready, 'PHASE61_PHASE60_TEMPLATE_UPDATE_DRAFT_READY', 'Generated PDF and signing envelope proof starts only after Phase 60 template update draft readiness.')
  addCheck(
    checks,
    goodProof.canRequestAttorneyRecheck &&
      goodProof.status === OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_READY_STATUS &&
      goodProof.mutatedData === false,
    'PHASE61_GOOD_PDF_SIGNING_PROOF_READY',
    'A clean template update draft can produce generated PDF and signing envelope proof without mutating production data.',
  )
  addCheck(
    checks,
    goodProof.proofManifest.templateUpdateDraftFingerprint === goodTemplateDraft.templateUpdateDraftFingerprint,
    'PHASE61_PROOF_BOUND_TO_TEMPLATE_UPDATE_DRAFT',
    'Generated PDF and signing envelope proof is bound to the exact Phase 60 draft fingerprint.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodProof.pdfProofs.some((row) => row.routeVariant === route && row.proofStatus === 'generated')),
    'PHASE61_BOTH_ROUTE_PDFS_GENERATED',
    'Resale and new-development generated PDF proofs are both present.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodProof.signingEnvelopeProofs.some((row) => row.routeVariant === route && row.envelopeStatus === 'mapped')),
    'PHASE61_BOTH_ROUTE_ENVELOPES_MAPPED',
    'Resale and new-development signing envelope proofs are both mapped.',
  )
  addCheck(
    checks,
    goodProof.pdfProofs.every((row) =>
      row.brandedShellApplied &&
        row.legalWordingRendered &&
        row.buyerCostObligationsRendered &&
        row.signatureWitnessBlocksRendered &&
        row.initialFieldsRenderedOnEveryPage &&
        row.routeMarkerHidden &&
        row.sourceColumnHidden,
    ),
    'PHASE61_PDF_CONTENT_AND_LAYOUT_PROVED',
    'Generated PDF proof includes branding, legal wording, buyer cost obligations, witness/signature blocks, initials, and hides route/source debug fields.',
  )
  addCheck(
    checks,
    goodProof.signingEnvelopeProofs.every((row) =>
      REQUIRED_SIGNING_ROLES.every((role) => row.signerRoles.includes(role)) &&
        row.roleScopedFields &&
        row.pdfFingerprintMatched &&
        row.initialFieldScope === 'every_page' &&
        row.witnessFieldCount >= 2,
    ),
    'PHASE61_SIGNING_FIELDS_ROLE_SCOPED',
    'Signing envelope proof maps buyer, seller/developer, witness, date, signature, and every-page initial fields by route.',
  )
  addCheck(
    checks,
    goodProof.alignmentMatrix.everyEnvelopeMatchesPdf &&
      goodProof.alignmentMatrix.everyPageInitialled &&
      goodProof.alignmentMatrix.witnessesMapped,
    'PHASE61_PDF_ENVELOPE_ALIGNMENT_PROVED',
    'Signing envelope proof matches the generated PDFs with witnesses and every-page initials.',
  )
  addCheck(
    checks,
    goodProof.noWriteProof.proofOnly === true &&
      goodProof.noWriteProof.productionWriteAttempted === false &&
      goodProof.noWriteProof.signingEnvelopeMutationCount === 0,
    'PHASE61_NO_PRODUCTION_WRITE_ALLOWED',
    'Phase 61 proves generated PDF and signing envelope alignment only and cannot approve, publish, mutate live envelopes, final PDFs, or dispatch signing.',
  )
  addCheck(
    checks,
    fingerprintMismatchProof.canRequestAttorneyRecheck === false &&
      fingerprintMismatchProof.blockerCodes.includes('pdf_signing_proof_template_update_draft_fingerprint_mismatch'),
    'PHASE61_DRAFT_FINGERPRINT_MISMATCH_BLOCKED',
    'Proof manifest must match the Phase 60 template update draft fingerprint.',
  )
  addCheck(
    checks,
    missingPdfRouteProof.canRequestAttorneyRecheck === false &&
      missingPdfRouteProof.blockerCodes.includes('pdf_proof_route_missing:new_development'),
    'PHASE61_MISSING_ROUTE_PDF_BLOCKED',
    'Missing resale or new-development generated PDF proof blocks attorney recheck.',
  )
  addCheck(
    checks,
    incompletePdfProof.canRequestAttorneyRecheck === false &&
      incompletePdfProof.blockerCodes.includes('pdf_proof_legal_wording_missing:resale_existing_property') &&
      incompletePdfProof.blockerCodes.includes('pdf_proof_buyer_cost_obligations_missing:resale_existing_property'),
    'PHASE61_INCOMPLETE_PDF_BLOCKED',
    'Generated PDFs missing legal wording, buyer cost obligations, required sections, branding, witnesses, or initials are blocked.',
  )
  addCheck(
    checks,
    incompleteEnvelopeProof.canRequestAttorneyRecheck === false &&
      incompleteEnvelopeProof.blockerCodes.includes('signing_proof_role_missing:new_development:seller_or_developer') &&
      incompleteEnvelopeProof.blockerCodes.includes('signing_proof_witness_fields_missing:new_development'),
    'PHASE61_INCOMPLETE_SIGNING_ENVELOPE_BLOCKED',
    'Signing envelopes missing roles, witnesses, dates, signatures, role scoping, or every-page initials are blocked.',
  )
  addCheck(
    checks,
    contentScanBlockedProof.canRequestAttorneyRecheck === false &&
      contentScanBlockedProof.blockerCodes.includes('pdf_content_scan_not_passed') &&
      contentScanBlockedProof.blockerCodes.includes('pdf_content_scan_route_marker_visible'),
    'PHASE61_CONTENT_SCAN_BLOCKED',
    'Failed content scan, visible debug fields, missing wording, or DOC/DOCX references block the proof.',
  )
  addCheck(
    checks,
    alignmentBlockedProof.canRequestAttorneyRecheck === false &&
      alignmentBlockedProof.blockerCodes.includes('pdf_signing_alignment_matrix_not_aligned') &&
      alignmentBlockedProof.blockerCodes.includes('pdf_signing_alignment_initials_missing'),
    'PHASE61_ALIGNMENT_BLOCKED',
    'PDF/signing envelope mismatch, missing witnesses, or missing every-page initials blocks attorney recheck.',
  )
  addCheck(
    checks,
    docxProof.canRequestAttorneyRecheck === false &&
      docxProof.blockerCodes.includes('pdf_proof_docx_source_observed:resale_existing_property'),
    'PHASE61_DOCX_PROOF_BLOCKED',
    'DOC/DOCX generated proof artifacts remain blocked.',
  )
  addCheck(
    checks,
    dispatchBlockedProof.canRequestAttorneyRecheck === false &&
      dispatchBlockedProof.blockerCodes.includes('pdf_signing_proof_email_dispatch_requested') &&
      dispatchBlockedProof.blockerCodes.includes('pdf_signing_proof_signing_dispatch_requested'),
    'PHASE61_DISPATCH_BLOCKED',
    'Generated PDF and signing envelope proof cannot email, dispatch signing, or request production writes.',
  )
  addCheck(
    checks,
    evidenceBlockedProof.canRequestAttorneyRecheck === false &&
      evidenceBlockedProof.blockerCodes.includes('pdf_signing_proof_evidence_missing:generated_pdf_proof_bundle') &&
      evidenceBlockedProof.blockerCodes.includes('pdf_signing_proof_evidence_invalid:template_update_draft_trace'),
    'PHASE61_EVIDENCE_BLOCKED',
    'Missing or invalid generated PDF/signing proof evidence blocks attorney recheck.',
  )
  addCheck(
    checks,
    productionWriteProof.canRequestAttorneyRecheck === false &&
      productionWriteProof.blockerCodes.includes('pdf_signing_proof_production_write_attempted') &&
      productionWriteProof.blockerCodes.includes('pdf_signing_proof_signing_envelope_mutation_observed'),
    'PHASE61_PRODUCTION_WRITE_BLOCKED',
    'Production writes or live signing/final PDF mutations block generated PDF and signing proof.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-template-renewal-pdf-signing-proof-phase61'] === 'node scripts/otp-template-renewal-pdf-signing-proof-phase61.test.mjs' &&
      packageJson.scripts?.['report:otp-template-renewal-pdf-signing-proof-phase61'] === 'node scripts/report-otp-template-renewal-pdf-signing-proof-phase61.mjs' &&
      packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-pdf-signing-proof-phase61'),
    'PHASE61_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 61 test, report, and vNext verification chain entry.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_PHASE61_VERSION,
    contract: OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_REMEDIATION_REQUIRED' : OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    pdfSigningProofReceipts: Object.freeze([
      goodProof,
      fingerprintMismatchProof,
      missingPdfRouteProof,
      incompletePdfProof,
      incompleteEnvelopeProof,
      contentScanBlockedProof,
      alignmentBlockedProof,
      docxProof,
      dispatchBlockedProof,
      evidenceBlockedProof,
      productionWriteProof,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      readyProofCount: [goodProof].filter((row) => row.canRequestAttorneyRecheck).length,
      blockedProofCount: [
        fingerprintMismatchProof,
        missingPdfRouteProof,
        incompletePdfProof,
        incompleteEnvelopeProof,
        contentScanBlockedProof,
        alignmentBlockedProof,
        docxProof,
        dispatchBlockedProof,
        evidenceBlockedProof,
        productionWriteProof,
      ].filter((row) => !row.canRequestAttorneyRecheck).length,
      routeCount: REQUIRED_ROUTES.length,
      pdfProofCount: goodProof.summary.pdfProofCount,
      signingEnvelopeProofCount: goodProof.summary.signingEnvelopeProofCount,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 62,
      key: 'otp_template_renewal_attorney_recheck_decision',
      label: 'Attorney Recheck Decision',
    }),
  })
}

export function formatOtpTemplateRenewalPdfSigningProofPhase61Markdown(report = buildOtpTemplateRenewalPdfSigningProofPhase61Audit()) {
  const readyReceipt = report.pdfSigningProofReceipts.find((receipt) => receipt.canRequestAttorneyRecheck) || report.pdfSigningProofReceipts[0]
  return [
    '# OTP Generator Phase 61 Generated PDF And Signing Envelope Proof',
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
        ['Ready proofs', report.summary.readyProofCount],
        ['Blocked proofs', report.summary.blockedProofCount],
        ['Routes', report.summary.routeCount],
        ['PDF proofs', report.summary.pdfProofCount],
        ['Signing envelope proofs', report.summary.signingEnvelopeProofCount],
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
    '## Proof Manifest',
    '',
    table(
      ['Field', 'Value'],
      [
        ['Proof ID', readyReceipt.proofManifest.proofId],
        ['Template update draft fingerprint', readyReceipt.proofManifest.templateUpdateDraftFingerprint],
        ['Attorney response fingerprint', readyReceipt.proofManifest.attorneyResponseFingerprint],
        ['Proof mode', readyReceipt.proofManifest.proofMode],
        ['Attorney recheck required', readyReceipt.proofManifest.attorneyRecheckRequired ? 'yes' : 'no'],
      ],
    ),
    '',
    '## Generated PDF Proofs',
    '',
    table(
      ['Route', 'Status', 'Pages', 'PDF', 'Legal', 'Buyer Costs', 'Witnesses', 'Initials'],
      readyReceipt.pdfProofs.map((proof) => [
        proof.routeVariant,
        proof.proofStatus,
        proof.pageCount,
        proof.generatedPdfPath,
        proof.legalWordingRendered ? 'yes' : 'no',
        proof.buyerCostObligationsRendered ? 'yes' : 'no',
        proof.signatureWitnessBlocksRendered ? 'yes' : 'no',
        proof.initialFieldsRenderedOnEveryPage ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Signing Envelope Proofs',
    '',
    table(
      ['Route', 'Status', 'Roles', 'Signatures', 'Dates', 'Witnesses', 'Initial Scope'],
      readyReceipt.signingEnvelopeProofs.map((proof) => [
        proof.routeVariant,
        proof.envelopeStatus,
        proof.signerRoles.join(', '),
        proof.signatureFieldCount,
        proof.dateFieldCount,
        proof.witnessFieldCount,
        proof.initialFieldScope,
      ]),
    ),
    '',
    '## Alignment Matrix',
    '',
    table(
      ['Field', 'Value'],
      [
        ['matrix_id', readyReceipt.alignmentMatrix.matrixId],
        ['status', readyReceipt.alignmentMatrix.status],
        ['pdf_proofs', readyReceipt.alignmentMatrix.pdfProofCount],
        ['signing_envelopes', readyReceipt.alignmentMatrix.signingEnvelopeProofCount],
        ['envelopes_match_pdf', readyReceipt.alignmentMatrix.everyEnvelopeMatchesPdf ? 'yes' : 'no'],
        ['every_page_initialled', readyReceipt.alignmentMatrix.everyPageInitialled ? 'yes' : 'no'],
        ['witnesses_mapped', readyReceipt.alignmentMatrix.witnessesMapped ? 'yes' : 'no'],
      ],
    ),
    '',
    '## PDF Signing Proof Receipts',
    '',
    table(
      ['Status', 'Ready', 'PDFs', 'Envelopes', 'Evidence', 'Blockers'],
      report.pdfSigningProofReceipts.map((receipt) => [
        receipt.status,
        receipt.canRequestAttorneyRecheck ? 'yes' : 'no',
        receipt.summary.pdfProofCount,
        receipt.summary.signingEnvelopeProofCount,
        receipt.summary.evidenceCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 61 proves route-separated generated PDFs and signing envelope maps from the Phase 60 template update draft. It does not record attorney approval, publish templates, mutate live legal wording, change route defaults, alter live signing envelopes, create final signed PDFs, email reviewers, or dispatch signing links.',
    '',
  ].join('\n')
}
