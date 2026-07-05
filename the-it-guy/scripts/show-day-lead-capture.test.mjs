import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const serviceSource = await fs.readFile(new URL('../src/services/showDayLeadCaptureService.js', import.meta.url), 'utf8')
const ingestionSource = await fs.readFile(new URL('../src/services/leadIngestionService.js', import.meta.url), 'utf8')

for (const copy of [
  'captureShowDayLead',
  'captureShowDayLeadBatch',
  'parseShowDayVisitorRows',
  'SHOW_DAY_SOURCE',
  'SHOW_DAY_WORKFLOW_VARIANT',
  'SHOW_DAY_FOLLOW_UP_TITLE',
  'createOrUpdateLeadFromEnquiry',
  'markLeadFirstContacted',
  'upsertLeadListingInterest',
  "status: 'viewed'",
  'createAppointmentAsync',
  'updateAppointmentAsync',
  "status: 'completed'",
  'upsertAppointmentViewedListings',
  'processViewingEvent',
  'createAgencyCrmLeadTask',
  'Phone follow-up and confirm whether buyer wants to submit an offer.',
  'Add at least one show-day visitor.',
]) {
  assert.match(serviceSource, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `show day capture service should include ${copy}`)
}

assert.match(serviceSource, /createInitialTask: false/, 'show day capture should suppress the generic Contact Lead task')
assert.match(serviceSource, /createLeadRecommendation: false/, 'show day capture should suppress the generic new lead recommendation')
assert.match(serviceSource, /workflowVariant: SHOW_DAY_WORKFLOW_VARIANT/, 'show day capture should label the workflow variant')
assert.match(serviceSource, /sendInviteEmails: false/, 'post-show-day capture should not send calendar invites')
assert.match(serviceSource, /attachCalendarInvite: false/, 'post-show-day capture should not attach calendar invites')
assert.match(serviceSource, /assignedAgent: normalized\.reserveAgentCalendar \?/, 'show day capture should avoid reserving agent calendar by default')
assert.match(serviceSource, /skipDuplicateSideEffects/, 'show day capture should be safe to retry for the same visitor/listing/day')

assert.match(ingestionSource, /createInitialTask = true/, 'normal enquiry ingestion should still create the default contact task')
assert.match(ingestionSource, /createLeadRecommendation = true/, 'normal enquiry ingestion should still create the default new-lead recommendation')
assert.match(ingestionSource, /normalizedWorkflowVariant === 'show_day'/, 'ingestion should understand the show-day workflow variant')
assert.match(ingestionSource, /shouldCreateInitialTask/, 'ingestion should make initial task creation optional')
assert.match(ingestionSource, /shouldCreateLeadRecommendation/, 'ingestion should make recommendation creation optional')

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __showDayLeadCaptureServiceTestUtils } = await server.ssrLoadModule('/src/services/showDayLeadCaptureService.js')
  const {
    buildAppointmentPayload,
    buildEnquiryPayload,
    buildFollowUpDescription,
    buildShowDaySourceReference,
    normalizeShowDayCapturePayload,
    normalizePhone,
    normalizeTime,
    parseShowDayVisitorRows,
    resolveShowDayAt,
    splitDelimitedRow,
  } = __showDayLeadCaptureServiceTestUtils

  assert.equal(normalizePhone('+27 82 111 2222'), '+27821112222')
  assert.equal(normalizePhone('082 111 2222'), '0821112222')
  assert.equal(normalizeTime('9'), '09:00')
  assert.equal(normalizeTime('09:45'), '09:45')
  assert.equal(resolveShowDayAt({ showDayAt: '2026-07-05T08:30:00.000Z' }), '2026-07-05T08:30:00.000Z')
  assert.deepEqual(splitDelimitedRow('"Sipho, Visitor",0821112222,"Liked the garden"', ','), ['Sipho, Visitor', '0821112222', 'Liked the garden'])

  const normalized = normalizeShowDayCapturePayload({
    organisationId: '11111111-1111-4111-8111-111111111111',
    listingId: '44444444-4444-4444-8444-444444444444',
    showDayDate: '2026-07-05',
    showDayTime: '10:30',
    name: 'Sipho Visitor',
    phone: '082 111 2222',
    email: 'SIPHO@example.test',
    notes: 'Met at the show day.',
    buyerFeedback: 'Liked the garden.',
    outcome: 'Wants to offer',
  }, { now: new Date('2026-07-05T08:00:00.000Z') })

  assert.equal(normalized.organisationId, '11111111-1111-4111-8111-111111111111')
  assert.equal(normalized.listingId, '44444444-4444-4444-8444-444444444444')
  assert.equal(normalized.contact.name, 'Sipho Visitor')
  assert.equal(normalized.contact.email, 'sipho@example.test')
  assert.equal(normalized.contact.phone, '0821112222')
  assert.equal(normalized.showDayDate, '2026-07-05')
  assert.equal(normalized.showDayTime, '10:30')
  assert.equal(normalized.sourceReferenceId, 'show-day:44444444-4444-4444-8444-444444444444:sipho-example-test:2026-07-05')
  assert.equal(normalized.outcome, 'Wants to offer')
  assert.equal(normalized.nextStep, 'Phone follow-up and confirm whether buyer wants to submit an offer.')
  assert.equal(normalized.followUpDueDate, '2026-07-06')
  assert.equal(normalized.createFollowUpTask, true)
  assert.equal(normalized.skipDuplicateSideEffects, true)
  assert.equal(normalized.reserveAgentCalendar, false)

  const offsetTimestamp = normalizeShowDayCapturePayload({
    organisationId: '11111111-1111-4111-8111-111111111111',
    listingId: '44444444-4444-4444-8444-444444444444',
    showDayAt: '2026-07-05T10:30:00+02:00',
    name: 'Offset Buyer',
  })
  assert.equal(offsetTimestamp.showDayAt, '2026-07-05T08:30:00.000Z')
  assert.equal(offsetTimestamp.showDayDate, '2026-07-05')
  assert.equal(offsetTimestamp.showDayTime, '10:30')

  const phoneOnlyReference = buildShowDaySourceReference({
    listingId: '44444444-4444-4444-8444-444444444444',
    showDayDate: '2026-07-05',
    phone: '082 111 2222',
  }, { now: new Date('2026-07-05T08:00:00.000Z') })
  assert.equal(phoneOnlyReference, 'show-day:44444444-4444-4444-8444-444444444444:0821112222:2026-07-05')

  const pastedVisitors = parseShowDayVisitorRows(`Name,Phone,Email,Outcome,Feedback
Sipho Visitor,082 111 2222,sipho@example.test,Wants to offer,Liked the garden
Lerato Buyer,083 333 4444,,Needs finance,Asked about repayments`, {
    showDayDate: '2026-07-05',
    followUpDueDate: '2026-07-06',
  })
  assert.equal(pastedVisitors.length, 2)
  assert.equal(pastedVisitors[0].rowNumber, 2)
  assert.equal(pastedVisitors[0].name, 'Sipho Visitor')
  assert.equal(pastedVisitors[0].phone, '082 111 2222')
  assert.equal(pastedVisitors[0].email, 'sipho@example.test')
  assert.equal(pastedVisitors[0].outcome, 'Wants to offer')
  assert.equal(pastedVisitors[0].buyerFeedback, 'Liked the garden')
  assert.equal(pastedVisitors[0].showDayDate, '2026-07-05')
  assert.equal(pastedVisitors[1].rowNumber, 3)
  assert.equal(pastedVisitors[1].outcome, 'Needs finance')

  const tabVisitors = parseShowDayVisitorRows('Nomsa Buyer\t084 111 2222\t\tInterested')
  assert.equal(tabVisitors.length, 1)
  assert.equal(tabVisitors[0].name, 'Nomsa Buyer')
  assert.equal(tabVisitors[0].phone, '084 111 2222')
  assert.equal(tabVisitors[0].outcome, 'Interested')

  const enquiry = buildEnquiryPayload(normalized)
  assert.equal(enquiry.source, 'Show Day')
  assert.equal(enquiry.externalReference, normalized.sourceReferenceId)
  assert.equal(enquiry.leadCategory, 'buyer')
  assert.equal(enquiry.lead.leadSource, 'Show Day')
  assert.equal(enquiry.lead.leadCategory, 'buyer')
  assert.equal(enquiry.lead.priority, 'High')
  assert.match(enquiry.message, /Show day capture reference/)
  assert.match(enquiry.message, /Buyer feedback: Liked the garden\./)

  const actor = { id: '55555555-5555-4555-8555-555555555555', name: 'Agent One', email: 'agent@example.test' }
  const appointment = buildAppointmentPayload(normalized, {
    leadId: '22222222-2222-4222-8222-222222222222',
    contactId: '33333333-3333-4333-8333-333333333333',
    actor,
  })
  assert.equal(appointment.appointmentType, 'viewing')
  assert.equal(appointment.status, 'confirmed')
  assert.equal(appointment.date, '2026-07-05')
  assert.equal(appointment.startTime, '10:30')
  assert.equal(appointment.leadId, '22222222-2222-4222-8222-222222222222')
  assert.equal(appointment.contactId, '33333333-3333-4333-8333-333333333333')
  assert.equal(appointment.listingId, normalized.listingId)
  assert.equal(appointment.sendInviteEmails, false)
  assert.equal(appointment.attachCalendarInvite, false)
  assert.deepEqual(appointment.assignedAgent, {})
  assert.equal(appointment.participants[0].participantRole, 'Buyer')
  assert.equal(appointment.participants[0].rsvpStatus, 'Confirmed')

  const reserved = normalizeShowDayCapturePayload({
    ...normalized.raw,
    reserveAgentCalendar: true,
  })
  const reservedAppointment = buildAppointmentPayload(reserved, {
    leadId: '22222222-2222-4222-8222-222222222222',
    contactId: '33333333-3333-4333-8333-333333333333',
    actor,
  })
  assert.equal(reservedAppointment.assignedAgent.id, actor.id)

  const followUpDescription = buildFollowUpDescription(normalized)
  assert.match(followUpDescription, /Phone the buyer/)
  assert.match(followUpDescription, /submit an offer/)
  assert.match(followUpDescription, /Viewing outcome: Wants to offer\./)
} finally {
  await server.close()
}

console.log('show day lead capture tests passed')
