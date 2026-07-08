import { fetchTransactionsByParticipantSummary, fetchTransactionsListSummary } from '../../../lib/api'
import { listAgencyCrmLeadContacts } from '../../../lib/agencyCrmRepository'
import { listAppointmentsAsync } from '../../../lib/agencyPipelineService'
import { listCanvassingWorkspace } from '../../../lib/canvassingRepository'
import { fetchOrganisationSettings, listOrganisationUsers } from '../../../lib/settingsApi'
import { getBranches } from '../../../services/agencyBranchService'
import { getOrganisationPrivateListings } from '../../../services/privateListingService'

const EMPTY_CRM_SOURCE = { contacts: [], leads: [], leadActivities: [], tasks: [] }

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeOrganisationId({ organisationSettings = null, directory = null, profile = null } = {}) {
  return String(
    organisationSettings?.organisation?.id ||
      directory?.agency?.id ||
      profile?.agencyId ||
      profile?.organisationId ||
      '',
  ).trim()
}

function getTransactionId(row = {}) {
  return normalizeText(
    row?.transaction?.id ||
      row?.transaction_id ||
      row?.transactionId ||
      row?.id,
  )
}

function getNestedTransactionRolePlayers(row = {}) {
  return [
    row?.rolePlayers,
    row?.role_players,
    row?.transactionRolePlayers,
    row?.transaction_role_players,
    row?.transaction?.rolePlayers,
    row?.transaction?.role_players,
    row?.transaction?.transactionRolePlayers,
    row?.transaction?.transaction_role_players,
  ].find(Array.isArray) || []
}

function getRolePlayerDedupKey(row = {}, transactionId = '') {
  return [
    row?.id,
    row?.transaction_id || row?.transactionId || transactionId,
    row?.role_type || row?.roleType,
    row?.partner_relationship_id || row?.partnerRelationshipId,
    row?.organisation_id || row?.organisationId,
    row?.partner_name || row?.partnerName,
    row?.email_address || row?.emailAddress || row?.email,
  ].map(normalizeText).filter(Boolean).join('::')
}

function flattenTransactionRolePlayers(transactions = []) {
  const seen = new Set()
  const rows = []
  for (const transactionRow of Array.isArray(transactions) ? transactions : []) {
    const transactionId = getTransactionId(transactionRow)
    for (const rolePlayer of getNestedTransactionRolePlayers(transactionRow)) {
      if (!rolePlayer || typeof rolePlayer !== 'object') continue
      const key = getRolePlayerDedupKey(rolePlayer, transactionId)
      if (!key || seen.has(key)) continue
      seen.add(key)
      rows.push({
        ...rolePlayer,
        transaction_id: rolePlayer.transaction_id || rolePlayer.transactionId || transactionId,
      })
    }
  }
  return rows
}

export async function loadAgentPerformanceSources({
  canManageDirectory = false,
  profile = null,
  role = '',
  directory = null,
  localPrivateListings = [],
  localPipelineRows = [],
  } = {}) {
  const [transactions, organisationSettings, organisationUsers] = await Promise.all([
    canManageDirectory
      ? fetchTransactionsListSummary({ activeTransactionsOnly: false })
      : fetchTransactionsByParticipantSummary({ userId: profile?.id, roleType: role }),
    fetchOrganisationSettings().catch(() => null),
    canManageDirectory ? listOrganisationUsers().catch(() => []) : Promise.resolve([]),
  ])

  const organisationId = normalizeOrganisationId({ organisationSettings, directory, profile })
  const [branches, crmRows, remotePrivateListings, appointments, canvassingRows] = await Promise.all([
    canManageDirectory ? getBranches().catch(() => []) : Promise.resolve([]),
    organisationId ? listAgencyCrmLeadContacts(organisationId).catch(() => EMPTY_CRM_SOURCE) : Promise.resolve(EMPTY_CRM_SOURCE),
    organisationId
      ? getOrganisationPrivateListings(organisationId, { includeRequirementsAndDocuments: false }).catch(() => localPrivateListings)
      : Promise.resolve(localPrivateListings),
    organisationId ? listAppointmentsAsync(organisationId, { includeAll: true }).catch(() => []) : Promise.resolve([]),
    organisationId ? listCanvassingWorkspace(organisationId).catch(() => ({ prospects: [], activities: [] })) : Promise.resolve({ prospects: [], activities: [] }),
  ])

  const privateListings = Array.isArray(remotePrivateListings) && remotePrivateListings.length ? remotePrivateListings : localPrivateListings
  const pipelineRows = Array.isArray(crmRows?.leads) && crmRows.leads.length ? crmRows.leads : localPipelineRows
  const transactionRows = Array.isArray(transactions) ? transactions : []

  return {
    transactions: transactionRows,
    transactionRolePlayers: flattenTransactionRolePlayers(transactionRows),
    organisationSettings,
    organisationUsers: Array.isArray(organisationUsers) ? organisationUsers : [],
    organisationId,
    branches: Array.isArray(branches) ? branches : [],
    leads: pipelineRows,
    leadActivities: Array.isArray(crmRows?.leadActivities) ? crmRows.leadActivities : [],
    tasks: Array.isArray(crmRows?.tasks) ? crmRows.tasks : [],
    appointments: Array.isArray(appointments) ? appointments : [],
    canvassingProspects: Array.isArray(canvassingRows?.prospects) ? canvassingRows.prospects : [],
    canvassingActivities: Array.isArray(canvassingRows?.activities) ? canvassingRows.activities : [],
    listings: privateListings,
  }
}
