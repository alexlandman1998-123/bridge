import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildSellerSigningPlan } from '../src/lib/sellerSigningPlanModel.js'

const scenarios = [
  {
    name: 'individual owner',
    input: { sellerType: 'individual', form: { sellerName: 'Ava Owner', sellerEmail: 'ava@example.test' } },
    recipients: 1,
    roles: ['Seller'],
  },
  {
    name: 'multiple owners',
    input: {
      sellerType: 'multiple_owners',
      form: {
        multipleOwners: [
          { fullName: 'Ava Owner', email: 'ava@example.test' },
          { fullName: 'Ben Owner', email: 'ben@example.test' },
        ],
      },
    },
    recipients: 2,
    roles: ['Owner', 'Owner'],
    requiresIndividualSignatures: true,
  },
  {
    name: 'company',
    input: { sellerType: 'company', form: { authorisedSignatoryName: 'Casey Director', authorisedSignatoryEmail: 'casey@example.test' } },
    recipients: 1,
    roles: ['Authorised signatory'],
  },
  {
    name: 'trust',
    input: { sellerType: 'trust', form: { authorisedTrusteeName: 'Devon Trustee', authorisedTrusteeEmail: 'devon@example.test' } },
    recipients: 1,
    roles: ['Authorised trustee'],
  },
  {
    name: 'deceased estate',
    input: { sellerType: 'deceased_estate', form: { executorName: 'Emery Executor', executorEmail: 'emery@example.test' } },
    recipients: 1,
    roles: ['Executor'],
  },
]

for (const scenario of scenarios) {
  const plan = buildSellerSigningPlan(scenario.input)
  assert.equal(plan.ready, true, `${scenario.name}: the signer plan should be ready`)
  assert.equal(plan.recipients.length, scenario.recipients, `${scenario.name}: expected recipient count`)
  assert.deepEqual(plan.recipients.map(({ role }) => role), scenario.roles, `${scenario.name}: expected signer roles`)
  assert.equal(plan.requiresIndividualSignatures, scenario.requiresIndividualSignatures === true, `${scenario.name}: individual-signature requirement`)
}

const [completionMigration, workspaceMigration, inviteMigration, taskMigration, edge, detail] = await Promise.all([
  readFile(new URL('../../supabase/migrations/20260918114553_listing_multi_signer_sessions_phase2.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260918120035_listing_seller_portal_workspace_phase2.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260918120301_listing_seller_portal_recipient_invites_phase3.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260918120542_listing_seller_portal_document_tasks_phase4.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/functions/listing-mandate-signing/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
])

// A group remains incomplete until every signer has completed the signing pack.
assert.match(completionMigration, /where signing_group_id = v_session\.signing_group_id and status <> 'signed'/)
assert.match(workspaceMigration, /if v_group_complete then[\s\S]*bridge_prepare_listing_seller_portal_workspace\(v_session\.id\)/)

// Invitations are individually scoped, created only after full group completion, and auditable.
assert.match(inviteMigration, /private_listing_seller_portal_recipient_invites/)
assert.match(inviteMigration, /unique \(signing_session_id\)/)
assert.match(inviteMigration, /bridge_list_completed_listing_seller_portal_recipients/)
assert.match(inviteMigration, /bridge_record_listing_seller_portal_recipient_invite_delivery/)
assert.match(edge, /const portalInvitations = completion\.groupComplete === true\s*\? await issueSellerPortalRecipientInvites/)
assert.match(edge, /: \{ attempted: false, deliveries: \[\] \}/)

// The signed-pack snapshot becomes listing-scoped portal tasks, then appears in Seller tab status.
assert.match(detail, /const sellerPortalTasks = getRequiredSellerDocuments/)
assert.match(taskMigration, /signing_pack_snapshot -> 'sellerPortalTasks'/)
assert.match(edge, /portalInvitations: invitations \|\| \[\]/)
assert.match(edge, /portalTaskPlan: snapshot\(taskPlan\)/)
assert.match(detail, /Seller Portal status/)
assert.match(detail, /Outstanding portal documents/)

console.log(`listing seller portal release phase 6 checks passed (${scenarios.length} owner scenarios).`)
