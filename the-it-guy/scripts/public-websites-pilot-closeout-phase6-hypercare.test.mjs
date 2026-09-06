import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HYPERCARE_CONFIRMATION,
  PRODUCTION_PROJECT_REF,
  assertProductionTarget,
  deriveHypercareStatus,
  parseHypercareArgs,
  validateAcceptance,
  validateObservation,
} from './public-websites-pilot-closeout-phase6-hypercare.mjs'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(appRoot, '..')
const read = (path) => readFileSync(path, 'utf8')
const migration = read(resolve(repositoryRoot, 'supabase/migrations/20260906133000_public_websites_pilot_closeout_phase6_hypercare.sql'))
const indexMigration = read(resolve(repositoryRoot, 'supabase/migrations/20260906134500_public_websites_pilot_closeout_phase6_hypercare_indexes.sql'))
const approvalGateMigration = read(resolve(repositoryRoot, 'supabase/migrations/20260906140000_public_websites_pilot_closeout_phase6_approval_gate.sql'))
const databaseTest = read(resolve(repositoryRoot, 'supabase/tests/public_websites_pilot_closeout_phase6_hypercare_test.sql'))
const operator = read(resolve(appRoot, 'scripts/public-websites-pilot-closeout-phase6-hypercare.mjs'))
const leadRoute = read(resolve(repositoryRoot, 'apps/websites/app/api/leads/route.ts'))
const layout = read(resolve(repositoryRoot, 'apps/websites/app/layout.tsx'))
const workflow = read(resolve(repositoryRoot, '.github/workflows/public-websites-pilot-closeout-phase6-hypercare.yml'))

for (const [pattern, message] of [
  [/create table public\.website_hypercare_windows/i, 'creates the 7-14 day window'],
  [/earliest_acceptance_at >= started_at \+ interval '7 days'/i, 'enforces seven full days'],
  [/target_acceptance_at <= started_at \+ interval '14 days'/i, 'caps the intended observation window at fourteen days'],
  [/domain_kind = 'custom' and domain\.status = 'active' and domain\.is_primary/i, 'requires an active primary custom domain'],
  [/Hypercare cannot run against a Vercel preview hostname/i, 'rejects preview-only observation'],
  [/website_hypercare_daily_observations/i, 'stores daily checks'],
  [/Daily hypercare observations are immutable/i, 'daily evidence is immutable'],
  [/runtime_error_count[\s\S]*tenant_leak_count[\s\S]*lost_lead_count[\s\S]*broken_listing_count[\s\S]*serious_regression_count/i, 'captures all zero-tolerance counters'],
  [/website_hypercare_incidents/i, 'records incidents and fixes'],
  [/Seven passing daily observations with no failed day are required/i, 'acceptance requires seven clean daily checks'],
  [/Resolve every hypercare incident before production acceptance/i, 'acceptance blocks on open incidents'],
  [/website_rollback_production_release/i, 'keeps the pilot pause path ready'],
  [/revoke all on function public\.website_accept_hypercare[\s\S]*public, anon, authenticated/i, 'blocks browser acceptance'],
]) assert.match(migration, pattern, message)

assert.match(databaseTest, /plan\(24\)/, 'database contract has a fixed plan')
assert.match(indexMigration, /release_id, organisation_id[\s\S]*website_site_id, organisation_id[\s\S]*hypercare_window_id, organisation_id/i, 'all composite hypercare foreign keys have covering indexes')
assert.match(approvalGateMigration, /client_approval_json[\s\S]*origin_dark_launch_id[\s\S]*launch\.status = 'active'/i, 'start is bound to immutable Phase 5 approval and the active dark launch')
assert.match(operator, /unreconciledLeads[\s\S]*lead_id[\s\S]*contact_id/i, 'operator reconciles submissions to CRM leads and contacts')
assert.match(operator, /dnsChangedByPhase6: false/i, 'Phase 6 records that it does not change DNS')
assert.doesNotMatch(operator, /vercel\s+(?:domains|promote)|dns\s+(?:add|rm)|website_prepare_production_domain/i, 'operator cannot link the domain or change DNS')
assert.match(leadRoute, /Intentionally excludes names, email addresses, phone numbers, messages, IPs and fingerprints/i, 'lead logs are privacy-safe')
assert.match(leadRoute, /lead\.accepted[\s\S]*receiptId[\s\S]*leadId/i, 'lead logs correlate accepted submissions with CRM records')
assert.match(layout, /@vercel\/speed-insights\/next[\s\S]*<SpeedInsights\s*\/>/, 'public runtime records Core Web Vitals')
assert.match(workflow, /options: \[status, start, observe, incident, resolve, accept\]/, 'workflow exposes the controlled hypercare lifecycle')
assert.doesNotMatch(workflow, /schedule:|vercel\s+(?:domains|promote)|dns\s+(?:add|rm)/i, 'workflow neither schedules pre-live monitoring nor touches domain state')

const observation = {
  contract: 'public-websites-pilot-closeout-phase6-observation-v1',
  routesPassed: true, mobilePassed: true, desktopPassed: true, listingSyncPassed: true,
  imageDeliveryPassed: true, allLeadsInCrm: true, runtimeErrorCount: 0, tenantLeakCount: 0,
  lostLeadCount: 0, brokenListingCount: 0, seriousRegressionCount: 0,
  routeChecks: [], mediaChecks: [], leadReconciliation: { submissions: 0, reconciled: 0 },
}
assert.equal(validateObservation(observation).allLeadsInCrm, true)
assert.throws(() => validateObservation({ ...observation, runtimeErrorCount: -1 }), /non-negative integer/i)
assert.equal(validateAcceptance({ contract: 'public-websites-pilot-closeout-phase6-acceptance-v1', productionAccepted: true, clientApproverName: 'Kingstons', clientApproverRole: 'Director', approvalReference: 'signed' }).productionAccepted, true)
assert.equal(deriveHypercareStatus({ release: null, domain: null, window: null, schemaInstalled: false }), 'BLOCKED_PRE_LIVE')
assert.equal(deriveHypercareStatus({ release: { status: 'active', activated_at: '2026-09-06' }, domain: { domain_kind: 'custom', status: 'active', is_primary: true }, window: null, schemaInstalled: true }), 'READY_TO_START')
assert.equal(parseHypercareArgs(['--observe']).action, 'observe')
assert.throws(() => parseHypercareArgs(['--start', '--accept']), /only one/i)
assert.doesNotThrow(() => assertProductionTarget({
  SUPABASE_PRODUCTION_PROJECT_REF: PRODUCTION_PROJECT_REF,
  SUPABASE_PRODUCTION_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
  SUPABASE_PRODUCTION_SERVICE_ROLE_KEY: 'not-a-real-key',
}))
assert.equal(HYPERCARE_CONFIRMATION, 'AUTHORIZE_KINGSTONS_HYPERCARE_RECORDING')

console.log('Public websites pilot closeout Phase 6 hypercare checks passed')
