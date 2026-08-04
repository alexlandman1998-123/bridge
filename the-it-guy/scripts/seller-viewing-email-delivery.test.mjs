import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const pageSource = await fs.readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const sendEmailIndexSource = await fs.readFile(new URL('../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8')
const sendEmailTypesSource = await fs.readFile(new URL('../../supabase/functions/send-email/types.ts', import.meta.url), 'utf8')
const handlerSource = await fs.readFile(new URL('../../supabase/functions/send-email/handlers/sellerViewingAvailabilityRequest.ts', import.meta.url), 'utf8')
const templateSource = await fs.readFile(new URL('../../supabase/functions/send-email/content/sellerViewingAvailabilityRequest.ts', import.meta.url), 'utf8')
const templateTestSource = await fs.readFile(new URL('../../supabase/functions/send-email/content/brandedTemplates.test.ts', import.meta.url), 'utf8')

const handlerStart = pageSource.indexOf('async function handleSendSellerViewingAvailabilityRequest')
assert.notEqual(handlerStart, -1, 'seller viewing availability handler should exist on the lead workspace')
const handlerEnd = pageSource.indexOf('\n  function handleOpenViewingPlanBookingModal', handlerStart)
assert.notEqual(handlerEnd, -1, 'seller viewing availability handler should remain before booking modal')
const plannerHandler = pageSource.slice(handlerStart, handlerEnd)

assert.match(plannerHandler, /invokeEdgeFunction\('send-email'/, 'seller planner should call the email edge function')
assert.match(plannerHandler, /type: 'seller_viewing_availability_request'/, 'seller planner should send the seller viewing template type')
assert.match(plannerHandler, /to: sellerEmails/, 'seller planner should send the selected seller recipients')
assert.match(plannerHandler, /resend: isResend/, 'seller planner resend should stay on the edge-function email path')
assert.match(plannerHandler, /availabilityWindows/, 'seller planner should include buyer availability windows')
assert.match(plannerHandler, /sellerEmailDeliveryStatus/, 'seller planner should persist seller delivery status')
assert.match(plannerHandler, /sellerEmailProviderMessageIds/, 'seller planner should persist provider message ids')
assert.match(plannerHandler, /partial_sent/, 'seller planner should handle partial batch sends')
assert.match(plannerHandler, /Seller Availability Requested/, 'seller planner should log successful request activity')
assert.match(plannerHandler, /Seller Availability Email Failed/, 'seller planner should log failed request activity')
assert.doesNotMatch(plannerHandler, /window\.location\.href = `mailto:/, 'seller viewing planner should not open a mailto draft fallback')
assert.doesNotMatch(plannerHandler, /I opened an email draft as a fallback/, 'seller viewing planner should not report draft fallback copy')

assert.match(pageSource, /viewingPlannerSellerEmailDeliveryLabel/, 'planner should show seller delivery status to the agent')
assert.match(pageSource, /Email sent/, 'planner should label successful seller send')
assert.match(pageSource, /Partially sent/, 'planner should label partial seller send')
assert.match(pageSource, /Delivery suppressed/, 'planner should label suppressed seller delivery')
assert.match(pageSource, /Email failed/, 'planner should label failed seller delivery')

assert.match(sendEmailIndexSource, /handleSellerViewingAvailabilityRequestEmail/, 'send-email router should import the seller viewing handler')
assert.match(sendEmailIndexSource, /seller_viewing_availability_request/, 'send-email router should route the seller viewing template')
assert.match(sendEmailTypesSource, /SendSellerViewingAvailabilityRequestPayload/, 'send-email types should define the seller viewing payload')
assert.match(sendEmailTypesSource, /SellerViewingAvailabilityRequestPropertyPayload/, 'send-email types should define seller property payloads')

for (const contract of [
  /prepareEmailDelivery/,
  /sendViaResendApi/,
  /markEmailDeliverySent/,
  /markEmailDeliveryFailed/,
  /communicationType: "seller_viewing_availability_request"/,
  /recipientRole: "seller"/,
  /replyTo: agentEmail/,
  /assessControlledTestRecipient/,
]) {
  assert.match(handlerSource, contract, `handler should include ${contract}`)
}

for (const contract of [
  /renderBridgeEmailLayout/,
  /Seller Viewing Availability/,
  /Properties To Confirm/,
  /Buyer availability/,
  /Please reply with/,
  /Powered by Arch9/,
]) {
  assert.match(templateSource, contract, `template should include ${contract}`)
}

assert.match(templateTestSource, /seller viewing availability request renders company branding and access instructions/, 'Deno template test should cover the branded seller viewing email')
assert.match(templateTestSource, /Kingstons Property/, 'template test should assert custom organisation branding')
assert.match(templateTestSource, /114 West Street/, 'template test should assert property details render')

console.log('seller viewing email delivery contract tests passed')
