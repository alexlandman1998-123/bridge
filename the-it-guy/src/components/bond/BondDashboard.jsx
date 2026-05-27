import { useCallback, useEffect, useMemo, useState } from 'react'
import BondDashboardHeader from './BondDashboardHeader'
import BondEmptyState from './BondEmptyState'
import BondPageShell from './BondPageShell'
import BondPerformanceSnapshot from './BondPerformanceSnapshot'
import BondPipelineOverview from './BondPipelineOverview'
import BondPriorityActionStrip from './BondPriorityActionStrip'
import BondReportingScopeBanner from './BondReportingScopeBanner'
import BondTeamWorkloadCard from './BondTeamWorkloadCard'
import RecentBankActivityCard from './RecentBankActivityCard'
import AtRiskApplicationsCard from './AtRiskApplicationsCard'
import * as bondCommandCenterService from '../../services/bondCommandCenterService'

function normalizeText(value) {
  return String(value || '').trim()
}

function matchesSearch(item = {}, query = '') {
  const normalizedQuery = normalizeText(query).toLowerCase()
  if (!normalizedQuery) return true
  const haystack = Object.values(item)
    .map((value) => normalizeText(value).toLowerCase())
    .join(' ')
  return haystack.includes(normalizedQuery)
}

function openCreateApplication() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('itg:open-new-transaction'))
}

export default function BondDashboard({
  user = {},
  workspaceId = '',
  service = bondCommandCenterService,
  initialState = null,
}) {
  const safeWorkspaceId = normalizeText(workspaceId)
  const [rangeKey, setRangeKey] = useState('this_month')
  const [search, setSearch] = useState('')
  const [state, setState] = useState(
    initialState || {
      loading: true,
      error: '',
      snapshot: null,
      reportingScope: null,
    },
  )

  const loadDashboard = useCallback(async () => {
    if (!safeWorkspaceId) {
      setState({
        loading: false,
        error: 'missing_workspace_context',
        snapshot: null,
        reportingScope: null,
      })
      return
    }

    setState((previous) => ({ ...previous, loading: true, error: '' }))

    try {
      const snapshot = await service.getBondCommandCenterSnapshot(user, safeWorkspaceId, { rangeKey })
      setState({
        loading: false,
        error: '',
        snapshot,
        reportingScope: snapshot.reportingScope || null,
      })
    } catch (error) {
      setState({
        loading: false,
        error: String(error?.message || 'dashboard_load_failed'),
        snapshot: null,
        reportingScope: null,
      })
    }
  }, [rangeKey, safeWorkspaceId, service, user])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard()
  }, [loadDashboard])

  const filteredTeamWorkload = useMemo(
    () => (state.snapshot?.teamWorkload || []).filter((item) => matchesSearch(item, search)),
    [search, state.snapshot?.teamWorkload],
  )
  const filteredBankActivity = useMemo(
    () => (state.snapshot?.recentBankActivity || []).filter((item) => matchesSearch(item, search)),
    [search, state.snapshot?.recentBankActivity],
  )
  const filteredAtRisk = useMemo(
    () => (state.snapshot?.atRiskApplications || []).filter((item) => matchesSearch(item, search)),
    [search, state.snapshot?.atRiskApplications],
  )
  const selectedRangeLabel = useMemo(
    () => state.snapshot?.availableRanges?.find((item) => item.key === rangeKey)?.label || 'This Month',
    [rangeKey, state.snapshot?.availableRanges],
  )

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

  const snapshot = state.snapshot

  return (
    <BondPageShell>
      <BondDashboardHeader
        userDisplayName={snapshot?.userDisplayName || 'there'}
        attentionText={
          state.loading
            ? 'Loading today’s bond workload…'
            : `${snapshot?.attentionCount || 0} applications require attention today. ${snapshot?.roleFocus?.attentionText || ''}`.trim()
        }
        focusChips={snapshot?.roleFocus?.focusChips || []}
        search={search}
        onSearchChange={setSearch}
        onCreate={openCreateApplication}
        rangeKey={rangeKey}
        ranges={snapshot?.availableRanges || [{ key: 'this_month', label: 'This Month' }]}
        onRangeChange={setRangeKey}
      />

      <BondReportingScopeBanner reportingScope={state.reportingScope} />

      {!state.loading && snapshot ? (
        <>
          <BondPriorityActionStrip items={snapshot.priorityActions} />
          <BondPipelineOverview
            items={snapshot.pipelineOverview}
            rangeLabel={selectedRangeLabel}
          />
        </>
      ) : null}

      {!state.loading && snapshot?.totalApplications === 0 ? (
        <BondEmptyState title={snapshot.emptyState.title} description={snapshot.emptyState.description} />
      ) : null}

      {!state.loading && snapshot ? (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <BondTeamWorkloadCard title={snapshot.roleFocus.workloadHeading} rows={filteredTeamWorkload} />
            <RecentBankActivityCard rows={filteredBankActivity} />
            <AtRiskApplicationsCard rows={filteredAtRisk} />
          </div>
          <BondPerformanceSnapshot items={snapshot.performanceSnapshot} />
        </>
      ) : null}

      {state.loading ? (
        <BondEmptyState title="Loading bond command center…" description="We are pulling your operational snapshot now." />
      ) : null}
    </BondPageShell>
  )
}
