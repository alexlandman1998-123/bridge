import { Link } from 'react-router-dom'
import { AlertTriangle, Clock3, FileText, LockKeyhole, WifiOff } from 'lucide-react'

const STATE_COPY = Object.freeze({
  loading: {
    title: 'Preparing your portal',
    description: 'We are loading your portal and latest updates.',
    icon: Clock3,
  },
  empty: {
    title: 'Nothing to show yet',
    description: 'Your property team will add information here when it becomes available.',
    icon: FileText,
  },
  error: {
    title: 'We could not load your client portal',
    description: 'Please retry. If this continues, contact your property representative.',
    icon: AlertTriangle,
  },
  offline: {
    title: 'You are offline',
    description: 'You can keep reading saved information. Updates will resume when you reconnect.',
    icon: WifiOff,
  },
  expired: {
    title: 'This secure link has expired',
    description: 'Contact your property representative for a new secure portal link.',
    icon: LockKeyhole,
  },
  unauthorised: {
    title: 'Access is not available',
    description: 'Sign in again or contact your property representative for help.',
    icon: LockKeyhole,
  },
})

export function ClientPortalResponsiveShell({ children, persona = 'buyer', className = '', style = undefined }) {
  return (
    <div
      className={`client-portal-mobile-shell min-h-screen bg-[var(--portal-canvas)] text-[var(--portal-text)] ${className}`.trim()}
      data-client-portal-persona={persona}
      style={style}
    >
      <div className="client-portal-mobile-shell__content mx-auto min-h-screen w-full max-w-[430px] px-4 pt-4">
        {children}
      </div>
    </div>
  )
}

export function ClientPortalBottomNavigation({
  ariaLabel,
  activeKey,
  items = [],
  secondaryAction = null,
}) {
  const itemCount = items.length + (secondaryAction ? 1 : 0)
  return (
    <nav className="client-portal-mobile-nav lg:hidden" aria-label={ariaLabel}>
      <div
        className="client-portal-mobile-nav__grid"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, itemCount)}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const Icon = item.icon
          const active = item.key === activeKey
          return (
            <Link
              key={item.key}
              to={item.to}
              className={`client-portal-mobile-nav__item ${active ? 'client-portal-mobile-nav__item--active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={19} strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
              <span>{item.mobileLabel || item.label}</span>
            </Link>
          )
        })}
        {secondaryAction ? (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            className={`client-portal-mobile-nav__item ${secondaryAction.active ? 'client-portal-mobile-nav__item--active' : ''}`}
            aria-label={secondaryAction.ariaLabel}
            aria-haspopup={secondaryAction.ariaHasPopup}
          >
            {secondaryAction.icon || <span className="text-lg leading-none" aria-hidden="true">•••</span>}
            <span>{secondaryAction.label}</span>
          </button>
        ) : null}
      </div>
    </nav>
  )
}

export function ClientPortalStatePanel({ state = 'error', title = '', description = '', actions = [] }) {
  const copy = STATE_COPY[state] || STATE_COPY.error
  const Icon = copy.icon
  return (
    <main className="client-portal-state-shell min-h-screen bg-[var(--portal-canvas,#f3f6fb)] px-4 py-8 sm:px-6" data-client-portal-state={state}>
      <section className="mx-auto max-w-[760px] rounded-[24px] border border-[var(--portal-border,#dbe5ef)] bg-white px-5 py-7 text-center shadow-[0_16px_34px_rgba(15,23,42,0.06)] sm:px-7">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[16px] bg-[var(--portal-surface-muted,#f2f4f7)] text-[var(--portal-primary,#2f5478)]">
          <Icon size={22} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-[1.2rem] font-semibold tracking-[-0.02em] text-[var(--portal-text,#142132)]">{title || copy.title}</h1>
        <p className="mx-auto mt-2 max-w-[560px] text-sm leading-6 text-[var(--portal-muted,#5f7288)]">{description || copy.description}</p>
        {actions.length ? (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {actions.map((action) => action.href ? (
              <Link key={action.label} to={action.href} className="client-portal-state-action">{action.label}</Link>
            ) : (
              <button key={action.label} type="button" onClick={action.onClick} className="client-portal-state-action">{action.label}</button>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  )
}

export { STATE_COPY as CLIENT_PORTAL_STATE_COPY }
