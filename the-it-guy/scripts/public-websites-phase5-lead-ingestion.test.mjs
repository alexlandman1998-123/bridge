import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')
const read = (path) => readFileSync(path, 'utf8')

const migration = read(resolve(repositoryRoot, 'supabase/migrations/20260905182234_public_websites_phase5_lead_ingestion.sql'))
const databaseTest = read(resolve(repositoryRoot, 'supabase/tests/public_websites_phase5_lead_ingestion_rls_test.sql'))
const route = read(resolve(repositoryRoot, 'apps/websites/app/api/leads/route.ts'))
const form = read(resolve(repositoryRoot, 'apps/websites/components/lead-form.tsx'))
const emailHandler = read(resolve(repositoryRoot, 'supabase/functions/send-email/handlers/leadOperationsNotification.ts'))
const environment = read(resolve(repositoryRoot, 'apps/websites/.env.example'))

for (const [pattern, message] of [
  [/create or replace function public\.website_capture_lead_submission/i, 'creates the atomic website lead command'],
  [/security definer\s+set search_path = ''/i, 'uses an empty search path for the privileged command'],
  [/website_listing_publications[\s\S]*channel\.status = 'published'/i, 'requires the agency website listing channel'],
  [/publication\.status = 'Published'/i, 'requires canonical listing publication'],
  [/pg_advisory_xact_lock/i, 'serializes idempotency and contact identity'],
  [/recent\.created_at >= v_now - interval '10 minutes'/i, 'rate limits repeated fingerprints'],
  [/insert into public\.contacts[\s\S]*insert into public\.leads[\s\S]*update public\.website_lead_submissions/i, 'creates contact, lead and routed receipt in one transaction'],
  [/new_enquiry_assigned_agent/i, 'routes assigned-listing enquiries to the active agent'],
  [/new_enquiry_unassigned_manager/i, 'routes unassigned enquiries to a manager'],
  [/website_prepare_lead_notification_fallback/i, 'creates a manager fallback after agent delivery failure'],
  [/revoke all on function public\.website_capture_lead_submission[\s\S]*from public, anon, authenticated/i, 'keeps the ingestion command service-only'],
]) assert.match(migration, pattern, message)

assert.match(databaseTest, /not has_table_privilege\('anon'.*'select'/, 'database test protects lead PII')
assert.match(databaseTest, /has_function_privilege\('service_role'/, 'database test permits the website server')
assert.match(databaseTest, /not has_function_privilege\('authenticated'/, 'database test denies browser clients')

assert.match(route, /website_capture_lead_submission/, 'route performs one atomic CRM capture call')
assert.doesNotMatch(route, /\.from\(['"](?:contacts|leads|website_lead_submissions)['"]\)/, 'route cannot create partial CRM records')
assert.match(route, /createHmac\('sha256'/, 'route hashes visitor addresses instead of storing IPs')
assert.match(route, /MAX_BODY_BYTES/, 'route rejects oversized request bodies')
assert.match(route, /companyWebsite/, 'route applies the bot honeypot')
assert.match(route, /website_prepare_lead_notification_fallback/, 'route attempts the durable manager fallback')
assert.doesNotMatch(route, /NextResponse\.json\(\{\s*accepted:\s*true,\s*leadId/, 'public response does not expose an internal CRM lead identifier')

assert.match(form, /useRef<string \| null>/, 'form keeps one idempotency key across retries')
assert.match(form, /pageId,/, 'form sends its published page identity')
assert.match(form, /marketingConsent/, 'form captures separate optional marketing consent')
assert.match(form, /Email \(email or mobile required\)/, 'form allows a minimal reachable contact method')
assert.match(emailHandler, /idempotencyKey:[\s\S]*payload\.idempotencyKey/, 'email provider calls are idempotent')
assert.match(environment, /WEBSITES_LEAD_FINGERPRINT_SECRET/, 'production environment documents the abuse-control secret')

console.log('Public websites phase 5 lead ingestion checks passed')
