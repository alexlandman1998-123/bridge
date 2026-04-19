import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { STAGES, normalizeStageLabel } from '../lib/stages'

function resolveCurrentIndex(list, currentStage) {
  const normalizedList = list.map((item) => normalizeStageLabel(item))
  const target = normalizeStageLabel(currentStage)
  const index = normalizedList.indexOf(target)
  return index >= 0 ? index : 0
}

function resolveProgressTone(progressPercent) {
  if (typeof progressPercent !== 'number' || Number.isNaN(progressPercent)) {
    return { from: '#4e667f', to: '#35546c' }
  }

  if (progressPercent < 30) {
    return { from: '#7d92a8', to: '#5c748d' }
  }
  if (progressPercent < 60) {
    return { from: '#4f82b7', to: '#376898' }
  }
  if (progressPercent < 80) {
    return { from: '#2f8c97', to: '#267681' }
  }

  return { from: '#2f8a64', to: '#23724f' }
}

function resolveNodePosition(index, stageCount) {
  if (stageCount <= 1) {
    return 50
  }
  return (index / (stageCount - 1)) * 100
}

function ProgressTimeline({
  currentStage,
  stage,
  stages = STAGES,
  compact = false,
  premium = false,
  showCurrentSummary = null,
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
  const currentStageLabel = stageLabelMap?.[safeStages[currentIndex]] || safeStages[currentIndex]
  const normalizedProgress =
    typeof progressPercent === 'number' && Number.isFinite(progressPercent)
      ? Math.max(0, Math.min(100, Math.round(progressPercent)))
      : null
  const progressTone = resolveProgressTone(normalizedProgress)
  const shouldShowCurrentSummary = typeof showCurrentSummary === 'boolean' ? showCurrentSummary : !compact
  const trackHeightClass = premium ? (compact ? 'h-3' : 'h-3.5') : 'h-2.5'
  const progressBarHeightClass = premium ? 'h-3' : 'h-2.5'
  const progressPanelClass = premium
    ? 'mt-4 rounded-[14px] bg-white/80 px-3 py-3'
    : 'mt-5 rounded-[16px] border border-[#dde6ef] bg-[linear-gradient(180deg,#ffffff_0%,#f9fbfd_100%)] p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]'
  const [animatedStepperFill, setAnimatedStepperFill] = useState(0)
  const [animatedProgress, setAnimatedProgress] = useState(0)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAnimatedStepperFill(stepperFillPercent)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [stepperFillPercent])

  useEffect(() => {
    if (normalizedProgress === null) {
      setAnimatedProgress(0)
      return undefined
    }

    const frame = window.requestAnimationFrame(() => {
      setAnimatedProgress(normalizedProgress)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [normalizedProgress])

  const content = (
    <div className="relative">
      {shouldShowCurrentSummary ? (
        <p className="mb-3 text-sm text-[#5f7288]">
          You are currently in <strong className="font-semibold text-[#142132]">{currentStageLabel}</strong>
        </p>
      ) : null}

      <div className={compact ? 'px-3' : 'px-4'}>
        <div className={compact ? 'relative h-8' : 'relative h-10'}>
          <span
            aria-hidden="true"
            className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-full bg-[#e6ecf2] ${trackHeightClass}`}
          />
          <span
            aria-hidden="true"
            className={`absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,#2f4356_0%,#1f2f3f_100%)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${trackHeightClass}`}
            style={{ width: `${animatedStepperFill}%` }}
          />

          {safeStages.map((item, index) => {
            const stepState = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'future'
            const isComplete = stepState === 'complete'
            const isCurrent = stepState === 'current'
            const blockers = Array.isArray(blockersByStage?.[item]) ? blockersByStage[item].filter(Boolean) : []
            const hasBlockers = blockers.length > 0
            const canSelect = isInteractive
              ? typeof isStageSelectable === 'function'
                ? Boolean(isStageSelectable(item, index))
                : true
              : false
            const position = resolveNodePosition(index, safeStages.length)

            const nodeClassName = isComplete
              ? premium
                ? 'border-[#1f2f3f] bg-[#1f2f3f] text-white shadow-[0_8px_18px_rgba(31,47,63,0.24)]'
                : 'border-[#1f2f3f] bg-[#1f2f3f] text-white shadow-[0_4px_10px_rgba(31,47,63,0.2)]'
              : isCurrent
                ? premium
                  ? 'border-[2px] border-[#1f2f3f] bg-white text-[#1f2f3f] ring-[4px] ring-[rgba(31,47,63,0.16)] shadow-[0_10px_22px_rgba(31,47,63,0.18)]'
                  : 'border-[2px] border-[#1f2f3f] bg-white text-[#1f2f3f] ring-[3px] ring-[rgba(31,47,63,0.12)] shadow-[0_4px_12px_rgba(31,47,63,0.15)]'
                : 'border border-[#cbd5df] bg-[#f8fafc] text-[#9aa8b8]'

            const nodeSizeClass = compact
              ? isCurrent
                ? premium
                  ? 'h-7 w-7'
                  : 'h-6 w-6'
                : premium
                  ? 'h-6 w-6'
                  : 'h-5 w-5'
              : isCurrent
                ? premium
                  ? 'h-9 w-9'
                  : 'h-8 w-8'
                : premium
                  ? 'h-8 w-8'
                  : 'h-7 w-7'

            const nodeBody = (
              <span
                className={[
                  'relative inline-flex items-center justify-center rounded-full transition duration-200 ease-out',
                  nodeSizeClass,
                  nodeClassName,
                ].join(' ')}
              >
                {isComplete ? (
                  <Check size={compact ? 12 : 14} strokeWidth={2.5} />
                ) : (
                  <span className={[compact ? 'h-1.5 w-1.5' : 'h-2 w-2', 'rounded-full', isCurrent ? 'bg-[#1f2f3f]' : 'bg-transparent'].join(' ')} />
                )}
                {hasBlockers ? (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#b4535a] ring-1 ring-white"
                    title={blockers.join(' • ')}
                  />
                ) : null}
              </span>
            )

            return isInteractive ? (
              <button
                key={`${item}-${index}`}
                type="button"
                className={[
                  'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition',
                  canSelect ? 'cursor-pointer' : 'cursor-not-allowed opacity-70',
                ].join(' ')}
                style={{ left: `${position}%` }}
                onClick={() => {
                  if (canSelect) {
                    onStageClick(item, index)
                  }
                }}
                disabled={!canSelect}
                title={hasBlockers ? blockers.join(' • ') : ''}
              >
                {nodeBody}
              </button>
            ) : (
              <div
                key={`${item}-${index}`}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${position}%` }}
                title={hasBlockers ? blockers.join(' • ') : ''}
              >
                {nodeBody}
              </div>
            )
          })}
        </div>

        <ol
          className="mt-3 grid gap-2"
          style={{ gridTemplateColumns: `repeat(${safeStages.length}, minmax(0, 1fr))` }}
        >
          {safeStages.map((item, index) => {
            const stepState = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'future'
            const isCurrent = stepState === 'current'
            const isComplete = stepState === 'complete'
            const label = stageLabelMap?.[item] || item
            const canSelect = isInteractive
              ? typeof isStageSelectable === 'function'
                ? Boolean(isStageSelectable(item, index))
                : true
              : false
            const labelClassName = isCurrent
              ? 'text-[#142132] font-semibold'
              : isComplete
                ? 'text-[#334155] font-medium'
                : 'text-[#8ba0b8] font-medium'

            return (
              <li key={`${item}-label-${index}`} className="min-w-0 text-center">
                {isInteractive ? (
                  <button
                    type="button"
                    className={[
                      'w-full break-words text-center transition',
                      compact ? (premium ? 'text-[0.7rem] leading-4' : 'text-[0.66rem] leading-4') : premium ? 'text-[0.8rem] leading-5' : 'text-[0.76rem] leading-5',
                      labelClassName,
                      canSelect ? 'cursor-pointer' : 'cursor-not-allowed opacity-70',
                    ].join(' ')}
                    onClick={() => {
                      if (canSelect) {
                        onStageClick(item, index)
                      }
                    }}
                    disabled={!canSelect}
                  >
                    {label}
                  </button>
                ) : (
                  <span
                    className={[
                      'block break-words text-center',
                      compact ? (premium ? 'text-[0.7rem] leading-4' : 'text-[0.66rem] leading-4') : premium ? 'text-[0.8rem] leading-5' : 'text-[0.76rem] leading-5',
                      labelClassName,
                    ].join(' ')}
                  >
                    {label}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>

      {normalizedProgress !== null ? (
        <div className={progressPanelClass}>
          <div className="flex items-end justify-between gap-3">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[#63758a]">Progress</span>
            <span className="text-[1.05rem] font-semibold leading-none text-[#142132]">{normalizedProgress}%</span>
          </div>
          <div className={`mt-2.5 overflow-hidden rounded-full bg-[#e6ecf2] ${progressBarHeightClass}`}>
            <span
              className="block h-full rounded-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                width: `${animatedProgress}%`,
                backgroundImage: `linear-gradient(90deg, ${progressTone.from} 0%, ${progressTone.to} 100%)`,
              }}
            />
          </div>
          {helperText || lastUpdatedLabel ? (
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[0.76rem] text-[#6b7280]">
              <span>{helperText || 'Progress is calculated from completed workflow tasks.'}</span>
              {lastUpdatedLabel ? <span className="font-semibold text-[#4b5563]">{lastUpdatedLabel}</span> : null}
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
