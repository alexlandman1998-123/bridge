import BondEmptyState from '../bond/BondEmptyState'

function toneForIntensity(intensity = 0) {
  const safe = Math.min(1, Math.max(0, Number(intensity || 0)))
  return {
    background: `rgba(49, 95, 140, ${0.08 + safe * 0.62})`,
    color: safe > 0.55 ? '#ffffff' : '#142132',
  }
}

export default function OperationalHeatmap({
  rows = [],
  rowHeader = 'Segment',
  emptyTitle = 'No heatmap data',
  emptyDescription = 'Operational intensity will appear once workflow data is available.',
}) {
  const safeRows = Array.isArray(rows) ? rows : []
  const columns = safeRows[0]?.stages?.map((stage) => stage.label) || []

  if (!safeRows.length) {
    return <BondEmptyState compact title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className="overflow-x-auto print:overflow-visible">
      <div className="min-w-[860px] print:min-w-0">
        <div className="grid gap-2" style={{ gridTemplateColumns: `180px repeat(${columns.length}, minmax(94px, 1fr))` }}>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7d93aa]">{rowHeader}</p>
          {columns.map((column) => (
            <p key={column} className="text-center text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7d93aa]">
              {column}
            </p>
          ))}
          {safeRows.map((row) => (
            <div key={row.key} className="contents break-inside-avoid">
              <div className="flex items-center rounded-[14px] border border-[#edf2f7] bg-[#fbfdff] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#142132]">{row.label}</p>
                  <p className="mt-1 text-xs text-[#60758d]">{row.total} active files</p>
                </div>
              </div>
              {row.stages.map((stage) => {
                const colors = toneForIntensity(stage.intensity)
                return (
                  <div
                    key={`${row.key}-${stage.key}`}
                    className="flex min-h-[58px] flex-col items-center justify-center rounded-[14px] border border-[#edf2f7] print:min-h-[44px]"
                    style={colors}
                    title={`${row.label} ${stage.label}: ${stage.count} files, ${stage.riskCount} risk`}
                  >
                    <p className="text-lg font-semibold">{stage.count}</p>
                    <p className="mt-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] opacity-80">{stage.riskCount} risk</p>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

