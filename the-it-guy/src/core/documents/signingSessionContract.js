export const SIGNING_SESSION_CONTRACT = 'arch9-signing-session-v1'
export const SIGNING_DOCUMENT_BINDING_CONTRACT = 'exact-pdf-version-v1'

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function integer(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function normalizeSigningRole(value = '') {
  const normalized = key(value)
  const aliases = {
    agency_representative: 'agent',
    estate_agent: 'agent',
    listing_agent: 'agent',
    buyer: 'purchaser_1',
    client: 'purchaser_1',
    purchaser: 'purchaser_1',
    primary_purchaser: 'purchaser_1',
    purchaser_2: 'purchaser_2',
    secondary_purchaser: 'purchaser_2',
    co_purchaser: 'purchaser_2',
    spouse: 'seller_spouse',
    co_seller: 'seller_spouse',
    seller_2: 'seller_spouse',
    buyer_spouse: 'purchaser_spouse',
    purchaser_spouse: 'purchaser_spouse',
  }
  return aliases[normalized] || normalized || 'signer'
}

export function getSigningRoleLabel(value = '') {
  const role = normalizeSigningRole(value)
  const labels = {
    agent: 'Agency representative',
    seller: 'Seller',
    seller_spouse: "Seller's spouse or co-seller",
    purchaser_1: 'First purchaser',
    purchaser_2: 'Second purchaser',
    purchaser_spouse: "Purchaser's spouse",
    witness_1: 'First witness',
    witness_2: 'Second witness',
    attorney: 'Attorney',
    other: 'Other signer',
    signer: 'Signer',
  }
  return labels[role] || role.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function normalizeField(field = {}, signerRole = '') {
  const source = object(field)
  const role = normalizeSigningRole(source.signerRole || source.signer_role || signerRole)
  return {
    id: text(source.id),
    signerRole: role,
    signerRoleLabel: getSigningRoleLabel(role),
    type: key(source.type || source.fieldType || source.field_type) || 'signature',
    pageNumber: integer(source.pageNumber ?? source.page_number, 1) || 1,
    x: Number(source.x ?? source.xPosition ?? source.x_position) || 0,
    y: Number(source.y ?? source.yPosition ?? source.y_position) || 0,
    width: Number(source.width) || 0,
    height: Number(source.height) || 0,
    required: source.required !== false,
    status: key(source.status) || 'pending',
    completedAt: text(source.completedAt || source.completed_at) || null,
  }
}

export function buildCanonicalSigningSession(input = {}) {
  const source = object(input)
  const document = object(source.document)
  const version = object(source.version)
  const signer = object(source.signer)
  const session = object(source.session)
  const binding = object(source.binding)
  const presentation = object(source.presentation)
  const role = normalizeSigningRole(signer.role || signer.signerRole || signer.signer_role)
  const fields = (Array.isArray(source.fields) ? source.fields : []).map((field) => normalizeField(field, role))
  const requiredFields = fields.filter((field) => field.required)
  const completedFields = requiredFields.filter((field) => field.status === 'completed')
  const versionId = text(version.id || version.versionId || version.version_id)
  const documentId = text(version.documentId || version.document_id || document.id)
  const pdfPath = text(version.pdfPath || version.filePath || version.rendered_file_path)
  const pdfUrl = text(version.pdfUrl || version.previewUrl || version.rendered_file_url)
  const packetId = text(document.packetId || document.packet_id || document.id)
  const exactVersionBound = Boolean(
    binding.exactVersionBound ?? binding.exact_version_bound ??
    (versionId && documentId && (pdfPath || pdfUrl)),
  )

  return {
    contract: SIGNING_SESSION_CONTRACT,
    sessionId: text(source.sessionId || source.session_id || session.id) || [packetId, versionId, text(signer.id)].filter(Boolean).join(':'),
    document: {
      id: text(document.id || packetId || documentId),
      packetId: packetId || null,
      type: key(document.type || document.packetType || document.packet_type) || 'document',
      title: text(document.title) || 'Document',
      transactionId: text(document.transactionId || document.transaction_id) || null,
      transactionReference: text(document.transactionReference || document.transaction_reference) || null,
      propertyLabel: text(document.propertyLabel || document.property_label) || null,
      organisationId: text(document.organisationId || document.organisation_id) || null,
      senderName: text(document.senderName || document.sender_name) || null,
      senderEmail: text(document.senderEmail || document.sender_email).toLowerCase() || null,
    },
    version: {
      id: versionId,
      number: integer(version.number ?? version.versionNumber ?? version.version_number, 1) || 1,
      status: key(version.status || version.renderStatus || version.render_status) || 'generated',
      documentId: documentId || null,
      fileName: text(version.fileName || version.rendered_file_name) || null,
      pdfPath: pdfPath || null,
      pdfUrl: pdfUrl || null,
      pdfSha256: text(version.pdfSha256 || version.sha256 || version.pdf_sha256) || null,
    },
    signer: {
      id: text(signer.id) || null,
      name: text(signer.name || signer.signerName || signer.signer_name) || 'Signer',
      email: text(signer.email || signer.signerEmail || signer.signer_email).toLowerCase() || null,
      role,
      roleLabel: getSigningRoleLabel(role),
      order: integer(signer.order ?? signer.signingOrder ?? signer.signing_order, 1) || 1,
      status: key(signer.status) || 'pending',
      expiresAt: text(signer.expiresAt || signer.token_expires_at) || null,
      viewedAt: text(signer.viewedAt || signer.viewed_at) || null,
      signedAt: text(signer.signedAt || signer.signed_at) || null,
    },
    fields,
    fieldSummary: {
      requiredCount: requiredFields.length,
      completedCount: completedFields.length,
      remainingCount: requiredFields.length - completedFields.length,
      requiredInitials: requiredFields.filter((field) => field.type === 'initial').length,
      requiredSignatures: requiredFields.filter((field) => field.type === 'signature').length,
    },
    signingOrder: (Array.isArray(source.signingOrder) ? source.signingOrder : [])
      .map((item) => {
        const row = object(item)
        const itemRole = normalizeSigningRole(row.role || row.signer_role)
        return {
          signerId: text(row.signerId || row.signer_id) || null,
          role: itemRole,
          roleLabel: getSigningRoleLabel(itemRole),
          order: integer(row.order ?? row.signing_order, 1) || 1,
          status: key(row.status) || 'pending',
        }
      })
      .sort((left, right) => left.order - right.order),
    session: {
      status: key(session.status || signer.status) || 'pending',
      expiresAt: text(session.expiresAt || signer.expiresAt || signer.token_expires_at) || null,
      consentStatus: key(session.consentStatus || session.consent_status) || 'not_recorded',
    },
    binding: {
      contract: SIGNING_DOCUMENT_BINDING_CONTRACT,
      packetId: packetId || null,
      versionId: versionId || null,
      documentId: documentId || null,
      pdfPath: pdfPath || null,
      pdfSha256: text(binding.pdfSha256 || binding.pdf_sha256 || version.pdfSha256 || version.sha256) || null,
      bindingKey: text(binding.bindingKey || binding.binding_key) || [packetId || documentId, versionId, pdfPath].filter(Boolean).join(':'),
      exactVersionBound,
      certified: binding.certified === true,
    },
    presentation: {
      instructions: text(presentation.instructions) || null,
      branding: object(presentation.branding),
      previewHtml: text(presentation.previewHtml || presentation.preview_html) || null,
      sectionManifest: Array.isArray(presentation.sectionManifest) ? presentation.sectionManifest : [],
      placeholders: object(presentation.placeholders),
    },
  }
}

export function assertCanonicalSigningSession(value = {}) {
  const session = buildCanonicalSigningSession(value)
  const issues = []
  if (session.contract !== SIGNING_SESSION_CONTRACT) issues.push('Signing-session contract is invalid.')
  if (!session.sessionId) issues.push('Signing session id is missing.')
  if (!session.document.id) issues.push('Document identity is missing.')
  if (!session.version.id) issues.push('Document version identity is missing.')
  if (!session.signer.role || session.signer.role === 'signer') issues.push('Signer role is missing.')
  if (!session.binding.exactVersionBound) issues.push('Signing session is not bound to an exact PDF version.')
  if (!session.binding.bindingKey) issues.push('Document binding key is missing.')
  if (issues.length) {
    const error = new Error(issues.join(' '))
    error.code = 'INVALID_CANONICAL_SIGNING_SESSION'
    error.issues = issues
    throw error
  }
  return session
}
