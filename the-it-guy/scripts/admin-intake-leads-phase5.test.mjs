import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const [form, client, landing, api, route, phase1] = await Promise.all([
  read('src/components/bridge/NewBusinessIntakeForm.jsx'),
  read('src/services/publicNewBusinessIntakeService.js'),
  read('src/pages/BridgeLanding.jsx'),
  read('server/services/publicDemoEnquiriesApi.js'),
  read('api/public/demo-enquiries.js'),
  readFile(new URL('../../supabase/migrations/202607160003_admin_intake_lead_contract_phase1.sql', import.meta.url), 'utf8'),
])

assert.match(landing, /<NewBusinessIntakeForm \/>/, 'The public contact page must render the real intake form')
assert.doesNotMatch(landing, /Hook it into your booking system when ready/, 'The placeholder form copy must be removed')
assert.match(route, /createPublicDemoEnquiriesResponse/, 'The public API route must use the hardened intake handler')

for (const field of [
  'role', 'firstName', 'lastName', 'email', 'phone', 'company', 'businessSize',
  'monthlyVolume', 'servicesInterested', 'biggestFrustration',
  'preferredContactMethod', 'preferredWindow', 'popiaConsentGiven', 'marketingConsent',
]) {
  assert.match(form, new RegExp(`form\.${field}`), `Missing public form field: ${field}`)
}
assert.match(form, /type="checkbox"[\s\S]*popiaConsentGiven/, 'POPIA consent must be an explicit checkbox')
assert.match(form, /disabled=\{submitting \|\| !form\.popiaConsentGiven\}/, 'Submission must remain blocked without POPIA consent')
assert.match(form, /name="website"|Website<input/, 'The form must retain a bot honeypot')
assert.match(form, /role="alert"/, 'Submission failures must be announced accessibly')
assert.match(form, /Your enquiry is with our team/, 'The form needs an unambiguous success state')

assert.match(client, /crypto\?\.randomUUID/, 'Retries need a strong browser-generated idempotency key')
assert.match(client, /intakeKind: 'new_business_partner'/, 'The payload must identify new-business intake')
assert.match(client, /formKey: NEW_BUSINESS_FORM_KEY/, 'The payload must identify the form contract')
assert.match(client, /privacyPolicyVersion: NEW_BUSINESS_PRIVACY_VERSION/, 'The payload must retain the privacy notice version')
assert.match(client, /submissionKey/, 'The payload must send the retry key')
assert.match(client, /utm_source/, 'The payload must retain acquisition attribution')
assert.match(client, /fetch\('\/api\/public\/demo-enquiries'/, 'The browser must use the server endpoint')
assert.doesNotMatch(client, /supabase\.from|\.from\('demo_enquiries'\)/, 'The public browser must never write directly to the table')

assert.match(api, /buildRequestFingerprint/, 'The server must create a one-way abuse fingerprint')
assert.match(api, /createHash\('sha256'\)/, 'Raw request addresses must be hashed')
assert.match(api, /PUBLIC_INTAKE_RATE_LIMIT/, 'The endpoint must enforce a bounded submission rate')
assert.match(api, /findExistingSubmission/, 'The endpoint must make retries idempotent')
assert.match(api, /insertResult\.error\.code === '23505'/, 'Concurrent retries must resolve safely')
assert.match(api, /hasMatchingLead/, 'The endpoint must signal likely duplicate contacts')
assert.match(api, /row\.dedupe_status = 'possible_duplicate'/, 'Likely matches must enter the duplicate-review queue')
assert.match(api, /payload\.popiaConsentGiven !== true/, 'The server must independently enforce POPIA consent')
assert.match(api, /admin\.arch9\.co\.za\/platform\/leads/, 'Notifications must deep-link to the admin Leads workspace')

for (const column of ['submission_key', 'request_fingerprint', 'popia_consent_given', 'privacy_policy_version', 'marketing_consent']) {
  assert.match(phase1, new RegExp(`add column if not exists ${column}`), `Phase 1 must persist ${column}`)
}

console.log('Admin intake Leads Phase 5 passed')

