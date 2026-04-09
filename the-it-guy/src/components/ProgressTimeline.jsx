import { Check } from 'lucide-react'
import { STAGES, normalizeStageLabel } from '../lib/stages'

function resolveCurrentIndex(list, currentStage) {
  const normalizedList = list.map((item) => normalizeStageLabel(item))
  const target = normalizeStageLabel(currentStage)
  const index = normalizedList.indexOf(target)
  return index >= 0 ? index : 0
}

function ProgressTimeline({
  currentStage,
  stage,
  stages = STAGES,
  compact = false,
  stageLabelMap = null,
  framed = true,
  onStageClick = null,
  isStageSelectable = null,
  progressPercent = null,
  blockersByStage = null,
  helperText = '',
  lastUpdatedLabel = '',
}) {
  const safeStages = Array.isArray(stages) && stages.length ? stages : STAGES
  const resolvedStage = currentStage ?? stage ?? safeStages[0] ?? 'Available'
  const currentIndex = resolveCurrentIndex(safeStages, resolvedStage)
  const totalConnectors = Math.max(safeStages.length - 1, 1)
  const stepperFillPercent = safeStages.length > 1 ? (currentIndex / totalConnectors) * 100 : 100
  const isInteractive = typeof onStageClick === 'function'
  const normalizedProgress =
    typeof progressPercent === 'number' && Number.isFinite(progressPercent)
      ? Math.max(0, Math.min(100, Math.round(progressPercent)))
      : null

  const content = (
    <div className="relative">
      <span
        aria-hidden="true"
        className="absolute left-[22px] right-[22px] top-[18px] hidden h-[2px] rounded-full bg-[#e5e7eb] md:block"
      />
      <span
        aria-hidden="true"
        className="absolute left-[22px] top-[18px] hidden h-[2px] rounded-full bg-[#141414] transition-all duration-300 md:block"
        style={{ width: `calc((100% - 44px) * ${stepperFillPercent / 100})` }}
      />

      <ol className={['relative z-[1] grid min-w-0 items-start', compact ? 'grid-cols-3 gap-3 md:grid-cols-7' : 'gap-4 md:grid-cols-7'].join(' ')}>
        {safeStages.map((item, index) => {
          const stepState = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'future'
          const isComplete = stepState === 'complete'
          const isCurrent = stepState === 'current'
          const label = stageLabelMap?.[item] || item
          const blockers = Array.isArray(blockersByStage?.[item]) ? blockersByStage[item].filter(Boolean) : []
          const hasBlockers = blockers.length > 0
          const canSelect = isInteractive
            ? typeof isStageSelectable === 'function'
              ? Boolean(isStageSelectable(item, index))
              : true
            : false

          const nodeClassName = isComplete
            ? 'border-[#141414] bg-[#141414] text-white'
            : isCurrent
              ? 'border-[2px] border-[#141414] bg-white text-[#141414]'
              : 'border border-[#d1d5db] bg-transparent text-[#9ca3af]'

          const labelClassName = isCurrent || isComplete ? 'text-[#141414]' : 'text-[#6b7280]'

          const node = (
            <span
              className={[
                'relative inline-flex items-center justify-center rounded-full transition duration-150 ease-out',
                compact ? 'h-9 w-9' : 'h-10 w-10',
                nodeClassName,
              ].join(' ')}
            >
              {isComplete ? (
                <Check size={compact ? 15 : 16} strokeWidth={2.4} />
              ) : (
                <span className={[compact ? 'h-2 w-2' : 'h-2.5 w-2.5', 'rounded-full', isCurrent ? 'bg-[#141414]' : 'bg-transparent'].join(' ')} />
              )}
              {hasBlockers ? (
                <span
                  className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#b42318] ring-2 ring-white"
                  title={blockers.join(' • ')}
                />
              ) : null}
            </span>
          )

          return (
            <li key={`${item}-${index}`} className="min-w-0">
              {isInteractive ? (
                <button
                  type="button"
                  className={[
                    'flex w-full flex-col items-center text-center',
                    compact ? 'gap-2' : 'gap-2.5',
                    canSelect ? 'cursor-pointer' : 'cursor-not-allowed opacity-70',
                  ].join(' ')}
                  onClick={() => {
                    if (canSelect) {
                      onStageClick(item, index)
                    }
                  }}
                  disabled={!canSelect}
                  title={hasBlockers ? blockers.join(' • ') : ''}
                >
                  {node}
                  <span className={['block break-words font-semibold', compact ? 'text-[0.72rem] leading-5' : 'text-[0.8rem] leading-5', labelClassName].join(' ')}>
                    {label}
                  </span>
                </button>
              ) : (
                <div className={['flex flex-col items-center text-center', compact ? 'gap-2' : 'gap-2.5'].join(' ')}>
                  {node}
                  <span className={['block break-words font-semibold', compact ? 'text-[0.72rem] leading-5' : 'text-[0.8rem] leading-5', labelClassName].join(' ')}>
                    {label}
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {normalizedProgress !== null ? (
        <div className="mt-5 rounded-[14px] border border-[#eceff3] bg-[#fafbfc] p-3.5">
          <div className="flex items-center justify-between text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#4b5563]">
            <span>Progress</span>
            <span>{normalizedProgress}%</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-[#e5e7eb]">
            <span
              className="block h-full rounded-full bg-[#141414] transition-all duration-300"
              style={{ width: `${normalizedProgress}%` }}
            />
          </div>
          {helperText || lastUpdatedLabel ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.78rem] text-[#6b7280]">
              <span>{helperText || 'Progress is calculated from completed workflow tasks.'}</span>
              {lastUpdatedLabel ? <span className="font-medium text-[#4b5563]">{lastUpdatedLabel}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  if (!framed) {
    return <div aria-label={`Progress timeline. Current stage: ${resolvedStage}`}>{content}</div>
  }

  return (
    <div className={[compact ? 'rounded-[18px] border border-[#eceff3] bg-white px-3 py-3' : 'rounded-[20px] border border-[#eceff3] bg-white px-4 py-5'].join(' ')} aria-label={`Progress timeline. Current stage: ${resolvedStage}`}>
      {content}
    </div>
  )
}

export default ProgressTimeline

