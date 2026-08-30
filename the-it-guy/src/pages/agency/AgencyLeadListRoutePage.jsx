import { RefreshCw, X } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AgentAssignmentSelect from '../../components/AgentAssignmentSelect'
import LeadsRouteShell from '../../components/leads/LeadsRouteShell'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canAccessPrincipalExperience } from '../../lib/organisationAccess'
import { createSellerLeadsPerformanceBaseline } from '../../services/observability/sellerLeadsPerformanceBaseline'
import LeadListPage from './LeadListPage'
import {
  invalidateAgencyLeadListCache,
  listAgencyLeadListRecords,
  preloadAgencyLeadCoreRecord,
} from './agencyLeadListReadRepository'
import { preloadAgencyLeadWorkspace } from './agencyLeadWorkspaceLoader'
import {
  AGENCY_LEAD_CATEGORY_TABS,
  DEFAULT_AGENCY_LEAD_FILTERS,
  LEAD_LIST_PAGE_SIZE,
  buildAgencyLeadListModel,
  buildAgencyLeadListSummary,
  getAgencyLeadColumns,
  getAgencyLeadStageOptions,
} from './agencyLeadListModel'

const EMPTY_RECORDS = Object.freeze({ leads: [], contacts: [], activities: [], tasks: [] })
const EMPTY_FORM = Object.freeze({
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  category: 'buyer',
  source: 'Other',
  property: '',
  notes: '',
})
const LEAD_SOURCE_OPTIONS = Object.freeze([
  'Property24',
  'Private Property',
  'Website',
  'Referral',
  'Show Day',
  'Walk-In',
  'WhatsApp',
  'Facebook',
  'Google',
  'Signboard',
  'Listing Call',
  'Cold Call',
  'Door Knock',
  'Manual Entry',
  'Other',
])
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

function LeadCreateDialog({ open, category, agents, currentAgent, saving, error, onClose, onSave }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, category })

  useEffect(() => {
    if (open) setForm({ ...EMPTY_FORM, category, agentId: currentAgent.id })
  }, [category, currentAgent.id, open])

  if (!open) return null
  const setField = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-[#102033]/50 p-3 backdrop-blur-[2px] sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[22px] border border-[#dbe7f2] bg-white shadow-[0_30px_80px_rgba(16,32,51,0.24)] sm:max-h-[calc(100vh-3rem)]" role="dialog" aria-modal="true" aria-labelledby="create-lead-title">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#e7eef5] bg-[#fbfdff] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="create-lead-title" className="text-xl font-semibold tracking-[-0.025em] text-[#142132]">Add {category === 'seller' ? 'Seller' : 'Buyer'} Lead</h2>
            <p className="mt-1 text-sm leading-5 text-[#60758b]">Capture the contact details now and complete the full workspace afterwards.</p>
          </div>
          <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border border-[#dbe4ee] bg-white text-[#31506b] transition hover:border-[#b9cde3] hover:bg-[#f5f8fb]" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </header>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); onSave(form) }}>
          <div className="grid min-h-0 gap-4 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]">First name<input required autoFocus className="h-10 min-w-0 rounded-[11px] border border-[#dbe4ee] px-3 font-normal outline-none transition focus:border-[#22445e] focus:ring-2 focus:ring-[#22445e]/10" value={form.firstName} onChange={(event) => setField('firstName', event.target.value)} /></label>
              <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]">Last name<input required className="h-10 min-w-0 rounded-[11px] border border-[#dbe4ee] px-3 font-normal outline-none transition focus:border-[#22445e] focus:ring-2 focus:ring-[#22445e]/10" value={form.lastName} onChange={(event) => setField('lastName', event.target.value)} /></label>
              <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]">Mobile<input required inputMode="tel" className="h-10 min-w-0 rounded-[11px] border border-[#dbe4ee] px-3 font-normal outline-none transition focus:border-[#22445e] focus:ring-2 focus:ring-[#22445e]/10" value={form.phone} onChange={(event) => setField('phone', event.target.value)} /></label>
              <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]">Email<input required type="email" className="h-10 min-w-0 rounded-[11px] border border-[#dbe4ee] px-3 font-normal outline-none transition focus:border-[#22445e] focus:ring-2 focus:ring-[#22445e]/10" value={form.email} onChange={(event) => setField('email', event.target.value)} /></label>
              <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]">
                Lead source
                <select required className="h-10 min-w-0 rounded-[11px] border border-[#dbe4ee] bg-white px-3 font-normal text-[#29435d] outline-none transition focus:border-[#22445e] focus:ring-2 focus:ring-[#22445e]/10" value={form.source} onChange={(event) => setField('source', event.target.value)}>
                  {LEAD_SOURCE_OPTIONS.map((source) => <option key={source} value={source}>{source}</option>)}
                </select>
              </label>
              <div className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]">
                <span>Assigned to</span>
                <AgentAssignmentSelect
                  compact
                  value={form.agentId || currentAgent.id}
                  agents={agents}
                  onChange={(agent) => setField('agentId', agent?.userId || agent?.id || agent?.email || '')}
                />
              </div>
            </div>
            <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]">{category === 'seller' ? 'Property address' : 'Property or area of interest'} <span className="sr-only">optional</span><input className="h-10 min-w-0 rounded-[11px] border border-[#dbe4ee] px-3 font-normal outline-none transition focus:border-[#22445e] focus:ring-2 focus:ring-[#22445e]/10" value={form.property} onChange={(event) => setField('property', event.target.value)} /></label>
            <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]"><span className="flex items-center justify-between gap-3"><span>Notes</span><span className="text-xs font-normal text-[#8295a9]">Optional</span></span><textarea rows={3} className="min-h-20 resize-y rounded-[11px] border border-[#dbe4ee] p-3 font-normal outline-none transition focus:border-[#22445e] focus:ring-2 focus:ring-[#22445e]/10" value={form.notes} onChange={(event) => setField('notes', event.target.value)} /></label>
            {error ? <p className="rounded-[12px] border border-[#f2cccc] bg-[#fff5f4] px-3 py-2 text-sm text-[#9f3028]">{error}</p> : null}
          </div>
          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#e7eef5] bg-[#fbfdff] px-5 py-4 sm:flex-row sm:justify-end sm:px-6"><button type="button" className="h-10 rounded-[11px] border border-[#dbe4ee] bg-white px-4 text-sm font-semibold text-[#29435d] transition hover:bg-[#f5f8fb]" onClick={onClose}>Cancel</button><button type="submit" disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-[11px] bg-[#0f2743] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(15,39,67,0.18)] transition hover:bg-[#173a5d] disabled:opacity-60">{saving ? <RefreshCw size={15} className="animate-spin" /> : null}{saving ? 'Creating' : 'Create Lead'}</button></footer>
        </form>
      </section>
    </div>
  )
}

export default function AgencyLeadListRoutePage() {
  const navigate = useNavigate()
  const { role, profile, currentWorkspace, currentMembership, workspace, organisationMembershipRole } = useWorkspace()
  const [organisationId, setOrganisationId] = useState(() => resolveWorkspaceId({ currentWorkspace, currentMembership, workspace }))
  const [membershipRole, setMembershipRole] = useState(resolveMembershipRole(currentMembership, organisationMembershipRole))
  const [records, setRecords] = useState(EMPTY_RECORDS)
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
  const [deleteDialog, setDeleteDialog] = useState({ open: false, leadId: '' })
  const [deleting, setDeleting] = useState(false)
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
    avatarUrl: profile?.avatarUrl || profile?.avatar_url || profile?.profilePhotoUrl || profile?.profile_photo_url || profile?.photoUrl || profile?.photo_url,
    roleLabel: profile?.jobTitle || profile?.job_title || 'Agent',
    isCurrentUser: true,
  }), [profile])
  const agentOptions = agents.length ? agents : [currentAgent]
  const isPrincipal = canAccessPrincipalExperience({ appRole: role, membershipRole })
  const deferredFilters = useDeferredValue(filters)

  useEffect(() => {
    const workspaceId = resolveWorkspaceId({ currentWorkspace, currentMembership, workspace })
    if (workspaceId) setOrganisationId(workspaceId)
    setMembershipRole(resolveMembershipRole(currentMembership, organisationMembershipRole))
  }, [currentMembership, currentWorkspace, organisationMembershipRole, workspace])

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
      await createAgencyCrmLeadActivity(organisationId, created.leadId, { agent: currentAgent, activityType: 'Lead Created', activityNote: 'Manual lead captured', outcome: 'Created' }, { actor: currentAgent }).catch(() => null)
      setCreateDialog((previous) => ({ ...previous, open: false }))
      setCategory(form.category)
      setMessage('Lead created.')
      invalidateAgencyLeadListCache(organisationId)
      await loadLeads({ forceRefresh: true })
    } catch (createError) {
      setError(createError?.message || 'Unable to create this lead.')
    } finally {
      setCreating(false)
    }
  }

  const handleArchiveLead = async (leadId) => {
    if (!window.confirm('Archive this lead?')) return
    try {
      const { updateAgencyCrmLeadRecord } = await loadLeadMutationActions()
      await updateAgencyCrmLeadRecord(organisationId, leadId, { stage: 'Archived', status: 'Archived' })
      setMessage('Lead archived.')
      invalidateAgencyLeadListCache(organisationId, leadId)
      await loadLeads({ forceRefresh: true })
    } catch (archiveError) {
      setError(archiveError?.message || 'Unable to archive this lead.')
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
    void preloadAgencyLeadWorkspace()
  }, [organisationId])

  if (loading) return <LeadsRouteShell />

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <div className="min-w-0">{error ? <p className="rounded-[14px] border border-[#f2cccc] bg-[#fff5f4] px-4 py-2 text-sm text-[#9f3028]">{error}</p> : message ? <p className="rounded-[14px] border border-[#cfe8dc] bg-[#effaf3] px-4 py-2 text-sm text-[#26724c]">{message}</p> : null}</div>
        <button type="button" disabled={refreshing} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[12px] border border-[#dbe4ee] bg-white px-3 text-sm font-semibold text-[#405b75] disabled:opacity-60" onClick={() => void loadLeads({ forceRefresh: true, requestedPage: currentPage })}><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh</button>
      </div>
      <LeadListPage
        metrics={summaryModel.metrics}
        filters={filters}
        sources={sources}
        stages={getAgencyLeadStageOptions(category)}
        agents={agentOptions}
        isPrincipal={isPrincipal}
        category={category}
        categoryLabel={category === 'seller' ? 'Seller' : 'Buyer'}
        categoryTitle={categoryTitle}
        categoryCounts={listModel.categoryCounts}
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
        onViewModeChange={setViewMode}
        onPageChange={(nextPage) => setPage(Math.max(1, Math.min(Number(nextPage) || 1, totalPages)))}
        onAddLead={(nextCategory) => { setError(''); setCreateDialog({ open: true, category: nextCategory === 'seller' ? 'seller' : 'buyer' }) }}
        onLeadIntent={handleLeadIntent}
        onOpenLead={(leadId) => {
          handleLeadIntent(leadId)
          navigate(`/pipeline/leads/${encodeURIComponent(leadId)}`)
        }}
        onArchiveLead={(leadId) => void handleArchiveLead(leadId)}
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
