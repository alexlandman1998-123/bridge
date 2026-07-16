import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FilterX, RefreshCw, Search } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LeadDetailPanel } from '../components/platform/leads/LeadDetailPanel'
import { LeadConversionPanel } from '../components/platform/leads/LeadConversionPanel'
import { LeadGovernancePanel } from '../components/platform/leads/LeadGovernancePanel'
import { LeadPipelineHealth } from '../components/platform/leads/LeadPipelineHealth'
import { LeadSummaryCards } from '../components/platform/leads/LeadSummaryCards'
import { LeadTable } from '../components/platform/leads/LeadTable'
import { LEAD_PRIORITY_OPTIONS, LEAD_STAGE_OPTIONS } from '../lib/adminIntakeLeadPresentation'
import {
  convertAdminIntakeLead,
  getAdminIntakeConversionContext,
  getAdminIntakeLeadContext,
  listAdminIntakeLeads,
  reviewAdminIntakeLeadDuplicate,
  retryAdminIntakeLeadNotification,
  updateAdminIntakeLead,
} from '../services/adminIntakeLeadService'

const INITIAL_FILTERS = Object.freeze({
  search: '',
  stage: 'all',
  priority: 'all',
  assignment: 'all',
  intakeKind: 'all',
  sort: 'newest',
})

const SELECT_CLASS = 'min-h-11 rounded-[12px] border border-[#dce5eb] bg-white px-3 text-sm font-medium text-[#2d4353] outline-none transition focus:border-[#5ba98c] focus:ring-2 focus:ring-[#dff3eb]'

export default function PlatformLeadsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const requestedLeadId = useMemo(() => new URLSearchParams(location.search).get('lead') || new URLSearchParams(location.search).get('enquiry') || '', [location.search])
  const [filters, setFilters] = useState(INITIAL_FILTERS)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ leads: [], count: 0, pageCount: 1, summary: {}, assignees: [], health: null })
  const [selectedId, setSelectedId] = useState(requestedLeadId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const [governance, setGovernance] = useState({ context: null, loading: false, error: '' })
  const [conversion, setConversion] = useState({ context: null, loading: false, error: '' })
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [reviewingDuplicate, setReviewingDuplicate] = useState(false)
  const [retryingNotification, setRetryingNotification] = useState(false)
  const [converting, setConverting] = useState(false)

  const selectedLead = useMemo(() => result.leads.find((lead) => lead.id === selectedId) || null, [result.leads, selectedId])
  const hasFilters = filters.search || filters.stage !== 'all' || filters.priority !== 'all' || filters.assignment !== 'all' || filters.intakeKind !== 'all' || filters.sort !== 'newest'

  const loadLeads = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const next = await listAdminIntakeLeads({ ...filters, page })
      setResult(next)
      setSelectedId((current) => {
        if (requestedLeadId && next.leads.some((lead) => lead.id === requestedLeadId)) return requestedLeadId
        return next.leads.some((lead) => lead.id === current) ? current : ''
      })
    } catch (loadError) {
      setError(loadError?.message || 'Intake leads could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [filters, page, requestedLeadId])

  const loadLeadContext = useCallback(async (leadId = selectedId) => {
    if (!leadId) return
    try {
      setGovernance({ context: null, loading: true, error: '' })
      setConversion({ context: null, loading: true, error: '' })
      setSelectedCandidateId('')
      const [governanceContext, conversionContext] = await Promise.all([
        getAdminIntakeLeadContext(leadId),
        getAdminIntakeConversionContext(leadId),
      ])
      setGovernance({ context: governanceContext, loading: false, error: '' })
      setConversion({ context: conversionContext, loading: false, error: '' })
      setSelectedCandidateId(governanceContext.duplicateOfEnquiryId || '')
    } catch (contextError) {
      setGovernance({ context: null, loading: false, error: contextError?.message || 'Lead governance context could not be loaded.' })
      setConversion({ context: null, loading: false, error: contextError?.message || 'Onboarding readiness could not be loaded.' })
    }
  }, [selectedId])

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadLeads(), filters.search ? 220 : 0)
    return () => window.clearTimeout(timeout)
  }, [filters.search, loadLeads])

  useEffect(() => {
    if (!selectedId) return undefined
    const timeout = window.setTimeout(() => void loadLeadContext(selectedId), 0)
    return () => window.clearTimeout(timeout)
  }, [loadLeadContext, selectedId])

  function updateFilter(key, value) {
    setPage(1)
    setSuccess('')
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function clearFilters() {
    setPage(1)
    setSuccess('')
    setFilters(INITIAL_FILTERS)
  }

  function selectLead(id) {
    setSelectedId(id)
    setSuccess('')
    const params = new URLSearchParams(location.search)
    params.delete('enquiry')
    params.set('lead', id)
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true })
  }

  function closeDetails() {
    setSelectedId('')
    const params = new URLSearchParams(location.search)
    params.delete('lead')
    params.delete('enquiry')
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true })
  }

  async function saveLeadWorkflow(patch) {
    if (!selectedId) return
    try {
      setSaving(true)
      setError('')
      setSuccess('')
      const updated = await updateAdminIntakeLead(selectedId, patch)
      setResult((current) => ({
        ...current,
        leads: current.leads.map((lead) => (lead.id === selectedId ? { ...lead, ...updated } : lead)),
      }))
      setSuccess('Lead workflow saved and added to the activity audit.')
      await loadLeads()
      await loadLeadContext(selectedId)
    } catch (saveError) {
      setError(saveError?.message || 'The lead workflow could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function reviewDuplicate(dedupeStatus, duplicateOfEnquiryId) {
    if (!selectedId) return
    try {
      setReviewingDuplicate(true)
      setError('')
      setSuccess('')
      const updated = await reviewAdminIntakeLeadDuplicate(selectedId, { dedupeStatus, duplicateOfEnquiryId })
      setResult((current) => ({
        ...current,
        leads: current.leads.map((lead) => (lead.id === selectedId ? { ...lead, ...updated } : lead)),
      }))
      setSuccess('Duplicate review saved to the lead audit history.')
      await loadLeadContext(selectedId)
    } catch (reviewError) {
      setError(reviewError?.message || 'The duplicate review could not be saved.')
    } finally {
      setReviewingDuplicate(false)
    }
  }

  async function retryNotification() {
    if (!selectedId) return
    try {
      setRetryingNotification(true)
      setError('')
      setSuccess('')
      const response = await retryAdminIntakeLeadNotification(selectedId)
      setResult((current) => ({
        ...current,
        leads: current.leads.map((lead) => (lead.id === selectedId ? { ...lead, ...response.lead } : lead)),
      }))
      setSuccess(response.notification?.sent
        ? 'Admin notification delivered successfully.'
        : 'Delivery was attempted but the email provider did not accept it. The recovery queue has been updated.')
      await loadLeadContext(selectedId)
      await loadLeads()
    } catch (retryError) {
      setError(retryError?.message || 'Notification delivery could not be retried.')
    } finally {
      setRetryingNotification(false)
    }
  }

  async function convertLead(input) {
    if (!selectedId) return
    try {
      setConverting(true)
      setError('')
      setSuccess('')
      const response = await convertAdminIntakeLead(selectedId, input)
      setResult((current) => ({
        ...current,
        leads: current.leads.map((lead) => (lead.id === selectedId ? { ...lead, ...response.lead } : lead)),
      }))
      setSuccess(response.conversion?.alreadyConverted
        ? 'This lead was already linked to its onboarding organisation.'
        : 'Onboarding handoff complete. The organisation is pending activation and the lead is marked Won.')
      await loadLeadContext(selectedId)
      await loadLeads()
    } catch (conversionError) {
      setError(conversionError?.message || 'The onboarding handoff could not be completed.')
    } finally {
      setConverting(false)
    }
  }

  return (
    <section className="page">
      <article className="panel card-tier-standard">
        <header className="flex flex-col gap-4 border-b border-[#e8eef3] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[0.72rem] font-medium uppercase tracking-[0.09em] text-[#65798a]">Operations</p>
            <h1 className="mt-1.5 text-[1.8rem] font-semibold tracking-[-0.045em] text-[#132535]">New business enquiries</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[#6d7e8c]">Review and triage intake leads from agencies, law firms, bond originators and other prospective Arch9 partners.</p>
          </div>
          <button type="button" onClick={loadLeads} disabled={loading} className="header-secondary-cta inline-flex items-center gap-2 self-start lg:self-auto">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh
          </button>
        </header>

        <div className="mt-5"><LeadSummaryCards summary={result.summary} /></div>
        <LeadPipelineHealth health={result.health} />

        <div className="mt-5 rounded-[18px] border border-[#dfe7ee] bg-[#f8fafb] p-3.5">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_repeat(5,minmax(130px,auto))]">
            <label className="relative block">
              <span className="sr-only">Search leads</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#738493]" aria-hidden="true" />
              <input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search name, company, email or phone" className="min-h-11 w-full rounded-[12px] border border-[#dce5eb] bg-white pl-10 pr-3 text-sm font-medium text-[#2d4353] outline-none transition placeholder:text-[#98a4ae] focus:border-[#5ba98c] focus:ring-2 focus:ring-[#dff3eb]" />
            </label>
            <select aria-label="Filter by stage" value={filters.stage} onChange={(event) => updateFilter('stage', event.target.value)} className={SELECT_CLASS}>{LEAD_STAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            <select aria-label="Filter by priority" value={filters.priority} onChange={(event) => updateFilter('priority', event.target.value)} className={SELECT_CLASS}>{LEAD_PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            <select aria-label="Filter by assignment" value={filters.assignment} onChange={(event) => updateFilter('assignment', event.target.value)} className={SELECT_CLASS}><option value="all">All owners</option><option value="unassigned">Unassigned</option><option value="assigned">Assigned</option></select>
            <select aria-label="Filter by intake type" value={filters.intakeKind} onChange={(event) => updateFilter('intakeKind', event.target.value)} className={SELECT_CLASS}><option value="all">All intake types</option><option value="new_business_partner">New business</option><option value="demo_request">Demo requests</option></select>
            <select aria-label="Sort leads" value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)} className={SELECT_CLASS}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="recently_updated">Recently updated</option><option value="next_action">Next action</option></select>
          </div>
          {hasFilters ? <button type="button" onClick={clearFilters} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#536b7b] hover:text-[#176149]"><FilterX className="h-3.5 w-3.5" aria-hidden="true" />Clear filters</button> : null}
        </div>

        {error ? <div role="alert" className="mt-4 rounded-[14px] border border-[#efcbc8] bg-[#fff4f3] px-4 py-3 text-sm font-semibold text-[#922e28]">{error}</div> : null}
        {success ? <div role="status" className="mt-4 rounded-[14px] border border-[#bfe3d2] bg-[#eff9f4] px-4 py-3 text-sm font-semibold text-[#176149]">{success}</div> : null}

        <div className={`mt-5 grid items-start gap-5 ${selectedLead ? '2xl:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
          <LeadTable leads={result.leads} assignees={result.assignees} loading={loading} selectedId={selectedId} onSelect={selectLead} />
          {selectedLead ? (
            <div className="grid gap-5">
              <LeadDetailPanel key={`${selectedLead.id}:${selectedLead.updated_at || ''}`} lead={selectedLead} assignees={result.assignees} saving={saving} retryingNotification={retryingNotification} onSave={saveLeadWorkflow} onRetryNotification={retryNotification} onClose={closeDetails} />
              <LeadConversionPanel key={`${selectedLead.id}:${conversion.loading ? 'loading' : 'ready'}:${conversion.context?.convertedOrganization?.id || ''}`} context={conversion.context} loading={conversion.loading} error={conversion.error} converting={converting} onConvert={convertLead} />
              <LeadGovernancePanel context={governance.context} loading={governance.loading} error={governance.error} selectedCandidateId={selectedCandidateId} reviewing={reviewingDuplicate} onSelectCandidate={setSelectedCandidateId} onReview={reviewDuplicate} />
            </div>
          ) : null}
        </div>

        <footer className="mt-4 flex flex-col gap-3 text-sm text-[#6c7e8c] sm:flex-row sm:items-center sm:justify-between">
          <p>Showing {result.leads.length} of {result.count} matching leads</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} aria-label="Previous page" className="grid h-9 w-9 place-items-center rounded-full border border-[#dce5eb] bg-white text-[#486071] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
            <span className="min-w-24 text-center text-xs font-semibold">Page {page} of {result.pageCount || 1}</span>
            <button type="button" onClick={() => setPage((current) => Math.min(result.pageCount || 1, current + 1))} disabled={page >= (result.pageCount || 1) || loading} aria-label="Next page" className="grid h-9 w-9 place-items-center rounded-full border border-[#dce5eb] bg-white text-[#486071] disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        </footer>
      </article>
    </section>
  )
}
