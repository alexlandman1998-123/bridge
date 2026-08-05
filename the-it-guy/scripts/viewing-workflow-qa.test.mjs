import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const pageSource = await fs.readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
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
  'async function handleSendBuyerViewingAvailabilityRequest',
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
  'async function handleApplyBuyerViewingPreferenceResponse',
  '\n  async function handleSendSellerViewingAvailabilityRequest',
  'buyer preference response pull-through flow',
)

for (const contract of [
  /BUYER_LEAD_WORKSPACE_TAB_KEYS = new Set\(\['overview', 'properties', 'appointments', 'activity', 'offers'\]\)/,
  /parseBuyerViewingPlanNoteBlock/,
  /buildBuyerViewingPlanNotes/,
  /buyerEmailDeliveryStatus/,
  /sellerEmailDeliveryStatus/,
]) {
  assert.match(pageSource, contract, `buyer workspace should keep the simplified viewing workflow contract ${contract}`)
}

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
  /Confirm viewings/,
  /listBuyerViewingPreferenceLinks/,
  /handleApplyBuyerViewingPreferenceResponse/,
  /Check responses/,
  /Apply response/,
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
