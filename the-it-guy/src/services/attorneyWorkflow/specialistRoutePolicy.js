export const SPECIALIST_ROUTE_LABELS = Object.freeze({
  deceased_estate: 'Deceased estate',
  insolvency: 'Insolvency',
  court_order_divorce: 'Court order or divorce',
  unusual_title: 'Unusual title restriction or servitude',
  agricultural_land: 'Agricultural subdivision or undivided share',
  share_block: 'Share block or other instrument',
  other_exception: 'Other exceptional facts',
})

export const SPECIALIST_ROUTE_TASKS = Object.freeze({
  deceased_estate: 'estate_authority_transfer_review',
  insolvency: 'insolvency_authority_transfer_review',
  court_order_divorce: 'court_order_transfer_review',
  unusual_title: 'unusual_title_resolution_review',
  agricultural_land: 'agricultural_consent_review',
  share_block: 'share_block_instrument_review',
  other_exception: 'other_specialist_execution_review',
})

export const SPECIALIST_ROUTE_STATUSES = ['pending', 'hold', 'confirmed']
export const SPECIALIST_INSTRUMENTS = ['unknown', 'deeds_transfer', 'other_instrument']

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

export function specialistRouteFacts(profile = {}, context = {}) {
  return {
    propertyTenure: String(context.propertyTenure || ''),
    propertyConditions: context.propertyConditions || {},
    parties: (profile.parties || []).map(p => ({
      id: p.id, role: p.role, name: p.name, entityType: p.entityType,
      maritalRegime: p.maritalRegime, identityRoute: p.identityRoute,
      taxResidence: p.taxResidence, ownershipShare: p.ownershipShare,
      representatives: p.representatives || [],
    }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
    exceptions: [...(profile.exceptions || [])].sort(),
    activeRoutes: Object.entries(profile.specialistRoutes || {}).filter(([, route]) => route?.active)
      .map(([key]) => key).sort(),
  }
}

export function requiredSpecialistRouteKeys(profile = {}, propertyTenure = '') {
  const keys = new Set()
  for (const party of profile.parties || []) {
    if (party.entityType === 'estate') keys.add('deceased_estate')
    if (party.entityType === 'insolvency') keys.add('insolvency')
    if (['unknown', 'other'].includes(party.entityType) || (party.entityType === 'individual' && party.maritalRegime === 'other')) keys.add('other_exception')
  }
  if ((profile.exceptions || []).some(value => String(value).trim())) keys.add('other_exception')
  if (propertyTenure === 'share_block') keys.add('share_block')
  for (const [key, route] of Object.entries(profile.specialistRoutes || {})) {
    if (SPECIALIST_ROUTE_LABELS[key] && route?.active) keys.add(key)
  }
  return [...keys]
}

export function specialistRouteConfirmed(route = {}, profile = {}, context = {}) {
  const currentContext = {
    propertyTenure: context.propertyTenure === undefined ? route?.reviewedFacts?.propertyTenure : context.propertyTenure,
    propertyConditions: context.propertyConditions === undefined ? route?.reviewedFacts?.propertyConditions : context.propertyConditions,
  }
  return route.status === 'confirmed' && route.instrument === 'deeds_transfer' &&
    Boolean(route.owner?.trim() && route.reason?.trim() && route.evidenceReference?.trim() && route.reviewedBy && route.reviewedAt) &&
    stableJson(route.reviewedFacts) === stableJson(specialistRouteFacts(profile, currentContext))
}

export function applySpecialistRouteDecisions(previousProfile, proposedProfile, actor = {}) {
  const previous = previousProfile?.specialistRoutes || {}
  const next = { ...(proposedProfile.specialistRoutes || {}) }
  const automaticKeys = requiredSpecialistRouteKeys({ ...proposedProfile, specialistRoutes: {} }, actor.propertyTenure)
  for (const key of automaticKeys) {
    next[key] = { ...(next[key] || {}), active: true }
  }
  const facts = specialistRouteFacts(proposedProfile, actor)
  for (const [key, route] of Object.entries(next)) {
    if (!SPECIALIST_ROUTE_LABELS[key]) throw new Error('Unknown specialist route.')
    const prior = previous[key] || {}
    const normalized = {
      active: route?.active === true || automaticKeys.includes(key),
      status: SPECIALIST_ROUTE_STATUSES.includes(route?.status) ? route.status : 'pending',
      owner: String(route?.owner || 'Transfer attorney').trim(),
      reason: String(route?.reason || `${SPECIALIST_ROUTE_LABELS[key]} needs classification.`).trim(),
      instrument: SPECIALIST_INSTRUMENTS.includes(route?.instrument) ? route.instrument : 'unknown',
      evidenceReference: String(route?.evidenceReference || '').trim(),
      reviewedBy: String(route?.reviewedBy || ''), reviewedAt: String(route?.reviewedAt || ''),
      reviewedFacts: route?.reviewedFacts || null,
    }
    if (prior.active === true && !normalized.active && !actor.canReview) throw new Error('Only an attorney may remove a specialist hold.')
    const decisionChanged = normalized.status !== prior.status || normalized.instrument !== prior.instrument ||
      normalized.evidenceReference !== prior.evidenceReference || normalized.owner !== prior.owner || normalized.reason !== prior.reason
    if (decisionChanged && normalized.status !== 'pending' && !actor.canReview) throw new Error('Only an attorney may classify a specialist route.')
    if (normalized.status === 'confirmed') {
      if (!normalized.active || normalized.instrument === 'unknown' || !normalized.evidenceReference || !normalized.owner || !normalized.reason) {
        throw new Error(`${SPECIALIST_ROUTE_LABELS[key]}: record an owner, basis, instrument and specialist evidence.`)
      }
      if (!decisionChanged && stableJson(normalized.reviewedFacts) !== stableJson(facts)) {
        normalized.status = 'pending'
        normalized.reviewedBy = ''
        normalized.reviewedAt = ''
        normalized.reviewedFacts = null
      } else if (decisionChanged) {
        if (!actor.canReview) throw new Error('Only an attorney may confirm a specialist route.')
        normalized.reviewedBy = actor.userId
        normalized.reviewedAt = actor.now
        normalized.reviewedFacts = JSON.parse(JSON.stringify(facts))
      }
    } else if (normalized.status === 'hold') {
      if (!normalized.owner || !normalized.reason) throw new Error(`${SPECIALIST_ROUTE_LABELS[key]}: name a hold owner and reason.`)
      if (decisionChanged) {
        normalized.reviewedBy = actor.userId
        normalized.reviewedAt = actor.now
      }
      normalized.reviewedFacts = null
    } else {
      normalized.reviewedBy = ''
      normalized.reviewedAt = ''
      normalized.reviewedFacts = null
    }
    next[key] = normalized
  }
  return { ...proposedProfile, specialistRoutes: next }
}
