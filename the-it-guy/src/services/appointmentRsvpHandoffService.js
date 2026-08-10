import { getEdgeFunctionInvokeError, invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function buildAppointmentRsvpUrl(token = '', action = '') {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) return ''
  const fallbackOrigin = 'https://app.arch9.co.za'
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : fallbackOrigin
  const suffix = action ? `?action=${encodeURIComponent(action)}` : ''
  return `${origin}/appointment-rsvp/${encodeURIComponent(normalizedToken)}${suffix}`
}

function isSellerAcceptedResponse({ participant = {}, rsvpStatus = '' } = {}) {
  return normalizeLower(participant?.participant_role || participant?.participantRole).includes('seller') &&
    normalizeLower(rsvpStatus) === 'accepted'
}

function isBuyerAcceptedResponse({ participant = {}, rsvpStatus = '' } = {}) {
  return normalizeLower(participant?.participant_role || participant?.participantRole).includes('buyer') &&
    normalizeLower(rsvpStatus) === 'accepted'
}

function buildAppointmentRsvpEmailBody({
  eventType = 'appointment_confirmation_required',
  recipient = {},
  appointment = {},
  includeRsvpActions = false,
  idempotencyPrefix = 'appointment-rsvp',
  metadata = {},
} = {}) {
  const recipientToken = normalizeText(recipient.rsvpToken)
  const actionLink = buildAppointmentRsvpUrl(recipientToken)
  return {
    type: eventType,
    to: normalizeLower(recipient.email),
    organisationId: normalizeText(appointment.organisationId),
    organisationName: normalizeText(appointment.organisationName),
    organisationLogoUrl: normalizeText(appointment.organisationLogoUrl),
    organisationLogoLightUrl: normalizeText(appointment.organisationLogoLightUrl),
    organisationLogoDarkUrl: normalizeText(appointment.organisationLogoDarkUrl),
    organisationBrandPrimaryColor: normalizeText(appointment.organisationBrandPrimaryColor),
    organisationBrandSecondaryColor: normalizeText(appointment.organisationBrandSecondaryColor),
    supportEmail: normalizeLower(appointment.supportEmail),
    supportPhone: normalizeText(appointment.supportPhone),
    appointmentId: normalizeText(appointment.appointmentId),
    participantId: normalizeText(recipient.participantId),
    rsvpToken: recipientToken,
    appointmentType: normalizeText(appointment.appointmentType || 'Viewing'),
    appointmentTitle: normalizeText(appointment.appointmentTitle || 'Property Viewing'),
    appointmentDate: normalizeText(appointment.appointmentDate),
    appointmentTime: normalizeText(appointment.startTime).slice(0, 5),
    appointmentEndTime: normalizeText(appointment.endTime).slice(0, 5),
    timezone: normalizeText(appointment.timezone || 'Africa/Johannesburg'),
    location: normalizeText(appointment.location || 'To be confirmed'),
    meetingUrl: normalizeText(appointment.meetingUrl),
    status: eventType === 'appointment_confirmed' ? 'Confirmed' : 'Requested',
    recipientName: normalizeText(recipient.name || 'there'),
    participantRole: normalizeText(recipient.role || 'Participant'),
    agentName: normalizeText(appointment.agentName),
    agentEmail: normalizeLower(appointment.agentEmail),
    agentRole: 'Agent',
    replyTo: normalizeLower(appointment.agentEmail || appointment.supportEmail),
    relatedListing: normalizeText(appointment.listingLabel),
    notes: normalizeText(appointment.notes),
    actionLink,
    acceptLink: includeRsvpActions ? buildAppointmentRsvpUrl(recipientToken, 'accept') : '',
    declineLink: includeRsvpActions ? buildAppointmentRsvpUrl(recipientToken, 'decline') : '',
    rescheduleLink: includeRsvpActions ? buildAppointmentRsvpUrl(recipientToken, 'reschedule') : '',
    attachCalendarInvite: true,
    metadata: {
      ...metadata,
      eventId: normalizeText(recipient.eventId),
    },
    deliveryMetadata: {
      ...metadata,
      eventId: normalizeText(recipient.eventId),
    },
    idempotencyKey: [
      idempotencyPrefix,
      normalizeText(appointment.appointmentId),
      normalizeText(recipient.participantId) || normalizeLower(recipient.email),
    ].filter(Boolean).join(':'),
  }
}

function mapHandoffAppointment(row = {}) {
  return {
    organisationId: row.organisation_id,
    organisationName: row.organisation_name,
    organisationLogoUrl: row.organisation_logo_url,
    organisationLogoLightUrl: row.organisation_logo_light_url,
    organisationLogoDarkUrl: row.organisation_logo_dark_url,
    organisationBrandPrimaryColor: row.organisation_brand_primary_color,
    organisationBrandSecondaryColor: row.organisation_brand_secondary_color,
    supportEmail: row.support_email,
    supportPhone: row.support_phone,
    appointmentId: row.appointment_id,
    appointmentType: row.appointment_type,
    appointmentTitle: row.appointment_title,
    appointmentDate: row.appointment_date,
    startTime: row.start_time,
    endTime: row.end_time,
    timezone: row.timezone,
    location: row.location,
    meetingUrl: row.meeting_url,
    notes: row.notes,
    listingLabel: row.listing_label,
    agentName: row.agent_name,
    agentEmail: row.agent_email,
  }
}

export async function sendBuyerRsvpHandoffAfterSellerAccept({ token = '', participant = {}, rsvpStatus = '' } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return { status: 'skipped', reason: 'supabase_unavailable' }
  }
  if (!normalizeText(token) || !isSellerAcceptedResponse({ participant, rsvpStatus })) {
    return { status: 'skipped', reason: 'not_seller_acceptance' }
  }

  const handoffResult = await supabase.rpc('get_viewing_seller_rsvp_handoff_by_token', { p_token: token })
  if (handoffResult.error) {
    throw handoffResult.error
  }

  const handoff = Array.isArray(handoffResult.data) ? handoffResult.data[0] : null
  if (!handoff?.buyer_email || !handoff?.buyer_rsvp_token) {
    return { status: 'skipped', reason: 'no_pending_buyer_handoff' }
  }

  const emailResult = await invokeEdgeFunction('send-email', {
    body: buildAppointmentRsvpEmailBody({
      eventType: 'appointment_confirmation_required',
      appointment: mapHandoffAppointment(handoff),
      recipient: {
        eventId: handoff.event_id,
        participantId: handoff.buyer_participant_id,
        name: handoff.buyer_name,
        email: handoff.buyer_email,
        role: 'Buyer',
        rsvpToken: handoff.buyer_rsvp_token,
      },
      includeRsvpActions: true,
      idempotencyPrefix: 'seller-rsvp-buyer-handoff',
      metadata: {
        source: 'seller_rsvp_handoff_to_buyer',
        sellerParticipantId: normalizeText(handoff.seller_participant_id),
      },
    }),
  })
  const emailError = getEdgeFunctionInvokeError(emailResult)
  const emailStatus = emailError ? 'failed' : 'sent'
  const deliveryError = emailError?.message || ''

  if (normalizeText(handoff.event_id)) {
    await supabase.rpc('mark_viewing_buyer_rsvp_handoff_delivery', {
      p_token: token,
      p_event_id: handoff.event_id,
      p_email_status: emailStatus,
      p_delivery_error: deliveryError || null,
    }).catch(() => null)
  }

  if (emailError) {
    throw new Error(emailError.message || 'Seller accepted, but the buyer RSVP email could not be sent.')
  }

  return {
    status: 'sent',
    appointmentId: normalizeText(handoff.appointment_id),
    buyerEmail: normalizeLower(handoff.buyer_email),
  }
}

export async function sendViewingConfirmationAfterBuyerAccept({ token = '', participant = {}, rsvpStatus = '' } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return { status: 'skipped', reason: 'supabase_unavailable' }
  }
  if (!normalizeText(token) || !isBuyerAcceptedResponse({ participant, rsvpStatus })) {
    return { status: 'skipped', reason: 'not_buyer_acceptance' }
  }

  const completionResult = await supabase.rpc('get_viewing_buyer_rsvp_completion_by_token', { p_token: token })
  if (completionResult.error) {
    throw completionResult.error
  }

  const rows = Array.isArray(completionResult.data) ? completionResult.data : []
  if (!rows.length) {
    return { status: 'skipped', reason: 'no_completion_recipients' }
  }

  const sent = []
  const failed = []
  for (const row of rows) {
    const appointment = mapHandoffAppointment(row)
    const recipient = {
      eventId: row.event_id,
      participantId: row.recipient_participant_id,
      name: row.recipient_name,
      email: row.recipient_email,
      role: row.recipient_role,
      rsvpToken: row.recipient_rsvp_token,
    }
    const emailResult = await invokeEdgeFunction('send-email', {
      body: buildAppointmentRsvpEmailBody({
        eventType: 'appointment_confirmed',
        appointment,
        recipient,
        includeRsvpActions: false,
        idempotencyPrefix: 'buyer-rsvp-viewing-confirmed',
        metadata: {
          source: 'buyer_rsvp_completion_confirmation',
          buyerParticipantId: normalizeText(row.buyer_participant_id),
        },
      }),
    })
    const emailError = getEdgeFunctionInvokeError(emailResult)
    const emailStatus = emailError ? 'failed' : 'sent'
    const deliveryError = emailError?.message || ''
    if (normalizeText(row.event_id)) {
      await supabase.rpc('mark_viewing_buyer_rsvp_completion_delivery', {
        p_token: token,
        p_event_id: row.event_id,
        p_email_status: emailStatus,
        p_delivery_error: deliveryError || null,
      }).catch(() => null)
    }
    if (emailError) {
      failed.push({ email: normalizeLower(row.recipient_email), error: deliveryError })
    } else {
      sent.push(normalizeLower(row.recipient_email))
    }
  }

  if (failed.length && !sent.length) {
    throw new Error(failed[0]?.error || 'Buyer accepted, but the final confirmation emails could not be sent.')
  }

  return {
    status: failed.length ? 'partial_sent' : 'sent',
    appointmentId: normalizeText(rows[0]?.appointment_id),
    sent,
    failed,
  }
}
