import { useEffect, useMemo, useState } from 'react'
import { getDealSetupReadiness } from '../../services/dealSetupService'

const completeStep = (complete, label, detail) => ({ complete, label, detail })

export default function DealSetupReadinessPanel({ transactionId, setup, hasUnsavedChanges = false, refreshToken = 0 }) {
  const [readiness, setReadiness] = useState(null)

  useEffect(() => {
    if (!transactionId) return undefined
    let active = true
    getDealSetupReadiness({ transactionId }).then((result) => active && setReadiness(result)).catch(() => active && setReadiness(null))
    return () => { active = false }
  }, [refreshToken, transactionId])

  const steps = useMemo(() => {
    const purchaserType = String(setup?.terms?.purchaserType || '').trim()
    const primaryBuyer = String(setup?.primaryBuyerId || '').trim()
    const financeType = String(setup?.finance?.type || '').trim()
    const missingDocuments = readiness?.missingRequirementCount || 0
    return [
      completeStep(Boolean(purchaserType), 'Deal basics', purchaserType ? 'Purchaser type selected' : 'Choose purchaser type'),
      completeStep(Boolean(primaryBuyer), 'Buyers', primaryBuyer ? 'Primary buyer assigned' : 'Assign primary buyer'),
      completeStep(Boolean(financeType), 'Funding', financeType ? `${financeType[0].toUpperCase()}${financeType.slice(1)} finance` : 'Choose finance type'),
      completeStep(readiness ? missingDocuments === 0 : false, 'Documents', readiness ? (missingDocuments ? `${missingDocuments} document task${missingDocuments === 1 ? '' : 's'} remaining` : 'All requirements met') : 'Checking requirements'),
    ]
  }, [readiness, setup])
  const completeCount = steps.filter((step) => step.complete).length

  return <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-textMuted">Setup progress</p><h2 className="mt-1 text-lg font-semibold text-textStrong">{completeCount} of {steps.length} steps complete</h2><p className="mt-1 text-sm text-textMuted">Complete the next outstanding step. Documents are managed from the Documents tab.</p></div>{hasUnsavedChanges ? <span className="rounded-full bg-warningSoft px-3 py-1 text-xs font-semibold text-warning">Unsaved changes</span> : null}</div>
    {hasUnsavedChanges ? <p className="mt-3 rounded-control bg-warningSoft px-3 py-2 text-sm text-warning">Save Deal Setup to refresh the stored checklist and document requirements.</p> : null}
    <ol className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">{steps.map((step, index) => <li key={step.label} className={`rounded-control border p-3 ${step.complete ? 'border-success/20 bg-successSoft' : 'border-borderSoft bg-surfaceAlt'}`}><div className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step.complete ? 'bg-success text-white' : 'bg-surface text-textMuted'}`}>{step.complete ? '✓' : index + 1}</span><strong className="text-sm text-textStrong">{step.label}</strong></div><p className="mt-2 text-xs text-textMuted">{step.detail}</p></li>)}</ol>
  </section>
}
