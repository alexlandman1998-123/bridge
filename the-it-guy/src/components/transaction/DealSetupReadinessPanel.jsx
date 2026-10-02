import { useMemo } from 'react'
import { getPrimaryDealSetupBuyer, resolveDealSetupFinanceType, dealSetupFinanceLabel, validateDealSetupCommercialTerms, validateDealSetupFunding } from '../../core/transactions/dealSetupContract.js'

const completeStep = (complete, label, detail) => ({ complete, label, detail })

export default function DealSetupReadinessPanel({ setup, hasUnsavedChanges = false }) {
  const steps = useMemo(() => {
    const basics = validateDealSetupCommercialTerms(setup?.terms)
    const funding = validateDealSetupFunding(setup || {})
    const primaryBuyer = getPrimaryDealSetupBuyer(setup?.buyers)
    const financeType = resolveDealSetupFinanceType(setup?.finance?.type)
    return [
      completeStep(basics.valid && !hasUnsavedChanges, 'Deal basics', hasUnsavedChanges ? 'Save commercial terms' : basics.valid ? 'Commercial terms captured' : basics.issues[0]),
      completeStep(Boolean(primaryBuyer) && !setup?.buyerLinkIssues?.length, 'Buyers', setup?.buyerLinkIssues?.length ? 'Buyer links need review' : primaryBuyer ? 'Primary buyer assigned' : 'Assign primary buyer'),
      completeStep(funding.valid && !hasUnsavedChanges, 'Funding', hasUnsavedChanges ? 'Save funding details' : funding.valid ? `${dealSetupFinanceLabel(financeType)} funding reconciled` : funding.issues[0]),
    ]
  }, [setup, hasUnsavedChanges])
  const completeCount = steps.filter((step) => step.complete).length

  return <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-textMuted">Deal Setup progress</p><h2 className="mt-1 text-lg font-semibold text-textStrong">{completeCount} of {steps.length} setup steps complete</h2><p className="mt-1 text-sm text-textMuted">Complete the setup steps below. Imported details are verified separately in Review details; document completion is tracked in the Documents tab.</p></div>{hasUnsavedChanges ? <span className="rounded-full bg-warningSoft px-3 py-1 text-xs font-semibold text-warning">Unsaved changes</span> : null}</div>
    {hasUnsavedChanges ? <p className="mt-3 rounded-control bg-warningSoft px-3 py-2 text-sm text-warning">Save Deal Setup to refresh the stored checklist and document requirements.</p> : null}
    <ol className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{steps.map((step, index) => <li key={step.label} className={`rounded-control border p-3 ${step.complete ? 'border-success/20 bg-successSoft' : 'border-borderSoft bg-surfaceAlt'}`}><div className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step.complete ? 'bg-success text-white' : 'bg-surface text-textMuted'}`}>{step.complete ? '✓' : index + 1}</span><strong className="text-sm text-textStrong">{step.label}</strong></div><p className="mt-2 text-xs text-textMuted">{step.detail}</p></li>)}</ol>
  </section>
}
