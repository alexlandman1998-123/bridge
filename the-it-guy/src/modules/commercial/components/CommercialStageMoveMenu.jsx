function CommercialStageMoveMenu({ value, stages = [], disabled = false, onChange }) {
  return (
    <label className="grid gap-1" onClick={(event) => event.stopPropagation()}>
      <span className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-slate-400">Move stage</span>
      <select
        value={value || ''}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        className="min-h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {stages.map((stage) => (
          <option key={stage.value} value={stage.value}>
            {stage.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default CommercialStageMoveMenu
