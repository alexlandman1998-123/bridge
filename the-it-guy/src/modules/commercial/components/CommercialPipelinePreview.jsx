import { Link } from 'react-router-dom'
import CommercialEmptyState from './CommercialEmptyState'

function CommercialPipelinePreview({ title, subtitle, columns, emptyTitle, emptyDescription, stageCounts = {}, ctaLabel = '', ctaTo = '' }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>
        </div>
        {ctaTo ? (
          <Link to={ctaTo} className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-[#1267a3] transition hover:bg-white">
            {ctaLabel || 'Open pipeline'}
          </Link>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {columns.map((column) => (
          <div key={column.value || column} className="min-h-[154px] rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.11em] text-slate-500">{column.label || column}</p>
              <span className="grid h-7 min-w-7 place-items-center rounded-full bg-white px-2 text-xs font-semibold text-[#102236] shadow-sm">
                {stageCounts[column.value || column] || 0}
              </span>
            </div>
            <div className="mt-4">
              {(stageCounts[column.value || column] || 0) > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{stageCounts[column.value || column]}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Active records</p>
                </div>
              ) : (
                <CommercialEmptyState title={emptyTitle} description={emptyDescription} />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default CommercialPipelinePreview
