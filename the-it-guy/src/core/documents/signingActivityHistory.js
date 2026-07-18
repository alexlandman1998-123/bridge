function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function timestamp(value) {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function roleLabel(value) {
  const role = key(value)
  const labels = {
    agent: 'Agency representative',
    seller: 'Seller',
    seller_spouse: 'Co-seller or spouse',
    purchaser_1: 'First purchaser',
    purchaser_2: 'Second purchaser',
    witness_1: 'First witness',
    witness_2: 'Second witness',
    attorney: 'Attorney',
  }
  return labels[role] || role.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) || 'Signer'
}

const EVENT_DEFINITIONS = Object.freeze({
  signer_links_generated: ['invitation_prepared', 'Secure signing link prepared'],
  digital_signing_prepared: ['invitation_prepared', 'Document prepared for signing'],
  mandate_sent_for_digital_signing: ['invitation_sent', 'Signing invitation sent'],
  seller_signing_email_sent: ['invitation_sent', 'Signing invitation delivered'],
  mandate_signing_email_resent: ['link_resent', 'Fresh signing link sent'],
  signer_links_resent: ['link_resent', 'Fresh signing link prepared'],
  signer_reminder_sent: ['reminder_sent', 'Signing reminder sent'],
  signer_link_viewed: ['viewed', 'Secure document opened'],
  signer_completed_signing: ['signed', 'Signing completed'],
  all_signers_completed: ['all_signed', 'All required signers completed'],
  final_signed_document_generated: ['finalised', 'Final signed document generated'],
  final_signed_otp_generated: ['finalised', 'Final signed OTP generated'],
  final_signed_generated: ['finalised', 'Final signed document generated'],
  final_document_surfaces_completed: ['published', 'Final signed document published'],
  final_signed_delivery_completed: ['delivered', 'Final signed document delivered'],
})

function eventRole(event, signerRoleById) {
  const payload = event?.event_payload_json && typeof event.event_payload_json === 'object' ? event.event_payload_json : {}
  return key(
    payload.signerRole || payload.signer_role || payload.recipientRole || payload.recipient_role ||
    signerRoleById.get(text(payload.signerId || payload.signer_id)),
  ) || null
}

export function buildSigningActivityHistory({ signers = [], events = [], limit = 20 } = {}) {
  const signerRows = Array.isArray(signers) ? signers : []
  const signerRoleById = new Map(signerRows.map((signer) => [text(signer?.id), key(signer?.signer_role)]))
  const rows = []
  const evidenceKeys = new Set()

  for (const event of Array.isArray(events) ? events : []) {
    const eventType = key(event?.event_type || event?.eventType)
    const definition = EVENT_DEFINITIONS[eventType]
    const occurredAt = timestamp(event?.created_at || event?.createdAt)
    if (!definition || !occurredAt) continue
    const payload = event?.event_payload_json && typeof event.event_payload_json === 'object' ? event.event_payload_json : {}
    const role = eventRole(event, signerRoleById)
    const evidenceKey = `${definition[0]}:${role || 'packet'}:${occurredAt}`
    if (evidenceKeys.has(evidenceKey)) continue
    evidenceKeys.add(evidenceKey)
    rows.push({
      id: text(event?.id) || evidenceKey,
      type: definition[0],
      label: definition[1],
      occurredAt,
      role,
      roleLabel: role ? roleLabel(role) : null,
      deliveryConfirmed: Boolean(payload.emailConfirmed || payload.emailDeliveryId || payload.sentCount > 0),
      source: 'audit_event',
    })
  }

  for (const signer of signerRows) {
    const role = key(signer?.signer_role || signer?.role) || 'signer'
    const signerId = text(signer?.id) || role
    const synthetic = [
      ['signed', 'Signing completed', signer?.signed_at || signer?.signedAt],
      ['viewed', 'Secure document opened', signer?.viewed_at || signer?.viewedAt],
      ...(key(signer?.status) === 'declined' ? [['declined', 'Signer declined to sign', signer?.updated_at]] : []),
    ]
    for (const [type, label, rawTime] of synthetic) {
      const occurredAt = timestamp(rawTime)
      if (!occurredAt) continue
      const duplicate = rows.some((row) => row.type === type && row.role === role && row.occurredAt === occurredAt)
      if (duplicate) continue
      rows.push({
        id: `${signerId}:${type}:${occurredAt}`,
        type,
        label,
        occurredAt,
        role,
        roleLabel: roleLabel(role),
        deliveryConfirmed: false,
        source: 'signer_state',
      })
    }
  }

  rows.sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20))
  const visibleRows = rows.slice(0, safeLimit)
  return {
    contract: 'arch9-signing-activity-v1',
    rows: visibleRows,
    totalCount: rows.length,
    hasMore: rows.length > visibleRows.length,
    latestAt: visibleRows[0]?.occurredAt || null,
  }
}
