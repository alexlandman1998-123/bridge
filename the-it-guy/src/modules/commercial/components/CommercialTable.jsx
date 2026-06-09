import { Archive, ArrowDown, ArrowUp, Eye, Pencil } from 'lucide-react'
import CommercialEmptyState from './CommercialEmptyState'

function CommercialTable({
  columns = [],
  rows = [],
  loading = false,
  error = '',
  emptyTitle,
  emptyDescription,
  sortKey = '',
  sortDirection = 'asc',
  pagination = null,
  onSort,
  onView,
  onEdit,
  onArchive,
  onCreate,
  createLabel = '',
}) {
  const hasRows = rows.length > 0

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="grid gap-px bg-slate-200 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 sm:grid-cols-2 xl:grid-cols-[repeat(var(--commercial-columns),minmax(0,1fr))_156px]" style={{ '--commercial-columns': columns.length }}>
        {columns.map((column) => (
          <div key={column.key || column.label} className="bg-[#f8fafc] px-4 py-3">
            <button
              type="button"
              disabled={!column.key || column.sortable === false || !onSort}
              onClick={() => onSort?.(column.key)}
              className="inline-flex items-center gap-1.5 text-left disabled:cursor-default"
            >
              <span>{column.label}</span>
              {sortKey === column.key ? (
                sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
              ) : null}
            </button>
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
              className="grid gap-px bg-slate-200 text-sm text-slate-700 sm:grid-cols-2 xl:grid-cols-[repeat(var(--commercial-columns),minmax(0,1fr))_156px]"
              style={{ '--commercial-columns': columns.length }}
            >
              {columns.map((column) => (
                <div key={column.key || column.label} className="min-h-14 bg-white px-4 py-3">
                  <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-slate-400 xl:hidden">{column.label}</span>
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
            primaryActionLabel={createLabel}
            onPrimaryAction={onCreate}
          />
        </div>
      )}
      {pagination && !loading && !error && pagination.totalRows > 0 ? (
        <footer className="flex flex-col gap-3 border-t border-slate-200 bg-[#f8fafc] px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing <span className="font-semibold text-[#102236]">{pagination.startRow}</span>-
            <span className="font-semibold text-[#102236]">{pagination.endRow}</span> of{' '}
            <span className="font-semibold text-[#102236]">{pagination.totalRows}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!pagination.canPrevious}
              onClick={pagination.onPrevious}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#102236] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={!pagination.canNext}
              onClick={pagination.onNext}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#102236] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </footer>
      ) : null}
    </section>
  )
}

export default CommercialTable
