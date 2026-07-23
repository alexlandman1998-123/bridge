import { SHOW_INTELLIGENCE_BETA } from './featureFlags'
import { canAccessHQ } from '../auth/hqAccess'
import {
  APP_ROLE_LABELS,
  APP_ROLES,
  DEFAULT_APP_ROLE,
  INTERNAL_APP_ROLES,
  isInternalAppRole,
  normalizeAppRole,
} from './appRoleMetadata'

export {
  APP_ROLE_LABELS,
  APP_ROLES,
  DEFAULT_APP_ROLE,
  INTERNAL_APP_ROLES,
  isInternalAppRole,
  normalizeAppRole,
}

const HQ_NAV_ITEM = Object.freeze({ key: 'mission_control', label: '⌘ Mission Control', to: '/command-center', navSection: 'secondary' })

function withHQNavItem(items = [], context = {}) {
  if (!canAccessHQ(context)) return items
  if (items.some((item) => item.key === HQ_NAV_ITEM.key)) return items
  return [...items, HQ_NAV_ITEM]
}

export const APP_ROLE_MODULE_COPY = {
  developer: {
    title: 'Developer Dashboard',
    subtitle: 'Portfolio and transaction pipeline',
  },
  agent: {
    title: 'Agent Dashboard',
    subtitle: 'Active deals and buyer progress',
  },
  attorney: {
    title: 'Conveyancer Dashboard',
    subtitle: 'Active matters and transfer progress',
  },
  bond_originator: {
    title: 'Bond Originator',
    subtitle: 'Applications, documents and finance progress',
  },
  viewer: {
    title: 'Workspace Access Pending',
    subtitle: 'Waiting for membership activation',
  },
  platform_admin: {
    title: 'Platform Admin',
    subtitle: 'Arch9 administration',
  },
}

export const APP_ROLE_ONBOARDING_OPTIONS = [
  { value: 'developer', label: APP_ROLE_LABELS.developer, description: 'Portfolio oversight, development performance, and pipeline control.' },
  { value: 'agent', label: APP_ROLE_LABELS.agent, description: 'Buyer onboarding, transaction setup, and deal coordination.' },
  { value: 'attorney', label: APP_ROLE_LABELS.attorney, description: 'Conveyancing workflow, legal documentation, and transfer milestones.' },
  { value: 'bond_originator', label: APP_ROLE_LABELS.bond_originator, description: 'Finance pipeline, lender updates, and bond document management.' },
]

function createAgentPipelineNav() {
  return {
    key: 'agency_pipeline',
    label: 'Pipeline',
    to: '/pipeline/leads',
    activeMatch: ['/pipeline', '/pipeline/leads', '/pipeline/canvassing', '/pipeline/calendar', '/calendar'],
    children: [
      { key: 'pipeline_leads', label: 'Leads', to: '/pipeline/leads' },
      { key: 'pipeline_canvassing', label: 'Canvassing', to: '/pipeline/canvassing' },
      { key: 'pipeline_calendar', label: 'Calendar', to: '/pipeline/calendar', activeMatch: ['/pipeline/calendar', '/calendar'] },
    ],
  }
}

export const APP_NAV_BY_ROLE = {
  developer: [
    { key: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { key: 'developments', label: 'Developments', to: '/developments' },
    { key: 'developer_partners', label: 'Partners', to: '/developer/partners', activeMatch: ['/developer/partners'] },
    { key: 'transactions', label: 'Transactions', to: '/units' },
    { key: 'developer_pipeline', label: 'Pipeline', to: '/pipeline' },
    { key: 'developer_snags', label: 'Snags', to: '/snags' },
    { key: 'clients', label: 'Clients', to: '/clients' },
    { key: 'reports', label: 'Reports', to: '/reports' },
    ...(SHOW_INTELLIGENCE_BETA
      ? [
          {
            key: 'intelligence_beta',
            label: 'Intelligence (Beta)',
            to: '/developer/intelligence/dashboard',
            children: [
              { key: 'dev_intelligence_dashboard', label: 'Dashboard', to: '/developer/intelligence/dashboard' },
              { key: 'dev_intelligence_opportunity', label: 'Opportunity Engine', to: '/developer/intelligence/opportunity' },
              { key: 'dev_intelligence_feasibility', label: 'Feasibility Tool', to: '/developer/intelligence/feasibility' },
              { key: 'dev_intelligence_market_demand', label: 'Market Demand', to: '/developer/intelligence/market-demand' },
              { key: 'dev_intelligence_pricing', label: 'Pricing Simulator', to: '/developer/intelligence/pricing' },
              { key: 'dev_intelligence_portfolio', label: 'Portfolio Performance', to: '/developer/intelligence/portfolio' },
              { key: 'dev_intelligence_growth', label: 'Growth Network', to: '/developer/intelligence/growth' },
            ],
          },
        ]
      : []),
  ],
  agent: [
    { key: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { key: 'transactions', label: 'Transactions', to: '/transactions' },
    createAgentPipelineNav(),
    {
      key: 'listings',
      label: 'Listings',
      to: '/listings',
      activeMatch: ['/listings', '/agent/listings'],
    },
    { key: 'clients', label: 'Clients', to: '/clients' },
    { key: 'partners', label: 'Partners', to: '/partners' },
    { key: 'reports', label: 'Reports', to: '/reports' },
    ...(SHOW_INTELLIGENCE_BETA
      ? [
          {
            key: 'intelligence_beta',
            label: 'Intelligence (Beta)',
            to: '/agent/intelligence/overview',
            children: [
              { key: 'agent_intelligence_overview', label: 'Overview', to: '/agent/intelligence/overview' },
              { key: 'agent_intelligence_opportunities', label: 'Opportunities', to: '/agent/intelligence/opportunities' },
              { key: 'agent_intelligence_market', label: 'Market', to: '/agent/intelligence/market' },
              { key: 'agent_intelligence_pricing', label: 'Pricing', to: '/agent/intelligence/pricing' },
              { key: 'agent_intelligence_pipeline', label: 'Pipeline', to: '/agent/intelligence/pipeline' },
              { key: 'agent_intelligence_performance', label: 'Performance', to: '/agent/intelligence/performance' },
              { key: 'agent_intelligence_network', label: 'Network', to: '/agent/intelligence/network' },
            ],
          },
        ]
      : []),
  ],
  attorney: [
    { key: 'dashboard', label: 'Dashboard', to: '/attorney/dashboard' },
    {
      key: 'attorney_matters',
      label: 'Matters',
      to: '/attorney/matters/all',
      activeMatch: [
        '/transactions',
        '/attorney/matters/registered',
        '/attorney/matters/archived',
        '/attorney/matters/delayed',
        '/attorney/matters/development',
        '/attorney/transactions/all',
        '/attorney/transactions/transfer',
        '/attorney/transactions/bond',
        '/attorney/transactions/cancellation',
        '/attorney/transactions/registered',
        '/attorney/transactions/archived',
        '/attorney/transactions/delayed',
        '/attorney/transactions/development',
      ],
      children: [
        { key: 'attorney_matters_all', label: 'All Matters', to: '/attorney/matters/all' },
        { key: 'attorney_matters_transfer', label: 'Transfer Matters', to: '/attorney/matters/transfer' },
        { key: 'attorney_matters_bond', label: 'Bond Matters', to: '/attorney/matters/bond' },
        { key: 'attorney_matters_cancellation', label: 'Cancellation Matters', to: '/attorney/matters/cancellation' },
      ],
    },
    {
      key: 'attorney_pipeline',
      label: 'Pipeline',
      to: '/attorney/matters/active',
      activeMatch: ['/attorney/pipeline', '/attorney/matters/active', '/attorney/transactions/active', '/attorney/leads'],
      children: [
        { key: 'attorney_incoming_matters', label: 'Incoming Matters', to: '/attorney/matters/active' },
        { key: 'attorney_leads', label: 'Leads', to: '/attorney/leads' },
      ],
    },
    { key: 'scheduling', label: 'Calendar', to: '/attorney/scheduling' },
    { key: 'clients', label: 'Clients & Parties', to: '/clients' },
    { key: 'partners', label: 'Partners', to: '/partners' },
    {
      key: 'attorney_firm',
      label: 'Firm',
      to: '/users?tab=users',
      activeMatch: ['/users', '/financials'],
      children: [
        { key: 'attorney_firm_branches', label: 'Branches', to: '/users?tab=branches' },
        { key: 'attorney_firm_users', label: 'Users', to: '/users?tab=users' },
        { key: 'attorney_firm_finance', label: 'Finance', to: '/financials' },
      ],
    },
    ...(SHOW_INTELLIGENCE_BETA
      ? [
          {
            key: 'intelligence_beta',
            label: 'Intelligence (Beta)',
            to: '/attorney/intelligence/dashboard',
            children: [
              { key: 'intelligence_dashboard', label: 'Dashboard', to: '/attorney/intelligence/dashboard' },
              { key: 'intelligence_opportunity_engine', label: 'Opportunity Engine', to: '/attorney/intelligence/opportunity-engine' },
              { key: 'intelligence_partner_intelligence', label: 'Partner Intelligence', to: '/attorney/intelligence/partner-intelligence' },
              { key: 'intelligence_market_position', label: 'Market Position', to: '/attorney/intelligence/market-position' },
              { key: 'intelligence_revenue_forecast', label: 'Revenue Forecast', to: '/attorney/intelligence/revenue-forecast' },
            ],
          },
        ]
      : []),
  ],
  bond_originator: [
    { key: 'dashboard', label: 'Dashboard', to: '/dashboard', navSection: 'main' },
    { key: 'bond_applications', label: 'Applications', to: '/bond/applications?view=incoming', navSection: 'main', activeMatch: ['/bond/pipeline', '/bond/applications', '/bond/transactions', '/bond/files', '/transactions', '/applications'] },
    { key: 'partners', label: 'Partners', to: '/bond/partners', navSection: 'main', activeMatch: ['/bond/partners', '/partners', '/bond/partner-intelligence', '/bond/organisation/partners'] },
    { key: 'clients', label: 'Clients', to: '/bond/clients', navSection: 'main', activeMatch: ['/bond/clients', '/clients'] },
    { key: 'bond_developments', label: 'Developments', to: '/bond/developments?view=current', navSection: 'main', activeMatch: ['/bond/developments'] },
    { key: 'tasks', label: 'Tasks', to: '/bond/tasks', navSection: 'main', activeMatch: ['/bond/tasks'] },
    { key: 'revenue_commissions', label: 'Commissions & Reconciliation', to: '/bond/revenue', navSection: 'main', activeMatch: ['/bond/revenue'] },
    { key: 'bond_organisation', label: 'Team', to: '/bond/organisation?view=consultants', navSection: 'main', activeMatch: ['/bond/organisation', '/bond/hq-command-centre', '/bond/branch-operations', '/bond/regional-operations', '/bond/consultant-performance'] },
    { key: 'bank_relationships', label: 'Banks', to: '/bond/banks', navSection: 'main', activeMatch: ['/bond/banks'] },
    { key: 'settings', label: 'Settings', to: '/settings', navSection: 'secondary' },
  ],
  client: [
    { key: 'dashboard', label: 'Overview', to: '/dashboard' },
    { key: 'buyer_information', label: 'Buyer Information', to: '/buyer-information' },
    { key: 'transactions', label: 'Transaction Progress', to: '/transactions' },
    { key: 'documents', label: 'Documents', to: '/documents' },
    { key: 'handover', label: 'Handover', to: '/handover' },
    { key: 'client_snags', label: 'Snags', to: '/snags' },
  ],
  viewer: [
    { key: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { key: 'settings', label: 'Settings', to: '/settings' },
  ],
  platform_admin: [
    { key: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { key: 'platform_demo_enquiries', label: 'Demo Enquiries', to: '/platform/demo-enquiries' },
    { key: 'platform_diagnostics', label: 'Diagnostics', to: '/platform/diagnostics' },
    { key: 'platform_transaction_routing', label: 'Routing Rollout', to: '/platform/transaction-routing-rollout' },
    { key: 'audit_logs', label: 'Audit Logs', to: '/attorney/audit-logs' },
    { key: 'settings', label: 'Settings', to: '/settings' },
  ],
}

export function getRoleModuleCopy(role) {
  return APP_ROLE_MODULE_COPY[normalizeAppRole(role)] || APP_ROLE_MODULE_COPY.developer
}

export function getNavItemsForRole(role) {
  return APP_NAV_BY_ROLE[normalizeAppRole(role)] || APP_NAV_BY_ROLE.developer
}

const AGENT_LEADERSHIP_KEYWORDS = ['principal', 'headquarters', 'hq', 'admin', 'branch manager', 'office manager']
const MANAGEMENT_MEMBERSHIP_ROLES = new Set(['super_admin', 'principal', 'admin', 'branch_manager'])
const SUPPORT_MEMBERSHIP_ROLES = new Set(['assistant', 'transaction_coordinator', 'listing_coordinator', 'admin_coordinator', 'admin_staff'])
const BOND_HQ_ROLES = new Set(['owner', 'principal', 'director', 'partner', 'hq_manager', 'manager', 'admin', 'admin_staff', 'bond_hq_admin', 'bond_hq_manager', 'national_manager', 'bond_national_manager', 'finance_manager', 'bond_finance_manager', 'finance', 'cfo', 'operations_manager', 'bond_operations_manager'])
const BOND_REGIONAL_ROLES = new Set(['regional_manager', 'bond_regional_manager'])
const BOND_BRANCH_ROLES = new Set(['branch_manager', 'bond_branch_manager', 'team_lead', 'bond_team_lead'])
const BOND_CONSULTANT_ROLES = new Set(['bond_originator', 'consultant', 'bond_consultant', 'processor', 'bond_processor'])
const BOND_INDEPENDENT_ROLES = new Set(['bond_independent_consultant', 'independent_consultant', 'independent_originator'])

const BOND_APPLICATIONS_ACTIVE_MATCH = ['/bond/pipeline', '/bond/applications', '/bond/transactions', '/bond/files', '/transactions', '/applications']
const BOND_DEVELOPMENTS_ACTIVE_MATCH = ['/bond/developments']
const BOND_ORGANISATION_ACTIVE_MATCH = [
  '/bond/organisation',
  '/bond/hq-command-centre',
  '/bond/branch-operations',
  '/bond/regional-operations',
  '/bond/consultant-performance',
]
const BOND_SETTINGS_ACTIVE_MATCH = ['/settings', '/bond/automation']

function createBondApplicationsNav() {
  return {
    key: 'bond_applications',
    label: 'Applications',
    to: '/bond/applications?view=incoming',
    navSection: 'main',
    activeMatch: BOND_APPLICATIONS_ACTIVE_MATCH,
  }
}

function createBondPartnersNav() {
  return {
    key: 'partners',
    label: 'Partners',
    to: '/bond/partners',
    navSection: 'main',
    activeMatch: ['/bond/partners', '/partners', '/bond/partner-intelligence', '/bond/organisation/partners'],
  }
}

function createBondClientsNav() {
  return {
    key: 'clients',
    label: 'Clients',
    to: '/bond/clients',
    navSection: 'main',
    activeMatch: ['/bond/clients', '/clients'],
  }
}

function createBondTasksNav() {
  return {
    key: 'tasks',
    label: 'Tasks',
    to: '/bond/tasks',
    navSection: 'main',
    activeMatch: ['/bond/tasks'],
  }
}

function createBondCommissionsNav({ ownOnly = false } = {}) {
  return {
    key: 'revenue_commissions',
    label: ownOnly ? 'My Commissions' : 'Commissions & Reconciliation',
    to: '/bond/revenue',
    navSection: 'main',
    activeMatch: ['/bond/revenue'],
  }
}

function createBondTeamNav({ defaultView = 'consultants' } = {}) {
  return {
    key: 'bond_organisation',
    label: 'Team',
    to: `/bond/organisation?view=${defaultView}`,
    navSection: 'main',
    activeMatch: BOND_ORGANISATION_ACTIVE_MATCH,
  }
}

function createBondDevelopmentsNav() {
  return {
    key: 'bond_developments',
    label: 'Developments',
    to: '/bond/developments?view=current',
    navSection: 'main',
    activeMatch: BOND_DEVELOPMENTS_ACTIVE_MATCH,
    children: [
      { key: 'bond_developments_current', label: 'Current Developments', to: '/bond/developments?view=current' },
      { key: 'bond_developments_developers', label: 'Developers', to: '/bond/developments?view=developers' },
    ],
  }
}

function createBondSettingsNav() {
  return {
    key: 'settings',
    label: 'Settings',
    to: '/settings',
    navSection: 'secondary',
    activeMatch: BOND_SETTINGS_ACTIVE_MATCH,
  }
}

function normalizeMembershipRole(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'viewer'
  if (normalized === 'owner') return 'principal'
  if (normalized === 'superadmin') return 'super_admin'
  if (normalized === 'administrator') return 'admin'
  if (normalized === 'branch manager') return 'branch_manager'
  if (normalized === 'branch_admin') return 'branch_manager'
  if (normalized === 'principal / owner') return 'principal'
  if (normalized === 'personal_assistant' || normalized === 'personal assistant' || normalized === 'pa') return 'assistant'
  if (normalized === 'transaction coordinator') return 'transaction_coordinator'
  if (normalized === 'listing coordinator' || normalized === 'marketing coordinator') return 'listing_coordinator'
  if (normalized === 'admin coordinator' || normalized === 'receptionist') return 'admin_coordinator'
  return normalized
}

function hasAgentLeadershipSignals(profile = null) {
  const profileSignals = [profile?.fullName, profile?.companyName, profile?.title, profile?.position, profile?.teamRole]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')

  return AGENT_LEADERSHIP_KEYWORDS.some((keyword) => profileSignals.includes(keyword))
}

export function canAccessAgentsModule({ role, baseRole = null, profile = null, membershipRole = null } = {}) {
  const normalizedRole = normalizeAppRole(role || baseRole || '')
  if (normalizedRole === 'developer') {
    return true
  }
  if (normalizedRole !== 'agent') {
    return false
  }
  const normalizedMembershipRole = normalizeMembershipRole(membershipRole)
  if (MANAGEMENT_MEMBERSHIP_ROLES.has(normalizedMembershipRole)) {
    return true
  }
  return hasAgentLeadershipSignals(profile)
}

export function canManageAgentOrganisations({ role, baseRole = null, profile = null, membershipRole = null } = {}) {
  const normalizedRole = normalizeAppRole(role || baseRole || '')
  if (normalizedRole === 'developer') {
    return true
  }
  if (normalizedRole !== 'agent') {
    return false
  }
  const normalizedMembershipRole = normalizeMembershipRole(membershipRole)
  if (MANAGEMENT_MEMBERSHIP_ROLES.has(normalizedMembershipRole)) {
    return true
  }
  return hasAgentLeadershipSignals(profile)
}

export function getRoleNavItems(role, { baseRole = null, profile = null, membershipRole = null, currentMembership = null } = {}) {
  const items = getNavItemsForRole(role)
  const hqContext = { profile, membershipRole, currentMembership }
  const normalizedRole = normalizeAppRole(role || baseRole || '')
  if (normalizedRole === 'bond_originator') {
    const normalizedMembershipRole = normalizeMembershipRole(membershipRole || profile?.workspaceRole || profile?.workspace_role || profile?.organisationRole || profile?.organisation_role)
    const workspaceKind = String(profile?.workspaceKind || profile?.workspace_kind || profile?.currentWorkspace?.workspace_kind || '').trim().toLowerCase()
    const independent = workspaceKind === 'personal_originator' || BOND_INDEPENDENT_ROLES.has(normalizedMembershipRole)

    if (independent) {
      return withHQNavItem([
        { key: 'dashboard', label: 'Dashboard', to: '/dashboard', navSection: 'main' },
        { key: 'bond_applications', label: 'Applications', to: '/bond/applications?scope=mine&view=incoming', navSection: 'main', activeMatch: BOND_APPLICATIONS_ACTIVE_MATCH },
        createBondPartnersNav(),
        createBondClientsNav(),
        createBondDevelopmentsNav(),
        createBondTasksNav(),
        createBondCommissionsNav({ ownOnly: true }),
        { key: 'settings', label: 'Settings', to: '/settings', navSection: 'secondary' },
      ], hqContext)
    }

    if (BOND_HQ_ROLES.has(normalizedMembershipRole)) {
      return withHQNavItem([
        { key: 'dashboard', label: 'Dashboard', to: '/dashboard', navSection: 'main' },
        createBondApplicationsNav(),
        createBondPartnersNav(),
        createBondClientsNav(),
        createBondDevelopmentsNav(),
        createBondTasksNav(),
        createBondCommissionsNav(),
        createBondTeamNav({ defaultView: 'consultants' }),
        { key: 'bank_relationships', label: 'Banks', to: '/bond/banks', navSection: 'main', activeMatch: ['/bond/banks'] },
        createBondSettingsNav(),
      ], hqContext)
    }

    if (BOND_REGIONAL_ROLES.has(normalizedMembershipRole)) {
      return withHQNavItem([
        { key: 'dashboard', label: 'Dashboard', to: '/dashboard', navSection: 'main' },
        createBondApplicationsNav(),
        createBondPartnersNav(),
        createBondClientsNav(),
        createBondDevelopmentsNav(),
        createBondTasksNav(),
        createBondCommissionsNav(),
        createBondTeamNav({ defaultView: 'consultants' }),
        { key: 'bank_relationships', label: 'Banks', to: '/bond/banks', navSection: 'main', activeMatch: ['/bond/banks'] },
        createBondSettingsNav(),
      ], hqContext)
    }

    if (BOND_BRANCH_ROLES.has(normalizedMembershipRole)) {
      return withHQNavItem([
        { key: 'dashboard', label: 'Dashboard', to: '/dashboard', navSection: 'main' },
        createBondApplicationsNav(),
        createBondPartnersNav(),
        createBondClientsNav(),
        createBondDevelopmentsNav(),
        createBondTasksNav(),
        createBondCommissionsNav(),
        createBondTeamNav({ defaultView: 'consultants' }),
        { key: 'bank_relationships', label: 'Banks', to: '/bond/banks', navSection: 'main', activeMatch: ['/bond/banks'] },
        createBondSettingsNav(),
      ], hqContext)
    }

    if (BOND_CONSULTANT_ROLES.has(normalizedMembershipRole) || !normalizedMembershipRole || normalizedMembershipRole === 'viewer') {
      return withHQNavItem([
        { key: 'dashboard', label: 'Dashboard', to: '/dashboard', navSection: 'main' },
        { key: 'bond_applications', label: 'Applications', to: '/bond/applications?scope=mine&view=incoming', navSection: 'main', activeMatch: BOND_APPLICATIONS_ACTIVE_MATCH },
        createBondPartnersNav(),
        createBondClientsNav(),
        createBondDevelopmentsNav(),
        createBondTasksNav(),
        createBondCommissionsNav({ ownOnly: true }),
      ], hqContext)
    }

    return withHQNavItem(items, hqContext)
  }

  if (normalizedRole !== 'agent') {
    return withHQNavItem(items, hqContext)
  }

  const normalizedMembershipRole = normalizeMembershipRole(membershipRole || profile?.workspaceRole || profile?.workspace_role || profile?.organisationRole || profile?.organisation_role)
  if (SUPPORT_MEMBERSHIP_ROLES.has(normalizedMembershipRole)) {
    return withHQNavItem([
      { key: 'assistant_dashboard', label: 'Dashboard', to: '/assistant/dashboard' },
      { key: 'assistant_listings', label: 'Listings', to: '/listings', activeMatch: ['/listings', '/agent/listings'] },
      { key: 'assistant_transactions', label: 'Transactions', to: '/transactions' },
      { key: 'assistant_calendar', label: 'Calendar', to: '/pipeline/calendar', activeMatch: ['/pipeline/calendar', '/calendar'] },
      { key: 'assistant_documents', label: 'Documents', to: '/documents' },
      { key: 'assistant_clients', label: 'Clients', to: '/clients' },
    ], hqContext)
  }

  const canManageOrganisation = canManageAgentOrganisations({ role, baseRole, profile, membershipRole })
  if (!canManageOrganisation) {
    return withHQNavItem(items, hqContext)
  }
  const isBranchManager = normalizedMembershipRole === 'branch_manager'

  return withHQNavItem([
    { key: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { key: 'transactions', label: 'Transactions', to: '/transactions' },
    createAgentPipelineNav(),
    {
      key: 'listings',
      label: 'Listings',
      to: '/listings',
      activeMatch: ['/listings', '/agent/listings'],
    },
    {
      key: 'agency',
      label: 'Organisation',
      to: '/agency/branches',
      activeMatch: ['/agency', '/partners', '/settings/legal-templates'],
      children: [
        { key: 'agency_branches', label: 'Branches', to: '/agency/branches' },
        ...(!isBranchManager
          ? [
              { key: 'agency_agents', label: 'Agents', to: '/agency/agents' },
              { key: 'partners', label: 'Partners', to: '/partners' },
              { key: 'agency_legal_templates', label: 'Legal Templates', to: '/settings/legal-templates' },
            ]
          : []),
      ],
    },
    { key: 'clients', label: 'Clients', to: '/clients' },
    { key: 'reports', label: 'Reports', to: '/reports' },
  ], hqContext)

}
