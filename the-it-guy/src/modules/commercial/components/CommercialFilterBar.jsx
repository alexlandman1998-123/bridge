function CommercialFilterBar({ filters = [], values = {}, onChange, onClear }) {
  if (!filters.length) return null

  const hasActiveFilters = Object.values(values).some((value) => String(value || '').trim())

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      {filters.map((filter) => (
        <label key={filter.key} className="grid gap-1">
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{filter.label}</span>
          {filter.type === 'text' ? (
            <input
              value={values[filter.key] || ''}
              onChange={(event) => onChange?.(filter.key, event.target.value)}
              placeholder={filter.placeholder || 'Any'}
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
            />
          ) : (
            <select
              value={values[filter.key] || ''}
              onChange={(event) => onChange?.(filter.key, event.target.value)}
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
            >
              <option value="">All</option>
              {(filter.options || []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </label>
      ))}
      {hasActiveFilters ? (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto min-h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600 transition hover:bg-white"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  )
}

export default CommercialFilterBar
