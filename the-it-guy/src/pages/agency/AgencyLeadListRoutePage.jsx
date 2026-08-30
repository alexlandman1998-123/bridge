import { RefreshCw, X } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AgentAssignmentSelect from '../../components/AgentAssignmentSelect'
import LeadsRouteShell from '../../components/leads/LeadsRouteShell'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canAccessPrincipalExperience } from '../../lib/organisationAccess'
import { createSellerLeadsPerformanceBaseline } from '../../services/observability/sellerLeadsPerformanceBaseline'
import LeadListPage from './LeadListPage'
import {
  invalidateAgencyLeadListCache,
  listAgencyLeadListRecords,
  preloadAgencyLeadCoreRecord,
} from './agencyLeadListReadRepository'
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
      listOrganisationUsers: module.listOrganisationUsers,
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

  if (!open) return null
  const setField = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-[#102033]/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="w-full max-w-xl overflow-hidden rounded-[22px] border border-[#dbe7f2] bg-white shadow-[0_30px_80px_rgba(16,32,51,0.24)]" role="dialog" aria-modal="true" aria-labelledby="create-lead-title">
        <header className="flex items-start justify-between gap-3 border-b border-[#e7eef5] px-5 py-4">
          <div>
            <h2 id="create-lead-title" className="text-xl font-semibold text-[#142132]">Add {category === 'seller' ? 'Seller' : 'Buyer'} Lead</h2>
            <p className="mt-1 text-sm text-[#60758b]">Capture the essentials now. The full workspace remains available after creation.</p>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-[12px] border border-[#dbe4ee]" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </header>
        <form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); onSave(form) }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">First name<input required className="h-11 rounded-[12px] border border-[#dbe4ee] px-3 font-normal" value={form.firstName} onChange={(event) => setField('firstName', event.target.value)} /></label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">Last name<input required className="h-11 rounded-[12px] border border-[#dbe4ee] px-3 font-normal" value={form.lastName} onChange={(event) => setField('lastName', event.target.value)} /></label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">Mobile<input required className="h-11 rounded-[12px] border border-[#dbe4ee] px-3 font-normal" value={form.phone} onChange={(event) => setField('phone', event.target.value)} /></label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">Email<input required type="email" className="h-11 rounded-[12px] border border-[#dbe4ee] px-3 font-normal" value={form.email} onChange={(event) => setField('email', event.target.value)} /></label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
              Lead source
              <select required className="h-11 rounded-[12px] border border-[#dbe4ee] bg-white px-3 font-normal text-[#29435d] outline-none transition focus:border-[#22445e] focus:ring-2 focus:ring-[#22445e]/10" value={form.source} onChange={(event) => setField('source', event.target.value)}>
                {LEAD_SOURCE_OPTIONS.map((source) => <option key={source} value={source}>{source}</option>)}
              </select>
            </label>
            <div className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
              <span>Assigned to</span>
              <AgentAssignmentSelect
                value={form.agentId || currentAgent.id}
                agents={agents}
                onChange={(agent) => setField('agentId', agent?.userId || agent?.id || agent?.email || '')}
              />
            </div>
          </div>
          <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">{category === 'seller' ? 'Property address' : 'Property or area of interest'}<input className="h-11 rounded-[12px] border border-[#dbe4ee] px-3 font-normal" value={form.property} onChange={(event) => setField('property', event.target.value)} /></label>
          <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">Notes<textarea className="min-h-24 rounded-[12px] border border-[#dbe4ee] p-3 font-normal" value={form.notes} onChange={(event) => setField('notes', event.target.value)} /></label>
          {error ? <p className="rounded-[12px] border border-[#f2cccc] bg-[#fff5f4] px-3 py-2 text-sm text-[#9f3028]">{error}</p> : null}
          <div className="flex justify-end gap-2"><button type="button" className="h-11 rounded-[12px] border border-[#dbe4ee] px-4 text-sm font-semibold" onClick={onClose}>Cancel</button><button type="submit" disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-[#0f2743] px-5 text-sm font-semibold text-white disabled:opacity-60">{saving ? <RefreshCw size={15} className="animate-spin" /> : null}{saving ? 'Creating' : 'Create Lead'}</button></div>
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
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [createDialog, setCreateDialog] = useState({ open: false, category: 'buyer' })
  const [creating, setCreating] = useState(false)
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

  const loadLeads = useCallback(async ({ backgroundOnly = false, forceRefresh = false } = {}) => {
    const requestId = ++loadRequestRef.current
    if (!backgroundOnly) setRefreshing(true)
    setError('')
    try {
      let workspaceId = normalizeText(organisationId || resolveWorkspaceId({ currentWorkspace, currentMembership, workspace }))
      if (!workspaceId) {
        setLoading(true)
        return
      }
      setOrganisationId(workspaceId)

      if (!backgroundOnly) {
        const primary = await listAgencyLeadListRecords(workspaceId, { includeRelatedRecords: false, forceRefresh })
        if (requestId !== loadRequestRef.current) return
        setRecords((previous) => ({
          ...previous,
          leads: Array.isArray(primary?.leads) ? primary.leads : [],
          contacts: Array.isArray(primary?.contacts) ? primary.contacts : [],
        }))
        setLoading(false)
        void performanceRef.current?.recordCheckpoint({ checkpoint: 'first_data', userId: profile?.id, workspaceId, metadata: { surface: 'lead_list', leadCount: primary?.leads?.length || 0 } })
      }

      const organisationUsersPromise = isPrincipal
        ? loadSettingsActions().then(({ listOrganisationUsers }) => listOrganisationUsers()).catch(() => [])
        : Promise.resolve([])
      const [related, organisationUsers] = await Promise.all([
        listAgencyLeadListRecords(workspaceId, { includePrimaryRecords: false, includeRelatedRecords: true }),
        organisationUsersPromise,
      ])
      if (requestId !== loadRequestRef.current) return
      setRecords((previous) => ({
        ...previous,
        activities: Array.isArray(related?.leadActivities) ? related.leadActivities : [],
        tasks: Array.isArray(related?.tasks) ? related.tasks : [],
      }))
      const mappedAgents = (Array.isArray(organisationUsers) ? organisationUsers : []).map(mapAgent).filter((agent) => agent.id)
      setAgents(mappedAgents.length ? mappedAgents : [currentAgent])
      void performanceRef.current?.recordCheckpoint({ checkpoint: 'background_settled', userId: profile?.id, workspaceId, metadata: { surface: 'lead_list', activityCount: related?.leadActivities?.length || 0, taskCount: related?.tasks?.length || 0 } })
    } catch (loadError) {
      if (requestId !== loadRequestRef.current) return
      setError(loadError?.message || 'Unable to load leads right now.')
      setLoading(false)
    } finally {
      if (requestId === loadRequestRef.current) setRefreshing(false)
    }
  }, [currentAgent, currentMembership, currentWorkspace, isPrincipal, organisationId, profile?.id, workspace])

  useEffect(() => { void loadLeads() }, [loadLeads])

  const listModel = useMemo(() => buildAgencyLeadListModel({
    leads: records.leads,
    contacts: records.contacts,
    activities: records.activities,
    tasks: records.tasks,
    category,
    filters: deferredFilters,
  }), [category, deferredFilters, records])
  const summaryModel = useMemo(() => buildAgencyLeadListSummary(records), [records])
  const totalPages = Math.max(1, Math.ceil(listModel.rows.length / LEAD_LIST_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = listModel.rows.length ? (currentPage - 1) * LEAD_LIST_PAGE_SIZE + 1 : 0
  const pageEnd = Math.min(listModel.rows.length, currentPage * LEAD_LIST_PAGE_SIZE)
  const pageRows = listModel.rows.slice(pageStart ? pageStart - 1 : 0, pageEnd)
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
    if (!window.confirm('Permanently delete this lead? This cannot be undone.')) return
    try {
      const { deleteAgencyCrmLeadRecord } = await loadLeadMutationActions()
      await deleteAgencyCrmLeadRecord(organisationId, leadId)
      setMessage('Lead deleted.')
      invalidateAgencyLeadListCache(organisationId, leadId)
      await loadLeads({ forceRefresh: true })
    } catch (deleteError) {
      setError(deleteError?.message || 'Unable to delete this lead.')
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
  }, [organisationId])

  if (loading) return <LeadsRouteShell />

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <div className="min-w-0">{error ? <p className="rounded-[14px] border border-[#f2cccc] bg-[#fff5f4] px-4 py-2 text-sm text-[#9f3028]">{error}</p> : message ? <p className="rounded-[14px] border border-[#cfe8dc] bg-[#effaf3] px-4 py-2 text-sm text-[#26724c]">{message}</p> : null}</div>
        <button type="button" disabled={refreshing} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[12px] border border-[#dbe4ee] bg-white px-3 text-sm font-semibold text-[#405b75] disabled:opacity-60" onClick={() => void loadLeads({ forceRefresh: true })}><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Refresh</button>
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
        summary={{ total: records.leads.length, filtered: listModel.rows.length, newThisWeek: summaryModel.metrics.newThisWeek }}
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
        onPageChange={setPage}
        onAddLead={(nextCategory) => { setError(''); setCreateDialog({ open: true, category: nextCategory === 'seller' ? 'seller' : 'buyer' }) }}
        onLeadIntent={handleLeadIntent}
        onOpenLead={(leadId) => {
          handleLeadIntent(leadId)
          navigate(`/pipeline/leads/${encodeURIComponent(leadId)}`)
        }}
        onArchiveLead={(leadId) => void handleArchiveLead(leadId)}
        onDeleteLead={(leadId) => void handleDeleteLead(leadId)}
        onMoveLead={(leadId, columnId) => void handleMoveLead(leadId, columnId)}
        onOpenShowDayQueue={() => setFilters((previous) => ({ ...previous, source: 'Show Day' }))}
        onOpenShowDayLead={(row, tab) => {
          const leadId = row.leadId || row.id
          handleLeadIntent(leadId)
          navigate(`/pipeline/leads/${encodeURIComponent(leadId)}?tab=${encodeURIComponent(tab || 'activity')}`)
        }}
      />
      {createDialog.open ? <LeadCreateDialog open category={createDialog.category} agents={agentOptions} currentAgent={currentAgent} saving={creating} error={error} onClose={() => setCreateDialog((previous) => ({ ...previous, open: false }))} onSave={(form) => void handleCreateLead(form)} /> : null}
    </section>
  )
}
