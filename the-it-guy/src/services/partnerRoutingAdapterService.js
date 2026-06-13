function normalizeText(value = '') {
  return String(value || '').trim()
}

function baseAdapterPayload(decision = {}, roleType = '', module = '') {
  return {
    roleType: normalizeText(roleType || decision.targetRoleType || ''),
    module: normalizeText(module || decision.module || ''),
    routingRuleId: normalizeText(decision.routingRuleId || ''),
    resolutionScope: normalizeText(decision.resolutionScope || ''),
    assignmentMode: normalizeText(decision.assignmentMode || ''),
    fallbackUsed: Boolean(decision.fallbackUsed),
    resolutionReason: normalizeText(decision.resolutionReason || decision.fallbackReason || ''),
    targetOrganisationId: normalizeText(decision.targetOrganisationId || ''),
    targetRegionId: normalizeText(decision.targetRegionId || ''),
    targetBranchId: normalizeText(decision.targetBranchId || ''),
    targetTeamId: normalizeText(decision.targetTeamId || ''),
    targetUserId: normalizeText(decision.targetUserId || ''),
  }
}

export function buildTransactionRolePlayerAdapter(decision = {}, roleType = '', extras = {}) {
  return {
    ...baseAdapterPayload(decision, roleType, extras.module),
    selectionSource: extras.selectionSource || 'partner_routing_rule',
    partnerOrganisationId: normalizeText(decision.targetOrganisationId || extras.partnerOrganisationId || ''),
    partnerRelationshipId: normalizeText(decision.relationshipId || extras.partnerRelationshipId || ''),
    organisationId: normalizeText(decision.targetOrganisationId || extras.partnerOrganisationId || ''),
    regionId: normalizeText(decision.targetRegionId || extras.regionId || ''),
    branchId: normalizeText(decision.targetBranchId || extras.branchId || ''),
    teamId: normalizeText(decision.targetTeamId || extras.teamId || ''),
    userId: normalizeText(decision.targetUserId || extras.userId || ''),
    assignmentStatus: decision.targetUserId ? 'assigned' : 'pending_assignment',
    snapshot: {
      source: 'partner_routing_rule',
      resolutionScope: normalizeText(decision.resolutionScope || ''),
      routingRuleId: normalizeText(decision.routingRuleId || ''),
      resolutionReason: normalizeText(decision.resolutionReason || decision.fallbackReason || ''),
      fallbackUsed: Boolean(decision.fallbackUsed),
    },
  }
}

export function buildBondAssignmentAdapter(decision = {}, extras = {}) {
  return {
    ...baseAdapterPayload(decision, extras.roleType || decision.targetRoleType || 'bond_originator', 'bond'),
    assignedOrganisationId: normalizeText(decision.targetOrganisationId || extras.assignedOrganisationId || ''),
    assignedRegionId: normalizeText(decision.targetRegionId || extras.assignedRegionId || ''),
    assignedBranchId: normalizeText(decision.targetBranchId || extras.assignedBranchId || ''),
    assignedTeamId: normalizeText(decision.targetTeamId || extras.assignedTeamId || ''),
    assignedUserId: normalizeText(decision.targetUserId || extras.assignedUserId || ''),
  }
}

export function buildAttorneyAssignmentAdapter(decision = {}, extras = {}) {
  return {
    ...baseAdapterPayload(decision, extras.roleType || decision.targetRoleType || 'transfer_attorney', 'attorney'),
    attorneyOrganisationId: normalizeText(decision.targetOrganisationId || extras.attorneyOrganisationId || ''),
    attorneyRegionId: normalizeText(decision.targetRegionId || extras.attorneyRegionId || ''),
    attorneyBranchId: normalizeText(decision.targetBranchId || extras.attorneyBranchId || ''),
    attorneyTeamId: normalizeText(decision.targetTeamId || extras.attorneyTeamId || ''),
    attorneyUserId: normalizeText(decision.targetUserId || extras.attorneyUserId || ''),
  }
}

export function buildAgentAssignmentAdapter(decision = {}, extras = {}) {
  return {
    ...baseAdapterPayload(decision, extras.roleType || decision.targetRoleType || 'agent', 'agent'),
    agentOrganisationId: normalizeText(decision.targetOrganisationId || extras.agentOrganisationId || ''),
    agentRegionId: normalizeText(decision.targetRegionId || extras.agentRegionId || ''),
    agentBranchId: normalizeText(decision.targetBranchId || extras.agentBranchId || ''),
    agentTeamId: normalizeText(decision.targetTeamId || extras.agentTeamId || ''),
    agentUserId: normalizeText(decision.targetUserId || extras.agentUserId || ''),
  }
}

export function compareRoutingDecisionSnapshots(legacyDecision = {}, universalDecision = {}) {
  const legacy = baseAdapterPayload(legacyDecision, legacyDecision.roleType || legacyDecision.targetRoleType || '', legacyDecision.module || '')
  const universal = baseAdapterPayload(universalDecision, universalDecision.roleType || universalDecision.targetRoleType || '', universalDecision.module || '')
  const differences = Object.entries(legacy).reduce((accumulator, [key, value]) => {
    if (value !== universal[key]) {
      accumulator[key] = { legacy: value, universal: universal[key] }
    }
    return accumulator
  }, {})
  return {
    status: Object.keys(differences).length ? 'mismatch' : 'match',
    differences,
    legacy,
    universal,
  }
}

