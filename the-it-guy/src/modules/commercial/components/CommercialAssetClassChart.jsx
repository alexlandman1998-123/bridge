import { formatNumber } from '../commercialFormatters'

const COLORS = ['#0f8d63', '#0f5f9f', '#f59e0b', '#7c3aed', '#ef4444', '#64748b']

function buildSegments(data, total) {
  let offset = 25
  return data.map((item, index) => {
    const length = total > 0 ? (item.value / total) * 100 : 0
    const segment = {
      ...item,
      color: COLORS[index % COLORS.length],
      dash: `${length} ${100 - length}`,
      offset,
    }
    offset -= length
    return segment
  })
}

function CommercialAssetClassChart({ data = [] }) {
  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0)
  const segments = buildSegments(data, total)

  return (
    <section className="h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Space By Asset Class</h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">GLA distribution across commercial stock.</p>

      <div className="mt-5 flex items-center gap-5">
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
            <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#eef2f7" strokeWidth="7" />
            {segments.map((segment) => (
              <circle
                key={segment.key}
                cx="21"
                cy="21"
                r="15.915"
                fill="transparent"
                stroke={segment.color}
                strokeWidth="7"
                strokeDasharray={segment.dash}
                strokeDashoffset={segment.offset}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-xl font-semibold tracking-[-0.04em] text-[#102236]">{formatNumber(total, 'm²')}</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Total GLA</p>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {segments.length ? segments.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-slate-600">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="shrink-0 font-semibold text-[#102236]">{formatNumber(item.value, 'm²')}</span>
            </div>
          )) : (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Asset-class distribution will appear once property GLA is captured.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

export default CommercialAssetClassChart
