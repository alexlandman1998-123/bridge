// Scenario facts are retained independently for each party. Unknown is not No.
import { applySpecialistRouteDecisions, requiredSpecialistRouteKeys, specialistRouteConfirmed, SPECIALIST_ROUTE_LABELS } from './attorneyWorkflow/specialistRoutePolicy.js'
export const PARTY_TYPES = ['unknown', 'individual', 'company', 'trust', 'close_corporation', 'estate', 'insolvency', 'other']
export const MARITAL_REGIMES = ['unknown', 'single', 'in_community', 'out_of_community', 'customary', 'foreign', 'other']
export const IDENTITY_ROUTES = ['unknown', 'sa_id', 'foreign_passport']
export const TAX_RESIDENCES = ['unknown', 'south_africa', 'outside_south_africa']
export const PARTY_CAPACITY_STATUSES = ['pending', 'cleared', 'hold']

export function partyCapacityCheckRequirements(party = {}) {
  const checks = [
    { key: 'identity_fica', label: 'Identity / FICA evidence reviewed' },
    { key: 'tax_residence', label: 'Tax residence confirmed' },
  ]
  if (party.entityType === 'individual') {
    checks.push({ key: 'marital_capacity', label: 'Marital capacity and signing route resolved' })
    if (party.maritalRegime === 'in_community') checks.push({ key: 'spouse_consent', label: 'Spouse consent / assistance reviewed' })
    if (party.maritalRegime === 'foreign') checks.push({ key: 'foreign_law', label: 'Foreign-law marital consequences reviewed' })
    if (party.identityRoute === 'foreign_passport' && party.role === 'buyer') checks.push({ key: 'foreign_tax_entry', label: 'Passport and SARS purchaser tax entry checked' })
  }
  if (['company', 'close_corporation'].includes(party.entityType)) {
    checks.push({ key: 'registration', label: 'CIPC registration and members / directors reviewed' })
    checks.push({ key: 'beneficial_ownership', label: 'Beneficial owners identified and reviewed' })
    checks.push({ key: 'resolution', label: 'Entity resolution and authority reviewed' })
    checks.push({ key: 'signatories', label: 'Every named signatory and capacity reviewed' })
  }
  if (party.entityType === 'trust') {
    checks.push({ key: 'trust_deed', label: 'Trust deed reviewed' })
    checks.push({ key: 'letters_of_authority', label: 'Master’s letters of authority reviewed' })
    checks.push({ key: 'beneficial_ownership', label: 'Trust beneficial owners identified and reviewed' })
    checks.push({ key: 'resolution', label: 'Trustee resolution and authority reviewed' })
    checks.push({ key: 'signatories', label: 'Every named trustee signatory and capacity reviewed' })
  }
  return checks
}

export function partyCapacityFacts(party = {}) {
  return {
    id: String(party.id || ''), role: party.role, name: String(party.name || ''),
    entityType: party.entityType, maritalRegime: party.maritalRegime,
    ownershipShare: party.ownershipShare,
    identityRoute: party.identityRoute,
    taxResidence: party.taxResidence,
    representatives: (party.representatives || []).map(r => ({ id: r.id, name: r.name, capacity: r.capacity })),
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export function prepopulateMatterScenarioProfile({ saved, legacy = {}, participants = [], transaction = {} } = {}) {
  // Saved attorney facts win. Opening the editor must not silently overwrite
  // reviewed facts with a later contact/onboarding response.
  if (Array.isArray(saved?.parties)) return resolveMatterScenarioProfile(saved)
  const parties = []
  for (const role of ['buyer', 'seller']) {
    const records = participants.filter(p => p && p.stakeholderStatus !== 'removed' &&
      (p.roleType || p.role_type) === role)
    if (!records.length) {
      parties.push({ id: `${role}-primary`, role, name: transaction[`${role}_name`] || '',
        entityType: legacy[`${role}EntityType`] || 'unknown', maritalRegime: legacy[`${role}MaritalRegime`] || 'unknown', source: 'transaction' })
    }
    records.forEach((p, index) => parties.push({
      id: `${role}:${p.participantId || p.participant_id || p.id || `unlinked-${index}`}`,
      role, name: p.participantName || p.participant_name || p.name || '',
      entityType: p.entityType || p.entity_type || (records.length === 1 ? legacy[`${role}EntityType`] : 'unknown'),
      maritalRegime: p.maritalRegime || p.marital_regime || (records.length === 1 ? legacy[`${role}MaritalRegime`] : 'unknown'),
      ownershipShare: p.ownershipShare ?? p.ownership_share ?? null,
      representatives: p.representatives || [], source: 'transaction_participant',
    }))
  }
  return resolveMatterScenarioProfile({ parties })
}

export function describeScenarioChanges(before, after) {
  const previous = resolveMatterScenarioProfile(before)
  const next = resolveMatterScenarioProfile(after)
  const changes = []
  const fields = { name: 'Name', entityType: 'Legal type / identity and authority requirements', maritalRegime: 'Marital capacity / signing review', ownershipShare: 'Ownership share / transfer details', identityRoute: 'Identity document route', taxResidence: 'Tax residence' }
  for (const p of next.parties) {
    const old = previous.parties.find(item => item.id === p.id)
    const label = p.name || p.id
    if (!old) { changes.push(`${label}: party added; identity and authority requirements need review.`); continue }
    for (const [field, description] of Object.entries(fields)) {
      if (p[field] !== old[field]) changes.push(`${label}: ${description}: ${old[field] ?? 'unknown'} → ${p[field] ?? 'unknown'}.`)
    }
    if (JSON.stringify(p.representatives) !== JSON.stringify(old.representatives)) changes.push(`${label}: representatives changed; signing authority needs review.`)
    if (p.capacityReview.status !== old.capacityReview.status) changes.push(`${label}: capacity decision changed to ${p.capacityReview.status}.`)
  }
  for (const p of previous.parties) if (!next.parties.some(item => item.id === p.id)) changes.push(`${p.name || p.id}: removed from scenario; existing party records and history are retained.`)
  if (JSON.stringify(previous.exceptions) !== JSON.stringify(next.exceptions)) changes.push('Exceptional circumstances changed; attorney applicability review needed.')
  if (JSON.stringify(previous.specialistRoutes) !== JSON.stringify(next.specialistRoutes)) changes.push('Specialist route classification changed; task applicability and readiness need review.')
  return changes
}
export function resolveMatterScenarioProfile(saved, legacy = {}) {
  const parties = Array.isArray(saved?.parties) ? saved.parties : ['buyer', 'seller'].map(role => ({
    id: `${role}-primary`, role, entityType: legacy[`${role}EntityType`] || 'unknown',
    maritalRegime: legacy[`${role}MaritalRegime`] || 'unknown', source: 'legacy_profile',
  }))
  return {
    version: 'matter_scenario_v1',
    parties: parties.map(p => ({
      id: String(p.id || ''), role: p.role, name: String(p.name || ''),
      entityType: PARTY_TYPES.includes(p.entityType) ? p.entityType : 'unknown',
      maritalRegime: MARITAL_REGIMES.includes(p.maritalRegime) ? p.maritalRegime : 'unknown',
      ownershipShare: p.ownershipShare === '' || p.ownershipShare == null ? null : Number(p.ownershipShare),
      identityRoute: IDENTITY_ROUTES.includes(p.identityRoute) ? p.identityRoute : 'unknown',
      taxResidence: TAX_RESIDENCES.includes(p.taxResidence) ? p.taxResidence : 'unknown',
      representatives: Array.isArray(p.representatives) ? p.representatives.map(r => ({ id: String(r.id || ''), name: String(r.name || ''), capacity: String(r.capacity || '') })) : [],
      capacityReview: {
        status: PARTY_CAPACITY_STATUSES.includes(p.capacityReview?.status) ? p.capacityReview.status : 'pending',
        note: String(p.capacityReview?.note || ''),
        confirmations: p.capacityReview?.confirmations && typeof p.capacityReview.confirmations === 'object'
          ? Object.fromEntries(Object.entries(p.capacityReview.confirmations).map(([key, value]) => [key, value === true])) : {},
        reviewedBy: String(p.capacityReview?.reviewedBy || ''),
        reviewedAt: String(p.capacityReview?.reviewedAt || ''),
        reviewedFacts: p.capacityReview?.reviewedFacts || null,
      },
      source: p.source || 'matter_profile',
    })),
    exceptions: Array.isArray(saved?.exceptions) ? [...new Set(saved.exceptions.map(String))].sort() : [],
    specialistRoutes: Object.fromEntries(Object.entries(saved?.specialistRoutes || {})
      .filter(([key]) => SPECIALIST_ROUTE_LABELS[key]).map(([key, route]) => [key, {
        active: route?.active === true,
        status: ['pending', 'hold', 'confirmed'].includes(route?.status) ? route.status : 'pending',
        owner: String(route?.owner || 'Transfer attorney'),
        reason: String(route?.reason || `${SPECIALIST_ROUTE_LABELS[key]} needs classification.`),
        instrument: ['unknown', 'deeds_transfer', 'other_instrument'].includes(route?.instrument) ? route.instrument : 'unknown',
        evidenceReference: String(route?.evidenceReference || ''),
        reviewedBy: String(route?.reviewedBy || ''), reviewedAt: String(route?.reviewedAt || ''),
        reviewedFacts: route?.reviewedFacts || null,
      }])),
  }
}
export function scenarioIssues(profile) {
  const issues = []
  const ids = new Set()
  for (const p of profile.parties) {
    if (!p.id || ids.has(p.id)) issues.push('Party identifiers must be unique.')
    ids.add(p.id)
    if (!['buyer', 'seller'].includes(p.role)) issues.push(`${p.id}: choose buyer or seller.`)
    if (!p.name.trim()) issues.push(`${p.id}: party name needs confirmation.`)
    if (p.entityType === 'unknown') issues.push(`${p.id}: legal type is unknown.`)
    if (['estate', 'insolvency', 'other'].includes(p.entityType)) {
      const key = p.entityType === 'estate' ? 'deceased_estate' : p.entityType === 'insolvency' ? 'insolvency' : 'other_exception'
      if (!specialistRouteConfirmed(profile.specialistRoutes?.[key], profile))
        issues.push(`${p.id}: specialist capacity route requires an attorney hold and review.`)
    }
    if (p.entityType === 'individual' && p.maritalRegime === 'unknown') issues.push(`${p.id}: marital capacity is unknown.`)
    if (p.entityType === 'individual' && p.maritalRegime === 'other' &&
      !specialistRouteConfirmed(profile.specialistRoutes?.other_exception, profile))
      issues.push(`${p.id}: exceptional marital capacity needs a specialist review.`)
    if (p.entityType !== 'individual' && p.entityType !== 'unknown' && !p.representatives.length) issues.push(`${p.id}: authorised representative needs confirmation.`)
    if (p.ownershipShare == null) issues.push(`${p.id}: ownership share is unknown.`)
    else if (!Number.isFinite(p.ownershipShare) || p.ownershipShare <= 0 || p.ownershipShare > 100) issues.push(`${p.id}: ownership share must be greater than 0 and at most 100.`)
    if (p.representatives.some(r => !r.name.trim() || !r.capacity.trim())) issues.push(`${p.id}: representative name and capacity are required.`)
  }
  for (const role of ['buyer', 'seller']) {
    const group = profile.parties.filter(p => p.role === role)
    if (!group.length) issues.push(`Add at least one ${role}.`)
    if (group.length && group.every(p => p.ownershipShare != null) && Math.abs(group.reduce((n,p) => n + p.ownershipShare, 0) - 100) > 0.001) issues.push(`${role}: ownership shares must total 100%.`)
  }
  for (const key of requiredSpecialistRouteKeys(profile)) {
    const route = profile.specialistRoutes?.[key]
    if (!specialistRouteConfirmed(route, profile)) issues.push(`${SPECIALIST_ROUTE_LABELS[key]}: ordinary deeds lodgement is on hold; ${route?.owner || 'transfer attorney'} owns the route.`)
  }
  return issues
}
export function scenarioFingerprint(profile) {
  return JSON.stringify({ ...profile, parties: [...profile.parties].sort((a,b) => a.id.localeCompare(b.id)).map(p => {
    const facts = { ...p }
    delete facts.capacityReview
    return { ...facts, representatives: [...p.representatives].sort((a,b) => a.id.localeCompare(b.id)) }
  }) })
}

export function partyCapacityReviewReady(party) {
  const review = party?.capacityReview || {}
  return ['individual', 'company', 'close_corporation', 'trust'].includes(party?.entityType) &&
    party?.taxResidence !== 'unknown' &&
    (party?.entityType !== 'individual' || (party?.identityRoute !== 'unknown' && !['unknown', 'other'].includes(party?.maritalRegime))) &&
    (party?.entityType === 'individual' || (party?.representatives?.length > 0 && party.representatives.every(r => r.name?.trim() && r.capacity?.trim()))) &&
    partyCapacityCheckRequirements(party).every(check => review.confirmations?.[check.key] === true) &&
    review.status === 'cleared' && Boolean(review.reviewedBy && review.reviewedAt && review.note?.trim()) &&
    stableJson(review.reviewedFacts) === stableJson(partyCapacityFacts(party))
}

export function applyPartyCapacityDecisions(previousProfile, proposedProfile, actor = {}) {
  const previous = resolveMatterScenarioProfile(previousProfile)
  let proposed = resolveMatterScenarioProfile(proposedProfile)
  proposed = applySpecialistRouteDecisions(previous, proposed, actor)
  return {
    ...proposed,
    parties: proposed.parties.map(party => {
      const prior = previous.parties.find(item => item.id === party.id)
      const priorReview = prior?.capacityReview || { status: 'pending' }
      const requested = party.capacityReview
      const factsUnchanged = prior && JSON.stringify(partyCapacityFacts(prior)) === JSON.stringify(partyCapacityFacts(party))
      if (factsUnchanged && requested.status === priorReview.status && priorReview.status === 'cleared' && partyCapacityReviewReady(prior)) {
        return { ...party, capacityReview: priorReview }
      }
      if (!actor.canReview && requested.status !== priorReview.status) {
        throw new Error('Only an attorney may decide party capacity.')
      }
      if (!actor.canReview && requested.status === 'hold') {
        if (requested.note !== priorReview.note) throw new Error('Only an attorney may change a capacity hold.')
        return { ...party, capacityReview: priorReview }
      }
      if (factsUnchanged && requested.status === 'hold' && requested.note === priorReview.note) {
        return { ...party, capacityReview: priorReview }
      }
      if (requested.status === 'cleared' && actor.canReview && priorReview.status !== 'cleared') {
        if (!requested.note.trim()) throw new Error(`${party.name || party.id}: record the capacity and signing authority basis.`)
        if (['unknown', 'estate', 'insolvency', 'other'].includes(party.entityType)) throw new Error(`${party.name || party.id}: specialist capacity needs a hold and review.`)
        const reviewed = { ...party, capacityReview: { status: 'cleared', note: requested.note, confirmations: requested.confirmations, reviewedBy: actor.userId, reviewedAt: actor.now, reviewedFacts: partyCapacityFacts(party) } }
        if (!partyCapacityReviewReady(reviewed)) throw new Error(`${party.name || party.id}: confirm identity, tax residence, marital capacity and every signatory before clearing.`)
        return reviewed
      }
      if (requested.status === 'hold') {
        if (!requested.note.trim()) throw new Error(`${party.name || party.id}: record the hold reason.`)
        return { ...party, capacityReview: { status: 'hold', note: requested.note, confirmations: requested.confirmations, reviewedBy: actor.userId, reviewedAt: actor.now, reviewedFacts: null } }
      }
      return { ...party, capacityReview: {
        status: 'pending', note: actor.canReview ? requested.note : priorReview.note || '',
        confirmations: actor.canReview ? requested.confirmations : factsUnchanged ? priorReview.confirmations || {} : {},
        reviewedBy: '', reviewedAt: '', reviewedFacts: null,
      } }
    }),
  }
}
