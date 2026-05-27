import { CalendarRange, Plus, Search } from 'lucide-react'
import { cn } from '../../lib/utils'

export default function BondDashboardHeader({
  userDisplayName = 'there',
  attentionText = '',
  focusChips = [],
  search = '',
  onSearchChange = () => {},
  onCreate = () => {},
  rangeKey = 'this_month',
  ranges = [],
  onRangeChange = () => {},
  className = '',
}) {
  return (
    <section
      className={cn(
        'rounded-[28px] border border-[#dbe5f0] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-5 py-5 shadow-[0_22px_44px_rgba(15,23,42,0.045)] sm:px-6 sm:py-6',
        className,
      )}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 max-w-3xl">
          <p className="text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-[#6f8399]">
            Bond Originator Command Center
          </p>
          <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.03em] text-[#132130]">
            Good morning, {userDisplayName}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#5f7287]">{attentionText}</p>
          {focusChips.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {focusChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-[#dbe6f1] bg-[#f7fbff] px-3 py-1 text-xs font-semibold text-[#4f667f]"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-3 xl:max-w-[720px]">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_200px]">
            <label className="relative min-w-0">
              <Search
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#89a0b5]"
              />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search applications, clients, banks…"
                className="h-12 w-full rounded-[16px] border border-[#dbe5f0] bg-white pl-11 pr-4 text-sm text-[#17324d] outline-none transition focus:border-[#bbcbdd]"
              />
            </label>

            <label className="relative min-w-0">
              <CalendarRange
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#89a0b5]"
              />
              <select
                value={rangeKey}
                onChange={(event) => onRangeChange(event.target.value)}
                className="h-12 w-full appearance-none rounded-[16px] border border-[#dbe5f0] bg-white pl-11 pr-4 text-sm font-medium text-[#17324d] outline-none transition focus:border-[#bbcbdd]"
              >
                {ranges.map((range) => (
                  <option key={range.key} value={range.key}>
                    {range.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={onCreate}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[16px] bg-[#143250] px-4 text-sm font-semibold text-white transition hover:bg-[#173a5e]"
            >
              <Plus size={16} />
              Create Application
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
