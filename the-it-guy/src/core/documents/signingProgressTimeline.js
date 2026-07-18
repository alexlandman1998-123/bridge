import { resolveSignerFollowUp } from './signingFollowUpPolicy.js'

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function roleLabel(value) {
  const role = key(value)
  const labels = {
    agent: 'Agency representative',
    seller: 'Seller',
    seller_spouse: 'Co-seller or spouse',
    purchaser_1: 'First purchaser',
    purchaser_2: 'Second purchaser',
    purchaser_spouse: 'Purchaser spouse',
    witness_1: 'First witness',
    witness_2: 'Second witness',
    attorney: 'Attorney',
  }
  return labels[role] || role.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) || 'Signer'
}

export function buildSigningProgressTimeline({ signers = [], now = Date.now() } = {}) {
  const rows = (Array.isArray(signers) ? signers : [])
    .map((signer, index) => {
      const status = key(signer?.status || signer?.statusRaw) || 'pending'
      const expiresAt = text(signer?.token_expires_at || signer?.expiresAt)
      const expiryTime = Date.parse(expiresAt)
      const expired = status !== 'signed' && Number.isFinite(expiryTime) && expiryTime <= Number(now)
      const effectiveStatus = expired ? 'expired' : status
      const signedAt = text(signer?.signed_at || signer?.signedAt)
      const viewedAt = text(signer?.viewed_at || signer?.seenAt || signer?.viewedAt)
      const lastActivityAt = signedAt || viewedAt || text(signer?.updated_at || signer?.created_at) || null
      const followUp = resolveSignerFollowUp({ signer: { ...signer, status: effectiveStatus }, now })
      const action = { key: followUp.key, label: followUp.label }
      return {
        id: text(signer?.id) || `${key(signer?.signer_role || signer?.role)}-${index}`,
        role: key(signer?.signer_role || signer?.role) || 'signer',
        roleLabel: roleLabel(signer?.signer_role || signer?.role),
        name: text(signer?.signer_name || signer?.signerName) || roleLabel(signer?.signer_role || signer?.role),
        email: text(signer?.signer_email || signer?.signerEmail).toLowerCase() || null,
        order: Number(signer?.signing_order || signer?.order) || index + 1,
        status: effectiveStatus,
        expired,
        expiresAt: expiresAt || null,
        signedAt: signedAt || null,
        viewedAt: viewedAt || null,
        lastActivityAt,
        hasActiveLink: Boolean(text(signer?.signing_token)) && !expired && !['signed', 'declined'].includes(effectiveStatus),
        reminderSentAt: text(signer?.reminder_sent_at || signer?.reminderSentAt) || null,
        followUpState: followUp.state,
        followUpDueAt: followUp.dueAt ? new Date(followUp.dueAt).toISOString() : null,
        action,
      }
    })
    .sort((left, right) => left.order - right.order)

  const completedCount = rows.filter((row) => row.status === 'signed').length
  const attentionCount = rows.filter((row) => ['declined', 'expired'].includes(row.status)).length
  const followUpCount = rows.filter((row) => ['remind', 'resend', 'review'].includes(row.action.key)).length
  const nextSigner = rows.find((row) => row.status !== 'signed') || null
  return {
    contract: 'arch9-signing-progress-v1',
    rows,
    totalCount: rows.length,
    completedCount,
    remainingCount: Math.max(rows.length - completedCount, 0),
    attentionCount,
    followUpCount,
    nextSigner,
  }
}
