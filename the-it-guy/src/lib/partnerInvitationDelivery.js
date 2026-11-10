export function attachPartnerInvitationDeliveries(invitations, deliveries = []) {
  const latest = new Map()
  for (const delivery of deliveries) {
    const invitationId = delivery.metadata_json?.partnerInvitationId
    if (invitationId && !latest.has(invitationId)) latest.set(invitationId, delivery)
  }
  return invitations.map((invitation) => ({ ...invitation, emailDelivery: latest.get(invitation.id) || null }))
}

export function partnerInvitationEmailPresentation(invitation = {}) {
  const delivery = invitation.emailDelivery
  if (['failed', 'bounced', 'complained', 'suppressed'].includes(delivery?.status)) {
    return { label: 'Email failed to send', summary: 'The invitation is saved, but its email failed. Use Resend invitation to try again.', sent: false }
  }
  if (delivery?.provider_message_id && ['sent', 'delivered', 'opened', 'clicked', 'read'].includes(delivery.status)) {
    return { label: delivery.status === 'delivered' ? 'Email delivered' : 'Email sent', summary: 'Waiting for the company contact to sign in and respond.', sent: true }
  }
  if (delivery && ['prepared', 'queued', 'sending'].includes(delivery.status)) {
    return { label: 'Email not yet confirmed', summary: 'The invitation is saved. Email acceptance has not been confirmed yet.', sent: false }
  }
  return { label: 'Email status unconfirmed', summary: 'The invitation is saved. No confirmed email send is available.', sent: false }
}

export function assertPartnerInvitationEmailAccepted(result) {
  if (result?.sent !== true || typeof result?.providerResponse?.id !== 'string' || !result.providerResponse.id.trim()) {
    throw new Error('The invitation is saved, but the email send could not be confirmed. Refresh its status before trying again.')
  }
}
