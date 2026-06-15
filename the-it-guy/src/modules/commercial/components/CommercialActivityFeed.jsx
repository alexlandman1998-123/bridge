import { formatDate } from '../commercialFormatters'

function CommercialActivityFeed({ items = [] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Latest Commercial Activity</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Unified timeline for requirements, deals, documents, Heads of Terms, and vacancies.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {items.length ? items.map((item) => (
          <div key={item.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3 sm:grid-cols-[minmax(0,1fr)_150px_120px] sm:items-center">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#102236]">{item.title}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{item.body || item.entity}</p>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{item.entity}</p>
            <p className="text-xs text-slate-500">{formatDate(item.timestamp)}</p>
          </div>
        )) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
            Commercial activity will appear here as vacancies, requirements, deals, documents, and Heads of Terms records move.
          </div>
        )}
      </div>
    </section>
  )
}

export default CommercialActivityFeed
