import { Archive, Eye, Pencil } from 'lucide-react'
import CommercialEmptyState from './CommercialEmptyState'

function CommercialTable({ columns = [], rows = [], loading = false, error = '', emptyTitle, emptyDescription, onView, onEdit, onArchive }) {
  const hasRows = rows.length > 0

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="grid gap-px bg-slate-200 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 sm:grid-cols-2 lg:grid-cols-[repeat(var(--commercial-columns),minmax(0,1fr))_156px]" style={{ '--commercial-columns': columns.length }}>
        {columns.map((column) => (
          <div key={column.key || column.label} className="bg-[#f8fafc] px-4 py-3">
            {column.label}
          </div>
        ))}
        <div className="bg-[#f8fafc] px-4 py-3">Actions</div>
      </div>

      {loading ? (
        <div className="grid gap-3 p-5">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : error ? (
        <div className="p-5">
          <CommercialEmptyState title="Commercial data could not be loaded" description={error} />
        </div>
      ) : hasRows ? (
        <div className="divide-y divide-slate-200">
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid gap-px bg-slate-200 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-[repeat(var(--commercial-columns),minmax(0,1fr))_156px]"
              style={{ '--commercial-columns': columns.length }}
            >
              {columns.map((column) => (
                <div key={column.key || column.label} className="min-h-14 bg-white px-4 py-3">
                  <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-slate-400 lg:hidden">{column.label}</span>
                  <span className="mt-0.5 block font-medium text-[#102236]">
                    {column.render ? column.render(row) : (row[column.key] ?? '-')}
                  </span>
                </div>
              ))}
              <div className="flex min-h-14 items-center gap-2 bg-white px-4 py-3">
                <button type="button" onClick={() => onView?.(row)} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="View">
                  <Eye size={15} />
                </button>
                <button type="button" onClick={() => onEdit?.(row)} className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50" aria-label="Edit">
                  <Pencil size={15} />
                </button>
                <button type="button" onClick={() => onArchive?.(row)} className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-rose-600 transition hover:bg-rose-100" aria-label="Archive">
                  <Archive size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-5">
          <CommercialEmptyState
            title={emptyTitle || 'No commercial records yet'}
            description={emptyDescription || 'Create your first record to start building this commercial workspace.'}
          />
        </div>
      )}
    </section>
  )
}

export default CommercialTable
