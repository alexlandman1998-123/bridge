import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const pageSource = await fs.readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const sendEmailIndexSource = await fs.readFile(new URL('../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8')
const sendEmailTypesSource = await fs.readFile(new URL('../../supabase/functions/send-email/types.ts', import.meta.url), 'utf8')
const handlerSource = await fs.readFile(new URL('../../supabase/functions/send-email/handlers/viewingAvailabilityRequest.ts', import.meta.url), 'utf8')
const confirmationHandlerSource = await fs.readFile(new URL('../../supabase/functions/send-email/handlers/buyerViewingAvailabilityConfirmation.ts', import.meta.url), 'utf8')
const preferenceFunctionSource = await fs.readFile(new URL('../../supabase/functions/buyer-viewing-preferences/index.ts', import.meta.url), 'utf8')
const templateSource = await fs.readFile(new URL('../../supabase/functions/send-email/content/viewingAvailabilityRequest.ts', import.meta.url), 'utf8')
const templateTestSource = await fs.readFile(new URL('../../supabase/functions/send-email/content/brandedTemplates.test.ts', import.meta.url), 'utf8')

const handlerStart = pageSource.indexOf('async function _handleSendBuyerViewingAvailabilityRequest')
assert.notEqual(handlerStart, -1, 'buyer viewing availability handler should exist on the lead workspace')
const handlerEnd = pageSource.indexOf('\n  async function handleCaptureBuyerViewingResponse', handlerStart)
assert.notEqual(handlerEnd, -1, 'buyer viewing availability handler should remain before response capture')
const plannerHandler = pageSource.slice(handlerStart, handlerEnd)

assert.match(plannerHandler, /invokeEdgeFunction\('send-email'/, 'planner should call the email edge function')
assert.match(plannerHandler, /invokeEdgeFunction\('buyer-viewing-preferences'/, 'planner should create a buyer viewing preference link before sending')
assert.match(plannerHandler, /type: 'buyer_viewing_availability_request'/, 'planner should send the buyer viewing template type')
assert.match(plannerHandler, /actionLink: preferenceLink/, 'planner should pass the preference link as the email CTA')
assert.match(plannerHandler, /agentAvatarUrl/, 'planner should pass the agent avatar URL to the buyer viewing email')
assert.match(plannerHandler, /buyerViewingPreferenceLinkId/, 'planner should include the preference link id in delivery metadata')
assert.match(plannerHandler, /resend: isResend/, 'planner resend should stay on the edge-function email path')
assert.match(pageSource, /imageUrl: normalizeText\(property\?\.image/, 'planner should include the listing image in the email payload')
assert.match(plannerHandler, /buyerEmailDeliveryStatus/, 'planner should persist delivery status in the viewing plan')
assert.match(plannerHandler, /buyerEmailProviderMessageId/, 'planner should persist the provider message id')
assert.match(plannerHandler, /Viewing Availability Requested/, 'planner should log successful request activity')
assert.match(plannerHandler, /Viewing Availability Email Failed/, 'planner should log failed request activity')
assert.doesNotMatch(plannerHandler, /window\.location\.href = `mailto:/, 'buyer viewing planner should not open a mailto draft fallback')
assert.doesNotMatch(plannerHandler, /I opened an email draft as a fallback/, 'buyer viewing planner should not report draft fallback copy')

assert.match(pageSource, /viewingPlannerBuyerEmailDeliveryLabel/, 'planner should show delivery status to the agent')
assert.match(pageSource, /Email sent/, 'planner should label successful send')
assert.match(pageSource, /Delivery suppressed/, 'planner should label suppressed test delivery')
assert.match(pageSource, /Email failed/, 'planner should label failed delivery')
assert.match(pageSource, />\s*Back\s*<\/Button>/, 'planner should expose a simple Back button for property selection')
assert.doesNotMatch(pageSource, /Edit selected properties/, 'planner should not use the old edit-selected-properties copy')
assert.match(pageSource, /data-testid="buyer-submitted-viewing-times"[\s\S]*data-testid="simplified-viewing-planner"/, 'planner should show buyer-submitted viewing times above Viewing Planner')
assert.match(pageSource, /Buyer submitted 3 preferred options/, 'planner should surface the three buyer-submitted preferred viewing options')
assert.match(pageSource, /const VIEWING_PLANNER_PRICE_MATCH_TOLERANCE = 500000/, 'planner should keep suggested listings within the R500k price class')
assert.match(pageSource, /raw\.match\(\/\\d\[\\d\\s\.,\]\*\//, 'price matching should parse formatted currency values with thousands separators')
assert.match(pageSource, /priceAmount >= priceFloor && priceAmount <= priceCeiling/, 'planner suggestions should filter active listings to the enquiry price band')
assert.match(pageSource, /resolveListingImageUrl\(listing\)/, 'planner cards should use real listing image fields')
assert.match(pageSource, /ViewingPlannerPropertyImage/, 'planner should render a neutral placeholder when real listing media is missing')
assert.doesNotMatch(pageSource, /images\.unsplash\.com\/photo-1600/, 'planner should not use hard-coded stock listing images')
assert.doesNotMatch(pageSource, /return ordered\.slice\(0,\s*4\)/, 'planner should not cap suggested price-band matches to four properties')

assert.match(sendEmailIndexSource, /handleBuyerViewingAvailabilityRequestEmail/, 'send-email router should import the buyer viewing handler')
assert.match(sendEmailIndexSource, /buyer_viewing_availability_request/, 'send-email router should route the buyer viewing template')
assert.match(sendEmailIndexSource, /handleBuyerViewingAvailabilityConfirmationEmail/, 'send-email router should import the buyer viewing confirmation handler')
assert.match(sendEmailIndexSource, /buyer_viewing_availability_confirmation/, 'send-email router should route the buyer viewing confirmation template')
assert.match(sendEmailTypesSource, /SendBuyerViewingAvailabilityRequestPayload/, 'send-email types should define the buyer viewing payload')
assert.match(sendEmailTypesSource, /SendBuyerViewingAvailabilityConfirmationPayload/, 'send-email types should define the buyer viewing confirmation payload')
assert.match(sendEmailTypesSource, /ViewingAvailabilityRequestPropertyPayload/, 'send-email types should define property payloads')
assert.match(sendEmailTypesSource, /agentAvatarUrl\?: string/, 'send-email types should define the buyer viewing agent avatar URL')

assert.match(preferenceFunctionSource, /type: "buyer_viewing_times_submitted_agent"/, 'buyer preference submit should notify the agent')
assert.match(preferenceFunctionSource, /availabilityWindows,/, 'buyer preference submit should pass client availability to notifications')
assert.match(preferenceFunctionSource, /type: "buyer_viewing_availability_confirmation"/, 'buyer preference submit should confirm receipt to the buyer')
assert.match(confirmationHandlerSource, /Thank you! We have your preferred viewing times/, 'buyer confirmation should include warm thank-you copy')
assert.match(confirmationHandlerSource, /confirming the options with the seller and will confirm shortly/, 'buyer confirmation should explain seller confirmation is in progress')

for (const contract of [
  /prepareEmailDelivery/,
  /sendViaResendApi/,
  /markEmailDeliverySent/,
  /markEmailDeliveryFailed/,
  /communicationType: "buyer_viewing_availability_request"/,
  /recipientRole: "buyer"/,
  /replyTo: agentEmail/,
  /agentAvatarUrl/,
]) {
  assert.match(handlerSource, contract, `handler should include ${contract}`)
}

for (const contract of [
  /BridgeEmailLayoutBranding/,
  /Choose your preferred viewing times/,
  /Viewing request/,
  /actionLink/,
  /agentAvatarUrl/,
  /<img src="\$\{\s*escapeHtml\(avatarUrl\)\s*\}"/,
  /Property requested/,
  /imageUrl/,
  /Please reply with/,
  /Powered by ARCH9|Powered by Arch9/,
]) {
  assert.match(templateSource, contract, `template should include ${contract}`)
}

assert.match(templateTestSource, /buyer viewing availability request renders company branding and property list/, 'Deno template test should cover the branded viewing email')
assert.match(templateTestSource, /Kingstons Property/, 'template test should assert custom organisation branding')
assert.match(templateTestSource, /114 West Street/, 'template test should assert property details render')

console.log('buyer viewing email delivery contract tests passed')
