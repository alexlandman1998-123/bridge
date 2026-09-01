import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  Home,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AddDevelopmentModal from '../components/AddDevelopmentModal'
import Button from '../components/ui/Button'
import { selectBottlenecks, selectDevelopmentPerformance, selectPortfolioMetrics } from '../core/transactions/developerSelectors'
import { fetchDevelopmentsData } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { useWorkspace } from '../context/WorkspaceContext'

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

function toStatusBadgeLabel(status) {
  return toLifecycleLabel(status).toUpperCase()
}

function getProgressPercent(progress) {
  const total = clampCount(progress?.total)
  if (!total) return 0
  return Math.round(((clampCount(progress?.inProgress) + clampCount(progress?.completed)) / total) * 100)
}

function getDevelopmentCoverFallback(name = '') {
  const seed = String(name || '').length % 3
  const gradients = [
    'linear-gradient(135deg, rgba(8,37,52,0.96) 0%, rgba(21,76,70,0.88) 56%, rgba(226,175,63,0.72) 100%)',
    'linear-gradient(135deg, rgba(15,35,54,0.96) 0%, rgba(45,89,109,0.9) 58%, rgba(139,159,176,0.68) 100%)',
    'linear-gradient(135deg, rgba(23,50,45,0.96) 0%, rgba(40,91,87,0.9) 55%, rgba(218,185,104,0.7) 100%)',
  ]
  return gradients[seed]
}

function formatLocation(value) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized.toLowerCase() === 'location pending') return 'Location not added'
  return normalized
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
  const { currentWorkspace, role } = useWorkspace()
  const currentWorkspaceId = String(currentWorkspace?.id || '').trim()
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
      const response = await fetchDevelopmentsData({ organisationId: currentWorkspaceId })
      setData(response)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [currentWorkspaceId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    function refreshDevelopments() {
      void loadData()
    }

    window.addEventListener('itg:transaction-created', refreshDevelopments)
    window.addEventListener('itg:transaction-updated', refreshDevelopments)
    window.addEventListener('itg:developments-changed', refreshDevelopments)
    return () => {
      window.removeEventListener('itg:transaction-created', refreshDevelopments)
      window.removeEventListener('itg:transaction-updated', refreshDevelopments)
      window.removeEventListener('itg:developments-changed', refreshDevelopments)
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
          location: formatLocation(profile.location || item.location || item.phase),
          coverImageUrl: profile.coverImageUrl || item.coverImageUrl || null,
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
          registeredLabel,
          progress,
          progressPercent: getProgressPercent(progress),
          primaryCtaUrl: role === 'developer' ? `/developer/developments/${item.id}` : `/developments/${item.id}`,
        }
      })
      .sort((left, right) => {
        if (right.activeTransactionsCount !== left.activeTransactionsCount) {
          return right.activeTransactionsCount - left.activeTransactionsCount
        }
        return left.name.localeCompare(right.name)
      })
  }, [bottlenecks, data.developments, developmentPerformance, role, rows])

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

  const heroMetrics = useMemo(
    () => [
      { label: 'Total Developments', value: developmentCards.length, icon: Building2 },
      {
        label: 'Total Units',
        value: developmentCards.reduce((total, item) => total + item.totalUnits, 0) || data.metrics.totalUnits || 0,
        icon: Home,
      },
      { label: 'Live Deals', value: portfolioMetrics.dealsInProgress, icon: ArrowRightLeft },
      { label: 'Registered', value: portfolioMetrics.unitsRegistered, icon: CheckCircle2 },
      {
        label: 'Needs Attention',
        value: developmentCards.filter((item) => item.attentionStatus === 'needs_attention').length,
        icon: AlertTriangle,
      },
    ],
    [data.metrics.totalUnits, developmentCards, portfolioMetrics],
  )

  const totalResults = filteredDevelopmentCards.length
  const developmentTagTone = {
    active: 'border-white/20 bg-[#0e8b62] text-white',
    completed: 'border-white/20 bg-[#1e6b42] text-white',
    archived: 'border-white/20 bg-[#4f5f72] text-white',
  }

  const attentionTextTone = {
    needs_attention: 'text-[#b42318]',
    some_issues: 'text-[#b67218]',
    running_smoothly: 'text-[#1c7d45]',
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
          <section className="mt-6 overflow-hidden rounded-[26px] border border-white/10 bg-[#10293a] shadow-[0_22px_50px_rgba(15,23,42,0.14)]">
            <div className="relative min-h-[250px] px-6 py-8 text-white sm:px-8 lg:px-10">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(47,143,92,0.32),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(226,175,63,0.26),transparent_24%),linear-gradient(135deg,#071b28_0%,#10293a_48%,#203f4b_100%)]" aria-hidden="true" />
              <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(120deg,rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(60deg,rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:88px_88px]" aria-hidden="true" />
              <div className="relative z-10 flex h-full flex-col justify-between gap-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">Portfolio View</p>
                  <h1 className="mt-4 text-[clamp(2rem,4vw,3.4rem)] font-semibold leading-none tracking-[-0.06em] text-[#f8fbff]">
                    Developments
                  </h1>
                  <p className="mt-3 max-w-[620px] text-[1rem] font-medium leading-7 text-white">
                    Oversee your entire portfolio. Build better. Sell faster.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {heroMetrics.map((metric) => {
                    const Icon = metric.icon
                    return (
                      <article
                        key={metric.label}
                        className="rounded-[18px] border border-white/12 bg-white/[0.12] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-[0.78rem] font-semibold text-white/78">{metric.label}</span>
                          <Icon size={18} className="text-[#5fe0a4]" />
                        </div>
                        <strong className="mt-3 block text-[1.75rem] font-semibold leading-none tracking-[-0.04em] text-[#f8fbff]">
                          {metric.value}
                        </strong>
                      </article>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-[22px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
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
            <section className="mt-6">
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {filteredDevelopmentCards.map((item) => (
                  <article
                    key={item.id}
                    className="group min-w-0 cursor-pointer overflow-hidden rounded-[22px] border border-[#dde4ee] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.07)] transition duration-200 ease-out hover:-translate-y-[2px] hover:border-[#cfdbea] hover:shadow-[0_22px_44px_rgba(15,23,42,0.11)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f8f5c]"
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
                    <div
                      className="relative h-[148px] overflow-hidden bg-[#183247]"
                      style={!item.coverImageUrl ? { background: getDevelopmentCoverFallback(item.name) } : undefined}
                    >
                      {item.coverImageUrl ? (
                        <img src={item.coverImageUrl} alt="" className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.03]" loading="lazy" />
                      ) : (
                        <div className="absolute inset-0" aria-hidden="true">
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(95,224,164,0.18),transparent_28%),radial-gradient(circle_at_84%_20%,rgba(226,175,63,0.16),transparent_30%)]" />
                          <Building2 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/82" size={34} />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,28,0.08)_0%,rgba(5,18,28,0.52)_100%)]" aria-hidden="true" />
                      <div className="absolute left-4 top-4 flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-[9px] border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] shadow-[0_8px_18px_rgba(0,0,0,0.12)] ${developmentTagTone[item.lifecycleStatus] || developmentTagTone.active}`}>
                          {toStatusBadgeLabel(item.lifecycleStatus)}
                        </span>
                      </div>
                      <span className="absolute right-4 top-4 rounded-[9px] bg-white/92 px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-[#30465b] shadow-[0_8px_18px_rgba(0,0,0,0.12)]">
                        {item.totalUnits} units
                      </span>
                    </div>

                    <div className="px-5 py-5">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="truncate text-[1.08rem] font-semibold tracking-[-0.035em] text-[#142132]">{item.name}</h4>
                          <p className="mt-1.5 inline-flex min-w-0 items-center gap-2 text-[0.84rem] text-[#6b7d93]">
                            <MapPin size={14} />
                            <span className="truncate">{item.location}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#5f7288] transition hover:bg-[#eef3f8] hover:text-[#142132] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f8f5c]"
                          aria-label={`Manage listings for ${item.name}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            navigate(`/listings?developmentId=${encodeURIComponent(item.id)}`)
                          }}
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      </div>

                      <div className="mt-4 space-y-1.5 text-[0.82rem] leading-5 text-[#60758d]">
                        <p>
                          <span className={attentionTextTone[item.attentionStatus] || attentionTextTone.running_smoothly}>
                            {item.attentionLines[0]}
                          </span>
                          {item.attentionStatus !== 'running_smoothly' && item.assignedAttorneyName === 'No attorney assigned' ? (
                            <span> • No attorney assigned</span>
                          ) : null}
                        </p>
                      </div>

                      <div className="mt-5">
                        <div className="flex items-center justify-between gap-3 text-[0.78rem] font-semibold text-[#66758b]">
                          <span>{item.progressPercent}% progressed</span>
                          <span>{item.activeTransactionsCount} live deals</span>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#e5ebf3]">
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
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                          <div className="flex items-center gap-2 text-[0.74rem] text-[#5f7288]">
                            <span className="h-2 w-2 rounded-full bg-[#97a4b7]" aria-hidden="true" />
                            Available {item.progress.available}
                          </div>
                          <div className="flex items-center gap-2 text-[0.74rem] text-[#5f7288]">
                            <span className="h-2 w-2 rounded-full bg-[#e2af3f]" aria-hidden="true" />
                            In Progress {item.progress.inProgress}
                          </div>
                          <div className="flex items-center gap-2 text-[0.74rem] text-[#5f7288]">
                            <span className="h-2 w-2 rounded-full bg-[#2f8f5c]" aria-hidden="true" />
                            Completed {item.progress.completed}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 flex items-center justify-between border-t border-[#edf2f7] pt-4 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">
                        <span>{item.registeredTransactionsCount} registered</span>
                        <span className="inline-flex items-center gap-1 text-[#16724f]">
                          Open workspace
                          <ArrowRight size={13} />
                        </span>
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
