import { WORKSPACE_TYPES, normalizeWorkspaceType } from '../constants/workspaceTypes.js'

export const INVITATION_ACCEPTANCE_CONTRACT_VERSION = 'invite_acceptance_contract_v1'

export const INVITATION_ACCEPTANCE_KINDS = Object.freeze({
  organisationPartner: 'organisation_partner',
  transactionPartner: 'transaction_partner',
})

export const INVITATION_ACCEPTANCE_OUTCOMES = Object.freeze({
  authenticatedUser: 'authenticated_user',
  invitedEmailMatched: 'invited_email_matched',
  acceptingOrganisationResolved: 'accepting_organisation_resolved',
  acceptingOrganisationMembership: 'accepting_organisation_membership',
  organisationPartnerRelationship: 'organisation_partner_relationship',
  invitationAccepted: 'invitation_accepted',
  transactionResolved: 'transaction_resolved',
  transactionUserAccess: 'transaction_user_access',
  transactionParticipant: 'transaction_participant',
  transactionRolePlayer: 'transaction_role_player',
})

export const INVITATION_ACCEPTANCE_ACTIONS = Object.freeze({
  authenticate: 'authenticate_user',
  matchInvitedEmail: 'match_invited_email',
  resolveAcceptingOrganisation: 'resolve_accepting_organisation',
  verifyAcceptingMembership: 'verify_accepting_membership',
  upsertOrganisationPartnerRelationship: 'upsert_organisation_partner_relationship',
  markInvitationAccepted: 'mark_invitation_accepted',
  resolveTransaction: 'resolve_transaction',
  grantTransactionUserAccess: 'grant_transaction_user_access',
  upsertTransactionParticipant: 'upsert_transaction_participant',
  upsertTransactionRolePlayer: 'upsert_transaction_role_player',
  complete: 'complete',
})

const CORE_PARTNER_OUTCOMES = Object.freeze([
  INVITATION_ACCEPTANCE_OUTCOMES.authenticatedUser,
  INVITATION_ACCEPTANCE_OUTCOMES.invitedEmailMatched,
  INVITATION_ACCEPTANCE_OUTCOMES.acceptingOrganisationResolved,
  INVITATION_ACCEPTANCE_OUTCOMES.acceptingOrganisationMembership,
  INVITATION_ACCEPTANCE_OUTCOMES.organisationPartnerRelationship,
  INVITATION_ACCEPTANCE_OUTCOMES.invitationAccepted,
])

const TRANSACTION_PARTNER_OUTCOMES = Object.freeze([
  ...CORE_PARTNER_OUTCOMES,
  INVITATION_ACCEPTANCE_OUTCOMES.transactionResolved,
  INVITATION_ACCEPTANCE_OUTCOMES.transactionUserAccess,
  INVITATION_ACCEPTANCE_OUTCOMES.transactionParticipant,
  INVITATION_ACCEPTANCE_OUTCOMES.transactionRolePlayer,
])

const OUTCOME_NEXT_ACTIONS = Object.freeze({
  [INVITATION_ACCEPTANCE_OUTCOMES.authenticatedUser]: INVITATION_ACCEPTANCE_ACTIONS.authenticate,
  [INVITATION_ACCEPTANCE_OUTCOMES.invitedEmailMatched]: INVITATION_ACCEPTANCE_ACTIONS.matchInvitedEmail,
  [INVITATION_ACCEPTANCE_OUTCOMES.acceptingOrganisationResolved]: INVITATION_ACCEPTANCE_ACTIONS.resolveAcceptingOrganisation,
  [INVITATION_ACCEPTANCE_OUTCOMES.acceptingOrganisationMembership]: INVITATION_ACCEPTANCE_ACTIONS.verifyAcceptingMembership,
  [INVITATION_ACCEPTANCE_OUTCOMES.organisationPartnerRelationship]: INVITATION_ACCEPTANCE_ACTIONS.upsertOrganisationPartnerRelationship,
  [INVITATION_ACCEPTANCE_OUTCOMES.invitationAccepted]: INVITATION_ACCEPTANCE_ACTIONS.markInvitationAccepted,
  [INVITATION_ACCEPTANCE_OUTCOMES.transactionResolved]: INVITATION_ACCEPTANCE_ACTIONS.resolveTransaction,
  [INVITATION_ACCEPTANCE_OUTCOMES.transactionUserAccess]: INVITATION_ACCEPTANCE_ACTIONS.grantTransactionUserAccess,
  [INVITATION_ACCEPTANCE_OUTCOMES.transactionParticipant]: INVITATION_ACCEPTANCE_ACTIONS.upsertTransactionParticipant,
  [INVITATION_ACCEPTANCE_OUTCOMES.transactionRolePlayer]: INVITATION_ACCEPTANCE_ACTIONS.upsertTransactionRolePlayer,
})

export const INVITATION_ACCEPTANCE_CONTRACTS = Object.freeze({
  [INVITATION_ACCEPTANCE_KINDS.organisationPartner]: Object.freeze({
    version: INVITATION_ACCEPTANCE_CONTRACT_VERSION,
    kind: INVITATION_ACCEPTANCE_KINDS.organisationPartner,
    acceptedDefinition:
      'A partner invitation is accepted only when the invited user is authenticated, belongs to the accepting organisation, the invited email matches, the organisation partner relationship exists, and the invitation is marked accepted.',
    requiredOutcomes: CORE_PARTNER_OUTCOMES,
    idempotentRepairActions: Object.freeze([
      INVITATION_ACCEPTANCE_ACTIONS.resolveAcceptingOrganisation,
      INVITATION_ACCEPTANCE_ACTIONS.upsertOrganisationPartnerRelationship,
      INVITATION_ACCEPTANCE_ACTIONS.markInvitationAccepted,
    ]),
  }),
  [INVITATION_ACCEPTANCE_KINDS.transactionPartner]: Object.freeze({
    version: INVITATION_ACCEPTANCE_CONTRACT_VERSION,
    kind: INVITATION_ACCEPTANCE_KINDS.transactionPartner,
    acceptedDefinition:
      'A transaction partner invitation is accepted only when the invited user and organisation are connected as partners, and the invited user also has transaction access, participant, and role-player records.',
    requiredOutcomes: TRANSACTION_PARTNER_OUTCOMES,
    idempotentRepairActions: Object.freeze([
      INVITATION_ACCEPTANCE_ACTIONS.resolveAcceptingOrganisation,
      INVITATION_ACCEPTANCE_ACTIONS.upsertOrganisationPartnerRelationship,
      INVITATION_ACCEPTANCE_ACTIONS.grantTransactionUserAccess,
      INVITATION_ACCEPTANCE_ACTIONS.upsertTransactionParticipant,
      INVITATION_ACCEPTANCE_ACTIONS.upsertTransactionRolePlayer,
      INVITATION_ACCEPTANCE_ACTIONS.markInvitationAccepted,
    ]),
  }),
})

const ATTORNEY_WORKSPACE_PROFILE = Object.freeze({
  acceptingWorkspaceType: WORKSPACE_TYPES.attorneyFirm,
  partnerType: WORKSPACE_TYPES.attorneyFirm,
  relationshipCategory: 'legal_partner',
  partnerConnectionRole: 'attorney',
})

export const TRANSACTION_PARTNER_ACCEPTANCE_PROFILES = Object.freeze({
  transfer_attorney: Object.freeze({
    roleType: 'transfer_attorney',
    roleLabel: 'Transfer Attorney',
    ...ATTORNEY_WORKSPACE_PROFILE,
    transactionRolePlayerType: 'transfer_attorney',
    participantRoleType: 'attorney',
    participantLegalRole: 'transfer',
  }),
  bond_attorney: Object.freeze({
    roleType: 'bond_attorney',
    roleLabel: 'Bond Attorney',
    ...ATTORNEY_WORKSPACE_PROFILE,
    transactionRolePlayerType: 'bond_attorney',
    participantRoleType: 'attorney',
    participantLegalRole: 'bond',
  }),
  cancellation_attorney: Object.freeze({
    roleType: 'cancellation_attorney',
    roleLabel: 'Cancellation Attorney',
    ...ATTORNEY_WORKSPACE_PROFILE,
    transactionRolePlayerType: 'cancellation_attorney',
    participantRoleType: 'attorney',
    participantLegalRole: 'cancellation',
  }),
  bond_originator: Object.freeze({
    roleType: 'bond_originator',
    roleLabel: 'Bond Originator',
    acceptingWorkspaceType: WORKSPACE_TYPES.bondOriginator,
    partnerType: WORKSPACE_TYPES.bondOriginator,
    relationshipCategory: 'finance_partner',
    partnerConnectionRole: 'bond_originator',
    transactionRolePlayerType: 'bond_originator',
    participantRoleType: 'bond_originator',
    participantLegalRole: 'none',
  }),
  developer: Object.freeze({
    roleType: 'developer',
    roleLabel: 'Developer',
    acceptingWorkspaceType: WORKSPACE_TYPES.developerCompany,
    partnerType: WORKSPACE_TYPES.developerCompany,
    relationshipCategory: 'developer_partner',
    partnerConnectionRole: 'developer',
    transactionRolePlayerType: 'developer_contact',
    participantRoleType: 'developer',
    participantLegalRole: 'none',
  }),
  other: Object.freeze({
    roleType: 'other',
    roleLabel: 'Transaction Partner',
    acceptingWorkspaceType: null,
    partnerType: 'other',
    relationshipCategory: 'external_collaborator',
    partnerConnectionRole: 'other',
    transactionRolePlayerType: 'other',
    participantRoleType: 'external_collaborator',
    participantLegalRole: 'none',
  }),
})

const KIND_ALIASES = Object.freeze({
  partner: INVITATION_ACCEPTANCE_KINDS.organisationPartner,
  organisation_partner: INVITATION_ACCEPTANCE_KINDS.organisationPartner,
  organization_partner: INVITATION_ACCEPTANCE_KINDS.organisationPartner,
  organisation_partner_invitation: INVITATION_ACCEPTANCE_KINDS.organisationPartner,
  organization_partner_invitation: INVITATION_ACCEPTANCE_KINDS.organisationPartner,
  partner_invitation: INVITATION_ACCEPTANCE_KINDS.organisationPartner,
  transaction: INVITATION_ACCEPTANCE_KINDS.transactionPartner,
  transaction_partner: INVITATION_ACCEPTANCE_KINDS.transactionPartner,
  transaction_partner_invitation: INVITATION_ACCEPTANCE_KINDS.transactionPartner,
  partner_transaction_invite: INVITATION_ACCEPTANCE_KINDS.transactionPartner,
})

const OUTCOME_STATE_ALIASES = Object.freeze({
  [INVITATION_ACCEPTANCE_OUTCOMES.authenticatedUser]: Object.freeze([
    'authenticatedUser',
    'hasAuthenticatedUser',
    'signedInUser',
    'userExists',
  ]),
  [INVITATION_ACCEPTANCE_OUTCOMES.invitedEmailMatched]: Object.freeze([
    'invitedEmailMatched',
    'emailMatched',
    'emailMatchesInvite',
  ]),
  [INVITATION_ACCEPTANCE_OUTCOMES.acceptingOrganisationResolved]: Object.freeze([
    'acceptingOrganisationResolved',
    'organisationResolved',
    'hasAcceptingOrganisation',
    'workspaceResolved',
  ]),
  [INVITATION_ACCEPTANCE_OUTCOMES.acceptingOrganisationMembership]: Object.freeze([
    'acceptingOrganisationMembership',
    'hasAcceptingOrganisationMembership',
    'activeOrganisationMembership',
    'activeWorkspaceMembership',
  ]),
  [INVITATION_ACCEPTANCE_OUTCOMES.organisationPartnerRelationship]: Object.freeze([
    'organisationPartnerRelationship',
    'organizationPartnerRelationship',
    'hasOrganisationPartnerRelationship',
    'hasPartnerConnection',
    'partnerRelationshipExists',
  ]),
  [INVITATION_ACCEPTANCE_OUTCOMES.invitationAccepted]: Object.freeze([
    'invitationAccepted',
    'isAccepted',
    'accepted',
  ]),
  [INVITATION_ACCEPTANCE_OUTCOMES.transactionResolved]: Object.freeze([
    'transactionResolved',
    'hasTransaction',
    'transactionExists',
  ]),
  [INVITATION_ACCEPTANCE_OUTCOMES.transactionUserAccess]: Object.freeze([
    'transactionUserAccess',
    'hasTransactionUserAccess',
    'transactionAccess',
  ]),
  [INVITATION_ACCEPTANCE_OUTCOMES.transactionParticipant]: Object.freeze([
    'transactionParticipant',
    'hasTransactionParticipant',
  ]),
  [INVITATION_ACCEPTANCE_OUTCOMES.transactionRolePlayer]: Object.freeze([
    'transactionRolePlayer',
    'hasTransactionRolePlayer',
  ]),
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function toCamelCaseKey(value) {
  return normalizeKey(value).replace(/_([a-z0-9])/g, (_, character) => character.toUpperCase())
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function readOutcomeState(state = {}, outcome) {
  if (!state || typeof state !== 'object') return false
  const directCandidates = [outcome, toCamelCaseKey(outcome), ...(OUTCOME_STATE_ALIASES[outcome] || [])]
  for (const key of directCandidates) {
    if (hasOwn(state, key)) return state[key] === true
  }
  const nested = state.outcomes && typeof state.outcomes === 'object' ? state.outcomes : null
  if (!nested) return false
  for (const key of directCandidates) {
    if (hasOwn(nested, key)) return nested[key] === true
  }
  return false
}

export function normalizeInvitationAcceptanceKind(value = '') {
  const key = normalizeKey(value)
  return KIND_ALIASES[key] || ''
}

export function getInviteAcceptanceContract(kind = '') {
  const normalizedKind = normalizeInvitationAcceptanceKind(kind)
  return INVITATION_ACCEPTANCE_CONTRACTS[normalizedKind] || null
}

export function getRequiredInviteAcceptanceOutcomes(kind = '') {
  return getInviteAcceptanceContract(kind)?.requiredOutcomes || Object.freeze([])
}

export function normalizeTransactionPartnerAcceptanceRole(value = '') {
  const normalized = normalizeKey(value)
  if (normalized === 'attorney' || normalized === 'conveyancer' || normalized === 'transfer') return 'transfer_attorney'
  if (normalized === 'bond_attorney' || normalized === 'bond_registration_attorney' || normalized === 'registration_attorney') return 'bond_attorney'
  if (normalized === 'cancellation_attorney' || normalized === 'bond_cancellation_attorney' || normalized === 'cancellation') return 'cancellation_attorney'
  if (normalized === 'bond' || normalized === 'originator' || normalized === 'bondoriginator' || normalized === 'bond_originator') return 'bond_originator'
  if (normalized === 'developer_contact') return 'developer'
  return TRANSACTION_PARTNER_ACCEPTANCE_PROFILES[normalized] ? normalized : 'other'
}

export function resolveTransactionPartnerAcceptanceProfile(roleType = '') {
  const normalizedRole = normalizeTransactionPartnerAcceptanceRole(roleType)
  return TRANSACTION_PARTNER_ACCEPTANCE_PROFILES[normalizedRole] || TRANSACTION_PARTNER_ACCEPTANCE_PROFILES.other
}

export function resolveAcceptanceWorkspaceTypeForTransactionRole(roleType = '', fallback = '') {
  const profile = resolveTransactionPartnerAcceptanceProfile(roleType)
  return normalizeWorkspaceType(profile.acceptingWorkspaceType, fallback)
}

export function evaluateInviteAcceptanceContract(input = {}) {
  const kind = normalizeInvitationAcceptanceKind(input.kind || input.inviteKind || input.invite_type || input.type)
  const contract = INVITATION_ACCEPTANCE_CONTRACTS[kind]
  if (!contract) {
    return {
      version: INVITATION_ACCEPTANCE_CONTRACT_VERSION,
      kind: '',
      complete: false,
      requiredOutcomes: Object.freeze([]),
      satisfiedOutcomes: Object.freeze([]),
      missingOutcomes: Object.freeze([]),
      nextAction: '',
      error: 'unknown_invitation_kind',
    }
  }

  const satisfiedOutcomes = contract.requiredOutcomes.filter((outcome) => readOutcomeState(input, outcome))
  const missingOutcomes = contract.requiredOutcomes.filter((outcome) => !satisfiedOutcomes.includes(outcome))
  const nextMissingOutcome = missingOutcomes[0] || ''

  return {
    version: contract.version,
    kind: contract.kind,
    complete: missingOutcomes.length === 0,
    requiredOutcomes: contract.requiredOutcomes,
    satisfiedOutcomes: Object.freeze(satisfiedOutcomes),
    missingOutcomes: Object.freeze(missingOutcomes),
    nextAction: nextMissingOutcome ? OUTCOME_NEXT_ACTIONS[nextMissingOutcome] : INVITATION_ACCEPTANCE_ACTIONS.complete,
    error: '',
  }
}

export function assertInviteAcceptanceComplete(input = {}) {
  const result = evaluateInviteAcceptanceContract(input)
  if (result.complete) return result
  const error = new Error('Invitation acceptance contract is incomplete.')
  error.code = result.error || 'invite_acceptance_incomplete'
  error.contract = result
  throw error
}
