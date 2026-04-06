import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  Building2,
  CheckCircle2,
  FileWarning,
  Layers3,
  MapPin,
  Wallet,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  MobileActivityFeed,
  MobileAttentionTile,
  MobileCard,
  MobileEmptyState,
  MobileLastUpdatedCard,
  MobileMetricCard,
  MobileSection,
  MobileSegmentedBar,
  MobileTopBar,
  MobileTransactionCard,
} from '../../components/mobile/ExecutiveMobileUi'
import {
  selectActiveTransactions,
  selectDealBottleneckSummary,
  selectDevelopmentPerformance,
  selectFinanceMix,
  selectStageDistribution,
} from '../../core/transactions/developerSelectors'
import { fetchDevelopmentDetail, fetchReportRows } from '../../lib/api'
import {
  currencyFormatter,
  formatPercent,
  getDevelopmentProgressBuckets,
  getLatestMovementSummary,
  getLatestTimestamp,
  integerFormatter,
} from '../../lib/mobileExecutive'
import { isSupabaseConfigured } from '../../lib/supabaseClient'

function buildHeroSubtitle(detail, totalUnits) {
  return [
    detail?.profile?.location || detail?.development?.location || null,
    totalUnits ? `${integerFormatter.format(totalUnits)} units` : null,
    detail?.profile?.status || detail?.development?.status || null,
  ]
    .filter(Boolean)
    .join(' • ')
}

function getHealthMeta(totalFlagged) {
  if (totalFlagged >= 3) {
    return { label: 'Needs Attention', tone: 'danger', accent: 'bg-[#b14a3b]' }
  }
  if (totalFlagged > 0) {
    return { label: 'Monitoring', tone: 'warning', accent: 'bg-[#b7802d]' }
  }
  return { label: 'Healthy', tone: 'positive', accent: 'bg-[#2f6a41]' }
}

export default function MobileDevelopmentDetailPage() {
  const { developmentId } = useParams()
  const [state, setState] = useState({
    loading: true,
    error: '',
    detail: null,
    reportRows: [],
  })

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setState((current) => ({ ...current, loading: false }))
      return
    }

    try {
      const [detail, reportRows] = await Promise.all([
        fetchDevelopmentDetail(developmentId),
        fetchReportRows({ developmentId }),
      ])

      setState({
        loading: false,
        error: '',
        detail,
        reportRows: reportRows || [],
      })
    } catch (error) {
      setState({
        loading: false,
        error: error.message || 'Unable to load development overview.',
        detail: null,
        reportRows: [],
      })
    }
  }, [developmentId])

  useEffect(() => {
    void load()
  }, [load])

  const detail = state.detail
  const rows = detail?.rows || []
  const scopedPerformance = useMemo(
    () => selectDevelopmentPerformance(rows).find((item) => item.id === developmentId) || null,
    [developmentId, rows],
  )
  const progress = useMemo(() => getDevelopmentProgressBuckets(rows), [rows])
  const financeMix = useMemo(() => selectFinanceMix(rows), [rows])
  const activeTransactions = useMemo(() => selectActiveTransactions(rows).slice(0, 8), [rows])
  const bottleneckSummary = useMemo(() => selectDealBottleneckSummary(rows), [rows])
  const stageDistribution = useMemo(() => selectStageDistribution(rows), [rows])
  const latestUpdatedAt = useMemo(() => getLatestTimestamp(rows), [rows])
  const latestMovementSummary = useMemo(
    () => state.reportRows[0]?.report?.latestOperationalNote || getLatestMovementSummary(rows),
    [rows, state.reportRows],
  )

  const totalUnits = scopedPerformance?.totalUnits || detail?.stats?.totalUnits || rows.length
  const heroSubtitle = buildHeroSubtitle(detail, totalUnits)
  const health = useMemo(() => getHealthMeta(bottleneckSummary.totalFlagged || 0), [bottleneckSummary.totalFlagged])

  const financeMixCounts = useMemo(() => {
    return financeMix.reduce(
      (accumulator, item) => {
        accumulator[item.key] = item.count
        return accumulator
      },
      { cash: 0, bond: 0, combination: 0, unknown: 0 },
    )
  }, [financeMix])

  const metricCards = useMemo(() => {
    const conversion = totalUnits ? ((scopedPerformance?.unitsSold || 0) / totalUnits) * 100 : 0

    return [
      {
        key: 'leads',
        label: 'Total Units',
        value: integerFormatter.format(totalUnits || 0),
        icon: Building2,
      },
      {
        key: 'transactions',
        label: 'Active Transactions',
        value: integerFormatter.format(scopedPerformance?.unitsInProgress || 0),
        icon: ArrowRightLeft,
      },
      {
        key: 'conversion',
        label: 'Conversion',
        value: formatPercent(conversion),
        icon: Activity,
      },
      {
        key: 'registered',
        label: 'Registered',
        value: integerFormatter.format(scopedPerformance?.unitsRegistered || 0),
        icon: CheckCircle2,
      },
      {
        key: 'cash',
        label: 'Cash Buyers',
        value: integerFormatter.format(financeMixCounts.cash || 0),
        icon: Wallet,
      },
      {
        key: 'bond',
        label: 'Bond Buyers',
        value: integerFormatter.format(financeMixCounts.bond || 0),
        icon: Banknote,
      },
    ]
  }, [financeMixCounts.bond, financeMixCounts.cash, scopedPerformance?.unitsInProgress, scopedPerformance?.unitsRegistered, scopedPerformance?.unitsSold, totalUnits])

  const attentionTiles = useMemo(() => {
    return bottleneckSummary.items
      .filter((item) => item.count > 0)
      .slice(0, 4)
      .map((item) => ({
        ...item,
        tone: item.severity === 'critical' ? 'danger' : item.severity === 'warning' ? 'warning' : item.severity === 'positive' ? 'positive' : 'default',
      }))
  }, [bottleneckSummary.items])

  const recentActivity = useMemo(() => {
    return state.reportRows
      .filter((row) => row?.transaction)
      .slice(0, 5)
      .map((row) => ({
        id: row.transaction.id,
        title: `${row.development?.name || detail?.development?.name || 'Development'} • Unit ${row.unit?.unit_number || '-'}`,
        body: row.report?.latestOperationalNote || row.transaction?.next_action || row.stage || 'No recent movement summary available.',
        timestamp: row.transaction?.updated_at || row.transaction?.created_at || null,
        meta: row.buyer?.name || row.report?.stageLabel || row.stage,
      }))
  }, [detail?.development?.name, state.reportRows])

  return (
    <>
      <MobileTopBar title={detail?.development?.name || 'Development'} backTo="/m/developments" />

      {state.loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-[180px] animate-pulse rounded-[28px] border border-[#e3e8f1] bg-white" />
          ))}
        </div>
      ) : state.error ? (
        <MobileEmptyState title="Unable to load development" body={state.error} />
      ) : !detail ? (
        <MobileEmptyState title="Development not found" body="This development could not be found in the current workspace." />
      ) : (
        <>
          <MobileCard className="mb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm text-[#665d50]">
                  <MapPin className="h-4 w-4 text-[#938774]" />
                  <span className="truncate">{heroSubtitle || 'Development identity still being completed'}</span>
                </div>
              </div>
              <MobileStatusChip label={detail?.profile?.status || detail?.development?.status || 'Active'} tone="default" />
            </div>
          </MobileCard>

          <MobileLastUpdatedCard
            timestamp={latestUpdatedAt}
            summary={latestMovementSummary}
            extra={recentActivity.length ? `${recentActivity.length} recent movements available` : ''}
          />

          <div className="mb-5 space-y-3">
            <MobileCard className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a806f]">Health</p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#101010]">{health.label}</h3>
              </div>
              <div className="flex items-center gap-3 rounded-full border border-[#ece3d8] bg-[#faf6ef] px-3 py-2">
                <span className={`h-3 w-3 rounded-full ${health.accent}`} />
                <span className="text-sm font-semibold text-[#262018]">{integerFormatter.format(bottleneckSummary.totalFlagged || 0)} flags</span>
              </div>
            </MobileCard>

            <MobileCard>
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a806f]">Portfolio Completion</p>
                  <h3 className="mt-1 text-[34px] font-semibold tracking-[-0.05em] text-[#101010]">
                    {formatPercent(totalUnits ? (progress.completed / totalUnits) * 100 : 0)}
                  </h3>
                </div>
                <div className="rounded-[18px] border border-[#ece3d8] bg-[#faf6ef] px-3 py-2 text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a806f]">Revenue Secured</p>
                  <strong className="mt-1 block text-base font-semibold text-[#101010]">
                    {currencyFormatter.format(scopedPerformance?.revenueSecured || 0)}
                  </strong>
                </div>
              </div>

              <MobileSegmentedBar
                segments={[
                  {
                    key: 'completed',
                    label: 'Completed',
                    value: progress.completed,
                    className: 'bg-[#111111]',
                    dotClassName: 'bg-[#111111]',
                  },
                  {
                    key: 'inProgress',
                    label: 'In Progress',
                    value: progress.inProgress,
                    className: 'bg-[#8c8c8c]',
                    dotClassName: 'bg-[#8c8c8c]',
                  },
                  {
                    key: 'notStarted',
                    label: 'Not Started',
                    value: progress.notStarted,
                    className: 'bg-[#d8cfbf]',
                    dotClassName: 'bg-[#d8cfbf]',
                  },
                ]}
              />
            </MobileCard>
          </div>

          <MobileCard className="mb-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#101010]">Key Metrics</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {metricCards.map((card) => (
                <MobileMetricCard key={card.key} {...card} />
              ))}
            </div>
          </MobileCard>

          <MobileCard className="mb-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#101010]">Analytics</h2>
            </div>
            <div className="space-y-3">
              <div className="rounded-[22px] border border-[#ece3d8] bg-[#faf6ef] p-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#101010]">Buyer Finance Mix</h3>
                  </div>
                  <span className="rounded-full border border-[#e8ddd0] bg-[#fffdf9] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6f6457]">
                    {integerFormatter.format((financeMixCounts.cash || 0) + (financeMixCounts.bond || 0) + (financeMixCounts.combination || 0))} deals
                  </span>
                </div>

                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-[#ece5db]">
                  <span
                    className="h-full bg-[#111111]"
                    style={{ width: `${Math.max((((financeMixCounts.cash || 0) / Math.max((financeMixCounts.cash || 0) + (financeMixCounts.bond || 0) + (financeMixCounts.combination || 0), 1)) * 100), financeMixCounts.cash ? 8 : 0)}%` }}
                  />
                  <span
                    className="h-full bg-[#8b8b8b]"
                    style={{ width: `${Math.max((((financeMixCounts.bond || 0) / Math.max((financeMixCounts.cash || 0) + (financeMixCounts.bond || 0) + (financeMixCounts.combination || 0), 1)) * 100), financeMixCounts.bond ? 8 : 0)}%` }}
                  />
                  <span
                    className="h-full bg-[#d6cdbf]"
                    style={{ width: `${Math.max((((financeMixCounts.combination || 0) / Math.max((financeMixCounts.cash || 0) + (financeMixCounts.bond || 0) + (financeMixCounts.combination || 0), 1)) * 100), financeMixCounts.combination ? 8 : 0)}%` }}
                  />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { key: 'cash', label: 'Cash', value: financeMixCounts.cash || 0 },
                    { key: 'bond', label: 'Bond', value: financeMixCounts.bond || 0 },
                    { key: 'combination', label: 'Hybrid', value: financeMixCounts.combination || 0 },
                  ].map((item) => (
                    <div key={item.key} className="rounded-[18px] border border-[#ece3d8] bg-[#fffdf9] px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a806f]">{item.label}</p>
                      <strong className="mt-1 block text-lg font-semibold text-[#101010]">{integerFormatter.format(item.value)}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-[#ece3d8] bg-[#faf6ef] p-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#101010]">Current Distribution</h3>
                  </div>
                  <span className="rounded-full border border-[#e8ddd0] bg-[#fffdf9] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6f6457]">
                    {integerFormatter.format(totalUnits || 0)} tracked
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {stageDistribution.map((stage) => (
                    <div key={stage.key} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-[#30291f]">{stage.label}</span>
                        <span className="text-[#7d7264]">{integerFormatter.format(stage.count)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#ece5db]">
                        <span className="block h-full rounded-full bg-[linear-gradient(90deg,#151515_0%,#7a7a7a_100%)]" style={{ width: `${Math.max(stage.share, stage.count ? 8 : 0)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </MobileCard>

          <div className="mb-5 space-y-3">
            <MobileCard className="px-4 py-4">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#101010]">Needs Attention</h2>
            </MobileCard>
            {attentionTiles.length ? (
              <div className="grid grid-cols-2 gap-3">
                {attentionTiles.map((item) => (
                  <MobileAttentionTile
                    key={item.key}
                    icon={item.key === 'missing_documents' ? FileWarning : item.key === 'stale' ? AlertTriangle : Layers3}
                    label={item.label}
                    count={item.count}
                    meta={item.share ? `${formatPercent(item.share)} of flagged items` : ''}
                    tone={item.tone}
                  />
                ))}
              </div>
            ) : (
              <MobileEmptyState title="No issues flagged" body="This development does not currently have stalled or document-driven pressure points." />
            )}
          </div>

          <div className="mb-5 space-y-3">
            <MobileCard className="px-4 py-4">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#101010]">Current Transactions</h2>
            </MobileCard>
            {activeTransactions.length ? (
              <div className="space-y-3">
                {activeTransactions.map((item) => (
                  <MobileTransactionCard
                    key={item.id}
                    to={item.transactionId ? `/m/transactions/${item.transactionId}` : null}
                    eyebrow={`${item.developmentName} • Unit ${item.unitNumber}`}
                    title={item.buyerName}
                    subtitle={item.attorneyName !== 'Unassigned' ? `Attorney: ${item.attorneyName}` : 'Attorney not assigned yet'}
                    stageLabel={item.stageLabel}
                    financeType={item.financeType}
                    updatedAt={item.updatedAt}
                    progressPercent={item.progressPercent}
                    blocker={item.nextAction}
                  />
                ))}
              </div>
            ) : (
              <MobileEmptyState title="No current transactions" body="Live matters will appear here as soon as units begin moving through the pipeline." />
            )}
          </div>

          <div className="mb-5 space-y-3">
            <MobileCard className="px-4 py-4">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#101010]">Recent Activity</h2>
            </MobileCard>
            <MobileActivityFeed items={recentActivity} emptyText="Recent development movement will appear here once transactions start updating." />
          </div>
        </>
      )}
    </>
  )
}
