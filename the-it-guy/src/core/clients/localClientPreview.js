const PREVIEW_ORGANISATION_ID = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'
const PREVIEW_EMAIL = 'alexlandman1998@gmail.com'

// Temporary, read-only fixtures for the local client-profile design preview.
export function getLocalClientPreview(profileData, {
  development = import.meta.env.DEV,
  hostname = typeof window === 'undefined' ? '' : window.location.hostname,
  now = Date.now(),
} = {}) {
  const original = profileData?.client
  if (!development || !['localhost', '127.0.0.1', '[::1]'].includes(hostname)
    || original?.organisationId !== PREVIEW_ORGANISATION_ID
    || String(original?.email || '').trim().toLowerCase() !== PREVIEW_EMAIL) return null

  const at = hoursAgo => new Date(now - hoursAgo * 3600000).toISOString()
  const transactions = [
    { id: 'preview-transaction-cicely', reference: 'REVO-2026-0142', propertyLabel: '694 Cicely Street', typeLabel: 'Buyer', status: 'Active', stageLabel: 'Bond approved', lastActivityAt: at(2), imageUrl: '/demo-listing-images/revo-sales-cover.png', price: 3200000, deposit: 320000, financeLabel: 'Bond finance', bedrooms: 3, bathrooms: 2, parking: 2, floorArea: 218, assignedAgentName: 'Jamie Smit', attorneyName: 'Revo Transfer Partners', expectedTransferDate: at(-1080), nextAction: 'Confirm bond instructions and prepare the transfer documents.', milestones: [{ label: 'Offer accepted', date: at(168), complete: true }, { label: 'OTP signed', date: at(144), complete: true }, { label: 'Bond approved', date: at(2), complete: true }, { label: 'Transfer registration', date: at(-1080), complete: false }] },
    { id: 'preview-transaction-willow', reference: 'REVO-2026-0118', propertyLabel: '18 Willow Lane, Constantia', typeLabel: 'Seller', status: 'Active', stageLabel: 'Offer accepted', lastActivityAt: at(26), imageUrl: '/brand/landlord-demo/the-mews-3.jpg', price: 4850000, deposit: 485000, financeLabel: 'Cash purchase', bedrooms: 4, bathrooms: 3, parking: 2, floorArea: 286, assignedAgentName: 'Jamie Smit', attorneyName: 'Revo Transfer Partners', expectedTransferDate: at(-1440), nextAction: 'Collect the signed OTP and confirm the purchaser’s deposit.', milestones: [{ label: 'Offer received', date: at(48), complete: true }, { label: 'Offer accepted', date: at(26), complete: true }, { label: 'Deposit received', date: null, complete: false }, { label: 'Transfer registration', date: at(-1440), complete: false }] },
    { id: 'preview-transaction-oak', reference: 'REVO-2026-0086', propertyLabel: '42 Oak Avenue, Newlands', typeLabel: 'Buyer', status: 'Completed', stageLabel: 'Registered', lastActivityAt: at(1104), imageUrl: '/brand/landlord-demo/maple-grove-8.jpg', price: 6750000, deposit: 675000, financeLabel: 'Bond finance', bedrooms: 4, bathrooms: 3, parking: 2, floorArea: 340, assignedAgentName: 'Jamie Smit', attorneyName: 'Revo Transfer Partners', expectedTransferDate: at(1104), nextAction: 'Transfer completed. Handover and key collection confirmed.', milestones: [{ label: 'OTP signed', date: at(2400), complete: true }, { label: 'Bond approved', date: at(2160), complete: true }, { label: 'Lodged at deeds office', date: at(1320), complete: true }, { label: 'Transfer registered', date: at(1104), complete: true }] },
  ]
  const event = (id, category, title, detail, hoursAgo, actorKind = 'staff') => ({ id: `preview-activity-${id}`, category, title, detail, occurred_at: at(hoursAgo), actor_kind: actorKind, actor_name: actorKind === 'staff' ? 'Jamie Smit' : null })
  const events = [
    event('bond', 'transaction', 'Bond approval received', 'Finance approved for 694 Cicely Street. The transfer team can proceed with the next milestone.', 2, 'system'),
    event('offer', 'offer', 'Offer accepted', 'The buyer’s offer for 18 Willow Lane was accepted. Signed documents received from both parties.', 26),
    event('fica', 'document', 'FICA documents uploaded', 'Alexander uploaded his identity document and proof of address for the Cicely Street purchase.', 48, 'client'),
    event('viewing', 'appointment', 'Property viewing completed', 'Viewed 694 Cicely Street and discussed the garden, home office and preferred transfer date.', 72),
    event('call', 'interaction', 'Follow-up call logged', 'Confirmed a budget of R3.2m and preference for a three-bedroom home with space to work from home.', 96),
    event('rsvp', 'interaction', 'Show-day RSVP confirmed', 'Alexander replied to the Spring show-day invitation and confirmed attendance for Saturday at 11:00.', 120),
    event('enquiry', 'enquiry', 'Website enquiry received', 'Requested a viewing of 694 Cicely Street after discovering the listing on Instagram.', 168, 'client'),
    event('portal', 'portal', 'Client portal opened', 'Reviewed the purchase milestones and outstanding documents in the client portal.', 192, 'client'),
    event('task', 'task', 'Buyer follow-up completed', 'Sent a shortlist of family homes matching Alexander’s preferred areas and budget.', 240),
    event('registration', 'transaction', 'Transfer registered', 'Transfer completed for 42 Oak Avenue, Newlands. Handover and key collection confirmed.', 1104, 'system'),
  ]
  const touch = (id, source, medium, campaign, hoursAgo, extra = {}) => ({ id: `preview-source-${id}`, lead_id: `preview-lead-${id}`, utm_source: source, utm_medium: medium, utm_campaign: campaign, occurred_at: at(hoursAgo), landing_host: 'revoproperty.co.za', ...extra })
  const touches = [
    touch('newsletter', 'revo_newsletter', 'email', 'spring-show-days', 120, { campaign_code: 'REVO-SPRING-26', utm_content: 'cicely-viewing-invite' }),
    touch('instagram', 'instagram', 'paid_social', 'spring-family-homes', 168, { campaign_code: 'REVO-SPRING-26', utm_content: 'cicely-garden-carousel', referrer_host: 'instagram.com' }),
    touch('google', 'google', 'organic', null, 336, { utm_term: 'family homes in Cape Town', referrer_host: 'google.com' }),
    touch('property24', 'property24', 'referral', null, 504, { referrer_host: 'property24.com' }),
  ]
  const campaign = (id, name, subject, hoursAgo, extra = {}) => ({ id: `preview-recipient-${id}`, campaign_id: `preview-campaign-${id}`, campaign_name: name, subject, email: original.email, status: 'delivered', created_at: at(hoursAgo + 24), sent_at: at(hoursAgo), delivered_at: at(hoursAgo - 0.05), opened_at: null, clicked_at: null, open_count: 0, click_count: 0, response_count: 0, responses: [], ...extra })
  const campaigns = [
    campaign('weekend', 'Weekend property edit', 'Your next home could be in this weekend’s selection', -72, { status: 'queued', created_at: at(3), sent_at: null, delivered_at: null }),
    campaign('spring', 'Spring show-day invitation', 'You’re invited: view 694 Cicely Street this Saturday', 144, { status: 'clicked', opened_at: at(143), clicked_at: at(142), open_count: 3, click_count: 2, response_count: 1, responses: [{ id: 'preview-response-rsvp', response_kind: 'rsvp', detail: 'Confirmed attendance for Saturday at 11:00. RSVP received by email and verified by Jamie.', occurred_at: at(120) }] }),
    campaign('shortlist', 'Buyer shortlist · October', 'Three family homes selected for you', 240, { status: 'opened', opened_at: at(238), open_count: 2 }),
    campaign('market', 'September market update', 'Your neighbourhood property update', 480),
  ]
  return {
    ...profileData,
    client: { ...original, totalTransactions: transactions.length, activeTransactions: 2, completedTransactions: 1, latestStage: transactions[0].stageLabel, latestMatterReference: transactions[0].reference, lastActivityAt: events[0].occurred_at },
    transactions,
    preview: {
      activity: { available: true, events, nextCursor: null },
      sources: { available: true, touches, nextCursor: null, summary: { firstTouch: touches.at(-1), latestTouch: touches[0], enquiryCount: 4, taggedEnquiryCount: 4 } },
      campaigns: { available: true, campaigns, nextCursor: null, summary: { campaignCount: 4, sentCount: 3, deliveredCount: 3, openedCount: 2, clickedCount: 1, respondedCount: 1 } },
    },
  }
}

export function getLocalPreviewTransaction(transactionId, { organisationId, ...options } = {}) {
  if (organisationId !== PREVIEW_ORGANISATION_ID) return null
  const profile = getLocalClientPreview({ client: { organisationId, email: PREVIEW_EMAIL, name: 'Alexander Landman' } }, options)
  const transaction = profile?.transactions.find(row => row.id === transactionId)
  return transaction ? { transaction, client: profile.client, profilePath: `/clients/${encodeURIComponent(`email:${organisationId}:${PREVIEW_EMAIL}`)}` } : null
}
