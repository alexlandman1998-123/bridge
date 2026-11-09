// Extracted without changing validation, persistence order or recovery behaviour.
import { normalizeTextValue, requireClient, isMissingTableError, normalizeNullableText, isPermissionDeniedError } from '../../lib/api/shared/readHelpers.js'
import { normalizeDevelopmentMarketingAccessRow, normalizeDevelopmentMarketingEventRow } from './readApi.js'
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
  developmentId,
  organisationId,
  developmentName = '',
  title,
  eventType = 'show_day',
  status = 'upcoming',
  startsAt,
  location = '',
  description = '',
} = {}) {
  const client = requireClient()
  if (!developmentId || !organisationId) throw new Error('Development and organisation are required.')
  if (!normalizeTextValue(title)) throw new Error('Event title is required.')
  if (!['show_day', 'launch'].includes(eventType)) throw new Error('Choose a valid event type.')
  if (!startsAt || !Number.isFinite(new Date(startsAt).getTime())) throw new Error('Choose a valid event date and time.')
  const { data: authData, error: authError } = await client.auth.getUser()
  if (authError) throw authError
  if (!authData?.user?.id) throw new Error('Sign in before creating an event.')

  const { data, error } = await client
    .from('marketing_events')
    .insert({
      organisation_id: organisationId,
      event_type: eventType,
      status: normalizeTextValue(status) || 'upcoming',
      title: normalizeTextValue(title),
      subject_type: 'development',
      subject_id: developmentId,
      subject_label: normalizeTextValue(developmentName) || normalizeTextValue(title),
      starts_at: startsAt || null,
      location: normalizeNullableText(location),
      address: normalizeNullableText(location),
      description: normalizeNullableText(description),
      created_by: authData.user.id,
    })
    .select('id, title, event_type, status, starts_at, ends_at, location, address, description, image_url, created_at, created_by')
    .single()

  if (error) throw error
  try {
    const activityResult = await client
      .from('development_marketing_activity')
      .insert({
        development_id: developmentId,
        actor_user_id: authData.user.id,
        action_type: 'event_created',
        metadata: { title: normalizeTextValue(title), event_type: eventType },
      })
    if (activityResult.error && !isMissingTableError(activityResult.error, 'development_marketing_activity') && !isPermissionDeniedError(activityResult.error)) throw activityResult.error
  } catch {
    // The authoritative event is already saved. A retry must not create it twice.
    console.warn('[Development events] Event saved; activity history could not be recorded.')
  }
  return normalizeDevelopmentMarketingEventRow(data)
}
