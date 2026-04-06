import {
  ArrowLeft,
  ChevronRight,
  Clock3,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { formatCompactDateTime, formatRelativeTimestamp } from '../../lib/mobileExecutive'

function toDisplayText(value, fallback = '') {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (Array.isArray(value)) {
    const normalized = value.map((item) => toDisplayText(item, '')).filter(Boolean)
    return normalized.length ? normalized.join(', ') : fallback
  }

  if (typeof value === 'object') {
    const preferredKeys = ['label', 'title', 'name', 'text', 'body', 'message', 'comment']
    for (const key of preferredKeys) {
      if (value[key]) {
        return toDisplayText(value[key], fallback)
      }
    }

    try {
      return JSON.stringify(value)
    } catch {
      return fallback
    }
  }

  return fallback
}

export function MobileExecutiveFrame({ children, className = '' }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f7f4ee_0%,#f2efe9_38%,#eeebe4_100%)] text-[#101010]">
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
        'z-20 mb-5 flex items-start justify-between gap-3 rounded-[28px] border border-[#e8e0d5] bg-[rgba(255,252,247,0.94)] px-4 py-4 shadow-[0_14px_34px_rgba(16,16,16,0.05)] backdrop-blur',
        sticky && 'sticky top-4',
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {backTo ? (
          <Link
            to={backTo}
            className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e8e0d5] bg-[#fffdf9] text-[#181818] transition hover:border-[#d9d0c3] hover:bg-white"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : null}

        <div className="min-w-0">
          {subtitle ? <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#877c6d]">{toDisplayText(subtitle)}</p> : null}
          <h1 className={cn('text-[26px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#101010] truncate whitespace-nowrap', subtitle ? 'mt-1' : 'mt-0')}>
            {toDisplayText(title, 'Bridge')}
          </h1>
        </div>
      </div>

      {rightAction ? <div className="shrink-0">{rightAction}</div> : null}
    </header>
  )
}

export function MobileSection({ eyebrow = '', title, action = null, children, className = '' }) {
  return (
    <section className={cn('mb-5', className)}>
      {eyebrow || title || action ? (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8f8473]">{eyebrow}</p> : null}
            {title ? <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#101010]">{title}</h2> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function MobileCard({ children, className = '' }) {
  return (
    <div className={cn('rounded-[28px] border border-[#ebe3d8] bg-[rgba(255,252,247,0.98)] p-4 shadow-[0_12px_30px_rgba(16,16,16,0.045)]', className)}>
      {children}
    </div>
  )
}

export function MobileStatusChip({ label, tone = 'default', className = '' }) {
  const tones = {
    default: 'border-[#e6ddd1] bg-[#f8f4ee] text-[#5f564b]',
    positive: 'border-[#d7e8db] bg-[#f3faf4] text-[#2f6a41]',
    warning: 'border-[#eed8b0] bg-[#fbf3e5] text-[#9b6513]',
    danger: 'border-[#eccccc] bg-[#fbf0f0] text-[#9a3a3a]',
    dark: 'border-[#1f1f1f] bg-[#151515] text-white',
  }

  return (
    <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]', tones[tone] || tones.default, className)}>
      {toDisplayText(label)}
    </span>
  )
}

export function MobileMetricCard({ icon: Icon, label, value, meta = '', tone = 'light' }) {
  return (
    <MobileCard
      className={cn(
        'flex min-h-[108px] flex-col justify-between',
        tone === 'dark' && 'border-[#1d1d1d] bg-[linear-gradient(145deg,#101010_0%,#232323_100%)] text-white shadow-[0_18px_36px_rgba(16,16,16,0.14)]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn('text-[11px] font-semibold uppercase tracking-[0.2em]', tone === 'dark' ? 'text-white/66' : 'text-[#8c826f]')}>{toDisplayText(label)}</span>
        {Icon ? (
          <span className={cn('inline-flex h-10 w-10 items-center justify-center rounded-full', tone === 'dark' ? 'bg-white/10 text-white' : 'bg-[#f4efe8] text-[#242424]')}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>

      <div>
        <strong className={cn('block text-[28px] font-semibold tracking-[-0.04em]', tone === 'dark' ? 'text-white' : 'text-[#101010]')}>{toDisplayText(value)}</strong>
        {meta ? <p className={cn('mt-1 text-xs', tone === 'dark' ? 'text-white/70' : 'text-[#756c5f]')}>{toDisplayText(meta)}</p> : null}
      </div>
    </MobileCard>
  )
}

export function MobileSegmentedBar({ segments = [] }) {
  const total = segments.reduce((sum, segment) => sum + Number(segment.value || 0), 0) || 1

  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-[#ece5db]">
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
          <div key={segment.key} className="rounded-[18px] border border-[#eee6da] bg-[#faf6ef] px-3 py-2.5">
            <div className="mb-1 flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', segment.dotClassName)} />
              <span className="truncate whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b816f]">{toDisplayText(segment.label)}</span>
            </div>
            <strong className="block text-[22px] font-semibold tracking-[-0.03em] text-[#101010]">{toDisplayText(segment.value, '0')}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MobileLastUpdatedCard({ timestamp, summary = '', extra = '' }) {
  return (
    <MobileCard className="bg-[linear-gradient(145deg,#111111_0%,#242424_100%)] text-white shadow-[0_22px_48px_rgba(16,16,16,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/54">Last Updated</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{toDisplayText(formatRelativeTimestamp(timestamp))}</h3>
          <p className="mt-1 text-sm text-white/58">{formatCompactDateTime(timestamp)}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/8">
          <Clock3 className="h-4 w-4" />
        </span>
      </div>

      {summary ? <p className="mt-4 text-sm leading-6 text-white/76">{toDisplayText(summary)}</p> : null}
      {extra ? <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-white/50">{toDisplayText(extra)}</p> : null}
    </MobileCard>
  )
}

export function MobileAttentionTile({ icon: Icon, label, count, tone = 'default', meta = '' }) {
  const tones = {
    default: 'border-[#ece3d8] bg-[#fffdf9]',
    warning: 'border-[#efddb9] bg-[#fcf6eb]',
    danger: 'border-[#ecd1d1] bg-[#fbf4f4]',
    positive: 'border-[#dce8df] bg-[#f6fbf7]',
  }

  return (
    <MobileCard className={cn('p-3.5', tones[tone] || tones.default)}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#171717] text-white">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8c816f]">{toDisplayText(label)}</p>
          <strong className="mt-1 block text-[24px] font-semibold tracking-[-0.04em] text-[#101010]">{toDisplayText(count, '0')}</strong>
          {meta ? <p className="mt-1 text-xs text-[#756c5f]">{toDisplayText(meta)}</p> : null}
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
      <div className="border-b border-[#e8dfd4] bg-[linear-gradient(160deg,#161616_0%,#3c3c3c_100%)] px-4 py-3.5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">{toDisplayText(eyebrow)}</p>
            <h3 className="mt-1 truncate text-lg font-semibold tracking-[-0.03em]">{toDisplayText(title, 'Transaction')}</h3>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white">
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <MobileStatusChip label={stageLabel} tone="dark" className="!border-[#e8ded0] !bg-[#f7f2ea] !text-[#202020]" />
          {financeType ? <MobileStatusChip label={financeType} /> : null}
          <span className="text-xs font-medium text-[#857b6e]">{formatRelativeTimestamp(updatedAt)}</span>
        </div>

        {subtitle ? <p className="text-sm text-[#5f564b]">{toDisplayText(subtitle)}</p> : null}

        <div>
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-[0.16em] text-[#8a806f]">
            <span>Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#ece5db]">
            <span className="block h-full rounded-full bg-[linear-gradient(90deg,#111111_0%,#6d6d6d_100%)]" style={{ width: `${Math.max(progressPercent, progressPercent > 0 ? 10 : 0)}%` }} />
          </div>
        </div>

        {blocker ? (
          <div className="rounded-[18px] border border-[#ece3d8] bg-[#faf6ef] px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b806f]">Needs Attention</p>
            <p className="mt-1 text-sm text-[#4f463c]">{toDisplayText(blocker)}</p>
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8d816f]">Progress</p>
        <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#101010]">Executive Stage Tracker</h3>
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
                      ? 'bg-[linear-gradient(90deg,#111111_0%,#6e6e6e_100%)]'
                      : 'bg-[#e6ded2]',
                )}
              />
              <p
                className={cn(
                  'mt-2 truncate text-[11px] font-semibold uppercase tracking-[0.16em]',
                  stage.state === 'current' || stage.state === 'complete' ? 'text-[#282018]' : 'text-[#9a907f]',
                )}
              >
                {toDisplayText(stage.label)}
              </p>
            </div>

            {index < stages.length - 1 ? <span className="h-px w-2 shrink-0 bg-[#ddd4c8]" /> : null}
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
              <h3 className="truncate text-sm font-semibold text-[#1b1b1b]">{toDisplayText(item.title, 'Update')}</h3>
              {item.meta ? <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a806f]">{toDisplayText(item.meta)}</p> : null}
            </div>
            <time className="shrink-0 text-xs font-medium text-[#8a806f]">{formatRelativeTimestamp(item.timestamp)}</time>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#574f44]">{toDisplayText(item.body, 'No update text available.')}</p>
        </MobileCard>
      ))}
    </div>
  )
}

export function MobileEmptyState({ title, body }) {
  return (
    <MobileCard className="border-dashed bg-[#faf6ef] py-8 text-center">
      <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#191919]">{title}</h3>
      <p className="mx-auto mt-2 max-w-[28ch] text-sm leading-6 text-[#6f6558]">{body}</p>
    </MobileCard>
  )
}
