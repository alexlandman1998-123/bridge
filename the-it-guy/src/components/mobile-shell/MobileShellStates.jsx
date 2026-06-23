import { AlertCircle, Archive, RefreshCw } from 'lucide-react'

export function MobileCard({ children, className = '' }) {
  return (
    <div className={`rounded-[22px] border border-[#e4ebf2] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)] ${className}`.trim()}>
      {children}
    </div>
  )
}

export function MobileLoadingState({ label = 'Loading' }) {
  return (
    <div className="space-y-3" aria-label={label}>
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-[22px] border border-[#e4ebf2] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
          <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200" />
          <div className="mt-4 h-6 w-44 max-w-full animate-pulse rounded-full bg-slate-200" />
          <div className="mt-3 h-3 w-full animate-pulse rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  )
}

export function MobileEmptyState({
  title = 'Nothing here yet.',
  body = 'Items will appear here once they are available.',
  actionLabel = '',
  onAction = null,
}) {
  return (
    <MobileCard className="border-dashed py-7 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#edf8f2] text-[#1f7a5a]">
        <Archive className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-[18px] font-semibold text-[#10243a]">{title}</h2>
      <p className="mx-auto mt-2 max-w-[28ch] text-sm leading-6 text-[#60758d]">{body}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#10243a] px-4 text-sm font-semibold text-white"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </MobileCard>
  )
}

export function MobileErrorState({
  title = "We couldn't load this right now.",
  body = 'Try refreshing.',
  onRetry = null,
}) {
  return (
    <MobileCard className="border-[#f3d4d1] bg-[#fff8f7]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#feecec] text-[#b42318]">
          <AlertCircle className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold text-[#10243a]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#60758d]">{body}</p>
          {onRetry ? (
            <button
              type="button"
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl border border-[#d7e0ea] bg-white px-4 text-sm font-semibold text-[#10243a]"
              onClick={onRetry}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          ) : null}
        </div>
      </div>
    </MobileCard>
  )
}

export function MobileSearchPlaceholder({ label = 'Search and filters' }) {
  return (
    <div className="flex min-h-[48px] items-center rounded-2xl border border-[#d7e0ea] bg-white px-4 text-sm font-medium text-[#60758d] shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
      {label}
    </div>
  )
}
