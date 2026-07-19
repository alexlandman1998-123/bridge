const GATE_STYLES = {
  clear: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  blocked: 'border-amber-200 bg-amber-50 text-amber-900',
}

/** A reusable, role-neutral snapshot for every transaction workspace. */
export default function MvpTransactionControlBoard({ controlBoard = null, compact = false }) {
  if (!controlBoard) return null
  const gates = Array.isArray(controlBoard.gates) ? controlBoard.gates : []
  const blockers = Array.isArray(controlBoard.blockers) ? controlBoard.blockers : []

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Transaction control board">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Transaction control</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{controlBoard.stage?.label || 'Transaction status'}</h2>
          {controlBoard.nextAction?.label ? <p className="mt-1 text-sm text-slate-600">Next: {controlBoard.nextAction.label}</p> : null}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${controlBoard.status === 'ready' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
          {String(controlBoard.status || 'incomplete').replaceAll('_', ' ')}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {gates.map((gate) => (
          <div key={gate.key} className={`rounded-xl border px-3 py-2 text-sm ${gate.satisfied ? GATE_STYLES.clear : GATE_STYLES.blocked}`}>
            <p className="font-medium">{gate.label}</p>
            <p className="mt-0.5 text-xs">{gate.satisfied ? 'Clear' : `${gate.blockers?.length || 0} blocker${gate.blockers?.length === 1 ? '' : 's'}`}</p>
          </div>
        ))}
      </div>

      {!compact && blockers.length ? (
        <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm text-slate-700">
          {blockers.slice(0, 3).map((blocker) => <li key={blocker.key} className="flex gap-2"><span className="font-semibold text-slate-900">{blocker.ownerRole || 'Owner'}:</span><span>{blocker.reason || blocker.label}</span></li>)}
        </ul>
      ) : null}
    </section>
  )
}
