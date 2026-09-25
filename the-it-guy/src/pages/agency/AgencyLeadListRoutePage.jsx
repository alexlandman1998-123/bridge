import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import LeadCreateDialog from '../../components/leads/LeadCreateDialog'
import LeadsRouteShell from '../../components/leads/LeadsRouteShell'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useWorkspace } from '../../context/WorkspaceContextBase'
import { canAccessPrincipalExperience } from '../../lib/organisationAccess'
import { getAgencyLeadViewPreference, saveAgencyLeadViewPreference } from '../../lib/agencyLeadViewPreference'
import { createSellerLeadsPerformanceBaseline } from '../../services/observability/sellerLeadsPerformanceBaseline'
import LeadListPage from './LeadListPage'
import {
  invalidateAgencyLeadListCache,
  listAgencyLeadLandingMetrics,
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
    membershipId: normalizeText(row?.id),
    id: normalizeText(row?.userId || row?.user_id || row?.id || email),
    userId: normalizeText(row?.userId || row?.user_id || row?.id),
    name: normalizeText(row?.fullName || row?.full_name || [firstName, lastName].filter(Boolean).join(' ')) || email || 'Team member',
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

export default function AgencyLeadListRoutePage() {
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
  const agentOptions = agents.length ? agents : [currentAgent]
  const isPrincipal = canAccessPrincipalExperience({ appRole: role, membershipRole })
  const requestedAgentId = searchParams.get('assignAgent') || ''
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
      setOrganisationId(workspaceId)

      const landingMetricsRequest = listAgencyLeadLandingMetrics(workspaceId, { forceRefresh }).catch(() => null)
      const primary = await listAgencyLeadListRecords(workspaceId, {
        includeRelatedRecords: false,
        forceRefresh,
        page: Math.max(0, requestedPage - 1),
        pageSize: LEAD_LIST_PAGE_SIZE,
      })
      if (requestId !== loadRequestRef.current) return
      setRecords({
        leads: Array.isArray(primary?.leads) ? primary.leads : [],
        contacts: Array.isArray(primary?.contacts) ? primary.contacts : [],
        activities: [],
        tasks: [],
      })
      setTotalLeadCount(Number(primary?.totalCount || 0))
      setLoading(false)
      void landingMetricsRequest
        .then((landingMetrics) => {
          if (requestId === loadRequestRef.current) setLandingMetricLeads(Array.isArray(landingMetrics?.leads) ? landingMetrics.leads : [])
        })
      void performanceRef.current?.recordCheckpoint({ checkpoint: 'first_data', userId: profile?.id, workspaceId, metadata: { surface: 'lead_list', leadCount: primary?.leads?.length || 0, totalLeadCount: primary?.totalCount || 0, page: requestedPage } })

      if (isPrincipal) {
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
  }, [currentAgent, currentMembership, currentWorkspace, isPrincipal, organisationId, page, profile?.id, workspace])

  useEffect(() => { void loadLeads({ requestedPage: page }) }, [loadLeads, page])

  const listModel = useMemo(() => buildAgencyLeadListModel({
    leads: records.leads,
    contacts: records.contacts,
    activities: records.activities,
    tasks: records.tasks,
    category,
    filters: deferredFilters,
  }), [category, deferredFilters, records])
  const summaryModel = useMemo(() => buildAgencyLeadListSummary(records), [records])
  const landingMetrics = useMemo(() => buildAgencyLeadLandingMetrics(landingMetricLeads), [landingMetricLeads])
  const totalPages = Math.max(1, Math.ceil(totalLeadCount / LEAD_LIST_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = listModel.rows.length ? (currentPage - 1) * LEAD_LIST_PAGE_SIZE + 1 : 0
  const pageEnd = pageStart ? pageStart + listModel.rows.length - 1 : 0
  const pageRows = listModel.rows
  const sources = useMemo(() => [...new Set(records.leads.map((lead) => normalizeText(lead?.leadSource)).filter(Boolean))].sort(), [records.leads])
  const categoryTitle = category === 'seller' ? 'Seller Leads' : category === 'archived' ? 'Archived Leads' : 'Buyer Leads'

  const handleCreateLead = async (form) => {
    if (!organisationId || creating) return
    setCreating(true)
    setError('')
    try {
      const { createAgencyCrmLeadActivity, createAgencyCrmLeadRecord } = await loadLeadMutationActions()
      const assignedAgent = agentOptions.find((agent) => normalizeKey(agent.id) === normalizeKey(form.agentId)) || currentAgent
      const created = await createAgencyCrmLeadRecord(organisationId, {
        contact: { firstName: form.firstName, lastName: form.lastName, phone: form.phone, email: form.email, notes: form.notes, contactType: form.category },
        assignedAgent,
        assignedUserId: assignedAgent.userId || assignedAgent.id,
        createdBy: currentAgent.userId || currentAgent.id,
        leadCategory: form.category,
        leadDirection: 'Inbound',
        leadSource: form.source,
        stage: 'New Lead',
        priority: 'Medium',
        propertyInterest: form.category === 'buyer' ? form.property : '',
        sellerPropertyAddress: form.category === 'seller' ? form.property : '',
        notes: form.notes,
      }, { actor: currentAgent })
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
        contactType: form.category,
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
      setCategory(form.category)
      setMessage('Lead created.')
      invalidateAgencyLeadListCache(organisationId)
      void loadLeads({ forceRefresh: true })
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
        isPrincipal={isPrincipal}
        category={category}
        categoryLabel={category === 'seller' ? 'Seller' : 'Buyer'}
        categoryTitle={categoryTitle}
        categoryCounts={landingMetrics.categoryCounts}
        categoryTabs={AGENCY_LEAD_CATEGORY_TABS}
        summary={{ total: totalLeadCount, filtered: listModel.rows.length, newThisWeek: summaryModel.metrics.newThisWeek }}
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
        onCategoryChange={(nextCategory) => { setPage(1); setCategory(nextCategory) }}
        onViewModeChange={handleViewModeChange}
        refreshing={refreshing}
        onRefresh={() => void loadLeads({ forceRefresh: true, requestedPage: currentPage })}
        onPageChange={(nextPage) => setPage(Math.max(1, Math.min(Number(nextPage) || 1, totalPages)))}
        onAddLead={(nextCategory) => {
          void loadLeadMutationActions().catch(() => null)
          setError('')
          setCreateDialog({ open: true, category: nextCategory === 'seller' ? 'seller' : 'buyer' })
        }}
        onLeadIntent={handleLeadIntent}
        onOpenLead={(leadId) => {
          handleLeadIntent(leadId)
          navigate(`/pipeline/leads/${encodeURIComponent(leadId)}`)
        }}
        onArchiveLead={(leadId) => { setError(''); setArchiveDialog({ open: true, leadId }) }}
        onDeleteLead={(leadId) => { setError(''); setDeleteDialog({ open: true, leadId }) }}
        onMoveLead={(leadId, columnId) => void handleMoveLead(leadId, columnId)}
        onOpenShowDayQueue={() => setFilters((previous) => ({ ...previous, source: 'Show Day' }))}
        onOpenShowDayLead={(row, tab) => {
          const leadId = row.leadId || row.id
          handleLeadIntent(leadId)
          navigate(`/pipeline/leads/${encodeURIComponent(leadId)}?tab=${encodeURIComponent(tab || 'activity')}`)
        }}
      />
      {createDialog.open ? <LeadCreateDialog open category={createDialog.category} agents={agentOptions} currentAgent={currentAgent} saving={creating} error={error} onClose={() => setCreateDialog((previous) => ({ ...previous, open: false }))} onSave={(form) => void handleCreateLead(form)} /> : null}
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
