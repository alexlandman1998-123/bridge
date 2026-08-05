import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const appSource = await fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const pageSource = await fs.readFile(new URL('../src/pages/BuyerViewingPreferencesPage.jsx', import.meta.url), 'utf8')
const plannerSource = await fs.readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const repositorySource = await fs.readFile(new URL('../src/lib/agencyCrmRepository.js', import.meta.url), 'utf8')
const functionSource = await fs.readFile(new URL('../../supabase/functions/buyer-viewing-preferences/index.ts', import.meta.url), 'utf8')
const functionConfig = await fs.readFile(new URL('../../supabase/config.toml', import.meta.url), 'utf8')
const migrationSource = await fs.readFile(new URL('../../supabase/migrations/202608040002_buyer_viewing_preference_links.sql', import.meta.url), 'utf8')
const emailTemplateSource = await fs.readFile(new URL('../../supabase/functions/send-email/content/viewingAvailabilityRequest.ts', import.meta.url), 'utf8')
const emailTypesSource = await fs.readFile(new URL('../../supabase/functions/send-email/types.ts', import.meta.url), 'utf8')

assert.match(appSource, /BuyerViewingPreferencesPage/, 'App should lazy-load the buyer viewing preference page')
assert.match(appSource, /\/viewing-preferences\/:token/, 'App should expose the public viewing preferences route')

for (const contract of [
  /invokeEdgeFunction\('buyer-viewing-preferences'/,
  /action: 'create'/,
  /preferenceLink/,
  /actionLink: preferenceLink/,
  /buyerViewingPreferenceLinkId/,
  /listBuyerViewingPreferenceLinks/,
  /reloadBuyerViewingPreferenceLinks/,
  /handleApplyBuyerViewingPreferenceResponse/,
  /Check responses/,
  /Apply response/,
  /Buyer Viewing Response Pulled Into Workspace/,
]) {
  assert.match(plannerSource, contract, `planner should include ${contract}`)
}

for (const contract of [
  /export async function listBuyerViewingPreferenceLinks/,
  /buyer_viewing_preference_links/,
  /mapBuyerViewingPreferenceLink/,
  /selected_property_ids/,
  /submitted_at/,
]) {
  assert.match(repositorySource, contract, `CRM repository should include ${contract}`)
}

for (const contract of [
  /Confirm Viewings/,
  /Send viewing preferences/,
  /propertyResponses/,
  /availabilityWindows/,
  /action: 'resolve'/,
  /action: 'submit'/,
  /buyer-viewing-preferences/,
]) {
  assert.match(pageSource, contract, `public page should include ${contract}`)
}

for (const contract of [
  /action === "create"/,
  /action === "resolve"/,
  /action !== "submit"/,
  /buyer_viewing_preference_links/,
  /token_hash/,
  /sha256UrlSafe/,
  /organisation_users/,
  /Buyer Viewing Response Captured/,
  /replaceNoteBlock/,
]) {
  assert.match(functionSource, contract, `edge function should include ${contract}`)
}

for (const contract of [
  /\[functions\.buyer-viewing-preferences\]/,
  /verify_jwt = false/,
  /entrypoint = "\.\/functions\/buyer-viewing-preferences\/index\.ts"/,
]) {
  assert.match(functionConfig, contract, `Supabase config should include ${contract}`)
}

for (const contract of [
  /create table if not exists public\.buyer_viewing_preference_links/,
  /token_hash text not null unique/,
  /selected_property_ids text\[\]/,
  /properties jsonb not null/,
  /response jsonb not null/,
  /organisation_name text/,
  /enable row level security/,
  /bridge_is_active_member/,
]) {
  assert.match(migrationSource, contract, `migration should include ${contract}`)
}

assert.match(emailTemplateSource, /Confirm viewings/, 'buyer email should render a Confirm viewings CTA')
assert.match(emailTemplateSource, /actionLink/, 'buyer email should accept an action link')
assert.match(emailTypesSource, /preferenceLink\?: string/, 'email payload types should include preferenceLink')

console.log('buyer viewing preference link contract tests passed')
