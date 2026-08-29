import { Plus, UserRound } from 'lucide-react'

function displayName(party = {}) {
  return String(party.displayName || party.name || party.legalName || 'Unnamed party').trim()
}

/** Presentation-only selector. Its parent supplies canonical CRM search/create actions. */
export function RentalPartySelector({
  label = 'Party', role = '', parties = [], value = '', onSelect, onCreate, disabled = false,
}) {
  const options = Array.isArray(parties) ? parties : []
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700" htmlFor={`rental-party-${role || 'selector'}`}>{label}</label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <select
            id={`rental-party-${role || 'selector'}`}
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 disabled:bg-slate-100"
            value={value}
            disabled={disabled}
            onChange={(event) => onSelect?.(event.target.value)}
          >
            <option value="">Select existing CRM record</option>
            {options.map((party) => <option key={party.id} value={party.id}>{displayName(party)}</option>)}
          </select>
        </div>
        <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={disabled || typeof onCreate !== 'function'} onClick={() => onCreate?.({ role })}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New
        </button>
      </div>
      <p className="text-xs text-slate-500">Select or create a canonical CRM record; Rentals only stores the typed relationship.</p>
    </div>
  )
}
