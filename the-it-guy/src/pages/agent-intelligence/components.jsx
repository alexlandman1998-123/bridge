import { BrainCircuit, ChevronRight, Download, Share2 } from 'lucide-react'

function toneClasses(tone = 'blue') {
  if (tone === 'green') {
    return 'border-[#cde8d9] bg-[linear-gradient(180deg,#f5fcf8_0%,#edf8f2_100%)]'
  }
  if (tone === 'amber') {
    return 'border-[#eadcc3] bg-[linear-gradient(180deg,#fffdf9_0%,#fff7ec_100%)]'
  }
  if (tone === 'indigo') {
    return 'border-[#dde4fa] bg-[linear-gradient(180deg,#f8f9ff_0%,#f2f5ff_100%)]'
  }
  return 'border-[#dbe8f5] bg-[linear-gradient(180deg,#ffffff_0%,#f5f9ff_100%)]'
}

export function IntelligenceShell({ children }) {
  return (
    <main className="space-y-6 rounded-[28px] border border-[#d9e5f2] bg-[radial-gradient(circle_at_top,#ffffff_0%,#f4f8fd_48%,#edf3fa_100%)] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] lg:p-7">
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d7e5f3] bg-[#f7fbff] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#5b738f]">
          <BrainCircuit size={12} />
          Mock Intelligence Data
        </span>
      </div>
      {children}
    </main>
  )
}

export function IntelligencePageHeader({ title, description, filters = {} }) {
  return (
    <header className="rounded-3xl border border-[#dbe7f3] bg-white/85 p-5 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-[1.45rem] font-semibold tracking-[-0.03em] text-[#142132] lg:text-[1.7rem]">{title}</h1>
          <p className="mt-2 max-w-3xl text-[0.94rem] leading-7 text-[#607389]">{description}</p>
        </div>
        <FilterBar filters={filters} />
      </div>
    </header>
  )
}

export function FilterBar({ filters = {} }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2.5">
      {[filters.dateRange, filters.area, filters.listingScope].filter(Boolean).map((filter) => (
        <button
          key={filter}
          type="button"
          className="inline-flex items-center rounded-full border border-[#d5e4f2] bg-white px-3.5 py-1.5 text-[0.8rem] font-semibold text-[#3a5f84]"
        >
          {filter}
        </button>
      ))}
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full border border-[#c8dbed] bg-[#f7fbff] px-3.5 py-1.5 text-[0.8rem] font-semibold text-[#325d85]"
      >
        <Share2 size={13} /> Share
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-full border border-[#2f5f86] bg-[#35546c] px-3.5 py-1.5 text-[0.8rem] font-semibold text-white"
      >
        <Download size={13} /> Export
      </button>
    </div>
  )
}

export function IntelligenceKpiCard({ label, value, subtext, tone = 'blue' }) {
  return (
    <article className={`rounded-2xl border px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${toneClasses(tone)}`}>
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6d839d]">{label}</p>
      <p className="mt-2 text-[1.7rem] font-semibold leading-none tracking-[-0.05em] text-[#142132]">{value}</p>
      <p className="mt-2 text-[0.82rem] leading-6 text-[#61768d]">{subtext}</p>
    </article>
  )
}

export function InsightCard({ title, children, className = '' }) {
  return (
    <article className={`rounded-2xl border border-[#dce6f2] bg-white/85 p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)] ${className}`}>
      <h3 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[#162538]">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </article>
  )
}

export function OpportunityCard({ area, score, demand, share, action }) {
  const scoreTone = score >= 80 ? 'text-[#2f7f58] bg-[#f2fbf6] border-[#cae8d7]' : 'text-[#8b6324] bg-[#fff8ef] border-[#ecdcc0]'
  return (
    <article className="rounded-2xl border border-[#dce6f2] bg-[#fbfdff] p-4 transition hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-[1.05rem] font-semibold text-[#1e3349]">{area}</h4>
        <span className={`rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${scoreTone}`}>{score}/100</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[0.82rem] text-[#5f748c]">
        <p>Demand: <span className="font-semibold text-[#1f3953]">{demand}</span></p>
        <p>Your Share: <span className="font-semibold text-[#1f3953]">{share}</span></p>
      </div>
      <p className="mt-3 text-[0.86rem] leading-6 text-[#5f748c]">{action}</p>
      <button
        type="button"
        className="mt-3 inline-flex items-center gap-1 rounded-full border border-[#c9daec] bg-white px-3 py-1.5 text-[0.76rem] font-semibold text-[#355f88]"
      >
        View Opportunity
        <ChevronRight size={12} />
      </button>
    </article>
  )
}

export function MockChartCard({ title, children }) {
  return (
    <article className="rounded-2xl border border-[#dce6f2] bg-white/85 p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      <h3 className="text-[1.02rem] font-semibold text-[#182b40]">{title}</h3>
      <div className="mt-4">{children}</div>
    </article>
  )
}

export function DataTableCard({ title, columns = [], rows = [] }) {
  return (
    <article className="rounded-2xl border border-[#dce6f2] bg-white/90 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      <h3 className="text-[1.02rem] font-semibold text-[#182b40]">{title}</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className="text-[0.72rem] uppercase tracking-[0.1em] text-[#70839b]">
              {columns.map((column) => (
                <th key={column} className="px-2 py-2 font-semibold">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-[#e4ecf5] text-[0.84rem] text-[#22374d]">
                {row.map((cell, cellIndex) => (
                  <td key={`${index}-${cellIndex}`} className="px-2 py-2.5">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}

export function ProgressBarMetric({ label, value, percent = 0, tone = 'blue', helper = null }) {
  const color = tone === 'green' ? 'bg-[#2f8a63]' : tone === 'amber' ? 'bg-[#b17c30]' : tone === 'indigo' ? 'bg-[#5d63b6]' : 'bg-[#3c78a8]'
  return (
    <div className="rounded-xl border border-[#dce7f3] bg-white px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.88rem] font-medium text-[#22374d]">{label}</span>
        <span className="text-[0.86rem] font-semibold text-[#142132]">{value}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-[#e2ebf5]">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${Math.max(4, Math.min(100, percent))}%` }} />
      </div>
      {helper ? <p className="mt-1.5 text-[0.74rem] text-[#6a7e95]">{helper}</p> : null}
    </div>
  )
}

export function PipelineFunnel({ stages = [] }) {
  const maxCount = Math.max(...stages.map((stage) => stage.count), 1)
  return (
    <div className="space-y-2.5">
      {stages.map((stage, index) => {
        const width = (stage.count / maxCount) * 100
        return (
          <div key={stage.stage} className="rounded-xl border border-[#dce6f2] bg-white px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.88rem] font-semibold text-[#1f344b]">{stage.stage}</p>
              <p className="text-[0.84rem] font-semibold text-[#142132]">{stage.count}</p>
            </div>
            <div className="mt-2 h-2.5 rounded-full bg-[#e3ebf5]">
              <span
                className="block h-full rounded-full bg-[linear-gradient(90deg,#35546c_0%,#4e7ea8_100%)]"
                style={{ width: `${Math.max(8, width)}%` }}
              />
            </div>
            {index > 0 ? (
              <p className="mt-1 text-[0.72rem] text-[#68809a]">{stage.conversionFromPrevious}% from previous stage</p>
            ) : (
              <p className="mt-1 text-[0.72rem] text-[#68809a]">Base volume</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
