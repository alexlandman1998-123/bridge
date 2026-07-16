import { BellRing, CheckCircle2, FileCheck2, SearchCheck } from 'lucide-react'
import { useState } from 'react'
import { FollowUpResolutionPanel } from './FollowUpResolutionPanel'
import { OperationalAssurancePanel } from './OperationalAssurancePanel'
import { ReviewFollowUpPanel } from './ReviewFollowUpPanel'

const STAGE_PRESENTATION = Object.freeze({
  audit: { label: 'Audit', description: 'Check current evidence', Icon: SearchCheck },
  notify: { label: 'Notify', description: 'Direct human follow-up', Icon: BellRing },
  resolve: { label: 'Resolve', description: 'Prove the finding cleared', Icon: FileCheck2 },
})

function initialStage(followUp, resolution) {
  if (resolution?.report) return 'resolve'
  if (followUp?.plan) return 'notify'
  return 'audit'
}

function auditStatus(assurance) {
  if (!assurance?.auditRun) return 'Not run'
  if (assurance.status === 'healthy') return 'Passed'
  if (assurance.status === 'critical') return 'Blocked'
  if (assurance.status === 'incomplete') return 'Incomplete'
  return 'Review required'
}

function notificationStatus(followUp, needsAction) {
  if (followUp?.plan?.dryRun === false) return 'Applied'
  if (followUp?.plan?.dryRun) return 'Ready to review'
  return needsAction ? 'Required' : 'Not required'
}

function resolutionStatus(resolution) {
  const status = resolution?.report?.gate?.status
  if (status === 'pass') return 'Resolved'
  if (status === 'warning') return 'Still open'
  if (status === 'fail') return 'Overdue or missing'
  if (status === 'incomplete') return 'Incomplete'
  return 'Not checked'
}

export function OtpGovernanceJourney({ assurance, followUp, resolution, onRun, onPlan, onApply, onCheck }) {
  const [selectedStage, setSelectedStage] = useState(() => initialStage(followUp, resolution))
  const needsAction = Number(assurance?.summary?.criticalPackets || 0) + Number(assurance?.summary?.warningPackets || 0) > 0
  const stages = [
    { ...STAGE_PRESENTATION.audit, key: 'audit', status: auditStatus(assurance), disabled: false },
    { ...STAGE_PRESENTATION.notify, key: 'notify', status: notificationStatus(followUp, needsAction), disabled: !assurance?.auditRun || (!needsAction && !followUp?.plan) },
    { ...STAGE_PRESENTATION.resolve, key: 'resolve', status: resolutionStatus(resolution), disabled: !assurance?.auditRun },
  ]

  const runAudit = async () => {
    const diagnostics = await onRun()
    const hasFindings = (diagnostics?.records || []).some((record) => record.severity === 'critical' || record.severity === 'warning')
    setSelectedStage(hasFindings ? 'notify' : 'resolve')
    return diagnostics
  }

  const applyPlan = async () => {
    const result = await onApply()
    setSelectedStage('resolve')
    return result
  }

  return (
    <section className="space-y-3" aria-labelledby="otp-governance-journey-title">
      <div className="rounded-[18px] border border-[#dbe5ee] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#7c8ea2]">Governed OTP operations</p>
            <h2 id="otp-governance-journey-title" className="mt-1 text-base font-semibold text-[#142033]">Audit, notify and prove resolution</h2>
          </div>
          <p className="text-xs leading-5 text-[#718397]">One controlled journey · one stage at a time</p>
        </div>

        <nav className="mt-4 grid gap-2 md:grid-cols-3" aria-label="OTP governance stages">
          {stages.map((stage, index) => {
            const StageIcon = stage.Icon
            const selected = selectedStage === stage.key
            return (
              <button
                key={stage.key}
                type="button"
                aria-pressed={selected}
                disabled={stage.disabled}
                onClick={() => setSelectedStage(stage.key)}
                className={`flex min-h-[74px] items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition ${selected ? 'border-[#83b99a] bg-[#f1faf5] shadow-[0_5px_14px_rgba(15,127,79,0.08)]' : 'border-[#dfe7ed] bg-[#fafcfd] hover:border-[#bfd0dc] hover:bg-white'} disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${selected ? 'bg-[#16804d] text-white' : 'border border-[#d8e2e9] bg-white text-[#61778c]'}`}>
                  {selected && stage.status === 'Resolved' ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <StageIcon className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8091a3]">Step {index + 1}</span>
                  <span className="mt-0.5 block text-sm font-semibold text-[#30455b]">{stage.label}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-[#718397]">{stage.status} · {stage.description}</span>
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      {selectedStage === 'audit' ? <OperationalAssurancePanel assurance={assurance} onRun={runAudit} /> : null}
      {selectedStage === 'notify' ? <ReviewFollowUpPanel assurance={assurance} followUp={followUp} onPlan={onPlan} onApply={applyPlan} /> : null}
      {selectedStage === 'resolve' ? <FollowUpResolutionPanel assurance={assurance} resolution={resolution} onCheck={onCheck} /> : null}
    </section>
  )
}

