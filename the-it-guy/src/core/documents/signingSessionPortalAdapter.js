import { assertCanonicalSigningSession } from './signingSessionContract.js'
import { buildSigningCompletion } from './signingCompletionContract.js'

export function adaptCanonicalSigningSessionToPortal(value = {}, { completion = null } = {}) {
  const canonical = assertCanonicalSigningSession(value)
  return {
    canonicalSigningSession: canonical,
    completion: completion ? buildSigningCompletion(completion) : null,
    signer: {
      id: canonical.signer.id,
      signer_name: canonical.signer.name,
      signer_email: canonical.signer.email,
      signer_role: canonical.signer.role,
      signing_order: canonical.signer.order,
      status: canonical.signer.status,
      token_expires_at: canonical.signer.expiresAt,
      viewed_at: canonical.signer.viewedAt,
      signed_at: canonical.signer.signedAt,
    },
    packet: {
      id: canonical.document.packetId || canonical.document.id,
      packet_type: canonical.document.type,
      title: canonical.document.title,
      status: canonical.session.status,
      current_version_number: canonical.version.number,
      transaction_id: canonical.document.transactionId,
      transaction_reference: canonical.document.transactionReference,
      property_label: canonical.document.propertyLabel,
    },
    version: {
      id: canonical.version.id,
      version_number: canonical.version.number,
      render_status: canonical.version.status,
      rendered_document_id: canonical.version.documentId,
      rendered_file_name: canonical.version.fileName,
      rendered_file_path: canonical.version.pdfPath,
      rendered_file_url: canonical.version.pdfUrl,
      rendered_sha256: canonical.version.pdfSha256,
    },
    fields: canonical.fields.map((field) => ({
      id: field.id,
      signer_role: field.signerRole,
      field_type: field.type,
      page_number: field.pageNumber,
      x_position: field.x,
      y_position: field.y,
      width: field.width,
      height: field.height,
      required: field.required,
      status: field.status,
      completed_at: field.completedAt,
    })),
    fieldSummary: canonical.fieldSummary,
    signingOrder: canonical.signingOrder,
    documentPreviewUrl: canonical.version.pdfUrl,
    previewData: {
      packetType: canonical.document.type,
      title: canonical.document.title,
      previewHtml: canonical.presentation.previewHtml,
      placeholders: canonical.presentation.placeholders,
      sectionManifest: canonical.presentation.sectionManifest,
      branding: canonical.presentation.branding,
    },
    sessionBinding: {
      contract: canonical.binding.contract,
      versionId: canonical.binding.versionId,
      documentId: canonical.binding.documentId,
      bindingKey: canonical.binding.bindingKey,
      certified: canonical.binding.certified,
      exactVersionBound: canonical.binding.exactVersionBound,
    },
  }
}

export function completePortalSessionField(session = {}, fieldId = '', completedAt = new Date().toISOString()) {
  const targetId = String(fieldId || '').trim()
  return {
    ...session,
    signer: {
      ...(session.signer || {}),
      status: 'signed',
      signed_at: completedAt,
    },
    fields: (Array.isArray(session.fields) ? session.fields : []).map((field) =>
      String(field?.id || '').trim() === targetId
        ? { ...field, status: 'completed', completed_at: completedAt }
        : field,
    ),
  }
}
