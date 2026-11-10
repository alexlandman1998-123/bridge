// Development collaboration and recoverable marketing event writes.
import { normalizeTextValue, requireClient, isMissingTableError, normalizeNullableText } from '../../lib/api/shared/readHelpers.js'
import { normalizeDevelopmentMarketingAccessRow, normalizeDevelopmentMarketingEventRow } from './readApi.js'
import { invokeDevelopmentWrite } from './writeRecovery.js'
import { invokeEdgeFunction } from '../../lib/supabaseClient'

export function buildDevelopmentMarketingInviteUrl(token = '') {
  const safeToken = normalizeTextValue(token)
  if (!safeToken) return ''
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
  return `${origin}/marketing/invite/${encodeURIComponent(safeToken)}`
}

export async function createDevelopmentMarketingAccess({
  developmentId,
  inviteeEmail = '',
  organisationId = null,
  userId = null,
  accessRole = 'viewer',
  expiresAt = null,
} = {}) {
  const client = requireClient()
  if (!developmentId) throw new Error('Development is required.')

  const recipientCount = [organisationId, userId, normalizeTextValue(inviteeEmail)].filter(Boolean).length
  if (recipientCount !== 1) throw new Error('Choose exactly one marketing access recipient.')
  if (!['viewer', 'contributor', 'approver'].includes(accessRole)) {
    throw new Error('Choose a valid marketing access role.')
  }

  const { data: authData, error: authError } = await client.auth.getUser()
  if (authError) throw authError
  if (!authData?.user?.id) throw new Error('Sign in before inviting a marketing partner.')

  const { data, error } = await client
    .from('development_marketing_access')
    .insert({
      development_id: developmentId,
      organisation_id: organisationId || null,
      user_id: userId || null,
      invitee_email: normalizeTextValue(inviteeEmail).toLowerCase() || null,
      access_role: accessRole,
      status: organisationId || userId ? 'active' : 'pending',
      invited_by: authData.user.id,
      expires_at: expiresAt || null,
    })
    .select('id, development_id, organisation_id, user_id, invitee_email, access_role, status, invited_by, invited_at, accepted_at, expires_at, revoked_at, created_at, updated_at')
    .single()

  if (error) {
    if (isMissingTableError(error, 'development_marketing_access')) {
      throw new Error('Marketing collaboration is not available until the Phase 2 database migration is applied.')
    }
    throw error
  }

  const access = normalizeDevelopmentMarketingAccessRow(data)
  let invitationDelivery = null
  if (access.inviteeEmail) {
    try {
      invitationDelivery = await sendDevelopmentMarketingAccessInvite(access.id)
    } catch (deliveryError) {
      invitationDelivery = { ok: false, error: deliveryError?.message || 'Invitation created, but email delivery failed.' }
    }
  }
  return { ...access, invitationDelivery }
}

export async function sendDevelopmentMarketingAccessInvite(marketingAccessId) {
  const client = requireClient()
  if (!marketingAccessId) throw new Error('Marketing access invitation is required.')
  const { data: invitation, error: invitationError } = await client.rpc(
    'bridge_prepare_development_marketing_invite',
    { target_marketing_access_id: marketingAccessId },
  )
  if (invitationError) throw invitationError
  const inviteLink = buildDevelopmentMarketingInviteUrl(invitation?.token)
  if (!inviteLink || !normalizeTextValue(invitation?.inviteeEmail)) {
    throw new Error('Could not prepare the marketing invitation link.')
  }
  const { data, error } = await invokeEdgeFunction('send-email', {
    body: {
      type: 'development_marketing_invite',
      to: invitation.inviteeEmail,
      inviteLink,
      developmentName: invitation.developmentName,
      accessRole: invitation.accessRole,
      expiresAt: invitation.expiresAt,
      supportEmail: 'support@arch9.co.za',
    },
  })
  if (error) {
    return {
      ok: false,
      inviteLink,
      expiresAt: invitation.expiresAt || null,
      emailResult: data || null,
      error: error?.message || 'Invitation link created, but email delivery failed.',
    }
  }
  return { ok: Boolean(data?.ok ?? true), inviteLink, expiresAt: invitation.expiresAt || null, emailResult: data || null }
}

export async function acceptDevelopmentMarketingInvite(token) {
  const client = requireClient()
  const { data, error } = await client.rpc('bridge_accept_development_marketing_invite', { target_invite_token: normalizeTextValue(token) })
  if (error) throw error
  return data || {}
}

export async function createDevelopmentMarketingEvent({
  developmentId, organisationId, developmentName = '', title,
  eventType = 'show_day', status = 'upcoming', startsAt,
  location = '', description = '', requestId,
} = {}) {
  const client = requireClient()
  if (!developmentId || !organisationId) throw new Error('Development and organisation are required.')
  if (!normalizeTextValue(title)) throw new Error('Event title is required.')
  if (normalizeTextValue(title).length > 180) throw new Error('Keep the event title to 180 characters or fewer.')
  if (!['show_day', 'launch'].includes(eventType)) throw new Error('Choose a valid event type.')
  if (!['draft', 'planning', 'upcoming', 'completed', 'cancelled'].includes(status)) throw new Error('Choose a valid event status.')
  if (!startsAt || !Number.isFinite(new Date(startsAt).getTime())) throw new Error('Choose a valid event date and time.')
  const payload = {
    organisation_id: organisationId, event_type: eventType, status,
    title: normalizeTextValue(title), subject_label: normalizeTextValue(developmentName) || normalizeTextValue(title),
    starts_at: new Date(startsAt).toISOString(), location: normalizeNullableText(location), description: normalizeNullableText(description),
  }
  const receipt = await invokeDevelopmentWrite(client, 'bridge_create_development_marketing_event', developmentId,
    { p_event: payload }, result => result.event?.id && result.event.organisation_id === organisationId &&
      result.event.subject_type === 'development' && result.event.subject_id === developmentId &&
      result.event.title === payload.title && result.event.event_type === eventType && result.event.status === status &&
      new Date(result.event.starts_at).getTime() === new Date(payload.starts_at).getTime(), { requestId })
  return { ...normalizeDevelopmentMarketingEventRow(receipt.event), activityWarning: receipt.activitySaved === false }
}
