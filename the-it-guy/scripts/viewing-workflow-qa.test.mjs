import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { buildBuyerJourneyAlignmentModel } from '../src/services/buyerJourneyAlignmentService.js'
import { buildBuyerViewingRequestSummary } from '../src/pages/agency/buyerViewingRequestSummary.js'

const pageSource = await fs.readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const summaryInput = { now: '2026-09-27T12:00:00.000Z' }
assert.equal(buildBuyerViewingRequestSummary(summaryInput).status, 'not_requested')
assert.equal(buildBuyerViewingRequestSummary({ ...summaryInput, links: [{ id: 'link-1', status: 'pending', createdAt: '2026-09-27T08:00:00.000Z' }] }).status, 'requested')
assert.equal(buildBuyerViewingRequestSummary({ ...summaryInput, plan: { requestedAt: '2026-09-27T08:05:00.000Z', buyerEmailDeliveryStatus: 'sent' }, links: [{ id: 'link-1', status: 'pending', createdAt: '2026-09-27T08:00:00.000Z' }] }).status, 'awaiting_response')
const submittedSummary = buildBuyerViewingRequestSummary({ ...summaryInput, links: [{ id: 'link-1', status: 'submitted', createdAt: '2026-09-27T08:00:00.000Z' }], latestResponse: { id: 'link-1', submittedAt: '2026-09-27T09:00:00.000Z', availabilityWindows: ['Monday 09:00', 'Tuesday 10:00', 'Wednesday 11:00'] } })
assert.equal(submittedSummary.status, 'submitted')
assert.deepEqual(submittedSummary.proposedTimes, ['Monday 09:00', 'Tuesday 10:00', 'Wednesday 11:00'])
assert.equal(buildBuyerViewingRequestSummary({ ...summaryInput, plan: { bookedAt: '2026-09-27T10:00:00.000Z' }, links: [{ id: 'link-1', status: 'submitted', createdAt: '2026-09-27T08:00:00.000Z' }], latestResponse: { id: 'link-1', availabilityWindows: submittedSummary.proposedTimes } }).status, 'booked')
assert.equal(buildBuyerViewingRequestSummary({ ...summaryInput, plan: { bookedAppointmentIds: ['seller-rsvp-request'] }, appointments: [{ id: 'seller-rsvp-request', status: 'requested', createdAt: '2026-09-27T10:00:00.000Z' }], links: [{ id: 'link-1', status: 'submitted', createdAt: '2026-09-27T08:00:00.000Z' }], latestResponse: { id: 'link-1', availabilityWindows: submittedSummary.proposedTimes } }).status, 'submitted', 'a requested seller RSVP must not be labelled booked')
assert.equal(buildBuyerViewingRequestSummary({ ...summaryInput, plan: { buyerEmailDeliveryStatus: 'failed' }, links: [{ id: 'link-1', status: 'pending', createdAt: '2026-09-27T08:00:00.000Z' }] }).status, 'delivery_failed')
assert.equal(buildBuyerViewingRequestSummary({ ...summaryInput, plan: { requestedAt: '2026-09-27T08:05:00.000Z', buyerEmailDeliveryStatus: 'failed' }, links: [{ id: 'link-1', status: 'pending', createdAt: '2026-09-27T08:00:00.000Z' }] }).status, 'delivery_failed')
assert.equal(buildBuyerViewingRequestSummary({ ...summaryInput, plan: { requestedAt: '2026-09-27T08:05:00.000Z', buyerEmailDeliveryStatus: 'suppressed' }, links: [{ id: 'link-1', status: 'pending', createdAt: '2026-09-27T08:00:00.000Z' }] }).status, 'delivery_suppressed')
assert.equal(buildBuyerViewingRequestSummary({ ...summaryInput, links: [{ id: 'link-1', status: 'pending', createdAt: '2026-09-27T08:00:00.000Z', expiresAt: '2026-09-27T11:00:00.000Z' }] }).status, 'expired')
const resentSummary = buildBuyerViewingRequestSummary({ ...summaryInput, plan: { requestedAt: '2026-09-27T10:00:00.000Z', buyerEmailDeliveryStatus: 'sent' }, links: [{ id: 'link-2', status: 'pending', createdAt: '2026-09-27T10:00:00.000Z' }, { id: 'link-1', status: 'submitted', createdAt: '2026-09-27T08:00:00.000Z' }], latestResponse: { id: 'link-1', availabilityWindows: submittedSummary.proposedTimes } })
assert.equal(resentSummary.status, 'awaiting_response', 'a newer request must take priority over an earlier response')
assert.equal(resentSummary.hasEarlierResponse, true)
assert.equal(buildBuyerViewingRequestSummary({ ...summaryInput, plan: { requestedAt: '2026-09-27T08:05:00.000Z', buyerEmailDeliveryStatus: 'sent' }, links: [{ id: 'link-2', status: 'pending', createdAt: '2026-09-27T10:00:00.000Z' }] }).status, 'requested', 'an older sent request must not verify delivery of a newly prepared link')
assert.match(pageSource, /data-testid="buyer-viewing-request-status"/, 'viewing request status should always appear below the overview columns')
assert.match(pageSource, /viewingRequestSummary\.proposedTimes\.map/, 'the overview should display the saved buyer options')
assert.match(pageSource, /Internal CRM record\. Logging a call, WhatsApp or email does not send a message\./, 'the Activity Logger should explain its internal-only effect')
assert.match(pageSource, /catch \(activityError\) \{\s*setError\(activityError\?\.message/, 'Activity Logger save failures should remain visible to the agent')
const reportingServiceSource = await fs.readFile(new URL('../src/modules/agency/agents/principalAgentCommandCentreService.js', import.meta.url), 'utf8')
const reportingTestSource = await fs.readFile(new URL('./principal-agent-command-centre.test.mjs', import.meta.url), 'utf8')
const buyerEmailTestSource = await fs.readFile(new URL('./buyer-viewing-email-delivery.test.mjs', import.meta.url), 'utf8')
const buyerPreferenceLinkTestSource = await fs.readFile(new URL('./buyer-viewing-preference-link.test.mjs', import.meta.url), 'utf8')
const sellerEmailTestSource = await fs.readFile(new URL('./seller-viewing-email-delivery.test.mjs', import.meta.url), 'utf8')
const sendEmailIndexSource = await fs.readFile(new URL('../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8')
const brandedEmailTestSource = await fs.readFile(new URL('../../supabase/functions/send-email/content/brandedTemplates.test.ts', import.meta.url), 'utf8')
const communicationDeliveryLoggingSource = await fs.readFile(new URL('../../supabase/functions/send-email/services/communicationDeliveryLogging.ts', import.meta.url), 'utf8')

function extractBlock(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `${label} should include ${startMarker}`)
  const end = source.indexOf(endMarker, start)
  assert.notEqual(end, -1, `${label} should end before ${endMarker}`)
  return source.slice(start, end)
}

const buyerRequestBlock = extractBlock(
  pageSource,
  'async function _handleSendBuyerViewingAvailabilityRequest',
  '\n  async function handleCaptureBuyerViewingResponse',
  'buyer availability request flow',
)
const buyerResponseBlock = extractBlock(
  pageSource,
  'async function handleCaptureBuyerViewingResponse',
  '\n  async function handleSendSellerViewingAvailabilityRequest',
  'buyer response capture flow',
)
const sellerRequestBlock = extractBlock(
  pageSource,
  'async function handleSendSellerViewingAvailabilityRequest',
  '\n  function handleOpenViewingPlanBookingModal',
  'seller availability request flow',
)
const bookingModalBlock = extractBlock(
  pageSource,
  'function handleOpenViewingPlanBookingModal',
  '\n  async function handleSaveBuyerQualification',
  'viewing booking modal setup',
)
const appointmentSaveBlock = extractBlock(
  pageSource,
  'async function handleCreateAppointment',
  '\n  function handleOpenAppointmentModal',
  'appointment save flow',
)
const buyerPreferenceApplyBlock = extractBlock(
  pageSource,
  'async function _handleApplyBuyerViewingPreferenceResponse',
  '\n  async function handleSendSellerViewingAvailabilityRequest',
  'buyer preference response pull-through flow',
)
const buyerJourneyBlock = extractBlock(
  pageSource,
  'const selectedLeadBuyerJourneyModel = useMemo',
  '\n  const selectedLeadBuyerJourneyStages = selectedLeadBuyerJourneyModel.stages',
  'buyer journey alignment input',
)
const buyerQualificationSaveBlock = extractBlock(
  pageSource,
  'async function handleSaveBuyerQualification',
  '\n  function handleOpenBuyerQualificationAction',
  'buyer qualification save flow',
)
const viewingCompletionBlock = extractBlock(
  pageSource,
  'async function handleCompleteLeadViewing',
  '\n  async function handleCancelLeadViewing',
  'viewing completion flow',
)
for (const contract of [
  /BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY = 'onboarding_otp'/,
  /BUYER_LEAD_WORKSPACE_TAB_KEYS = new Set\(\[/,
  /normalizeLeadWorkspaceTabKey/,
  /parseBuyerViewingPlanNoteBlock/,
  /buildBuyerViewingPlanNotes/,
  /buyerEmailDeliveryStatus/,
  /sellerEmailDeliveryStatus/,
  /BUYER_QUALIFICATION_MINIMUM_ANSWER_COUNT = 2/,
  /getBuyerQualificationEvidence/,
]) {
  assert.match(pageSource, contract, `buyer workspace should keep the simplified viewing workflow contract ${contract}`)
}
const buyerTabSet = extractBlock(pageSource, 'const BUYER_LEAD_WORKSPACE_TAB_KEYS = new Set([', '])', 'buyer workspace tab set')
for (const tab of ["'overview'", "'properties'", "'appointments'", "'activity'", 'BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY']) {
  assert.ok(buyerTabSet.includes(tab), `buyer workspace should keep the ${tab} tab`)
}

for (const contract of [
  /const qualificationStarted = selectedLeadBuyerQualificationEvidence\.answeredCount > 0/,
  /const qualified = selectedLeadBuyerQualificationEvidence\.complete/,
  /return buildBuyerJourneyAlignmentModel\(\{/,
  /qualificationStarted,/,
  /qualified,/,
]) {
  assert.match(buyerJourneyBlock, contract, `buyer journey should not skip qualification with viewing activity ${contract}`)
}
const viewingWithoutQualification = buildBuyerJourneyAlignmentModel({
  evidence: { leadCaptured: true, contacted: true, viewingStarted: true },
})
assert.equal(viewingWithoutQualification.stages.find((stage) => stage.key === 'qualified')?.done, false, 'viewing activity alone must not complete buyer qualification')

for (const contract of [
  /const qualificationEvidence = getBuyerQualificationEvidence\(mergedAnswers\)/,
  /if \(qualificationEvidence\.complete && \[BUYER_PROCESS_STAGE_KEYS\.captured/,
  /Qualification saved as in progress/,
  /outcome: qualificationEvidence\.complete \? 'Qualified' : 'In progress'/,
]) {
  assert.match(buyerQualificationSaveBlock, contract, `buyer qualification save should allow partial capture without forcing qualified ${contract}`)
}
assert.match(pageSource, /function handleMarkBuyerQualifiedAction\(\)[\s\S]*Capture at least \$\{selectedLeadBuyerQualificationEvidence\.minimumCount\} qualification answers/, 'manual mark qualified should require minimum qualification answers')

for (const contract of [
  /invokeEdgeFunction\('send-email'/,
  /invokeEdgeFunction\('buyer-viewing-preferences'/,
  /type: 'buyer_viewing_availability_request'/,
  /actionLink: preferenceLink/,
  /resend: isResend/,
  /propertyCount: selectedPropertyIds\.length/,
  /deliveryMetadata/,
  /Viewing Availability Requested/,
  /Viewing Availability Email Failed/,
]) {
  assert.match(buyerRequestBlock, contract, `buyer availability request should include ${contract}`)
}
assert.doesNotMatch(buyerRequestBlock, /window\.location\.href = `mailto:/, 'buyer availability request should not open a mailto fallback')
assert.doesNotMatch(buyerRequestBlock, /I opened an email draft as a fallback/, 'buyer availability request should not report draft fallback copy')

for (const contract of [
  /status: nextStatus/,
  /nextStatus = 'buyer_confirmed'/,
  /confirmedPropertyIds/,
  /availabilityWindows/,
  /Buyer Viewing Response Captured/,
  /Follow up seller viewing access/,
  /completeBuyerViewingAutomationTask\('Coordinate seller viewing access'\)/,
]) {
  assert.match(buyerResponseBlock, contract, `buyer response capture should include ${contract}`)
}

for (const contract of [
  /invokeEdgeFunction\('send-email'/,
  /type: 'seller_viewing_availability_request'/,
  /to: sellerEmails/,
  /resend: isResend/,
  /availabilityWindows/,
  /deliveryMetadata/,
  /sellerEmailDeliveryStatus/,
  /partial_sent/,
  /Seller Availability Requested/,
  /Seller Availability Email Failed/,
]) {
  assert.match(sellerRequestBlock, contract, `seller availability request should include ${contract}`)
}
assert.doesNotMatch(sellerRequestBlock, /window\.location\.href = `mailto:/, 'seller availability request should not open a mailto fallback')
assert.doesNotMatch(sellerRequestBlock, /I opened an email draft as a fallback/, 'seller availability request should not report draft fallback copy')

for (const contract of [
  /setViewingPlanBookingContext\(\{ leadId: normalizeText\(selectedLead\.leadId\), propertyId: resolvedPropertyId \}\)/,
  /buildDefaultAppointmentFormForType\('viewing'/,
  /appointmentType: 'viewing'/,
  /listingId: resolvedPropertyId/,
  /relatedEntityType: 'lead'/,
  /relatedEntityId: normalizeText\(selectedLead\?\.leadId\)/,
  /status: 'confirmed'/,
  /recipientEmail: buyerEmail/,
  /participantRole: 'Seller'/,
]) {
  assert.match(bookingModalBlock, contract, `viewing booking modal should include ${contract}`)
}

for (const contract of [
  /createAppointmentAsync/,
  /createdAppointmentId/,
  /viewingPlanBookingContext/,
  /bookedPropertyIds/,
  /bookedAppointmentIds/,
  /allConfirmedPropertiesBooked/,
  /Viewing Appointment Booked/,
  /Post-viewing buyer follow-up/,
]) {
  assert.match(appointmentSaveBlock, contract, `appointment save should update the viewing workflow with ${contract}`)
}

for (const contract of [
  /buyer_viewing_availability_request/,
  /seller_viewing_availability_request/,
  /handleBuyerViewingAvailabilityRequestEmail/,
  /handleSellerViewingAvailabilityRequestEmail/,
]) {
  assert.match(sendEmailIndexSource, contract, `send-email router should include ${contract}`)
}

for (const contract of [
  /deliveryMetadata \|\| payload\.delivery_metadata/,
  /metadata_json/,
  /communication_type: communicationType/,
]) {
  assert.match(communicationDeliveryLoggingSource, contract, `delivery telemetry should include ${contract}`)
}

for (const contract of [
  /buyer viewing availability request renders company branding and property list/,
  /seller viewing availability request renders company branding and access instructions/,
  /Kingstons Property/,
  /background: #123abc/,
  /border-bottom: 4px solid #fedcba/,
]) {
  assert.match(brandedEmailTestSource, contract, `branded email QA should include ${contract}`)
}

for (const contract of [
  /buyer viewing email delivery contract tests passed/,
  /Viewing Availability Requested/,
  /Viewing Availability Email Failed/,
  /buyerViewingPreferenceLinkId/,
]) {
  assert.match(buyerEmailTestSource, contract, `buyer email contract should include ${contract}`)
}

for (const contract of [
  /buyer viewing preference link contract tests passed/,
  /BuyerViewingPreferencesPage/,
  /buyer-viewing-preferences/,
  /Share details and 3 viewing times/,
  /listBuyerViewingPreferenceLinks/,
  /handleApplyBuyerViewingPreferenceResponse/,
  /reloadBuyerViewingPreferenceLinks/,
  /Apply to planner/,
  /Buyer Viewing Response Pulled Into Workspace/,
]) {
  assert.match(buyerPreferenceLinkTestSource, contract, `buyer preference link contract should include ${contract}`)
}

for (const contract of [
  /normalizeBuyerViewingPreferenceResponse/,
  /buildBuyerViewingPlanNotes/,
  /Buyer Viewing Response Pulled Into Workspace/,
  /Follow up seller viewing access/,
  /completeBuyerViewingAutomationTask\('Follow up buyer viewing availability'\)/,
  /patchSelectedLeadRecord/,
]) {
  assert.match(buyerPreferenceApplyBlock, contract, `buyer preference pull-through should include ${contract}`)
}

for (const contract of [
  /handleOpenViewingCompletedFeedbackOverride/,
  /Viewing completed feedback/,
  /viewing_completed_feedback/,
  /Use the appointment completion flow/,
]) {
  assert.match(pageSource, contract, `buyer availability override should expose completed-viewing feedback ${contract}`)
}
assert.match(buyerResponseBlock, /completeBuyerViewingAutomationTask\('Follow up buyer viewing availability'\)/, 'manual buyer response capture should complete the stale buyer availability follow-up')
assert.match(viewingCompletionBlock, /completeBuyerViewingAutomationTask\('Follow up buyer viewing availability'\)/, 'viewing completion should clear stale buyer availability follow-up tasks')
assert.match(viewingCompletionBlock, /completeBuyerViewingAutomationTask\('Post-viewing buyer follow-up'\)/, 'viewing completion should clear post-viewing feedback follow-up tasks')

for (const contract of [
  /seller viewing email delivery contract tests passed/,
  /Seller Availability Requested/,
  /Seller Availability Email Failed/,
  /partial_sent/,
]) {
  assert.match(sellerEmailTestSource, contract, `seller email contract should include ${contract}`)
}

for (const contract of [
  /classifyAppointmentBucket\(row\) === 'viewings'/,
  /viewingsScheduled/,
  /currentMonthRange/,
  /prospectingActivity/,
  /monthlyPerformance/,
]) {
  assert.match(reportingServiceSource, contract, `principal reporting should include ${contract}`)
}

for (const contract of [
  /planner-created viewing appointment should increment the principal agent detail viewings counter/,
  /planner-created viewing appointment should increment current-month viewings scheduled/,
  /planner-created viewing appointment should increment prospecting viewings scheduled/,
  /appointmentType: 'viewing'/,
]) {
  assert.match(reportingTestSource, contract, `principal reporting test should include ${contract}`)
}

console.log('viewing workflow QA contract tests passed')
