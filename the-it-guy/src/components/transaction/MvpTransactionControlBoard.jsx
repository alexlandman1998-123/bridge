const GATE_STYLES = {
  clear: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  blocked: 'border-amber-200 bg-amber-50 text-amber-900',
}

const HEALTH_TONES = {
  clear: 'bg-emerald-100 text-emerald-800',
  attention: 'bg-amber-100 text-amber-900',
  blocked: 'bg-rose-100 text-rose-800',
}

const RELATIONSHIP_TONES = {
  action_required: 'border-amber-200 bg-amber-50 text-amber-900',
  link_not_confirmed: 'border-rose-200 bg-rose-50 text-rose-900',
  monitoring: 'border-sky-200 bg-sky-50 text-sky-900',
  waiting: 'border-slate-200 bg-slate-50 text-slate-800',
  no_action_required: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  action_required_if_requested: 'border-slate-200 bg-slate-50 text-slate-800',
}

/** A reusable, role-neutral snapshot for every transaction workspace. */
export default function MvpTransactionControlBoard({ controlBoard = null, compact = false }) {
  if (!controlBoard) return null
  const gates = Array.isArray(controlBoard.gates) ? controlBoard.gates : []
  const blockers = Array.isArray(controlBoard.blockers) ? controlBoard.blockers : []
  const health = controlBoard.health || null
  const audit = controlBoard.audit || null
  const relationshipHealth = controlBoard.relationshipHealth || null
  const attention = Array.isArray(health?.attention) ? health.attention : blockers.slice(0, 3)
  const status = health?.status || {
    label: String(controlBoard.status || 'incomplete').replaceAll('_', ' '),
    tone: controlBoard.status === 'ready' ? 'clear' : 'attention',
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Transaction control board">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Transaction health</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{health?.stage?.label || controlBoard.stage?.label || 'Transaction status'}</h2>
          {(health?.nextAction || controlBoard.nextAction)?.label ? <p className="mt-1 text-sm text-slate-600">Next: {(health?.nextAction || controlBoard.nextAction).label}</p> : null}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${HEALTH_TONES[status.tone] || HEALTH_TONES.attention}`}>
          {status.label}
        </span>
      </div>

      {health?.testData?.isTestData ? (
        <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900">
          {health.testData.marker || 'TEST — DO NOT ACTION'} — external notifications are suppressed.
        </p>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {gates.map((gate) => (
          <div key={gate.key} className={`rounded-xl border px-3 py-2 text-sm ${gate.satisfied ? GATE_STYLES.clear : GATE_STYLES.blocked}`}>
            <p className="font-medium">{gate.label}</p>
            <p className="mt-0.5 text-xs">{gate.satisfied ? 'Clear' : `${gate.blockers?.length || 0} blocker${gate.blockers?.length === 1 ? '' : 's'}`}</p>
          </div>
        ))}
      </div>

      {health ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3 text-sm">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"><span className="text-slate-500">Participants</span><strong className="ml-2 text-slate-900">{health.summary.participantsAssigned}/{health.summary.participantsRequired || 0}</strong></div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"><span className="text-slate-500">Documents</span><strong className="ml-2 text-slate-900">{health.summary.documentsComplete}/{health.summary.documentsRequired || 0}</strong></div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"><span className="text-slate-500">Attention</span><strong className="ml-2 text-slate-900">{health.summary.attentionCount}</strong></div>
        </div>
      ) : null}

      {health?.creation?.acceptedOfferId || health?.notifications?.total ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 text-xs">
          {health?.creation?.acceptedOfferId ? <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-slate-700">Conversion: <strong className="text-slate-900">{health.creation.confirmed ? 'confirmed' : 'needs verification'}</strong></div> : null}
          {health?.notifications?.total ? <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-slate-700">Notifications: <strong className="text-slate-900">{health.notifications.failed ? `${health.notifications.failed} failed` : health.notifications.reviewRequired ? 'review required' : 'clear'}</strong></div> : null}
        </div>
      ) : null}

      {audit?.actions?.length ? (
        <p className="mt-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Recovery:</span> {audit.actions[0].label}
          {audit.actions.length > 1 ? ` · ${audit.actions.length - 1} more option${audit.actions.length === 2 ? '' : 's'}` : ''}
        </p>
      ) : null}

      {!compact && relationshipHealth?.roles?.length ? (
        <div className="mt-4 border-t border-slate-100 pt-4" aria-label="Agent buyer seller relationship health">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Party handoff</p>
              <p className="mt-1 text-sm font-medium text-slate-900">Agent, buyer and seller responsibilities</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${relationshipHealth.status === 'clear' ? HEALTH_TONES.clear : HEALTH_TONES.attention}`}>
              {relationshipHealth.statusLabel}
            </span>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            {relationshipHealth.roles.map((role) => (
              <div key={role.role} className={`rounded-xl border px-3 py-3 text-sm ${RELATIONSHIP_TONES[role.state] || RELATIONSHIP_TONES.waiting}`}>
                <div className="flex items-center justify-between gap-2">
                  <strong>{role.label}</strong>
                  <span className="text-xs font-medium">{role.connectionLabel}</span>
                </div>
                <p className="mt-1 text-xs font-semibold">{role.stateLabel}</p>
                <p className="mt-1 text-xs leading-5 opacity-90">{role.nextAction}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!compact && attention.length ? (
        <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm text-slate-700">
          {attention.slice(0, 3).map((item) => <li key={item.key} className="flex gap-2"><span className="font-semibold text-slate-900">{item.ownerRole || 'Owner'}:</span><span>{item.reason || item.label}</span></li>)}
        </ul>
      ) : null}
    </section>
  )
}
