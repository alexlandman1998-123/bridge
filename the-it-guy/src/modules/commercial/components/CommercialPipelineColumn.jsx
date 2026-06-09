import CommercialEmptyState from './CommercialEmptyState'

function CommercialPipelineColumn({ stage, records = [], summary = '', renderCard }) {
  return (
    <section className="flex min-h-[460px] w-[310px] shrink-0 flex-col rounded-3xl border border-slate-200 bg-[#f8fafc] p-3 shadow-[0_14px_32px_rgba(15,23,42,0.04)] sm:w-[330px]">
      <header className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
        <div>
          <h2 className="text-sm font-semibold tracking-[-0.02em] text-[#102236]">{stage.label}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{records.length} {records.length === 1 ? 'record' : 'records'}</p>
          {summary ? <p className="mt-1 text-xs font-semibold text-[#1267a3]">{summary}</p> : null}
        </div>
        <span className="grid h-8 min-w-8 place-items-center rounded-full bg-[#eef5fb] px-2 text-xs font-semibold text-[#1267a3]">
          {records.length}
        </span>
      </header>

      <div className="mt-3 grid gap-3">
        {records.length ? records.map((record) => renderCard(record)) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/75 p-3">
            <CommercialEmptyState
              title="Nothing here yet"
              description="Records will appear here when they move into this stage."
            />
          </div>
        )}
      </div>
    </section>
  )
}

export default CommercialPipelineColumn
