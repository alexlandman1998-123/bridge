import { ArrowRight, Check, FileText, Landmark, LockKeyhole, Upload } from 'lucide-react'
import Button from '../ui/Button'
import {
  BOND_HYBRID_FINANCE_STAGES,
  buildBondHybridFinanceStageSteps,
  getBondHybridFinanceProgressPercent,
  normalizeBondHybridFinanceStage,
} from '../../core/transactions/bondHybridFinanceWorkflow'

function formatDate(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
}

function findStageDate(workflowData = {}, stageKey = '') {
  const normalizedStage = normalizeBondHybridFinanceStage(stageKey)
  const events = Array.isArray(workflowData?.events) ? workflowData.events : []
  const event = events
    .filter((item) => normalizeBondHybridFinanceStage(item?.toStage || item?.to_stage) === normalizedStage)
    .sort((left, right) => new Date(right?.createdAt || right?.created_at || 0).getTime() - new Date(left?.createdAt || left?.created_at || 0).getTime())[0]
  if (event?.createdAt || event?.created_at) return event.createdAt || event.created_at

  if (normalizedStage === 'submitted_to_banks') {
    return (workflowData?.applications || []).map((item) => item.submittedAt || item.submitted_at || item.createdAt || item.created_at).filter(Boolean).sort()[0] || ''
  }
  if (normalizedStage === 'bank_review') {
    return (workflowData?.applications || []).map((item) => item.feedbackReceivedAt || item.feedback_received_at || item.updatedAt || item.updated_at).filter(Boolean).sort()[0] || ''
  }
  if (normalizedStage === 'quote_received') {
    return (workflowData?.quotes || workflowData?.offers || []).map((item) => item.quoteReceivedAt || item.quote_received_at || item.createdAt || item.created_at).filter(Boolean).sort()[0] || ''
  }
  if (normalizedStage === 'quote_accepted') {
    const accepted = workflowData?.acceptedOffer || (workflowData?.quotes || []).find((item) => ['accepted', 'approved_by_buyer'].includes(String(item?.quoteStatus || item?.quote_status || '').toLowerCase()))
    return accepted?.decisionAt || accepted?.approvedAt || accepted?.approved_at || ''
  }
  if (normalizedStage === 'bond_approved') {
    const accepted = workflowData?.acceptedOffer || (workflowData?.quotes || []).find((item) => ['accepted', 'approved_by_buyer'].includes(String(item?.quoteStatus || item?.quote_status || '').toLowerCase()))
    return accepted?.decisionAt || accepted?.approvedAt || accepted?.approved_at || ''
  }
  if (normalizedStage === 'grant_received') {
    return workflowData?.instruction?.grantReceivedAt || workflowData?.instruction?.grant_received_at || ''
  }
  if (normalizedStage === 'grant_signed') {
    return workflowData?.instruction?.grantSignedAt || workflowData?.instruction?.grant_signed_at || ''
  }
  if (normalizedStage === 'grant_submitted') {
    return workflowData?.instruction?.grantSubmittedAt || workflowData?.instruction?.grant_submitted_at || ''
  }
  if (normalizedStage === 'instruction_sent') {
    return workflowData?.instruction?.instructionSentAt || workflowData?.instruction?.instruction_sent_at || ''
  }
  if (normalizedStage === 'complete') {
    return workflowData?.workflow?.completedAt || workflowData?.workflow?.completed_at || ''
  }
  return workflowData?.workflow?.createdAt || workflowData?.workflow?.created_at || ''
}

function stageIcon(status) {
  if (status === 'completed') return Check
  if (status === 'current') return Landmark
  return LockKeyhole
}

function canEditStage({ mode, viewerRole }) {
  const role = String(viewerRole || '').trim().toLowerCase()
  return mode === 'editable' && ['bond_originator', 'internal_admin', 'admin'].includes(role)
}

const STEP_NAVIGATION_ACTIONS = {
  documents: { target: 'documents', label: 'Open Documents', icon: FileText },
  submitted_to_banks: { target: 'quotes_grant', label: 'Open Quotes & Grant', icon: Upload },
  bank_review: { target: 'quotes_grant', label: 'Open Quotes & Grant', icon: Upload },
  quote_received: { target: 'quotes_grant', label: 'Open Quotes & Grant', icon: Upload },
  quote_accepted: { target: 'quotes_grant', label: 'Open Quotes & Grant', icon: Upload },
  bond_approved: { target: 'quotes_grant', label: 'Open Quotes & Grant', icon: Upload },
  grant_received: { target: 'quotes_grant', label: 'Open Quotes & Grant', icon: Upload },
  grant_signed: { target: 'quotes_grant', label: 'Open Quotes & Grant', icon: Upload },
  grant_submitted: { target: 'quotes_grant', label: 'Open Quotes & Grant', icon: Upload },
}

function getNextStageKey(stageKey = '') {
  const index = BOND_HYBRID_FINANCE_STAGES.indexOf(normalizeBondHybridFinanceStage(stageKey))
  if (index < 0) return BOND_HYBRID_FINANCE_STAGES[0]
  return BOND_HYBRID_FINANCE_STAGES[Math.min(index + 1, BOND_HYBRID_FINANCE_STAGES.length - 1)]
}

function FinanceProgressBar({
  workflowData = null,
  mode = 'readonly',
  viewerRole = '',
  loadingStage = '',
  onStageChange,
  onStepNavigate,
  title = 'Bond Application Progress',
  description = '',
  className = '',
}) {
  const workflow = workflowData?.workflow || workflowData || null
  const steps = buildBondHybridFinanceStageSteps(workflowData || {})
  const currentStage = normalizeBondHybridFinanceStage(workflow?.currentStage || workflow?.current_stage)
  const currentIndex = Math.max(0, BOND_HYBRID_FINANCE_STAGES.indexOf(currentStage))
  const progress = getBondHybridFinanceProgressPercent(currentStage, workflow?.status || 'active')
  const editable = canEditStage({ mode, viewerRole })

  return (
    <section className={`rounded-[18px] border border-[#dfe7f1] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.045)] ${className}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-[-0.02em] text-[#101b2d]">{title}</h3>
          {description ? <p className="mt-1 text-sm text-[#66758b]">{description}</p> : null}
        </div>
        <strong className="text-sm font-semibold text-[#0b57d0]">{progress}% Complete</strong>
      </div>

      <div className="mt-7 overflow-x-auto pb-2">
        <div className="relative" style={{ minWidth: `${Math.max(860, steps.length * 118)}px` }}>
          <div className="absolute left-4 right-4 top-[18px] h-px bg-[#cfd9e6]" />
          <div
            className="absolute left-4 top-[18px] h-[3px] rounded-full bg-[#155eef]"
            style={{ width: progress <= 0 ? 0 : `calc(${Math.max(progress, 0)}% - 2rem)` }}
          />
          <div className="relative grid gap-4" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
            {steps.map((step, index) => {
              const Icon = stageIcon(step.status)
              const isCurrent = step.status === 'current'
              const isCompleted = step.status === 'completed'
              const stageDate = formatDate(findStageDate(workflowData || {}, step.key))
              const navigationAction = STEP_NAVIGATION_ACTIONS[step.key] || null
              const canActOnStep = editable && step.status === 'current'
              const actionDisabled = Boolean(loadingStage)
              const StepActionIcon = navigationAction?.icon || ArrowRight
              const handleStepAction = () => {
                if (!canActOnStep || actionDisabled) return
                if (navigationAction) {
                  onStepNavigate?.(navigationAction.target, step)
                  return
                }
                onStageChange?.(getNextStageKey(step.key), step)
              }
              return (
                <div key={step.key} className="min-w-0 text-center">
                  <span
                    className={[
                      'mx-auto inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white shadow-[0_4px_10px_rgba(15,23,42,0.08)]',
                      isCompleted
                        ? 'border-[#0f9f68] bg-[#0f9f68] text-white'
                        : isCurrent
                          ? 'border-[#155eef] bg-[#155eef] text-white'
                          : 'border-[#d8e2ef] text-[#728198]',
                    ].join(' ')}
                  >
                    <Icon size={16} />
                  </span>
                  <span className={`mt-3 block text-xs font-semibold ${isCurrent ? 'text-[#155eef]' : isCompleted ? 'text-[#101b2d]' : 'text-[#66758b]'}`}>
                    {step.label}
                  </span>
                  <span className={`mt-1 block text-[0.72rem] ${isCurrent ? 'font-semibold text-[#155eef]' : 'text-[#728198]'}`}>
                    {isCurrent ? 'In Progress' : stageDate || (index > currentIndex ? 'Pending' : '')}
                  </span>
                  {editable ? (
                    <div className="mt-3 flex justify-center">
                      {isCompleted ? (
                        <span className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-[#bfead8] bg-[#effaf5] px-3 text-[0.7rem] font-semibold text-[#0f7a52]">
                          <Check size={13} />
                          Completed
                        </span>
                      ) : canActOnStep ? (
                        <Button
                          type="button"
                          size="sm"
                          variant={navigationAction ? 'secondary' : 'primary'}
                          disabled={actionDisabled}
                          className="h-8 rounded-full px-3 text-[0.7rem]"
                          onClick={handleStepAction}
                        >
                          <StepActionIcon size={13} />
                          {loadingStage === getNextStageKey(step.key) || loadingStage === step.key
                            ? 'Updating...'
                            : navigationAction?.label || (step.key === 'instruction_sent' ? 'Complete Workflow' : 'Complete Step')}
                        </Button>
                      ) : (
                        <span className="inline-flex h-8 items-center justify-center rounded-full border border-[#d8e2ef] bg-white px-3 text-[0.7rem] font-semibold text-[#728198]">
                          Pending
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#edf2f7]">
        <div className="h-full rounded-full bg-[#155eef]" style={{ width: `${progress}%` }} />
      </div>

    </section>
  )
}

export default FinanceProgressBar
