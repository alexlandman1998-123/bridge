import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const api = fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8')
const partnerOptions = fs.readFileSync(path.join(root, 'src/lib/newTransactionPartnerOptions.js'), 'utf8')
const wizard = fs.readFileSync(path.join(root, 'src/components/NewTransactionWizard.jsx'), 'utf8')
const migrationPath = path.join(
  root,
  '../supabase/migrations/20260831061302_attorney_transaction_firm_routing.sql',
)
const migration = fs.readFileSync(migrationPath, 'utf8')

assert.match(
  partnerOptions,
  /attorneyFirmId: resolveAttorneyFirmId\(partner\)/,
  'transaction partner selections must retain a canonical attorney firm id',
)
assert.match(
  partnerOptions,
  /firmFirstAllocation: isAttorneyRole/,
  'an attorney firm selection must remain firm-first without requiring a preferred person',
)
assert.match(
  api,
  /client\.rpc\('bridge_resolve_attorney_firm_for_transaction'/,
  'transaction creation must use the transaction-scoped canonical firm resolver',
)
assert.match(
  wizard,
  /Transaction Created — Attorney Assignment Required/,
  'the creation result must not describe an unresolved attorney assignment as fully successful',
)
assert.match(
  api,
  /ATTORNEY_FIRM_RESOLUTION_FAILED[\s\S]*setupArea = 'attorney_assignment'/,
  'unresolved firms must be exposed as attorney-assignment setup failures',
)
assert.match(
  api,
  /ATTORNEY_ASSIGNMENT_PERSISTENCE_FAILED/,
  'a missing assignment insert must not be treated as successful propagation',
)
assert.match(
  migration,
  /create or replace function public\.bridge_resolve_attorney_firm_for_transaction/,
  'the migration must install the canonical firm resolver',
)
assert.match(
  migration,
  /security definer[\s\S]*auth\.uid\(\) is null[\s\S]*bridge_can_access_transaction_spine/,
  'the resolver must authenticate and authorize against the transaction spine',
)
assert.match(
  migration,
  /revoke all on function public\.bridge_resolve_attorney_firm_for_transaction[\s\S]*from public, anon/,
  'the privileged resolver must not be executable by public or anonymous users',
)
assert.match(
  migration,
  /created_at >= '2026-08-31T00:00:00Z'[\s\S]*insert into public\.transaction_attorney_assignments/,
  'transactions affected by the incident must receive an idempotent assignment backfill',
)
assert.doesNotMatch(migration, /2701d2e7-89a7-4445-b6bd-dcb5f9dbdc91/, 'the repair must not hardcode a generated transaction id')
assert.doesNotMatch(migration, /drop table|delete from|truncate/i, 'the repair migration must remain non-destructive')

console.log('Attorney transaction firm routing tests passed')
