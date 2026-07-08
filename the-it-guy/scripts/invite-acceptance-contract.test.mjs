import assert from 'node:assert/strict'
import {
  INVITATION_ACCEPTANCE_ACTIONS,
  INVITATION_ACCEPTANCE_CONTRACT_VERSION,
  INVITATION_ACCEPTANCE_KINDS,
  INVITATION_ACCEPTANCE_OUTCOMES,
  assertInviteAcceptanceComplete,
  evaluateInviteAcceptanceContract,
  getInviteAcceptanceContract,
  getRequiredInviteAcceptanceOutcomes,
  normalizeInvitationAcceptanceKind,
  normalizeTransactionPartnerAcceptanceRole,
  resolveAcceptanceWorkspaceTypeForTransactionRole,
  resolveTransactionPartnerAcceptanceProfile,
} from '../src/lib/invitationAcceptanceContract.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const OUTCOMES = INVITATION_ACCEPTANCE_OUTCOMES

test('formalizes the phase 1 invite acceptance contract', () => {
  assert.equal(INVITATION_ACCEPTANCE_CONTRACT_VERSION, 'invite_acceptance_contract_v1')
  assert.equal(normalizeInvitationAcceptanceKind('partner_invitation'), INVITATION_ACCEPTANCE_KINDS.organisationPartner)
  assert.equal(normalizeInvitationAcceptanceKind('transaction_partner_invitation'), INVITATION_ACCEPTANCE_KINDS.transactionPartner)

  const partnerContract = getInviteAcceptanceContract('organisation_partner')
  assert.deepEqual(partnerContract.requiredOutcomes, [
    OUTCOMES.authenticatedUser,
    OUTCOMES.invitedEmailMatched,
    OUTCOMES.acceptingOrganisationResolved,
    OUTCOMES.acceptingOrganisationMembership,
    OUTCOMES.organisationPartnerRelationship,
    OUTCOMES.invitationAccepted,
  ])

  const transactionOutcomes = getRequiredInviteAcceptanceOutcomes('transaction_partner')
  assert.ok(transactionOutcomes.includes(OUTCOMES.organisationPartnerRelationship))
  assert.ok(transactionOutcomes.includes(OUTCOMES.transactionUserAccess))
  assert.ok(transactionOutcomes.includes(OUTCOMES.transactionParticipant))
  assert.ok(transactionOutcomes.includes(OUTCOMES.transactionRolePlayer))
})

test('does not count an accepted partner invite as complete without the partner relationship', () => {
  const result = evaluateInviteAcceptanceContract({
    kind: 'organisation_partner',
    authenticatedUser: true,
    invitedEmailMatched: true,
    acceptingOrganisationResolved: true,
    acceptingOrganisationMembership: true,
    invitationAccepted: true,
  })

  assert.equal(result.complete, false)
  assert.deepEqual(result.missingOutcomes, [OUTCOMES.organisationPartnerRelationship])
  assert.equal(result.nextAction, INVITATION_ACCEPTANCE_ACTIONS.upsertOrganisationPartnerRelationship)
})

test('requires transaction access records in addition to the partner relationship', () => {
  const result = evaluateInviteAcceptanceContract({
    kind: 'transaction_partner',
    outcomes: {
      authenticated_user: true,
      invited_email_matched: true,
      accepting_organisation_resolved: true,
      accepting_organisation_membership: true,
      organisation_partner_relationship: true,
      invitation_accepted: true,
    },
  })

  assert.equal(result.complete, false)
  assert.deepEqual(result.missingOutcomes, [
    OUTCOMES.transactionResolved,
    OUTCOMES.transactionUserAccess,
    OUTCOMES.transactionParticipant,
    OUTCOMES.transactionRolePlayer,
  ])
  assert.equal(result.nextAction, INVITATION_ACCEPTANCE_ACTIONS.resolveTransaction)
})

test('marks a fully repaired transaction invite as complete and idempotent', () => {
  const result = assertInviteAcceptanceComplete({
    kind: 'partner_transaction_invite',
    userExists: true,
    emailMatchesInvite: true,
    workspaceResolved: true,
    activeWorkspaceMembership: true,
    hasPartnerConnection: true,
    accepted: true,
    hasTransaction: true,
    hasTransactionUserAccess: true,
    hasTransactionParticipant: true,
    hasTransactionRolePlayer: true,
  })

  assert.equal(result.complete, true)
  assert.equal(result.nextAction, INVITATION_ACCEPTANCE_ACTIONS.complete)
  assert.deepEqual(result.missingOutcomes, [])
})

test('maps transaction legal roles to the accepting workspace and role-player shape', () => {
  assert.equal(normalizeTransactionPartnerAcceptanceRole('attorney'), 'transfer_attorney')
  assert.equal(normalizeTransactionPartnerAcceptanceRole('bond cancellation attorney'), 'cancellation_attorney')
  assert.equal(resolveAcceptanceWorkspaceTypeForTransactionRole('transfer_attorney'), 'attorney_firm')
  assert.equal(resolveAcceptanceWorkspaceTypeForTransactionRole('bond_originator'), 'bond_originator')

  const transferProfile = resolveTransactionPartnerAcceptanceProfile('transfer_attorney')
  assert.equal(transferProfile.partnerType, 'attorney_firm')
  assert.equal(transferProfile.transactionRolePlayerType, 'transfer_attorney')
  assert.equal(transferProfile.participantRoleType, 'attorney')
  assert.equal(transferProfile.participantLegalRole, 'transfer')

  const bondProfile = resolveTransactionPartnerAcceptanceProfile('bond_attorney')
  assert.equal(bondProfile.partnerType, 'attorney_firm')
  assert.equal(bondProfile.participantLegalRole, 'bond')

  const cancellationProfile = resolveTransactionPartnerAcceptanceProfile('cancellation_attorney')
  assert.equal(cancellationProfile.partnerType, 'attorney_firm')
  assert.equal(cancellationProfile.participantLegalRole, 'cancellation')
})

console.log('invite acceptance contract tests passed')
