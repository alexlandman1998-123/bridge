function normalizeOptions(options = []) {
  return Array.isArray(options) ? options : []
}

function selectFilter({
  id = '',
  label = '',
  options = [],
  value = '',
  onChange = () => {},
}) {
  return (
    <label key={id} className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6d8096]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(id, event.target.value)}
        className="h-[38px] rounded-[12px] border border-[#dce6f2] bg-white px-3 text-sm text-[#20364c]"
      >
        <option value="">All</option>
        {normalizeOptions(options).map((option) => (
          <option key={String(option.value || option.id || option.label)} value={String(option.value || option.id || '')}>
            {String(option.label || option.name || option.value || option.id || '')}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function BondDashboardFilters({
  filters = null,
  values = {},
  onChange = () => {},
}) {
  const visibleFilters = filters?.visibleFilters || {}
  const options = filters?.options || {}

  const fields = [
    visibleFilters.region
      ? selectFilter({ id: 'region', label: 'Region', options: options.regions, value: values.region || '', onChange })
      : null,
    visibleFilters.unit
      ? selectFilter({ id: 'unit', label: 'Branch / Team', options: options.units, value: values.unit || '', onChange })
      : null,
    visibleFilters.consultant
      ? selectFilter({ id: 'consultant', label: 'Consultant', options: options.consultants, value: values.consultant || '', onChange })
      : null,
    visibleFilters.processor
      ? selectFilter({ id: 'processor', label: 'Processor', options: options.processors, value: values.processor || '', onChange })
      : null,
    visibleFilters.manager
      ? selectFilter({ id: 'manager', label: 'Manager', options: options.managers, value: values.manager || '', onChange })
      : null,
    visibleFilters.complianceReviewer
      ? selectFilter({ id: 'complianceReviewer', label: 'Compliance', options: options.complianceReviewers, value: values.complianceReviewer || '', onChange })
      : null,
    visibleFilters.stage
      ? selectFilter({ id: 'stage', label: 'Stage', options: options.stages, value: values.stage || '', onChange })
      : null,
    visibleFilters.financeStatus
      ? selectFilter({ id: 'financeStatus', label: 'Finance Status', options: options.financeStatuses, value: values.financeStatus || '', onChange })
      : null,
    visibleFilters.overdue
      ? selectFilter({ id: 'overdue', label: 'Overdue', options: options.overdue, value: values.overdue || '', onChange })
      : null,
  ].filter(Boolean)

  if (!fields.length) {
    return (
      <section className="rounded-[16px] border border-[#dde6f1] bg-white px-4 py-3">
        <p className="text-sm text-[#5f7287]">No additional filters available for your current scope.</p>
      </section>
    )
  }

  return (
    <section className="rounded-[16px] border border-[#dde6f1] bg-white px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{fields}</div>
    </section>
  )
}
