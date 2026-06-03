import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const migrationSql = await fs.readFile(new URL('../../supabase/migrations/202606030007_lead_communication_events.sql', import.meta.url), 'utf8')

assert.match(migrationSql, /create table if not exists public\.lead_communication_events/i)
for (const field of [
  'communication_id uuid primary key',
  'organisation_id uuid not null references public.organisations',
  'lead_id uuid not null references public.leads',
  'contact_id uuid references public.contacts',
  'agent_id uuid',
  'communication_type text not null',
  'direction text not null',
  'subject text',
  'message text',
  'summary text',
  'external_reference text',
  'source text',
  'duration_seconds integer',
  'status text not null default',
  'occurred_at timestamptz not null default now',
  'metadata jsonb not null default',
]) {
  assert.match(migrationSql, new RegExp(field.replaceAll('(', '\\(').replaceAll(')', '\\)')), `migration should include ${field}`)
}
for (const value of ['call', 'email', 'whatsapp', 'sms', 'meeting', 'note', 'system', 'outbound', 'inbound', 'internal']) {
  assert.match(migrationSql, new RegExp(`'${value}'`), `migration should include ${value}`)
}
for (const indexName of [
  'lead_communication_events_org_lead_idx',
  'lead_communication_events_contact_idx',
  'lead_communication_events_agent_idx',
  'lead_communication_events_type_idx',
  'lead_communication_events_direction_idx',
  'lead_communication_events_occurred_idx',
  'lead_communication_events_external_reference_idx',
]) {
  assert.match(migrationSql, new RegExp(indexName), `migration should include ${indexName}`)
}
assert.match(migrationSql, /lead_communication_events_select_member/)
assert.match(migrationSql, /lead_communication_events_insert_member/)
assert.match(migrationSql, /bridge_is_active_member\(organisation_id\)/)
assert.match(migrationSql, /l\.organisation_id = lead_communication_events\.organisation_id/)
assert.match(migrationSql, /c\.organisation_id = lead_communication_events\.organisation_id/)

const serviceSource = await fs.readFile(new URL('../src/services/leadCommunicationService.js', import.meta.url), 'utf8')
for (const method of [
  'listLeadCommunications',
  'createCommunicationEvent',
  'logCall',
  'logEmail',
  'logWhatsApp',
  'logMeeting',
  'logNote',
  'createSystemEvent',
  'buildCommunicationTimeline',
]) {
  assert.match(serviceSource, new RegExp(`export .*${method}`), `service should export ${method}`)
}
assert.match(serviceSource, /createAgencyCrmLeadActivity/)
assert.match(serviceSource, /communication_event/)
assert.doesNotMatch(serviceSource, /sendEmail|sendWhatsApp|sendSms|sendSMS|campaign/i)

const workspaceServiceSource = await fs.readFile(new URL('../src/services/agentLeadWorkspaceService.js', import.meta.url), 'utf8')
assert.match(workspaceServiceSource, /listLeadCommunications/)
assert.match(workspaceServiceSource, /buildCommunicationTimeline/)
assert.match(workspaceServiceSource, /communicationTimeline/)

const leadsPageSource = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
for (const copy of ['Timeline', 'Log Call', 'Log Email', 'Log WhatsApp', 'Add Note', 'Log Meeting', 'Quick Logging']) {
  assert.match(leadsPageSource, new RegExp(copy), `lead workspace should render ${copy}`)
}
assert.match(leadsPageSource, /filterCommunicationTimeline/)
assert.match(leadsPageSource, /No messages are actually sent|does not send emails/)
assert.doesNotMatch(leadsPageSource, /sendEmail|sendWhatsApp|sendSms|sendSMS/)

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __leadCommunicationServiceTestUtils } = await server.ssrLoadModule('/src/services/leadCommunicationService.js')
  const {
    ACTIVITY_OUTCOME_MARKER,
    buildCommunicationPayload,
    buildCommunicationTimeline,
    filterCommunicationTimeline,
    normalizeCommunicationEvent,
    normalizeDirection,
    normalizeType,
  } = __leadCommunicationServiceTestUtils

  assert.equal(normalizeType('WhatsApp'), 'whatsapp')
  assert.equal(normalizeType('mystery'), 'note')
  assert.equal(normalizeDirection('Inbound'), 'inbound')
  assert.equal(normalizeDirection('mystery'), 'internal')

  const orgId = '11111111-1111-4111-8111-111111111111'
  const leadId = '22222222-2222-4222-8222-222222222222'
  const contactId = '33333333-3333-4333-8333-333333333333'
  const agentId = '44444444-4444-4444-8444-444444444444'

  const payload = buildCommunicationPayload({
    organisationId: orgId,
    leadId,
    contactId,
    agentId,
    communicationType: 'call',
    direction: 'outbound',
    durationMinutes: 6,
    summary: 'Discussed viewing availability.',
    outcome: 'Interested',
    followUpRequired: true,
    nextAction: 'Send Saturday slots',
    occurredAt: '2026-06-03T08:30:00.000Z',
  })
  assert.equal(payload.organisation_id, orgId)
  assert.equal(payload.lead_id, leadId)
  assert.equal(payload.contact_id, contactId)
  assert.equal(payload.agent_id, agentId)
  assert.equal(payload.communication_type, 'call')
  assert.equal(payload.direction, 'outbound')
  assert.equal(payload.duration_seconds, 360)
  assert.equal(payload.metadata.outcome, 'Interested')
  assert.equal(payload.metadata.followUpRequired, true)

  const normalized = normalizeCommunicationEvent({
    communication_id: '55555555-5555-4555-8555-555555555555',
    organisation_id: orgId,
    lead_id: leadId,
    contact_id: contactId,
    agent_id: agentId,
    communication_type: 'email',
    direction: 'inbound',
    subject: 'Property options',
    summary: 'Lead replied to options.',
    occurred_at: '2026-06-03T09:00:00.000Z',
    metadata: { hasAttachments: true },
  })
  assert.equal(normalized.communicationType, 'email')
  assert.equal(normalized.direction, 'inbound')
  assert.equal(normalized.metadata.hasAttachments, true)

  const timeline = buildCommunicationTimeline({
    communications: [
      normalized,
      {
        communicationId: '66666666-6666-4666-8666-666666666666',
        organisationId: orgId,
        leadId,
        agentId,
        communicationType: 'whatsapp',
        direction: 'outbound',
        summary: 'Sent listing link.',
        occurredAt: '2026-06-03T10:00:00.000Z',
      },
    ],
    leadActivities: [
      {
        activityId: 'activity-visible',
        leadId,
        activityType: 'Property24 enquiry received',
        activityNote: 'Original enquiry captured.',
        activityDate: '2026-06-03T07:00:00.000Z',
      },
      {
        activityId: 'activity-hidden',
        leadId,
        activityType: 'Call logged',
        activityNote: 'Hidden mirror',
        outcome: ACTIVITY_OUTCOME_MARKER,
        activityDate: '2026-06-03T08:30:00.000Z',
      },
    ],
    assignmentHistory: [
      {
        assignmentId: 'assignment-one',
        leadId,
        reason: 'Assigned to listing agent',
        previousQueueId: 'unassigned',
        newAgentId: agentId,
        createdAt: '2026-06-03T07:30:00.000Z',
      },
    ],
    tasks: [
      {
        taskId: 'task-one',
        leadId,
        title: 'Contact lead',
        status: 'Pending',
        dueDate: '2026-06-03T12:00:00.000Z',
      },
    ],
    appointments: [
      {
        appointmentId: 'appointment-one',
        title: 'Viewing Scheduled',
        status: 'scheduled',
        startTime: '2026-06-04T10:00:00.000Z',
      },
    ],
    offers: [
      {
        id: 'offer-one',
        status: 'submitted',
        submittedAt: '2026-06-05T10:00:00.000Z',
      },
    ],
    transactions: [
      {
        id: 'transaction-one',
        status: 'active',
        createdAt: '2026-06-06T10:00:00.000Z',
      },
    ],
  })

  assert.equal(timeline[0].kind, 'transaction')
  assert.equal(timeline[1].kind, 'offer')
  assert.equal(timeline.some((item) => item.kind === 'communication' && item.communicationType === 'whatsapp'), true)
  assert.equal(timeline.some((item) => item.kind === 'activity' && item.title.includes('Property24')), true)
  assert.equal(timeline.some((item) => item.raw?.activityId === 'activity-hidden'), false)
  assert.equal(timeline.some((item) => item.kind === 'assignment' && item.summary.includes('Assigned to listing agent')), true)
  assert.equal(timeline.some((item) => item.kind === 'task'), true)
  assert.equal(timeline.some((item) => item.kind === 'appointment'), true)

  assert.equal(filterCommunicationTimeline(timeline, { type: 'whatsapp' }).length, 1)
  assert.equal(filterCommunicationTimeline(timeline, { direction: 'inbound' }).length, 1)
  assert.equal(filterCommunicationTimeline(timeline, { keyword: 'listing link' }).length, 1)
  assert.equal(filterCommunicationTimeline(timeline, { agentId }).some((item) => item.agentId === agentId), true)
  assert.equal(filterCommunicationTimeline(timeline, { dateFrom: '2026-06-05', dateTo: '2026-06-06' }).length, 2)
} finally {
  await server.close()
}

console.log('lead communication tests passed')
