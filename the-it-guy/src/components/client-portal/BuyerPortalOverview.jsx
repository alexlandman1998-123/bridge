export function BuyerPortalOverviewShell({
  hero,
  progress,
  updates,
  documents,
  insights,
  support,
}) {
  return (
    <section className="space-y-6" data-buyer-portal-overview="shared">
      <div data-buyer-overview-region="hero">{hero}</div>
      {progress ? <div data-buyer-overview-region="progress">{progress}</div> : null}
      {updates || documents ? (
        <section className="grid gap-5 xl:grid-cols-2 xl:items-stretch" data-buyer-overview-region="activity-documents">
          {updates ? <div className="min-w-0">{updates}</div> : null}
          {documents ? <div className="min-w-0">{documents}</div> : null}
        </section>
      ) : null}
      {insights ? <div data-buyer-overview-region="insights">{insights}</div> : null}
      {support ? <div data-buyer-overview-region="support">{support}</div> : null}
    </section>
  )
}
export function BuyerPortalOverviewHero({
  welcomeName = 'Buyer',
  propertyName = 'Your property purchase',
  unitLabel = '',
  purchasePriceLabel = 'Not set',
  statusLabel = 'On track',
  statusClassName = 'border-white/20 bg-white/12 text-white',
  currentStageLabel = 'In progress',
  nextStageLabel = 'We will keep you updated',
  progressPercent = 0,
  timeInStageLabel = 'Recently',
  stageUpdatedDateLabel = 'Recently',
  attentionEyebrow = 'Needs your attention',
  attentionTitle = 'No action needed right now',
  attentionDescription = 'Your team will post the next step here.',
  attentionRequired = false,
  attentionActions = null,
  theme,
  propertyImageUrl = '',
  propertyImageAlt = '',
}) {
  const safeProgress = Math.max(0, Math.min(100, Number(progressPercent) || 0))
  const heroStyle = propertyImageUrl
    ? {
        backgroundImage: `${theme?.heroOverlayStyle?.background || 'linear-gradient(135deg, rgba(6,43,43,0.9), rgba(49,92,125,0.88))'}, url("${propertyImageUrl}")`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }
    : theme?.heroOverlayStyle

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(420px,0.84fr)_minmax(0,1.16fr)] xl:items-stretch">
      <div className="flex min-h-[320px] min-w-0 flex-col xl:min-h-[342px]">
        <h1 className="text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.045em] text-[#102a2b] sm:text-[2.55rem]">
          Welcome, {welcomeName}.
        </h1>

        <div className="mt-6 flex flex-1 items-stretch">
          <article className="flex h-full min-h-[214px] w-full flex-1 flex-col rounded-[20px] border border-[#dbe5ec] bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.045)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.67rem] font-semibold uppercase tracking-[0.13em] text-[#718196]">{attentionEyebrow}</p>
                <h2 className="mt-2 text-[1.35rem] font-semibold leading-tight tracking-[-0.03em] text-[#102032]">{attentionTitle}</h2>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.1em] ${
                attentionRequired ? 'border-[#f0d8ae] bg-[#fff6e7] text-[#9a5b0f]' : 'border-[#cfe8d8] bg-[#f2fbf5] text-[#1f7d44]'
              }`}>
                {attentionRequired ? 'Action needed' : 'On track'}
              </span>
            </div>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#566b82]">{attentionDescription}</p>
            {attentionActions ? <div className="mt-auto flex flex-wrap gap-2 border-t border-[#e7edf2] pt-4">{attentionActions}</div> : null}
          </article>
        </div>
      </div>

      <article
        className="relative min-h-[320px] overflow-hidden rounded-[20px] border border-[#dbe5ef] bg-[#062b2b] p-6 text-white shadow-[0_18px_38px_rgba(15,23,42,0.12)] xl:min-h-[342px]"
        style={heroStyle}
        aria-label={propertyImageAlt || propertyName}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_83%_18%,rgba(255,255,255,0.2),transparent_26%),linear-gradient(180deg,rgba(5,28,34,0)_50%,rgba(5,28,34,0.64)_100%)]" aria-hidden="true" />
        <div className="relative flex h-full min-h-[272px] flex-col">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/75">Your purchase</p>
              <h2 className="mt-4 max-w-xl text-[2.05rem] font-semibold leading-[1.08] tracking-[-0.04em] text-white">{propertyName}</h2>
              {unitLabel ? <p className="mt-2 text-base font-semibold text-white/85">{unitLabel}</p> : null}
            </div>
            <span className={`shrink-0 rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${statusClassName}`}>
              {statusLabel}
            </span>
          </div>

          <div className="mt-auto grid gap-4 border-t border-white/[0.2] pt-5 md:grid-cols-[minmax(0,1fr)_108px] md:items-end">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-white/75">Where things stand</p>
              <p className="mt-2 flex items-center gap-2 text-[1.2rem] font-semibold text-white">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme?.accent || '#76d46f' }} />
                <span className="min-w-0 truncate">{currentStageLabel}</span>
              </p>
              <p className="mt-1 text-sm font-medium text-white/80">Next: {nextStageLabel}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {[
                  ['Price', purchasePriceLabel],
                  ['Active', timeInStageLabel],
                  ['Updated', stageUpdatedDateLabel],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[12px] border border-white/12 bg-white/[0.08] px-3 py-2">
                    <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-white/70">{label}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-white">{value || 'Not set'}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative inline-flex h-[108px] w-[108px] shrink-0 items-center justify-center rounded-full shadow-[0_16px_30px_rgba(0,0,0,0.28)]" style={{ background: `conic-gradient(${theme?.accent || '#74d46e'} ${safeProgress * 3.6}deg, rgba(255,255,255,0.2) 0deg)` }}>
              <span className="absolute inset-[9px] rounded-full bg-[#10243a]/[0.94] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" />
              <span className="relative text-center">
                <span className="block text-[1.55rem] font-semibold leading-none text-white">{safeProgress}%</span>
                <span className="mt-1 block text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-white/75">Complete</span>
              </span>
            </div>
          </div>
        </div>
      </article>
    </section>
  )
}
