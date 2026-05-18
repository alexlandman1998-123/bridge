import CommercialEmptyState from './CommercialEmptyState'

function normalizeColumn(column) {
  return typeof column === 'string' ? { key: column, label: column } : column
}

function CommercialTableShell({ title, subtitle, columns, rows = [], loading = false, error = '', getRowKey, children }) {
  const normalizedColumns = columns.map(normalizeColumn)
  const hasRows = rows.length > 0

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
          Data-ready shell
        </span>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid gap-px bg-slate-200 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 sm:grid-cols-2 lg:grid-cols-[repeat(var(--commercial-columns),minmax(0,1fr))]" style={{ '--commercial-columns': normalizedColumns.length }}>
          {normalizedColumns.map((column) => (
            <div key={column.key || column.label} className="bg-[#f8fafc] px-4 py-3">
              {column.label}
            </div>
          ))}
        </div>
        {loading ? (
          <div className="grid gap-3 p-5">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : error ? (
          <div className="p-5">
            <CommercialEmptyState
              title="Commercial data could not be loaded"
              description={error}
            />
          </div>
        ) : hasRows ? (
          <div className="divide-y divide-slate-200">
            {rows.map((row, rowIndex) => (
              <div
                key={getRowKey?.(row) || row.id || rowIndex}
                className="grid gap-px bg-slate-200 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-[repeat(var(--commercial-columns),minmax(0,1fr))]"
                style={{ '--commercial-columns': normalizedColumns.length }}
              >
                {normalizedColumns.map((column) => (
                  <div key={column.key || column.label} className="min-h-14 bg-white px-4 py-3">
                    <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-slate-400 lg:hidden">
                      {column.label}
                    </span>
                    <span className="mt-0.5 block font-medium text-[#102236]">
                      {column.render ? column.render(row) : (row[column.key] ?? '-')}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-5">
          <CommercialEmptyState
            title="No commercial records yet"
            description="This table is ready for the future commercial data model and will stay empty until live records are connected."
          />
          </div>
        )}
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  )
}

export default CommercialTableShell
