import { APP_ROLES } from './appRoles'
import { ORG_ROLES } from './orgRoles'
import { WORKSPACE_TYPES } from './workspaceTypes'

export const SIGNUP_BUSINESS_TYPES = Object.freeze({
  agency: 'agency',
  developer: 'developer',
  attorney: 'attorney',
  bondOriginator: 'bond_originator',
  client: 'client',
})

export const SIGNUP_AUTHORITY_LEVELS = Object.freeze({
  ownerManagement: 'owner_management',
  branchManagement: 'branch_management',
  operational: 'operational',
  external: 'external',
})

export const SIGNUP_ONBOARDING_PATHS = Object.freeze({
  agencyOwner: 'agency_owner',
  agencyBranchManager: 'agency_branch_manager',
  agencyOperational: 'agency_operational',
  developerOwner: 'developer_owner',
  developerOperational: 'developer_operational',
  attorneyOwner: 'attorney_owner',
  attorneyOperational: 'attorney_operational',
  bondOwner: 'bond_owner',
  bondOperational: 'bond_operational',
  clientInvited: 'client_invited',
})

export const SIGNUP_WORKSPACE_ACTIONS = Object.freeze({
  createWorkspace: 'create_workspace',
  joinOrRequestWorkspace: 'join_or_request_workspace',
  acceptInvite: 'accept_invite',
  acceptClientAccess: 'accept_client_access',
})

export const SIGNUP_INTENT_STATUSES = Object.freeze({
  pendingEmailVerification: 'pending_email_verification',
  readyForOnboarding: 'ready_for_onboarding',
  consumed: 'consumed',
  abandoned: 'abandoned',
  expired: 'expired',
})

export const SIGNUP_INTENT_SOURCE = Object.freeze({
  publicSignup: 'public_signup',
  inviteLink: 'invite_link',
  recovery: 'recovery',
})

export const BUSINESS_TYPE_OPTIONS = Object.freeze([
  {
    value: SIGNUP_BUSINESS_TYPES.agency,
    label: 'Estate Agency',
    description: 'For principals, branch teams, agents, and agency admin staff.',
  },
  {
    value: SIGNUP_BUSINESS_TYPES.developer,
    label: 'Developer',
    description: 'For development companies, sales teams, and operations staff.',
  },
  {
    value: SIGNUP_BUSINESS_TYPES.attorney,
    label: 'Attorney / Conveyancer',
    description: 'For firms handling transfers, bonds, documents, and signing workflows.',
  },
  {
    value: SIGNUP_BUSINESS_TYPES.bondOriginator,
    label: 'Bond Originator',
    description: 'For finance consultants, processors, and bond business owners.',
  },
  {
    value: SIGNUP_BUSINESS_TYPES.client,
    label: 'Buyer / Seller / Client',
    description: 'For transaction participants using a secure client access link.',
  },
])

export const POSITION_OPTIONS_BY_BUSINESS_TYPE = Object.freeze({
  [SIGNUP_BUSINESS_TYPES.agency]: [
    {
      value: 'agency_owner',
      label: 'I own/manage the agency',
      description: 'Create the agency workspace in the next setup step.',
    },
    {
      value: 'agency_branch_manager',
      label: 'I manage a branch',
      description: 'Join or request access to an existing agency branch.',
    },
    {
      value: 'agency_operational',
      label: 'I am an agent/admin staff member',
      description: 'Join by invite or request approval from the agency.',
    },
  ],
  [SIGNUP_BUSINESS_TYPES.developer]: [
    {
      value: 'developer_owner',
      label: 'I own/manage the development company',
      description: 'Create the developer workspace in the next setup step.',
    },
    {
      value: 'developer_operational',
      label: 'I work in sales/admin/operations',
      description: 'Join by invite or request access from the company.',
    },
  ],
  [SIGNUP_BUSINESS_TYPES.attorney]: [
    {
      value: 'attorney_owner',
      label: 'I own/manage the firm',
      description: 'Create or connect the attorney firm workspace next.',
    },
    {
      value: 'attorney_operational',
      label: 'I am an attorney/conveyancer/staff member',
      description: 'Join by invite or request access from the firm.',
    },
  ],
  [SIGNUP_BUSINESS_TYPES.bondOriginator]: [
    {
      value: 'bond_owner',
      label: 'I own/manage the bond originator business',
      description: 'Create the bond originator workspace in the next setup step.',
    },
    {
      value: 'bond_operational',
      label: 'I am a consultant/admin staff member',
      description: 'Join by invite or request access from the business.',
    },
  ],
  [SIGNUP_BUSINESS_TYPES.client]: [
    {
      value: 'client_invited',
      label: 'I am accessing my transaction',
      description: 'Continue through your secure transaction invitation.',
    },
  ],
})

export const SIGNUP_POSITION_INTENT_MAP = Object.freeze({
  agency_owner: {
    app_role: APP_ROLES.agent,
    workspace_type: WORKSPACE_TYPES.agency,
    intended_org_role: ORG_ROLES.principal,
    authority_level: SIGNUP_AUTHORITY_LEVELS.ownerManagement,
    onboarding_path: SIGNUP_ONBOARDING_PATHS.agencyOwner,
    workspace_action: SIGNUP_WORKSPACE_ACTIONS.createWorkspace,
  },
  agency_branch_manager: {
    app_role: APP_ROLES.agent,
    workspace_type: WORKSPACE_TYPES.agency,
    intended_org_role: ORG_ROLES.branchManager,
    authority_level: SIGNUP_AUTHORITY_LEVELS.branchManagement,
    onboarding_path: SIGNUP_ONBOARDING_PATHS.agencyBranchManager,
    workspace_action: SIGNUP_WORKSPACE_ACTIONS.joinOrRequestWorkspace,
  },
  agency_operational: {
    app_role: APP_ROLES.agent,
    workspace_type: WORKSPACE_TYPES.agency,
    intended_org_role: ORG_ROLES.agent,
    authority_level: SIGNUP_AUTHORITY_LEVELS.operational,
    onboarding_path: SIGNUP_ONBOARDING_PATHS.agencyOperational,
    workspace_action: SIGNUP_WORKSPACE_ACTIONS.joinOrRequestWorkspace,
  },
  developer_owner: {
    app_role: APP_ROLES.developer,
    workspace_type: WORKSPACE_TYPES.developerCompany,
    intended_org_role: ORG_ROLES.owner,
    authority_level: SIGNUP_AUTHORITY_LEVELS.ownerManagement,
    onboarding_path: SIGNUP_ONBOARDING_PATHS.developerOwner,
    workspace_action: SIGNUP_WORKSPACE_ACTIONS.createWorkspace,
  },
  developer_operational: {
    app_role: APP_ROLES.developer,
    workspace_type: WORKSPACE_TYPES.developerCompany,
    intended_org_role: ORG_ROLES.salesAgent,
    authority_level: SIGNUP_AUTHORITY_LEVELS.operational,
    onboarding_path: SIGNUP_ONBOARDING_PATHS.developerOperational,
    workspace_action: SIGNUP_WORKSPACE_ACTIONS.joinOrRequestWorkspace,
  },
  attorney_owner: {
    app_role: APP_ROLES.attorney,
    workspace_type: WORKSPACE_TYPES.attorneyFirm,
    intended_org_role: ORG_ROLES.owner,
    authority_level: SIGNUP_AUTHORITY_LEVELS.ownerManagement,
    onboarding_path: SIGNUP_ONBOARDING_PATHS.attorneyOwner,
    workspace_action: SIGNUP_WORKSPACE_ACTIONS.createWorkspace,
  },
  attorney_operational: {
    app_role: APP_ROLES.attorney,
    workspace_type: WORKSPACE_TYPES.attorneyFirm,
    intended_org_role: ORG_ROLES.attorney,
    authority_level: SIGNUP_AUTHORITY_LEVELS.operational,
    onboarding_path: SIGNUP_ONBOARDING_PATHS.attorneyOperational,
    workspace_action: SIGNUP_WORKSPACE_ACTIONS.joinOrRequestWorkspace,
  },
  bond_owner: {
    app_role: APP_ROLES.bondOriginator,
    workspace_type: WORKSPACE_TYPES.bondOriginator,
    intended_org_role: ORG_ROLES.owner,
    authority_level: SIGNUP_AUTHORITY_LEVELS.ownerManagement,
    onboarding_path: SIGNUP_ONBOARDING_PATHS.bondOwner,
    workspace_action: SIGNUP_WORKSPACE_ACTIONS.createWorkspace,
  },
  bond_operational: {
    app_role: APP_ROLES.bondOriginator,
    workspace_type: WORKSPACE_TYPES.bondOriginator,
    intended_org_role: ORG_ROLES.consultant,
    authority_level: SIGNUP_AUTHORITY_LEVELS.operational,
    onboarding_path: SIGNUP_ONBOARDING_PATHS.bondOperational,
    workspace_action: SIGNUP_WORKSPACE_ACTIONS.joinOrRequestWorkspace,
  },
  client_invited: {
    app_role: APP_ROLES.client,
    workspace_type: null,
    intended_org_role: 'client',
    authority_level: SIGNUP_AUTHORITY_LEVELS.external,
    onboarding_path: SIGNUP_ONBOARDING_PATHS.clientInvited,
    workspace_action: SIGNUP_WORKSPACE_ACTIONS.acceptClientAccess,
  },
})
