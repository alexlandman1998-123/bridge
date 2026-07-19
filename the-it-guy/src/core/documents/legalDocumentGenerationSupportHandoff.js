function normalizeText(value) {
  return String(value || '').trim()
}

const ALLOWED_ACTIONS = new Set(['contact_admin', 'contact_support'])
const ALLOWED_SURFACES = new Set(['workspace', 'packet_panel', 'document_builder'])

export function buildLegalDocumentGenerationSupportEvent({ policy = {}, packetType = '', surface = '' } = {}) {
  const actionKey = ALLOWED_ACTIONS.has(policy?.actionKey) ? policy.actionKey : 'contact_support'
  return {
    contract: 'j4-v1',
    supportReference: normalizeText(policy?.supportReference).slice(0, 80),
    failureCode: normalizeText(policy?.code).replace(/[^A-Z0-9_]/gi, '').toUpperCase().slice(0, 64) || 'GENERATION_FAILED',
    packetType: normalizeText(packetType).toLowerCase() === 'otp' ? 'otp' : 'mandate',
    surface: ALLOWED_SURFACES.has(surface) ? surface : 'workspace',
    failureCount: Math.max(1, Math.min(99, Number(policy?.failureCount || 1))),
    escalationType: actionKey === 'contact_admin' ? 'administrator' : 'support',
    diagnosticIssueCodes: Array.isArray(policy?.diagnostics?.issueCodes)
      ? policy.diagnostics.issueCodes.map((code) => normalizeText(code).replace(/[^A-Z0-9_]/gi, '_').toUpperCase()).filter(Boolean).slice(0, 8)
      : [],
    resultAmbiguous: Boolean(policy?.diagnostics?.resultAmbiguous),
    rawDetailsIncluded: false,
  }
}

export async function recordLegalDocumentGenerationSupportHandoff({
  appendEvent,
  packetId = '',
  organisationId = null,
  policy = {},
  packetType = '',
  surface = '',
} = {}) {
  const supportReference = normalizeText(policy?.supportReference)
  if (!supportReference) return { recorded: false, reason: 'REFERENCE_MISSING', supportReference: '' }
  if (!normalizeText(packetId)) return { recorded: false, reason: 'PACKET_NOT_PERSISTED', supportReference }
  if (typeof appendEvent !== 'function') return { recorded: false, reason: 'EVENT_WRITER_UNAVAILABLE', supportReference }
  const eventPayload = buildLegalDocumentGenerationSupportEvent({ policy, packetType, surface })
  try {
    const event = await appendEvent({ packetId, organisationId, eventType: 'legal_generation_support_handoff', eventPayload })
    return { recorded: Boolean(event), reason: event ? '' : 'EVENT_NOT_WRITTEN', supportReference, eventPayload }
  } catch {
    return { recorded: false, reason: 'EVENT_WRITE_FAILED', supportReference, eventPayload }
  }
}
