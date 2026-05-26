import { useCallback, useEffect, useMemo, useState } from 'react'
import BondDashboardSummary from './BondDashboardSummary'
import BondQueuePanel from './BondQueuePanel'
import BondDashboardFilters from './BondDashboardFilters'
import BondReportingScopeBanner from './BondReportingScopeBanner'
import * as bondDashboardService from '../../services/bondDashboardService'

const QUEUE_ORDER = Object.freeze([
  'my_applications',
  'processing_queue',
  'missing_documents',
  'bank_feedback',
  'submission_readiness',
  'overdue_applications',
  'compliance_review',
  'manager_escalations',
])

function normalizeText(value) {
  return String(value || '').trim()
}

function queueTitle(queueKey = '') {
  return String(queueKey || '')
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')
}

export default function BondDashboard({
  user = {},
  workspaceId = '',
  service = bondDashboardService,
  initialState = null,
}) {
  const safeWorkspaceId = normalizeText(workspaceId)
  const [state, setState] = useState(
    initialState || {
      loading: true,
      error: '',
      context: null,
      summary: null,
      queues: {},
      reportingScope: null,
      filters: null,
    },
  )
  const [filterValues, setFilterValues] = useState({})

  const loadDashboard = useCallback(async () => {
    if (!safeWorkspaceId) {
      setState({
        loading: false,
        error: 'missing_workspace_context',
        context: null,
        summary: null,
        queues: {},
        reportingScope: null,
        filters: null,
      })
      return
    }

    setState((previous) => ({ ...previous, loading: true, error: '' }))

    try {
      const [context, summary, queues, reportingScope, filters] = await Promise.all([
        service.getBondDashboardContext(user, safeWorkspaceId),
        service.getBondDashboardSummary(user, safeWorkspaceId),
        service.getBondDashboardQueues(user, safeWorkspaceId),
        service.getBondDashboardReportingScope(user, safeWorkspaceId),
        service.getBondDashboardFilters(user, safeWorkspaceId),
      ])

      setState({
        loading: false,
        error: '',
        context,
        summary,
        queues: queues || {},
        reportingScope,
        filters,
      })
      setFilterValues(filters?.defaults || {})
    } catch (error) {
      setState({
        loading: false,
        error: String(error?.message || 'dashboard_load_failed'),
        context: null,
        summary: null,
        queues: {},
        reportingScope: null,
        filters: null,
      })
    }
  }, [safeWorkspaceId, service, user])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard()
  }, [loadDashboard])

  const queuePanels = useMemo(() => {
    const queues = state.queues || {}
    return QUEUE_ORDER.map((key) => ({
      key,
      title: queueTitle(key),
      items: Array.isArray(queues[key]) ? queues[key] : [],
    }))
  }, [state.queues])

  if (!safeWorkspaceId) {
    return (
      <section className="rounded-[18px] border border-[#f1d0d0] bg-[#fff5f5] px-4 py-4">
        <p className="text-sm font-semibold text-[#8f2f2f]">We could not load your Bond workspace context.</p>
        <p className="mt-1 text-sm text-[#9d4d4d]">Please switch workspace or try again.</p>
      </section>
    )
  }

  if (!state.loading && state.error) {
    return (
      <section className="rounded-[18px] border border-[#f1d0d0] bg-[#fff5f5] px-4 py-4">
        <p className="text-sm font-semibold text-[#8f2f2f]">We could not load your Bond workspace context.</p>
        <p className="mt-1 text-sm text-[#9d4d4d]">Please switch workspace or try again.</p>
      </section>
    )
  }

  const isIndependentWorkspace = state.context?.isIndependentOriginator
  const totalApplications = Number(state.summary?.totalApplications || 0)

  return (
    <section className="space-y-4">
      <header className="rounded-[18px] border border-[#dde6f1] bg-white px-5 py-4">
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#132130]">Bond Applications Dashboard</h1>
        <p className="mt-1 text-sm text-[#5f7287]">
          Role-aware Bond operations across consultant, processor, manager, and compliance queues.
        </p>
      </header>

      <BondReportingScopeBanner reportingScope={state.reportingScope || state.context?.reportingScope} />

      <BondDashboardFilters
        filters={state.filters}
        values={filterValues}
        onChange={(id, value) =>
          setFilterValues((previous) => ({
            ...previous,
            [id]: value,
          }))}
      />

      <BondDashboardSummary summary={state.summary} loading={state.loading} />

      {!state.loading && totalApplications === 0 ? (
        <section className="rounded-[18px] border border-[#dde6f1] bg-white px-4 py-4">
          <p className="text-sm text-[#5f7287]">
            {isIndependentWorkspace
              ? 'No bond applications yet. Applications assigned to you will appear here.'
              : 'No applications in this queue yet.'}
          </p>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {queuePanels.map((panel) => (
          <BondQueuePanel
            key={panel.key}
            queueKey={panel.key}
            title={panel.title}
            items={panel.items}
            loading={state.loading}
            error={state.error}
            emptyMessage="No applications in this queue yet."
          />
        ))}
      </div>
    </section>
  )
}
