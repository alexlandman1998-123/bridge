import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const pageSource = await fs.readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const appSource = await fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const publicPageSource = await fs.readFile(new URL('../src/pages/SellerViewingCoordinationPage.jsx', import.meta.url), 'utf8')
const repositorySource = await fs.readFile(new URL('../src/lib/agencyCrmRepository.js', import.meta.url), 'utf8')
const functionSource = await fs.readFile(new URL('../../supabase/functions/seller-viewing-coordination/index.ts', import.meta.url), 'utf8')
const functionConfig = await fs.readFile(new URL('../../supabase/config.toml', import.meta.url), 'utf8')
const migrationSource = await fs.readFile(new URL('../../supabase/migrations/202608040003_seller_viewing_coordination_links.sql', import.meta.url), 'utf8')
const emailTemplateSource = await fs.readFile(new URL('../../supabase/functions/send-email/content/sellerViewingAvailabilityRequest.ts', import.meta.url), 'utf8')
const sendEmailIndexSource = await fs.readFile(new URL('../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8')
const sendEmailTypesSource = await fs.readFile(new URL('../../supabase/functions/send-email/types.ts', import.meta.url), 'utf8')
const leadOperationsHandlerSource = await fs.readFile(new URL('../../supabase/functions/send-email/handlers/leadOperationsNotification.ts', import.meta.url), 'utf8')
const buyerConfirmationHandlerSource = await fs.readFile(new URL('../../supabase/functions/send-email/handlers/buyerViewingAvailabilityConfirmation.ts', import.meta.url), 'utf8')

assert.match(appSource, /SellerViewingCoordinationPage/, 'app should lazy-load the seller viewing coordination page')
assert.match(appSource, /\/seller-viewing\/:token/, 'app should expose the seller viewing public route')

for (const contract of [
  /seller_viewing_coordination_links/,
  /token_hash text not null unique/,
  /buyer_availability_windows/,
  /coordination_notes/,
  /response jsonb not null default '\{\}'::jsonb/,
  /bridge_is_active_member\(organisation_id\)/,
]) {
  assert.match(migrationSource, contract, `migration should include ${contract}`)
}

for (const contract of [
  /action === "create"/,
  /getAuthenticatedUser/,
  /const UUID_PATTERN = \//,
  /raw\.match\(UUID_PATTERN\)\?\.\[0\]/,
  /seller_viewing_coordination_links/,
  /sellerCoordinationLink/,
  /\/seller-viewing\//,
  /canHostViewing/,
  /accessNotes/,
  /Seller Viewing Response Captured/,
  /invokeSendEmailFunction/,
  /seller_viewing_response_submitted_agent/,
  /buyer_viewing_availability_confirmation/,
  /sellerConfirmedAccess/,
  /response_note_required/,
]) {
  assert.match(functionSource, contract, `seller coordination function should include ${contract}`)
}

for (const contract of [
  /\[functions\.seller-viewing-coordination\]/,
  /verify_jwt = false/,
  /entrypoint = "\.\/functions\/seller-viewing-coordination\/index\.ts"/,
]) {
  assert.match(functionConfig, contract, `Supabase config should include ${contract}`)
}

for (const contract of [
  /Confirm Seller Access/,
  /buyerAvailabilityWindows/,
  /Access instructions/,
  /canHostViewing/,
  /seller-viewing-coordination/,
  /Send availability/,
  /hasConfirmedAccess/,
  /Add a note so the agent knows why access cannot be confirmed yet/,
]) {
  assert.match(publicPageSource, contract, `public seller page should include ${contract}`)
}

for (const contract of [
  /mapSellerViewingCoordinationLink/,
  /listSellerViewingCoordinationLinks/,
  /seller_viewing_coordination_links/,
  /buyer_availability_windows/,
  /submitted_at/,
]) {
  assert.match(repositorySource, contract, `repository should include ${contract}`)
}

for (const contract of [
  /listSellerViewingCoordinationLinks/,
  /reloadSellerViewingCoordinationLinks/,
  /handleApplySellerViewingCoordinationResponse/,
  /seller-viewing-coordination/,
  /Seller Viewing Response Pulled Into Workspace/,
  /function normalizeLeadUuid\(value\)[\s\S]*raw\.match\(UUID_PATTERN\)\?\.\[0\]/,
  /function normalizeLeadUuidFromLead\(lead = \{\}\)[\s\S]*lead\?\.lead_id[\s\S]*lead\?\.id/,
  /const selectedLeadUuid = normalizeLeadUuidFromLead\(selectedLead\)[\s\S]*leadId: selectedLeadUuid/,
  /Apply seller response/,
  /Check seller RSVP|Check legacy seller responses/,
  /Book viewing appointments/,
]) {
  assert.match(pageSource, contract, `planner should include ${contract}`)
}

assert.match(emailTemplateSource, /Confirm access/, 'seller email should render the public access CTA')
assert.match(emailTemplateSource, /actionLink/, 'seller email should accept an action link')
assert.match(sendEmailIndexSource, /seller_viewing_response_submitted_agent/, 'send-email router should route seller response agent notifications')
assert.match(sendEmailTypesSource, /seller_viewing_response_submitted_agent/, 'send-email types should include seller response agent notification')
assert.match(leadOperationsHandlerSource, /Seller Viewing Response Submitted/, 'lead operations handler should label seller response notifications')
assert.match(buyerConfirmationHandlerSource, /followUpMessage/, 'buyer confirmation handler should support final viewing response copy')
assert.match(buyerConfirmationHandlerSource, /payload\.message/, 'buyer confirmation handler should support custom buyer-facing message copy')

console.log('seller viewing coordination phase 4 contract tests passed')
