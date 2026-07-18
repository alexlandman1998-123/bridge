const HOUR_MS = 60 * 60 * 1000

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function time(value) {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : null
}

export const SIGNING_FOLLOW_UP_POLICY = Object.freeze({
  contract: 'arch9-signing-follow-up-v1',
  firstReminderAfterHours: 24,
  reminderCooldownHours: 24,
  refreshLinkWithinHours: 6,
})

export function resolveSignerFollowUp({ signer = {}, now = Date.now() } = {}) {
  const nowTime = Number(now)
  const status = key(signer?.status || signer?.statusRaw) || 'pending'
  const expiresAt = time(signer?.token_expires_at || signer?.expiresAt)
  const signedAt = time(signer?.signed_at || signer?.signedAt)
  const viewedAt = time(signer?.viewed_at || signer?.viewedAt)
  const sentAt = time(signer?.sent_at || signer?.sentAt || signer?.updated_at || signer?.created_at)
  const reminderSentAt = time(signer?.reminder_sent_at || signer?.reminderSentAt)
  const expired = status !== 'signed' && expiresAt !== null && expiresAt <= nowTime

  if (status === 'signed' || signedAt !== null) {
    return { key: 'none', label: 'Complete', state: 'complete', dueAt: null }
  }
  if (status === 'declined') {
    return { key: 'review', label: 'Review decline', state: 'manual_review', dueAt: null }
  }
  if (expired) {
    return { key: 'resend', label: 'Send new link', state: 'link_expired', dueAt: null }
  }
  if (!['sent', 'viewed'].includes(status)) {
    return { key: 'send', label: 'Send link', state: 'not_sent', dueAt: null }
  }
  if (expiresAt !== null && expiresAt - nowTime <= SIGNING_FOLLOW_UP_POLICY.refreshLinkWithinHours * HOUR_MS) {
    return { key: 'resend', label: 'Send fresh link', state: 'link_expiring', dueAt: expiresAt }
  }

  const followUpFrom = reminderSentAt || viewedAt || sentAt
  const waitHours = reminderSentAt
    ? SIGNING_FOLLOW_UP_POLICY.reminderCooldownHours
    : SIGNING_FOLLOW_UP_POLICY.firstReminderAfterHours
  const dueAt = followUpFrom === null ? nowTime : followUpFrom + waitHours * HOUR_MS
  if (dueAt > nowTime) {
    return {
      key: 'wait',
      label: reminderSentAt ? 'Reminder sent' : 'Wait before reminding',
      state: reminderSentAt ? 'reminder_cooldown' : 'waiting',
      dueAt,
    }
  }
  return { key: 'remind', label: 'Send reminder', state: 'reminder_due', dueAt }
}
