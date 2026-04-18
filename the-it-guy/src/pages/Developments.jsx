import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Building2,
  FileCheck2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AddDevelopmentModal from '../components/AddDevelopmentModal'
import SummaryCards from '../components/SummaryCards'
import Button from '../components/ui/Button'
import SectionHeader from '../components/ui/SectionHeader'
import { selectBottlenecks, selectDevelopmentPerformance, selectPortfolioMetrics } from '../core/transactions/developerSelectors'
import { fetchDevelopmentsData } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

function formatRelativeDate(value) {
  if (!value) return 'No recent activity'
  const delta = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(delta) || delta < 0) return 'Updated today'
  const days = Math.floor(delta / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'Updated today'
  if (days === 1) return 'Updated 1 day ago'
  if (days < 30) return `Updated ${days} days ago`
  const months = Math.floor(days / 30)
  if (months === 1) return 'Updated 1 month ago'
  return `Updated ${months} months ago`
}

function toLifecycleStatus(rawStatus, summary) {
  const normalized = String(rawStatus || '').trim().toLowerCase()

  if (normalized.includes('archiv')) return 'archived'
  if (normalized.includes('complet') || normalized.includes('sold out') || normalized.includes('handover') || normalized.includes('closed')) {
    return 'completed'
  }

  if (summary.activeTransactionsCount > 0) return 'active'
  if (summary.registeredTransactionsCount > 0 && summary.activeTransactionsCount === 0) return 'completed'
  return 'active'
}

function toLifecycleLabel(status) {
  if (status === 'completed') return 'Completed'
  if (status === 'archived') return 'Archived'
  return 'Active'
}

function summarizeAttention({ bottleneckCount, missingDocsCount, missingAttorney, activeTransactionsCount }) {
  const lines = []

  if (bottleneckCount > 0) {
    lines.push(`${bottleneckCount} stalled ${bottleneckCount === 1 ? 'matter' : 'matters'} flagged`)
  }

  if (missingDocsCount > 0) {
    lines.push(`${missingDocsCount} ${missingDocsCount === 1 ? 'deal' : 'deals'} missing documents`)
  }

  if (missingAttorney && activeTransactionsCount > 0) {
    lines.push('Attorney setup missing')
  }

  if (!lines.length && activeTransactionsCount > 0) {
    lines.push(`${activeTransactionsCount} live ${activeTransactionsCount === 1 ? 'transaction' : 'transactions'} in motion`)
  }

  if (!lines.length) {
    lines.push('No immediate issues flagged')
  }

  let status = 'running_smoothly'
  if (missingAttorney || bottleneckCount >= 2) {
    status = 'needs_attention'
  } else if (bottleneckCount === 1 || missingDocsCount > 0) {
    status = 'some_issues'
  }

  return {
    status,
    label: status === 'needs_attention' ? 'Needs Attention' : status === 'some_issues' ? 'Some Issues Pending' : 'Running Smoothly',
    lines: lines.slice(0, 2),
  }
}

function getPrimaryAttorney(rows = []) {
  const counts = rows.reduce((accumulator, row) => {
    const name = String(row?.transaction?.attorney || '').trim()
    if (!name) return accumulator
    accumulator[name] = (accumulator[name] || 0) + 1
    return accumulator
  }, {})

  return (
    Object.entries(counts)
      .sort((left, right) => right[1] - left[1])[0]?.[0] || 'No attorney assigned'
  )
}

function clampCount(value) {
  const normalized = Number(value || 0)
  if (!Number.isFinite(normalized) || normalized < 0) return 0
  return Math.floor(normalized)
}

function getDevelopmentProgress(totalUnits, inProgressCount, completedCount) {
  const total = clampCount(totalUnits)
  const inProgress = clampCount(inProgressCount)
  const completed = clampCount(completedCount)
  const available = Math.max(total - inProgress - completed, 0)

  return {
    total,
    available,
    inProgress,
    completed,
  }
}

function Developments() {
  const navigate = useNavigate()
  const [data, setData] = useState({
    metrics: {
      totalDevelopments: 0,
      totalUnits: 0,
      unitsInTransfer: 0,
      unitsRegistered: 0,
    },
    rows: [],
    developments: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [attentionFilter, setAttentionFilter] = useState('all')
  const [sortBy, setSortBy] = useState('most_active')

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setError('')
      setLoading(true)
      const response = await fetchDevelopmentsData()
      setData(response)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    function refreshDevelopments() {
      void loadData()
    }

    window.addEventListener('itg:transaction-created', refreshDevelopments)
    window.addEventListener('itg:transaction-updated', refreshDevelopments)
    return () => {
      window.removeEventListener('itg:transaction-created', refreshDevelopments)
      window.removeEventListener('itg:transaction-updated', refreshDevelopments)
    }
  }, [loadData])

  const rows = useMemo(() => data.rows || [], [data.rows])
  const bottlenecks = useMemo(() => selectBottlenecks(rows), [rows])
  const developmentPerformance = useMemo(() => selectDevelopmentPerformance(rows), [rows])
  const portfolioMetrics = useMemo(
    () => selectPortfolioMetrics(rows, { totalDevelopmentsOverride: data.metrics.totalDevelopments }),
    [data.metrics.totalDevelopments, rows],
  )

  const developmentCards = useMemo(() => {
    const developmentById = Object.fromEntries((data.developments || []).map((item) => [item.id, item]))
    const performanceById = Object.fromEntries((developmentPerformance || []).map((item) => [item.id, item]))
    const rowsByDevelopment = rows.reduce((accumulator, row) => {
      const developmentId = row?.development?.id || row?.unit?.development_id
      if (!developmentId) return accumulator
      if (!accumulator[developmentId]) accumulator[developmentId] = []
      accumulator[developmentId].push(row)
      return accumulator
    }, {})

    const developmentIdByUnitId = rows.reduce((accumulator, row) => {
      if (row?.unit?.id) {
        accumulator[row.unit.id] = row?.development?.id || row?.unit?.development_id || null
      }
      return accumulator
    }, {})

    const developmentIdByTransactionId = rows.reduce((accumulator, row) => {
      if (row?.transaction?.id) {
        accumulator[row.transaction.id] = row?.development?.id || row?.unit?.development_id || null
      }
      return accumulator
    }, {})

    const bottlenecksByDevelopment = bottlenecks.reduce((accumulator, item) => {
      const developmentKey = (item?.unitId ? developmentIdByUnitId[item.unitId] : null) || (item?.transactionId ? developmentIdByTransactionId[item.transactionId] : null)
      if (!developmentKey) return accumulator
      accumulator[developmentKey] = (accumulator[developmentKey] || 0) + 1
      return accumulator
    }, {})

    const source = Object.values({
      ...Object.fromEntries((data.developments || []).map((item) => [item.id, item])),
      ...Object.fromEntries((developmentPerformance || []).map((item) => [item.id, { ...(data.developments || []).find((development) => development.id === item.id), ...item }])),
    })

    return source
      .map((item) => {
        const profile = developmentById[item.id] || {}
        const performance = performanceById[item.id] || {}
        const scopedRows = rowsByDevelopment[item.id] || []
        const activeTransactionsCount = Number(item.unitsInProgress || item.inProgress || performance.unitsInProgress || performance.inProgress || 0)
        const registeredTransactionsCount = Number(item.unitsRegistered || item.registered || performance.unitsRegistered || performance.registered || 0)
        const totalUnits = Number(item.totalUnits || performance.totalUnits || 0)
        const missingDocsCount = scopedRows.filter((row) => {
          const mainStage = String(row?.transaction?.stage || row?.transaction?.stage_key || '').toLowerCase()
          const missing = Number(row?.documentSummary?.missingCount || 0)
          return missing > 0 && mainStage !== 'registered'
        }).length
        const assignedAttorneyName = getPrimaryAttorney(scopedRows)
        const lifecycleStatus = toLifecycleStatus(profile.phase || profile.status || item.phase || item.status, {
          activeTransactionsCount,
          registeredTransactionsCount,
        })
        const attention = summarizeAttention({
          bottleneckCount: bottlenecksByDevelopment[item.id] || 0,
          missingDocsCount,
          missingAttorney: assignedAttorneyName === 'No attorney assigned',
          activeTransactionsCount,
        })
        const registeredLabel = `${registeredTransactionsCount} / ${totalUnits || 0} Registered`
        const progress = getDevelopmentProgress(totalUnits, activeTransactionsCount, registeredTransactionsCount)

        return {
          id: item.id,
          name: item.name,
          location: profile.location || item.location || item.phase || 'Location pending',
          lifecycleStatus,
          lifecycleLabel: toLifecycleLabel(lifecycleStatus),
          totalUnits,
          activeTransactionsCount,
          registeredTransactionsCount,
          attentionStatus: attention.status,
          attentionLabel: attention.label,
          attentionLines: attention.lines,
          assignedAttorneyName,
          lastUpdatedAt: item.lastActivity || profile.lastActivity || null,
          lastUpdatedLabel: formatRelativeDate(item.lastActivity || profile.lastActivity || null),
          registeredLabel,
          progress,
          primaryCtaUrl: `/developments/${item.id}`,
        }
      })
      .sort((left, right) => {
        if (right.activeTransactionsCount !== left.activeTransactionsCount) {
          return right.activeTransactionsCount - left.activeTransactionsCount
        }
        return left.name.localeCompare(right.name)
      })
  }, [bottlenecks, data.developments, developmentPerformance, rows])

  const filteredDevelopmentCards = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    let list = [...developmentCards]

    if (query) {
      list = list.filter((item) =>
        [item.name, item.location, item.assignedAttorneyName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query)),
      )
    }

    if (statusFilter !== 'all') {
      list = list.filter((item) => item.lifecycleStatus === statusFilter)
    }

    if (attentionFilter !== 'all') {
      list = list.filter((item) => item.attentionStatus === attentionFilter)
    }

    list.sort((left, right) => {
      if (sortBy === 'name_asc') return left.name.localeCompare(right.name)
      if (sortBy === 'most_transactions') return right.activeTransactionsCount - left.activeTransactionsCount || left.name.localeCompare(right.name)
      if (sortBy === 'recently_updated') {
        return new Date(right.lastUpdatedAt || 0).getTime() - new Date(left.lastUpdatedAt || 0).getTime()
      }
      return right.activeTransactionsCount - left.activeTransactionsCount || right.registeredTransactionsCount - left.registeredTransactionsCount
    })

    return list
  }, [attentionFilter, developmentCards, searchTerm, sortBy, statusFilter])

  const summaryItems = useMemo(
    () => [
      { label: 'Active Developments', value: developmentCards.filter((item) => item.lifecycleStatus === 'active').length, icon: Building2 },
      { label: 'Active Transactions', value: portfolioMetrics.dealsInProgress, icon: ArrowRightLeft },
      { label: 'Registered Deals', value: portfolioMetrics.unitsRegistered, icon: FileCheck2 },
      { label: 'Attention Required', value: developmentCards.filter((item) => item.attentionStatus === 'needs_attention').length, icon: AlertTriangle },
    ],
    [developmentCards, portfolioMetrics],
  )

  const totalResults = filteredDevelopmentCards.length
  const developmentTagTone = {
    active: 'border-[#cfe1f7] bg-[#eff6ff] text-[#35546c]',
    completed: 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]',
    archived: 'border-[#dde4ee] bg-[#f8fafc] text-[#66758b]',
  }

  const attentionTagTone = {
    needs_attention: 'border-[#f6d6d2] bg-[#fff3f2] text-[#b42318]',
    some_issues: 'border-[#f4e0b7] bg-[#fff7e9] text-[#b67218]',
    running_smoothly: 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]',
  }

  return (
    <section className="flex flex-col">
      {!isSupabaseConfigured ? (
        <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">
          Supabase is not configured for this workspace.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p>
      ) : null}
      {loading ? (
        <p className="rounded-[16px] border border-[#dde4ee] bg-white px-5 py-4 text-sm text-[#6b7d93]">Loading developments...</p>
      ) : null}

      {!loading && isSupabaseConfigured ? (
        <>
          <section className="mt-6">
            <SummaryCards items={summaryItems} />
          </section>

          <section className="mt-4 rounded-[22px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid min-w-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.25fr)_repeat(3,minmax(0,168px))]">
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Search</span>
                  <div className="flex h-[44px] min-w-0 items-center gap-3 rounded-[14px] border border-[#dde4ee] bg-white px-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                    <Search size={16} className="shrink-0 text-[#8ca0b6]" />
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search development, location, or attorney"
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[#162334] outline-none placeholder:text-[#96a6b8]"
                    />
                  </div>
                </label>

                <label className="flex min-w-0 flex-col gap-2">
                  <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Status</span>
                  <select
                    className="h-[44px] w-full rounded-[14px] border border-[#dde4ee] bg-white px-4 text-sm font-medium text-[#162334] outline-none shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition duration-150 ease-out focus:border-[#c9d6e4]"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>

                <label className="flex min-w-0 flex-col gap-2">
                  <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Attention</span>
                  <select
                    className="h-[44px] w-full rounded-[14px] border border-[#dde4ee] bg-white px-4 text-sm font-medium text-[#162334] outline-none shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition duration-150 ease-out focus:border-[#c9d6e4]"
                    value={attentionFilter}
                    onChange={(event) => setAttentionFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="needs_attention">Needs Attention</option>
                    <option value="some_issues">Some Issues Pending</option>
                    <option value="running_smoothly">Running Smoothly</option>
                  </select>
                </label>

                <label className="flex min-w-0 flex-col gap-2">
                  <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Sort</span>
                  <select
                    className="h-[44px] w-full rounded-[14px] border border-[#dde4ee] bg-white px-4 text-sm font-medium text-[#162334] outline-none shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition duration-150 ease-out focus:border-[#c9d6e4]"
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                  >
                    <option value="most_active">Most Active</option>
                    <option value="most_transactions">Most Transactions</option>
                    <option value="recently_updated">Most Recently Updated</option>
                    <option value="name_asc">Name A-Z</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 xl:justify-end">
                <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                  {totalResults} shown
                </span>
                <Button variant="ghost" onClick={loadData} disabled={loading}>
                  <RefreshCw size={16} />
                  Refresh
                </Button>
                <Button onClick={() => setShowCreateModal(true)} disabled={!isSupabaseConfigured}>
                  <Plus size={16} />
                  Add Development
                </Button>
              </div>
            </div>
          </section>

          {totalResults ? (
            <section className="mt-6 rounded-[22px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <SectionHeader
                title="Development Workspace"
                actions={
                  <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                    {totalResults} developments
                  </span>
                }
              />

              <div className="mt-8 grid gap-6 xl:grid-cols-2 2xl:grid-cols-3">
                {filteredDevelopmentCards.map((item) => (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-[22px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:-translate-y-[1px] hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]"
                    onClick={() =>
                      navigate(item.primaryCtaUrl, {
                        state: { headerTitle: item.name },
                      })
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigate(item.primaryCtaUrl, {
                          state: { headerTitle: item.name },
                        })
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex min-h-[160px] items-center justify-center bg-[linear-gradient(180deg,#496b88_0%,#2c4559_100%)]" aria-hidden="true">
                      <div className="inline-flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/14 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                        <Building2 size={24} />
                      </div>
                    </div>

                    <div className="flex flex-col gap-6 px-6 py-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.78rem] font-semibold ${developmentTagTone[item.lifecycleStatus] || developmentTagTone.active}`}>
                          {item.lifecycleLabel}
                        </span>
                        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.78rem] font-semibold ${attentionTagTone[item.attentionStatus] || attentionTagTone.running_smoothly}`}>
                          <ShieldCheck size={14} />
                          {item.attentionLabel}
                        </span>
                      </div>

                      <div className="flex flex-col gap-2">
                        <h4 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-[#142132]">{item.name}</h4>
                        <p className="inline-flex items-center gap-2 text-[0.92rem] text-[#6b7d93]">
                          <MapPin size={14} />
                          {item.location}
                        </p>
                      </div>

                      <div className="grid gap-2 text-[0.92rem] leading-6 text-[#51657b]">
                        <p>{item.attentionLines[0]}</p>
                        <p>Attorney: {item.assignedAttorneyName}</p>
                        <p>{item.lastUpdatedLabel}</p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <article className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfcfe] px-4 py-4">
                          <span className="block text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Units</span>
                          <strong className="mt-2 block text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">{item.totalUnits}</strong>
                        </article>
                        <article className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfcfe] px-4 py-4">
                          <span className="block text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Live Deals</span>
                          <strong className="mt-2 block text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">{item.activeTransactionsCount}</strong>
                        </article>
                        <article className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfcfe] px-4 py-4">
                          <span className="block text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Registered</span>
                          <strong className="mt-2 block text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">{item.registeredTransactionsCount}</strong>
                        </article>
                      </div>

                      <div className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfcfe] px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Progress</span>
                          <span className="text-[0.76rem] font-semibold text-[#66758b]">{item.progress.total} units</span>
                        </div>
                        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[#e5ebf3]">
                          {item.progress.total > 0 ? (
                            <div className="flex h-full w-full">
                              <div
                                className="h-full bg-[#97a4b7]"
                                style={{ width: `${(item.progress.available / item.progress.total) * 100}%` }}
                                aria-label="Available"
                              />
                              <div
                                className="h-full bg-[#e2af3f]"
                                style={{ width: `${(item.progress.inProgress / item.progress.total) * 100}%` }}
                                aria-label="In Progress"
                              />
                              <div
                                className="h-full bg-[#2f8f5c]"
                                style={{ width: `${(item.progress.completed / item.progress.total) * 100}%` }}
                                aria-label="Completed"
                              />
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <div className="flex items-center gap-2 text-[0.78rem] text-[#5f7288]">
                            <span className="h-2 w-2 rounded-full bg-[#97a4b7]" aria-hidden="true" />
                            Available ({item.progress.available})
                          </div>
                          <div className="flex items-center gap-2 text-[0.78rem] text-[#5f7288]">
                            <span className="h-2 w-2 rounded-full bg-[#e2af3f]" aria-hidden="true" />
                            In Progress ({item.progress.inProgress})
                          </div>
                          <div className="flex items-center gap-2 text-[0.78rem] text-[#5f7288]">
                            <span className="h-2 w-2 rounded-full bg-[#2f8f5c]" aria-hidden="true" />
                            Completed ({item.progress.completed})
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-1">
                        <Button
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation()
                            navigate(item.primaryCtaUrl, {
                              state: { headerTitle: item.name },
                            })
                          }}
                        >
                          Overview
                        </Button>
                        <Button
                          onClick={(event) => {
                            event.stopPropagation()
                            navigate(item.primaryCtaUrl, {
                              state: { headerTitle: item.name },
                            })
                          }}
                        >
                          Open Development
                          <ArrowRight size={15} />
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <section className="mt-10 rounded-[22px] border border-[#dde4ee] bg-white px-8 py-10 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <h3 className="text-[1.18rem] font-semibold tracking-[-0.03em] text-[#142132]">
                {developmentCards.length ? 'No developments match the current filters' : 'No developments added yet'}
              </h3>
              <p className="mt-3 max-w-[640px] text-[0.98rem] leading-7 text-[#6b7d93]">
                {developmentCards.length
                  ? 'Adjust the search or filters to see more developments, or reset the current view.'
                  : 'Create your first development to start tracking units, transactions, and project activity.'}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {developmentCards.length ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSearchTerm('')
                      setStatusFilter('all')
                      setAttentionFilter('all')
                      setSortBy('most_active')
                    }}
                  >
                    Reset Filters
                  </Button>
                ) : null}
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus size={16} />
                  Add Development
                </Button>
              </div>
            </section>
          )}
        </>
      ) : null}

      <AddDevelopmentModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          window.dispatchEvent(new Event('itg:developments-changed'))
          void loadData()
        }}
      />
    </section>
  )
}

export default Developments
