import { AlertTriangle, CheckCircle2, Clock3, Flag } from 'lucide-react'

function hexToRgba(hex, alpha = 1) {
  const normalized = String(hex || '#087955').replace('#', '')
  const expanded = normalized.length === 3
    ? normalized.split('').map((character) => `${character}${character}`).join('')
    : normalized.padEnd(6, '0').slice(0, 6)
  const numeric = Number.parseInt(expanded, 16)
  const red = (numeric >> 16) & 255
  const green = (numeric >> 8) & 255
  const blue = numeric & 255
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export default function TransactionJourneyTracker({
  model,
  theme: themeInput,
  title = 'Transaction journey',
  subtitle = 'One aligned view of every milestone through registration.',
  action = null,
  variant = 'summary',
  audience = 'shared',
  loading = false,
}) {
  const primary = themeInput?.primary || '#087955'
  const steps = Array.isArray(model?.steps) ? model.steps : []
  const currentStep = model?.currentStep || steps.find((step) => step.isCurrent) || null
  const stepCount = Math.max(steps.length, 1)
  const currentIndex = Math.max(0, Number(model?.currentIndex) || 0)
  const railProgress = model?.isComplete
    ? 1
    : stepCount > 1
      ? Math.min(1, currentIndex / (stepCount - 1))
      : Number(model?.progressPercent || 0) / 100
  const minRailWidth = Math.max(stepCount * 120, 720)
  const isDetailed = variant === 'detailed'
  const isBlocked = Boolean(currentStep?.isBlocked || model?.canonicalStatus === 'blocked')
  const CurrentIcon = isBlocked ? AlertTriangle : CheckCircle2

  if (loading) {
    return (
      <section
        data-transaction-journey="shared"
        data-journey-audience={audience}
        data-journey-source="loading"
        aria-busy="true"
        aria-label={`${title} loading`}
        className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] lg:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[#142132]">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-[#52657b]">{subtitle}</p>
          </div>
          <span className="h-[30px] w-24 animate-pulse rounded-full bg-[#edf2f7] motion-reduce:animate-none" />
        </div>
        <div className="mt-7 overflow-hidden pb-2">
          <div className="relative min-w-[720px] px-2 pb-1">
            <div className="absolute left-[60px] right-[60px] top-5 h-[2px] rounded-full bg-[#e6edf4]" />
            <div className="grid grid-cols-6 justify-between">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="relative z-10 flex min-w-0 flex-col items-center">
                  <span className="h-10 w-10 animate-pulse rounded-full border-4 border-[#e6edf4] bg-[#f5f8fb] motion-reduce:animate-none" />
                  <span className="mt-3 h-3 w-20 animate-pulse rounded bg-[#edf2f7] motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 rounded-[16px] border border-[#e1e9f0] bg-[#f7fafc] p-4">
          <span className="block h-2.5 w-24 animate-pulse rounded bg-[#e6edf4] motion-reduce:animate-none" />
          <span className="mt-3 block h-5 w-44 animate-pulse rounded bg-[#e1e9f0] motion-reduce:animate-none" />
          <span className="mt-3 block h-3 w-full max-w-lg animate-pulse rounded bg-[#e8eef4] motion-reduce:animate-none" />
        </div>
      </section>
    )
  }

  return (
    <section
      data-transaction-journey="shared"
      data-journey-audience={audience}
      data-journey-source={model?.source || 'unknown'}
      className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] lg:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#142132]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#52657b]">{subtitle}</p>
        </div>
        <span
          className="inline-flex min-h-[30px] items-center rounded-full border px-3 py-1 text-xs font-semibold"
          style={{ borderColor: hexToRgba(primary, 0.2), backgroundColor: hexToRgba(primary, 0.06), color: primary }}
        >
          {model?.statusLabel || '0% complete'}
        </span>
      </div>

      {steps.length ? (
        <div className="mt-7 overflow-x-auto pb-2">
          <div className="relative px-2 pb-1" style={{ minWidth: `${minRailWidth}px` }}>
            <div className="absolute left-[60px] right-[60px] top-5 h-[2px] rounded-full bg-[#dce6f1]" />
            <div
              className="absolute left-[60px] top-5 h-[2px] rounded-full transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `calc((100% - 120px) * ${railProgress})`, backgroundColor: primary }}
            />
            <div className="grid justify-between" style={{ gridTemplateColumns: `repeat(${stepCount}, 120px)` }}>
              {steps.map((step) => (
                <div key={step.id} data-journey-status={step.status} className="relative z-10 flex min-w-0 flex-col items-center text-center">
                  <span
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border-4 text-sm"
                    style={step.isComplete
                      ? { borderColor: primary, backgroundColor: primary, color: '#ffffff' }
                      : step.isCurrent
                        ? {
                            borderColor: isBlocked ? '#f59e0b' : hexToRgba(primary, 0.18),
                            backgroundColor: '#ffffff',
                            color: isBlocked ? '#b45309' : primary,
                            boxShadow: `0 0 0 6px ${isBlocked ? 'rgba(245, 158, 11, 0.12)' : hexToRgba(primary, 0.11)}`,
                          }
                        : { borderColor: '#dce6f1', backgroundColor: '#eef3f8', color: '#9aacbd' }}
                  >
                    {step.isComplete ? <CheckCircle2 size={18} /> : <span className="h-3 w-3 rounded-full bg-current opacity-80" />}
                  </span>
                  <strong className="mt-3 max-w-[104px] text-xs font-semibold leading-5 text-[#142132]">{step.label}</strong>
                  {step.completionDate ? <span className="mt-1 text-[0.68rem] font-medium text-[#8a9aab]">{step.completionDate}</span> : null}
                  {step.isCurrent ? <span className="mt-1 text-[0.68rem] font-semibold" style={{ color: isBlocked ? '#b45309' : primary }}>{isBlocked ? 'Needs attention' : 'You are here'}</span> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-6 rounded-[14px] bg-[#f7fafc] px-4 py-3 text-sm text-[#52657b]">Journey details will appear here as the transaction progresses.</p>
      )}

      <div
        className={`mt-5 rounded-[16px] border p-4 ${isDetailed ? 'lg:p-5' : ''}`}
        style={{ borderColor: isBlocked ? '#fcd34d' : hexToRgba(primary, 0.16), backgroundColor: isBlocked ? '#fffbeb' : hexToRgba(primary, 0.04) }}
      >
        <div className={`grid gap-4 ${isDetailed ? 'lg:grid-cols-[minmax(0,1.35fr)_minmax(180px,0.65fr)_minmax(220px,0.8fr)] lg:items-start' : 'sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'}`}>
          <div className="min-w-0">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Current stage</p>
            <div className="mt-1 flex items-center gap-2">
              <CurrentIcon size={18} className="shrink-0" style={{ color: isBlocked ? '#b45309' : primary }} />
              <h3 className="text-lg font-semibold text-[#142132]">{model?.currentStageLabel || 'Current step'}</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#52657b]">{model?.currentWorkflowItem?.summary || currentStep?.description || currentStep?.whatHappensNow || model?.helperMessage}</p>
            {model?.currentWorkflowItem?.ownerLabel ? <p className="mt-2 text-xs font-semibold text-[#52657b]">With: {model.currentWorkflowItem.ownerLabel}</p> : null}
          </div>
          {isDetailed && currentStep?.expectedDuration ? (
            <div className="flex items-start gap-3 lg:border-l lg:border-[#d7e0ea] lg:pl-5">
              <Clock3 size={19} className="mt-0.5 shrink-0 text-[#52657b]" />
              <div><p className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Usually takes</p><p className="mt-1 text-sm font-semibold leading-5 text-[#142132]">{currentStep.expectedDuration}</p></div>
            </div>
          ) : null}
          {isDetailed ? (
            <div className="flex items-start gap-3 lg:border-l lg:border-[#d7e0ea] lg:pl-5">
              <Flag size={19} className="mt-0.5 shrink-0 text-[#52657b]" />
              <div><p className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Next milestone</p><p className="mt-1 text-sm font-semibold leading-5 text-[#142132]">{currentStep?.nextMilestone || model?.nextStageLabel || 'Next step'}</p></div>
            </div>
          ) : action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {isDetailed && action ? <div className="mt-4 border-t border-[#d7e0ea] pt-4">{action}</div> : null}
      </div>
    </section>
  )
}
