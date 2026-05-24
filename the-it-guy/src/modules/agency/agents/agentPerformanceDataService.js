import { fetchTransactionsByParticipantSummary, fetchTransactionsListSummary } from '../../../lib/api'
import { listAgencyCrmLeadContacts } from '../../../lib/agencyCrmRepository'
import { listAppointmentsAsync } from '../../../lib/agencyPipelineService'
import { fetchOrganisationSettings, listOrganisationUsers } from '../../../lib/settingsApi'
import { getBranches } from '../../../services/agencyBranchService'
import { getOrganisationPrivateListings } from '../../../services/privateListingService'

const EMPTY_CRM_SOURCE = { contacts: [], leads: [], leadActivities: [], tasks: [] }

function normalizeOrganisationId({ organisationSettings = null, directory = null, profile = null } = {}) {
  return String(
    organisationSettings?.organisation?.id ||
      directory?.agency?.id ||
      profile?.agencyId ||
      profile?.organisationId ||
      '',
  ).trim()
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
  const [branches, crmRows, remotePrivateListings, appointments] = await Promise.all([
    canManageDirectory ? getBranches().catch(() => []) : Promise.resolve([]),
    organisationId ? listAgencyCrmLeadContacts(organisationId).catch(() => EMPTY_CRM_SOURCE) : Promise.resolve(EMPTY_CRM_SOURCE),
    organisationId
      ? getOrganisationPrivateListings(organisationId, { includeRequirementsAndDocuments: false }).catch(() => localPrivateListings)
      : Promise.resolve(localPrivateListings),
    organisationId ? listAppointmentsAsync(organisationId, { includeAll: true }).catch(() => []) : Promise.resolve([]),
  ])

  const privateListings = Array.isArray(remotePrivateListings) && remotePrivateListings.length ? remotePrivateListings : localPrivateListings
  const pipelineRows = Array.isArray(crmRows?.leads) && crmRows.leads.length ? crmRows.leads : localPipelineRows

  return {
    transactions: Array.isArray(transactions) ? transactions : [],
    organisationSettings,
    organisationUsers: Array.isArray(organisationUsers) ? organisationUsers : [],
    organisationId,
    branches: Array.isArray(branches) ? branches : [],
    leads: pipelineRows,
    leadActivities: Array.isArray(crmRows?.leadActivities) ? crmRows.leadActivities : [],
    tasks: Array.isArray(crmRows?.tasks) ? crmRows.tasks : [],
    appointments: Array.isArray(appointments) ? appointments : [],
    listings: privateListings,
  }
}
