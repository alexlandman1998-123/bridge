import { SHOW_INTELLIGENCE_BETA } from './featureFlags'

export const APP_ROLES = ['developer', 'agent', 'attorney', 'bond_originator', 'client']
export const INTERNAL_APP_ROLES = ['developer', 'agent', 'attorney', 'bond_originator', 'client']
export const DEFAULT_APP_ROLE = 'developer'

export const APP_ROLE_LABELS = {
  developer: 'Developer',
  agent: 'Agent',
  attorney: 'Attorney / Conveyancer',
  bond_originator: 'Bond Originator',
  client: 'Client / Buyer',
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
    { key: 'transactions', label: 'Deals', to: '/deals' },
    { key: 'pipeline', label: 'Pipeline', to: '/pipeline' },
    { key: 'listings', label: 'Listings', to: '/listings' },
    { key: 'agents', label: 'Agents', to: '/agents' },
    { key: 'clients', label: 'Clients', to: '/clients' },
    { key: 'documents', label: 'Documents', to: '/documents' },
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
    { key: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { key: 'transactions', label: 'Transactions', to: '/transactions' },
    { key: 'developments', label: 'Developments', to: '/developments' },
    { key: 'clients', label: 'Clients', to: '/clients' },
    { key: 'financials', label: 'Financials', to: '/financials' },
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
    { key: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { key: 'developments', label: 'Developments', to: '/developments' },
    { key: 'applications', label: 'Applications', to: '/applications' },
    { key: 'clients', label: 'Clients', to: '/clients' },
    { key: 'documents', label: 'Documents', to: '/documents' },
    { key: 'reports', label: 'Reports', to: '/reports' },
  ],
  client: [
    { key: 'dashboard', label: 'Overview', to: '/dashboard' },
    { key: 'buyer_information', label: 'Buyer Information', to: '/buyer-information' },
    { key: 'transactions', label: 'Transaction Progress', to: '/transactions' },
    { key: 'documents', label: 'Documents', to: '/documents' },
    { key: 'handover', label: 'Handover', to: '/handover' },
    { key: 'snags', label: 'Snags', to: '/snags' },
  ],
}

export function normalizeAppRole(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  return APP_ROLES.includes(normalized) ? normalized : DEFAULT_APP_ROLE
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
const AGENT_LEADERSHIP_EMAIL_ALLOWLIST = new Set(['alexlandman1998@gmail.com'])

function hasAgentLeadershipSignals(profile = null) {
  const email = String(profile?.email || '').trim().toLowerCase()
  if (email && AGENT_LEADERSHIP_EMAIL_ALLOWLIST.has(email)) {
    return true
  }

  const profileSignals = [profile?.fullName, profile?.companyName, profile?.title, profile?.position, profile?.teamRole]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')

  return AGENT_LEADERSHIP_KEYWORDS.some((keyword) => profileSignals.includes(keyword))
}

export function canAccessAgentsModule({ role, baseRole = null } = {}) {
  const normalizedRole = normalizeAppRole(role || baseRole || '')
  if (normalizedRole === 'developer' || normalizedRole === 'internal_admin') {
    return true
  }
  return normalizedRole === 'agent'
}

export function canManageAgentOrganisations({ role, baseRole = null, profile = null } = {}) {
  const normalizedRole = normalizeAppRole(role || baseRole || '')
  if (normalizedRole === 'developer' || normalizedRole === 'internal_admin') {
    return true
  }
  if (normalizedRole !== 'agent') {
    return false
  }
  return hasAgentLeadershipSignals(profile)
}

export function getRoleNavItems(role, { baseRole = null, profile = null } = {}) {
  const items = getNavItemsForRole(role)
  if (normalizeAppRole(role || baseRole || '') !== 'agent') {
    return items
  }

  const hasAgentsAccess = canAccessAgentsModule({ role, baseRole, profile })
  return items.filter((item) => (item.key === 'agents' ? hasAgentsAccess : true))
}
