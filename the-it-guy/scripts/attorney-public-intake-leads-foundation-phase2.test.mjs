import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  ATTORNEY_LEAD_SERVICE_TYPE_VALUES,
  ATTORNEY_LEAD_SOURCE_CHANNEL_VALUES,
  ATTORNEY_LEAD_STAGE_VALUES,
} from '../src/core/leads/attorneyLeadContract.js'

const migrationUrl = new URL(
  '../../supabase/migrations/202607160001_attorney_public_intake_leads_foundation_phase2.sql',
  import.meta.url,
)
const migration = await readFile(migrationUrl, 'utf8')
const migrationPath = fileURLToPath(migrationUrl)

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('migration is transactional and contains no destructive table operations', () => {
  assert.match(migration, /^begin;/)
  assert.match(migration, /commit;\s*$/)
  assert.doesNotMatch(migration, /drop\s+table/i)
  assert.doesNotMatch(migration, /truncate\s+/i)
  assert.doesNotMatch(migration, /delete\s+from\s+public\.leads/i)
})

test('shared Leads receive additive cross-vertical fields and Attorney-only lifecycle checks', () => {
  for (const column of [
    'lead_domain',
    'source_channel',
    'campaign_code',
    'last_contacted_at',
    'next_follow_up_at',
    'closed_at',
    'lost_reason',
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}\\b`))
  }
  assert.match(migration, /lead_domain text not null default 'agency'/)
  assert.match(migration, /lead_domain <> 'attorney'/)
  for (const stage of ATTORNEY_LEAD_STAGE_VALUES) {
    assert.match(migration, new RegExp(`'${stage}'`))
  }
})

test('foundation creates the three planned tenant-scoped tables', () => {
  for (const table of ['public_intake_links', 'attorney_lead_details', 'public_intake_submissions']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`))
  }
})

test('service and source constraints stay aligned with the Phase 1 contract', () => {
  for (const serviceType of ATTORNEY_LEAD_SERVICE_TYPE_VALUES) {
    assert.match(migration, new RegExp(`'${serviceType}'`))
  }
  for (const sourceChannel of ATTORNEY_LEAD_SOURCE_CHANNEL_VALUES) {
    assert.match(migration, new RegExp(`'${sourceChannel}'`))
  }
})

test('public links use durable slugs and one active organisation-level link', () => {
  assert.match(migration, /public_intake_links_slug_unique_idx[\s\S]*lower\(slug\)/)
  assert.match(migration, /public_intake_links_active_org_unique_idx[\s\S]*\(organisation_id\)[\s\S]*where status = 'active'/)
  assert.match(migration, /slug ~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'/)
  assert.match(migration, /public_intake_links_firm_org_fkey/)
})

test('tenant-consistent foreign keys protect Attorney detail and submission ownership', () => {
  assert.match(migration, /attorney_lead_details_lead_org_fkey[\s\S]*foreign key \(lead_id, organisation_id\)/)
  assert.match(migration, /attorney_lead_details_intake_link_org_fkey[\s\S]*foreign key \(intake_link_id, organisation_id\)/)
  assert.match(migration, /public_intake_submissions_link_org_fkey[\s\S]*foreign key \(intake_link_id, organisation_id\)/)
  assert.match(migration, /public_intake_submissions_lead_org_fkey[\s\S]*foreign key \(lead_id, organisation_id\)/)
})

test('idempotency, contact matching, follow-up, and throttling indexes exist', () => {
  assert.match(migration, /public_intake_submissions_link_idempotency_unique_idx/)
  assert.match(migration, /contacts_org_normalized_email_idx/)
  assert.match(migration, /contacts_org_normalized_phone_idx/)
  assert.match(migration, /leads_attorney_follow_up_idx/)
  assert.match(migration, /public_intake_submissions_link_ip_created_idx/)
})

test('public submission data is bounded and consent is mandatory', () => {
  assert.match(migration, /public_intake_submissions_privacy_consent_check/)
  assert.match(migration, /privacy_consent = true/)
  assert.match(migration, /octet_length\(utm_json::text\) <= 8192/)
  assert.match(migration, /octet_length\(request_metadata_json::text\) <= 16384/)
  assert.match(migration, /char_length\(idempotency_key\) between 16 and 128/)
})

test('Phase 2 installs no access policies, public commands, or grants', () => {
  assert.doesNotMatch(migration, /create\s+policy/i)
  assert.doesNotMatch(migration, /security\s+definer/i)
  assert.doesNotMatch(migration, /grant\s+/i)
  assert.doesNotMatch(migration, /transaction_attorney_assignments/i)
  assert.doesNotMatch(migration, /attorney_incoming/i)
})

console.log(`attorney public intake Leads Phase 2 foundation test passed: ${migrationPath}`)

