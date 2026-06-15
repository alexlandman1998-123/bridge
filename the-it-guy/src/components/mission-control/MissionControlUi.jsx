import { Children, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileSignature,
  FileText,
  MailPlus,
  Radio,
  RefreshCcw,
  UserPlus,
} from 'lucide-react'
import { cn } from '../../lib/utils'

function SkeletonLine({ className = '' }) {
  return <span className={cn('block h-3 rounded-full bg-slate-200/90', className)} />
}

function SkeletonBlock({ className = '' }) {
  return <span className={cn('block animate-pulse rounded-[20px] bg-[linear-gradient(90deg,#eef2f7_20%,#f8fbfe_50%,#eef2f7_80%)] bg-[length:220%_100%]', className)} />
}

export function HQSkeletonCard({ className = '', compact = false }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-[28px] border border-[#dce5ee] bg-[linear-gradient(180deg,#ffffff_0%,#f9fbfd_100%)] p-5 shadow-[0_16px_36px_rgba(15,23,42,0.055)]',
        compact ? 'p-4' : 'p-5',
        className,
      )}
      aria-hidden="true"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <SkeletonLine className="h-3 w-28" />
          <SkeletonBlock className="mt-3 h-8 w-[min(68%,220px)] rounded-[16px]" />
        </div>
        <SkeletonBlock className="h-10 w-16 rounded-full" />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <SkeletonBlock className="h-24 rounded-[22px]" />
        <SkeletonBlock className="h-24 rounded-[22px]" />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <SkeletonBlock className="h-20 rounded-[18px]" />
        <SkeletonBlock className="h-20 rounded-[18px]" />
        <SkeletonBlock className="h-20 rounded-[18px]" />
      </div>
    </div>
  )
}

export function ExecutiveCard({
  eyebrow = 'ARCH9 HQ',
  title,
  description = '',
  status = '',
  warning = false,
  className = '',
  children,
  footer = null,
}) {
  return (
    <article
      className={cn(
        'min-h-[340px] shrink-0 snap-start rounded-[30px] border p-5 shadow-[0_18px_42px_rgba(15,23,42,0.06)] sm:p-6',
        warning
          ? 'border-[#f0d2b7] bg-[linear-gradient(180deg,#fffdfa_0%,#fff7ed_100%)] shadow-[0_18px_42px_rgba(180,114,31,0.08)]'
          : 'border-[#dde5ee] bg-white',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[#7b899a]">{eyebrow}</p> : null}
          <h3 className="mt-2 text-[1.15rem] font-semibold tracking-[-0.03em] text-[#102033] sm:text-[1.22rem]">{title}</h3>
          {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5f7187]">{description}</p> : null}
        </div>
        {status ? (
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]',
              warning ? 'bg-[#fff2df] text-[#9a5b13] ring-1 ring-inset ring-[#f0d2b7]' : 'bg-[#f2f6fa] text-[#5c6d7f] ring-1 ring-inset ring-[#dde6ef]',
            )}
          >
            {status}
          </span>
        ) : null}
      </header>

      <div className="mt-5">{children}</div>

      {footer ? <div className="mt-5 border-t border-[#edf2f7] pt-4">{footer}</div> : null}
    </article>
  )
}

export function MiniMetricCard({ label, value, loading = false, className = '' }) {
  return (
    <article className={cn('min-w-[160px] shrink-0 rounded-[22px] border border-[#dde5ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]', className)}>
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#7b899a]">{label}</p>
      {loading ? (
        <SkeletonBlock className="mt-3 h-8 w-20 rounded-[14px]" />
      ) : (
        <p className="mt-3 text-[1.45rem] font-semibold tracking-[-0.04em] text-[#102033]">{value ?? '—'}</p>
      )}
    </article>
  )
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-[24px] border border-dashed border-[#d8e2ec] bg-white px-5 py-8 text-center shadow-[0_10px_22px_rgba(15,23,42,0.025)]">
      <p className="text-[0.98rem] font-semibold text-[#102033]">{title}</p>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#60758d]">{description}</p>
    </div>
  )
}

export function MissionControlCarousel({ children, className = '', ariaLabel = 'Mission Control executive cards' }) {
  const slides = useMemo(() => Children.toArray(children), [children])
  const scrollerRef = useRef(null)
  const slideRefs = useRef([])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return undefined

    let animationFrame = 0

    const updateActiveIndex = () => {
      const childrenNodes = slideRefs.current.filter(Boolean)
      if (!childrenNodes.length) return
      const midpoint = scroller.scrollLeft + scroller.clientWidth / 2
      let nextIndex = 0
      let closestDistance = Number.POSITIVE_INFINITY

      childrenNodes.forEach((node, index) => {
        const nodeMidpoint = node.offsetLeft + node.offsetWidth / 2
        const distance = Math.abs(nodeMidpoint - midpoint)
        if (distance < closestDistance) {
          closestDistance = distance
          nextIndex = index
        }
      })

      setActiveIndex((previous) => (previous === nextIndex ? previous : nextIndex))
    }

    const handleScroll = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(updateActiveIndex)
    }

    updateActiveIndex()
    scroller.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      scroller.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [slides.length])

  const scrollToIndex = (index) => {
    const slide = slideRefs.current[index]
    if (!slide) return
    slide.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
    setActiveIndex(index)
  }

  const handleKeyDown = (event) => {
    if (!slides.length) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
      return
    }

    event.preventDefault()
    const lastIndex = slides.length - 1
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? lastIndex
          : event.key === 'ArrowLeft'
            ? Math.max(activeIndex - 1, 0)
            : Math.min(activeIndex + 1, lastIndex)
    scrollToIndex(nextIndex)
  }

  return (
    <section className={cn('space-y-4', className)}>
      <div
        ref={scrollerRef}
        className="mission-control-carousel flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-3 pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
      >
        {slides.map((slide, index) => (
          <div
            key={slide?.key ?? index}
            ref={(node) => {
              slideRefs.current[index] = node
            }}
            className="w-[88vw] min-w-[88vw] max-w-[450px] shrink-0 snap-start sm:w-[72vw] sm:min-w-[72vw] md:w-[58vw] md:min-w-[58vw] xl:w-[clamp(340px,30vw,440px)] xl:min-w-[clamp(340px,30vw,440px)]"
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}`}
          >
            {slide}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2" aria-label="Carousel pagination">
        {slides.map((slide, index) => {
          const active = index === activeIndex
          return (
            <button
              key={slide?.key ?? index}
              type="button"
              className={cn(
                'h-2.5 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#274c69]/35',
                active ? 'w-8 bg-[#274c69]' : 'w-2.5 bg-[#d8e2ec] hover:bg-[#b9c8d6]',
              )}
              aria-label={`Go to card ${index + 1}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => scrollToIndex(index)}
            />
          )
        })}
      </div>
    </section>
  )
}

function ActivitySkeletonRow() {
  return (
    <div className="flex items-start gap-3 rounded-[20px] border border-[#e6edf4] bg-[#fbfdff] p-4">
      <SkeletonBlock className="h-10 w-10 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2.5">
        <SkeletonLine className="h-3 w-28" />
        <SkeletonLine className="h-3 w-[78%]" />
      </div>
    </div>
  )
}

function AlertSkeletonRow({ warning = false }) {
  return (
    <div
      className={cn(
        'rounded-[22px] border p-4',
        warning
          ? 'border-[#f0d2b7] bg-[linear-gradient(180deg,#fffdf8_0%,#fff6ec_100%)]'
          : 'border-[#e6edf4] bg-[#fbfdff]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonLine className="h-3 w-36" />
          <SkeletonLine className="h-3 w-[72%]" />
        </div>
        <SkeletonBlock className={cn('h-8 w-20 rounded-full', warning ? 'bg-[#f6d8b7]' : 'bg-slate-200/80')} />
      </div>
    </div>
  )
}

const ACTIVITY_ICON_MAP = {
  agency_signup: Building2,
  agent_invited: MailPlus,
  attorney_invited: MailPlus,
  bond_originator_invited: MailPlus,
  bond_submitted: FileSignature,
  document_uploaded: FileText,
  lead_received: Radio,
  registration_completed: CheckCircle2,
  transaction_created: Activity,
  transaction_stage_changed: Activity,
  user_activated: UserPlus,
  website_enquiry_received: Radio,
  otp_signed: FileSignature,
}

const ACTIVITY_TONE_MAP = {
  critical: {
    icon: AlertTriangle,
    iconClassName: 'bg-[#fff1f2] text-[#be123c] ring-1 ring-inset ring-[#fecdd3]',
    metaClassName: 'text-[#b42318]',
    rowClassName: 'border-[#f7d0d7] bg-[linear-gradient(180deg,#fffdfd_0%,#fff8f8_100%)]',
  },
  warning: {
    icon: AlertTriangle,
    iconClassName: 'bg-[#fff7ed] text-[#b45309] ring-1 ring-inset ring-[#fed7aa]',
    metaClassName: 'text-[#9a5b13]',
    rowClassName: 'border-[#f2dcc0] bg-[linear-gradient(180deg,#fffdfa_0%,#fff8ef_100%)]',
  },
  success: {
    icon: CheckCircle2,
    iconClassName: 'bg-[#edfdf3] text-[#15803d] ring-1 ring-inset ring-[#bbf7d0]',
    metaClassName: 'text-[#166534]',
    rowClassName: 'border-[#dceddf] bg-[linear-gradient(180deg,#fbfefc_0%,#f7fcf8_100%)]',
  },
  info: {
    icon: Activity,
    iconClassName: 'bg-[#eff6ff] text-[#1d4ed8] ring-1 ring-inset ring-[#bfdbfe]',
    metaClassName: 'text-[#49617b]',
    rowClassName: 'border-[#e6edf4] bg-[#fbfdff]',
  },
}

function getActivityPresentation(item = {}) {
  const severity = ['critical', 'warning', 'success', 'info'].includes(item?.severity) ? item.severity : 'info'
  const tone = ACTIVITY_TONE_MAP[severity] || ACTIVITY_TONE_MAP.info
  const Icon = ACTIVITY_ICON_MAP[item?.type] || item?.icon || tone.icon
  return { severity, tone, Icon }
}

export function ActivityFeedContainer({
  title = 'Live Activity',
  loading = true,
  items = [],
  emptyTitle = 'No activity yet',
  emptyDescription = 'No recent platform activity is available yet.',
  className = '',
  onRefresh = null,
  refreshing = false,
}) {
  const [showAllMobile, setShowAllMobile] = useState(false)
  const hasMoreItems = items.length > 5

  if (loading) {
    return (
      <ExecutiveCard
        eyebrow="Real-time"
        title={title}
        description="Recent platform activity is loading."
        className={className}
      >
        <div className="space-y-3">
          <ActivitySkeletonRow />
          <ActivitySkeletonRow />
          <ActivitySkeletonRow />
        </div>
      </ExecutiveCard>
    )
  }

  return (
    <ExecutiveCard
      eyebrow="Real-time"
      title={title}
      description="Recent platform activity across the platform."
      status={refreshing ? 'Refreshing' : ''}
      className={className}
    >
      {onRefresh ? (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-full border border-[#dde6ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#45607b] shadow-[0_10px_22px_rgba(15,23,42,0.04)] transition hover:bg-[#f8fbfe] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCcw className={cn('h-3.5 w-3.5', refreshing ? 'animate-spin' : '')} />
            {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      ) : null}

      {items.length ? (
        <div className="space-y-3">
          {items.map((item, index) => {
            const { tone, Icon } = getActivityPresentation(item)
            return (
              <article
                key={item.id || item.title}
                className={cn(
                  'rounded-[20px] border p-4 shadow-[0_8px_18px_rgba(15,23,42,0.03)]',
                  tone.rowClassName,
                  index >= 5 && !showAllMobile ? 'hidden sm:block' : '',
                )}
              >
                <div className="flex items-start gap-3">
                  <span className={cn('mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tone.iconClassName)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#102033]">{item.title}</p>
                        {item.context ? <p className={cn('mt-1 text-[11px] font-semibold uppercase tracking-[0.14em]', tone.metaClassName)}>{item.context}</p> : null}
                      </div>
                      {item.timestamp ? (
                        <time title={item.absoluteTimestamp || item.timestamp} className="shrink-0 text-xs font-medium text-[#7b899a]">
                          {item.timestamp}
                        </time>
                      ) : null}
                    </div>
                    {item.description ? <p className="mt-2 text-sm leading-6 text-[#60758d]">{item.description}</p> : null}
                  </div>
                </div>
              </article>
            )
          })}
          {hasMoreItems ? (
            <button
              type="button"
              onClick={() => setShowAllMobile((current) => !current)}
              aria-expanded={showAllMobile ? 'true' : 'false'}
              className="inline-flex rounded-full border border-[#dde6ef] bg-white px-4 py-2 text-sm font-semibold text-[#3d5975] shadow-[0_10px_22px_rgba(15,23,42,0.04)] sm:hidden"
            >
              {showAllMobile ? 'Show latest 5' : `View all ${items.length}`}
            </button>
          ) : null}
        </div>
      ) : (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      )}
    </ExecutiveCard>
  )
}

export function AlertContainer({
  title = 'Attention Required',
  loading = false,
  items = [],
  emptyTitle = 'No alerts yet',
  emptyDescription = 'No stuck transactions or organisations needing attention are currently surfaced.',
  className = '',
}) {
  if (loading) {
    return (
      <ExecutiveCard
        eyebrow="Attention"
        title={title}
        description="Live risk signals and operational blockers are loading."
        warning
        className={className}
      >
        <div className="space-y-3">
          <AlertSkeletonRow warning />
          <AlertSkeletonRow warning />
          <AlertSkeletonRow warning />
        </div>
      </ExecutiveCard>
    )
  }

  return (
    <ExecutiveCard
      eyebrow="Attention"
      title={title}
      description="Live risk signals and operational blockers surfaced from HQ data."
      warning
      className={className}
    >
      {items.length ? (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id || item.title}
              className="rounded-[22px] border border-[#f0d2b7] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(180,114,31,0.05)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#102033]">{item.title}</p>
                  {item.meta ? <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#9a5b13]">{item.meta}</p> : null}
                </div>
                {item.badge ? (
                  <span className="inline-flex shrink-0 rounded-full bg-[#fff2df] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9a5b13] ring-1 ring-inset ring-[#f0d2b7]">
                    {item.badge}
                  </span>
                ) : null}
              </div>
              {item.body ? <p className="mt-2 text-sm leading-6 text-[#60758d]">{item.body}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      )}
    </ExecutiveCard>
  )
}
