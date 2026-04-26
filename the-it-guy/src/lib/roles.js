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
    ...(SHOW_INTELLIGENCE_BETA ? [{ key: 'intelligence_beta', label: 'Intelligence (Beta)', to: '/intelligence' }] : []),
    { key: 'developments', label: 'Developments', to: '/developments' },
    { key: 'transactions', label: 'Transactions', to: '/units' },
    { key: 'clients', label: 'Clients', to: '/clients' },
    { key: 'pipeline', label: 'Pipeline', to: '/pipeline' },
    { key: 'documents', label: 'Documents', to: '/documents' },
    { key: 'snags', label: 'Snags', to: '/snags' },
    { key: 'reports', label: 'Reports', to: '/reports' },
  ],
  agent: [
    { key: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { key: 'transactions', label: 'Transactions', to: '/units' },
    { key: 'clients', label: 'Clients', to: '/clients' },
    { key: 'new_transaction', label: 'New Transaction', to: '/new-transaction' },
    { key: 'documents', label: 'Documents', to: '/documents' },
  ],
  attorney: [
    { key: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    ...(SHOW_INTELLIGENCE_BETA ? [{ key: 'intelligence_beta', label: 'Intelligence (Beta)', to: '/intelligence' }] : []),
    { key: 'transactions', label: 'Transactions', to: '/transactions' },
    { key: 'developments', label: 'Developments', to: '/developments' },
    { key: 'clients', label: 'Clients', to: '/clients' },
    { key: 'financials', label: 'Financials', to: '/financials' },
    { key: 'reports', label: 'Reports', to: '/reports' },
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
