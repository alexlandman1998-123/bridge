import { AlertCircle, Archive, RefreshCw, Search, SlidersHorizontal } from 'lucide-react'

export function MobileCard({ children, className = '' }) {
  return (
    <div className={`rounded-[26px] border border-white/80 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.07)] ${className}`.trim()}>
      {children}
    </div>
  )
}

export function MobileLoadingState({ label = 'Loading' }) {
  return (
    <div className="space-y-3" aria-label={label}>
      {[0, 1, 2].map((item) => (
        <div key={item} className="rounded-[26px] border border-white/80 bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
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
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#edf8f2] text-[#1f7a5a]">
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
  return <MobileSearchBar placeholder={label} />
}

export function MobileSearchBar({ placeholder = 'Search', value = '', onChange = null, onFilter = null }) {
  return (
    <label className="flex min-h-[56px] items-center gap-3 rounded-[22px] border border-white/80 bg-white px-4 text-sm font-medium text-[#60758d] shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
      <Search className="h-5 w-5 shrink-0 text-[#60758d]" />
      <input
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-[#10243a] outline-none placeholder:text-[#8494a8]"
      />
      <button
        type="button"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2f6f9] text-[#10243a]"
        onClick={onFilter || undefined}
        aria-label="Open filters"
      >
        <SlidersHorizontal className="h-5 w-5" />
      </button>
    </label>
  )
}

export function MobileFilterChips({ items = [], active = '', onChange = null }) {
  return (
    <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
      {items.map((item, index) => {
        const value = typeof item === 'string' ? item : item.value
        const label = typeof item === 'string' ? item : item.label
        const selected = active === value || (!active && index === 0)
        return (
          <button
            key={value}
            type="button"
            className={`min-h-10 shrink-0 rounded-full px-4 text-[13px] font-semibold transition ${selected ? 'bg-[#1f7a5a] text-white shadow-[0_10px_22px_rgba(31,122,90,0.24)]' : 'bg-white text-[#60758d] shadow-[0_8px_18px_rgba(15,23,42,0.05)]'}`}
            onClick={() => onChange?.(value)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
