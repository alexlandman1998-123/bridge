import { Check } from 'lucide-react'
import { STAGES, normalizeStageLabel } from '../lib/stages'

function resolveCurrentIndex(list, currentStage) {
  const normalizedList = list.map((item) => normalizeStageLabel(item))
  const target = normalizeStageLabel(currentStage)
  const index = normalizedList.indexOf(target)
  return index >= 0 ? index : 0
}

function ProgressTimeline({ currentStage, stage, stages = STAGES, compact = false, stageLabelMap = null, framed = true, tone = 'cool' }) {
  const safeStages = Array.isArray(stages) && stages.length ? stages : STAGES
  const resolvedStage = currentStage ?? stage ?? safeStages[0] ?? 'Available'
  const currentIndex = resolveCurrentIndex(safeStages, resolvedStage)
  const isWarmTone = tone === 'warm'

  const content = (
    <ol className={['grid min-w-0 items-start', compact ? 'grid-cols-3 gap-3 md:grid-cols-7' : 'gap-4 md:grid-cols-7'].join(' ')}>
      {safeStages.map((item, index) => {
        const stepState = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'future'
        const isComplete = stepState === 'complete'
        const isCurrent = stepState === 'current'
        const label = stageLabelMap?.[item] || item
        const completeLineClass = isWarmTone ? 'bg-[#d58b37]' : 'bg-[#4f7ea8]'
        const futureLineClass = isWarmTone ? 'bg-[#e9ddd0]' : 'bg-[#dce7f2]'
        const completeNodeClass = isWarmTone
          ? 'border-[#d58b37] bg-[#d58b37] text-white shadow-[0_10px_24px_rgba(181,108,29,0.22)]'
          : 'border-[#4f7ea8] bg-[#4f7ea8] text-white shadow-[0_10px_24px_rgba(79,126,168,0.2)]'
        const currentNodeClass = isWarmTone
          ? 'border-[#e9c8a1] bg-[#fff8ef] text-[#9a5a1a] shadow-[0_10px_24px_rgba(66,37,4,0.08)]'
          : 'border-[#bfd3ea] bg-white text-[#35546c] shadow-[0_10px_24px_rgba(15,23,42,0.08)]'
        const futureNodeClass = isWarmTone
          ? 'border-[#e8ddd0] bg-white text-[#c1ab94]'
          : 'border-[#d7e2ee] bg-white text-[#9aabc0]'
        const completeLabelClass = isWarmTone ? 'text-[#8d5316]' : 'text-[#35546c]'
        const currentLabelClass = isWarmTone ? 'text-[#6f4112]' : 'text-[#142132]'
        const futureLabelClass = isWarmTone ? 'text-[#a99480]' : 'text-[#8aa0b8]'
        const completePillClass = isWarmTone ? 'bg-[#fff1e1] text-[#9a5a1a]' : 'bg-[#edf5fb] text-[#4f7ea8]'
        const currentPillClass = isWarmTone ? 'bg-[#fff7ed] text-[#8f5318]' : 'bg-[#eef4f9] text-[#35546c]'
        const futurePillClass = isWarmTone ? 'bg-[#f8f3ec] text-[#ab9985]' : 'bg-[#f5f8fb] text-[#94a7bd]'

        return (
          <li key={`${item}-${index}`} className="relative min-w-0">
            {index < safeStages.length - 1 ? (
              <span
                aria-hidden="true"
                className={[
                  'absolute left-[calc(50%+20px)] top-[18px] hidden h-[2px] w-[calc(100%-8px)] -translate-y-1/2 md:block',
                  index < currentIndex ? completeLineClass : futureLineClass,
                ].join(' ')}
              />
            ) : null}

            <div className={['relative z-[1] flex flex-col items-center text-center', compact ? 'gap-2' : 'gap-2.5'].join(' ')}>
              <span
                className={[
                  'inline-flex items-center justify-center rounded-full border transition duration-150 ease-out',
                  compact ? 'h-9 w-9' : 'h-10 w-10',
                  isComplete
                    ? completeNodeClass
                    : isCurrent
                      ? currentNodeClass
                      : futureNodeClass,
                ].join(' ')}
              >
                {isComplete ? <Check size={compact ? 15 : 16} strokeWidth={2.4} /> : <span className={compact ? 'h-2.5 w-2.5 rounded-full bg-current' : 'h-3 w-3 rounded-full bg-current'} />}
              </span>

              <div className="min-w-0">
                <span
                  className={[
                    'block break-words font-semibold',
                    compact ? 'text-[0.72rem] leading-5' : 'text-[0.8rem] leading-5',
                    isComplete ? completeLabelClass : isCurrent ? currentLabelClass : futureLabelClass,
                  ].join(' ')}
                >
                  {label}
                </span>
                {!compact ? (
                  <span
                    className={[
                      'mt-1 inline-flex items-center rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em]',
                      isComplete
                        ? completePillClass
                        : isCurrent
                          ? currentPillClass
                          : futurePillClass,
                    ].join(' ')}
                  >
                    {isComplete ? 'Completed' : isCurrent ? 'Current' : 'Upcoming'}
                  </span>
                ) : null}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )

  if (!framed) {
    return <div aria-label={`Progress timeline. Current stage: ${resolvedStage}`}>{content}</div>
  }

  return (
    <div
      className={[
        isWarmTone
          ? 'rounded-[20px] border border-[#eadfce] bg-[linear-gradient(180deg,#fffefc_0%,#f9f5ef_100%)]'
          : 'rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe]',
        compact ? 'px-3 py-3' : 'px-4 py-5',
      ].join(' ')}
      aria-label={`Progress timeline. Current stage: ${resolvedStage}`}
    >
      {content}
    </div>
  )
}

export default ProgressTimeline
