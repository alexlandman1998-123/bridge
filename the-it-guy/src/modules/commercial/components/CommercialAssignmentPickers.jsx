function SelectControl({ label, value, options = [], placeholder = 'Any', disabled = false, onChange }) {
  return (
    <label className="grid gap-1">
      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</span>
      <select
        value={value || ''}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled}
        className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function brokerOptions(brokers = []) {
  return brokers
    .filter((broker) => broker.userId || broker.id)
    .map((broker) => ({
      value: broker.userId || broker.id,
      label: [broker.name || broker.email || 'Broker', broker.branchName].filter(Boolean).join(' · '),
    }))
}

export function teamOptions(teams = []) {
  return teams.map((team) => ({
    value: team.id,
    label: [team.name || 'Commercial team', `${team.brokers || 0} members`].join(' · '),
  }))
}

export function branchOptions(branches = []) {
  return branches.map((branch) => ({
    value: branch.id,
    label: [branch.name || 'Branch', [branch.city, branch.province].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
  }))
}

export function BrokerPicker(props) {
  return <SelectControl label="Broker" placeholder="Unassigned" {...props} />
}

export function TeamPicker(props) {
  return <SelectControl label="Team" placeholder="No team" {...props} />
}

export function BranchPicker(props) {
  return <SelectControl label="Branch" placeholder="No branch" {...props} />
}
