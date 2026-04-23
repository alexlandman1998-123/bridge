import { AlertCircle, CheckCircle2, Circle, Clock3, Lock } from 'lucide-react'

const STATUS_META = {
  completed: {
    icon: CheckCircle2,
    label: 'Completed',
    tone: 'text-[#1c7d45] bg-[#eef9f2] border-[#d4e8da]',
  },
  current: {
    icon: Clock3,
    label: 'In Progress',
    tone: 'text-[#35546c] bg-[#edf4fb] border-[#d5e3f2]',
  },
  upcoming: {
    icon: Circle,
    label: 'Not Ready',
    tone: 'text-[#6b7d93] bg-[#f7f9fc] border-[#dde4ee]',
  },
  locked: {
    icon: Lock,
    label: 'Waiting',
    tone: 'text-[#7c8ea4] bg-[#f7f9fc] border-[#dde4ee]',
  },
  blocked: {
    icon: AlertCircle,
    label: 'Waiting On Action',
    tone: 'text-[#b54708] bg-[#fff7ed] border-[#f6dec7]',
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

function TransferWorkflowLane({
  snapshot = null,
  canEdit = false,
  roleLabel = 'Current role',
  actions = [],
  helperText = '',
}) {
  if (!snapshot) {
    return null
  }
  const totalStages = (snapshot.steps || []).length
  const completedStages = (snapshot.steps || []).filter((step) => step.status === 'completed').length

  return (
    <section className="rounded-[20px] border border-[#e1e8f1] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] md:p-5">
      <header className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Transfer Workflow</h3>
          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
            Attorney-led transfer progression from file opening to registration.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">
            {completedStages}/{totalStages} completed
          </span>
          <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">
            {snapshot.isLocked ? 'Waiting On Finance' : snapshot.registrationConfirmed ? 'Completed' : 'In Progress'}
          </span>
        </div>
      </header>

      <div className="mt-4 grid gap-2.5 xl:grid-cols-2">
        {(snapshot.steps || []).map((stage) => {
          const statusKey = STATUS_META[stage.status] ? stage.status : 'upcoming'
          const statusMeta = STATUS_META[statusKey]
          const StatusIcon = statusMeta.icon
          return (
            <article key={stage.key} className="rounded-[14px] border border-[#e4ebf4] bg-[#fbfcfe] px-3.5 py-3.5">
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
          <p className="text-sm text-[#6b7d93]">{roleLabel} can view Transfer Workflow only.</p>
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

export default TransferWorkflowLane
