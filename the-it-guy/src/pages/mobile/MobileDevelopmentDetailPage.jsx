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
      <MobileTopBar title={detail?.development?.name || 'Development'} subtitle="Executive Layer" backTo="/m/developments" />

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
          <MobileSection title={detail.development.name} eyebrow="Development Detail">
            <MobileCard className="bg-[linear-gradient(145deg,#101828_0%,#17283c_100%)] text-white shadow-[0_22px_48px_rgba(15,23,42,0.18)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/58">Bridge Executive</p>
              <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.04em]">{detail.development.name}</h2>
              <div className="mt-3 flex items-center gap-2 text-sm text-white/70">
                <MapPin className="h-4 w-4" />
                <span>{heroSubtitle || 'Development identity still being completed'}</span>
              </div>
            </MobileCard>
          </MobileSection>

          <MobileLastUpdatedCard
            timestamp={latestUpdatedAt}
            summary={latestMovementSummary}
            extra={recentActivity.length ? `${recentActivity.length} recent movements available` : ''}
          />

          <MobileSection title="Overall Progress" eyebrow="Health">
            <MobileCard>
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a9ab2]">Portfolio Completion</p>
                  <h3 className="mt-1 text-[32px] font-semibold tracking-[-0.05em] text-[#101828]">
                    {formatPercent(totalUnits ? (progress.completed / totalUnits) * 100 : 0)}
                  </h3>
                </div>
                <div className="rounded-[18px] border border-[#e8edf5] bg-[#fbfcfe] px-3 py-2 text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a9ab2]">Revenue Secured</p>
                  <strong className="mt-1 block text-base font-semibold text-[#101828]">
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
                    className: 'bg-[#101828]',
                    dotClassName: 'bg-[#101828]',
                  },
                  {
                    key: 'inProgress',
                    label: 'In Progress',
                    value: progress.inProgress,
                    className: 'bg-[#6f86a0]',
                    dotClassName: 'bg-[#6f86a0]',
                  },
                  {
                    key: 'notStarted',
                    label: 'Not Started',
                    value: progress.notStarted,
                    className: 'bg-[#d8e0ea]',
                    dotClassName: 'bg-[#d8e0ea]',
                  },
                ]}
              />
            </MobileCard>
          </MobileSection>

          <MobileSection title="Key Metrics" eyebrow="Kpis">
            <div className="grid grid-cols-2 gap-3">
              {metricCards.map((card) => (
                <MobileMetricCard key={card.key} {...card} />
              ))}
            </div>
          </MobileSection>

          <MobileSection title="Visual Analytics" eyebrow="Portfolio Mix">
            <div className="space-y-3">
              <MobileCard>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a9ab2]">Cash vs Bond</p>
                    <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#101828]">Buyer Finance Mix</h3>
                  </div>
                  <span className="rounded-full border border-[#e8edf5] bg-[#fbfcfe] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6e8198]">
                    {integerFormatter.format((financeMixCounts.cash || 0) + (financeMixCounts.bond || 0) + (financeMixCounts.combination || 0))} deals
                  </span>
                </div>

                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-[#eef2f7]">
                  <span
                    className="h-full bg-[#101828]"
                    style={{ width: `${Math.max((((financeMixCounts.cash || 0) / Math.max((financeMixCounts.cash || 0) + (financeMixCounts.bond || 0) + (financeMixCounts.combination || 0), 1)) * 100), financeMixCounts.cash ? 8 : 0)}%` }}
                  />
                  <span
                    className="h-full bg-[#6f86a0]"
                    style={{ width: `${Math.max((((financeMixCounts.bond || 0) / Math.max((financeMixCounts.cash || 0) + (financeMixCounts.bond || 0) + (financeMixCounts.combination || 0), 1)) * 100), financeMixCounts.bond ? 8 : 0)}%` }}
                  />
                  <span
                    className="h-full bg-[#c7d2de]"
                    style={{ width: `${Math.max((((financeMixCounts.combination || 0) / Math.max((financeMixCounts.cash || 0) + (financeMixCounts.bond || 0) + (financeMixCounts.combination || 0), 1)) * 100), financeMixCounts.combination ? 8 : 0)}%` }}
                  />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { key: 'cash', label: 'Cash', value: financeMixCounts.cash || 0 },
                    { key: 'bond', label: 'Bond', value: financeMixCounts.bond || 0 },
                    { key: 'combination', label: 'Hybrid', value: financeMixCounts.combination || 0 },
                  ].map((item) => (
                    <div key={item.key} className="rounded-[18px] border border-[#edf2f7] bg-[#fbfcfe] px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8799af]">{item.label}</p>
                      <strong className="mt-1 block text-lg font-semibold text-[#101828]">{integerFormatter.format(item.value)}</strong>
                    </div>
                  ))}
                </div>
              </MobileCard>

              <MobileCard>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a9ab2]">Stage Pressure</p>
                    <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#101828]">Current Distribution</h3>
                  </div>
                  <span className="rounded-full border border-[#e8edf5] bg-[#fbfcfe] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6e8198]">
                    {integerFormatter.format(totalUnits || 0)} tracked
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {stageDistribution.map((stage) => (
                    <div key={stage.key} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-[#22374d]">{stage.label}</span>
                        <span className="text-[#7a8ca5]">{integerFormatter.format(stage.count)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#eef2f7]">
                        <span className="block h-full rounded-full bg-[linear-gradient(90deg,#132132_0%,#5e7d9b_100%)]" style={{ width: `${Math.max(stage.share, stage.count ? 8 : 0)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </MobileCard>
            </div>
          </MobileSection>

          <MobileSection title="Needs Attention" eyebrow="Priority">
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
          </MobileSection>

          <MobileSection title="Current Transactions" eyebrow="Live Pipeline">
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
          </MobileSection>

          <MobileSection title="Recent Activity" eyebrow="Movement">
            <MobileActivityFeed items={recentActivity} emptyText="Recent development movement will appear here once transactions start updating." />
          </MobileSection>
        </>
      )}
    </>
  )
}
