import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const migrationSource = await fs.readFile(new URL('../../supabase/migrations/202606030010_lead_saved_searches.sql', import.meta.url), 'utf8')
assert.match(migrationSource, /create table if not exists public\.lead_saved_searches/)
for (const field of [
  'saved_search_id',
  'organisation_id',
  'lead_id',
  'requirement_id',
  'search_name',
  'active',
  'consent_given',
  'email_enabled',
  'whatsapp_enabled',
  'frequency',
  'last_sent_at',
]) {
  assert.match(migrationSource, new RegExp(field), `migration should include ${field}`)
}
for (const frequency of ['daily', 'weekly', 'manual_only']) {
  assert.match(migrationSource, new RegExp(frequency), `migration should allow ${frequency}`)
}
assert.match(migrationSource, /lead_saved_searches_name_guard/)
assert.match(migrationSource, /enable row level security/)
assert.match(migrationSource, /bridge_is_active_member/)

const templateSource = await fs.readFile(new URL('../src/services/leadCommunicationTemplateService.js', import.meta.url), 'utf8')
for (const template of ['property_match', 'new_listing', 'price_reduction', 'follow_up']) {
  assert.match(templateSource, new RegExp(template), `template service should support ${template}`)
}
assert.doesNotMatch(templateSource, /openai|generateText|AI-generated|campaign/i)

const sharingSource = await fs.readFile(new URL('../src/services/leadPropertySharingService.js', import.meta.url), 'utf8')
for (const method of [
  'listLeadSavedSearches',
  'createLeadSavedSearch',
  'updateLeadSavedSearch',
  'enableLeadSavedSearch',
  'disableLeadSavedSearch',
  'previewPropertyMessage',
  'sendListingToLead',
  'sendMultipleListingsToLead',
  'logPropertyShare',
  'listLeadPropertyShares',
  'listListingPropertyShares',
]) {
  assert.match(sharingSource, new RegExp(`export (async )?function ${method}`), `property sharing service should export ${method}`)
}
assert.match(sharingSource, /createCommunicationEvent/)
assert.match(sharingSource, /markLeadListingInterestSent/)
assert.doesNotMatch(sharingSource, /setInterval|cron|newsletter|bulk|mass|auto send|createTransaction|createAppointment|createOffer/i)

const leadWorkspaceSource = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
for (const copy of ['Saved Searches', 'Sent Properties', 'Send To Buyer', 'Message Preview', 'Consent recorded']) {
  assert.match(leadWorkspaceSource, new RegExp(copy), `lead workspace should render ${copy}`)
}
assert.match(leadWorkspaceSource, /sendListingToLead/)
assert.match(leadWorkspaceSource, /completeRecommendation/)

const listingWorkspaceSource = await fs.readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
assert.match(listingWorkspaceSource, /listListingPropertyShares/)
assert.match(listingWorkspaceSource, /Sent To Leads/)

const analyticsSource = await fs.readFile(new URL('../src/services/leadAnalyticsService.js', import.meta.url), 'utf8')
assert.match(analyticsSource, /getPropertyShareMetrics/)
assert.match(analyticsSource, /property_shares/)

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __leadCommunicationTemplateServiceTestUtils } = await server.ssrLoadModule('/src/services/leadCommunicationTemplateService.js')
  const { buildPropertyMessage, listLeadCommunicationTemplates } = __leadCommunicationTemplateServiceTestUtils
  const templates = listLeadCommunicationTemplates()
  assert.equal(templates.length, 4)
  const message = buildPropertyMessage({
    templateType: 'property_match',
    lead: { name: 'Sarah Jones' },
    listings: [{
      id: '11111111-1111-4111-8111-111111111111',
      title: '12 Main Road',
      suburb: 'Bartlett',
      price: 2200000,
      bedrooms: 3,
      bathrooms: 2,
    }],
    requirementSummary: '3-bed house in Bartlett',
    note: 'Saturday viewing is possible.',
  })
  assert.equal(message.subject, 'Property option for you')
  assert.match(message.message, /Hi Sarah Jones/)
  assert.match(message.message, /12 Main Road/)
  assert.match(message.message, /Saturday viewing is possible/)

  const { __leadPropertySharingServiceTestUtils } = await server.ssrLoadModule('/src/services/leadPropertySharingService.js')
  const {
    buildSavedSearchPayload,
    mapLeadSavedSearch,
    previewPropertyMessage,
    validateShareConsent,
  } = __leadPropertySharingServiceTestUtils

  const ids = {
    organisationId: '22222222-2222-4222-8222-222222222222',
    leadId: '33333333-3333-4333-8333-333333333333',
    requirementId: '44444444-4444-4444-8444-444444444444',
  }
  const payload = buildSavedSearchPayload({
    ...ids,
    searchName: 'Bartlett Houses',
    consentGiven: true,
    whatsappEnabled: true,
    frequency: 'weekly',
  })
  assert.equal(payload.organisation_id, ids.organisationId)
  assert.equal(payload.lead_id, ids.leadId)
  assert.equal(payload.requirement_id, ids.requirementId)
  assert.equal(payload.search_name, 'Bartlett Houses')
  assert.equal(payload.consent_given, true)
  assert.equal(payload.frequency, 'weekly')

  const mapped = mapLeadSavedSearch({
    saved_search_id: '55555555-5555-4555-8555-555555555555',
    organisation_id: ids.organisationId,
    lead_id: ids.leadId,
    requirement_id: ids.requirementId,
    search_name: 'Bartlett Houses',
    consent_given: true,
    email_enabled: true,
    whatsapp_enabled: false,
    frequency: 'manual_only',
  })
  assert.equal(mapped.savedSearchId, '55555555-5555-4555-8555-555555555555')
  assert.equal(mapped.consentGiven, true)
  assert.equal(mapped.frequency, 'manual_only')

  assert.equal(validateShareConsent({ requirement: { consentToReceiveMatches: true } }).ok, true)
  assert.equal(validateShareConsent({ savedSearch: { consentGiven: true } }).source, 'saved_search')
  assert.equal(validateShareConsent({}).ok, false)

  const preview = previewPropertyMessage({
    lead: { name: 'Sarah Jones', email: 'sarah@example.com' },
    listing: { id: '66666666-6666-4666-8666-666666666666', title: '7 Oak Avenue', suburb: 'Beyers Park', price: 1800000 },
    requirement: { requirementId: ids.requirementId, consentToReceiveMatches: true, suburbs: ['Beyers Park'], budgetMax: 1900000 },
    channel: 'email',
  })
  assert.equal(preview.channel, 'email')
  assert.equal(preview.consent.ok, true)
  assert.equal(preview.recipient, 'sarah@example.com')
  assert.deepEqual(preview.listingIds, ['66666666-6666-4666-8666-666666666666'])

  const { __leadAnalyticsServiceTestUtils } = await server.ssrLoadModule('/src/services/leadAnalyticsService.js')
  const { getPropertyShareMetrics, buildLeadAnalyticsCsvExport, buildListingWorkspaceAnalyticsSummary } = __leadAnalyticsServiceTestUtils
  const propertyShareMetrics = getPropertyShareMetrics({
    communications: [
      {
        communication_type: 'email',
        source: 'property_share',
        status: 'sent',
        metadata: { shareType: 'property_share', listingIds: ['listing-1', 'listing-2'] },
      },
      {
        communication_type: 'whatsapp',
        source: 'property_share',
        status: 'pending',
        metadata: { shareType: 'property_share', listingIds: ['listing-1'] },
      },
    ],
  })
  assert.equal(propertyShareMetrics.sentVolume, 2)
  assert.equal(propertyShareMetrics.propertiesSent, 3)
  assert.equal(propertyShareMetrics.emailsSent, 1)
  assert.equal(propertyShareMetrics.whatsAppsSent, 1)
  assert.equal(propertyShareMetrics.pendingSends, 1)
  assert.match(buildLeadAnalyticsCsvExport('property_shares', { propertyShares: propertyShareMetrics }), /propertiesSent/)
  assert.equal(buildListingWorkspaceAnalyticsSummary({ propertyShares: [{}, {}] }).sentToLeads, 2)
} finally {
  await server.close()
}

console.log('lead property sharing tests passed')
