import { CheckCircle2, Circle, Clock3, Lock } from 'lucide-react'

const STATUS_META = {
  completed: {
    icon: CheckCircle2,
    label: 'Completed',
    tone: 'text-[#1c7d45] bg-[#edfdf3] border-[#d6ece0]',
  },
  current: {
    icon: Clock3,
    label: 'In Progress',
    tone: 'text-[#35546c] bg-[#eef5fb] border-[#d6e5f4]',
  },
  upcoming: {
    icon: Circle,
    label: 'Upcoming',
    tone: 'text-[#6b7d93] bg-[#f7f9fc] border-[#dde4ee]',
  },
  locked: {
    icon: Lock,
    label: 'Locked',
    tone: 'text-[#7c8ea4] bg-[#f7f9fc] border-[#dde4ee]',
  },
}

function ActionButton({ action }) {
  const variant = action?.variant || 'secondary'
  const className =
    variant === 'primary'
      ? 'border-transparent bg-[#35546c] text-white hover:bg-[#2f495f]'
      : 'border-[#dde4ee] bg-white text-[#35546c] hover:bg-[#f8fafc]'

  return (
    <button
      type="button"
      className={`inline-flex min-h-[40px] items-center justify-center rounded-[12px] border px-4 py-2 text-sm font-semibold transition duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      onClick={action?.onClick}
      disabled={Boolean(action?.disabled)}
    >
      {action?.label || 'Action'}
    </button>
  )
}

function SalesWorkflowLane({
  snapshot = null,
  canEdit = false,
  roleLabel = 'Current role',
  actions = [],
  helperText = '',
}) {
  if (!snapshot) {
    return null
  }

  return (
    <section className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      <header className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Sales Workflow</h3>
          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
            Controlled handoff from onboarding through OTP and supporting documentation.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">
          {snapshot.readyForFinance ? 'Finance unlocked' : 'Finance locked'}
        </span>
      </header>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {(snapshot.stages || []).map((stage) => {
          const statusKey = STATUS_META[stage.status] ? stage.status : 'upcoming'
          const statusMeta = STATUS_META[statusKey]
          const StatusIcon = statusMeta.icon
          return (
            <article key={stage.key} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${statusMeta.tone}`}>
                      <StatusIcon size={13} />
                    </span>
                    <strong className="text-sm font-semibold text-[#142132]">{stage.label}</strong>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#6b7d93]">{stage.description}</p>
                  {stage.blocker && stage.status !== 'completed' ? (
                    <p className="mt-2 text-xs font-medium text-[#b54708]">{stage.blocker}</p>
                  ) : null}
                </div>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] ${statusMeta.tone}`}>
                  {statusMeta.label}
                </span>
              </div>
            </article>
          )
        })}
      </div>

      <footer className="mt-4 border-t border-[#e8eef5] pt-4">
        {!canEdit ? (
          <p className="text-sm text-[#6b7d93]">{roleLabel} can view Sales Workflow only.</p>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {actions.map((action) => (
              <ActionButton key={action.id} action={action} />
            ))}
          </div>
        )}
        {helperText ? <p className="mt-2 text-right text-xs text-[#7c8ea4]">{helperText}</p> : null}
      </footer>
    </section>
  )
}

export default SalesWorkflowLane
