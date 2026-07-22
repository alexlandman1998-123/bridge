import ProgressTimeline from './ProgressTimeline'
import {
  TRANSACTION_LIFECYCLE_STAGE_LABELS,
  TRANSACTION_LIFECYCLE_STAGE_ORDER,
  buildTransactionLifecycleSummary,
} from '../core/transactions/transactionLifecycle'

function buildBlockersByStage(summary) {
  if (!summary?.stages?.length) return {}
  return summary.stages.reduce((accumulator, stage) => {
    if (stage.state === 'blocked') accumulator[stage.key] = ['Blocked']
    return accumulator
  }, {})
}

function TransactionLifecycleProgress({
  summary = null,
  transaction = null,
  mainStage = '',
  subprocesses = [],
  compact = false,
  premium = false,
  framed = false,
  showHeader = true,
  showSubStatus = true,
  title = 'Current Stage Progress',
  helperText = '',
  onStageClick = null,
  isStageSelectable = null,
}) {
  const lifecycleSummary =
    summary ||
    buildTransactionLifecycleSummary({
      transaction,
      mainStage,
      subprocesses,
    })
  const stageOrder = lifecycleSummary.stageOrder?.length
    ? lifecycleSummary.stageOrder
    : lifecycleSummary.stages?.length
      ? lifecycleSummary.stages.map((stage) => stage.key)
      : TRANSACTION_LIFECYCLE_STAGE_ORDER
  const stageLabelMap = lifecycleSummary.stageLabels || lifecycleSummary.stages?.reduce((labels, stage) => {
    labels[stage.key] = stage.label
    return labels
  }, {}) || TRANSACTION_LIFECYCLE_STAGE_LABELS
  const stageStateMap = lifecycleSummary.stages?.reduce((states, stage) => {
    states[stage.key] = stage.state
    return states
  }, {}) || null
  const stageStatusMap = lifecycleSummary.stages?.reduce((statuses, stage) => {
    statuses[stage.key] = stage.statusLabel
    return statuses
  }, {}) || null
  const currentStageLabel = stageLabelMap[lifecycleSummary.currentStage] || 'Instruction'
  const currentIndex = Math.max(stageOrder.indexOf(lifecycleSummary.currentStage), 0)
  const progressPercent =
    Number.isFinite(Number(lifecycleSummary?.progressPercent))
      ? Number(lifecycleSummary.progressPercent)
      : stageOrder.length > 1
        ? Math.round((currentIndex / (stageOrder.length - 1)) * 100)
        : 0
  const blockersByStage = lifecycleSummary?.blockersByStage || buildBlockersByStage(lifecycleSummary)
  const fallbackHelper = lifecycleSummary.subStatus?.label
    ? `Sub-status: ${lifecycleSummary.subStatus.label}`
    : `Current stage: ${currentStageLabel}`

  const content = (
    <div className="space-y-3">
      {showHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8496ab]">{title}</span>
            <h3 className="mt-1 text-[1.04rem] font-semibold tracking-[-0.025em] text-[#142132]">{currentStageLabel}</h3>
            {showSubStatus && lifecycleSummary.subStatus?.label ? (
              <p className="mt-1 text-sm text-[#6b7d93]">Sub-status: <span className="font-semibold text-[#22384c]">{lifecycleSummary.subStatus.label}</span></p>
            ) : null}
          </div>
          <span className="inline-flex items-center rounded-full border border-[#d9e5f2] bg-[#eef5fb] px-3 py-1 text-xs font-semibold text-[#35546c]">
            {currentStageLabel}
          </span>
        </div>
      ) : null}
      <ProgressTimeline
        currentStage={lifecycleSummary.currentStage}
        stages={stageOrder}
        stageLabelMap={stageLabelMap}
        framed={framed}
        compact={compact}
        premium={premium}
        showCurrentSummary={!showHeader}
        progressPercent={progressPercent}
        blockersByStage={blockersByStage}
        stageStateMap={stageStateMap}
        stageStatusMap={stageStatusMap}
        helperText={helperText || fallbackHelper}
        lastUpdatedLabel={lifecycleSummary.lastUpdatedAt ? `Updated ${new Date(lifecycleSummary.lastUpdatedAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}` : ''}
        onStageClick={onStageClick}
        isStageSelectable={isStageSelectable}
      />
    </div>
  )

  if (!framed) return content

  return (
    <section className="rounded-[22px] border border-[#dfe8f2] bg-white px-4 py-4 shadow-[0_12px_26px_rgba(15,23,42,0.04)] md:px-5">
      {content}
    </section>
  )
}

export default TransactionLifecycleProgress
