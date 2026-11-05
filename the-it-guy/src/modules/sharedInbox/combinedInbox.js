// Keep provider identities separate even if two ledgers contain the same UUID.
export function whatsAppInboxChannel(sender) {
  return { id: `whatsapp:${sender.id}`, channel: 'whatsapp', address: sender.display_phone_number,
    displayName: sender.business_display_name || 'WhatsApp', connectionStatus: sender.connection_status }
}

export function whatsAppInboxConversation(row, senders) {
  const sender = senders.find(item => item.id === row.channel_id)
  return { id: `whatsapp:${row.id}`, providerConversationId: row.id, source: 'meta_whatsapp',
    organisationId: row.organisation_id, channelId: `whatsapp:${row.channel_id}`, channel: 'whatsapp',
    providerKey: 'meta_cloud_api', channelAddress: sender?.display_phone_number || '',
    contactName: row.contact_name || '', contactAddress: row.contact_phone || '', subject: 'WhatsApp conversation',
    lastMessagePreview: row.last_message_preview || '', lastMessageAt: row.last_message_at,
    lastInboundAt: row.last_inbound_at, status: row.status, assignedUserId: row.assigned_user_id,
    unreadCount: row.unread_count || 0 }
}
