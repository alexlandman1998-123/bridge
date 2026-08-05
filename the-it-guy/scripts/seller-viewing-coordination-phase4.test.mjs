import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const pageSource = await fs.readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const appSource = await fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const publicPageSource = await fs.readFile(new URL('../src/pages/SellerViewingCoordinationPage.jsx', import.meta.url), 'utf8')
const repositorySource = await fs.readFile(new URL('../src/lib/agencyCrmRepository.js', import.meta.url), 'utf8')
const functionSource = await fs.readFile(new URL('../../supabase/functions/seller-viewing-coordination/index.ts', import.meta.url), 'utf8')
const migrationSource = await fs.readFile(new URL('../../supabase/migrations/202608040003_seller_viewing_coordination_links.sql', import.meta.url), 'utf8')
const emailTemplateSource = await fs.readFile(new URL('../../supabase/functions/send-email/content/sellerViewingAvailabilityRequest.ts', import.meta.url), 'utf8')

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
  /seller_viewing_coordination_links/,
  /sellerCoordinationLink/,
  /\/seller-viewing\//,
  /canHostViewing/,
  /accessNotes/,
  /Seller Viewing Response Captured/,
]) {
  assert.match(functionSource, contract, `seller coordination function should include ${contract}`)
}

for (const contract of [
  /Confirm Seller Access/,
  /buyerAvailabilityWindows/,
  /Access instructions/,
  /canHostViewing/,
  /seller-viewing-coordination/,
  /Send availability/,
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
  /Apply seller response/,
  /Check seller responses/,
  /Book viewing appointments/,
]) {
  assert.match(pageSource, contract, `planner should include ${contract}`)
}

assert.match(emailTemplateSource, /Confirm access/, 'seller email should render the public access CTA')
assert.match(emailTemplateSource, /actionLink/, 'seller email should accept an action link')

console.log('seller viewing coordination phase 4 contract tests passed')
