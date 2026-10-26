const text = (...values) => values.find((value) => typeof value === 'string' && value.trim())?.trim() || ''

export function getNotificationLeadIdentity(notification = {}) {
  const data = notification.eventData || {}
  return {
    name: text(data.leadName, data.lead_name, data.buyerName, data.buyer_name, data.sellerName, data.seller_name, data.clientName, data.client_name, data.personName, data.person_name),
    source: text(data.leadSource, data.lead_source, data.leadSourceLabel, data.lead_source_label, data.sourceChannel, data.source_channel, data.origin),
  }
}
