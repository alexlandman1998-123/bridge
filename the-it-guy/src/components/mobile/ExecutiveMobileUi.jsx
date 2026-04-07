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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f8f3ea_0%,#f1ece4_42%,#ece6de_100%)] text-[#101010]">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[280px] bg-[radial-gradient(circle_at_top,rgba(24,24,24,0.08),transparent_62%)]" />
      <div className="pointer-events-none fixed right-[-72px] top-[120px] h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(196,180,156,0.24),transparent_72%)] blur-2xl" />
      <div className="pointer-events-none fixed left-[-68px] top-[340px] h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(34,34,34,0.08),transparent_72%)] blur-2xl" />
      <div className={cn('mx-auto flex min-h-screen w-full max-w-[480px] flex-col px-4 pb-10 pt-5 sm:px-5', className)}>
        {children}
      </div>
    </div>
  )
}

export function MobileTopBar({ title, subtitle = '', backTo = null, rightAction = null, sticky = true, tone = 'light' }) {
  const isHero = tone === 'hero'
  return (
    <header
      className={cn(
        'z-20 mb-5 flex items-start justify-between gap-3 rounded-[30px] px-4 backdrop-blur',
        isHero ? 'min-h-[148px] py-7' : 'py-4',
        isHero
          ? 'border border-white/12 bg-[linear-gradient(160deg,#111216_0%,#22252d_58%,#7b6247_100%)] text-white shadow-[0_22px_48px_rgba(6,7,9,0.5)]'
          : 'border border-white/10 bg-[linear-gradient(180deg,rgba(23,25,32,0.86)_0%,rgba(15,17,23,0.8)_100%)] shadow-[0_18px_44px_rgba(6,7,9,0.36)]',
        sticky && 'sticky top-4',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {backTo ? (
          <Link
            to={backTo}
            className={cn(
              'mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition',
              isHero
                ? 'border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0.06)_100%)] text-white shadow-[0_10px_18px_rgba(17,17,17,0.14)]'
                : 'border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.11)_0%,rgba(255,255,255,0.05)_100%)] text-white shadow-[0_10px_18px_rgba(6,7,9,0.3)] hover:border-white/20 hover:bg-white/10',
            )}
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : null}

        <div className="min-w-0 flex-1">
          {subtitle ? (
            <p
              className={cn(
                'font-semibold uppercase',
                isHero ? 'text-[12px] tracking-[0.24em] text-[#dcc6ad]' : 'text-[11px] tracking-[0.22em] text-white/70',
              )}
            >
              {toDisplayText(subtitle)}
            </p>
          ) : null}
          <h1
            className={cn(
              'font-semibold leading-[0.98] tracking-[-0.04em] break-words',
              isHero ? 'text-[32px] text-white sm:text-[38px]' : 'text-[30px] text-[#f5f9ff]',
              subtitle ? 'mt-1' : 'mt-0',
            )}
          >
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
    <div
      className={cn(
        'relative isolate rounded-[30px] border border-[#e9dfd2] bg-[linear-gradient(180deg,rgba(255,253,249,0.98)_0%,rgba(252,248,241,0.96)_100%)] p-4 shadow-[0_18px_42px_rgba(17,17,17,0.06)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function MobileStatusChip({ label, tone = 'default', className = '' }) {
  const tones = {
    default: 'border-[#e4d9cb] bg-[#f7f2ea] text-[#5f564b]',
    positive: 'border-[#2c6f49] bg-[#163424] text-[#cbf6db]',
    warning: 'border-[#875e2b] bg-[#342512] text-[#ffdca9]',
    danger: 'border-[#7d3a42] bg-[#35171b] text-[#ffcdd3]',
    dark: 'border-white/16 bg-[linear-gradient(180deg,#1d1f25_0%,#111218_100%)] text-white',
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
        'relative isolate flex min-h-[108px] flex-col justify-between overflow-hidden',
        tone === 'dark'
          ? 'border-white/12 bg-[linear-gradient(145deg,#101216_0%,#242a34_100%)] text-white shadow-[0_18px_36px_rgba(5,7,10,0.36)]'
          : 'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-16 before:bg-[linear-gradient(180deg,rgba(255,255,255,0.7)_0%,transparent_100%)]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn('text-[11px] font-semibold uppercase tracking-[0.2em]', tone === 'dark' ? 'text-white/66' : 'text-[#8c826f]')}>{toDisplayText(label)}</span>
        {Icon ? (
          <span
            className={cn(
              'inline-flex h-10 w-10 items-center justify-center rounded-full',
              tone === 'dark'
                ? 'bg-white/10 text-white'
                : 'border border-[#ece0d2] bg-[linear-gradient(180deg,#fffdfa_0%,#f5eee5_100%)] text-[#242424] shadow-[0_8px_18px_rgba(17,17,17,0.04)]',
            )}
          >
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
      <div className="flex h-3 overflow-hidden rounded-full bg-[#ece3d7] shadow-[inset_0_1px_2px_rgba(17,17,17,0.05)]">
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
          <div key={segment.key} className="rounded-[20px] border border-[#ece2d6] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f1e8_100%)] px-3 py-3 shadow-[0_8px_18px_rgba(17,17,17,0.03)]">
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

export function MobileLastUpdatedCard({ timestamp, summary = '', extra = '', className = '' }) {
  return (
    <MobileCard className={cn('bg-[linear-gradient(145deg,#0f0f10_0%,#1d1d1f_44%,#2e2925_100%)] text-white shadow-[0_24px_52px_rgba(16,16,16,0.2)]', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d7cbbd]">Last Updated</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#fffaf4]">{toDisplayText(formatRelativeTimestamp(timestamp), 'No recent update')}</h3>
          <p className="mt-1 text-sm text-[#d7cfc3]">{formatCompactDateTime(timestamp)}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.06)_100%)] text-[#fffaf4]">
          <Clock3 className="h-4 w-4" />
        </span>
      </div>

      {summary ? <p className="mt-4 text-sm leading-6 text-[#f1e6d8]">{toDisplayText(summary)}</p> : null}
      {extra ? <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-[#cbbca9]">{toDisplayText(extra)}</p> : null}
    </MobileCard>
  )
}

export function MobileAttentionTile({ icon: Icon, label, count, tone = 'default', meta = '' }) {
  const tones = {
    default: 'border-[#e7ddd1] bg-[linear-gradient(180deg,#fffdfa_0%,#f8f3eb_100%)]',
    warning: 'border-[#efddb9] bg-[linear-gradient(180deg,#fffaf1_0%,#fbf2e4_100%)]',
    danger: 'border-[#ecd1d1] bg-[linear-gradient(180deg,#fff7f7_0%,#fbefef_100%)]',
    positive: 'border-[#dce8df] bg-[linear-gradient(180deg,#f9fdfa_0%,#eef7f0_100%)]',
  }

  return (
    <MobileCard className={cn('p-3.5', tones[tone] || tones.default)}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,#111111_0%,#333333_100%)] text-white shadow-[0_10px_18px_rgba(17,17,17,0.12)]">
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
      <div className="border-b border-white/10 bg-[linear-gradient(160deg,#111216_0%,#22252d_64%,#7b6247_100%)] px-4 py-3.5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">{toDisplayText(eyebrow)}</p>
            <h3 className="mt-1 truncate text-lg font-semibold tracking-[-0.03em] text-white">
  {toDisplayText(title, 'Transaction')}
</h3>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.15)_0%,rgba(255,255,255,0.06)_100%)] text-white">
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <MobileStatusChip label={stageLabel} tone="dark" className="!border-white/12 !bg-white/10 !text-white" />
          {financeType ? <MobileStatusChip label={financeType} className="!border-white/12 !bg-white/[0.08] !text-[#f2f6fd]" /> : null}
          <span className="text-xs font-medium text-[#7d7264]">{formatRelativeTimestamp(updatedAt)}</span>
        </div>

        {subtitle ? <p className="text-sm text-[#5f564b]">{toDisplayText(subtitle)}</p> : null}

        <div>
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium uppercase tracking-[0.16em] text-[#8a806f]">
            <span>Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#ece5db]">
            <span className="block h-full rounded-full bg-[linear-gradient(90deg,#d8852f_0%,#efb36f_100%)]" style={{ width: `${Math.max(progressPercent, progressPercent > 0 ? 10 : 0)}%` }} />
          </div>
        </div>

        {blocker ? (
          <div className="rounded-[18px] border border-[#835b2a] bg-[linear-gradient(180deg,#342513_0%,#261b11_100%)] px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f0cf9f]">Needs Attention</p>
            <p className="mt-1 text-sm text-[#ffe3bf]">{toDisplayText(blocker)}</p>
          </div>
        ) : null}
      </div>
    </MobileCard>
  )

  if (!to) return content

  return (
    <Link to={to} className="block text-inherit no-underline transition-transform duration-200 active:scale-[0.992]">
      {content}
    </Link>
  )
}

export function MobileStageTracker({
  stages = [],
  progressPercent = 0,
  statusLabel = '',
  routeLabel = '',
  supportingText = '',
  metaLeft = '',
  metaRight = '',
  className = '',
}) {
  const currentIndex = stages.findIndex((stage) => stage.state === 'current')
  const resolvedIndex = currentIndex >= 0 ? currentIndex : stages.findIndex((stage) => stage.state === 'complete')
  const completedSteps = stages.filter((stage) => stage.state === 'complete').length + (resolvedIndex >= 0 ? 1 : 0)
  const activeStage = stages[resolvedIndex] || stages[0] || null
  const startLabel = stages[0]?.label || 'Start'
  const endLabel = stages[stages.length - 1]?.label || 'Complete'
  const normalizedProgress = Math.max(Math.min(Number(progressPercent || 0), 100), Number(progressPercent || 0) > 0 ? 8 : 0)

  return (
    <MobileCard className={cn('bg-[linear-gradient(180deg,#0f1116_0%,#1a1e27_100%)]', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <MobileStatusChip
          label={statusLabel || activeStage?.label || 'Current Stage'}
          tone="dark"
          className="!border-white/12 !bg-white/10 !text-white"
        />
        <span className="text-sm font-semibold text-[#f6f9ff]">{Math.round(progressPercent || 0)}%</span>
      </div>

      <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-white">
        {toDisplayText(routeLabel, `${startLabel} to ${endLabel}`)}
      </h3>
      <p className="mt-1 text-sm leading-6 text-[#d1dceb]">
        {toDisplayText(supportingText, `Current stage: ${activeStage?.label || startLabel}`)}
      </p>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#2f3540]">
        <span
          className="block h-full rounded-full bg-[linear-gradient(90deg,#d8852f_0%,#efb36f_100%)]"
          style={{ width: `${normalizedProgress}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d4deec]">
        <span>{startLabel}</span>
        <span>{activeStage?.label || '-'}</span>
        <span>{endLabel}</span>
      </div>

      <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
        {stages.map((stage, index) => (
          <div key={stage.key} className="flex min-w-fit items-center gap-2">
            <span
              className={cn(
                'inline-flex min-w-fit items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]',
                stage.state === 'complete'
                  ? 'border-[#975d20] bg-[#2f2314] text-[#ffd6a5]'
                  : stage.state === 'current'
                    ? 'border-[#d18931] bg-[#4b3215] text-[#ffe3be]'
                    : 'border-white/14 bg-white/[0.06] text-[#d6e0ee]',
              )}
            >
              {toDisplayText(stage.label)}
            </span>
            {index < stages.length - 1 ? <span className="h-px w-3 shrink-0 bg-[#495160]" /> : null}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[#c7d3e3]">
        <span>{metaLeft || `${Math.min(completedSteps, stages.length)} of ${stages.length} milestones`}</span>
        <span>{metaRight || ''}</span>
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
        <MobileCard key={item.id} className="p-3.5 bg-[linear-gradient(180deg,#fffdfa_0%,#f7f1e9_100%)]">
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
    <MobileCard className="border-dashed bg-[linear-gradient(180deg,#fffdfa_0%,#f7f1e9_100%)] py-8 text-center">
      <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#191919]">{title}</h3>
      <p className="mx-auto mt-2 max-w-[28ch] text-sm leading-6 text-[#6f6558]">{body}</p>
    </MobileCard>
  )
}