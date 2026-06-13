import { readAuditEvents } from '../lib/activityAudit'

const HEALTH_BUCKETS = Object.freeze({
  healthy: 'Healthy',
  watch: 'Watch',
  inactive: 'Inactive',
  dormant: 'Dormant',
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeNumber(value = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function average(values = []) {
  const safe = values.map((value) => Number(value)).filter((value) => Number.isFinite(value))
  if (!safe.length) return 0
  return safe.reduce((sum, value) => sum + value, 0) / safe.length
}

function daysBetween(start = '', end = new Date().toISOString()) {
  const startDate = new Date(start || '')
  const endDate = new Date(end || '')
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000))
}

function getPartnerTypeLabel(value = '') {
  const normalized = normalizeLower(value)
  if (normalized === 'agency' || normalized === 'agency_network') return 'Agency'
  if (normalized === 'attorney_firm') return 'Attorney'
  if (normalized === 'bond_originator') return 'Bond Originator'
  if (normalized === 'developer_company') return 'Developer'
  return value ? value.replace(/_/g, ' ') : 'Partner'
}

function getPeopleGroups(payload = {}) {
  const groups = payload?.groups || {}
  const principal = Array.isArray(groups.principal) ? groups.principal : []
  const branchManagers = Array.isArray(groups.branchManagers) ? groups.branchManagers : Array.isArray(groups.branch_managers) ? groups.branch_managers : []
  const agents = Array.isArray(groups.agents) ? groups.agents : []
  return { principal, branchManagers, agents }
}

function normalizePerson(person = {}) {
  const name = normalizeText([person.firstName, person.lastName].map(normalizeText).filter(Boolean).join(' ')) || normalizeText(person.fullName || person.name || person.email) || 'Partner user'
  return {
    id: normalizeText(person.userId || person.user_id || person.id),
    userId: normalizeText(person.userId || person.user_id || person.id),
    name,
    fullName: name,
    email: normalizeText(person.email),
    phone: normalizeText(person.phone),
    role: normalizeText(person.role || person.organisationRole || person.organisation_role),
    organisationRole: normalizeText(person.organisationRole || person.organisation_role || person.role),
    branchId: normalizeText(person.branchId || person.branch_id),
    branchName: normalizeText(person.branchName || person.branch_name),
    regionId: normalizeText(person.regionId || person.region_id),
    regionName: normalizeText(person.regionName || person.region_name),
    teamId: normalizeText(person.teamId || person.team_id),
    teamName: normalizeText(person.teamName || person.team_name),
    title: normalizeText(person.title || person.jobTitle || person.job_title),
    department: normalizeText(person.department),
    isActive: person.isActive !== false,
  }
}

function normalizeStaffDirectory(payload = {}) {
  const { principal, branchManagers, agents } = getPeopleGroups(payload)
  return [
    ...principal.map((person) => ({ ...normalizePerson(person), group: 'principal' })),
    ...branchManagers.map((person) => ({ ...normalizePerson(person), group: 'branch_manager' })),
    ...agents.map((person) => ({ ...normalizePerson(person), group: 'agent' })),
  ]
}

function isAcceptedRelationship(relationship = {}) {
  return normalizeLower(relationship.relationshipStatus || relationship.status) === 'accepted'
}

function getPartnerReferrals(snapshot = {}, relationship = {}) {
  const partnerOrganisationId = normalizeText(relationship.partner?.id || relationship.counterpartOrganisationId || relationship.partnerOrganisationId)
  const currentOrganisationId = normalizeText(relationship.organisationId || relationship.ownerOrganisationId)
  const referrals = Array.isArray(snapshot?.referrals) ? snapshot.referrals : []
  return referrals.filter((referral) => {
    const referring = normalizeText(referral.referringOrganisationId)
    const referred = normalizeText(referral.referredOrganisationId)
    return [referring, referred].includes(partnerOrganisationId) || [referring, referred].includes(currentOrganisationId)
  })
}

function getReferralConversionRate(referrals = []) {
  if (!referrals.length) return 0
  const converted = referrals.filter((referral) => normalizeLower(referral.referralStatus) === 'converted').length
  return clamp((converted / referrals.length) * 100)
}

function eventMentionsPartner(event = {}, partner = {}) {
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {}
  const targetIds = [
    payload.targetOrganisationId,
    payload.targetOrganisationID,
    payload.partnerOrganisationId,
    payload.partnerOrganisationID,
    payload.partnerId,
    payload.targetId,
    payload.relationshipId,
  ]
    .map(normalizeText)
    .filter(Boolean)

  const partnerId = normalizeText(partner?.id)
  const partnerName = normalizeLower(partner?.name)
  const haystack = normalizeLower(JSON.stringify(payload))

  return targetIds.includes(partnerId) || (partnerName && haystack.includes(partnerName))
}

function toActivityEvent(source = {}) {
  return {
    id: normalizeText(source.id || `${source.kind || 'partner-activity'}-${source.createdAt || source.at || Date.now()}`),
    kind: normalizeText(source.kind || source.type || 'activity'),
    title: normalizeText(source.title || source.label || 'Partner activity'),
    detail: normalizeText(source.detail || source.description || ''),
    partnerId: normalizeText(source.partnerId || source.targetOrganisationId || source.organisationId || source.partnerOrganisationId || ''),
    partnerName: normalizeText(source.partnerName || source.organisationName || source.targetOrganisationName || ''),
    createdAt: normalizeText(source.createdAt || source.at || new Date().toISOString()),
    source,
  }
}

function getPartnerHealthScore(profile = {}) {
  const activeTransactions = normalizeNumber(profile.activeTransactions)
  const completedTransactions = normalizeNumber(profile.completedTransactions)
  const referrals = normalizeNumber(profile.referralCount)
  const referralConversion = normalizeNumber(profile.referralConversionRate)
  const responseTimeHours = normalizeNumber(profile.responseTimeHours)
  const turnaroundDays = normalizeNumber(profile.turnaroundDays)
  const activeUsers = normalizeNumber(profile.activeUsers)
  const recentActivity = normalizeNumber(profile.recentActivityCount)
  const connectionAgeDays = normalizeNumber(profile.connectionAgeDays)

  const activityScore = clamp(activeTransactions * 1.4 + completedTransactions * 1.1, 0, 28)
  const referralScore = clamp(referrals * 1.8 + referralConversion * 0.15, 0, 20)
  const speedScore = clamp(24 - turnaroundDays * 1.2, 0, 22)
  const responseScore = clamp(18 - responseTimeHours * 1.3, 0, 18)
  const staffScore = clamp(activeUsers * 2.5, 0, 8)
  const recencyScore = clamp(14 - connectionAgeDays / 12, 0, 14)
  const engagementScore = clamp(recentActivity * 2.5, 0, 10)

  return clamp(activityScore + referralScore + speedScore + responseScore + staffScore + recencyScore + engagementScore)
}

function getHealthLabel(score = 0) {
  if (score >= 80) return HEALTH_BUCKETS.healthy
  if (score >= 65) return HEALTH_BUCKETS.watch
  if (score >= 45) return HEALTH_BUCKETS.inactive
  return HEALTH_BUCKETS.dormant
}

function getHealthTone(score = 0) {
  if (score >= 80) return 'healthy'
  if (score >= 65) return 'watch'
  if (score >= 45) return 'inactive'
  return 'dormant'
}

function toSearchableText(...values) {
  return values
    .flat()
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function buildProfileFromRelationship({
  relationship = {},
  snapshot = {},
  peopleByRelationshipId = {},
  auditEvents = [],
  nowIso = new Date().toISOString(),
}) {
  const partner = relationship.partner || {}
  const staffDirectory = normalizeStaffDirectory(peopleByRelationshipId[normalizeText(relationship.id)] || {})
  const referrals = getPartnerReferrals(snapshot, relationship)
  const acceptedAt = normalizeText(relationship.acceptedAt || relationship.accepted_at || relationship.createdAt || relationship.created_at)
  const activeTransactions = normalizeNumber(partner?.transactionStats?.activeTransactions)
  const completedTransactions = normalizeNumber(partner?.transactionStats?.registrations)
  const turnaroundDays = normalizeNumber(partner?.transactionStats?.avgDealSpeedDays)
  const responseTimeHours = normalizeNumber(partner?.transactionStats?.responseTimeHours)
  const activeUsers = staffDirectory.filter((person) => person.isActive !== false).length
  const branchNames = [...new Set(staffDirectory.map((person) => normalizeText(person.branchName)).filter(Boolean))]
  const regionNames = [...new Set(staffDirectory.map((person) => normalizeText(person.regionName)).filter(Boolean))]
  const teamNames = [...new Set(staffDirectory.map((person) => normalizeText(person.teamName)).filter(Boolean))]
  const recentActivity = (Array.isArray(auditEvents) ? auditEvents : [])
    .filter((event) => eventMentionsPartner(event, partner) || eventMentionsPartner(event, relationship))
    .slice(0, 8)

  const profile = {
    id: normalizeText(relationship.id),
    relationshipId: normalizeText(relationship.id),
    organisationId: normalizeText(partner.id || relationship.counterpartOrganisationId || relationship.partnerOrganisationId),
    organisationName: normalizeText(partner.name || 'Partner organisation'),
    organisationType: normalizeText(partner.type || partner.partnerType || ''),
    organisationTypeLabel: getPartnerTypeLabel(partner.type || partner.partnerType),
    city: normalizeText(partner.city),
    province: normalizeText(partner.province),
    partnerSince: acceptedAt,
    connectionAgeDays: acceptedAt ? daysBetween(acceptedAt, nowIso) : 0,
    activeTransactions,
    completedTransactions,
    transactionVolume: activeTransactions + completedTransactions,
    turnaroundDays,
    responseTimeHours,
    referralCount: referrals.length,
    referralConversionRate: getReferralConversionRate(referrals),
    activeUsers,
    branchCount: branchNames.length,
    regionCount: regionNames.length,
    teamCount: teamNames.length,
    branchNames,
    regionNames,
    teamNames,
    staffDirectory,
    recentActivity,
  }

  const healthScore = getPartnerHealthScore({
    ...profile,
    recentActivityCount: recentActivity.length,
  })

  return {
    ...profile,
    healthScore,
    healthLabel: getHealthLabel(healthScore),
    healthTone: getHealthTone(healthScore),
    referrals,
    summaryLine: [
      profile.organisationTypeLabel,
      profile.city,
      profile.province,
    ].filter(Boolean).join(' · '),
    searchText: toSearchableText(
      profile.organisationName,
      profile.organisationTypeLabel,
      profile.city,
      profile.province,
      profile.branchNames,
      profile.regionNames,
      profile.teamNames,
      staffDirectory.map((person) => [person.name, person.role, person.branchName, person.regionName, person.teamName].join(' ')),
    ),
  }
}

function buildActivityFeed({ snapshot = {}, partnerProfiles = [], auditEvents = [], selectedPartnerId = '' } = {}) {
  const feed = []

  partnerProfiles.forEach((profile) => {
    if (profile.partnerSince) {
      feed.push(
        toActivityEvent({
          kind: 'relationship',
          title: 'Connection accepted',
          detail: `Connected with ${profile.organisationName}`,
          partnerId: profile.organisationId,
          partnerName: profile.organisationName,
          createdAt: profile.partnerSince,
        }),
      )
    }

    if (profile.referrals.length) {
      profile.referrals.forEach((referral) => {
        feed.push(
          toActivityEvent({
            kind: 'referral',
            title: normalizeLower(referral.referralStatus) === 'converted' ? 'Referral converted' : 'Referral activity',
            detail: `${profile.organisationName} · ${normalizeText(referral.transactionId) || 'Transaction unlinked'}`,
            partnerId: profile.organisationId,
            partnerName: profile.organisationName,
            createdAt: referral.referralDate || referral.createdAt || profile.partnerSince,
          }),
        )
      })
    }

    if (profile.recentActivity.length) {
      profile.recentActivity.forEach((event) => {
        feed.push(
          toActivityEvent({
            kind: 'audit',
            title: normalizeText(event?.type || event?.payload?.action || 'Partner update').replace(/_/g, ' '),
            detail: normalizeText(event?.payload?.resolutionReason || event?.payload?.message || event?.payload?.detail || ''),
            partnerId: profile.organisationId,
            partnerName: profile.organisationName,
            createdAt: event.at || event.createdAt || new Date().toISOString(),
            source: event,
          }),
        )
      })
    }
  })

  auditEvents.forEach((event) => {
    const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {}
    const createdAt = normalizeText(event?.at || event?.createdAt)
    const kind = normalizeLower(event?.type || payload.action || '')
    if (!createdAt || !kind) return
    if (!kind.startsWith('partner') && !kind.startsWith('assignment') && !kind.startsWith('routing')) return
    if (selectedPartnerId && !eventMentionsPartner(event, { id: selectedPartnerId })) return
    feed.push(
      toActivityEvent({
        kind: 'audit',
        title: kind.replace(/[\._]/g, ' '),
        detail: normalizeText(payload.resolutionReason || payload.message || payload.targetRoleType || ''),
        partnerId: normalizeText(payload.targetOrganisationId || payload.partnerOrganisationId || payload.organisationId || ''),
        partnerName: normalizeText(payload.targetOrganisationName || payload.partnerOrganisationName || ''),
        createdAt,
        source: event,
      }),
    )
  })

  return [...new Map(feed.map((item) => [item.id, item])).values()]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 24)
}

function buildSearchResults({ profiles = [], query = '' } = {}) {
  const search = normalizeLower(query)
  if (!search) return []

  const results = []

  profiles.forEach((profile) => {
    const profileText = profile.searchText || ''
    if (profileText.includes(search)) {
      results.push({
        id: profile.id,
        type: 'organisation',
        title: profile.organisationName,
        subtitle: [profile.organisationTypeLabel, profile.summaryLine].filter(Boolean).join(' · '),
        detail: `${profile.activeUsers} active users · ${profile.healthLabel}`,
        href: `/partners/${encodeURIComponent(profile.organisationId)}`,
        score: profile.healthScore,
      })
    }

    profile.staffDirectory.forEach((person) => {
      const personText = toSearchableText(person.name, person.role, person.branchName, person.regionName, person.teamName, person.email)
      if (!personText.includes(search)) return
      results.push({
        id: `${profile.id}:${person.userId}`,
        type: 'staff',
        title: person.name,
        subtitle: [person.role, profile.organisationName].filter(Boolean).join(' · '),
        detail: [person.branchName, person.regionName, person.teamName].filter(Boolean).join(' · '),
        href: `/partners/${encodeURIComponent(profile.organisationId)}`,
        score: profile.healthScore,
      })
    })
  })

  return results.slice(0, 24)
}

function buildSummary({ profiles = [], feed = [], snapshot = {}, selectedProfile = null } = {}) {
  const activeProfiles = profiles.filter((profile) => profile.healthLabel !== HEALTH_BUCKETS.dormant)
  const averageHealthScore = profiles.length ? Math.round(average(profiles.map((profile) => profile.healthScore))) : 0
  const topProfile = [...profiles].sort((left, right) => right.healthScore - left.healthScore || right.transactionVolume - left.transactionVolume)[0] || null
  const fastestProfile = [...profiles].sort((left, right) => left.turnaroundDays - right.turnaroundDays || right.transactionVolume - left.transactionVolume)[0] || null
  const busiestConsultant = profiles
    .flatMap((profile) => profile.staffDirectory.map((person) => ({
      name: person.name,
      role: person.role,
      organisationName: profile.organisationName,
      transactionVolume: profile.transactionVolume,
    })))
    .sort((left, right) => right.transactionVolume - left.transactionVolume)[0] || null

  return {
    totalConnections: profiles.length,
    activeConnections: activeProfiles.length,
    dormantConnections: profiles.filter((profile) => profile.healthLabel === HEALTH_BUCKETS.dormant).length,
    totalUsers: profiles.reduce((sum, profile) => sum + profile.activeUsers, 0),
    totalTransactions: profiles.reduce((sum, profile) => sum + profile.transactionVolume, 0),
    referralVolume: snapshot?.referrals?.reduce((sum, referral) => sum + normalizeNumber(referral.referralValue), 0) || 0,
    averageHealthScore,
    topProfile,
    fastestProfile,
    busiestConsultant,
    selectedPartner: selectedProfile || null,
    recentActivity: feed.length,
  }
}

export function buildPartnerNetworkIntelligence({
  snapshot = {},
  selectedPartnerId = '',
  selectedRelationshipId = '',
  peopleByRelationshipId = {},
  auditEvents = readAuditEvents(),
  query = '',
} = {}) {
  const relationships = Array.isArray(snapshot?.relationships) ? snapshot.relationships.filter(isAcceptedRelationship) : []
  const partnerProfiles = relationships.map((relationship) =>
    buildProfileFromRelationship({
      relationship,
      snapshot,
      peopleByRelationshipId,
      auditEvents,
    }),
  )
  const selectedProfile =
    partnerProfiles.find((profile) => profile.organisationId === normalizeText(selectedPartnerId)) ||
    partnerProfiles.find((profile) => profile.relationshipId === normalizeText(selectedRelationshipId)) ||
    partnerProfiles[0] ||
    null
  const activityFeed = buildActivityFeed({
    snapshot,
    partnerProfiles,
    auditEvents,
    selectedPartnerId: selectedProfile?.organisationId || selectedPartnerId,
  })
  const searchResults = buildSearchResults({ profiles: partnerProfiles, query })
  const summary = buildSummary({
    profiles: partnerProfiles,
    feed: activityFeed,
    snapshot,
    selectedProfile,
  })

  const relationshipGraph = {
    root: {
      id: normalizeText(snapshot?.accessContext?.organisationId || ''),
      label: 'Your organisation',
    },
    nodes: partnerProfiles.map((profile) => ({
      id: profile.organisationId,
      label: profile.organisationName,
      status: profile.healthLabel,
      score: profile.healthScore,
    })),
    edges: partnerProfiles.map((profile) => ({
      from: normalizeText(snapshot?.accessContext?.organisationId || ''),
      to: profile.organisationId,
      label: profile.relationshipId,
      active: profile.healthLabel !== HEALTH_BUCKETS.dormant,
    })),
  }

  const executiveHighlights = [
    summary.topProfile
      ? {
          label: 'Top Partner Organisation',
          value: summary.topProfile.organisationName,
          detail: `${summary.topProfile.healthScore}/100 · ${summary.topProfile.transactionVolume} transactions`,
        }
      : null,
    summary.fastestProfile
      ? {
          label: 'Fastest Partner',
          value: summary.fastestProfile.organisationName,
          detail: `${summary.fastestProfile.turnaroundDays || 0} day average turnaround`,
        }
      : null,
    summary.busiestConsultant
      ? {
          label: 'Most Active Consultant',
          value: summary.busiestConsultant.name,
          detail: `${summary.busiestConsultant.role || 'Partner user'} · ${summary.busiestConsultant.organisationName}`,
        }
      : null,
  ].filter(Boolean)

  return {
    summary,
    partnerProfiles,
    selectedProfile,
    activityFeed,
    searchResults,
    relationshipGraph,
    executiveHighlights,
    partnerCount: partnerProfiles.length,
  }
}

export {
  getHealthLabel as getPartnerHealthLabel,
  getHealthTone as getPartnerHealthTone,
  HEALTH_BUCKETS as PARTNER_NETWORK_HEALTH_BUCKETS,
}
