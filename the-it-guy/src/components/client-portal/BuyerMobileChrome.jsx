import { Link } from 'react-router-dom'

function buyerMobileGradient(theme = {}) {
  const primary = theme.primary || '#10213a'
  const secondary = theme.secondary || primary
  return `linear-gradient(135deg, ${primary}, ${secondary})`
}

export function BuyerMobileHeader({
  brand = {},
  logoUrl = '',
  brandName = 'Buyer Portal',
  homePath = '#',
  title = '',
  actions = null,
  menu = null,
}) {
  return (
    <header className="relative mb-4 flex min-h-[52px] items-center justify-between gap-3 rounded-[18px] px-3 text-white shadow-[0_12px_28px_rgba(15,23,42,0.12)]" style={{ background: buyerMobileGradient(brand) }} data-buyer-mobile-chrome="header">
      <Link to={homePath} className="inline-flex min-h-11 min-w-0 items-center" aria-label={`${brandName} home`}>
        {title ? (
          <h1 className="truncate text-[1.2rem] font-semibold tracking-[-0.04em] text-white">{title}</h1>
        ) : logoUrl ? (
          <img src={logoUrl} alt={`${brandName} logo`} className="max-h-9 max-w-[168px] object-contain object-left" />
        ) : (
          <span className="truncate text-base font-semibold tracking-[-0.03em] text-white">{brandName}</span>
        )}
      </Link>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      {menu}
    </header>
  )
}

export function BuyerMobilePropertyHero({ imageUrl = '', imageAlt = 'Property', theme = {}, children, className = '' }) {
  const primary = theme.primary || '#10213a'
  const secondary = theme.secondary || primary
  const overlayStyle = {
    background: `radial-gradient(circle at 86% 18%, rgba(255,255,255,0.16), transparent 26%), linear-gradient(180deg, ${primary}6b 0%, ${primary}75 42%, ${secondary}e6 100%)`,
  }

  return (
    <section className={`relative overflow-hidden rounded-[22px] bg-slate-950 text-white shadow-[0_18px_42px_rgba(15,23,42,0.18)] ${className}`.trim()} data-buyer-mobile-chrome="property-hero">
      {imageUrl ? <img src={imageUrl} alt={imageAlt} className="absolute inset-0 h-full w-full object-cover" /> : null}
      <div className="absolute inset-0" style={overlayStyle} aria-hidden="true" />
      <div className="relative">{children}</div>
    </section>
  )
}

export function BuyerMobilePageIntro({ eyebrow = '', title, description, meta = null }) {
  return (
    <header className="mb-4" data-buyer-mobile-chrome="page-intro">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#7b8491]">{eyebrow}</p> : null}
          <h2 className={`${eyebrow ? 'mt-2' : ''} text-[1.42rem] font-semibold tracking-[-0.045em] text-[#101823]`}>{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-[#667085]">{description}</p> : null}
        </div>
        {meta ? <div className="shrink-0">{meta}</div> : null}
      </div>
    </header>
  )
}

export function BuyerMobilePriorityAction({ eyebrow = 'Next step', title, description, icon: Icon, action, tone = 'action' }) {
  const toneClasses = tone === 'complete'
    ? 'border-[#cfe4d8] bg-[#eef9f2]'
    : tone === 'info'
      ? 'border-[#d6e3f1] bg-[#eef5fb]'
      : 'border-[#f0d8ae] bg-[#fff8ed]'
  return (
    <section className={`rounded-[20px] border p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] motion-safe:transition-shadow motion-safe:duration-200 motion-reduce:transition-none ${toneClasses}`} data-buyer-mobile-chrome="priority-action">
      <div className="flex items-start gap-3">
        {Icon ? <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white/80 text-[#24364d]"><Icon size={19} /></span> : null}
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#7b5a22]">{eyebrow}</p>
          <h3 className="mt-1 text-base font-semibold tracking-[-0.025em] text-[#101823]">{title}</h3>
          {description ? <p className="mt-1 text-sm leading-5 text-[#52657b]">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  )
}

export function BuyerMobileActionSheet({ isOpen = false, onClose, eyebrow = '', title, description, children, labelledBy = 'buyer-mobile-sheet-title' }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-labelledby={labelledBy} data-buyer-mobile-chrome="action-sheet">
      <button type="button" className="absolute inset-0 bg-[#101823]/28 backdrop-blur-[2px]" onClick={onClose} aria-label="Close dialog" />
      <section className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-[30px] border border-white/80 bg-white px-5 pb-[max(1.2rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-24px_60px_rgba(15,23,42,0.18)] motion-reduce:transition-none">
        <div className="mx-auto max-w-[430px]">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#d7dde5]" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {eyebrow ? <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#8a94a3]">{eyebrow}</p> : null}
              <h2 id={labelledBy} className="mt-1 text-[1.3rem] font-semibold tracking-[-0.04em] text-[#101823]">{title}</h2>
              {description ? <p className="mt-1 text-sm leading-6 text-[#667085]">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e1e5ea] bg-[#fbfcfd] text-[#344054]" aria-label="Close">
              <span aria-hidden="true" className="text-xl leading-none">×</span>
            </button>
          </div>
          <div className="mt-5">{children}</div>
        </div>
      </section>
    </div>
  )
}

export function BuyerMobileBottomNavigation({ items = [], activeKey = '', getPath, activeStyle }) {
  return (
    <nav className="fixed inset-x-3 bottom-2 z-40 mx-auto max-w-[430px] rounded-[22px] border border-[#dfe7ee] bg-white/95 px-1.5 py-0.5 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur lg:hidden" aria-label="Buyer portal mobile navigation" data-buyer-mobile-chrome="navigation">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const Icon = item.icon
          const active = item.key === activeKey || Boolean(item.isActive?.(activeKey))
          return (
            <Link
              key={item.key}
              to={typeof getPath === 'function' ? getPath(item) : item.to || '#'}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-[16px] text-[0.64rem] font-semibold transition motion-safe:duration-200 motion-reduce:transition-none ${active ? 'text-[#063f34]' : 'text-[#667085] hover:bg-[#f7f8fa] hover:text-[#344054]'}`}
              style={active ? activeStyle : undefined}
            >
              {Icon ? <Icon size={18} strokeWidth={active ? 2.4 : 2} /> : null}
              <span className="truncate">{item.mobileLabel || item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
