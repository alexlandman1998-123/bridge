import { ORG_ROLES } from './orgRoles'

export const PARTNER_ROUTING_SOURCE_TYPES = Object.freeze({
  organisation: 'organisation',
  region: 'region',
  branch: 'branch',
  team: 'team',
  development: 'development',
  agent: 'agent',
  user: 'user',
})

export const PARTNER_ROUTING_TARGET_TYPES = Object.freeze({
  orgQueue: 'organisation_queue',
  region: 'region',
  branch: 'branch',
  team: 'team',
  consultant: 'consultant',
})

export const PARTNER_ROUTING_MODES = Object.freeze({
  directConsultant: 'direct_consultant',
  directAttorney: 'direct_attorney',
  directAgent: 'direct_agent',
  branchQueue: 'branch_queue',
  teamQueue: 'team_queue',
  organisationQueue: 'organisation_queue',
  manual: 'manual',
  fallbackQueue: 'fallback_queue',
  roundRobin: 'round_robin',
})

export const PARTNER_ROUTING_ROLE_TYPES = Object.freeze({
  agent: 'agent',
  bondOriginator: 'bond_originator',
  transferAttorney: 'transfer_attorney',
  bondAttorney: 'bond_attorney',
  cancellationAttorney: 'cancellation_attorney',
  developer: 'developer',
  developerContact: 'developer_contact',
})

export const PARTNER_ROUTING_ROLE_TYPE_OPTIONS = Object.freeze([
  { value: PARTNER_ROUTING_ROLE_TYPES.bondOriginator, label: 'Bond Originator' },
  { value: PARTNER_ROUTING_ROLE_TYPES.transferAttorney, label: 'Transfer Attorney' },
  { value: PARTNER_ROUTING_ROLE_TYPES.bondAttorney, label: 'Bond Attorney' },
  { value: PARTNER_ROUTING_ROLE_TYPES.cancellationAttorney, label: 'Cancellation Attorney' },
  { value: PARTNER_ROUTING_ROLE_TYPES.agent, label: 'Agent' },
  { value: PARTNER_ROUTING_ROLE_TYPES.developer, label: 'Developer' },
  { value: PARTNER_ROUTING_ROLE_TYPES.developerContact, label: 'Developer Contact' },
])

export const PARTNER_ROUTING_ASSIGNMENT_SEQUENCE = Object.freeze([
  'manual',
  'development',
  'agent',
  'branch',
  'team',
  'organisation',
  'fallback',
])

export const PARTNER_ROUTING_SOURCE_SCOPES = Object.freeze({
  organisation: 'organisation',
  branch: 'branch',
  team: 'team',
  agent: 'agent',
  development: 'development',
  user: 'user',
})

export const PARTNER_ROUTING_ORGANISATION_ADMIN_ROLES = Object.freeze([ORG_ROLES.owner, ORG_ROLES.principal, ORG_ROLES.director, ORG_ROLES.partner, ORG_ROLES.manager, ORG_ROLES.adminStaff, ORG_ROLES.branchManager])

export const PARTNER_ROUTING_HQ_MANAGER_ROLES = Object.freeze([ORG_ROLES.hqManager, ORG_ROLES.regionalManager, ORG_ROLES.teamLead])

export const PARTNER_ROUTING_BRANCH_MANAGER_ROLES = Object.freeze([ORG_ROLES.branchManager, ORG_ROLES.manager])

export const PARTNER_ROUTING_BUSINESS_MODEL = Object.freeze({
  partnerScope: 'organisation_to_organisation_network',
  assignmentScope: 'file_to_consultant_or_team',
  canCreateAgentOverrides: true,
  canCreateDevelopmentOverrides: true,
})

export function isPartnerRoutingOrgAdminRole(role = '') {
  const normalized = String(role || '').trim().toLowerCase()
  return PARTNER_ROUTING_ORGANISATION_ADMIN_ROLES.includes(normalized)
}

export function isPartnerRoutingBranchManagerRole(role = '') {
  const normalized = String(role || '').trim().toLowerCase()
  return PARTNER_ROUTING_BRANCH_MANAGER_ROLES.includes(normalized)
}

export function isPartnerRoutingHqManagerRole(role = '') {
  const normalized = String(role || '').trim().toLowerCase()
  return PARTNER_ROUTING_HQ_MANAGER_ROLES.includes(normalized)
}
