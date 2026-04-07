import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  FileWarning,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  MobileActivityFeed,
  MobileAttentionTile,
  MobileCard,
  MobileEmptyState,
  MobileLastUpdatedCard,
  MobileSection,
  MobileStageTracker,
  MobileStatusChip,
  MobileTopBar,
} from '../../components/mobile/ExecutiveMobileUi'
import { fetchTransactionById } from '../../lib/api'
import {
  buildActivityFeedItems,
  buildExecutiveStageState,
  formatCompactDateTime,
  formatRelativeTimestamp,
  getProgressPercentFromMainStage,
  getStageLabel,
} from '../../lib/mobileExecutive'
import { isSupabaseConfigured } from '../../lib/supabaseClient'

function normalizeText(value, fallback) {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

export default function MobileTransactionDetailPage() {
  const { transactionId } = useParams()
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
      const detail = await fetchTransactionById(transactionId)
      setState({
        loading: false,
        error: '',
        detail,
      })
    } catch (error) {
      setState({
        loading: false,
        error: error.message || 'Unable to load transaction.',
        detail: null,
      })
    }
  }, [transactionId])

  useEffect(() => {
    void load()
  }, [load])

  const detail = state.detail
  const transaction = detail?.transaction || null
  const mainStage = detail?.mainStage || transaction?.current_main_stage || 'AVAIL'
  const stageTracker = useMemo(() => buildExecutiveStageState(mainStage), [mainStage])
  const progressPercent = getProgressPercentFromMainStage(mainStage)
  const currentStageLabel = getStageLabel(mainStage, detail?.stage || transaction?.stage)
  const latestUpdateText =
    detail?.latestDiscussion?.commentBody ||
    detail?.latestDiscussion?.commentText ||
    transaction?.comment ||
    transaction?.next_action ||
    'No latest movement summary available.'

  const blockers = useMemo(() => {
    if (!transaction) return []

    const items = []
    if (detail?.documentSummary?.missingCount > 0) {
      items.push({
        key: 'documents',
        label: 'Missing Documents',
        count: detail.documentSummary.missingCount,
        meta: `${detail.documentSummary.uploadedCount || 0}/${detail.documentSummary.totalRequired || 0} uploaded`,
        icon: FileWarning,
        tone: 'warning',
      })
    }

    if (transaction?.risk_status && ['Delayed', 'Blocked'].includes(String(transaction.risk_status))) {
      items.push({
        key: 'risk',
        label: transaction.risk_status,
        count: 1,
        meta: transaction.next_action || 'Needs review',
        icon: AlertTriangle,
        tone: 'danger',
      })
    }

    if (transaction?.next_action) {
      items.push({
        key: 'next',
        label: 'Next Action',
        count: 1,
        meta: transaction.next_action,
        icon: ArrowRightLeft,
        tone: 'default',
      })
    }

    if (String(transaction?.finance_type || '').trim()) {
      items.push({
        key: 'finance',
        label: 'Finance',
        count: 1,
        meta: normalizeText(transaction.finance_type, 'Cash'),
        icon: Banknote,
        tone: 'positive',
      })
    }

    return items.slice(0, 4)
  }, [detail?.documentSummary?.missingCount, detail?.documentSummary?.totalRequired, detail?.documentSummary?.uploadedCount, transaction])

  const activityItems = useMemo(
    () =>
      buildActivityFeedItems({
        comments: detail?.transactionDiscussion || [],
        events: detail?.transactionEvents || [],
      }).slice(0, 6),
    [detail?.transactionDiscussion, detail?.transactionEvents],
  )

  return (
    <>
      <MobileTopBar
        title={detail?.unit?.unit_number ? `Unit ${detail.unit.unit_number}` : `Transaction ${String(transactionId || '').slice(0, 8).toUpperCase()}`}
        subtitle="Transaction Detail"
        backTo={detail?.development?.id ? `/m/developments/${detail.development.id}` : '/m/developments'}
      />

      {state.loading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-[164px] animate-pulse rounded-[28px] border border-[#e3e8f1] bg-white" />
          ))}
        </div>
      ) : state.error ? (
        <MobileEmptyState title="Unable to load transaction" body={state.error} />
      ) : !detail || !transaction ? (
        <MobileEmptyState title="Transaction not found" body="This transaction is not available in the current workspace." />
      ) : (
        <>
          <MobileCard className="mb-5 bg-[linear-gradient(145deg,#101115_0%,#1a1c21_58%,#4a3a2a_100%)] text-white shadow-[0_24px_52px_rgba(15,15,15,0.28)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#e3d1bc]">Transaction Identity</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <MobileStatusChip label={currentStageLabel} tone="dark" className="!border-white/10 !bg-white/10 !text-white" />
              <MobileStatusChip
                label={normalizeText(transaction?.finance_type, 'Cash')}
                tone="dark"
                className="!border-white/10 !bg-white/10 !text-white"
              />
            </div>

            <h2 className="mt-4 text-[29px] font-semibold tracking-[-0.04em] text-white">
              {detail?.buyer?.name || transaction?.transaction_reference || 'Transaction'}
            </h2>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-white/84">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/56">Reference</p>
                <p className="mt-1">{transaction?.transaction_reference || `TRX-${String(transaction.id || '').slice(0, 8).toUpperCase()}`}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/56">Progress</p>
                <p className="mt-1">{progressPercent}%</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/56">Development</p>
                <p className="mt-1">{detail?.development?.name || 'Standalone matter'}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/56">Last Updated</p>
                <p className="mt-1">{formatRelativeTimestamp(detail?.updatedAt || transaction?.updated_at)}</p>
              </div>
            </div>
          </MobileCard>

          <MobileLastUpdatedCard
            className="mb-5"
            timestamp={detail?.updatedAt || transaction?.updated_at || transaction?.created_at}
            summary={latestUpdateText}
            extra={detail?.latestDiscussion ? `Latest comment at ${formatCompactDateTime(detail.latestDiscussion.createdAt || detail.latestDiscussion.created_at)}` : ''}
          />

          <MobileStageTracker
            className="mb-5"
            stages={stageTracker}
            progressPercent={progressPercent}
            statusLabel={currentStageLabel}
            routeLabel="Transaction Route"
            supportingText="Main transaction stage is tracked here for executive reporting."
            metaRight={formatRelativeTimestamp(detail?.updatedAt || transaction?.updated_at)}
          />

          <MobileCard className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d3deec]">Risk Snapshot</p>
            <h3 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-white">Blockers & Outstanding</h3>
            <div className="mt-4">
            {blockers.length ? (
              <div className="grid grid-cols-2 gap-3">
                {blockers.map((item) => (
                  <MobileAttentionTile
                    key={item.key}
                    icon={item.icon}
                    label={item.label}
                    count={item.count}
                    meta={item.meta}
                    tone={item.tone}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[20px] border border-white/12 bg-white/[0.08] px-4 py-5 text-sm leading-6 text-[#d3deec]">
                No blockers currently flagged. This transaction does not show missing documents or stalled workflow flags.
              </div>
            )}
            </div>
          </MobileCard>

          <MobileSection title="Recent Activity" eyebrow="Comments & Events">
            <MobileActivityFeed items={activityItems} emptyText="Comments and system events will appear here once the matter begins moving." />
          </MobileSection>
        </>
      )}
    </>
  )
}
