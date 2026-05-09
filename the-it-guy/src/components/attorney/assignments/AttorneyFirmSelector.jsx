function AttorneyFirmSelector({ firms = [], value = '', onChange, disabled = false }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-label font-semibold uppercase text-textMuted">Attorney Firm</span>
      <select className="input" value={value} onChange={(event) => onChange?.(event.target.value)} disabled={disabled}>
        <option value="">Select firm</option>
        {firms.map((firm) => (
          <option key={firm.id} value={firm.id}>
            {firm.name}
          </option>
        ))}
      </select>
    </label>
  )
}

export default AttorneyFirmSelector
