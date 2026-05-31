import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, Landmark, Send, Star, UploadCloud } from 'lucide-react'
import {
  BOND_HYBRID_APPLICATION_STATUS_LABELS,
  BOND_HYBRID_APPLICATION_STATUSES,
  BOND_HYBRID_FINANCE_STAGE_LABELS,
  BOND_HYBRID_FINANCE_STAGES,
  buildBondHybridFinanceStageSteps,
  summarizeBondHybridFinanceWorkflow,
} from '../core/transactions/bondHybridFinanceWorkflow'
import Button from './ui/Button'
import Field from './ui/Field'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const STEP_TONE = {
  completed: 'border-[#d4e8da] bg-[#eef9f2] text-[#1c7d45]',
  current: 'border-[#d5e3f2] bg-[#edf4fb] text-[#35546c]',
  upcoming: 'border-[#dde4ee] bg-[#f7f9fc] text-[#6b7d93]',
}

function formatDate(value) {
  if (!value) return 'Not set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not set'
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(value) {
  if (!value) return 'Not set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not set'
  return parsed.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  return amount ? currency.format(amount) : 'Not captured'
}

function MiniStat({ label, value }) {
  return (
    <article className="rounded-[14px] border border-[#e4ebf4] bg-[#fbfcfe] px-3 py-3">
      <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.09em] text-[#8ca0b6]">{label}</span>
      <strong className="mt-1 block text-sm font-semibold text-[#1c2e42]">{value}</strong>
    </article>
  )
}

function InlineField({ label, children }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">
      <span>{label}</span>
      {children}
    </label>
  )
}

function TransactionBondHybridFinanceWorkflowPanel({
  workflowData = null,
  canEdit = false,
  variant = 'agent',
  loadingAction = '',
  onAdvanceStage,
  onAddApplication,
  onUpdateApplication,
  onAddQuote,
  onApproveQuote,
  onInstructionSent,
}) {
  const [applicationForm, setApplicationForm] = useState({
    bankName: '',
    status: 'submitted',
    submittedAt: '',
    referenceNumber: '',
    notes: '',
  })
  const [quoteForm, setQuoteForm] = useState({
    bankName: '',
    bondApplicationId: '',
    quotedAmount: '',
    interestRate: '',
    termMonths: '',
    quoteExpiryAt: '',
    notes: '',
  })

  const summary = useMemo(() => summarizeBondHybridFinanceWorkflow(workflowData || {}), [workflowData])
  const steps = useMemo(() => workflowData?.steps || buildBondHybridFinanceStageSteps(workflowData || {}), [workflowData])
  const workflow = workflowData?.workflow || null
  const applications = workflowData?.applications || []
  const quotes = workflowData?.quotes || []
  const approvedQuote = summary.approvedQuote || null
  const isCompleted = workflow?.status === 'completed'
  const isBondOriginatorView = variant === 'originator'
  const currentStageIndex = Math.max(0, BOND_HYBRID_FINANCE_STAGES.indexOf(workflow?.currentStage || workflow?.current_stage || summary.currentStage))

  if (!workflowData || !workflow) {
    return (
      <section className="rounded-[20px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] p-5 text-sm text-[#6b7d93]">
        Bond / Hybrid finance workflow has not started yet.
      </section>
    )
  }

  const submitApplication = (event) => {
    event.preventDefault()
    onAddApplication?.(applicationForm)
    setApplicationForm({ bankName: '', status: 'submitted', submittedAt: '', referenceNumber: '', notes: '' })
  }

  const submitQuote = (event) => {
    event.preventDefault()
    onAddQuote?.(quoteForm)
    setQuoteForm({ bankName: '', bondApplicationId: '', quotedAmount: '', interestRate: '', termMonths: '', quoteExpiryAt: '', notes: '' })
  }

  return (
    <section className="rounded-[20px] border border-[#e1e8f1] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] md:p-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">
            {isBondOriginatorView ? 'Bond / Hybrid Finance Workflow' : 'Bond Finance Progress'}
          </h3>
          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Live updates from the bond originator workflow.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">
            {summary.currentStageLabel}
          </span>
          <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">
            {isCompleted ? 'Completed' : 'Active'}
          </span>
        </div>
      </header>

      <div className="mt-4 grid gap-2.5 xl:grid-cols-3">
        {steps.map((stage) => {
          const Icon = stage.status === 'completed' ? CheckCircle2 : stage.status === 'current' ? UploadCloud : Circle
          return (
            <article key={stage.key} className="rounded-[14px] border border-[#e4ebf4] bg-[#fbfcfe] px-3.5 py-3.5">
              <div className="flex items-start gap-3">
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${STEP_TONE[stage.status] || STEP_TONE.upcoming}`}>
                  <Icon size={14} />
                </span>
                <div className="min-w-0">
                  <strong className="block text-sm font-semibold text-[#142132]">{stage.label}</strong>
                  <p className="mt-1 text-xs leading-5 text-[#6b7d93]">{stage.description}</p>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Current Stage" value={summary.currentStageLabel} />
        <MiniStat label="Last Updated" value={formatDateTime(workflow.lastUpdatedAt)} />
        <MiniStat label="Updated By" value={workflow.lastUpdatedByName || 'Not captured'} />
        <MiniStat label="Instruction Sent" value={summary.instructionSent ? 'Yes' : 'No'} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="rounded-[16px] border border-[#e4ebf4] bg-[#fbfcfe] p-4">
          <div className="flex items-center gap-2">
            <Landmark size={16} className="text-[#35546c]" />
            <h4 className="text-sm font-semibold text-[#142132]">Submitted Banks / Lenders</h4>
          </div>
          <div className="mt-3 space-y-2">
            {applications.length ? (
              applications.map((application) => (
                <article key={application.id} className="rounded-[12px] border border-[#e5ecf4] bg-white px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="block text-sm text-[#1c2e42]">{application.bankName}</strong>
                      <p className="mt-1 text-xs text-[#7c8ea4]">{application.referenceNumber || 'No reference'} • {formatDate(application.submittedAt)}</p>
                    </div>
                    <select
                      className="ui-select h-9 min-w-[145px] text-xs"
                      value={application.status}
                      disabled={!canEdit || isCompleted || Boolean(loadingAction)}
                      onChange={(event) => onUpdateApplication?.(application.id, { status: event.target.value })}
                    >
                      {BOND_HYBRID_APPLICATION_STATUSES.map((status) => (
                        <option key={status} value={status}>{BOND_HYBRID_APPLICATION_STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                  </div>
                  {application.notes ? <p className="mt-2 text-xs leading-5 text-[#62758a]">{application.notes}</p> : null}
                </article>
              ))
            ) : (
              <p className="rounded-[12px] border border-dashed border-[#d8e2ee] bg-white px-3 py-4 text-sm text-[#6b7d93]">No banks submitted yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-[16px] border border-[#e4ebf4] bg-[#fbfcfe] p-4">
          <div className="flex items-center gap-2">
            <Star size={16} className="text-[#35546c]" />
            <h4 className="text-sm font-semibold text-[#142132]">Quotes / Feedback</h4>
          </div>
          <div className="mt-3 space-y-2">
            {quotes.length ? (
              quotes.map((quote) => (
                <article key={quote.id} className="rounded-[12px] border border-[#e5ecf4] bg-white px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="block text-sm text-[#1c2e42]">{quote.bankName}</strong>
                      <p className="mt-1 text-xs text-[#7c8ea4]">
                        {formatCurrency(quote.quotedAmount)} • {quote.interestRate ? `${quote.interestRate}%` : 'Rate pending'}
                      </p>
                    </div>
                    {quote.quoteStatus === 'approved_by_buyer' ? (
                      <span className="inline-flex rounded-full border border-[#d4e8da] bg-[#eef9f2] px-2.5 py-1 text-[0.68rem] font-semibold text-[#1c7d45]">
                        Approved
                      </span>
                    ) : canEdit && !isCompleted ? (
                      <Button type="button" size="sm" variant="secondary" disabled={Boolean(loadingAction)} onClick={() => onApproveQuote?.(quote.id)}>
                        Approve
                      </Button>
                    ) : (
                      <span className="inline-flex rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-2.5 py-1 text-[0.68rem] font-semibold text-[#66758b]">
                        {quote.quoteStatusLabel}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-[#7c8ea4]">Expires: {formatDate(quote.quoteExpiryAt)}</p>
                  {quote.notes ? <p className="mt-2 text-xs leading-5 text-[#62758a]">{quote.notes}</p> : null}
                </article>
              ))
            ) : (
              <p className="rounded-[12px] border border-dashed border-[#d8e2ee] bg-white px-3 py-4 text-sm text-[#6b7d93]">No quotes captured yet.</p>
            )}
          </div>
        </section>

        <section className="rounded-[16px] border border-[#e4ebf4] bg-[#fbfcfe] p-4">
          <div className="flex items-center gap-2">
            <Send size={16} className="text-[#35546c]" />
            <h4 className="text-sm font-semibold text-[#142132]">Approved Quote</h4>
          </div>
          <div className="mt-3 rounded-[12px] border border-[#e5ecf4] bg-white px-3 py-3">
            <strong className="block text-sm text-[#1c2e42]">{approvedQuote?.bankName || 'Not approved yet'}</strong>
            <p className="mt-1 text-xs text-[#7c8ea4]">
              {approvedQuote ? `${formatCurrency(approvedQuote.quotedAmount)} • approved ${formatDate(approvedQuote.approvedAt)}` : 'Buyer approval pending'}
            </p>
          </div>
          {canEdit ? (
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={isCompleted || Boolean(loadingAction) || !approvedQuote}
                onClick={() => onInstructionSent?.()}
              >
                {loadingAction === 'instruction_sent' ? 'Sending...' : 'Mark Instruction Sent'}
              </Button>
            </div>
          ) : null}
        </section>
      </div>

      {canEdit && !isCompleted ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <form className="rounded-[16px] border border-[#e4ebf4] bg-[#fbfcfe] p-4" onSubmit={submitApplication}>
            <h4 className="text-sm font-semibold text-[#142132]">Add Bank / Lender</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <InlineField label="Bank / Lender">
                <Field value={applicationForm.bankName} onChange={(event) => setApplicationForm((previous) => ({ ...previous, bankName: event.target.value }))} required />
              </InlineField>
              <InlineField label="Status">
                <Field as="select" value={applicationForm.status} onChange={(event) => setApplicationForm((previous) => ({ ...previous, status: event.target.value }))}>
                  {BOND_HYBRID_APPLICATION_STATUSES.map((status) => (
                    <option key={status} value={status}>{BOND_HYBRID_APPLICATION_STATUS_LABELS[status]}</option>
                  ))}
                </Field>
              </InlineField>
              <InlineField label="Submitted Date">
                <Field type="date" value={applicationForm.submittedAt} onChange={(event) => setApplicationForm((previous) => ({ ...previous, submittedAt: event.target.value }))} />
              </InlineField>
              <InlineField label="Reference">
                <Field value={applicationForm.referenceNumber} onChange={(event) => setApplicationForm((previous) => ({ ...previous, referenceNumber: event.target.value }))} />
              </InlineField>
              <InlineField label="Notes">
                <Field as="textarea" className="sm:col-span-2" value={applicationForm.notes} onChange={(event) => setApplicationForm((previous) => ({ ...previous, notes: event.target.value }))} />
              </InlineField>
            </div>
            <div className="mt-3 flex justify-end">
              <Button type="submit" size="sm" disabled={Boolean(loadingAction)}>Add Bank</Button>
            </div>
          </form>

          <form className="rounded-[16px] border border-[#e4ebf4] bg-[#fbfcfe] p-4" onSubmit={submitQuote}>
            <h4 className="text-sm font-semibold text-[#142132]">Add Quote</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <InlineField label="Bank / Lender">
                <Field value={quoteForm.bankName} onChange={(event) => setQuoteForm((previous) => ({ ...previous, bankName: event.target.value }))} required />
              </InlineField>
              <InlineField label="Application">
                <Field as="select" value={quoteForm.bondApplicationId} onChange={(event) => setQuoteForm((previous) => ({ ...previous, bondApplicationId: event.target.value }))}>
                  <option value="">No linked application</option>
                  {applications.map((application) => (
                    <option key={application.id} value={application.id}>{application.bankName}</option>
                  ))}
                </Field>
              </InlineField>
              <InlineField label="Quoted Amount">
                <Field type="number" value={quoteForm.quotedAmount} onChange={(event) => setQuoteForm((previous) => ({ ...previous, quotedAmount: event.target.value }))} />
              </InlineField>
              <InlineField label="Interest Rate">
                <Field type="number" step="0.01" value={quoteForm.interestRate} onChange={(event) => setQuoteForm((previous) => ({ ...previous, interestRate: event.target.value }))} />
              </InlineField>
              <InlineField label="Term Months">
                <Field type="number" value={quoteForm.termMonths} onChange={(event) => setQuoteForm((previous) => ({ ...previous, termMonths: event.target.value }))} />
              </InlineField>
              <InlineField label="Expiry Date">
                <Field type="date" value={quoteForm.quoteExpiryAt} onChange={(event) => setQuoteForm((previous) => ({ ...previous, quoteExpiryAt: event.target.value }))} />
              </InlineField>
              <InlineField label="Notes">
                <Field as="textarea" className="sm:col-span-2" value={quoteForm.notes} onChange={(event) => setQuoteForm((previous) => ({ ...previous, notes: event.target.value }))} />
              </InlineField>
            </div>
            <div className="mt-3 flex justify-end">
              <Button type="submit" size="sm" disabled={Boolean(loadingAction)}>Add Quote</Button>
            </div>
          </form>
        </div>
      ) : null}

      {canEdit && !isCompleted ? (
        <footer className="mt-4 flex flex-wrap justify-end gap-2 border-t border-[#e8eef5] pt-4">
          {Object.entries(BOND_HYBRID_FINANCE_STAGE_LABELS).map(([stage, label]) => (
            (() => {
              const stageIndex = BOND_HYBRID_FINANCE_STAGES.indexOf(stage)
              const canSelectStage = stageIndex >= currentStageIndex && stageIndex <= currentStageIndex + 1
              return (
                <Button
                  key={stage}
                  type="button"
                  size="sm"
                  variant={workflow.currentStage === stage ? 'primary' : 'secondary'}
                  disabled={Boolean(loadingAction) || !canSelectStage}
                  onClick={() => onAdvanceStage?.(stage)}
                >
                  {loadingAction === stage ? 'Updating...' : label}
                </Button>
              )
            })()
          ))}
        </footer>
      ) : null}
    </section>
  )
}

export default TransactionBondHybridFinanceWorkflowPanel
