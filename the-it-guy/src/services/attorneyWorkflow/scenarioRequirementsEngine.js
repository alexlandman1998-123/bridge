import { resolveMatterScenarioProfile, scenarioIssues } from '../matterScenarioProfile.js'

export const SCENARIO_REQUIREMENTS_VERSION = 'scenario_requirements_v1'

// Adapt the existing catalogue, rather than inventing a second legal checklist.
// Flags here mean "at least one party" and must only be used to select the
// catalogue union. Each selected requirement retains its own party scope below.
export function resolveScenarioRequirementFacts(facts = {}) {
  if (!facts.scenarioProfile) return facts
  const scenarioProfile = resolveMatterScenarioProfile(facts.scenarioProfile)
  const result = { ...facts, scenarioProfile }
  for (const role of ['buyer', 'seller']) {
    for (const type of ['individual', 'company', 'trust']) {
      result[`${role}Is${type[0].toUpperCase()}${type.slice(1)}`] = scenarioProfile.parties.some(p => p.role === role && p.entityType === type)
    }
  }
  result.confidenceWarnings = [...new Set([
    ...(facts.confidenceWarnings || []), ...scenarioIssues(scenarioProfile),
    ...scenarioProfile.parties.filter(p => !['individual', 'company', 'trust'].includes(p.entityType))
      .map(p => `${p.id}: ${p.entityType} requires an attorney applicability review; no substitute entity checklist has been assumed.`),
    ...scenarioProfile.exceptions.filter(Boolean).map(note => `Exceptional circumstance requires review: ${note}`),
  ])]
  return result
}

export function scopeScenarioRequirements(requirements, facts = {}) {
  return requirements.map(requirement => {
    const role = requirement.appliesTo || requirement.requiredFrom || requirement.signerType?.split('_')[0]
    const entityType = requirement.entityType || (requirement.signerType && /trustee/.test(requirement.id) ? 'trust' : requirement.signerType && /director/.test(requirement.id) ? 'company' : null)
    const parties = (facts.scenarioProfile?.parties || []).filter(p => p.role === role && (!entityType || p.entityType === entityType))
    return {
      ...requirement,
      scenarioRuleVersion: SCENARIO_REQUIREMENTS_VERSION,
      applicability: {
        ruleId: `attorney_catalogue:${requirement.id}`,
        entityType,
        concerns: ['buyer', 'seller'].includes(role) ? role : requirement.appliesTo || 'transaction',
        reason: requirement.reason || requirement.description || requirement.label,
        satisfiedBy: requirement.signerType ? 'Verified signature of the applicable authorised signatory' : requirement.reviewRequired === false ? 'Linked evidence received' : 'Linked evidence reviewed and approved',
        approvalRole: requirement.attorneyRole || 'transfer_attorney',
        // This is explanation metadata, not a permission grant or approval.
        requiresPartyReview: Boolean(facts.scenarioProfile && ['buyer', 'seller'].includes(role)),
      },
      ...(!facts.scenarioProfile || !['buyer', 'seller'].includes(role) ? {} : {
      partyRequirements: parties.map(p => ({
        // Stable scope keys do not themselves mark anyone's evidence approved.
        key: `${requirement.id}:${p.id}`, partyId: p.id, role: p.role,
        entityType: p.entityType, maritalRegime: p.entityType === 'individual' ? p.maritalRegime : null,
        representativeIds: p.representatives.map(r => r.id),
        reason: `${requirement.label}: applies to ${p.name || p.id} (${p.entityType}).`,
      })),
      }),
    }
  })
}
