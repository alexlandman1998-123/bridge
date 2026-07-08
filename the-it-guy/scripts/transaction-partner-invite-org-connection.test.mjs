import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const migrationPath = resolve(root, '..', 'supabase/migrations/202607080005_transaction_partner_invite_partner_org_binding.sql')
const servicePath = resolve(root, 'src/services/transactionPartnerInvitationService.js')
const pagePath = resolve(root, 'src/pages/TransactionPartnerInvitePage.jsx')
const contractPath = resolve(root, 'src/lib/invitationAcceptanceContract.js')

const migration = readFileSync(migrationPath, 'utf8')
const service = readFileSync(servicePath, 'utf8')
const page = readFileSync(pagePath, 'utf8')
const contract = readFileSync(contractPath, 'utf8')

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

assertIncludes(
  migration,
  'drop function if exists public.bridge_accept_transaction_partner_invitation(text, jsonb);',
  'migration should replace the legacy two-argument accept RPC',
)
assertIncludes(
  migration,
  'p_organisation_id uuid default null',
  'transaction partner acceptance should accept an organisation id',
)
assertIncludes(migration, "'organisation_required'", 'acceptance should require an accepting organisation')
assertIncludes(migration, "'not_active_member'", 'acceptance should require active membership in the accepting organisation')
assertIncludes(migration, "'wrong_workspace'", 'acceptance should reject conflicting organisation binding')
assertIncludes(migration, "'self_relationship'", 'acceptance should reject connecting a transaction owner to itself')
assertIncludes(migration, 'v_owner_organisation_id := v_tx.organisation_id', 'acceptance should resolve the transaction owner organisation')
assertIncludes(migration, 'insert into public.organisation_partners', 'acceptance should create the reusable partner relationship')
assertIncludes(migration, 'update public.organisation_partners', 'acceptance should repair/reuse existing partner relationships')
assertIncludes(migration, "invite.status = 'accepted'", 'migration should backfill already accepted transaction invitations')
assertIncludes(migration, 'count(distinct ou.organisation_id)', 'backfill should only infer unambiguous accepting workspaces')
assertIncludes(migration, "'phase4BackfilledAt', v_now", 'backfill should mark repaired accepted transaction invitations')
assertIncludes(migration, 'partner_relationship_id = v_partner_relationship_id', 'role players should keep the partner relationship id')
assertIncludes(migration, 'partner_organisation_id = v_accepting_organisation_id', 'participants/role players should keep the accepting organisation id')
assertIncludes(migration, 'organisation_id = v_accepting_organisation_id', 'the invite should be bound to the accepting organisation')
assertIncludes(migration, "'acceptedPartnerRelationshipId', v_partner_relationship_id", 'invite metadata should record the partner relationship')
assertIncludes(migration, "'partnerConnectionConfirmed', v_partner_relationship_id is not null", 'RPC result should confirm partner connection state')
assertIncludes(
  migration,
  'grant execute on function public.bridge_accept_transaction_partner_invitation(text, jsonb, uuid) to authenticated;',
  'new RPC signature should be callable by authenticated users',
)

assertIncludes(service, 'organisationId = \'\', organisation_id = \'\'', 'service should accept organisationId input')
assertIncludes(service, 'p_organisation_id: normalizeText(organisationId || organisation_id) || null', 'service should pass organisation id to RPC')
assertIncludes(service, 'organisation_required', 'service should surface organisation-required errors')
assertIncludes(service, 'not_active_member', 'service should surface membership errors')

assertIncludes(page, "import { useWorkspace } from '../context/WorkspaceContext'", 'invite page should read active workspace')
assertIncludes(page, 'const workspaceId = normalizeText(workspaceContext.currentWorkspace?.id || workspaceContext.workspace?.id)', 'invite page should resolve active workspace id')
assertIncludes(page, 'organisationId: workspaceId', 'invite page should accept against active workspace')
assertIncludes(page, 'Complete workspace setup before accepting this transaction invitation.', 'invite page should block acceptance without workspace setup')

assertIncludes(
  contract,
  "organisationPartnerRelationship: 'organisation_partner_relationship'",
  'Phase 1 contract should still require organisation partner relationships',
)
assertIncludes(
  contract,
  "transactionUserAccess: 'transaction_user_access'",
  'Phase 1 contract should still require transaction access',
)

console.log('transaction partner invite organisation connection tests passed')
