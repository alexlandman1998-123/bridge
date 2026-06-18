import { listOrganisationUsers } from '../../../lib/settingsApi'
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient'
import {
  getCommercialAllHeadsOfTerms,
  getCommercialDeals,
  getCommercialLeases,
  getCommercialListings,
  getCommercialProperties,
  getCommercialRequirements,
  getCommercialTransactions,
  getCommercialVacancies,
  getCommercialViewings,
  getCommercialCommissions,
  getCommercialRecentActivity,
  logCommercialActivity,
  isCommercialMembershipRow,
  resolveCommercialAccessContext,
  updateCommercialDeal,
  updateCommercialLease,
  updateCommercialListing,
  updateCommercialProperty,
  updateCommercialRequirement,
  updateCommercialVacancy,
  updateHeadsOfTerms,
} from './commercialApi'

const BROKER_ROLES = new Set(['broker', 'commercial_broker', 'agent', 'senior_agent'])
const MANAGER_ROLES = new Set(['owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'manager', 'hq_manager', 'commercial_hq_admin', 'branch_manager', 'branch_admin'])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function isActive(row) {
  return !['archived', 'inactive', 'closed_lost', 'expired', 'terminated', 'cancelled'].includes(normalizeLower(row?.status || 'active'))
}

function isOpenVacancy(row) {
  return !['occupied', 'archived', 'withdrawn', 'suspended', 'terminated', 'inactive'].includes(normalizeLower(row?.status || 'draft'))
}

function isBrokerMember(member = {}) {
  return BROKER_ROLES.has(normalizeLower(member.role)) || normalizeLower(member.role).includes('broker')
}

function parseObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

function resolveCommercialBrokerageRole(row = {}) {
  const metadata = parseObject(row.module_metadata || row.moduleMetadata || row.metadata)
  const commercialRole = normalizeLower(metadata.commercial_role || metadata.commercialRole || metadata.broker_role || metadata.brokerRole)
  if (commercialRole === 'commercial broker' || commercialRole === 'broker') return 'commercial_broker'
  if (commercialRole.startsWith('commercial_')) return commercialRole
  const role = normalizeLower(row.workspace_role || row.organisation_role || row.role)
  return role === 'agent' && isCommercialMembershipRow(row) ? 'commercial_broker' : role
}

function isManagerMember(member = {}) {
  return MANAGER_ROLES.has(normalizeLower(member.role))
}

function brokerIdFor(row = {}, kind = '') {
  if (kind === 'vacancies') return normalizeText(row.broker_assignment || row.broker_id)
  return normalizeText(row.assigned_broker || row.broker_id)
}

const ENTITY_TYPES = {
  properties: 'commercial_property',
  vacancies: 'commercial_vacancy',
  listings: 'commercial_listing',
  requirements: 'commercial_requirement',
  deals: 'commercial_deal',
  headsOfTerms: 'commercial_deal',
  leases: 'commercial_lease',
}

function latestDate(values = []) {
  return values
    .map(asDate)
    .filter(Boolean)
    .sort((left, right) => right - left)[0] || null
}

function capacityScoreForBroker({ activeRequirements = 0, activeDeals = 0, activeTransactions = 0, activeListings = 0, activeVacancies = 0, upcomingViewings = 0 } = {}) {
  return activeRequirements + (activeDeals * 2) + (activeTransactions * 2) + activeListings + activeVacancies + upcomingViewings
}

function capacityLabelForScore(score = 0) {
  if (score >= 18) return 'Overloaded'
  if (score >= 12) return 'High'
  if (score >= 6) return 'Medium'
  return 'Low'
}

function formatName(member = {}) {
  return normalizeText(member.fullName)
    || [normalizeText(member.firstName), normalizeText(member.lastName)].filter(Boolean).join(' ')
    || normalizeText(member.email)
    || 'Broker'
}

async function listCommercialBranches(organisationId) {
  if (!organisationId || !isSupabaseConfigured || !supabase) return []
  const query = await supabase
    .from('organisation_branches')
    .select('id, organisation_id, name, city, province, manager_name, is_head_office, is_active')
    .eq('organisation_id', organisationId)
    .order('name', { ascending: true })

  if (query.error) return []
  return query.data || []
}

async function listCommercialTeams(organisationId) {
  if (!organisationId || !isSupabaseConfigured || !supabase) return []
  const query = await supabase
    .from('commercial_teams')
    .select('id, organisation_id, branch_id, name, status')
    .eq('organisation_id', organisationId)
    .order('name', { ascending: true })

  if (query.error) return []
  return query.data || []
}

async function listCommercialMembers(organisationId) {
  if (!organisationId || !isSupabaseConfigured || !supabase) return listOrganisationUsers().catch(() => [])
  const query = await supabase
    .from('organisation_users')
    .select('id, organisation_id, user_id, branch_id, primary_branch_id, team_id, first_name, last_name, email, role, workspace_role, organisation_role, module_context, workspace_type, module_metadata, status, invited_at, accepted_at, last_active_at')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: true })

  if (query.error) {
    const users = await listOrganisationUsers().catch(() => [])
    return users.filter(isCommercialMembershipRow)
  }
  return (query.data || []).filter(isCommercialMembershipRow).map((row) => ({
    id: row.id,
    organisationId: row.organisation_id,
    userId: row.user_id,
    branchId: row.primary_branch_id || row.branch_id,
    teamId: row.team_id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: [row.first_name, row.last_name].filter(Boolean).join(' '),
    email: row.email,
    role: resolveCommercialBrokerageRole(row),
    status: row.status,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    lastActiveAt: row.last_active_at,
  }))
}

function buildBrokerRows({ members = [], branches = [], requirements = [], deals = [], vacancies = [], listings = [], properties = [], headsOfTerms = [], leases = [], transactions = [], viewings = [], commissions = [], activity = [] }) {
  const branchNames = new Map(branches.map((branch) => [normalizeText(branch.id), normalizeText(branch.name) || 'Branch']))
  const linkedDealById = new Map(deals.map((deal) => [deal.id, deal]))
  const brokerMembers = members.filter((member) => isBrokerMember(member) || brokerIdFor(member))

  return brokerMembers.map((member) => {
    const id = normalizeText(member.userId || member.id)
    const assignedRequirements = requirements.filter((row) => brokerIdFor(row, 'requirements') === id)
    const assignedDeals = deals.filter((row) => brokerIdFor(row, 'deals') === id)
    const assignedVacancies = vacancies.filter((row) => brokerIdFor(row, 'vacancies') === id)
    const assignedListings = listings.filter((row) => brokerIdFor(row, 'listings') === id)
    const assignedProperties = properties.filter((row) => brokerIdFor(row, 'properties') === id)
    const assignedTransactions = transactions.filter((row) => normalizeText(row.broker_id || row.brokerId) === id)
    const assignedViewings = viewings.filter((row) => normalizeText(row.broker_id) === id)
    const assignedCommissions = commissions.filter((row) => normalizeText(row.broker_id) === id)
    const assignedHots = headsOfTerms.filter((row) => brokerIdFor(row, 'headsOfTerms') === id || brokerIdFor(linkedDealById.get(row.deal_id), 'deals') === id)
    const assignedLeases = leases.filter((row) => brokerIdFor(row, 'leases') === id || brokerIdFor(linkedDealById.get(row.deal_id), 'deals') === id)
    const brokerActivity = activity.filter((row) => brokerIdFor(row, 'activity') === id || normalizeText(row.created_by) === id)
    const activeRequirements = assignedRequirements.filter(isActive)
    const activeDeals = assignedDeals.filter(isActive)
    const activeTransactions = assignedTransactions.filter((row) => !['completed', 'lost', 'cancelled'].includes(normalizeLower(row.status)))
    const upcomingViewings = assignedViewings.filter((row) => {
      const date = asDate(`${row.viewing_date || ''}T${String(row.viewing_time || '00:00').slice(0, 5) || '00:00'}`)
      return date && date >= new Date() && !['completed', 'cancelled', 'no_show'].includes(normalizeLower(row.status))
    })
    const completedViewings = assignedViewings.filter((row) => normalizeLower(row.status) === 'completed')
    const closedTransactions = assignedTransactions.filter((row) => normalizeLower(row.status) === 'completed')
    const activeListings = assignedListings.filter(isActive)
    const activeVacancies = assignedVacancies.filter(isOpenVacancy)
    const projectedCommission = assignedCommissions.filter((row) => normalizeLower(row.status) === 'projected').reduce((sum, row) => sum + toNumber(row.commission_amount), 0)
    const approvedRevenue = assignedCommissions.filter((row) => normalizeLower(row.status) === 'approved').reduce((sum, row) => sum + toNumber(row.commission_amount), 0)
    const paidRevenue = assignedCommissions.filter((row) => normalizeLower(row.status) === 'paid').reduce((sum, row) => sum + toNumber(row.commission_amount), 0)
    const capacityScore = capacityScoreForBroker({
      activeRequirements: activeRequirements.length,
      activeDeals: activeDeals.length,
      activeTransactions: activeTransactions.length,
      activeListings: activeListings.length,
      activeVacancies: activeVacancies.length,
      upcomingViewings: upcomingViewings.length,
    })
    const lastActivity = latestDate([
      member.lastActiveAt,
      ...assignedRequirements.map((row) => row.updated_at || row.created_at),
      ...assignedDeals.map((row) => row.updated_at || row.created_at),
      ...assignedTransactions.map((row) => row.updated_at || row.created_at || row.actual_close_date),
      ...assignedViewings.map((row) => row.updated_at || row.created_at || row.viewing_date),
      ...assignedVacancies.map((row) => row.updated_at || row.created_at),
      ...assignedListings.map((row) => row.updated_at || row.created_at),
      ...assignedHots.map((row) => row.updated_at || row.created_at),
      ...assignedLeases.map((row) => row.updated_at || row.created_at),
      ...brokerActivity.map((row) => row.created_at),
    ])

    return {
      id,
      organisationUserId: member.id,
      userId: member.userId,
      name: formatName(member),
      email: normalizeText(member.email),
      role: normalizeText(member.role) || 'broker',
      status: normalizeLower(member.status || 'active'),
      branchId: normalizeText(member.branchId),
      branchName: branchNames.get(normalizeText(member.branchId)) || (member.branchId ? 'Assigned branch' : 'HQ / Unassigned'),
      teamId: normalizeText(member.teamId),
      activeRequirements: activeRequirements.length,
      activeDeals: activeDeals.length,
      activeTransactions: activeTransactions.length,
      transactionsCreated: assignedTransactions.length,
      transactionsClosed: closedTransactions.length,
      valueClosed: closedTransactions.reduce((sum, row) => sum + toNumber(row.target_value), 0),
      viewingsCompleted: completedViewings.length,
      upcomingViewings: upcomingViewings.length,
      hotsInProgress: assignedHots.filter((row) => !['ready_for_lease', 'archived', 'superseded'].includes(normalizeLower(row.status))).length,
      hotsSigned: assignedHots.filter((row) => ['signed', 'ready_for_lease', 'approved_by_landlord', 'approved_by_tenant'].includes(normalizeLower(row.status))).length,
      leasesManaged: assignedLeases.filter(isActive).length,
      vacanciesManaged: activeVacancies.length,
      activeListings: activeListings.length,
      propertiesManaged: assignedProperties.filter(isActive).length,
      pipelineValue: activeTransactions.reduce((sum, row) => sum + toNumber(row.target_value), 0) || activeDeals.reduce((sum, row) => sum + toNumber(row.deal_value), 0),
      commissionValue: projectedCommission + approvedRevenue + paidRevenue,
      projectedCommission,
      approvedRevenue,
      paidRevenue,
      capacityScore,
      capacityLabel: capacityLabelForScore(capacityScore),
      lastActivityAt: lastActivity?.toISOString() || null,
      requirements: assignedRequirements,
      deals: assignedDeals,
      transactions: assignedTransactions,
      viewings: assignedViewings,
      commissions: assignedCommissions,
      vacancies: assignedVacancies,
      listings: assignedListings,
      properties: assignedProperties,
      headsOfTerms: assignedHots,
      leases: assignedLeases,
      activity: brokerActivity,
    }
  }).sort((left, right) => right.pipelineValue - left.pipelineValue || left.name.localeCompare(right.name))
}

function buildUnassignedWork({ requirements = [], deals = [], vacancies = [], listings = [], headsOfTerms = [], leases = [] }) {
  const linkedDealById = new Map(deals.map((deal) => [deal.id, deal]))
  return {
    requirements: requirements.filter((row) => isActive(row) && !brokerIdFor(row, 'requirements')),
    deals: deals.filter((row) => isActive(row) && !brokerIdFor(row, 'deals')),
    vacancies: vacancies.filter((row) => isActive(row) && !brokerIdFor(row, 'vacancies')),
    listings: listings.filter((row) => isActive(row) && !brokerIdFor(row, 'listings')),
    headsOfTerms: headsOfTerms.filter((row) => isActive(row) && !brokerIdFor(row, 'headsOfTerms') && !brokerIdFor(linkedDealById.get(row.deal_id), 'deals')),
    leases: leases.filter((row) => isActive(row) && !brokerIdFor(row, 'leases') && !brokerIdFor(linkedDealById.get(row.deal_id), 'deals')),
  }
}

function recordTitle(kind, row = {}) {
  if (kind === 'properties') return row.property_name || 'Property'
  if (kind === 'vacancies') return row.vacancy_name || 'Vacancy'
  if (kind === 'listings') return row.title || 'Listing'
  if (kind === 'requirements') return row.requirement_name || 'Requirement'
  if (kind === 'deals') return row.deal_name || 'Deal'
  if (kind === 'headsOfTerms') return row.premises_description || 'Heads of Terms'
  if (kind === 'leases') return row.id ? `Lease ${String(row.id).slice(0, 8)}` : 'Lease'
  return 'Commercial record'
}

function findRecord(brokerage, kind, id) {
  const collections = {
    properties: brokerage.properties,
    vacancies: brokerage.vacancies,
    listings: brokerage.listings,
    requirements: brokerage.requirements,
    deals: brokerage.deals,
    headsOfTerms: brokerage.headsOfTerms,
    leases: brokerage.leases,
  }
  return (collections[kind] || []).find((row) => normalizeText(row.id) === normalizeText(id)) || null
}

function findBrokerName(brokerage, brokerId) {
  const normalized = normalizeText(brokerId)
  if (!normalized) return 'Unassigned'
  const broker = (brokerage.brokers || []).find((row) => normalizeText(row.userId || row.id) === normalized)
  return broker?.name || broker?.email || 'Assigned broker'
}

function findBranchName(brokerage, branchId) {
  const normalized = normalizeText(branchId)
  if (!normalized) return 'No branch'
  return (brokerage.branches || []).find((row) => normalizeText(row.id) === normalized)?.name || 'Assigned branch'
}

function findTeamName(brokerage, teamId) {
  const normalized = normalizeText(teamId)
  if (!normalized) return 'No team'
  return (brokerage.teams || []).find((row) => normalizeText(row.id) === normalized)?.name || 'Assigned team'
}

function assignmentPayloadForKind(kind, { brokerId = '', teamId = '', branchId = '' } = {}) {
  const payload = {
    broker_id: normalizeText(brokerId) || null,
    team_id: normalizeText(teamId) || null,
    branch_id: normalizeText(branchId) || null,
  }
  if (kind === 'requirements' || kind === 'deals') payload.assigned_broker = payload.broker_id
  if (kind === 'vacancies') payload.broker_assignment = payload.broker_id
  return payload
}

async function updateAssignedRecord(kind, id, payload) {
  const options = { logActivity: false }
  if (kind === 'requirements') return updateCommercialRequirement(id, payload, options)
  if (kind === 'deals') return updateCommercialDeal(id, payload, options)
  if (kind === 'vacancies') return updateCommercialVacancy(id, payload, options)
  if (kind === 'listings') return updateCommercialListing(id, payload, options)
  if (kind === 'properties') return updateCommercialProperty(id, payload, options)
  if (kind === 'headsOfTerms') return updateHeadsOfTerms(id, payload, options)
  if (kind === 'leases') return updateCommercialLease(id, payload, options)
  throw new Error('Unsupported commercial assignment type.')
}

async function logAssignmentActivity({ brokerage, kind, previous, updated, brokerId, teamId, branchId }) {
  const previousBroker = brokerIdFor(previous, kind)
  const nextBroker = brokerIdFor(updated, kind)
  const previousTeam = normalizeText(previous?.team_id)
  const nextTeam = normalizeText(updated?.team_id)
  const previousBranch = normalizeText(previous?.branch_id)
  const nextBranch = normalizeText(updated?.branch_id)
  const changes = []

  if (previousBroker !== nextBroker) {
    changes.push(nextBroker
      ? `Broker ${previousBroker ? 'reassigned' : 'assigned'} to ${findBrokerName(brokerage, nextBroker)}`
      : `Broker assignment cleared from ${findBrokerName(brokerage, previousBroker)}`)
  }
  if (previousTeam !== nextTeam) {
    changes.push(nextTeam
      ? `Team changed to ${findTeamName(brokerage, nextTeam)}`
      : `Team assignment cleared from ${findTeamName(brokerage, previousTeam)}`)
  }
  if (previousBranch !== nextBranch) {
    changes.push(nextBranch
      ? `Branch changed to ${findBranchName(brokerage, nextBranch)}`
      : `Branch assignment cleared from ${findBranchName(brokerage, previousBranch)}`)
  }

  if (!changes.length) return null

  return logCommercialActivity({
    organisation_id: updated?.organisation_id || previous?.organisation_id || brokerage.context.organisationId,
    branch_id: updated?.branch_id || previous?.branch_id || null,
    team_id: updated?.team_id || previous?.team_id || null,
    broker_id: brokerIdFor(updated, kind) || brokerIdFor(previous, kind) || null,
    entityType: ENTITY_TYPES[kind] || 'commercial_record',
    entityId: kind === 'headsOfTerms' ? (updated?.deal_id || previous?.deal_id || updated?.id) : updated?.id,
    activityType: 'commercial_assignment_changed',
    title: 'Commercial assignment changed',
    body: `${recordTitle(kind, updated || previous)}: ${changes.join('. ')}.`,
    metadata: {
      kind,
      recordId: updated?.id || previous?.id,
      previousBroker,
      nextBroker,
      previousTeam,
      nextTeam,
      previousBranch,
      nextBranch,
      requestedBrokerId: brokerId || null,
      requestedTeamId: teamId || null,
      requestedBranchId: branchId || null,
    },
  })
}

export async function getCommercialBrokerageData(organisationId) {
  const context = await resolveCommercialAccessContext()
  const resolvedOrganisationId = organisationId || context.organisationId
  if (!resolvedOrganisationId) {
    return { context, brokers: [], managers: [], branches: [], teams: [], unassigned: {}, summary: {} }
  }

  const [members, branches, commercialTeams, requirements, deals, vacancies, listings, properties, headsOfTerms, leases, transactions, viewings, commissions, activity] = await Promise.all([
    listCommercialMembers(resolvedOrganisationId),
    listCommercialBranches(resolvedOrganisationId),
    listCommercialTeams(resolvedOrganisationId),
    getCommercialRequirements(resolvedOrganisationId),
    getCommercialDeals(resolvedOrganisationId),
    getCommercialVacancies(resolvedOrganisationId),
    getCommercialListings(resolvedOrganisationId),
    getCommercialProperties(resolvedOrganisationId),
    getCommercialAllHeadsOfTerms(resolvedOrganisationId),
    getCommercialLeases(resolvedOrganisationId),
    getCommercialTransactions(resolvedOrganisationId),
    getCommercialViewings(resolvedOrganisationId),
    getCommercialCommissions(resolvedOrganisationId),
    getCommercialRecentActivity(resolvedOrganisationId, 250),
  ])

  const visibleMembers = members.filter((member) => {
    if (context.scopeLevel === 'organisation') return true
    if (context.scopeLevel === 'branch') return normalizeText(member.branchId) === normalizeText(context.branchId)
    return normalizeText(member.userId || member.id) === normalizeText(context.userId)
  })
  const visibleBranches = context.scopeLevel === 'organisation'
    ? branches
    : branches.filter((branch) => normalizeText(branch.id) === normalizeText(context.branchId))
  const visibleBranchIds = new Set(visibleBranches.map((branch) => normalizeText(branch.id)))
  const visibleCommercialTeams = context.scopeLevel === 'organisation'
    ? commercialTeams
    : commercialTeams.filter((team) => visibleBranchIds.has(normalizeText(team.branch_id)) || normalizeText(team.id) === normalizeText(context.teamId))
  const brokers = buildBrokerRows({ members: visibleMembers, branches: visibleBranches, requirements, deals, vacancies, listings, properties, headsOfTerms, leases, transactions, viewings, commissions, activity })
  const managers = visibleMembers.filter(isManagerMember)
  const unassigned = buildUnassignedWork({ requirements, deals, vacancies, listings, headsOfTerms, leases })
  const unassignedCount = Object.values(unassigned).reduce((sum, rows) => sum + rows.length, 0)
  const activePipeline = brokers.reduce((sum, broker) => sum + broker.pipelineValue, 0)
  const activeBrokerCount = brokers.filter((broker) => broker.status === 'active').length
  const teamNames = new Map(visibleCommercialTeams.map((team) => [normalizeText(team.id), normalizeText(team.name) || 'Commercial team']))
  const teamBranches = new Map(visibleCommercialTeams.map((team) => [normalizeText(team.id), normalizeText(team.branch_id)]))
  const teams = brokers.reduce((groups, broker) => {
    const id = broker.teamId || 'unassigned'
    const current = groups.get(id) || {
      id,
      name: id === 'unassigned' ? 'Unassigned Team' : teamNames.get(id) || 'Commercial team',
      branchId: teamBranches.get(id) || broker.branchId || '',
      brokers: 0,
      pipelineValue: 0,
      activeDeals: 0,
      activeTransactions: 0,
      closedValue: 0,
      expectedRevenue: 0,
    }
    current.brokers += 1
    current.pipelineValue += broker.pipelineValue
    current.activeDeals += broker.activeDeals
    current.activeTransactions += broker.activeTransactions
    current.closedValue += broker.valueClosed
    current.expectedRevenue += broker.projectedCommission
    groups.set(id, current)
    return groups
  }, new Map())
  visibleCommercialTeams.forEach((team) => {
    const id = normalizeText(team.id)
    if (!teams.has(id)) {
      teams.set(id, {
        id,
        name: normalizeText(team.name) || 'Commercial team',
        branchId: normalizeText(team.branch_id),
        brokers: 0,
        pipelineValue: 0,
        activeDeals: 0,
        activeTransactions: 0,
        closedValue: 0,
        expectedRevenue: 0,
      })
    }
  })

  const branchRows = visibleBranches.map((branch) => {
    const branchBrokers = brokers.filter((broker) => normalizeText(broker.branchId) === normalizeText(branch.id))
    const branchProperties = properties.filter((row) => normalizeText(row.branch_id) === normalizeText(branch.id))
    const branchVacancies = vacancies.filter((row) => normalizeText(row.branch_id) === normalizeText(branch.id))
    const totalGla = branchProperties.reduce((sum, row) => sum + toNumber(row.gla_m2), 0)
    const available = branchVacancies.filter(isOpenVacancy).reduce((sum, row) => sum + toNumber(row.available_area_m2), 0)
    return {
      ...branch,
      brokers: branchBrokers.length,
      activeDeals: branchBrokers.reduce((sum, broker) => sum + broker.activeDeals, 0),
      activeRequirements: branchBrokers.reduce((sum, broker) => sum + broker.activeRequirements, 0),
      activeTransactions: branchBrokers.reduce((sum, broker) => sum + broker.activeTransactions, 0),
      pipelineValue: branchBrokers.reduce((sum, broker) => sum + broker.pipelineValue, 0),
      expectedRevenue: branchBrokers.reduce((sum, broker) => sum + broker.projectedCommission, 0),
      approvedRevenue: branchBrokers.reduce((sum, broker) => sum + broker.approvedRevenue, 0),
      paidRevenue: branchBrokers.reduce((sum, broker) => sum + broker.paidRevenue, 0),
      occupancy: totalGla ? Math.max(0, 100 - ((available / totalGla) * 100)) : 0,
      activeListings: listings.filter((row) => normalizeText(row.branch_id) === normalizeText(branch.id) && isActive(row)).length,
      activeVacancies: branchVacancies.filter(isOpenVacancy).length,
    }
  })

  return {
    context,
    members: visibleMembers,
    managers,
    branches: visibleBranches,
    teams: Array.from(teams.values()),
    brokers,
    requirements,
    deals,
    vacancies,
    listings,
    properties,
    headsOfTerms,
    leases,
    transactions,
    viewings,
    commissions,
    activity,
    unassigned,
    branchRows,
    summary: {
      totalBrokers: brokers.length,
      activeBrokers: activeBrokerCount,
      inactiveBrokers: Math.max(0, brokers.length - activeBrokerCount),
      unassignedWork: unassignedCount,
      activePipeline,
      brokerActivity: brokers.filter((broker) => broker.lastActivityAt).length,
      activeRequirements: brokers.reduce((sum, broker) => sum + broker.activeRequirements, 0),
      activeDeals: brokers.reduce((sum, broker) => sum + broker.activeDeals, 0),
      activeTransactions: brokers.reduce((sum, broker) => sum + broker.activeTransactions, 0),
      activeListings: brokers.reduce((sum, broker) => sum + broker.activeListings, 0),
      activeVacancies: brokers.reduce((sum, broker) => sum + broker.vacanciesManaged, 0),
      hotsInProgress: brokers.reduce((sum, broker) => sum + broker.hotsInProgress, 0),
      leasesManaged: brokers.reduce((sum, broker) => sum + broker.leasesManaged, 0),
      projectedRevenue: brokers.reduce((sum, broker) => sum + broker.projectedCommission, 0),
      approvedRevenue: brokers.reduce((sum, broker) => sum + broker.approvedRevenue, 0),
      paidRevenue: brokers.reduce((sum, broker) => sum + broker.paidRevenue, 0),
      overloadedBrokers: brokers.filter((broker) => broker.capacityLabel === 'Overloaded').length,
    },
  }
}

export async function assignCommercialRecord({ kind, id, brokerId = '', teamId = '', branchId = '', preserveExistingHierarchy = true }) {
  const brokerage = await getCommercialBrokerageData()
  if (!brokerage.context.canManageBrokerage) {
    throw new Error('Only principal, HQ, admin, or branch management users can assign commercial work.')
  }

  const broker = brokerage.brokers.find((row) => normalizeText(row.userId || row.id) === normalizeText(brokerId))
  const previous = findRecord(brokerage, kind, id)
  const payload = assignmentPayloadForKind(kind, {
    brokerId,
    teamId: preserveExistingHierarchy ? teamId || broker?.teamId || previous?.team_id : teamId,
    branchId: preserveExistingHierarchy ? branchId || broker?.branchId || previous?.branch_id : branchId,
  })
  const updated = await updateAssignedRecord(kind, id, payload)
  await logAssignmentActivity({ brokerage, kind, previous, updated, brokerId, teamId, branchId })
  return updated
}

export async function assignCommercialBroker({ kind, id, brokerId }) {
  return assignCommercialRecord({ kind, id, brokerId })
}

export async function clearCommercialAssignment({ kind, id }) {
  return assignCommercialRecord({ kind, id, brokerId: '', teamId: '', branchId: '', preserveExistingHierarchy: false })
}

export async function bulkAssignCommercialRecords({ kind, ids = [], brokerId = '', teamId = '', branchId = '' }) {
  const uniqueIds = Array.from(new Set(ids.map(normalizeText).filter(Boolean)))
  if (!uniqueIds.length) return []
  const results = []
  for (const id of uniqueIds) {
    results.push(await assignCommercialRecord({ kind, id, brokerId, teamId, branchId }))
  }
  return results
}
