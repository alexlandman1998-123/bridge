import { trackTelemetryEvent } from './observability/telemetry.js'

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((field) => [field, canonical(value[field])]))
}

export async function sha256DocumentExperienceValue(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export async function digestDocumentExperienceCohort({ environment = '', organisationIds = [] } = {}) {
  return sha256DocumentExperienceValue({
    environment: String(environment || '').trim().toLowerCase(),
    organisationIds: [...new Set((Array.isArray(organisationIds) ? organisationIds : []).map((value) => String(value || '').trim()).filter(Boolean))].sort(),
  })
}

export async function recordDocumentExperienceRolloutDecision({ control = {}, assessment = {}, userId = '', workspaceId = '', transport = trackTelemetryEvent } = {}) {
  const receipt = {
    contract: 'arch9-document-experience-rollout-receipt-v1',
    controlContract: control?.contract || null,
    stage: control?.stage || null,
    revision: Number(control?.revision || 0),
    decision: assessment?.decision || null,
    status: assessment?.status || null,
    cohortDigest: control?.cohortDigest || null,
    evidenceDigest: control?.evidenceDigest || null,
    maxParticipants: Number(control?.maxParticipants || 0),
    startedAt: control?.startedAt || null,
    observationEndsAt: control?.observationEndsAt || null,
    expiresAt: control?.expiresAt || null,
    blockerCodes: (assessment?.blockers || []).map((row) => row.code).filter(Boolean).sort(),
  }
  const receiptDigest = await sha256DocumentExperienceValue(receipt)
  const result = await transport({
    category: 'document_experience_rollout',
    eventName: `document_experience_rollout_${String(assessment?.decision || 'unknown').toLowerCase()}`,
    userId,
    workspaceId,
    route: '/document-experience/rollout',
    severity: assessment?.decision === 'PAUSE_ROLLOUT' ? 'warning' : 'info',
    metadata: { ...receipt, receiptDigest },
  })
  return { receipt: { ...receipt, receiptDigest }, ...result }
}
