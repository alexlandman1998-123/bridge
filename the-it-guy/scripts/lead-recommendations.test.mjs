import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const migrationSource = await fs.readFile(new URL('../../supabase/migrations/202606030009_lead_recommendations.sql', import.meta.url), 'utf8')
assert.match(migrationSource, /create table if not exists public\.lead_recommendations/)
for (const field of [
  'recommendation_id',
  'organisation_id',
  'lead_id',
  'contact_id',
  'assigned_agent_id',
  'recommendation_type',
  'title',
  'description',
  'priority',
  'status',
  'source_event',
  'due_date',
  'task_id',
  'completed_at',
  'dismissed_at',
  'metadata',
]) {
  assert.match(migrationSource, new RegExp(field), `migration should include ${field}`)
}
for (const status of ['pending', 'accepted', 'completed', 'dismissed', 'expired']) {
  assert.match(migrationSource, new RegExp(status), `migration should allow ${status}`)
}
for (const priority of ['low', 'medium', 'high', 'urgent']) {
  assert.match(migrationSource, new RegExp(priority), `migration should allow ${priority}`)
}
assert.match(migrationSource, /lead_recommendations_open_event_guard/)
assert.match(migrationSource, /enable row level security/)
assert.match(migrationSource, /bridge_is_active_member/)

const recommendationServiceSource = await fs.readFile(new URL('../src/services/leadRecommendationService.js', import.meta.url), 'utf8')
for (const method of [
  'listRecommendations',
  'createRecommendation',
  'acceptRecommendation',
  'dismissRecommendation',
  'completeRecommendation',
  'expireRecommendation',
  'convertRecommendationToTask',
]) {
  assert.match(recommendationServiceSource, new RegExp(`export (async )?function ${method}`), `recommendation service should export ${method}`)
}
assert.match(recommendationServiceSource, /createAgencyCrmLeadTask/)
assert.doesNotMatch(recommendationServiceSource, /sendWhatsApp|sendEmail|openai|machine learning|createTransaction/i)

const actionEngineSource = await fs.readFile(new URL('../src/services/leadActionEngineService.js', import.meta.url), 'utf8')
for (const method of [
  'processLeadEvent',
  'processViewingEvent',
  'processSuggestionEvent',
  'processOfferEvent',
  'processCommunicationEvent',
  'processInactivityChecks',
  'createRecommendedTask',
  'dismissRecommendation',
  'completeRecommendation',
  'listLeadRecommendations',
]) {
  assert.match(actionEngineSource, new RegExp(`export (async )?function ${method}|export \\{ listLeadRecommendations \\}`), `action engine should expose ${method}`)
}
for (const type of [
  'contact_lead',
  'qualify_lead',
  'review_matches',
  'send_property',
  'confirm_viewing',
  'follow_up_viewing',
  'follow_up_offer',
  'find_alternatives',
  'transaction_handover',
  'general_follow_up',
]) {
  assert.match(recommendationServiceSource, new RegExp(type), `recommendation service should support ${type}`)
}

const leadWorkspaceSource = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
for (const copy of ['Recommendations', 'Accept', 'Dismiss', 'Complete', 'Convert To Task', 'My Recommendations']) {
  assert.match(leadWorkspaceSource, new RegExp(copy), `lead workspace should render ${copy}`)
}
assert.match(leadWorkspaceSource, /convertRecommendationToTask/)
assert.match(leadWorkspaceSource, /getRecommendationMetrics/)

const analyticsSource = await fs.readFile(new URL('../src/services/leadAnalyticsService.js', import.meta.url), 'utf8')
assert.match(analyticsSource, /lead_recommendations/)
assert.match(analyticsSource, /getRecommendationMetrics/)

const reportingPageSource = await fs.readFile(new URL('../src/pages/AgentReportingPage.jsx', import.meta.url), 'utf8')
for (const copy of ['Recommendations Created', 'Recommendations Accepted', 'Recommendations Completed', 'Task Conversion']) {
  assert.match(reportingPageSource, new RegExp(copy), `analytics dashboard should render ${copy}`)
}

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __leadRecommendationServiceTestUtils } = await server.ssrLoadModule('/src/services/leadRecommendationService.js')
  const {
    buildRecommendationPayload,
    defaultTitleForType,
    getRecommendationAgeDays,
    getRecommendationMetrics,
    isRecommendationOverdue,
    mapLeadRecommendation,
    normalizePriority,
    normalizeStatus,
    normalizeType,
  } = __leadRecommendationServiceTestUtils

  const base = {
    organisationId: '22222222-2222-4222-8222-222222222222',
    leadId: '33333333-3333-4333-8333-333333333333',
    contactId: '44444444-4444-4444-8444-444444444444',
    assignedAgentId: '55555555-5555-4555-8555-555555555555',
  }
  const payload = buildRecommendationPayload({
    ...base,
    recommendationType: 'contact_lead',
    priority: 'urgent',
    sourceEvent: 'new_lead:one',
  })
  assert.equal(payload.recommendation_type, 'contact_lead')
  assert.equal(payload.title, 'Contact Lead')
  assert.equal(payload.priority, 'urgent')
  assert.equal(payload.status, 'pending')
  assert.throws(() => buildRecommendationPayload({ leadId: base.leadId }), /Valid organisation/)

  assert.equal(normalizeType('Send Property'), 'send_property')
  assert.equal(normalizeType('unknown'), 'general_follow_up')
  assert.equal(normalizeStatus('Complete'), 'completed')
  assert.equal(normalizePriority('URGENT'), 'urgent')
  assert.equal(defaultTitleForType('transaction_handover'), 'Prepare Transaction Handover')

  const mapped = mapLeadRecommendation({
    recommendation_id: '66666666-6666-4666-8666-666666666666',
    organisation_id: base.organisationId,
    lead_id: base.leadId,
    recommendation_type: 'follow_up_viewing',
    priority: 'high',
    status: 'accepted',
    due_date: '2026-06-03T08:00:00.000Z',
    created_at: '2026-06-01T08:00:00.000Z',
  })
  assert.equal(mapped.recommendationType, 'follow_up_viewing')
  assert.equal(mapped.status, 'accepted')
  assert.equal(getRecommendationAgeDays(mapped, new Date('2026-06-03T08:00:00.000Z')), 2)
  assert.equal(isRecommendationOverdue(mapped, new Date('2026-06-04T08:00:00.000Z')), true)

  const metrics = getRecommendationMetrics([
    { status: 'pending', priority: 'urgent', due_date: '2026-06-01T08:00:00.000Z', created_at: '2026-06-01T08:00:00.000Z' },
    { status: 'accepted', task_id: '77777777-7777-4777-8777-777777777777', created_at: '2026-06-01T08:00:00.000Z' },
    { status: 'completed', completed_at: '2026-06-02T08:00:00.000Z', created_at: '2026-06-01T08:00:00.000Z' },
    { status: 'dismissed', dismissed_at: '2026-06-01T09:00:00.000Z', created_at: '2026-06-01T08:00:00.000Z' },
  ], new Date('2026-06-03T08:00:00.000Z'))
  assert.equal(metrics.created, 4)
  assert.equal(metrics.pending, 1)
  assert.equal(metrics.accepted, 1)
  assert.equal(metrics.completed, 1)
  assert.equal(metrics.dismissed, 1)
  assert.equal(metrics.urgent, 1)
  assert.equal(metrics.overdue, 1)
  assert.equal(metrics.taskConversionRate, 25)
  assert.equal(metrics.averageCompletionHours, 24)

  const { __leadActionEngineServiceTestUtils } = await server.ssrLoadModule('/src/services/leadActionEngineService.js')
  const { buildEventRecommendation, getRecommendationRuleForEvent, olderThan } = __leadActionEngineServiceTestUtils
  assert.equal(getRecommendationRuleForEvent('new_lead').type, 'contact_lead')
  assert.equal(getRecommendationRuleForEvent('suggestion_accepted').type, 'send_property')
  assert.equal(getRecommendationRuleForEvent('offer_accepted').type, 'transaction_handover')
  assert.equal(getRecommendationRuleForEvent('unknown'), null)
  const eventRecommendation = buildEventRecommendation({
    ...base,
    eventType: 'viewing_completed',
    eventId: 'viewing-one',
  }, getRecommendationRuleForEvent('viewing_completed'))
  assert.equal(eventRecommendation.recommendationType, 'follow_up_viewing')
  assert.equal(eventRecommendation.sourceEvent, 'viewing-one')
  assert.equal(olderThan('2026-06-01T08:00:00.000Z', 24, new Date('2026-06-02T09:00:00.000Z')), true)
} finally {
  await server.close()
}

console.log('lead recommendation tests passed')
