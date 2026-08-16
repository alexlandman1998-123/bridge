import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  assessMvpTransactionOverrideAuthorization,
  assertMvpTransactionOverrideAuthorization,
  resolveTransactionCreationOverrideReason,
} from '../src/core/transactions/mvpTransactionOverrideAuthorization.js'

const lifecycleSource = readFileSync(new URL('../src/lib/transactionLifecycleService.js', import.meta.url), 'utf8')
const pipelineSource = readFileSync(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const contract = readFileSync(new URL('../docs/lead-listing-transaction-workflow-contract-phase0.md', import.meta.url), 'utf8')
const rpcMigration = readFileSync(
  new URL('../../supabase/migrations/20260815213628_transaction_override_boundary_phase5.sql', import.meta.url),
  'utf8',
)

assert.equal(
  resolveTransactionCreationOverrideReason({
    transaction_creation_override_reason: 'Principal approved exception for legacy in-flight transaction.',
  }),
  'Principal approved exception for legacy in-flight transaction.',
)

const authorised = assessMvpTransactionOverrideAuthorization({
  actor: { id: 'principal-1', role: 'principal' },
  payload: { overrideReason: 'Principal approved exception for legacy in-flight transaction.' },
})
assert.equal(authorised.authorised, true)
assert.equal(authorised.actorRole, 'principal')

assert.throws(
  () => assertMvpTransactionOverrideAuthorization({
    actor: { id: 'agent-1', role: 'agent' },
    payload: { overrideReason: 'Agent wants to skip the offer.' },
  }),
  (error) => error?.code === 'MVP_TRANSACTION_OVERRIDE_UNAUTHORISED' &&
    error.details?.issues.includes('override_actor_not_authorised'),
)

assert.throws(
  () => assertMvpTransactionOverrideAuthorization({
    actor: { id: 'principal-1', role: 'principal' },
    payload: {},
  }),
  (error) => error?.code === 'MVP_TRANSACTION_OVERRIDE_UNAUTHORISED' &&
    error.details?.issues.includes('override_reason_missing'),
)

assert.match(
  lifecycleSource,
  /assertMvpTransactionOverrideAuthorization/,
  'direct lead conversion must assert override authorisation in the transaction lifecycle service',
)
assert.match(
  lifecycleSource,
  /transactionCreationOverride:\s*overrideAuthorization/s,
  'routing profile should carry override audit metadata',
)
assert.match(
  lifecycleSource,
  /transaction_creation_override_reason:\s*overrideReason/,
  'RPC payload should carry the written override reason for downstream audit visibility',
)
assert.match(
  pipelineSource,
  /transactionCreationOverrideReason:\s*'Principal authorised transaction buyer onboarding setup before accepted-offer conversion\.'/,
  'buyer onboarding setup direct conversion should carry a written override reason',
)
assert.match(
  pipelineSource,
  /actor:\s*\{\s*id:\s*currentAgent\.id,\s*name:\s*currentAgent\.fullName,\s*email:\s*currentAgent\.email,\s*role:\s*membershipRole \|\| role,\s*isPrincipal\s*\}/s,
  'direct conversion actor should carry role and principal authority metadata',
)
assert.match(contract, /Manual Override Boundary - Phase 5/)
assert.match(
  rpcMigration,
  /create or replace function public\.bridge_can_create_transaction_override/,
  'database boundary should expose a dedicated transaction override role helper',
)
assert.match(
  rpcMigration,
  /v_allow_direct_lead_conversion[\s\S]+v_override_reason is null[\s\S]+Manual transaction override requires a written reason/,
  'direct RPC conversion should require a written override reason',
)
assert.match(
  rpcMigration,
  /not public\.bridge_can_create_transaction_override\(v_organisation_id\)/,
  'direct RPC conversion should require an authorised organisation actor',
)

console.log('Transaction override boundary Phase 5 checks passed.')
