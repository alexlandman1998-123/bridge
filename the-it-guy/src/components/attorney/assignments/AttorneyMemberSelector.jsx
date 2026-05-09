function AttorneyMemberSelector({ label, options = [], value = '', onChange, disabled = false, optional = true }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-label font-semibold uppercase text-textMuted">{label}</span>
      <select className="input" value={value || ''} onChange={(event) => onChange?.(event.target.value)} disabled={disabled}>
        {optional ? <option value="">Not assigned</option> : null}
        {options.map((option) => (
          <option key={option.userId} value={option.userId}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default AttorneyMemberSelector
