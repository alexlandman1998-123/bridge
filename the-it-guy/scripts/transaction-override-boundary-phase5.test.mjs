import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BUYER_ONBOARDING_INTAKE_CREATION_MODE,
  SIGNED_OTP_INTAKE_CREATION_MODE,
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
const signedOtpIntakeMigration = readFileSync(
  new URL('../../supabase/migrations/20260827150150_signed_otp_intake_phase1.sql', import.meta.url),
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

const buyerOnboardingIntake = assessMvpTransactionOverrideAuthorization({
  actor: { id: 'agent-1', role: 'agent' },
  payload: {
    creationMode: BUYER_ONBOARDING_INTAKE_CREATION_MODE,
    assignedAgentId: 'agent-1',
  },
})
assert.equal(buyerOnboardingIntake.authorised, true)
assert.equal(buyerOnboardingIntake.assignedAgentMatch, true)

const signedOtpIntake = assessMvpTransactionOverrideAuthorization({
  actor: { id: 'agent-1', role: 'agent' },
  payload: {
    creationMode: SIGNED_OTP_INTAKE_CREATION_MODE,
    assignedAgentId: 'agent-1',
    signedOtpEvidence: {
      storagePath: 'buyer-otp-documents/lead-1/signed-otp.pdf',
      uploadedAt: '2026-08-27T12:00:00.000Z',
      signedByAllPartiesConfirmed: true,
      arch9TermsIncludedConfirmed: true,
    },
  },
})
assert.equal(signedOtpIntake.authorised, true)
assert.equal(signedOtpIntake.signedOtpEvidence.ready, true)

assert.throws(
  () => assertMvpTransactionOverrideAuthorization({
    actor: { id: 'agent-2', role: 'agent' },
    payload: {
      creationMode: SIGNED_OTP_INTAKE_CREATION_MODE,
      assignedAgentId: 'agent-1',
      signedOtpEvidence: {
        storagePath: 'buyer-otp-documents/lead-1/signed-otp.pdf',
        uploadedAt: '2026-08-27T12:00:00.000Z',
        signedByAllPartiesConfirmed: true,
        arch9TermsIncludedConfirmed: true,
      },
    },
  }),
  (error) => error?.code === 'SIGNED_OTP_INTAKE_UNAUTHORISED' &&
    error.details?.issues.includes('buyer_intake_actor_not_assigned'),
)

assert.throws(
  () => assertMvpTransactionOverrideAuthorization({
    actor: { id: 'agent-1', role: 'agent' },
    payload: {
      creationMode: SIGNED_OTP_INTAKE_CREATION_MODE,
      assignedAgentId: 'agent-1',
      signedOtpEvidence: { storagePath: 'buyer-otp-documents/lead-1/signed-otp.pdf' },
    },
  }),
  (error) => error?.code === 'SIGNED_OTP_INTAKE_UNAUTHORISED' &&
    error.details?.issues.includes('signed_otp_uploaded_at_missing'),
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
  /creationMode:\s*'buyer_onboarding_intake'/,
  'buyer onboarding should reuse the transaction command through its assigned-agent intake mode',
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
  lifecycleSource,
  /signed_otp_intake_evidence:\s*signedOtpIntake/,
  'signed OTP evidence should cross the atomic transaction boundary',
)
assert.match(
  pipelineSource,
  /async function promoteBuyerOnboardingDraftToTransaction/,
  'manual onboarding drafts should be promoted into the existing canonical onboarding record',
)
assert.match(
  pipelineSource,
  /persistedOtpDocument\?\.id[\s\S]+canonical transaction evidence could not be recorded/,
  'OTP finalisation must stop if the canonical document record is unavailable',
)
assert.match(
  pipelineSource,
  /title:\s*'Complete signed OTP intake'/,
  'an interrupted upload should create a visible recovery task',
)
assert.match(
  signedOtpIntakeMigration,
  /bridge_can_create_assigned_buyer_intake/,
  'the database should authorise assigned-agent buyer intake from persisted assignment',
)
assert.match(
  signedOtpIntakeMigration,
  /v_creation_mode = 'signed_otp_intake'[\s\S]+Signed OTP intake requires complete upload evidence and confirmations/,
  'the database should enforce signed OTP evidence independently of the browser',
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
