import {
  ArrowLeft,
  ChevronRight,
  Clock3,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { formatCompactDateTime, formatRelativeTimestamp } from '../../lib/mobileExecutive'

export function MobileExecutiveFrame({ children, className = '' }) {
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#101828]">
      <div className={cn('mx-auto flex min-h-screen w-full max-w-[480px] flex-col px-4 pb-10 pt-5 sm:px-5', className)}>
        {children}
      </div>
    </div>
  )
}

export function MobileTopBar({ title, subtitle = '', backTo = null, rightAction = null, sticky = true }) {
  return (
    <header
      className={cn(
        'z-20 mb-5 flex items-start justify-between gap-3 rounded-[28px] border border-[#e3e8f1] bg-white/92 px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)] backdrop-blur',
        sticky && 'sticky top-4',
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {backTo ? (
          <Link
            to={backTo}
            className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e4e9f1] bg-[#fbfcfe] text-[#142132] transition hover:border-[#ccd7e5] hover:bg-white"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : null}

        <div className="min-w-0">
          {subtitle ? <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7a8ca5]">{subtitle}</p> : null}
          <h1 className="mt-1 text-[26px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#101828]">{title}</h1>
        </div>
      </div>

      {rightAction ? <div className="shrink-0">{rightAction}</div> : null}
    </header>
  )
}

export function MobileSection({ eyebrow = '', title, action = null, children, className = '' }) {
  return (
    <section className={cn('mb-5', className)}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8a9ab2]">{eyebrow}</p> : null}
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#101828]">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function MobileCard({ children, className = '' }) {
  return (
    <div className={cn('rounded-[28px] border border-[#e3e8f1] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]', className)}>
      {children}
    </div>
  )
}

export function MobileStatusChip({ label, tone = 'default', className = '' }) {
  const tones = {
    default: 'border-[#e1e7ef] bg-[#f7f9fc] text-[#53657d]',
    positive: 'border-[#cbe8d4] bg-[#effbf2] text-[#0f7b43]',
    warning: 'border-[#f4d5a5] bg-[#fff7e8] text-[#b25d0f]',
    danger: 'border-[#f2c6c6] bg-[#fff1f1] text-[#b02a37]',
    dark: 'border-[#203040] bg-[#132132] text-white',
  }

  return (
    <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]', tones[tone] || tones.default, className)}>
      {label}
    </span>
  )
}

export function MobileMetricCard({ icon: Icon, label, value, meta = '', tone = 'light' }) {
  return (
    <MobileCard
      className={cn(
        'flex min-h-[108px] flex-col justify-between',
        tone === 'dark' && 'border-[#1d2d3e] bg-[#132132] text-white shadow-[0_18px_36px_rgba(15,23,42,0.12)]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn('text-[11px] font-semibold uppercase tracking-[0.2em]', tone === 'dark' ? 'text-white/70' : 'text-[#8092ab]')}>{label}</span>
        {Icon ? (
          <span className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full', tone === 'dark' ? 'bg-white/10 text-white' : 'bg-[#f5f7fb] text-[#30465d]')}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>

      <div>
        <strong className={cn('block text-[28px] font-semibold tracking-[-0.04em]', tone === 'dark' ? 'text-white' : 'text-[#101828]')}>{value}</strong>
        {meta ? <p className={cn('mt-1 text-xs', tone === 'dark' ? 'text-white/70' : 'text-[#71839c]')}>{meta}</p> : null}
      </div>
    </MobileCard>
  )
}

export function MobileSegmentedBar({ segments = [] }) {
  const total = segments.reduce((sum, segment) => sum + Number(segment.value || 0), 0) || 1

  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-[#eef2f7]">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={cn('h-full transition-all', segment.className)}
            style={{ width: `${Math.max((Number(segment.value || 0) / total) * 100, Number(segment.value || 0) > 0 ? 8 : 0)}%` }}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {segments.map((segment) => (
          <div key={segment.key} className="rounded-[18px] border border-[#edf1f6] bg-[#fbfcfe] px-3 py-2">
            <div className="mb-1 flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', segment.dotClassName)} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8596ad]">{segment.label}</span>
            </div>
            <strong className="block text-base font-semibold tracking-[-0.02em] text-[#101828]">{segment.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MobileLastUpdatedCard({ timestamp, summary = '', extra = '' }) {
  return (
    <MobileCard className="bg-[linear-gradient(145deg,#101828_0%,#17283c_100%)] text-white shadow-[0_22px_48px_rgba(15,23,42,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">Last Updated</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{formatRelativeTimestamp(timestamp)}</h3>
          <p className="mt-1 text-sm text-white/62">{formatCompactDateTime(timestamp)}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/10">
          <Clock3 className="h-4 w-4" />
        </span>
      </div>

      {summary ? <p className="mt-4 text-sm leading-6 text-white/78">{summary}</p> : null}
      {extra ? <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-white/55">{extra}</p> : null}
    </MobileCard>
  )
}

export function MobileAttentionTile({ icon: Icon, label, count, tone = 'default', meta = '' }) {
  const tones = {
    default: 'border-[#e8edf5] bg-white',
    warning: 'border-[#f4dfba] bg-[#fffaf2]',
    danger: 'border-[#f3d0d0] bg-[#fff6f6]',
    positive: 'border-[#d7ebdf] bg-[#f5fbf7]',
  }

  return (
    <MobileCard className={cn('p-3.5', tones[tone] || tones.default)}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#101828] text-white">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8092ab]">{label}</p>
          <strong className="mt-1 block text-[24px] font-semibold tracking-[-0.04em] text-[#101828]">{count}</strong>
          {meta ? <p className="mt-1 text-xs text-[#6f8199]">{meta}</p> : null}
        </div>
      </div>
    </MobileCard>
  )
}

export function MobileTransactionCard({
  to,
  eyebrow = '',
  title,
  subtitle = '',
  stageLabel,
  financeType = '',
  updatedAt = null,
  progressPercent = 0,
  blocker = '',
}) {
  const content = (
    <MobileCard className="relative overflow-hidden p-0">
      <div className="border-b border-[#ebf0f6] bg-[linear-gradient(160deg,#1c334b_0%,#466886_100%)] px-4 py-3.5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/68">{eyebrow}</p>
            <h3 className="mt-1 truncate text-lg font-semibold tracking-[-0.03em]">{title}</h3>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white">
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <MobileStatusChip label={stageLabel} tone="dark" className="!border-[#dbe4ef] !bg-[#f3f7fb] !text-[#1e3248]" />
          {financeType ? <MobileStatusChip label={financeType} /> : null}
          <span className="text-xs font-medium text-[#7d8ea6]">{formatRelativeTimestamp(updatedAt)}</span>
        </div>

        {subtitle ? <p className="text-sm text-[#5f738b]">{subtitle}</p> : null}

        <div>
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-[0.16em] text-[#8394ab]">
            <span>Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#edf2f7]">
            <span className="block h-full rounded-full bg-[linear-gradient(90deg,#10243a_0%,#5b7c9b_100%)]" style={{ width: `${Math.max(progressPercent, progressPercent > 0 ? 10 : 0)}%` }} />
          </div>
        </div>

        {blocker ? (
          <div className="rounded-[18px] border border-[#ebf0f6] bg-[#fbfcfe] px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b9bb0]">Needs Attention</p>
            <p className="mt-1 text-sm text-[#44586f]">{blocker}</p>
          </div>
        ) : null}
      </div>
    </MobileCard>
  )

  if (!to) return content

  return (
    <Link to={to} className="block transition-transform duration-200 active:scale-[0.992]">
      {content}
    </Link>
  )
}

export function MobileStageTracker({ stages = [] }) {
  return (
    <MobileCard>
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8596ad]">Progress</p>
        <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#101828]">Executive Stage Tracker</h3>
      </div>

      <div className="flex items-center gap-2">
        {stages.map((stage, index) => (
          <div key={stage.key} className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  'h-2 rounded-full',
                  stage.state === 'complete'
                    ? 'bg-[#101828]'
                    : stage.state === 'current'
                      ? 'bg-[linear-gradient(90deg,#101828_0%,#5d7997_100%)]'
                      : 'bg-[#e8edf3]',
                )}
              />
              <p
                className={cn(
                  'mt-2 truncate text-[11px] font-semibold uppercase tracking-[0.16em]',
                  stage.state === 'current' || stage.state === 'complete' ? 'text-[#22374d]' : 'text-[#9aa8bb]',
                )}
              >
                {stage.label}
              </p>
            </div>

            {index < stages.length - 1 ? <span className="h-px w-2 shrink-0 bg-[#dce4ee]" /> : null}
          </div>
        ))}
      </div>
    </MobileCard>
  )
}

export function MobileActivityFeed({ items = [], emptyText = 'No recent movement yet.' }) {
  if (!items.length) {
    return <MobileEmptyState title="No activity yet" body={emptyText} />
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <MobileCard key={item.id} className="p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-[#132132]">{item.title}</h3>
              {item.meta ? <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a9ab2]">{item.meta}</p> : null}
            </div>
            <time className="shrink-0 text-xs font-medium text-[#8a9ab2]">{formatRelativeTimestamp(item.timestamp)}</time>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#52657d]">{item.body}</p>
        </MobileCard>
      ))}
    </div>
  )
}

export function MobileEmptyState({ title, body }) {
  return (
    <MobileCard className="border-dashed bg-[#fbfcfe] py-8 text-center">
      <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#132132]">{title}</h3>
      <p className="mx-auto mt-2 max-w-[28ch] text-sm leading-6 text-[#6f8097]">{body}</p>
    </MobileCard>
  )
}
