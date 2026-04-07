import {
  Activity,
  ArrowRightLeft,
  Building2,
  ChevronRight,
  MapPin,
  PieChart,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  MobileCard,
  MobileMetricCard,
  MobileSection,
  MobileSegmentedBar,
  MobileStatusChip,
  MobileTopBar,
  MobileEmptyState,
} from '../../components/mobile/ExecutiveMobileUi'
import { selectBottlenecks } from '../../core/transactions/developerSelectors'
import { fetchDevelopmentsData } from '../../lib/api'
import {
  currencyFormatter,
  formatFinanceMixLabel,
  formatPercent,
  formatRelativeTimestamp,
  getDevelopmentProgressBuckets,
  getFinanceMixBuckets,
  getRowUpdatedAt,
  integerFormatter,
} from '../../lib/mobileExecutive'
import { isSupabaseConfigured } from '../../lib/supabaseClient'

function toneForDevelopmentCard(item) {
  if (item.attentionCount >= 3) return { label: 'Needs Attention', tone: 'danger' }
  if (item.attentionCount > 0) return { label: 'Monitoring', tone: 'warning' }
  if (item.completed === item.totalUnits && item.totalUnits > 0) return { label: 'Completed', tone: 'positive' }
  return { label: 'Healthy', tone: 'default' }
}

export default function MobileDevelopmentsPage() {
  const [state, setState] = useState({
    loading: true,
    error: '',
    rows: [],
    developments: [],
    metrics: {
      totalDevelopments: 0,
      totalUnits: 0,
      totalRevenue: 0,
      activeTransactions: 0,
      unitsRegistered: 0,
    },
  })

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setState((current) => ({ ...current, loading: false }))
      return
    }

    try {
      const response = await fetchDevelopmentsData()
      setState({
        loading: false,
        error: '',
        rows: response.rows || [],
        developments: response.developments || [],
        metrics: response.metrics || {},
      })
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error.message || 'Unable to load developments.',
      }))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const rows = state.rows || []
  const bottlenecks = useMemo(() => selectBottlenecks(rows), [rows])
  const portfolioProgress = useMemo(() => getDevelopmentProgressBuckets(rows), [rows])
  const totalDevelopments = useMemo(() => {
    const explicitCount = Number(state.metrics.totalDevelopments || state.developments.length || 0)
    if (explicitCount > 0) return explicitCount
    return new Set(rows.map((row) => row?.development?.id || row?.unit?.development_id).filter(Boolean)).size
  }, [rows, state.developments.length, state.metrics.totalDevelopments])
  const portfolioRevenue = useMemo(() => {
    return rows.reduce((sum, row) => {
      if (!row?.transaction || String(row?.stage || '').trim().toLowerCase() === 'available') {
        return sum
      }
      const value = Number(row?.transaction?.sales_price ?? row?.unit?.price ?? 0)
      return Number.isFinite(value) ? sum + value : sum
    }, 0)
  }, [rows])

  const summaryCards = useMemo(() => {
    const totalUnits = rows.length
    const soldOrActive = portfolioProgress.completed + portfolioProgress.inProgress
    const conversion = totalUnits ? (soldOrActive / totalUnits) * 100 : 0
    const completion = totalUnits ? (portfolioProgress.completed / totalUnits) * 100 : 0

    return [
      {
        key: 'developments',
        label: 'Developments',
        value: integerFormatter.format(totalDevelopments || 0),
        meta: `${integerFormatter.format(totalUnits || 0)} units tracked`,
        icon: Building2,
      },
      {
        key: 'transactions',
        label: 'Live Deals',
        value: integerFormatter.format(portfolioProgress.inProgress || 0),
        meta: `${integerFormatter.format(portfolioProgress.completed || 0)} registered`,
        icon: ArrowRightLeft,
      },
      {
        key: 'conversion',
        label: 'Conversion',
        value: formatPercent(conversion),
        meta: 'Sold across portfolio',
        icon: PieChart,
      },
      {
        key: 'revenue',
        label: 'Revenue',
        value: currencyFormatter.format(portfolioRevenue || state.metrics.totalRevenue || 0),
        meta: `${formatPercent(completion)} portfolio completion`,
        icon: Wallet,
        tone: 'dark',
      },
    ]
  }, [portfolioProgress, portfolioRevenue, rows.length, state.metrics.totalRevenue, totalDevelopments])

  const developmentCards = useMemo(() => {
    const developmentRows = rows.reduce((accumulator, row) => {
      const developmentId = row?.development?.id || row?.unit?.development_id
      if (!developmentId) return accumulator
      if (!accumulator[developmentId]) accumulator[developmentId] = []
      accumulator[developmentId].push(row)
      return accumulator
    }, {})

    const developmentIdByTransactionId = rows.reduce((accumulator, row) => {
      if (row?.transaction?.id) accumulator[row.transaction.id] = row?.development?.id || row?.unit?.development_id || null
      return accumulator
    }, {})
    const developmentIdByUnitId = rows.reduce((accumulator, row) => {
      if (row?.unit?.id) accumulator[row.unit.id] = row?.development?.id || row?.unit?.development_id || null
      return accumulator
    }, {})
    const attentionCountByDevelopmentId = bottlenecks.reduce((accumulator, item) => {
      const developmentId = developmentIdByTransactionId[item.transactionId] || developmentIdByUnitId[item.unitId]
      if (!developmentId) return accumulator
      accumulator[developmentId] = (accumulator[developmentId] || 0) + 1
      return accumulator
    }, {})

    return (state.developments || [])
      .map((development) => {
        const scopedRows = developmentRows[development.id] || []
        const progress = getDevelopmentProgressBuckets(scopedRows)
        const financeMix = getFinanceMixBuckets(scopedRows)
        const totalUnits = scopedRows.length || development.totalUnits || 0
        const soldOrActive = progress.completed + progress.inProgress
        const sellThroughPercent = totalUnits ? (soldOrActive / totalUnits) * 100 : 0
        const latestTimestamp = scopedRows.reduce((latest, row) => {
          const candidate = getRowUpdatedAt(row)
          if (!candidate) return latest
          if (!latest) return candidate
          return new Date(candidate) > new Date(latest) ? candidate : latest
        }, development.lastActivity || null)

        return {
          ...development,
          developerCompany: development.developerCompany || null,
          totalUnits,
          completed: progress.completed,
          inProgress: progress.inProgress,
          notStarted: progress.notStarted,
          sellThroughPercent,
          attentionCount: attentionCountByDevelopmentId[development.id] || 0,
          liveDeals: progress.inProgress,
          lastUpdated: latestTimestamp,
          financeMixLabel: formatFinanceMixLabel(financeMix),
        }
      })
      .sort((left, right) => new Date(right.lastUpdated || 0).getTime() - new Date(left.lastUpdated || 0).getTime())
  }, [bottlenecks, rows, state.developments])

  const companyTitle = useMemo(() => {
    return developmentCards.find((item) => item.developerCompany)?.developerCompany || 'Bridge'
  }, [developmentCards])

  return (
    <>
      <MobileTopBar
        title="Developments"
        subtitle="Bridge Right Now"
        tone="hero"
        rightAction={
          <MobileStatusChip
            label={companyTitle}
            tone="dark"
            className="max-w-[148px] truncate !border-white/16 !bg-white/12 !text-white"
          />
        }
      />

      {state.loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-[108px] animate-pulse rounded-[28px] border border-[#e3e8f1] bg-white" />
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-[278px] animate-pulse rounded-[28px] border border-[#e3e8f1] bg-white" />
          ))}
        </div>
      ) : state.error ? (
        <MobileEmptyState title="Unable to load portfolio" body={state.error} />
      ) : (
        <>
          <MobileSection title="">
            <div className="grid grid-cols-2 gap-3">
              {summaryCards.map((card) => (
                <MobileMetricCard key={card.key} {...card} />
              ))}
            </div>
          </MobileSection>

          <MobileSection title="">
            {developmentCards.length ? (
              <div className="space-y-4">
                {developmentCards.map((development) => {
                  const tone = toneForDevelopmentCard(development)

                  return (
                    <Link key={development.id} to={`/m/developments/${development.id}`} className="block transition-transform duration-200 active:scale-[0.992]">
                      <MobileCard className="overflow-hidden p-0">
                        <div className="border-b border-[#ece3d7] bg-[linear-gradient(160deg,#111111_0%,#353430_64%,#7c6956_100%)] px-4 py-4 text-white">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate text-xl font-semibold tracking-[-0.03em] text-white">{development.name}</h3>
                              <div className="mt-2 flex items-center gap-2 text-sm text-white/74">
                                <MapPin className="h-4 w-4 text-[#decdb8]" />
                                <span className="truncate">{development.location || 'Location pending'}</span>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-start gap-2">
                              <MobileStatusChip label={tone.label} tone={tone.tone} />
                              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.15)_0%,rgba(255,255,255,0.06)_100%)] text-white">
                                <ChevronRight className="h-4 w-4" />
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#dbcdbd]">
                              {formatRelativeTimestamp(development.lastUpdated)}
                            </span>
                            {development.attentionCount > 0 ? (
                              <span className="rounded-full border border-[#d8b784] bg-[rgba(255,244,224,0.14)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f4d3a0]">
                                {development.attentionCount} alerts
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="space-y-4 px-4 py-4">
                          <MobileSegmentedBar
                            segments={[
                              {
                                key: 'completed',
                                label: 'Completed',
                                value: development.completed,
                                className: 'bg-[#101828]',
                                dotClassName: 'bg-[#101828]',
                              },
                              {
                                key: 'inProgress',
                                label: 'In Progress',
                                value: development.inProgress,
                                className: 'bg-[#6f86a0]',
                                dotClassName: 'bg-[#6f86a0]',
                              },
                              {
                                key: 'notStarted',
                                label: 'Not Started',
                                value: development.notStarted,
                                className: 'bg-[#d6dee9]',
                                dotClassName: 'bg-[#d6dee9]',
                              },
                            ]}
                          />

                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-[20px] border border-[#eee5d9] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f1e8_100%)] px-3 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a806f]">Total Units</p>
                              <strong className="mt-1 block text-[30px] font-semibold tracking-[-0.04em] text-[#101010]">
                                {integerFormatter.format(development.totalUnits || 0)}
                              </strong>
                            </div>
                            <div className="rounded-[20px] border border-[#eee5d9] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f1e8_100%)] px-3 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a806f]">Conversion</p>
                              <strong className="mt-1 block text-[30px] font-semibold tracking-[-0.04em] text-[#101010]">
                                {formatPercent(development.sellThroughPercent || 0)}
                              </strong>
                            </div>
                            <div className="rounded-[20px] border border-[#eee5d9] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f1e8_100%)] px-3 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a806f]">Live Deals</p>
                              <strong className="mt-1 block text-[30px] font-semibold tracking-[-0.04em] text-[#101010]">
                                {integerFormatter.format(development.liveDeals || 0)}
                              </strong>
                            </div>
                            <div className="rounded-[20px] border border-[#eee5d9] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f1e8_100%)] px-3 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a806f]">Cash vs Bond</p>
                              <strong className="mt-1 block text-sm font-semibold leading-5 text-[#101010]">{development.financeMixLabel}</strong>
                            </div>
                          </div>
                        </div>
                      </MobileCard>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <MobileEmptyState
                title="No developments yet"
                body="Once developments and transactions exist, the mobile executive layer will summarize them here."
              />
            )}
          </MobileSection>
        </>
      )}
    </>
  )
}
