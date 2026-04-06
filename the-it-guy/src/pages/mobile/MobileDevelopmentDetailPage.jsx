import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  Building2,
  CheckCircle2,
  FileWarning,
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
  MobileMetricCard,
  MobileSegmentedBar,
  MobileStatusChip,
  MobileTransactionCard,
} from '../../components/mobile/ExecutiveMobileUi'
import { fetchDevelopmentDetail } from '../../lib/api'
import {
  currencyFormatter,
  formatPercent,
  getDevelopmentProgressBuckets,
  getLatestTimestamp,
  integerFormatter,
} from '../../lib/mobileExecutive'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { Link } from 'react-router-dom'
import { ArrowLeft, Clock3 } from 'lucide-react'

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function getRowUpdatedAt(row) {
  return row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
}

function getRowMainStage(row) {
  return String(row?.mainStage || row?.transaction?.current_main_stage || '').trim().toUpperCase()
}

function buildHeroSubtitle(detail, totalUnits) {
  return [
    detail?.profile?.location || detail?.development?.location || detail?.development?.city || null,
    totalUnits ? `${integerFormatter.format(totalUnits)} units` : null,
    detail?.profile?.status || detail?.development?.status || null,
  ]
    .filter(Boolean)
    .join(' • ')
}

function getHealthMeta(totalFlagged) {
  if (totalFlagged >= 3) {
    return { label: 'Needs Attention', accent: 'bg-[#b14a3b]' }
  }
  if (totalFlagged > 0) {
    return { label: 'Monitoring', accent: 'bg-[#b7802d]' }
  }
  return { label: 'Healthy', accent: 'bg-[#2f6a41]' }
}

export default function MobileDevelopmentDetailPage() {
  const { developmentId } = useParams()
  const [state, setState] = useState({
    loading: true,
    error: '',
    detail: null,
  })

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setState((current) => ({ ...current, loading: false }))
      return
    }

    try {
      const detail = await fetchDevelopmentDetail(developmentId)
      setState({
        loading: false,
        error: '',
        detail,
      })
    } catch (error) {
      setState({
        loading: false,
        error: error.message || 'Unable to load development overview.',
        detail: null,
      })
    }
  }, [developmentId])

  useEffect(() => {
    void load()
  }, [load])

  const detail = state.detail
  const rows = useMemo(() => safeArray(detail?.rows), [detail?.rows])
  const stats = detail?.stats || {}
  const totalUnits = Number(stats.totalUnits || rows.length || 0)
  const registeredUnits = Number(stats.registered || 0)
  const activeUnits = Number(stats.soldActive || 0)
  const availableUnits = Number(stats.available || Math.max(totalUnits - activeUnits, 0))
  const progress = useMemo(() => getDevelopmentProgressBuckets(rows), [rows])
  const latestUpdatedAt = useMemo(() => getLatestTimestamp(rows), [rows])
  const heroSubtitle = buildHeroSubtitle(detail, totalUnits)

  const financeMixCounts = useMemo(() => {
    return rows.reduce(
      (accumulator, row) => {
        const financeType = String(row?.transaction?.finance_type || '').trim().toLowerCase()
        if (!row?.transaction) return accumulator
        if (financeType === 'cash') accumulator.cash += 1
        else if (financeType === 'bond') accumulator.bond += 1
        else accumulator.other += 1
        return accumulator
      },
      { cash: 0, bond: 0, other: 0 },
    )
  }, [rows])

  const revenueSecured = useMemo(() => {
    return rows.reduce((sum, row) => {
      const value = Number(row?.transaction?.sales_price ?? row?.unit?.price ?? 0)
      return Number.isFinite(value) ? sum + value : sum
    }, 0)
  }, [rows])

  const staleCount = useMemo(() => {
    const now = Date.now()
    return rows.filter((row) => {
      if (!row?.transaction) return false
      const stage = getRowMainStage(row)
      if (stage === 'REG' || stage === 'AVAIL') return false
      const updatedAt = new Date(getRowUpdatedAt(row) || 0).getTime()
      if (!Number.isFinite(updatedAt)) return false
      return now - updatedAt > 21 * 24 * 60 * 60 * 1000
    }).length
  }, [rows])

  const missingDocsCount = useMemo(() => {
    return rows.filter((row) => Number(row?.documentSummary?.missingCount || 0) > 0).length
  }, [rows])

  const activeTransactions = useMemo(() => {
    return rows
      .filter((row) => row?.transaction && String(row?.stage || '').trim().toLowerCase() !== 'registered')
      .sort((left, right) => new Date(getRowUpdatedAt(right) || 0).getTime() - new Date(getRowUpdatedAt(left) || 0).getTime())
      .slice(0, 8)
      .map((row) => ({
        id: row.transaction.id || row.unit?.id || crypto.randomUUID(),
        transactionId: row.transaction?.id || null,
        developmentName: row.development?.name || detail?.development?.name || 'Development',
        unitNumber: row.unit?.unit_number || '-',
        buyerName: row.buyer?.name || row.transaction?.buyer_name || 'Buyer pending',
        attorneyName: String(row.transaction?.attorney || '').trim() || 'Unassigned',
        stageLabel: row.stage || 'Current Stage',
        financeType: row.transaction?.finance_type || '',
        updatedAt: getRowUpdatedAt(row),
        progressPercent: totalUnits ? Math.min(100, Math.max(0, Math.round((registeredUnits / Math.max(totalUnits, 1)) * 100))) : 0,
        blocker: row.transaction?.next_action || '',
      }))
  }, [detail?.development?.name, registeredUnits, rows, totalUnits])

  const recentActivity = useMemo(() => {
    return rows
      .filter((row) => row?.transaction)
      .sort((left, right) => new Date(getRowUpdatedAt(right) || 0).getTime() - new Date(getRowUpdatedAt(left) || 0).getTime())
      .slice(0, 5)
      .map((row) => ({
        id: row.transaction?.id || row.unit?.id || `${row.unit?.unit_number || 'unit'}-${row.stage || 'stage'}`,
        title: `${detail?.development?.name || 'Development'} • Unit ${row.unit?.unit_number || '-'}`,
        body: row.transaction?.comment || row.transaction?.next_action || row.stage || 'No recent movement summary available.',
        timestamp: getRowUpdatedAt(row),
        meta: row.buyer?.name || row.stage || 'Update',
      }))
  }, [detail?.development?.name, rows])

  const totalFlagged = missingDocsCount + staleCount
  const health = getHealthMeta(totalFlagged)
  const completionPercent = totalUnits ? (progress.completed / totalUnits) * 100 : 0

  const metricCards = [
    {
      key: 'units',
      label: 'Total Units',
      value: integerFormatter.format(totalUnits),
      icon: Building2,
    },
    {
      key: 'live',
      label: 'Active Transactions',
      value: integerFormatter.format(activeTransactions.length),
      icon: ArrowRightLeft,
    },
    {
      key: 'registered',
      label: 'Registered',
      value: integerFormatter.format(registeredUnits),
      icon: CheckCircle2,
    },
    {
      key: 'available',
      label: 'Available',
      value: integerFormatter.format(availableUnits),
      icon: Activity,
    },
    {
      key: 'cash',
      label: 'Cash Buyers',
      value: integerFormatter.format(financeMixCounts.cash),
      icon: Wallet,
    },
    {
      key: 'bond',
      label: 'Bond Buyers',
      value: integerFormatter.format(financeMixCounts.bond),
      icon: Banknote,
    },
  ]

  const attentionTiles = [
    {
      key: 'docs',
      icon: FileWarning,
      label: 'Missing Documents',
      count: missingDocsCount,
      meta: missingDocsCount ? 'Transactions missing required files' : 'No gaps flagged',
      tone: missingDocsCount ? 'warning' : 'positive',
    },
    {
      key: 'stale',
      icon: AlertTriangle,
      label: 'Stale Transactions',
      count: staleCount,
      meta: staleCount ? 'No recent movement in 21+ days' : 'No stale matters',
      tone: staleCount ? 'danger' : 'positive',
    },
  ]

  return (
    <>
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
          <MobileCard className="mb-8 overflow-hidden bg-[linear-gradient(160deg,#111111_0%,#34312e_64%,#7c6956_100%)] text-white shadow-[0_24px_52px_rgba(17,17,17,0.2)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <Link
                  to="/m/developments"
                  className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.06)_100%)] text-white shadow-[0_10px_18px_rgba(17,17,17,0.14)]"
                  aria-label="Go back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <div className="min-w-0">
                  <h1 className="truncate text-[32px] font-semibold tracking-[-0.05em] text-white">
                    {detail?.development?.name || 'Development'}
                  </h1>
                  <div className="mt-3 flex items-center gap-2 text-sm text-[#e0d2c2]">
                    <MapPin className="h-4 w-4 text-[#dcc9b2]" />
                    <span className="truncate">{heroSubtitle || 'Development identity still being completed'}</span>
                  </div>
                </div>
              </div>
              <MobileStatusChip label={detail?.profile?.status || detail?.development?.status || 'Active'} tone="dark" className="!border-white/10 !bg-white/10 !text-white" />
            </div>

            <div className="mt-5 rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.06)_100%)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d7cbbd]">Last Updated</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#fffaf4]">
                    {latestUpdatedAt ? new Date(latestUpdatedAt).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'No recent update'}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#f1e6d8]">
                    {recentActivity[0]?.body || 'No recent movement summary available.'}
                  </p>
                </div>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.06)_100%)] text-[#fffaf4]">
                  <Clock3 className="h-4 w-4" />
                </span>
              </div>
            </div>
          </MobileCard>

          <div className="mb-5 space-y-3 pt-1">
            <MobileCard className="flex items-center justify-between gap-3 bg-[linear-gradient(180deg,#fffdfa_0%,#f8f1e8_100%)]">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a806f]">Health</p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#101010]">{health.label}</h3>
              </div>
              <div className="flex items-center gap-3 rounded-full border border-[#ece3d8] bg-[#faf6ef] px-3 py-2">
                <span className={`h-3 w-3 rounded-full ${health.accent}`} />
                <span className="text-sm font-semibold text-[#262018]">{integerFormatter.format(totalFlagged)} flags</span>
              </div>
            </MobileCard>

            <MobileCard className="bg-[linear-gradient(180deg,#fffdfa_0%,#f7f1e8_100%)]">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a806f]">Portfolio Completion</p>
                  <h3 className="mt-1 text-[34px] font-semibold tracking-[-0.05em] text-[#101010]">{formatPercent(completionPercent)}</h3>
                </div>
                <div className="rounded-[18px] border border-[#ece3d8] bg-[linear-gradient(180deg,#111111_0%,#312a24_100%)] px-3 py-2 text-right text-white shadow-[0_14px_28px_rgba(17,17,17,0.12)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">Revenue Secured</p>
                  <strong className="mt-1 block text-base font-semibold text-white">{currencyFormatter.format(revenueSecured)}</strong>
                </div>
              </div>

              <MobileSegmentedBar
                segments={[
                  { key: 'completed', label: 'Completed', value: progress.completed, className: 'bg-[#111111]', dotClassName: 'bg-[#111111]' },
                  { key: 'inProgress', label: 'In Progress', value: progress.inProgress, className: 'bg-[#8c8c8c]', dotClassName: 'bg-[#8c8c8c]' },
                  { key: 'notStarted', label: 'Not Started', value: progress.notStarted, className: 'bg-[#d8cfbf]', dotClassName: 'bg-[#d8cfbf]' },
                ]}
              />
            </MobileCard>
          </div>

          <MobileCard className="mb-5 bg-[linear-gradient(180deg,#fffdfa_0%,#f8f1e8_100%)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#101010]">Key Metrics</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {metricCards.map((card) => (
                <MobileMetricCard key={card.key} {...card} />
              ))}
            </div>
          </MobileCard>

          <MobileCard className="mb-5 bg-[linear-gradient(180deg,#fffdfa_0%,#f8f1e8_100%)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#101010]">Analytics</h2>
            </div>
            <div className="space-y-3">
              <div className="rounded-[22px] border border-[#ece3d8] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f1e8_100%)] p-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#101010]">Buyer Finance Mix</h3>
                  </div>
                  <span className="rounded-full border border-[#e8ddd0] bg-[#fffdf9] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6f6457]">
                    {integerFormatter.format(financeMixCounts.cash + financeMixCounts.bond + financeMixCounts.other)} deals
                  </span>
                </div>

                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-[#ece5db]">
                  <span className="h-full bg-[#111111]" style={{ width: `${Math.max(((financeMixCounts.cash / Math.max(financeMixCounts.cash + financeMixCounts.bond + financeMixCounts.other, 1)) * 100), financeMixCounts.cash ? 8 : 0)}%` }} />
                  <span className="h-full bg-[#8b8b8b]" style={{ width: `${Math.max(((financeMixCounts.bond / Math.max(financeMixCounts.cash + financeMixCounts.bond + financeMixCounts.other, 1)) * 100), financeMixCounts.bond ? 8 : 0)}%` }} />
                  <span className="h-full bg-[#d6cdbf]" style={{ width: `${Math.max(((financeMixCounts.other / Math.max(financeMixCounts.cash + financeMixCounts.bond + financeMixCounts.other, 1)) * 100), financeMixCounts.other ? 8 : 0)}%` }} />
                </div>
              </div>
            </div>
          </MobileCard>

          <div className="mb-5 space-y-3">
            <MobileCard className="px-4 py-4 bg-[linear-gradient(180deg,#fffdfa_0%,#f8f1e8_100%)]">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#101010]">Needs Attention</h2>
            </MobileCard>
            <div className="grid grid-cols-2 gap-3">
              {attentionTiles.map((item) => (
                <MobileAttentionTile key={item.key} icon={item.icon} label={item.label} count={item.count} meta={item.meta} tone={item.tone} />
              ))}
            </div>
          </div>

          <div className="mb-5 space-y-3">
            <MobileCard className="px-4 py-4 bg-[linear-gradient(180deg,#fffdfa_0%,#f8f1e8_100%)]">
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
                    blocker={item.blocker}
                  />
                ))}
              </div>
            ) : (
              <MobileEmptyState title="No current transactions" body="Live matters will appear here as soon as units begin moving through the pipeline." />
            )}
          </div>

          <div className="mb-5 space-y-3">
            <MobileCard className="px-4 py-4 bg-[linear-gradient(180deg,#fffdfa_0%,#f8f1e8_100%)]">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#101010]">Recent Activity</h2>
            </MobileCard>
            <MobileActivityFeed items={recentActivity} emptyText="Recent development movement will appear here once transactions start updating." />
          </div>
        </>
      )}
    </>
  )
}
