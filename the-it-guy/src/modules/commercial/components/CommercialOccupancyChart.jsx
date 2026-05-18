function pointPath(points, width, height, padding) {
  if (!points.length) return ''
  return points
    .map((point, index) => {
      const x = padding + (index * ((width - padding * 2) / Math.max(points.length - 1, 1)))
      const y = height - padding - ((point.occupancy / 100) * (height - padding * 2))
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
}

function CommercialOccupancyChart({ data = [] }) {
  const width = 620
  const height = 220
  const padding = 26
  const latest = data[data.length - 1]

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Occupancy Trend</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Portfolio occupancy and vacancy signal over time.</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-right">
          <p className="text-lg font-semibold text-emerald-700">{latest ? `${latest.occupancy}%` : '0%'}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-600">Current</p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100 bg-[#f8fbfd] p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full" role="img" aria-label="Occupancy trend chart">
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = height - padding - ((tick / 100) * (height - padding * 2))
            return <line key={tick} x1={padding} x2={width - padding} y1={y} y2={y} stroke="#e5edf5" strokeWidth="1" />
          })}
          <path d={pointPath(data, width, height, padding)} fill="none" stroke="#0f8d63" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d={pointPath(data.map((point) => ({ ...point, occupancy: point.vacancy })), width, height, padding)} fill="none" stroke="#f59e0b" strokeWidth="3" strokeDasharray="6 8" strokeLinecap="round" strokeLinejoin="round" />
          {data.map((point, index) => {
            const x = padding + (index * ((width - padding * 2) / Math.max(data.length - 1, 1)))
            const y = height - padding - ((point.occupancy / 100) * (height - padding * 2))
            return <circle key={point.label} cx={x} cy={y} r="5" fill="#ffffff" stroke="#0f8d63" strokeWidth="3" />
          })}
          {data.map((point, index) => {
            const x = padding + (index * ((width - padding * 2) / Math.max(data.length - 1, 1)))
            return (
              <text key={`${point.label}-label`} x={x} y={height - 5} textAnchor="middle" fontSize="12" fontWeight="600" fill="#64748b">
                {point.label}
              </text>
            )
          })}
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold text-slate-500">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Occupancy</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-500" /> Vacancy</span>
      </div>
    </section>
  )
}

export default CommercialOccupancyChart
