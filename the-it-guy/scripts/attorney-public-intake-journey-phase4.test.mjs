import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  ATTORNEY_PUBLIC_INTAKE_FUNCTION,
  ATTORNEY_PUBLIC_INTAKE_PRIVACY_VERSION,
  attorneyIntakeIdempotencyStorageKey,
  createAttorneyIntakeIdempotencyKey,
  getOrCreateAttorneyIntakeIdempotencyKey,
  normalizeAttorneyPublicIntake,
  readAttorneyIntakeAttribution,
} from '../src/services/attorneyPublicIntakeService.js'

const root = new URL('../', import.meta.url)
const app = await readFile(new URL('src/App.jsx', root), 'utf8')
const page = await readFile(new URL('src/pages/AttorneyPublicIntakePage.jsx', root), 'utf8')
const service = await readFile(new URL('src/services/attorneyPublicIntakeService.js', root), 'utf8')
const edge = await readFile(new URL('../../supabase/functions/attorney-public-intake/index.ts', import.meta.url), 'utf8')
const edgeConfig = await readFile(new URL('../../supabase/functions/attorney-public-intake/deno.json', import.meta.url), 'utf8')
const supabaseConfig = await readFile(new URL('../../supabase/config.toml', import.meta.url), 'utf8')
const securityMigration = await readFile(
  new URL('../../supabase/migrations/202607160002_attorney_public_intake_leads_security_phase3.sql', import.meta.url),
  'utf8',
)

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('public Journey route is unauthenticated and isolated from Incoming Matters', () => {
  assert.match(app, /const AttorneyPublicIntakePage = lazy/)
  assert.match(app, /path="\/journey\/:slug"/)
  const route = app.match(/<Route path="\/journey\/:slug"[^\n]+/)?.[0] ?? ''
  assert.match(route, /AttorneyPublicIntakePage/)
  assert.doesNotMatch(route, /TokenRouteGate|Protected|AuthGate/)
  assert.doesNotMatch(page, /Incoming Matters|incomingMatter|transaction_attorney_assignments/)
})

test('all six contracted Attorney services are represented by personal intake routes', () => {
  for (const key of [
    'transferQuote',
    'propertyTransfer',
    'bondRegistration',
    'bondCancellation',
    'propertyLegalAdvice',
    'generalEnquiry',
  ]) {
    assert.match(page, new RegExp(`ATTORNEY_LEAD_SERVICE_TYPES\\.${key}`))
  }
  assert.match(page, /const JOURNEYS = Object\.freeze/)
  assert.match(page, /Buying a home/)
  assert.match(page, /Selling a property/)
  assert.match(page, /Registering a bond/)
  assert.match(page, /Cancelling a bond/)
  assert.match(page, /availableJourneys\.map/)
  assert.match(page, /chooseJourney\(key\)/)
})

test('premium landing groups every property route behind one property gateway', () => {
  assert.doesNotMatch(page, /Private client desk/)
  assert.match(page, /h-20 w-20/)
  assert.match(page, /Property & conveyancing/)
  assert.match(page, /openPropertyServices/)
  assert.match(page, /setStep\('property'\)/)
  assert.match(page, /step === 'property'/)
  assert.match(page, /transfer_calculator/)
  assert.match(page, /Transfer cost calculator/)
  assert.match(page, /Request a transfer quote/)
  assert.match(page, /Property legal advice/)
})

test('public form is progressive, accessible, conditional, and consent-gated', () => {
  for (const field of [
    'first_name',
    'last_name',
    'email',
    'phone',
    'property_address',
    'message',
    'privacy_consent',
  ]) {
    assert.match(page, new RegExp(`name="${field}"`))
  }
  assert.match(page, /step === 'matter'/)
  assert.match(page, /setStep\('contact'\)/)
  assert.match(page, /calculateTransferDuty/)
  assert.match(page, /request_transfer_quote/)
  assert.match(page, /name="property_value"/)
  assert.match(page, /party_role:/)
  assert.match(page, /role="alert"/)
  assert.match(page, /aria-live="polite"/)
  assert.match(page, /autoComplete="given-name"/)
  assert.match(page, /Please provide at least one contact method/)
})

test('non-property practices go directly to contact and retain the selected practice', () => {
  for (const label of ['Litigation', 'Family law', 'Contract law', 'Trusts & estates', 'Notarial']) {
    assert.match(page, new RegExp(label.replace(/[&]/g, '\\&')))
  }
  assert.match(page, /function choosePractice/)
  assert.match(page, /setStep\('contact'\)/)
  assert.match(page, /Enquiry route:/)
  assert.match(page, /OTHER_PRACTICES\[practiceKey\]/)
})

test('attribution values are sanitized against the Phase 1 contract', () => {
  const valid = readAttorneyIntakeAttribution('?source=instagram&campaign=Transfer Quote&utm_medium=social')
  assert.equal(valid.source_channel, 'instagram')
  assert.equal(valid.campaign_code, 'transfer-quote')
  assert.deepEqual(valid.utm, { utm_medium: 'social' })

  const manipulated = readAttorneyIntakeAttribution('?source=admin%3Bdrop&campaign=%20%2F%2FBad%20Campaign!!!')
  assert.equal(manipulated.source_channel, 'other')
  assert.equal(manipulated.campaign_code, 'bad-campaign')
})

test('public branding is normalized with safe colour and service fallbacks', () => {
  const intake = normalizeAttorneyPublicIntake({
    slug: 'young-law',
    firm_name: 'Young Law',
    primary_colour: 'url(javascript:alert(1))',
    secondary_colour: '#aabbcc',
    service_types: ['transfer_quote', 'not_a_service'],
  })
  assert.equal(intake.primaryColour, '#173f45')
  assert.equal(intake.secondaryColour, '#aabbcc')
  assert.deepEqual(intake.serviceTypes, ['transfer_quote'])
})

test('configured contacts remain authoritative with a Young Law public fallback', () => {
  const fallback = normalizeAttorneyPublicIntake({ slug: 'young-law-inc', firm_name: 'Young Law Inc' })
  assert.equal(fallback.contactEmail, 'info@younglaw.co.za')
  assert.equal(fallback.contactPhone, '010 446 7675')

  const configured = normalizeAttorneyPublicIntake({
    slug: 'young-law-inc',
    contact_email: 'journey@younglaw.co.za',
    contact_phone: '+27 10 000 0000',
  })
  assert.equal(configured.contactEmail, 'journey@younglaw.co.za')
  assert.equal(configured.contactPhone, '+27 10 000 0000')
})

test('idempotency keys survive repeated clicks and refreshes in one session', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }
  const first = getOrCreateAttorneyIntakeIdempotencyKey('young-law', 'transfer_quote', storage)
  const second = getOrCreateAttorneyIntakeIdempotencyKey('young-law', 'transfer_quote', storage)
  assert.equal(first, second)
  assert.match(first, /^[A-Za-z0-9._:-]{16,128}$/)
  assert.equal(values.get(attorneyIntakeIdempotencyStorageKey('young-law', 'transfer_quote')), first)
  assert.match(createAttorneyIntakeIdempotencyKey(), /^attorney-intake:/)
})

test('browser uses only the public Edge Function contract', () => {
  assert.equal(ATTORNEY_PUBLIC_INTAKE_FUNCTION, 'attorney-public-intake')
  assert.equal(ATTORNEY_PUBLIC_INTAKE_PRIVACY_VERSION, 'arch9-attorney-intake-v1')
  assert.match(service, /invokeEdgeFunction\(ATTORNEY_PUBLIC_INTAKE_FUNCTION/)
  assert.doesNotMatch(service, /\.from\(['"](?:leads|contacts|public_intake_submissions)/)
  assert.doesNotMatch(service, /submit_attorney_public_intake/)
})

test('Edge Function is explicitly public but uses a service client internally', () => {
  assert.doesNotThrow(() => JSON.parse(edgeConfig))
  assert.match(supabaseConfig, /\[functions\.attorney-public-intake\][\s\S]*verify_jwt = false/)
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(edge, /createClient\(supabaseUrl, serviceRoleKey/)
  assert.match(edge, /action === "resolve"/)
  assert.match(edge, /action !== "submit"/)
  assert.match(edge, /resolve_attorney_public_intake/)
  assert.match(edge, /submit_attorney_public_intake/)
})

test('Edge Function bounds requests, hashes IPs, throttles, and traps bots', () => {
  assert.match(edge, /MAX_REQUEST_BYTES = 72 \* 1024/)
  assert.match(edge, /crypto\.subtle\.digest\("SHA-256"/)
  assert.match(edge, /ATTORNEY_INTAKE_IP_HASH_SECRET/)
  assert.doesNotMatch(edge, /p_ip_hash:\s*clientIp\(/)
  assert.match(edge, /SHORT_WINDOW_LIMIT = 5/)
  assert.match(edge, /LONG_WINDOW_LIMIT = 15/)
  assert.match(edge, /status: 429|jsonResponse\(429/)
  assert.match(edge, /payload\.company_website/)
  assert.match(edge, /message\.includes\("rate limit"\)/)
})

test('database command is the authoritative race-safe rate-limit boundary', () => {
  assert.match(securityMigration, /attorney-intake-rate:/)
  assert.match(securityMigration, /pg_advisory_xact_lock/)
  assert.match(securityMigration, /interval '10 minutes'/)
  assert.match(securityMigration, /interval '1 hour'/)
  assert.match(securityMigration, /v_short_window_count >= 5/)
  assert.match(securityMigration, /v_long_window_count >= 15/)
  assert.match(securityMigration, /Attorney public intake rate limit exceeded/)
})

test('Edge Function never returns internal tenant or Lead identifiers', () => {
  const finalResponseStart = edge.lastIndexOf('return jsonResponse(200, {')
  const finalResponse = finalResponseStart >= 0 ? edge.slice(finalResponseStart) : ''
  assert.match(finalResponse, /accepted:/)
  assert.match(finalResponse, /duplicate:/)
  assert.match(finalResponse, /code:/)
  assert.doesNotMatch(finalResponse, /organisation_id|attorney_firm_id|lead_id|contact_id|intake_link_id/)
})

console.log('attorney public intake Journey Phase 4 tests passed')
