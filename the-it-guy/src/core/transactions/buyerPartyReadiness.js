export const BUYER_PARTY_READINESS_VERSION = 'transaction_buyer_parties_phase6_v1'

const text = (value) => String(value ?? '').trim().toLowerCase()
const complete = (value) => ['completed', 'captured', 'manually_captured'].includes(text(value))
const active = (party) => !['removed', 'inactive', 'archived', 'deleted'].includes(text(party?.status)) && !party?.removed_at

export function buildBuyerPartyReadiness(parties = []) {
  const buyers = (Array.isArray(parties) ? parties : []).filter(active)
  const requiredSigners = buyers.filter((party) => party.signing_required !== false)
  const ownershipEntries = buyers.filter((party) => party.ownership_percentage !== null && party.ownership_percentage !== undefined && party.ownership_percentage !== '')
  const ownershipTotal = ownershipEntries.reduce((total, party) => total + Number(party.ownership_percentage || 0), 0)
  const issues = []
  if (!buyers.length) issues.push('Add at least one buyer party.')
  if (buyers.length && !buyers.some((party) => party.is_primary_buyer)) issues.push('Assign one buyer as primary.')
  if (ownershipEntries.length && ownershipEntries.length !== buyers.length) issues.push('Enter ownership for every active buyer, or leave ownership blank for all buyers.')
  if (ownershipEntries.length === buyers.length && Math.abs(ownershipTotal - 100) > 0.01) issues.push(`Buyer ownership must total 100% (currently ${ownershipTotal.toFixed(2)}%).`)
  const incompleteSigners = requiredSigners.filter((party) => !complete(party.buyer_onboarding_status))
  if (incompleteSigners.length) issues.push(`${incompleteSigners.length} required signer${incompleteSigners.length === 1 ? '' : 's'} still needs onboarding.`)
  const incompleteProfiles = buyers.filter((party) => !complete(party.buyer_profile_status))
  if (incompleteProfiles.length) issues.push(`${incompleteProfiles.length} buyer profile${incompleteProfiles.length === 1 ? '' : 's'} still needs FICA/profile capture.`)
  return Object.freeze({
    version: BUYER_PARTY_READINESS_VERSION,
    ready: issues.length === 0,
    activeBuyerCount: buyers.length,
    requiredSignerCount: requiredSigners.length,
    ownershipTotal: ownershipEntries.length ? ownershipTotal : null,
    ownershipComplete: ownershipEntries.length === buyers.length,
    completedSignerCount: requiredSigners.length - incompleteSigners.length,
    completedProfileCount: buyers.length - incompleteProfiles.length,
    issues: Object.freeze(issues),
  })
}
