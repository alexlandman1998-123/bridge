function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function buildDraftLegalProvenance(template = {}) {
  const metadata = record(template.metadata_json || template.metadataJson)
  return {
    legalApprovalContentDigest: text(metadata.legal_approval_content_digest),
    legalCounselReviewEvidenceDigest: text(metadata.legal_counsel_review_evidence_digest),
    legalB1ManifestDigest: text(metadata.legal_b1_manifest_digest),
    legalApprovedAt: text(metadata.legal_approved_at),
  }
}

export function assessGeneratedDraftVersion({ packet = {}, template = {}, version = {} } = {}) {
  const validation = record(version.validation_summary_json || version.validationSummaryJson)
  const provenance = record(validation.render_provenance || validation.renderProvenance)
  const legal = buildDraftLegalProvenance(template)
  const missing = Array.isArray(version.placeholders_missing_json || version.placeholdersMissingJson)
    ? (version.placeholders_missing_json || version.placeholdersMissingJson)
      .filter((placeholder) => placeholder?.required !== false)
    : []
  const reasons = []
  const packetType = text(packet.packet_type || packet.packetType).toLowerCase()
  const templateId = text(template.id)
  const packetTemplateId = text(packet.template_id || packet.templateId)
  const generatedAt = text(version.generated_at || version.generatedAt || provenance.generatedAt)

  if (!['otp', 'mandate'].includes(packetType)) reasons.push('D1_PACKET_TYPE_UNSUPPORTED')
  if (!templateId || packetTemplateId !== templateId || text(provenance.templateId) !== templateId) reasons.push('D1_TEMPLATE_PROVENANCE_MISMATCH')
  if (text(version.render_status || version.renderStatus).toLowerCase() !== 'generated') reasons.push('D1_VERSION_NOT_GENERATED')
  if (!text(version.rendered_file_path || version.renderedFilePath) && !text(version.rendered_file_url || version.renderedFileUrl) && !text(version.rendered_document_id || version.renderedDocumentId)) reasons.push('D1_DRAFT_ARTIFACT_MISSING')
  if (missing.length) reasons.push('D1_UNRESOLVED_PLACEHOLDERS')
  if (validation.generationStatus !== 'generated' || validation.previewOnly === true) reasons.push('D1_NOT_A_PERSISTED_DRAFT')
  if (!text(provenance.templateVersion)) reasons.push('D1_TEMPLATE_VERSION_MISSING')
  for (const key of ['sectionManifestHash', 'placeholderHash', 'generationPayloadHash', 'contentFingerprint']) if (!text(provenance[key])) reasons.push(`D1_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}_MISSING`)
  if (!legal.legalApprovalContentDigest || provenance.legalApprovalContentDigest !== legal.legalApprovalContentDigest) reasons.push('D1_LEGAL_CONTENT_BINDING_MISSING')
  if (!legal.legalCounselReviewEvidenceDigest || provenance.legalCounselReviewEvidenceDigest !== legal.legalCounselReviewEvidenceDigest) reasons.push('D1_COUNSEL_EVIDENCE_BINDING_MISSING')
  if (!legal.legalB1ManifestDigest || provenance.legalB1ManifestDigest !== legal.legalB1ManifestDigest) reasons.push('D1_B1_MANIFEST_BINDING_MISSING')
  if (!legal.legalApprovedAt || provenance.legalApprovedAt !== legal.legalApprovedAt) reasons.push('D1_LEGAL_APPROVAL_TIME_BINDING_MISSING')
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) reasons.push('D1_GENERATED_AT_MISSING')
  if (Number.isFinite(Date.parse(generatedAt)) && Number.isFinite(Date.parse(legal.legalApprovedAt)) && Date.parse(generatedAt) < Date.parse(legal.legalApprovedAt)) reasons.push('D1_DRAFT_PREDATES_APPROVAL')

  return { ready: reasons.length === 0, reasons: [...new Set(reasons)], packetType: packetType || null, packetId: text(packet.id) || null, templateId: templateId || null, versionId: text(version.id) || null, generatedAt: generatedAt || null, provenance }
}

export function assertGeneratedDraftVersion(input = {}) {
  const assessment = assessGeneratedDraftVersion(input)
  if (assessment.ready) return assessment
  const error = new Error('The generated legal draft is missing required template, legal-approval, or render provenance.')
  error.code = 'DRAFT_GENERATION_PROVENANCE_INCOMPLETE'
  error.details = assessment
  throw error
}
