// Scenario facts are retained independently for each party. Unknown is not No.
export const PARTY_TYPES = ['unknown', 'individual', 'company', 'trust', 'close_corporation', 'estate', 'other']
export const MARITAL_REGIMES = ['unknown', 'single', 'in_community', 'out_of_community', 'customary', 'foreign', 'other']
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
  const fields = { name: 'Name', entityType: 'Legal type / identity and authority requirements', maritalRegime: 'Marital capacity / signing review', ownershipShare: 'Ownership share / transfer details' }
  for (const p of next.parties) {
    const old = previous.parties.find(item => item.id === p.id)
    const label = p.name || p.id
    if (!old) { changes.push(`${label}: party added; identity and authority requirements need review.`); continue }
    for (const [field, description] of Object.entries(fields)) {
      if (p[field] !== old[field]) changes.push(`${label}: ${description}: ${old[field] ?? 'unknown'} → ${p[field] ?? 'unknown'}.`)
    }
    if (JSON.stringify(p.representatives) !== JSON.stringify(old.representatives)) changes.push(`${label}: representatives changed; signing authority needs review.`)
  }
  for (const p of previous.parties) if (!next.parties.some(item => item.id === p.id)) changes.push(`${p.name || p.id}: removed from scenario; existing party records and history are retained.`)
  if (JSON.stringify(previous.exceptions) !== JSON.stringify(next.exceptions)) changes.push('Exceptional circumstances changed; attorney applicability review needed.')
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
      representatives: Array.isArray(p.representatives) ? p.representatives.map(r => ({ id: String(r.id || ''), name: String(r.name || ''), capacity: String(r.capacity || '') })) : [],
      source: p.source || 'matter_profile',
    })),
    exceptions: Array.isArray(saved?.exceptions) ? [...new Set(saved.exceptions.map(String))].sort() : [],
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
    if (p.entityType === 'individual' && p.maritalRegime === 'unknown') issues.push(`${p.id}: marital capacity is unknown.`)
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
  return issues
}
export function scenarioFingerprint(profile) {
  return JSON.stringify({ ...profile, parties: [...profile.parties].sort((a,b) => a.id.localeCompare(b.id)).map(p => ({ ...p, representatives: [...p.representatives].sort((a,b) => a.id.localeCompare(b.id)) })) })
}
