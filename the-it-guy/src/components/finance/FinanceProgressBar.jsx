import { Check, LockKeyhole, Landmark } from 'lucide-react'
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

function FinanceProgressBar({
  workflowData = null,
  mode = 'readonly',
  viewerRole = '',
  loadingStage = '',
  onStageChange,
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
          <h3 className="text-base font-semibold tracking-[-0.02em] text-[#101b2d]">Application Progress</h3>
          <p className="mt-1 text-sm text-[#66758b]">Shared finance workflow status across Bridge.</p>
        </div>
        <strong className="text-sm font-semibold text-[#0b57d0]">{progress}% Complete</strong>
      </div>

      <div className="mt-7 overflow-x-auto pb-2">
        <div className="relative min-w-[860px]">
          <div className="absolute left-4 right-4 top-[18px] h-px bg-[#cfd9e6]" />
          <div
            className="absolute left-4 top-[18px] h-[3px] rounded-full bg-[#155eef]"
            style={{ width: `calc(${Math.max(progress, 0)}% - 2rem)` }}
          />
          <div className="relative grid grid-cols-8 gap-4">
            {steps.map((step, index) => {
              const Icon = stageIcon(step.status)
              const isCurrent = step.status === 'current'
              const isCompleted = step.status === 'completed'
              const stageDate = formatDate(findStageDate(workflowData || {}, step.key))
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
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#edf2f7]">
        <div className="h-full rounded-full bg-[#155eef]" style={{ width: `${progress}%` }} />
      </div>

      {editable ? (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-[#edf2f7] pt-4">
          {steps.map((step, index) => (
            <Button
              key={step.key}
              type="button"
              size="sm"
              variant={index === currentIndex ? 'primary' : 'secondary'}
              disabled={Boolean(loadingStage) || index > currentIndex + 1}
              onClick={() => onStageChange?.(step.key)}
            >
              {loadingStage === step.key ? 'Updating...' : step.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export default FinanceProgressBar
