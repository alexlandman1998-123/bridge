import { CheckCircle2, ChevronDown, ChevronRight, Circle, Clock3, MessageSquare } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import ProgressTimeline from './ProgressTimeline'
import { MAIN_PROCESS_STAGES, MAIN_STAGE_LABELS } from '../lib/stages'
import { buildTransactionStageProgressModel } from '../core/transactions/stageProgressEngine'

const SALES_STAGES = ['AVAIL', 'DEPOSIT', 'OTP']
const TRANSFER_STAGES = ['FIN', 'TRANSFER_PREP', 'TRANSFER', 'REGISTERED']

function normalizeMainStage(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
}

function getStageState(stages, currentStage, candidate) {
  const currentIndex = stages.indexOf(currentStage)
  const candidateIndex = stages.indexOf(candidate)

  if (candidateIndex === -1 || currentIndex === -1) {
    return 'future'
  }

  if (candidateIndex < currentIndex) {
    return 'complete'
  }

  if (candidateIndex === currentIndex) {
    return 'current'
  }

  return 'future'
}

function mapStepStatus(status) {
  if (!status) {
    return 'pending'
  }

  const normalized = status.toLowerCase()

  if (normalized === 'completed') {
    return 'complete'
  }

  if (['in_progress', 'active'].includes(normalized)) {
    return 'current'
  }

  return 'pending'
}

function buildMainStageSteps({ stages, stageLabelMap, normalizedMainStage }) {
  return (stages || []).map((stage) => {
    const state = getStageState(stages, normalizedMainStage, stage)
    return {
      id: `main-${stage}`,
      label: stageLabelMap?.[stage] || stage,
      description: state === 'complete' ? 'Stage complete' : state === 'current' ? 'Currently active' : 'Upcoming milestone',
      status: state,
    }
  })
}

function buildSubprocessSteps(process = null) {
  return (process?.steps || []).map((step) => ({
    id: `${process.process_type}-${step.id || step.step_key}-${step.step_label}`,
    label: step.step_label,
    description: step.step_status_label || step.status || 'Pending',
    status: mapStepStatus(step.status),
    lane: process.process_type === 'finance' ? 'Finance' : 'Transfer',
  }))
}

function buildWorkflowGroups({ stages, stageLabelMap, normalizedMainStage, subprocesses }) {
  const mainSteps = buildMainStageSteps({ stages, stageLabelMap, normalizedMainStage })
  const financeProcess = (subprocesses || []).find((process) => process?.process_type === 'finance')
  const attorneyProcess = (subprocesses || []).find((process) => process?.process_type === 'attorney')

  return [
    {
      id: 'sales',
      label: 'Sales Workflow',
      copy: 'From released stock through signed OTP.',
      steps: mainSteps.filter((step) => SALES_STAGES.includes(step.id.replace('main-', ''))),
    },
    {
      id: 'finance',
      label: 'Finance',
      copy: 'Bond and affordability workflow items.',
      steps: buildSubprocessSteps(financeProcess),
    },
    {
      id: 'transfer',
      label: 'Transfer',
      copy: 'Transfer preparation, attorney workflow, and registration.',
      steps: [
        ...mainSteps.filter((step) => TRANSFER_STAGES.includes(step.id.replace('main-', ''))),
        ...buildSubprocessSteps(attorneyProcess),
      ],
    },
  ].map((group) => ({
    ...group,
    status: group.steps.some((step) => step.status === 'current')
      ? 'current'
      : group.steps.length && group.steps.every((step) => step.status === 'complete')
        ? 'complete'
        : 'pending',
  }))
}

function getInitialExpandedGroups(groups) {
  const currentGroup = groups.find((group) => group.status === 'current')
  return {
    sales: currentGroup ? currentGroup.id === 'sales' : true,
    finance: currentGroup ? currentGroup.id === 'finance' : false,
    transfer: currentGroup ? currentGroup.id === 'transfer' : false,
  }
}

function buildLegacyWorkflowSteps({ subprocesses }) {
  return (subprocesses || [])
    .flatMap((process) =>
      (process?.steps || []).map((step) => ({
        id: `${process.process_type}-${step.id || step.step_key}-${step.step_label}`,
        label: `${process.process_type === 'finance' ? 'Finance' : 'Attorney'} • ${step.step_label}`,
        description: step.step_status_label || step.status || 'Pending',
        status: mapStepStatus(step.status),
      })),
    )
}

function summarizeWorkflowGroup(group) {
  const total = group.steps.length
  const completed = group.steps.filter((step) => step.status === 'complete').length
  const current = group.steps.find((step) => step.status === 'current')
  const pending = group.steps.find((step) => step.status === 'pending')

  return {
    total,
    completed,
    nextAction: current?.label || pending?.label || 'No pending actions',
  }
}

function getCurrentStageHelper(model) {
  const blockers = model?.currentStageBlockers || []
  if (!blockers.length) {
    return `${model?.mainStageLabel || 'Current stage'} is moving with no active blockers.`
  }

  return `${model?.mainStageLabel || 'Current stage'} blockers: ${blockers.slice(0, 2).join(' • ')}`
}

function TransactionProgressPanel({
  mode = 'detailed',
  variant = 'internal',
  title = 'Transaction Progress',
  subtitle = 'The roadmap for every workflow tied to this transaction.',
  mainStage,
  stages = MAIN_PROCESS_STAGES,
  stageLabelMap = MAIN_STAGE_LABELS,
  subprocesses = [],
  comments = [],
  progressModel = null,
  progressContext = null,
  canEditMainStage = false,
  onStageClick = null,
  onOpenWorkflowGroup = null,
}) {
  const normalizedMainStage = normalizeMainStage(mainStage || stages[0] || 'AVAIL')
  const computedProgressModel = useMemo(
    () =>
      progressModel ||
      buildTransactionStageProgressModel({
        mainStage: normalizedMainStage,
        subprocesses,
        comments,
        ...(progressContext || {}),
      }),
    [comments, normalizedMainStage, progressContext, progressModel, subprocesses],
  )
  const workflowGroups = buildWorkflowGroups({ stages, stageLabelMap, normalizedMainStage, subprocesses })
  const [expandedGroups, setExpandedGroups] = useState(() => getInitialExpandedGroups(workflowGroups))
  const recentComments = (comments || []).slice(0, variant === 'external' ? 3 : 6)

  useEffect(() => {
    setExpandedGroups(getInitialExpandedGroups(workflowGroups))
  }, [normalizedMainStage, subprocesses])

  function badgeClasses(status) {
    if (status === 'complete') {
      return 'border-[#d7ebdf] bg-[#ecfbf1] text-[#1c7d45]'
    }
    if (status === 'current') {
      return 'border-[#d9e5f2] bg-[#eef5fb] text-[#35546c]'
    }

    return 'border-[#e3ebf4] bg-[#f7f9fc] text-[#94a7bd]'
  }

  function iconForStatus(status) {
    if (status === 'complete') {
      return <CheckCircle2 size={16} />
    }
    if (status === 'current') {
      return <Clock3 size={16} />
    }

    return <Circle size={16} />
  }

  function toggleGroup(groupId) {
    setExpandedGroups((previous) => ({
      ...previous,
      [groupId]: !previous[groupId],
    }))
  }

  if (mode === 'workspace_summary') {
    return (
      <section className="space-y-5 rounded-[28px] border border-[#e5e7eb] bg-[#f8fafc] p-6 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
        <div>
          <h3 className="text-[1.22rem] font-semibold tracking-[-0.03em] text-[#142132]">{title}</h3>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#6b7d93]">{subtitle}</p>
        </div>

        <section className="rounded-[22px] border border-[#e5e7eb] bg-[#f7f8fa] p-5">
          <div className="rounded-[18px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
            <ProgressTimeline
              currentStage={normalizedMainStage}
              stages={stages}
              stageLabelMap={stageLabelMap}
              framed={false}
              progressPercent={computedProgressModel?.totalProgressPercent}
              blockersByStage={computedProgressModel?.stepBlockersByStage}
              helperText={getCurrentStageHelper(computedProgressModel)}
              lastUpdatedLabel={computedProgressModel?.latestUpdatedLabel || ''}
              onStageClick={canEditMainStage ? onStageClick : null}
              isStageSelectable={(stageOption) =>
                stageOption !== normalizedMainStage &&
                (computedProgressModel?.canMoveTo?.(stageOption) ?? true)
              }
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e7eb] pt-4">
              <p className="text-sm text-[#4b5563]">
                {canEditMainStage ? 'Click a stage node to move the transaction after validation.' : 'Main stage is visible only for this role.'}
              </p>
              {computedProgressModel?.isAtRisk ? (
                <span className="inline-flex items-center rounded-full border border-[#f2d3d1] bg-[#fcf2f1] px-3 py-1 text-[0.72rem] font-semibold text-[#b54745]">
                  At risk
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-[#e3ebf4] bg-[#f8faff] p-5">
          <header className="mb-4">
            <h4 className="text-base font-semibold text-[#142132]">Workflow Summaries</h4>
            <p className="mt-1 text-sm text-[#6b7d93]">View status and next actions here. Open the workflow section to edit any step.</p>
          </header>
          <div className="grid gap-4 lg:grid-cols-3">
            {workflowGroups.map((group) => {
              const summary = summarizeWorkflowGroup(group)

              return (
                <article key={group.id} className="rounded-[18px] border border-[#e3ebf4] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h5 className="text-sm font-semibold text-[#142132]">{group.label}</h5>
                      <p className="mt-1 text-sm text-[#6b7d93]">{group.copy}</p>
                    </div>
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${badgeClasses(group.status)}`}>
                      {iconForStatus(group.status)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2">
                    <div className="flex items-center justify-between rounded-[12px] border border-[#e7edf6] bg-[#fbfcfe] px-3 py-2 text-sm">
                      <span className="text-[#6f8399]">Completion</span>
                      <strong className="text-[#1d3146]">{summary.completed}/{summary.total}</strong>
                    </div>
                    <div className="rounded-[12px] border border-[#e7edf6] bg-[#fbfcfe] px-3 py-2 text-sm">
                      <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#8ca0b6]">Next Action</span>
                      <strong className="mt-1 block text-[#1d3146]">{summary.nextAction}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mt-4 inline-flex min-h-[36px] items-center justify-center rounded-[12px] border border-[#d7e3ef] bg-white px-3 py-1.5 text-sm font-semibold text-[#35546c] transition duration-150 ease-out hover:bg-[#f7f9fc]"
                    onClick={() => onOpenWorkflowGroup?.(group.id)}
                  >
                    Open For Updates
                  </button>
                </article>
              )
            })}
          </div>
        </section>
      </section>
    )
  }

  return (
    <section className="space-y-5 rounded-[28px] border border-[#dbe5ef] bg-white/80 p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-[1.22rem] font-semibold tracking-[-0.03em] text-[#142132]">{title}</h3>
          <p className="mt-1.5 text-sm leading-6 text-[#6b7d93] max-w-3xl">{subtitle}</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
        <section className="rounded-[22px] border border-[#e3ebf4] bg-[#f8faff] p-5">
          <header className="mb-4">
            <h4 className="text-base font-semibold text-[#142132]">Workflow Groups</h4>
            <p className="mt-1 text-sm text-[#6b7d93]">Collapse or expand each major process to inspect its sub-workflows.</p>
          </header>
          <div className="space-y-3">
            {workflowGroups.map((group) => {
              const isExpanded = Boolean(expandedGroups[group.id])

              return (
                <article key={group.id} className="overflow-hidden rounded-[18px] border border-[#e7edf6] bg-white">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="flex w-full items-start gap-4 px-4 py-4 text-left transition hover:bg-[#fbfdff]"
                  >
                    <span
                      className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${badgeClasses(group.status)}`}
                    >
                      {iconForStatus(group.status)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <strong className="text-sm font-semibold text-[#142132]">{group.label}</strong>
                          <p className="mt-1 text-sm text-[#6b7d93]">{group.copy}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="rounded-full border border-[#e3ebf4] bg-[#f7f9fc] px-3 py-1 text-[0.76rem] font-semibold text-[#6c7e95]">
                            {group.steps.length} items
                          </span>
                          <span className="text-[#7c8ea4]">
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="border-t border-[#edf0fa] px-4 py-4">
                      <div className="space-y-3">
                        {group.steps.length ? (
                          group.steps.map((step) => (
                            <article key={step.id} className="flex items-start gap-3 rounded-[16px] border border-[#edf0fa] bg-[#fbfcfe] px-4 py-3">
                              <span
                                className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${badgeClasses(step.status)}`}
                              >
                                {iconForStatus(step.status)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <strong className="text-sm font-semibold text-[#142132]">{step.label}</strong>
                                  {step.lane ? (
                                    <span className="rounded-full bg-[#eef4fb] px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#5f7894]">
                                      {step.lane}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[#94a7bd]">
                                  {step.status === 'current' ? 'In progress' : step.status === 'complete' ? 'Complete' : 'Pending'}
                                </p>
                                <p className="mt-1 text-sm text-[#6b7d93]">{step.description}</p>
                              </div>
                            </article>
                          ))
                        ) : (
                          <p className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-4 py-4 text-sm text-[#6b7d93]">
                            No workflow items are configured in this section yet.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        </section>

        <section className="rounded-[22px] border border-[#e3ebf4] bg-white p-5">
          <header className="mb-4">
            <h4 className="text-base font-semibold text-[#142132]">Latest Comments</h4>
            <p className="mt-1 text-sm text-[#6b7d93]">Recent shared updates across the transaction workspace.</p>
          </header>
          <div className="space-y-3">
            {recentComments.length ? (
              recentComments.map((comment) => {
                const body = comment.commentBody || comment.commentText || 'No detail provided.'
                const typeLabel = comment.discussionType || 'update'
                return (
                  <article key={comment.id} className="rounded-[16px] border border-[#edf0fa] bg-[#f7f8fb] px-4 py-3">
                    <header className="mb-2 flex flex-wrap items-start gap-3">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#e7edf6] text-[#35546c]">
                        <MessageSquare size={16} />
                      </span>
                      <div className="min-w-0">
                        <strong className="block text-sm font-semibold text-[#142132]">{comment.authorName || 'Participant'}</strong>
                        <span className="text-xs text-[#7c8ea4]">{comment.authorRoleLabel || comment.authorRole || 'Participant'}</span>
                      </div>
                      <span className="ml-auto text-xs uppercase tracking-[0.08em] text-[#94a7bd]">{typeLabel}</span>
                    </header>
                    <p className="text-sm leading-6 text-[#22384c]">{body}</p>
                    <div className="mt-2 text-xs text-[#7c8ea4]">{comment.createdAt ? new Date(comment.createdAt).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent'}</div>
                  </article>
                )
              })
            ) : (
              <p className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-4 py-4 text-sm text-[#6b7d93]">
                No comments or updates posted yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </section>
  )
}

export default TransactionProgressPanel
