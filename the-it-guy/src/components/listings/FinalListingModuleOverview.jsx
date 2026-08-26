import { ArrowRight, Home, KeyRound, Plus, RefreshCw } from 'lucide-react'

function joinClassNames(...values) {
  return values.filter(Boolean).join(' ')
}

function ModuleLaneButton({ lane, onNavigate }) {
  const countLabel = lane.countKnown
    ? `${lane.count} active item${lane.count === 1 ? '' : 's'}`
    : 'Open module'

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(lane.indexPath)}
      className={joinClassNames(
        'flex min-h-[82px] min-w-0 flex-1 items-center justify-between gap-3 rounded-[16px] border px-4 py-3 text-left transition',
        lane.active
          ? 'border-[#1f4f78] bg-[#f4f8fc] text-[#142132] shadow-[0_8px_18px_rgba(31,79,120,0.08)]'
          : 'border-[#dce6f2] bg-white text-[#31465f] hover:border-[#b9cade] hover:bg-[#fbfdff]',
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{lane.listingLabel}</span>
        <span className="mt-1 block truncate text-xs font-medium text-[#6d8095]">
          {countLabel} - {lane.ownerLabel}-first flow
        </span>
      </span>
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dbe6f2] bg-white text-[#1f4f78]">
        <ArrowRight size={16} aria-hidden="true" />
      </span>
    </button>
  )
}

export default function FinalListingModuleOverview({ overview, onNavigate }) {
  if (!overview) return null

  const portalToneClass = overview.portalSummary?.tone === 'success'
    ? 'border-[#cbe8d8] bg-[#f1fbf5] text-[#167247]'
    : 'border-[#dce6f2] bg-[#f8fbff] text-[#42617f]'

  return (
    <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#dbe6f2] bg-[#f8fbff] text-[#1f4f78]">
              <Home size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[1.25rem] font-semibold text-[#142132]">Listings</h1>
              <p className="mt-0.5 text-sm text-[#607387]">Sales and rentals use separate capture flows with shared portal readiness.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={joinClassNames('inline-flex min-h-10 items-center gap-2 rounded-[12px] border px-3 text-sm font-semibold', portalToneClass)}>
            <KeyRound size={15} aria-hidden="true" />
            {overview.portalSummary?.label || 'Portal setup pending'}
          </span>
          <button
            type="button"
            onClick={() => onNavigate?.(overview.actions?.property24Settings)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#dce6f2] bg-white px-3 text-sm font-semibold text-[#22374d] transition hover:border-[#b9cade] hover:bg-[#fbfdff]"
          >
            <RefreshCw size={15} aria-hidden="true" />
            Portal setup
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-stretch">
        <div className="grid gap-3 md:grid-cols-2">
          {(overview.lanes || []).map((lane) => (
            <ModuleLaneButton key={lane.key} lane={lane} onNavigate={onNavigate} />
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[320px] lg:grid-cols-1">
          <button
            type="button"
            onClick={() => onNavigate?.(overview.actions?.createSale)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-[#157347] px-4 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(21,115,71,0.18)] transition hover:bg-[#11613c]"
          >
            <Plus size={16} aria-hidden="true" />
            New sale listing
          </button>
          <button
            type="button"
            onClick={() => onNavigate?.(overview.actions?.createRental)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[#c9d9ea] bg-white px-4 text-sm font-semibold text-[#1f4f78] transition hover:border-[#9fb7d1] hover:bg-[#f6faff]"
          >
            <Plus size={16} aria-hidden="true" />
            New rental listing
          </button>
        </div>
      </div>
    </section>
  )
}
