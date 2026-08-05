import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_COMMERCIAL_TERMS_PERSISTENCE_CONTRACT,
  OTP_COMMERCIAL_TERMS_PERSISTENCE_PHASE24_VERSION,
  OTP_COMMERCIAL_TERMS_PERSISTENCE_READY_STATUS,
  OTP_COMMERCIAL_TERMS_PERSISTENCE_RPCS,
  OTP_COMMERCIAL_TERMS_PERSISTENCE_SERVICE_OPERATIONS,
  OTP_COMMERCIAL_TERMS_PERSISTENCE_TABLES,
  buildOtpCommercialTermsPersistencePhase24Audit,
  formatOtpCommercialTermsPersistencePhase24Markdown,
} from '../src/core/documents/otpCommercialTermsPersistencePhase24.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const migrationSql = await readFile(new URL('../../supabase/migrations/202608050010_otp_commercial_terms_persistence.sql', import.meta.url), 'utf8')
const serviceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsPersistenceService.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-commercial-terms-persistence-phase24'],
  'node scripts/otp-commercial-terms-persistence-phase24.test.mjs',
  'package.json should expose the OTP commercial terms persistence Phase 24 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-commercial-terms-persistence-phase24'],
  'node scripts/report-otp-commercial-terms-persistence-phase24.mjs',
  'package.json should expose the OTP commercial terms persistence Phase 24 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-commercial-terms-persistence-phase24'),
  'OTP vNext verification should include Phase 24 persistence.',
)

assert.equal(OTP_COMMERCIAL_TERMS_PERSISTENCE_PHASE24_VERSION, 'otp_commercial_terms_persistence_phase24_v1')
assert.equal(OTP_COMMERCIAL_TERMS_PERSISTENCE_READY_STATUS, 'OTP_COMMERCIAL_TERMS_PERSISTENCE_READY_FOR_PHASE25_REVIEW_UI')
assert.equal(OTP_COMMERCIAL_TERMS_PERSISTENCE_CONTRACT, 'otp-vnext-commercial-terms-persistence-phase24-v1')

assert.deepEqual(
  OTP_COMMERCIAL_TERMS_PERSISTENCE_TABLES,
  [
    'otp_commission_variations',
    'otp_cost_obligation_items',
    'matter_attorney_cost_quote_states',
    'otp_commercial_term_events',
  ],
)
assert.deepEqual(
  OTP_COMMERCIAL_TERMS_PERSISTENCE_RPCS,
  [
    'bridge_record_otp_commission_variation',
    'bridge_upsert_otp_cost_obligation_item',
    'bridge_upsert_matter_attorney_cost_quote_state',
  ],
)
assert.deepEqual(
  OTP_COMMERCIAL_TERMS_PERSISTENCE_SERVICE_OPERATIONS,
  [
    'recordOtpCommissionVariation',
    'upsertOtpCostObligationItem',
    'upsertMatterAttorneyCostQuoteState',
    'listOtpCommercialTermsPersistenceReadiness',
  ],
)

for (const token of [
  'create table if not exists public.otp_commission_variations',
  'create table if not exists public.otp_cost_obligation_items',
  'create table if not exists public.matter_attorney_cost_quote_states',
  'create table if not exists public.otp_commercial_term_events',
  'create or replace function public.bridge_record_otp_commission_variation',
  'create or replace function public.bridge_upsert_otp_cost_obligation_item',
  'create or replace function public.bridge_upsert_matter_attorney_cost_quote_state',
  'create or replace view public.otp_commercial_terms_persistence_readiness_v1',
]) {
  assert.ok(migrationSql.includes(token), `migration should include ${token}`)
}

assert.ok(migrationSql.includes('preserves_mandate_commission boolean not null default true'))
assert.ok(migrationSql.includes('otp_commission_variations_preserve_mandate_check'))
assert.equal(migrationSql.includes('update public.transaction_commissions'), false)
assert.equal(migrationSql.includes('attorney_lead_quotes'), false)
assert.ok(migrationSql.includes('transaction_attorney_assignment_id uuid not null references public.transaction_attorney_assignments'))
assert.ok(migrationSql.includes("source_scope text not null default 'transaction_matter'"))
assert.ok(migrationSql.includes("check (source_scope = 'transaction_matter')"))
assert.ok(migrationSql.includes("amount_status in ('known', 'estimated', 'pending', 'not_applicable')"))
assert.ok(migrationSql.includes("quote_status in (\n      'pending_upload'"))

for (const operation of OTP_COMMERCIAL_TERMS_PERSISTENCE_SERVICE_OPERATIONS) {
  assert.ok(serviceSource.includes(`export async function ${operation}`), `service should export ${operation}`)
}
for (const rpc of OTP_COMMERCIAL_TERMS_PERSISTENCE_RPCS) {
  assert.ok(serviceSource.includes(rpc), `service should call ${rpc}`)
}

const audit = buildOtpCommercialTermsPersistencePhase24Audit({
  checkedAt: '2026-08-05T12:30:00.000Z',
  migrationSql,
  serviceSource,
})

assert.equal(audit.version, OTP_COMMERCIAL_TERMS_PERSISTENCE_PHASE24_VERSION)
assert.equal(audit.contract, OTP_COMMERCIAL_TERMS_PERSISTENCE_CONTRACT)
assert.equal(audit.status, OTP_COMMERCIAL_TERMS_PERSISTENCE_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.summary.tableCount, 4)
assert.equal(audit.summary.rpcCount, 3)
assert.equal(audit.summary.serviceOperationCount, 4)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.nextPhase.phase, 25)
assert.equal(audit.nextPhase.key, 'otp_review_ui')
assert.deepEqual(audit.blockers, [])

for (const check of [
  'PHASE24_PHASE23_RECONCILIATION_READY',
  'PHASE24_REQUIRED_TABLES_PRESENT',
  'PHASE24_REQUIRED_RPCS_PRESENT',
  'PHASE24_MANDATE_COMMISSION_PRESERVED',
  'PHASE24_ROUTE_SCOPING_ENFORCED',
  'PHASE24_COST_OBLIGATION_MODEL_PERSISTED',
  'PHASE24_MATTER_ATTORNEY_QUOTE_SEPARATED_FROM_LEAD_QUOTES',
  'PHASE24_RLS_ENABLED',
  'PHASE24_READINESS_VIEW_PRESENT',
  'PHASE24_SERVICE_WRAPPER_PRESENT',
  'PHASE24_AUDIT_EVENTS_RECORDED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const blocked = buildOtpCommercialTermsPersistencePhase24Audit({
  checkedAt: '2026-08-05T12:30:00.000Z',
  migrationSql: migrationSql.replace("check (source_scope = 'transaction_matter')", "check (source_scope in ('transaction_matter', 'attorney_lead_quote'))"),
  serviceSource,
})
assert.equal(blocked.status, 'OTP_COMMERCIAL_TERMS_PERSISTENCE_REMEDIATION_REQUIRED')
assert.equal(blocked.nextPhase, null)

const markdown = formatOtpCommercialTermsPersistencePhase24Markdown(audit)
for (const token of [
  'OTP Generator Phase 24 Commercial Terms Persistence',
  'OTP_COMMERCIAL_TERMS_PERSISTENCE_READY_FOR_PHASE25_REVIEW_UI',
  'otp_commission_variations',
  'bridge_upsert_matter_attorney_cost_quote_state',
  'Phase 25: OTP Review UI',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP commercial terms persistence Phase 24 contract passed.')
