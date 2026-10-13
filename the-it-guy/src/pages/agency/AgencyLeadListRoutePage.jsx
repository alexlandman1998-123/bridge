import Field from '../../components/ui/Field'
import AgentAssignmentSelect from '../../components/AgentAssignmentSelect'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import LeadCreateDialog from '../../components/leads/LeadCreateDialog'
import LeadsRouteShell from '../../components/leads/LeadsRouteShell'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useWorkspace } from '../../context/WorkspaceContextBase'
import { canAccessPrincipalExperience } from '../../lib/organisationAccess'
import { getAgencyLeadViewPreference, saveAgencyLeadViewPreference } from '../../lib/agencyLeadViewPreference'
import { createSellerLeadsPerformanceBaseline } from '../../services/observability/sellerLeadsPerformanceBaseline'
import LeadListPage from './LeadListPage'
import { filterAgencyLeadsForAgent } from './agencyLeadAgentScope'
import { listBuyerLeadDevelopmentOptions } from '../../services/developmentBuyerLeadService.js'
import { isDevelopmentBuyerLead } from '../../core/leads/developmentBuyerLead.js'
import {
  invalidateAgencyLeadListCache,
  listAgencyLeadListRecords,
  preloadAgencyLeadCoreRecord,
} from './agencyLeadListReadRepository'
import { preloadAgencyLeadWorkspaceRoute } from '../../routes/leadsRouteLoader'
import { writeAgencyLeadCoreCache } from './agencyLeadCoreCache'
import { seedAgencyLeadWorkspaceSnapshot } from './agencyLeadWorkspaceSnapshotCache'
import {
  AGENCY_LEAD_CATEGORY_TABS,
  DEFAULT_AGENCY_LEAD_FILTERS,
  LEAD_LIST_PAGE_SIZE,
  buildAgencyLeadListModel,
  buildAgencyLeadLandingMetrics,
  buildAgencyLeadListSummary,
  getAgencyLeadColumns,
  getAgencyLeadStageOptions,
} from './agencyLeadListModel'

const SellerLeadCreateDialog = lazy(() => import('../../components/leads/SellerLeadCreateDialog.jsx'))

const EMPTY_RECORDS = Object.freeze({ leads: [], contacts: [], activities: [], tasks: [] })
let settingsActionsPromise = null
let leadMutationActionsPromise = null

function loadSettingsActions() {
  if (!settingsActionsPromise) {
    settingsActionsPromise = import('../../lib/settingsApi').then((module) => ({
      listOrganisationUsersForWorkspace: module.listOrganisationUsersForWorkspace,
    }))
  }
  return settingsActionsPromise
}

function loadLeadMutationActions() {
  if (!leadMutationActionsPromise) {
    leadMutationActionsPromise = import('../../lib/agencyCrmRepository').then((module) => ({
      createAgencyCrmLeadActivity: module.createAgencyCrmLeadActivity,
      createAgencyCrmLeadRecord: module.createAgencyCrmLeadRecord,
      deleteAgencyCrmLeadRecord: module.deleteAgencyCrmLeadRecord,
      updateAgencyCrmLeadRecord: module.updateAgencyCrmLeadRecord,
    })).catch((error) => {
      leadMutationActionsPromise = null
      throw error
    })
  }
  return leadMutationActionsPromise
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase()
}

function toCurrentListingOption(listing = {}) {
  const id = normalizeText(listing.id)
  const status = normalizeKey(listing.listingStatus || listing.lifecycleStatus || listing.status)
  if (!id || ['archived', 'withdrawn', 'lost', 'sold', 'registered', 'closed'].some((value) => status.includes(value))) return null
  const title = normalizeText(listing.listingTitle || listing.title || listing.propertyAddress) || 'Untitled listing'
  const area = normalizeText(listing.suburb || listing.city)
  const reference = normalizeText(listing.listingReference)
  return { id, label: [title, area, reference].filter(Boolean).join(' · '), developmentId: listing.developmentId || listing.development_id || '' }
}

function resolveMembershipRole(currentMembership = {}, fallback = '') {
  return normalizeText(
    currentMembership?.workspaceRole ||
    currentMembership?.workspace_role ||
    currentMembership?.organisationRole ||
    currentMembership?.organisation_role ||
    currentMembership?.role ||
    fallback,
  ) || 'agent'
}

function resolveWorkspaceId({ currentWorkspace = {}, currentMembership = {}, workspace = {} } = {}) {
  return normalizeText(
    currentWorkspace?.organisationId ||
    currentWorkspace?.organisation_id ||
    currentWorkspace?.raw?.organisation_id ||
    currentMembership?.organisationId ||
    currentMembership?.organisation_id ||
    currentWorkspace?.id ||
    workspace?.id,
  )
}

function mapAgent(row = {}) {
  const firstName = normalizeText(row?.firstName || row?.first_name)
  const lastName = normalizeText(row?.lastName || row?.last_name)
  const email = normalizeText(row?.email).toLowerCase()
  return {
    membershipId: normalizeText(row?.organisationUserId || row?.membershipId || row?.id),
    id: normalizeText(row?.userId || row?.user_id || row?.id || email),
    userId: normalizeText(row?.userId || row?.user_id || row?.id),
    name: normalizeText(row?.fullName || row?.full_name || row?.name || [firstName, lastName].filter(Boolean).join(' ')) || email || 'Team member',
    email,
    branchId: normalizeText(row?.branchId || row?.branch_id),
    avatarUrl: normalizeText(row?.avatarUrl || row?.avatar_url || row?.profilePhotoUrl || row?.profile_photo_url || row?.photoUrl || row?.photo_url || row?.profile?.avatar_url),
    roleLabel: normalizeText(row?.jobTitle || row?.job_title || row?.roleLabel || row?.role_label) || 'Agent',
    isCurrentUser: row?.isCurrentUser === true,
  }
}

function buildVisiblePages(currentPage, totalPages) {
  const end = Math.min(totalPages, Math.max(5, currentPage + 2))
  const start = Math.max(1, end - 4)
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index)
}

export default function AgencyLeadListRoutePage({ scopedAgent = null } = {}) {
  const navigate = useNavigate()
  const { role, profile, currentWorkspace, currentMembership, workspace, organisationMembershipRole } = useWorkspace()
  const [organisationId, setOrganisationId] = useState(() => resolveWorkspaceId({ currentWorkspace, currentMembership, workspace }))
  const [membershipRole, setMembershipRole] = useState(resolveMembershipRole(currentMembership, organisationMembershipRole))
  const [records, setRecords] = useState(EMPTY_RECORDS)
  const [landingMetricLeads, setLandingMetricLeads] = useState([])
  const [agents, setAgents] = useState([])
  const [category, setCategory] = useState('buyer')
  const [filters, setFilters] = useState({ ...DEFAULT_AGENCY_LEAD_FILTERS })
  const [viewMode, setViewMode] = useState('table')
  const [page, setPage] = useState(1)
  const [totalLeadCount, setTotalLeadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [createDialog, setCreateDialog] = useState({ open: false, category: 'buyer' })
  const [sellerCaptureSource, setSellerCaptureSource] = useState('Manual Entry')
  const [sellerCaptureAgentId, setSellerCaptureAgentId] = useState('')
  const [sellerCaptureResult, setSellerCaptureResult] = useState(null)
  const [listingOptions, setListingOptions] = useState([])
  const [listingOptionsLoading, setListingOptionsLoading] = useState(false)
  const [listingOptionsError, setListingOptionsError] = useState('')
  const [developmentOptions, setDevelopmentOptions] = useState([])
  const [developmentOptionsLoading, setDevelopmentOptionsLoading] = useState(false)
  const [developmentOptionsError, setDevelopmentOptionsError] = useState('')
  const [creating, setCreating] = useState(false)
  const [archiveDialog, setArchiveDialog] = useState({ open: false, leadId: '' })
  const [archiving, setArchiving] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState({ open: false, leadId: '' })
  const [deleting, setDeleting] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [assignmentLeadId, setAssignmentLeadId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const loadRequestRef = useRef(0)
  const performanceRef = useRef(null)
  if (!performanceRef.current) performanceRef.current = createSellerLeadsPerformanceBaseline({ route: '/pipeline/leads' })

  const currentAgent = useMemo(() => mapAgent({
    id: profile?.id,
    userId: profile?.id,
    firstName: profile?.firstName,
    lastName: profile?.lastName,
    fullName: profile?.fullName,
    email: profile?.email,
    branchId: currentMembership?.branchId || currentMembership?.branch_id || profile?.branchId || profile?.branch_id,
    avatarUrl: profile?.avatarUrl || profile?.avatar_url || profile?.profilePhotoUrl || profile?.profile_photo_url || profile?.photoUrl || profile?.photo_url,
    roleLabel: profile?.jobTitle || profile?.job_title || 'Agent',
    isCurrentUser: true,
  }), [currentMembership?.branchId, currentMembership?.branch_id, profile])
  const selectedAgent = useMemo(() => scopedAgent ? mapAgent(scopedAgent) : null, [scopedAgent])
  const agentOptions = selectedAgent ? [selectedAgent] : agents.length ? agents : [currentAgent]
  const isPrincipal = canAccessPrincipalExperience({ appRole: role, membershipRole })
  const requestedAgentId = scopedAgent ? '' : searchParams.get('assignAgent') || ''
  const assignmentTarget = isPrincipal ? agentOptions.find((agent) => [agent.id, agent.membershipId].includes(requestedAgentId)) : null
  const closeAssignment = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('assignAgent')
    setSearchParams(next, { replace: true })
    setAssignmentLeadId('')
  }
  const deferredFilters = useDeferredValue(filters)

  useEffect(() => {
    const workspaceId = resolveWorkspaceId({ currentWorkspace, currentMembership, workspace })
    if (workspaceId) setOrganisationId(workspaceId)
    setMembershipRole(resolveMembershipRole(currentMembership, organisationMembershipRole))
  }, [currentMembership, currentWorkspace, organisationMembershipRole, workspace])

  useEffect(() => {
    setViewMode(getAgencyLeadViewPreference({ userId: profile?.id, workspaceId: organisationId }))
  }, [organisationId, profile?.id])

  useEffect(() => {
    if (!createDialog.open || createDialog.category !== 'buyer' || !organisationId) return undefined
    let cancelled = false
    setListingOptions([])
    setListingOptionsError('')
    setListingOptionsLoading(true)
    async function loadListings() {
      try {
        const { getOrganisationPrivateListings } = await import('../../services/privateListingService')
        const listings = await getOrganisationPrivateListings(organisationId, { includeRequirementsAndDocuments: false })
        if (!cancelled) setListingOptions(listings.map(toCurrentListingOption).filter(Boolean))
      } catch {
        if (!cancelled) setListingOptionsError('Listings could not be loaded. Close and reopen this form to retry.')
      } finally {
        if (!cancelled) setListingOptionsLoading(false)
      }
    }
    void loadListings()
    return () => { cancelled = true }
  }, [createDialog.open, createDialog.category, organisationId])

  useEffect(() => {
    if (!createDialog.open || createDialog.category !== 'development' || !organisationId) return undefined
    let cancelled = false
    setDevelopmentOptions([])
    setDevelopmentOptionsError('')
    setDevelopmentOptionsLoading(true)
    void listBuyerLeadDevelopmentOptions(organisationId).then((options) => {
      if (!cancelled) setDevelopmentOptions(options)
    }).catch(() => {
      if (!cancelled) setDevelopmentOptionsError('Developments could not be loaded. Close and reopen this form to retry.')
    }).finally(() => {
      if (!cancelled) setDevelopmentOptionsLoading(false)
    })
    return () => { cancelled = true }
  }, [createDialog.open, createDialog.category, organisationId])

  const handleViewModeChange = useCallback((nextViewMode) => {
    const preference = saveAgencyLeadViewPreference({ userId: profile?.id, workspaceId: organisationId }, nextViewMode)
    setViewMode(preference)
  }, [organisationId, profile?.id])

  const loadLeads = useCallback(async ({ forceRefresh = false, requestedPage = page } = {}) => {
    const requestId = ++loadRequestRef.current
    setRefreshing(true)
    setError('')
    try {
      let workspaceId = normalizeText(organisationId || resolveWorkspaceId({ currentWorkspace, currentMembership, workspace }))
      if (!workspaceId) {
        setLoading(true)
        return
      }
      const selectedOrganisationId = normalizeText(scopedAgent?.organisationId || scopedAgent?.organisation_id)
      if (scopedAgent && selectedOrganisationId !== workspaceId) {
        throw new Error('This agent is not in the current organisation. Open their organisation before loading leads.')
      }
      setOrganisationId(workspaceId)

      const primary = await listAgencyLeadListRecords(workspaceId, {
        includeRelatedRecords: false,
        forceRefresh,
        page: Math.max(0, requestedPage - 1),
        pageSize: LEAD_LIST_PAGE_SIZE,
        scopedAgent,
        category,
        filters: deferredFilters,
      })
      if (requestId !== loadRequestRef.current) return
      setRecords({
        leads: filterAgencyLeadsForAgent(Array.isArray(primary?.leads) ? primary.leads : [], scopedAgent, workspaceId),
        contacts: Array.isArray(primary?.contacts) ? primary.contacts : [],
        sources: primary?.sources,
        activities: [],
        tasks: [],
      })
      setTotalLeadCount(Number(primary?.totalCount || 0))
      if (Number.isFinite(primary?.page) && primary.page + 1 !== requestedPage) setPage(primary.page + 1)
      setLandingMetricLeads(filterAgencyLeadsForAgent(primary?.metricLeads || primary?.leads || [], scopedAgent, workspaceId))
      setLoading(false)
      void performanceRef.current?.recordCheckpoint({ checkpoint: 'first_data', userId: profile?.id, workspaceId, metadata: { surface: 'lead_list', leadCount: primary?.leads?.length || 0, totalLeadCount: primary?.totalCount || 0, page: requestedPage } })

      if (isPrincipal && !scopedAgent) {
        void loadSettingsActions()
          .then(({ listOrganisationUsersForWorkspace }) => listOrganisationUsersForWorkspace({ organisationId: workspaceId }))
          .then((organisationUsers) => {
            if (requestId !== loadRequestRef.current) return
            const mappedAgents = (Array.isArray(organisationUsers) ? organisationUsers : []).map(mapAgent).filter((agent) => agent.id)
            setAgents(mappedAgents.length ? mappedAgents : [currentAgent])
          })
          .catch(() => {
            // The current user remains a safe assignment fallback when the
            // optional directory request is unavailable.
          })
      }
      void performanceRef.current?.recordCheckpoint({ checkpoint: 'background_settled', userId: profile?.id, workspaceId, metadata: { surface: 'lead_list', deferredRelatedRecords: true, directoryDeferred: isPrincipal } })
    } catch (loadError) {
      if (requestId !== loadRequestRef.current) return
      setError(loadError?.message || 'Unable to load leads right now.')
      setLoading(false)
    } finally {
      if (requestId === loadRequestRef.current) setRefreshing(false)
    }
  }, [category, currentAgent, currentMembership, currentWorkspace, deferredFilters, isPrincipal, organisationId, page, profile?.id, scopedAgent, workspace])

  useEffect(() => {
    void loadLeads({ requestedPage: page })
    return () => { loadRequestRef.current += 1 }
  }, [loadLeads, page])

  const listModel = useMemo(() => buildAgencyLeadListModel({
    leads: records.leads,
    contacts: records.contacts,
    activities: records.activities,
    tasks: records.tasks,
    category,
    filters: deferredFilters,
  }), [category, deferredFilters, records])
  const summaryModel = useMemo(() => buildAgencyLeadListSummary({ ...records, leads: landingMetricLeads }), [landingMetricLeads, records])
  const landingMetrics = useMemo(() => buildAgencyLeadLandingMetrics(landingMetricLeads), [landingMetricLeads])
  const totalPages = Math.max(1, Math.ceil(totalLeadCount / LEAD_LIST_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = listModel.rows.length ? (currentPage - 1) * LEAD_LIST_PAGE_SIZE + 1 : 0
  const pageEnd = pageStart ? pageStart + listModel.rows.length - 1 : 0
  const pageRows = listModel.rows
  const sources = useMemo(() => records.sources || [...new Set(records.leads.map((lead) => normalizeText(lead?.leadSource)).filter(Boolean))].sort(), [records])
  const categoryTitle = category === 'seller' ? 'Seller Leads' : category === 'archived' ? 'Archived Leads' : category === 'development' ? 'Development Leads' : 'Buyer Leads'

  const handleCreateLead = async (form) => {
    if (!organisationId || creating) return
    const selectedListing = listingOptions.find((listing) => listing.id === normalizeText(form.listingId))
    const selectedDevelopment = developmentOptions.find((development) => development.id === normalizeText(form.developmentId))
    if (form.category === 'development' && !selectedDevelopment) {
      setError('Select a development from the list.')
      return
    }
    const leadCategory = form.category === 'seller' ? 'seller' : 'buyer'
    if (form.category === 'buyer' && form.listingId && !selectedListing) {
      setError('Select a current listing from the list.')
      return
    }
    setCreating(true)
    setError('')
    try {
      const { createAgencyCrmLeadActivity, createAgencyCrmLeadRecord } = await loadLeadMutationActions()
      const assignedAgent = selectedAgent || agentOptions.find((agent) => normalizeKey(agent.id) === normalizeKey(form.agentId)) || currentAgent
      const createdRecord = await createAgencyCrmLeadRecord(organisationId, {
        contact: { firstName: form.firstName, lastName: form.lastName, phone: form.phone, email: form.email, notes: form.notes, contactType: leadCategory },
        assignedAgent,
        assignedUserId: assignedAgent.userId || assignedAgent.id,
        createdBy: currentAgent.userId || currentAgent.id,
        leadCategory,
        leadDirection: 'Inbound',
        leadSource: form.source,
        stage: 'New Lead',
        priority: 'Medium',
        propertyInterest: leadCategory === 'buyer' ? normalizeText(form.property || selectedListing?.label || selectedDevelopment?.label) : '',
        listingId: form.category === 'buyer' ? selectedListing?.id || '' : '',
        sellerPropertyAddress: form.category === 'seller' ? form.property : '',
        ...(selectedDevelopment ? { rawEnquiryPayload: { development_id: selectedDevelopment.id } } : {}),
        notes: form.notes,
      }, { actor: currentAgent })
      const created = { ...createdRecord, ...(selectedDevelopment || selectedListing?.developmentId ? { developmentId: selectedDevelopment?.id || selectedListing.developmentId } : {}) }
      const createdContact = {
        contactId: created.contactId,
        organisationId,
        assignedAgentId: created.assignedAgentId,
        assignedAgentName: created.assignedAgentName,
        assignedAgentEmail: created.assignedAgentEmail,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        contactType: leadCategory,
        notes: form.notes.trim(),
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      }
      const createdCore = { lead: created, contact: createdContact, source: 'lead_created' }
      writeAgencyLeadCoreCache(organisationId, created.leadId, createdCore)
      seedAgencyLeadWorkspaceSnapshot(organisationId, created.leadId, createdCore, 'lead_created')
      // The lead is already durable at this point. Keep audit logging and the
      // reconciliation read off the interaction-critical path.
      void createAgencyCrmLeadActivity(organisationId, created.leadId, { agent: currentAgent, activityType: 'Lead Created', activityNote: 'Manual lead captured', outcome: 'Created' }, { actor: currentAgent }).catch(() => null)
      setRecords((previous) => ({
        ...previous,
        leads: [created, ...(previous.leads || []).filter((lead) => normalizeText(lead?.leadId) !== normalizeText(created.leadId))],
        contacts: [createdContact, ...(previous.contacts || []).filter((contact) => normalizeText(contact?.contactId) !== normalizeText(createdContact.contactId))],
      }))
      setTotalLeadCount((count) => count + 1)
      setCreateDialog((previous) => ({ ...previous, open: false }))
      setCategory(isDevelopmentBuyerLead(created) ? 'development' : leadCategory)
      setPage(1)
      setMessage('Lead created.')
      invalidateAgencyLeadListCache(organisationId)
      void loadLeads({ forceRefresh: true, requestedPage: 1 })
    } catch (createError) {
      setError(createError?.message || 'Unable to create this lead.')
    } finally {
      setCreating(false)
    }
  }

  const handleArchiveLead = async (leadId) => {
    if (!leadId || archiving) return
    setArchiving(true)
    setError('')
    try {
      const { updateAgencyCrmLeadRecord } = await loadLeadMutationActions()
      await updateAgencyCrmLeadRecord(organisationId, leadId, { stage: 'Archived', status: 'Archived' })
      setArchiveDialog({ open: false, leadId: '' })
      setMessage('Lead archived.')
      invalidateAgencyLeadListCache(organisationId, leadId)
      await loadLeads({ forceRefresh: true })
    } catch (archiveError) {
      setError(archiveError?.message || 'Unable to archive this lead.')
    } finally {
      setArchiving(false)
    }
  }

  const handleAssignLead = async () => {
    if (!isPrincipal || !assignmentTarget || !assignmentLeadId || assigning) return
    setAssigning(true)
    setError('')
    try {
      const { updateAgencyCrmLeadRecord } = await loadLeadMutationActions()
      await updateAgencyCrmLeadRecord(organisationId, assignmentLeadId, {
        assignedAgent: assignmentTarget,
        assignedUserId: assignmentTarget.userId || assignmentTarget.id,
        assignedAgentId: assignmentTarget.userId || assignmentTarget.id,
        assignedAgentEmail: assignmentTarget.email,
      }, { actor: currentAgent })
      invalidateAgencyLeadListCache(organisationId, assignmentLeadId)
      setMessage(`Lead assigned to ${assignmentTarget.name}.`)
      closeAssignment()
      await loadLeads({ forceRefresh: true })
    } catch (assignmentError) {
      setError(assignmentError?.message || 'Unable to assign this lead.')
    } finally {
      setAssigning(false)
    }
  }

  const handleDeleteLead = async (leadId) => {
    if (!leadId || deleting) return
    setDeleting(true)
    setError('')
    try {
      const { deleteAgencyCrmLeadRecord } = await loadLeadMutationActions()
      await deleteAgencyCrmLeadRecord(organisationId, leadId)
      setDeleteDialog({ open: false, leadId: '' })
      setMessage('Lead deleted.')
      invalidateAgencyLeadListCache(organisationId, leadId)
      await loadLeads({ forceRefresh: true })
    } catch (deleteError) {
      setError(deleteError?.message || 'Unable to delete this lead.')
    } finally {
      setDeleting(false)
    }
  }

  const handleMoveLead = async (leadId, columnId) => {
    const target = getAgencyLeadColumns(category).find((column) => column.id === columnId)
    if (!target) return
    const previous = records.leads
    setRecords((snapshot) => ({ ...snapshot, leads: snapshot.leads.map((lead) => normalizeText(lead?.leadId) === leadId ? { ...lead, stage: target.stageValue, status: target.stageValue, updatedAt: new Date().toISOString() } : lead) }))
    try {
      const { createAgencyCrmLeadActivity, updateAgencyCrmLeadRecord } = await loadLeadMutationActions()
      await updateAgencyCrmLeadRecord(organisationId, leadId, { stage: target.stageValue, status: target.stageValue })
      await createAgencyCrmLeadActivity(organisationId, leadId, { agent: currentAgent, activityType: 'Stage Change', activityNote: `Pipeline stage moved to ${target.label}`, outcome: target.stageValue }, { actor: currentAgent }).catch(() => null)
      setMessage(`Moved to ${target.label}.`)
      invalidateAgencyLeadListCache(organisationId, leadId)
    } catch (moveError) {
      setRecords((snapshot) => ({ ...snapshot, leads: previous }))
      setError(moveError?.message || 'Unable to move this lead.')
    }
  }

  const handleLeadIntent = useCallback((leadId) => {
    if (!organisationId || !leadId) return
    void preloadAgencyLeadCoreRecord(organisationId, leadId).catch(() => {})
    void preloadAgencyLeadWorkspaceRoute({ organisationId, leadId })
  }, [organisationId])

  if (loading) return <LeadsRouteShell />

  return (
    <section className="min-w-0 space-y-4">
      {requestedAgentId ? (
        <section className="rounded-xl border border-[#dbe4ee] bg-white p-4 space-y-3" aria-label="Assign lead">
          <p className="font-semibold">{assignmentTarget ? `Assign a lead to ${assignmentTarget.name}` : 'The selected agent is unavailable or you do not have assignment access.'}</p>
          {assignmentTarget ? <label className="grid gap-2 text-sm">Choose a lead from this page (use the filters or pagination below to find another)
            <select className="rounded-lg border p-2" value={assignmentLeadId} onChange={(event) => setAssignmentLeadId(event.target.value)} disabled={assigning}>
              <option value="">Select a lead</option>
              {pageRows.map((row) => <option key={row.leadId || row.id} value={row.leadId || row.id}>{row.name}</option>)}
            </select>
          </label> : null}
          <div className="flex gap-3">
            {assignmentTarget ? <button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-50" disabled={assigning || !assignmentLeadId} onClick={() => void handleAssignLead()}>{assigning ? 'Assigning…' : 'Assign lead'}</button> : null}
            <button type="button" disabled={assigning} onClick={closeAssignment}>Cancel assignment</button>
          </div>
        </section>
      ) : null}
      {error ? <p className="rounded-[14px] border border-[#f2cccc] bg-[#fff5f4] px-4 py-2 text-sm text-[#9f3028]">{error}</p> : message ? <p className="rounded-[14px] border border-[#cfe8dc] bg-[#effaf3] px-4 py-2 text-sm text-[#26724c]">{message}</p> : null}
      <LeadListPage
        metrics={landingMetrics}
        filters={filters}
        sources={sources}
        stages={getAgencyLeadStageOptions(category)}
        agents={agentOptions}
        isPrincipal={isPrincipal && !scopedAgent}
        category={category}
        categoryLabel={category === 'seller' ? 'Seller' : category === 'development' ? 'Development' : 'Buyer'}
        categoryTitle={categoryTitle}
        categoryCounts={landingMetrics.categoryCounts}
        categoryTabs={AGENCY_LEAD_CATEGORY_TABS}
        summary={{ total: landingMetrics.categoryCounts[category] || totalLeadCount, filtered: totalLeadCount, newThisWeek: summaryModel.metrics.newThisWeek }}
        sellerJourneyMetrics={summaryModel.sellerJourneyMetrics}
        operationalSummary={summaryModel.operationalSummary}
        showDaySummary={summaryModel.showDaySummary}
        showDayPrompt="Contact show-day visitors while the property is still fresh and capture their next step."
        rows={pageRows}
        kanbanColumns={listModel.columns}
        viewMode={viewMode}
        currentPage={currentPage}
        totalPages={totalPages}
        visiblePages={buildVisiblePages(currentPage, totalPages)}
        pageStart={pageStart}
        pageEnd={pageEnd}
        onFiltersChange={(patch) => { setPage(1); setFilters((previous) => ({ ...previous, ...patch })) }}
        onResetFilters={() => { setPage(1); setFilters({ ...DEFAULT_AGENCY_LEAD_FILTERS }) }}
        onCategoryChange={(nextCategory) => {
          setPage(1)
          setCategory(nextCategory)
          setFilters((previous) => ({ ...previous, stage: 'all' }))
        }}
        onViewModeChange={handleViewModeChange}
        refreshing={refreshing}
        onRefresh={() => void loadLeads({ forceRefresh: true, requestedPage: currentPage })}
        onPageChange={(nextPage) => setPage(Math.max(1, Math.min(Number(nextPage) || 1, totalPages)))}
        onAddLead={(nextCategory) => {
          void loadLeadMutationActions().catch(() => null)
          setError('')
          setCreateDialog({ open: true, category: ['seller', 'development'].includes(nextCategory) ? nextCategory : 'buyer' })
        }}
        onLeadIntent={handleLeadIntent}
        onOpenLead={(leadId) => {
          handleLeadIntent(leadId)
          navigate(`/pipeline/leads/${encodeURIComponent(leadId)}`)
        }}
        onArchiveLead={(leadId) => { setError(''); setArchiveDialog({ open: true, leadId }) }}
        onDeleteLead={(leadId) => { setError(''); setDeleteDialog({ open: true, leadId }) }}
        onMoveLead={(leadId, columnId) => void handleMoveLead(leadId, columnId)}
        onOpenShowDayQueue={() => { setPage(1); setFilters((previous) => ({ ...previous, source: 'Show Day' })) }}
        onOpenShowDayLead={(row, tab) => {
          const leadId = row.leadId || row.id
          handleLeadIntent(leadId)
          navigate(`/pipeline/leads/${encodeURIComponent(leadId)}?tab=${encodeURIComponent(tab || 'activity')}`)
        }}
      />
      {createDialog.open && createDialog.category !== 'seller' ? <LeadCreateDialog open category={createDialog.category} agents={agentOptions} currentAgent={selectedAgent || currentAgent} showAgentAssignment={!scopedAgent} listingOptions={listingOptions} listingOptionsLoading={listingOptionsLoading} listingOptionsError={listingOptionsError} developmentOptions={developmentOptions} developmentOptionsLoading={developmentOptionsLoading} developmentOptionsError={developmentOptionsError} saving={creating} error={error} onClose={() => setCreateDialog((previous) => ({ ...previous, open: false }))} onSave={(form) => void handleCreateLead(form)} /> : null}
      {createDialog.open && createDialog.category === 'seller' ? <Suspense fallback={<p role="status">Opening seller form…</p>}>
        <SellerLeadCreateDialog organisationId={organisationId} actor={currentAgent}
          assignedAgent={selectedAgent || agentOptions.find(agent => agent.id === sellerCaptureAgentId) || currentAgent}
          source={sellerCaptureSource} priority="Medium"
          metadataControls={<div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold">How did this lead find you?
              <Field value={sellerCaptureSource} onChange={event => setSellerCaptureSource(event.target.value)} />
            </label>
            {!scopedAgent ? <AgentAssignmentSelect compact value={sellerCaptureAgentId || currentAgent.id} agents={agentOptions} onChange={agent => setSellerCaptureAgentId(agent?.id || '')} /> : null}
          </div>}
          onClose={() => { setCreateDialog(previous => ({ ...previous, open: false })); invalidateAgencyLeadListCache(organisationId); void loadLeads({ forceRefresh: true }) }}
          onCreated={(receipt, reportedProgress) => {
            setCreateDialog(previous => ({ ...previous, open: false }))
            setSellerCaptureResult({ leadId: receipt.leadId, reportedProgress })
            invalidateAgencyLeadListCache(organisationId)
            void loadLeads({ forceRefresh: true, requestedPage: 1 })
          }} />
      </Suspense> : null}
      <Modal open={Boolean(sellerCaptureResult)} title="Seller lead saved" subtitle="The seller’s link uses these same answers and documents." onClose={() => setSellerCaptureResult(null)}>
        <p className="text-sm">Choose your next step. Sending the link needs an email address. Documents still need review before the next stage is confirmed.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => { navigate(`/pipeline/leads/${encodeURIComponent(sellerCaptureResult.leadId)}?captureNext=send_link`); setSellerCaptureResult(null) }}>Send seller’s link</Button>
          {sellerCaptureResult?.reportedProgress === 'We already have a signed mandate' ? <Button type="button" variant="secondary" onClick={() => { navigate(`/pipeline/leads/${encodeURIComponent(sellerCaptureResult.leadId)}?tab=documents`); setSellerCaptureResult(null) }}>Open documents for upload and review</Button> : null}
          <Button type="button" variant="secondary" onClick={() => { navigate(`/pipeline/leads/${encodeURIComponent(sellerCaptureResult.leadId)}`); setSellerCaptureResult(null) }}>Open seller lead</Button>
        </div>
      </Modal>
      <ConfirmDialog
        open={archiveDialog.open}
        title={`Archive ${category === 'seller' ? 'seller' : 'buyer'} lead?`}
        description="This removes the lead from active pipeline views while preserving its CRM history."
        confirmLabel="Archive lead"
        confirming={archiving}
        onCancel={() => setArchiveDialog({ open: false, leadId: '' })}
        onConfirm={() => void handleArchiveLead(archiveDialog.leadId)}
      />
      <ConfirmDialog
        open={deleteDialog.open}
        title={`Delete ${category === 'seller' ? 'seller' : 'buyer'} lead?`}
        description="This permanently removes the lead and its related CRM records from the organisation. This cannot be undone."
        confirmLabel="Delete lead"
        variant="destructive"
        confirming={deleting}
        onCancel={() => setDeleteDialog({ open: false, leadId: '' })}
        onConfirm={() => void handleDeleteLead(deleteDialog.leadId)}
      />
    </section>
  )
}
