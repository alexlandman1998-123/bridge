import { CheckCircle2, Clock3, Flag } from 'lucide-react'
import { buyerPortalHexToRgba, createBuyerPortalTheme } from './buyerPortalTheme'

export default function BuyerPortalJourney({
  model,
  theme: themeInput,
  title = 'Your progress',
  subtitle = 'Reservation, offer, finance, transfer, registration, keys.',
  action = null,
  variant = 'summary',
}) {
  const theme = themeInput?.primary ? themeInput : createBuyerPortalTheme(themeInput)
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

  return (
    <section
      data-buyer-journey="shared"
      data-journey-source={model?.source || 'unknown'}
      className="rounded-[22px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] lg:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.28rem] font-semibold tracking-[-0.03em] text-[#142132]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#52657b]">{subtitle}</p>
        </div>
        <span
          className="inline-flex min-h-[30px] items-center rounded-full border px-3 py-1 text-xs font-semibold"
          style={{
            borderColor: buyerPortalHexToRgba(theme.primary, 0.2),
            backgroundColor: buyerPortalHexToRgba(theme.primary, 0.06),
            color: theme.primary,
          }}
        >
          {model?.statusLabel || '0% complete'}
        </span>
      </div>

      {steps.length ? (
        <div className="mt-7 overflow-x-auto pb-2">
          <div className="relative px-2 pb-1" style={{ minWidth: `${minRailWidth}px` }}>
            <div className="absolute left-[60px] right-[60px] top-5 h-[2px] rounded-full bg-[#dce6f1]" />
            <div
              className="absolute left-[60px] top-5 h-[2px] rounded-full"
              style={{
                width: `calc((100% - 120px) * ${railProgress})`,
                backgroundColor: theme.primary,
              }}
            />
            <div className="grid justify-between" style={{ gridTemplateColumns: `repeat(${stepCount}, 120px)` }}>
              {steps.map((step) => (
                <div
                  key={step.id}
                  data-journey-status={step.status}
                  className="relative z-10 flex min-w-0 flex-col items-center text-center"
                >
                  <span
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border-4 text-sm transition"
                    style={step.isComplete
                      ? { borderColor: theme.primary, backgroundColor: theme.primary, color: '#ffffff' }
                      : step.isCurrent
                        ? {
                            borderColor: buyerPortalHexToRgba(theme.primary, 0.18),
                            backgroundColor: '#ffffff',
                            color: theme.primary,
                            boxShadow: `0 0 0 6px ${buyerPortalHexToRgba(theme.primary, 0.11)}`,
                          }
                        : { borderColor: '#dce6f1', backgroundColor: '#eef3f8', color: '#9aacbd' }}
                  >
                    {step.isComplete ? <CheckCircle2 size={18} /> : <span className="h-3 w-3 rounded-full bg-current opacity-80" />}
                  </span>
                  <strong className="mt-3 max-w-[104px] text-[0.78rem] font-semibold leading-5 text-[#142132]">{step.label}</strong>
                  {step.completionDate ? <span className="mt-1 text-[0.68rem] font-medium text-[#8a9aab]">{step.completionDate}</span> : null}
                  {step.isCurrent ? <span className="mt-1 text-[0.68rem] font-semibold" style={{ color: theme.primary }}>You are here</span> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-6 rounded-[14px] bg-[#f7fafc] px-4 py-3 text-sm text-[#52657b]">Journey details will appear here as your purchase progresses.</p>
      )}

      <div
        className={`mt-5 rounded-[18px] border p-4 ${isDetailed ? 'lg:p-5' : ''}`}
        style={{ borderColor: buyerPortalHexToRgba(theme.primary, 0.16), backgroundColor: buyerPortalHexToRgba(theme.primary, 0.04) }}
      >
        <div className={`grid gap-4 ${isDetailed ? 'lg:grid-cols-[minmax(0,1.35fr)_minmax(180px,0.65fr)_minmax(220px,0.8fr)] lg:items-start' : 'sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'}`}>
          <div className="min-w-0">
            <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Current stage</p>
            <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#142132]">{model?.currentStageLabel || 'Current step'}</h3>
            <p className="mt-2 text-sm leading-6 text-[#52657b]">{currentStep?.description || currentStep?.whatHappensNow || model?.helperMessage}</p>
          </div>
          {isDetailed && currentStep?.expectedDuration ? (
            <div className="flex items-start gap-3 lg:border-l lg:border-[#d7e0ea] lg:pl-5">
              <Clock3 size={19} className="mt-0.5 shrink-0 text-[#52657b]" />
              <div>
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Usually takes</p>
                <p className="mt-1 text-sm font-semibold leading-5 text-[#142132]">{currentStep.expectedDuration}</p>
              </div>
            </div>
          ) : null}
          {isDetailed ? (
            <div className="flex items-start gap-3 lg:border-l lg:border-[#d7e0ea] lg:pl-5">
              <Flag size={19} className="mt-0.5 shrink-0 text-[#52657b]" />
              <div>
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Next milestone</p>
                <p className="mt-1 text-sm font-semibold leading-5 text-[#142132]">{currentStep?.nextMilestone || model?.nextStageLabel || 'Next step'}</p>
              </div>
            </div>
          ) : action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {isDetailed && action ? <div className="mt-4 border-t border-[#d7e0ea] pt-4">{action}</div> : null}
      </div>
    </section>
  )
}
