export const BUYER_PORTAL_CUTOVER_PHASE = 'phase7'

export const BUYER_PORTAL_CANONICAL_SURFACES = Object.freeze([
  'shell',
  'overview',
  'journey',
  'documents',
  'finance',
  'team',
])

const REQUIRED_MODEL_KEYS = Object.freeze(['journey', 'documents', 'finance', 'team'])

export function buildBuyerPortalCutoverReadiness({
  source = 'unknown',
  models = {},
  capabilities = {},
  developmentRequired = false,
} = {}) {
  const normalizedSource = String(source || 'unknown').trim().toLowerCase()
  const modelChecks = REQUIRED_MODEL_KEYS.map((modelKey) => Object.freeze({
    key: modelKey,
    ready: Boolean(models?.[modelKey] && models[modelKey].source === normalizedSource),
  }))
  const developmentChecks = developmentRequired
    ? [Object.freeze({
        key: 'developmentDelivery',
        ready: models?.developmentDelivery?.isDeveloperSale === true,
      })]
    : []
  const requiredCapabilities = normalizedSource === 'production'
    ? ['documentActions', 'financeActions', 'portalComments', 'contactActions']
    : ['documentSimulation', 'financeSimulation', 'contactActions']
  if (developmentRequired && normalizedSource === 'production') requiredCapabilities.push('developmentDeliveryActions')
  const capabilityChecks = requiredCapabilities.map((capabilityKey) => Object.freeze({
    key: capabilityKey,
    ready: capabilities?.[capabilityKey] === true,
  }))
  const checks = Object.freeze([...modelChecks, ...developmentChecks, ...capabilityChecks])
  const missing = Object.freeze(checks.filter((check) => !check.ready).map((check) => check.key))

  return Object.freeze({
    phase: BUYER_PORTAL_CUTOVER_PHASE,
    source: normalizedSource,
    surfaces: BUYER_PORTAL_CANONICAL_SURFACES,
    developmentRequired: Boolean(developmentRequired),
    checks,
    missing,
    ready: missing.length === 0,
    releaseLabel: missing.length === 0 ? 'aligned' : 'blocked',
  })
}
