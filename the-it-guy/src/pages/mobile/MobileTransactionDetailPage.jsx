import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  FileWarning,
  FolderCheck,
  UserSquare2,
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
  integerFormatter,
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

  const supportCards = useMemo(() => {
    const discussionCount = detail?.transactionDiscussion?.length || 0
    return [
      {
        key: 'attorney',
        label: 'Attorney',
        value: normalizeText(transaction?.attorney, 'Unassigned'),
        meta: 'Legal lead',
        icon: UserSquare2,
      },
      {
        key: 'bond',
        label: 'Bond Originator',
        value: normalizeText(transaction?.bond_originator, 'Not assigned'),
        meta: 'Finance lead',
        icon: Banknote,
      },
      {
        key: 'documents',
        label: 'Documents',
        value: `${integerFormatter.format(detail?.documents?.length || 0)}`,
        meta: 'Files linked',
        icon: FolderCheck,
      },
      {
        key: 'activity',
        label: 'Comments',
        value: `${integerFormatter.format(discussionCount)}`,
        meta: 'Recent updates',
        icon: ArrowRightLeft,
      },
    ]
  }, [detail?.documents?.length, detail?.transactionDiscussion?.length, transaction?.attorney, transaction?.bond_originator])

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
          <MobileSection title={detail?.buyer?.name || 'Buyer pending'} eyebrow="Transaction Identity">
            <MobileCard className="bg-[linear-gradient(145deg,#101828_0%,#17283c_100%)] text-white shadow-[0_22px_48px_rgba(15,23,42,0.18)]">
              <div className="flex flex-wrap items-center gap-2">
                <MobileStatusChip label={getStageLabel(mainStage, detail?.stage || transaction?.stage)} tone="dark" className="!border-white/10 !bg-white/10 !text-white" />
                <MobileStatusChip
                  label={normalizeText(transaction?.finance_type, 'Cash')}
                  tone="dark"
                  className="!border-white/10 !bg-white/10 !text-white"
                />
              </div>

              <h2 className="mt-4 text-[28px] font-semibold tracking-[-0.04em]">
                {detail?.buyer?.name || transaction?.transaction_reference || 'Transaction'}
              </h2>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-white/74">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Reference</p>
                  <p className="mt-1">{transaction?.transaction_reference || `TRX-${String(transaction.id || '').slice(0, 8).toUpperCase()}`}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Progress</p>
                  <p className="mt-1">{getProgressPercentFromMainStage(mainStage)}%</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Development</p>
                  <p className="mt-1">{detail?.development?.name || 'Standalone matter'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Last Updated</p>
                  <p className="mt-1">{formatRelativeTimestamp(detail?.updatedAt || transaction?.updated_at)}</p>
                </div>
              </div>
            </MobileCard>
          </MobileSection>

          <MobileLastUpdatedCard
            timestamp={detail?.updatedAt || transaction?.updated_at || transaction?.created_at}
            summary={latestUpdateText}
            extra={detail?.latestDiscussion ? `Latest comment at ${formatCompactDateTime(detail.latestDiscussion.createdAt || detail.latestDiscussion.created_at)}` : ''}
          />

          <MobileSection title="Progress Tracker" eyebrow="Executive View">
            <MobileStageTracker stages={stageTracker} />
          </MobileSection>

          <MobileSection title="Outstanding" eyebrow="Blockers">
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
              <MobileEmptyState title="No blockers flagged" body="This transaction does not currently show missing documents or stalled workflow flags." />
            )}
          </MobileSection>

          <MobileSection title="Supporting Info" eyebrow="Assigned">
            <div className="grid grid-cols-2 gap-3">
              {supportCards.map((card) => (
                <MobileMetricCard key={card.key} {...card} />
              ))}
            </div>
          </MobileSection>

          <MobileSection title="Recent Activity" eyebrow="Comments & Events">
            <MobileActivityFeed items={activityItems} emptyText="Comments and system events will appear here once the matter begins moving." />
          </MobileSection>
        </>
      )}
    </>
  )
}
