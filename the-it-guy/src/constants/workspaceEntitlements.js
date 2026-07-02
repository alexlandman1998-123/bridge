import { WORKSPACE_KINDS, WORKSPACE_TYPES } from './workspaceTypes'

export const WORKSPACE_PLAN_KEYS = Object.freeze({
  freeTrial: 'free_trial',
  solo: 'solo',
  team: 'team',
  business: 'business',
  enterprise: 'enterprise',
})

export const WORKSPACE_SUBSCRIPTION_STATUSES = Object.freeze({
  trialing: 'trialing',
  active: 'active',
  pastDue: 'past_due',
  paused: 'paused',
  canceled: 'canceled',
})

export const ENTITLEMENT_KEYS = Object.freeze({
  maxUsers: 'maxUsers',
  maxBranches: 'maxBranches',
  monthlyBondApplications: 'monthlyBondApplications',
  reportingLevel: 'reportingLevel',
  integrations: 'integrations',
  customBranding: 'customBranding',
  apiAccess: 'apiAccess',
  whiteLabel: 'whiteLabel',
  supportLevel: 'supportLevel',
})

export const REPORTING_LEVELS = Object.freeze({
  basic: 'basic',
  advanced: 'advanced',
  enterprise: 'enterprise',
})

export const SUPPORT_LEVELS = Object.freeze({
  selfServe: 'self_serve',
  standard: 'standard',
  priority: 'priority',
  dedicated: 'dedicated',
})

export const WORKSPACE_PLAN_CATALOG = Object.freeze({
  [WORKSPACE_PLAN_KEYS.freeTrial]: Object.freeze({
    key: WORKSPACE_PLAN_KEYS.freeTrial,
    name: 'Free Trial',
    description: 'Starter trial for validating the workspace before billing is activated.',
    monthlyAmount: 0,
    entitlements: Object.freeze({
      [ENTITLEMENT_KEYS.maxUsers]: null,
      [ENTITLEMENT_KEYS.maxBranches]: null,
      [ENTITLEMENT_KEYS.monthlyBondApplications]: null,
      [ENTITLEMENT_KEYS.reportingLevel]: REPORTING_LEVELS.enterprise,
      [ENTITLEMENT_KEYS.integrations]: true,
      [ENTITLEMENT_KEYS.customBranding]: true,
      [ENTITLEMENT_KEYS.apiAccess]: true,
      [ENTITLEMENT_KEYS.whiteLabel]: true,
      [ENTITLEMENT_KEYS.supportLevel]: SUPPORT_LEVELS.dedicated,
    }),
  }),
  [WORKSPACE_PLAN_KEYS.solo]: Object.freeze({
    key: WORKSPACE_PLAN_KEYS.solo,
    name: 'Solo',
    description: 'For independent originators and single-operator professional workspaces.',
    monthlyAmount: 490,
    entitlements: Object.freeze({
      [ENTITLEMENT_KEYS.maxUsers]: 1,
      [ENTITLEMENT_KEYS.maxBranches]: null,
      [ENTITLEMENT_KEYS.monthlyBondApplications]: 75,
      [ENTITLEMENT_KEYS.reportingLevel]: REPORTING_LEVELS.basic,
      [ENTITLEMENT_KEYS.integrations]: false,
      [ENTITLEMENT_KEYS.customBranding]: true,
      [ENTITLEMENT_KEYS.apiAccess]: false,
      [ENTITLEMENT_KEYS.whiteLabel]: false,
      [ENTITLEMENT_KEYS.supportLevel]: SUPPORT_LEVELS.standard,
    }),
  }),
  [WORKSPACE_PLAN_KEYS.team]: Object.freeze({
    key: WORKSPACE_PLAN_KEYS.team,
    name: 'Team',
    description: 'For small originator teams with shared pipeline operations.',
    monthlyAmount: 1490,
    entitlements: Object.freeze({
      [ENTITLEMENT_KEYS.maxUsers]: 8,
      [ENTITLEMENT_KEYS.maxBranches]: null,
      [ENTITLEMENT_KEYS.monthlyBondApplications]: 250,
      [ENTITLEMENT_KEYS.reportingLevel]: REPORTING_LEVELS.advanced,
      [ENTITLEMENT_KEYS.integrations]: true,
      [ENTITLEMENT_KEYS.customBranding]: true,
      [ENTITLEMENT_KEYS.apiAccess]: false,
      [ENTITLEMENT_KEYS.whiteLabel]: false,
      [ENTITLEMENT_KEYS.supportLevel]: SUPPORT_LEVELS.standard,
    }),
  }),
  [WORKSPACE_PLAN_KEYS.business]: Object.freeze({
    key: WORKSPACE_PLAN_KEYS.business,
    name: 'Business',
    description: 'For multi-branch organisations with managers, processors, and reporting needs.',
    monthlyAmount: 3990,
    entitlements: Object.freeze({
      [ENTITLEMENT_KEYS.maxUsers]: 40,
      [ENTITLEMENT_KEYS.maxBranches]: null,
      [ENTITLEMENT_KEYS.monthlyBondApplications]: 1200,
      [ENTITLEMENT_KEYS.reportingLevel]: REPORTING_LEVELS.advanced,
      [ENTITLEMENT_KEYS.integrations]: true,
      [ENTITLEMENT_KEYS.customBranding]: true,
      [ENTITLEMENT_KEYS.apiAccess]: true,
      [ENTITLEMENT_KEYS.whiteLabel]: false,
      [ENTITLEMENT_KEYS.supportLevel]: SUPPORT_LEVELS.priority,
    }),
  }),
  [WORKSPACE_PLAN_KEYS.enterprise]: Object.freeze({
    key: WORKSPACE_PLAN_KEYS.enterprise,
    name: 'Enterprise',
    description: 'For national originators with custom limits, integrations, and service levels.',
    monthlyAmount: null,
    entitlements: Object.freeze({
      [ENTITLEMENT_KEYS.maxUsers]: null,
      [ENTITLEMENT_KEYS.maxBranches]: null,
      [ENTITLEMENT_KEYS.monthlyBondApplications]: null,
      [ENTITLEMENT_KEYS.reportingLevel]: REPORTING_LEVELS.enterprise,
      [ENTITLEMENT_KEYS.integrations]: true,
      [ENTITLEMENT_KEYS.customBranding]: true,
      [ENTITLEMENT_KEYS.apiAccess]: true,
      [ENTITLEMENT_KEYS.whiteLabel]: true,
      [ENTITLEMENT_KEYS.supportLevel]: SUPPORT_LEVELS.dedicated,
    }),
  }),
})

export function normalizePlanKey(value, fallback = WORKSPACE_PLAN_KEYS.freeTrial) {
  const normalized = String(value || '').trim().toLowerCase()
  return WORKSPACE_PLAN_CATALOG[normalized] ? normalized : fallback
}

export function getWorkspacePlanDefinition(planKey) {
  return WORKSPACE_PLAN_CATALOG[normalizePlanKey(planKey)]
}

export function resolveDefaultWorkspacePlanKey({ workspaceType = '', workspaceKind = '' } = {}) {
  const type = String(workspaceType || '').trim().toLowerCase()
  const kind = String(workspaceKind || '').trim().toLowerCase()
  if (type === WORKSPACE_TYPES.bondOriginator && kind === WORKSPACE_KINDS.personalOriginator) return WORKSPACE_PLAN_KEYS.solo
  if (type === WORKSPACE_TYPES.bondOriginator && kind === WORKSPACE_KINDS.bondCompany) return WORKSPACE_PLAN_KEYS.team
  return WORKSPACE_PLAN_KEYS.freeTrial
}

export function mergeEntitlements(base = {}, override = {}) {
  return {
    ...(base || {}),
    ...(override || {}),
  }
}

export function formatEntitlementValue(value) {
  if (value === null || value === undefined || value === '') return 'Unlimited'
  if (value === true) return 'Included'
  if (value === false) return 'Not included'
  return String(value).replace(/_/g, ' ')
}
