import { SHOW_INTELLIGENCE_BETA } from './featureFlags'
import {
  DEFAULT_APP_ROLE,
  TRANSITIONAL_APP_ROLE_VALUES,
  normalizeCanonicalAppRole,
} from '../constants/appRoles'

export { DEFAULT_APP_ROLE }

export const APP_ROLES = TRANSITIONAL_APP_ROLE_VALUES
export const INTERNAL_APP_ROLES = TRANSITIONAL_APP_ROLE_VALUES

export const APP_ROLE_LABELS = {
  developer: 'Developer',
  agent: 'Agent',
  attorney: 'Attorney / Conveyancer',
  bond_originator: 'Bond Originator',
  client: 'Client / Buyer',
  platform_admin: 'Platform Admin',
  viewer: 'Viewer',
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
    subtitle: 'Bridge administration',
  },
}

export const APP_ROLE_ONBOARDING_OPTIONS = [
  { value: 'developer', label: APP_ROLE_LABELS.developer, description: 'Portfolio oversight, development performance, and pipeline control.' },
  { value: 'agent', label: APP_ROLE_LABELS.agent, description: 'Buyer onboarding, transaction setup, and deal coordination.' },
  { value: 'attorney', label: APP_ROLE_LABELS.attorney, description: 'Conveyancing workflow, legal documentation, and transfer milestones.' },
  { value: 'bond_originator', label: APP_ROLE_LABELS.bond_originator, description: 'Finance pipeline, lender updates, and bond document management.' },
]

export const APP_NAV_BY_ROLE = {
  developer: [
    { key: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { key: 'developments', label: 'Developments', to: '/developments' },
    { key: 'transactions', label: 'Transactions', to: '/units' },
    { key: 'clients', label: 'Clients', to: '/clients' },
    { key: 'pipeline', label: 'Pipeline', to: '/pipeline' },
    { key: 'documents', label: 'Documents', to: '/documents' },
    { key: 'partners', label: 'Partners', to: '/partners' },
    { key: 'snags', label: 'Snags', to: '/snags' },
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
    {
      key: 'pipeline',
      label: 'Pipeline',
      to: '/pipeline/leads',
      children: [
        { key: 'pipeline_leads', label: 'Leads', to: '/pipeline/leads' },
        { key: 'pipeline_canvassing', label: 'Canvassing', to: '/pipeline/canvassing' },
        { key: 'pipeline_calendar', label: 'Calendar', to: '/pipeline/calendar' },
      ],
    },
    {
      key: 'listings',
      label: 'Listings',
      to: '/listings',
      activeMatch: ['/listings', '/agent/listings'],
    },
    { key: 'clients', label: 'Clients', to: '/clients' },
    { key: 'documents', label: 'Documents', to: '/documents' },
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
      activeMatch: ['/transactions', '/attorney/matters'],
      children: [
        { key: 'attorney_matters_all', label: 'All Matters', to: '/attorney/matters/all' },
        { key: 'attorney_matters_transfer', label: 'Transfer Matters', to: '/attorney/matters/transfer' },
        { key: 'attorney_matters_bond', label: 'Bond Matters', to: '/attorney/matters/bond' },
        { key: 'attorney_matters_cancellation', label: 'Cancellation Matters', to: '/attorney/matters/cancellation' },
        { key: 'attorney_matters_registered', label: 'Registered Matters', to: '/attorney/matters/registered' },
        { key: 'attorney_matters_archived', label: 'Archived Matters', to: '/attorney/matters/archived' },
      ],
    },
    { key: 'attorney_workflow_board', label: 'Workflow', to: '/attorney/operations' },
    { key: 'scheduling', label: 'Calendar', to: '/attorney/scheduling' },
    { key: 'clients', label: 'Clients & Parties', to: '/clients' },
    { key: 'documents', label: 'Documents', to: '/documents' },
    { key: 'partners', label: 'Partners', to: '/partners' },
    { key: 'financials', label: 'Finance', to: '/financials' },
    { key: 'team_departments', label: 'Team', to: '/users' },
    { key: 'reports', label: 'Reports', to: '/reports' },
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
    { key: 'bond_pipeline', label: 'Pipeline', to: '/bond/pipeline', navSection: 'main', activeMatch: ['/bond/pipeline', '/applications'] },
    { key: 'applications', label: 'Applications', to: '/bond/applications', navSection: 'main', activeMatch: ['/bond/applications', '/bond/transactions', '/transactions'] },
    { key: 'bond_developments', label: 'Developments', to: '/bond/developments', navSection: 'main', activeMatch: ['/bond/developments', '/developments'] },
    { key: 'clients', label: 'Clients', to: '/bond/clients', navSection: 'main', activeMatch: ['/bond/clients', '/clients'] },
    { key: 'partners', label: 'Partners', to: '/bond/partners', navSection: 'main', activeMatch: ['/bond/partners', '/partners'] },
    { key: 'bond_reports', label: 'Reports', to: '/bond/reports', navSection: 'main', activeMatch: ['/bond/reports', '/reports'] },
    { key: 'bond_organisation', label: 'Organisation', to: '/bond/organisation', navSection: 'main', activeMatch: ['/bond/organisation'] },
    { key: 'settings', label: 'Settings', to: '/settings', navSection: 'secondary' },
  ],
  client: [
    { key: 'dashboard', label: 'Overview', to: '/dashboard' },
    { key: 'buyer_information', label: 'Buyer Information', to: '/buyer-information' },
    { key: 'transactions', label: 'Transaction Progress', to: '/transactions' },
    { key: 'documents', label: 'Documents', to: '/documents' },
    { key: 'handover', label: 'Handover', to: '/handover' },
    { key: 'snags', label: 'Snags', to: '/snags' },
  ],
  viewer: [
    { key: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { key: 'settings', label: 'Settings', to: '/settings' },
  ],
  platform_admin: [
    { key: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { key: 'platform_diagnostics', label: 'Diagnostics', to: '/platform/diagnostics' },
    { key: 'audit_logs', label: 'Audit Logs', to: '/attorney/audit-logs' },
    { key: 'settings', label: 'Settings', to: '/settings' },
  ],
}

export function normalizeAppRole(value) {
  return normalizeCanonicalAppRole(value, DEFAULT_APP_ROLE)
}

export function isInternalAppRole(value) {
  return INTERNAL_APP_ROLES.includes(normalizeAppRole(value))
}

export function getRoleModuleCopy(role) {
  return APP_ROLE_MODULE_COPY[normalizeAppRole(role)] || APP_ROLE_MODULE_COPY.developer
}

export function getNavItemsForRole(role) {
  return APP_NAV_BY_ROLE[normalizeAppRole(role)] || APP_NAV_BY_ROLE.developer
}

const AGENT_LEADERSHIP_KEYWORDS = ['principal', 'headquarters', 'hq', 'admin', 'branch manager', 'office manager']
const MANAGEMENT_MEMBERSHIP_ROLES = new Set(['super_admin', 'principal', 'admin', 'branch_manager'])
const BOND_HQ_ROLES = new Set(['owner', 'principal', 'director', 'partner', 'hq_manager', 'manager', 'admin', 'admin_staff', 'bond_hq_admin', 'bond_hq_manager'])
const BOND_REGIONAL_ROLES = new Set(['regional_manager', 'bond_regional_manager'])
const BOND_BRANCH_ROLES = new Set(['branch_manager', 'bond_branch_manager', 'team_lead', 'bond_team_lead'])
const BOND_CONSULTANT_ROLES = new Set(['bond_originator', 'consultant', 'bond_consultant', 'processor', 'bond_processor'])
const BOND_INDEPENDENT_ROLES = new Set(['bond_independent_consultant', 'independent_consultant', 'independent_originator'])

function normalizeMembershipRole(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'viewer'
  if (normalized === 'owner') return 'principal'
  if (normalized === 'superadmin') return 'super_admin'
  if (normalized === 'administrator') return 'admin'
  if (normalized === 'branch manager') return 'branch_manager'
  if (normalized === 'branch_admin') return 'branch_manager'
  if (normalized === 'principal / owner') return 'principal'
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

export function getRoleNavItems(role, { baseRole = null, profile = null, membershipRole = null } = {}) {
  const items = getNavItemsForRole(role)
  const normalizedRole = normalizeAppRole(role || baseRole || '')
  if (normalizedRole === 'bond_originator') {
    const normalizedMembershipRole = normalizeMembershipRole(membershipRole || profile?.workspaceRole || profile?.workspace_role || profile?.organisationRole || profile?.organisation_role)
    const workspaceKind = String(profile?.workspaceKind || profile?.workspace_kind || profile?.currentWorkspace?.workspace_kind || '').trim().toLowerCase()
    const independent = workspaceKind === 'personal_originator' || BOND_INDEPENDENT_ROLES.has(normalizedMembershipRole)

    if (independent) {
      return [
        { key: 'dashboard', label: 'Dashboard', to: '/dashboard', navSection: 'main' },
        { key: 'applications', label: 'My Applications', to: '/bond/applications?scope=mine', navSection: 'main', activeMatch: ['/bond/applications', '/bond/transactions', '/transactions'] },
        { key: 'clients', label: 'Clients', to: '/bond/clients', navSection: 'main', activeMatch: ['/bond/clients', '/clients'] },
        { key: 'tasks', label: 'Tasks', to: '/bond/tasks', navSection: 'main', activeMatch: ['/bond/tasks'] },
        { key: 'settings', label: 'Settings', to: '/settings', navSection: 'secondary' },
      ]
    }

    if (BOND_HQ_ROLES.has(normalizedMembershipRole)) {
      return [
        { key: 'dashboard', label: 'Dashboard', to: '/dashboard', navSection: 'main' },
        { key: 'bond_regions', label: 'Regions', to: '/bond/organisation?view=regions', navSection: 'main', activeMatch: ['/bond/organisation'] },
        { key: 'bond_branches', label: 'Branches', to: '/bond/organisation?view=branches', navSection: 'main', activeMatch: ['/bond/organisation'] },
        { key: 'bond_consultants', label: 'Consultants', to: '/bond/organisation?view=consultants', navSection: 'main', activeMatch: ['/bond/organisation'] },
        { key: 'applications', label: 'Applications', to: '/bond/applications', navSection: 'main', activeMatch: ['/bond/applications', '/bond/transactions', '/transactions'] },
        { key: 'partners', label: 'Partners', to: '/bond/partners', navSection: 'main', activeMatch: ['/bond/partners', '/partners'] },
        { key: 'bond_reports', label: 'Reports', to: '/bond/reports', navSection: 'main', activeMatch: ['/bond/reports', '/reports'] },
        { key: 'settings', label: 'Settings', to: '/settings', navSection: 'secondary' },
      ]
    }

    if (BOND_REGIONAL_ROLES.has(normalizedMembershipRole)) {
      return [
        { key: 'dashboard', label: 'Dashboard', to: '/dashboard', navSection: 'main' },
        { key: 'bond_branches', label: 'Branches', to: '/bond/organisation?view=branches', navSection: 'main', activeMatch: ['/bond/organisation'] },
        { key: 'bond_consultants', label: 'Consultants', to: '/bond/organisation?view=consultants', navSection: 'main', activeMatch: ['/bond/organisation'] },
        { key: 'applications', label: 'Applications', to: '/bond/applications', navSection: 'main', activeMatch: ['/bond/applications', '/bond/transactions', '/transactions'] },
        { key: 'partners', label: 'Partners', to: '/bond/partners', navSection: 'main', activeMatch: ['/bond/partners', '/partners'] },
        { key: 'bond_reports', label: 'Reports', to: '/bond/reports', navSection: 'main', activeMatch: ['/bond/reports', '/reports'] },
      ]
    }

    if (BOND_BRANCH_ROLES.has(normalizedMembershipRole)) {
      return [
        { key: 'dashboard', label: 'Dashboard', to: '/dashboard', navSection: 'main' },
        { key: 'bond_consultants', label: 'Consultants', to: '/bond/organisation?view=consultants', navSection: 'main', activeMatch: ['/bond/organisation'] },
        { key: 'applications', label: 'Applications', to: '/bond/applications', navSection: 'main', activeMatch: ['/bond/applications', '/bond/transactions', '/transactions'] },
        { key: 'partners', label: 'Partners', to: '/bond/partners', navSection: 'main', activeMatch: ['/bond/partners', '/partners'] },
      ]
    }

    if (BOND_CONSULTANT_ROLES.has(normalizedMembershipRole) || !normalizedMembershipRole || normalizedMembershipRole === 'viewer') {
      return [
        { key: 'dashboard', label: 'Dashboard', to: '/dashboard', navSection: 'main' },
        { key: 'applications', label: 'My Applications', to: '/bond/applications?scope=mine', navSection: 'main', activeMatch: ['/bond/applications', '/bond/transactions', '/transactions'] },
        { key: 'clients', label: 'Clients', to: '/bond/clients', navSection: 'main', activeMatch: ['/bond/clients', '/clients'] },
        { key: 'tasks', label: 'Tasks', to: '/bond/tasks', navSection: 'main', activeMatch: ['/bond/tasks'] },
      ]
    }

    return items
  }

  if (normalizedRole !== 'agent') {
    return items
  }

  const canManageOrganisation = canManageAgentOrganisations({ role, baseRole, profile, membershipRole })
  if (!canManageOrganisation) {
    return items
  }

  return [
    { key: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { key: 'transactions', label: 'Transactions', to: '/transactions' },
    {
      key: 'pipeline',
      label: 'Pipeline',
      to: '/pipeline/overview',
      children: [
        { key: 'pipeline_overview', label: 'Overview', to: '/pipeline/overview' },
        { key: 'pipeline_leads', label: 'Leads', to: '/pipeline/leads' },
        { key: 'pipeline_canvassing', label: 'Canvassing', to: '/pipeline/canvassing' },
        { key: 'pipeline_calendar', label: 'Calendar', to: '/pipeline/calendar' },
      ],
    },
    {
      key: 'listings',
      label: 'Listings',
      to: '/listings',
      activeMatch: ['/listings', '/agent/listings'],
    },
    {
      key: 'agency',
      label: 'Agency',
      to: '/agency/branches',
      activeMatch: ['/agency', '/agents/reporting'],
      children: [
        { key: 'agency_branches', label: 'Branches', to: '/agency/branches' },
        { key: 'agency_agents', label: 'Agents', to: '/agency/agents' },
        { key: 'agency_analytics', label: 'Analytics', to: '/agency/analytics' },
        { key: 'agents_reporting', label: 'Reports', to: '/agents/reporting' },
      ],
    },
    { key: 'clients', label: 'Clients', to: '/clients' },
    { key: 'documents', label: 'Documents', to: '/documents' },
    { key: 'partners', label: 'Partners', to: '/partners' },
    { key: 'reports', label: 'Reports', to: '/reports' },
  ]

}
