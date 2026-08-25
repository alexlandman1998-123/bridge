import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
} from 'lucide-react'
import { cn } from '../../lib/utils'

const toneStyles = {
  success: {
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: 'text-emerald-600',
  },
  warning: {
    pill: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: 'text-amber-600',
  },
  danger: {
    pill: 'border-red-200 bg-red-50 text-red-700',
    icon: 'text-red-600',
  },
  neutral: {
    pill: 'border-slate-200 bg-slate-50 text-slate-600',
    icon: 'text-slate-500',
  },
}

function getToneStyle(tone = 'neutral') {
  return toneStyles[tone] || toneStyles.neutral
}

function getStatusIcon(tone = 'neutral') {
  if (tone === 'success') return CheckCircle2
  if (tone === 'warning' || tone === 'danger') return AlertCircle
  if (tone === 'pending') return Clock3
  return Circle
}

export function ListingWorkspaceStatusPill({ tone = 'neutral', children, className }) {
  const Icon = getStatusIcon(tone)
  const styles = getToneStyle(tone)

  return (
    <span
      className={cn(
        'inline-flex min-h-9 items-center gap-2 rounded-[8px] border px-3 text-sm font-semibold',
        styles.pill,
        className,
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', styles.icon)} aria-hidden="true" />
      <span className="truncate">{children}</span>
    </span>
  )
}

export function ListingWorkspaceTabs({
  tabs = [],
  activeTab = 'overview',
  onTabChange,
  ariaLabel = 'Listing workspace sections',
  className,
}) {
  return (
    <div
      className={cn(
        'flex gap-1 overflow-x-auto border-b border-[#dbe6f2] px-1',
        className,
      )}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab

        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={cn(
              'min-h-12 shrink-0 border-b-2 px-4 text-sm font-semibold transition-colors',
              isActive
                ? 'border-[#0f7a4f] text-[#0f7a4f]'
                : 'border-transparent text-[#64748b] hover:border-[#b7c7d8] hover:text-[#18324b]',
            )}
            onClick={() => onTabChange?.(tab.key)}
          >
            <span>{tab.shortLabel || tab.label}</span>
            {tab.badge ? (
              <span className="ml-2 rounded-full bg-[#edf4f8] px-2 py-0.5 text-xs text-[#416078]">
                {tab.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function ListingWorkspaceShell({
  title,
  subtitle,
  badge,
  tabs = [],
  activeTab = 'overview',
  onTabChange,
  actions,
  children,
  className,
}) {
  return (
    <main className={cn('mx-auto w-full max-w-[1480px] px-6 py-6', className)}>
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {badge ? <div className="mb-2">{badge}</div> : null}
          {title ? (
            <h1 className="text-3xl font-bold tracking-normal text-[#14233a]">
              {title}
            </h1>
          ) : null}
          {subtitle ? (
            <p className="mt-2 max-w-3xl text-base text-[#64748b]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </header>

      {tabs.length > 0 ? (
        <ListingWorkspaceTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
      ) : null}

      <div className="pt-5">{children}</div>
    </main>
  )
}

export function ListingWorkspacePanel({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}) {
  return (
    <section className={cn('border-b border-[#dbe6f2] py-6', className)}>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#6b8197]">
              {eyebrow}
            </p>
          ) : null}
          {title ? (
            <h2 className="text-xl font-bold tracking-normal text-[#14233a]">
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#64748b]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

export function ListingWorkspaceFieldGrid({ children, className }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function ListingWorkspaceSummaryBar({ items = [], className }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 border-y border-[#dbe6f2] py-4 md:grid-cols-3',
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.key || item.label} className="min-h-20 rounded-[8px] border border-[#dbe6f2] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b8197]">
            {item.label}
          </p>
          <p className="mt-2 text-2xl font-bold text-[#14233a]">{item.value}</p>
          {item.detail ? <p className="mt-1 text-sm text-[#64748b]">{item.detail}</p> : null}
        </div>
      ))}
    </div>
  )
}

export function ListingWorkspaceReadinessList({ items = [], className }) {
  return (
    <div className={cn('divide-y divide-[#dbe6f2] border-y border-[#dbe6f2]', className)}>
      {items.map((item) => (
        <div key={item.key || item.label} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#14233a]">{item.label}</p>
            {item.detail ? <p className="mt-1 text-sm text-[#64748b]">{item.detail}</p> : null}
          </div>
          <ListingWorkspaceStatusPill tone={item.tone || 'neutral'}>
            {item.status || 'Not checked'}
          </ListingWorkspaceStatusPill>
        </div>
      ))}
    </div>
  )
}

export function ListingWorkspacePortalActionPanel({
  plan,
  onAction,
  className,
  testId = 'listing-workspace-portal-action-panel',
}) {
  if (!plan) return null

  const counts = plan.counts || {}
  const countItems = [
    { key: 'live', label: 'Live', value: counts.live || 0 },
    { key: 'ready', label: 'Ready', value: counts.ready || 0 },
    { key: 'blocked', label: 'Needs work', value: counts.blocked || 0 },
    { key: 'notChecked', label: 'Not checked', value: counts.notChecked || 0 },
  ]

  return (
    <section
      className={cn(
        'rounded-[8px] border border-[#dbe6f2] bg-[#fbfdff] p-4',
        className,
      )}
      data-testid={testId}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b8197]">
            Publishing next step
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold tracking-normal text-[#14233a]">{plan.label}</h3>
            <ListingWorkspaceStatusPill tone={plan.tone || 'neutral'} className="min-h-7 px-2.5 text-xs">
              {plan.portal}
            </ListingWorkspaceStatusPill>
          </div>
          {plan.detail ? (
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#64748b]">{plan.detail}</p>
          ) : null}
        </div>
        {plan.actionLabel ? (
          <button
            type="button"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-[#0f7a4f] bg-[#0f7a4f] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c6844]"
            onClick={() => onAction?.(plan)}
          >
            {plan.actionLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {countItems.map((item) => (
          <div key={item.key} className="rounded-[8px] border border-[#dbe6f2] bg-white px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b8197]">{item.label}</p>
            <p className="mt-1 text-lg font-bold text-[#14233a]">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export function ListingWorkspacePortalChecklist({
  items = [],
  className,
  testId = 'listing-workspace-portal-checklist',
}) {
  if (!items.length) return null

  return (
    <section
      className={cn(
        'rounded-[8px] border border-[#dbe6f2] bg-white',
        className,
      )}
      data-testid={testId}
    >
      <div className="border-b border-[#dbe6f2] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b8197]">
          Publishing checklist
        </p>
      </div>
      <div className="divide-y divide-[#edf2f7]">
        {items.map((item) => (
          <div key={item.key || item.label} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full',
                  item.complete ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
                )}>
                  {item.complete ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}
                </span>
                <p className="text-sm font-semibold text-[#14233a]">{item.label}</p>
              </div>
              {item.detail ? (
                <p className="mt-2 text-sm leading-6 text-[#64748b]">{item.detail}</p>
              ) : null}
              {item.issues?.length ? (
                <ul className="mt-2 grid gap-1 text-sm leading-6 text-amber-800">
                  {item.issues.slice(0, 4).map((issue) => <li key={issue}>{issue}</li>)}
                  {item.issues.length > 4 ? <li>{item.issues.length - 4} more item{item.issues.length - 4 === 1 ? '' : 's'} need attention.</li> : null}
                </ul>
              ) : null}
            </div>
            <ListingWorkspaceStatusPill tone={item.tone || 'neutral'} className="justify-self-start lg:justify-self-end">
              {item.status || 'Pending'}
            </ListingWorkspaceStatusPill>
          </div>
        ))}
      </div>
    </section>
  )
}

export function ListingWorkspacePortalPublishGate({
  gate,
  onAction,
  className,
  testId = 'listing-workspace-portal-publish-gate',
}) {
  if (!gate) return null

  const counts = gate.counts || {}
  const blockers = Array.isArray(gate.blockers) ? gate.blockers : []

  return (
    <section
      className={cn(
        'rounded-[8px] border border-[#dbe6f2] bg-white p-4 shadow-sm',
        className,
      )}
      data-testid={testId}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b8197]">
            Publish decision
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold tracking-normal text-[#14233a]">{gate.label}</h3>
            <ListingWorkspaceStatusPill tone={gate.tone || 'neutral'} className="min-h-7 px-2.5 text-xs">
              {gate.status || 'Pending'}
            </ListingWorkspaceStatusPill>
          </div>
          {gate.detail ? (
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#64748b]">{gate.detail}</p>
          ) : null}
        </div>
        {gate.actionLabel ? (
          <button
            type="button"
            className={cn(
              'inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[8px] border px-4 text-sm font-semibold shadow-sm transition',
              gate.canPublish
                ? 'border-[#0f7a4f] bg-[#0f7a4f] text-white hover:bg-[#0c6844]'
                : 'border-[#dbe6f2] bg-white text-[#18324b] hover:bg-[#f7fbff]',
            )}
            onClick={() => onAction?.(gate)}
          >
            {gate.actionLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-[8px] border border-[#dbe6f2] bg-[#fbfdff] px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b8197]">Portals</p>
          <p className="mt-1 text-lg font-bold text-[#14233a]">{counts.portals || 0}</p>
        </div>
        <div className="rounded-[8px] border border-[#dbe6f2] bg-[#fbfdff] px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b8197]">Ready</p>
          <p className="mt-1 text-lg font-bold text-[#14233a]">{counts.ready || 0}</p>
        </div>
        <div className="rounded-[8px] border border-[#dbe6f2] bg-[#fbfdff] px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b8197]">Blocked</p>
          <p className="mt-1 text-lg font-bold text-[#14233a]">{counts.blocked || 0}</p>
        </div>
        <div className="rounded-[8px] border border-[#dbe6f2] bg-[#fbfdff] px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b8197]">Live</p>
          <p className="mt-1 text-lg font-bold text-[#14233a]">{counts.live || 0}</p>
        </div>
      </div>
      {blockers.length ? (
        <ul className="mt-3 grid gap-1 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
          {blockers.slice(0, 3).map((blocker) => <li key={blocker.key || blocker.label}>{blocker.label}</li>)}
          {blockers.length > 3 ? <li>{blockers.length - 3} more item{blockers.length - 3 === 1 ? '' : 's'} must be cleared.</li> : null}
        </ul>
      ) : null}
    </section>
  )
}

export function ListingWorkspacePortalGoLiveProof({
  proof,
  className,
  testId = 'listing-workspace-portal-go-live-proof',
}) {
  if (!proof) return null

  const rows = Array.isArray(proof.rows) ? proof.rows : []
  const portals = Array.isArray(proof.portals) ? proof.portals : []

  return (
    <section
      className={cn(
        'rounded-[8px] border border-[#dbe6f2] bg-[#fbfdff] p-4',
        className,
      )}
      data-testid={testId}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b8197]">
            Go-live proof
          </p>
          <p className="mt-1 text-sm leading-6 text-[#64748b]">{proof.detail}</p>
        </div>
        <ListingWorkspaceStatusPill tone={proof.tone || 'neutral'} className="self-start">
          {proof.status || 'Review needed'}
        </ListingWorkspaceStatusPill>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <div key={row.key || row.label} className="rounded-[8px] border border-[#dbe6f2] bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-[#14233a]">{row.label}</p>
              <ListingWorkspaceStatusPill tone={row.tone || 'neutral'} className="min-h-7 px-2 text-xs">
                {row.value}
              </ListingWorkspaceStatusPill>
            </div>
            {row.detail ? <p className="mt-2 text-xs leading-5 text-[#64748b]">{row.detail}</p> : null}
          </div>
        ))}
      </div>
      {portals.length ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {portals.map((portal) => (
            <div key={portal.key || portal.portal} className="rounded-[8px] border border-[#dbe6f2] bg-white px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#14233a]">{portal.portal}</p>
                <ListingWorkspaceStatusPill tone={portal.tone || 'neutral'} className="min-h-7 px-2 text-xs">
                  {portal.status}
                </ListingWorkspaceStatusPill>
              </div>
              <p className="mt-1 text-xs leading-5 text-[#64748b]">
                {portal.reference} - {portal.lastSynced}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function ListingWorkspacePortalFixGuide({
  items = [],
  onAction,
  className,
  testId = 'listing-workspace-portal-fix-guide',
}) {
  if (!items.length) return null

  return (
    <section
      className={cn(
        'rounded-[8px] border border-amber-200 bg-amber-50/70 p-4',
        className,
      )}
      data-testid={testId}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
            Where to fix
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-900">
            Use these shortcuts to complete the listing before publishing.
          </p>
        </div>
        <span className="inline-flex min-h-8 items-center self-start rounded-[8px] border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-800">
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {items.slice(0, 5).map((item) => (
          <div key={item.key || item.issue} className="grid gap-3 rounded-[8px] border border-amber-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-[#14233a]">{item.label}</p>
                <ListingWorkspaceStatusPill tone={item.tone || 'warning'} className="min-h-7 px-2.5 text-xs">
                  {item.status || 'Needs attention'}
                </ListingWorkspaceStatusPill>
              </div>
              <p className="mt-1 text-sm leading-6 text-[#64748b]">{item.issue}</p>
              {item.detail ? <p className="mt-1 text-xs font-semibold text-[#6b8197]">{item.detail}</p> : null}
            </div>
            {item.actionLabel ? (
              <button
                type="button"
                className="inline-flex min-h-9 items-center justify-center rounded-[8px] border border-[#dbe6f2] bg-white px-3 text-sm font-semibold text-[#18324b] transition hover:bg-[#f7fbff]"
                onClick={() => onAction?.(item)}
              >
                {item.actionLabel}
              </button>
            ) : null}
          </div>
        ))}
        {items.length > 5 ? (
          <p className="rounded-[8px] border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-800">
            {items.length - 5} more item{items.length - 5 === 1 ? '' : 's'} will show after the first fixes are completed.
          </p>
        ) : null}
      </div>
    </section>
  )
}

export function ListingWorkspacePortalReadinessGrid({
  items = [],
  onAction,
  className,
  testId = 'listing-workspace-portal-readiness-grid',
}) {
  if (!items.length) return null

  return (
    <div
      className={cn(
        'grid gap-3 md:grid-cols-2',
        className,
      )}
      data-testid={testId}
    >
      {items.map((item) => (
        <article
          key={item.key || item.portal}
          className="min-h-[156px] rounded-[8px] border border-[#dbe6f2] bg-white p-4 shadow-sm"
        >
          <div className="flex items-start gap-4">
            {item.logoSrc ? (
              <span className="grid h-14 w-20 shrink-0 place-items-center rounded-[8px] border border-[#edf2f7] bg-[#fbfdff]">
                <img src={item.logoSrc} alt={`${item.portal} logo`} className="max-h-11 max-w-16 object-contain" />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-[#14233a]">{item.portal}</h3>
                <ListingWorkspaceStatusPill tone={item.tone || 'neutral'} className="min-h-7 px-2.5 text-xs">
                  {item.label || 'Not checked'}
                </ListingWorkspaceStatusPill>
              </div>
              {item.detail ? (
                <p className="mt-2 text-sm leading-6 text-[#64748b]">{item.detail}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-[#dbe6f2] bg-[#fbfdff] px-3 py-1 text-xs font-semibold text-[#47627c]">
                  {item.reference ? `Ref: ${item.reference}` : 'No reference yet'}
                </span>
                <span className="rounded-full border border-[#dbe6f2] bg-[#fbfdff] px-3 py-1 text-xs font-semibold text-[#47627c]">
                  {item.lastSynced || 'Not synced yet'}
                </span>
              </div>
            </div>
          </div>
          {item.issues?.length ? (
            <ul className="mt-3 grid gap-1 rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
              {item.issues.slice(0, 3).map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          ) : null}
          {item.actionLabel ? (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="inline-flex min-h-9 items-center justify-center rounded-[8px] border border-[#dbe6f2] bg-white px-3 text-sm font-semibold text-[#18324b] transition hover:bg-[#f7fbff]"
                onClick={() => onAction?.(item)}
              >
                {item.actionLabel}
              </button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  )
}
