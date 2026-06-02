import { useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  FilePlus2,
  Landmark,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { buildTransactionFinanceWorkspace } from '../../services/transactionFinanceService'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function formatCurrency(value, fallback = 'Not captured') {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? currency.format(parsed) : fallback
}

function formatDate(value, fallback = 'Not set') {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback
  return parsed.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function title(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function getStepTone(status = 'upcoming') {
  if (status === 'completed') return 'border-[#d0e6d8] bg-[#eef9f1] text-[#1d7b49]'
  if (status === 'current') return 'border-[#d7e5f5] bg-[#eef5fc] text-[#35546c]'
  return 'border-[#dbe5ef] bg-[#f7f9fc] text-[#70839a]'
}

function getStatusTone(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  if (['approved', 'accepted', 'verified', 'completed', 'instruction_sent', 'ready_for_transfer'].includes(normalized)) {
    return 'border-[#cde4d5] bg-[#edf8f1] text-[#2f7a51]'
  }
  if (['rejected', 'declined', 'missing', 'blocked', 'expired', 'withdrawn'].includes(normalized)) {
    return 'border-[#f1cbc7] bg-[#fff5f4] text-[#b42318]'
  }
  if (['uploaded', 'submitted', 'received', 'in_review', 'pending_review', 'current'].includes(normalized)) {
    return 'border-[#d8e4ef] bg-[#f4f8fc] text-[#35546c]'
  }
  return 'border-[#dbe5ef] bg-[#fbfdff] text-[#61758a]'
}

function SummaryBlock({ label, value }) {
  return (
    <article className="rounded-[20px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-4 py-4 shadow-[0_16px_32px_rgba(15,23,42,0.05)]">
      <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#8397ad]">{label}</span>
      <strong className="mt-2 block text-sm font-semibold leading-6 text-[#142132]">{value}</strong>
    </article>
  )
}

function SectionCard({ title, copy, children, actions = null }) {
  return (
    <section className="rounded-[24px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">{title}</h3>
          {copy ? <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{copy}</p> : null}
        </div>
        {actions}
      </header>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function EmptyState({ message, action = null }) {
  return (
    <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-5 text-sm text-[#6b7d93]">
      <p>{message}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

function ProgressRail({ groups = [] }) {
  return (
    <section className="rounded-[26px] border border-[#dbe5ef] bg-[radial-gradient(circle_at_top_left,#f7fbff_0%,#ffffff_48%,#fbfdff_100%)] p-5 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Landmark size={16} className="text-[#35546c]" />
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#6d8197]">{group.label}</h3>
              </div>
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#94a6ba]">
                {(group.steps || []).filter((item) => item.status === 'completed').length}/{group.steps?.length || 0}
              </span>
            </div>
            <div className="grid gap-3 lg:grid-cols-5">
              {(group.steps || []).map((step) => {
                const Icon = step.status === 'completed' ? CheckCircle2 : step.status === 'current' ? Clock3 : Circle
                return (
                  <article key={step.key} className="rounded-[18px] border border-[#e5ecf4] bg-white px-4 py-4">
                    <div className="flex items-start gap-3">
                      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${getStepTone(step.status)}`}>
                        <Icon size={15} />
                      </span>
                      <div className="min-w-0">
                        <strong className="block text-sm font-semibold text-[#142132]">{step.label}</strong>
                        <span className="mt-1 block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8ca0b6]">
                          {step.status === 'completed' ? 'Completed' : step.status === 'current' ? 'Current' : 'Upcoming'}
                        </span>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function UploadAction({
  label = 'Upload',
  disabled = false,
  onSelect,
}) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
      disabled
        ? 'cursor-not-allowed border-[#e1e8f0] bg-[#f5f7fa] text-[#99a8b8]'
        : 'border-[#dbe5ef] bg-white text-[#35546c] hover:bg-[#f7fbff]'
    }`}>
      <UploadCloud size={13} />
      {label}
      <input
        type="file"
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onSelect?.(file)
          event.target.value = ''
        }}
      />
    </label>
  )
}

function RequiredDocumentTable({
  rows = [],
  canUpload = false,
  uploadingKey = '',
  onUpload,
  onOpenDocument,
}) {
  if (!rows.length) {
    return <EmptyState message="No finance document requirements are active yet." />
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <article key={row.id} className="rounded-[18px] border border-[#e5ecf4] bg-white px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <strong className="block text-sm font-semibold text-[#142132]">{row.label}</strong>
              <p className="mt-1 text-xs leading-5 text-[#70839a]">
                Required from {row.requiredParty}. Uploaded {formatDate(row.uploadedAt, 'Not uploaded yet')}.
              </p>
              {row.matchedDocument?.name ? (
                <p className="mt-1 text-xs text-[#70839a]">Current file: {row.matchedDocument.name}</p>
              ) : null}
            </div>
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${getStatusTone(row.status)}`}>
              {row.statusLabel}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canUpload ? (
              <UploadAction
                label={uploadingKey === row.key ? 'Uploading...' : row.matchedDocument?.id ? 'Replace document' : 'Upload document'}
                disabled={uploadingKey === row.key}
                onSelect={(file) => onUpload?.(row, file)}
              />
            ) : null}
            {row.matchedDocument?.url ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenDocument?.(row.matchedDocument)}>
                View file
              </Button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  )
}

function FinanceDocumentList({ rows = [], emptyMessage = 'No finance documents uploaded yet.', onOpenDocument }) {
  if (!rows.length) {
    return <EmptyState message={emptyMessage} />
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <article key={row.id} className="rounded-[18px] border border-[#e5ecf4] bg-white px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <strong className="block text-sm font-semibold text-[#142132]">{row.name}</strong>
              <p className="mt-1 text-xs leading-5 text-[#70839a]">
                {row.category} • Uploaded {formatDate(row.uploadedAt)}{row.uploadedByRole ? ` • ${title(row.uploadedByRole)}` : ''}
              </p>
            </div>
            {row.url ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenDocument?.(row)}>
                View
              </Button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  )
}

function ApplicationsSection({
  rows = [],
  canManage = false,
  loadingAction = '',
  onSubmit,
  onUpdateStatus,
}) {
  const [form, setForm] = useState({
    bankName: '',
    submittedAt: '',
    applicationReference: '',
    status: 'submitted',
    notes: '',
  })

  return (
    <div className="space-y-4">
      {rows.length ? (
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={row.id} className="rounded-[18px] border border-[#e5ecf4] bg-white px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <strong className="block text-sm font-semibold text-[#142132]">{row.bankName}</strong>
                  <p className="mt-1 text-xs leading-5 text-[#70839a]">
                    Submitted {formatDate(row.submittedAt)}{row.applicationReference ? ` • Ref ${row.applicationReference}` : ''}{row.submittedByName ? ` • ${row.submittedByName}` : ''}
                  </p>
                  {row.notes ? <p className="mt-2 text-xs leading-5 text-[#63758a]">{row.notes}</p> : null}
                </div>
                {canManage ? (
                  <Field
                    as="select"
                    className="min-w-[160px]"
                    value={row.status}
                    disabled={Boolean(loadingAction)}
                    onChange={(event) => onUpdateStatus?.(row, event.target.value)}
                  >
                    {['draft', 'submitted', 'in_review', 'approved', 'declined', 'withdrawn', 'expired'].map((status) => (
                      <option key={status} value={status}>{title(status)}</option>
                    ))}
                  </Field>
                ) : (
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${getStatusTone(row.status)}`}>
                    {title(row.status)}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState message="No bank applications submitted yet." />
      )}

      {canManage ? (
        <form
          className="rounded-[18px] border border-[#e5ecf4] bg-[#fbfdff] p-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit?.(form)
            setForm({ bankName: '', submittedAt: '', applicationReference: '', status: 'submitted', notes: '' })
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              placeholder="Bank / lender"
              value={form.bankName}
              onChange={(event) => setForm((current) => ({ ...current, bankName: event.target.value }))}
              required
            />
            <Field
              type="date"
              value={form.submittedAt}
              onChange={(event) => setForm((current) => ({ ...current, submittedAt: event.target.value }))}
            />
            <Field
              placeholder="Reference"
              value={form.applicationReference}
              onChange={(event) => setForm((current) => ({ ...current, applicationReference: event.target.value }))}
            />
            <Field
              as="select"
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
            >
              {['submitted', 'in_review', 'approved', 'declined'].map((status) => (
                <option key={status} value={status}>{title(status)}</option>
              ))}
            </Field>
            <Field
              as="textarea"
              className="sm:col-span-2"
              placeholder="Submission notes"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="submit" size="sm" disabled={loadingAction === 'add_application'}>Submit bank application</Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function OffersSection({
  rows = [],
  acceptedOfferId = '',
  canManage = false,
  canAccept = false,
  loadingAction = '',
  onSubmit,
  onAccept,
  onDecline,
  onOpenDocument,
}) {
  const [form, setForm] = useState({
    bankName: '',
    quotedAmount: '',
    interestRateDisplay: '',
    monthlyRepayment: '',
    termMonths: '',
    validUntil: '',
    notes: '',
    quoteFile: null,
  })

  return (
    <div className="space-y-4">
      {rows.length ? (
        <div className="space-y-3">
          {rows.map((row) => {
            const isAccepted = String(row.id || '') === String(acceptedOfferId || '')
            return (
              <article key={row.id} className="rounded-[18px] border border-[#e5ecf4] bg-white px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">{row.bankName}</strong>
                    <p className="mt-1 text-xs leading-5 text-[#70839a]">
                      {formatCurrency(row.quotedAmount)} • {row.interestRateDisplay || (row.interestRate ? `${row.interestRate}%` : 'Rate pending')} • {row.monthlyRepayment ? `${formatCurrency(row.monthlyRepayment)} / month` : 'Repayment pending'}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#70839a]">
                      Valid until {formatDate(row.validUntil || row.quoteExpiryAt)}
                    </p>
                    {row.notes ? <p className="mt-2 text-xs leading-5 text-[#63758a]">{row.notes}</p> : null}
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${getStatusTone(isAccepted ? 'accepted' : row.quoteStatus)}`}>
                    {isAccepted ? 'Accepted' : title(row.quoteStatusLabel || row.quoteStatus || 'received')}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {row.quoteDocumentId || row.relatedEntityId || row.url ? (
                    <Button type="button" variant="secondary" size="sm" onClick={() => onOpenDocument?.(row)}>
                      View quote
                    </Button>
                  ) : null}
                  {canAccept ? (
                    <>
                      <Button type="button" size="sm" disabled={Boolean(loadingAction) || isAccepted} onClick={() => onAccept?.(row)}>
                        {isAccepted ? 'Accepted' : 'Accept quote'}
                      </Button>
                      <Button type="button" variant="secondary" size="sm" disabled={Boolean(loadingAction) || row.quoteStatus === 'declined'} onClick={() => onDecline?.(row)}>
                        Decline
                      </Button>
                    </>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <EmptyState message="No quotes received yet." />
      )}

      {canManage ? (
        <form
          className="rounded-[18px] border border-[#e5ecf4] bg-[#fbfdff] p-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit?.(form)
            setForm({
              bankName: '',
              quotedAmount: '',
              interestRateDisplay: '',
              monthlyRepayment: '',
              termMonths: '',
              validUntil: '',
              notes: '',
              quoteFile: null,
            })
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              placeholder="Bank"
              value={form.bankName}
              onChange={(event) => setForm((current) => ({ ...current, bankName: event.target.value }))}
              required
            />
            <Field
              placeholder="Offer amount"
              type="number"
              value={form.quotedAmount}
              onChange={(event) => setForm((current) => ({ ...current, quotedAmount: event.target.value }))}
            />
            <Field
              placeholder="Interest rate"
              value={form.interestRateDisplay}
              onChange={(event) => setForm((current) => ({ ...current, interestRateDisplay: event.target.value }))}
            />
            <Field
              placeholder="Monthly repayment"
              type="number"
              value={form.monthlyRepayment}
              onChange={(event) => setForm((current) => ({ ...current, monthlyRepayment: event.target.value }))}
            />
            <Field
              placeholder="Term months"
              type="number"
              value={form.termMonths}
              onChange={(event) => setForm((current) => ({ ...current, termMonths: event.target.value }))}
            />
            <Field
              type="date"
              value={form.validUntil}
              onChange={(event) => setForm((current) => ({ ...current, validUntil: event.target.value }))}
            />
            <Field
              as="textarea"
              className="sm:col-span-2"
              placeholder="Offer notes"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <UploadAction label={form.quoteFile ? form.quoteFile.name : 'Attach quote document'} onSelect={(file) => setForm((current) => ({ ...current, quoteFile: file }))} />
            <Button type="submit" size="sm" disabled={loadingAction === 'add_quote'}>Capture offer</Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function DecisionCard({ acceptedOffer, latestDecision, canAccept = false, onOpenDocument }) {
  if (!acceptedOffer && !latestDecision) {
    return (
      <EmptyState
        message="Buyer has not accepted an offer yet."
        action={canAccept ? <span className="text-xs font-medium text-[#7c8ea4]">The buyer or permitted finance owner can accept a quote once offers are available.</span> : null}
      />
    )
  }

  const label = acceptedOffer ? 'Accepted Offer' : 'Latest Decision'
  const status = acceptedOffer ? 'accepted' : latestDecision?.decision || 'pending'
  const bankName = acceptedOffer?.bankName || latestDecision?.bankName || 'Offer recorded'

  return (
    <article className="rounded-[18px] border border-[#e5ecf4] bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8ca0b6]">{label}</span>
          <strong className="mt-1 block text-sm font-semibold text-[#142132]">{bankName}</strong>
          <p className="mt-1 text-xs leading-5 text-[#70839a]">
            {acceptedOffer ? `${formatCurrency(acceptedOffer.quotedAmount)} • ${acceptedOffer.interestRateDisplay || acceptedOffer.interestRate || 'Rate pending'}` : title(latestDecision?.decision || 'pending')}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${getStatusTone(status)}`}>
          {title(status)}
        </span>
      </div>
      {acceptedOffer?.quoteDocumentId || acceptedOffer?.url ? (
        <div className="mt-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenDocument?.(acceptedOffer)}>
            View accepted quote
          </Button>
        </div>
      ) : null}
    </article>
  )
}

function InstructionCard({
  instruction,
  acceptedOffer,
  canMark = false,
  loadingAction = '',
  onSubmit,
  onOpenDocument,
}) {
  const [notes, setNotes] = useState('')
  const [instructionFile, setInstructionFile] = useState(null)
  const sent = Boolean(instruction?.instructionSent || instruction?.instruction_sent)

  return (
    <div className="space-y-4">
      {sent ? (
        <article className="rounded-[18px] border border-[#e5ecf4] bg-white px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <strong className="block text-sm font-semibold text-[#142132]">Instruction sent</strong>
              <p className="mt-1 text-xs leading-5 text-[#70839a]">
                Sent {formatDate(instruction?.instructionSentAt || instruction?.instruction_sent_at)}{instruction?.instructionSentByName ? ` • ${instruction.instructionSentByName}` : ''}
              </p>
              {instruction?.notes ? <p className="mt-2 text-xs leading-5 text-[#63758a]">{instruction.notes}</p> : null}
            </div>
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${getStatusTone('instruction_sent')}`}>
              Instruction sent
            </span>
          </div>
          {instruction?.instructionDocumentId ? (
            <div className="mt-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenDocument?.(instruction)}>
                View instruction
              </Button>
            </div>
          ) : null}
        </article>
      ) : (
        <EmptyState
          message="Instruction has not been sent yet."
          action={!acceptedOffer ? <span className="text-xs font-medium text-[#7c8ea4]">A quote must be accepted before instruction can be sent.</span> : null}
        />
      )}

      {canMark ? (
        <form
          className="rounded-[18px] border border-[#e5ecf4] bg-[#fbfdff] p-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit?.({ notes, file: instructionFile })
            setNotes('')
            setInstructionFile(null)
          }}
        >
          <Field
            as="textarea"
            placeholder="Instruction notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <UploadAction label={instructionFile ? instructionFile.name : 'Attach instruction document'} onSelect={setInstructionFile} />
            <Button type="submit" size="sm" disabled={Boolean(loadingAction) || !acceptedOffer}>
              {loadingAction === 'instruction_sent' ? 'Sending...' : 'Mark instruction sent'}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function CashStatusList({ items = [] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article key={item.label} className="rounded-[18px] border border-[#e5ecf4] bg-white px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <strong className="block text-sm font-semibold text-[#142132]">{item.label}</strong>
              <p className="mt-1 text-xs leading-5 text-[#70839a]">{item.copy}</p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${getStatusTone(item.status)}`}>
              {item.value}
            </span>
          </div>
        </article>
      ))}
    </div>
  )
}

function FinanceCommandCenter({
  transaction = {},
  workflowData = null,
  requiredDocumentChecklist = [],
  documents = [],
  viewerRole = '',
  activeViewerPermissions = null,
  loadingAction = '',
  onUploadDocument,
  onSubmitBankApplication,
  onUpdateBankApplication,
  onCaptureBondOffer,
  onAcceptOffer,
  onDeclineOffer,
  onMarkInstructionSent,
  onReviewDocuments,
  onVerifyProofOfFunds,
  onUpdateBlockers,
  onOpenDocument,
}) {
  const [uploadingKey, setUploadingKey] = useState('')
  const [blockerForm, setBlockerForm] = useState({
    blockerStatus: '',
    nextAction: '',
    financeOwner: '',
  })

  const workspace = useMemo(
    () =>
      buildTransactionFinanceWorkspace({
        transaction,
        workflowData,
        requiredDocumentChecklist,
        documents,
        viewerRole,
        activeViewerPermissions,
      }),
    [transaction, workflowData, requiredDocumentChecklist, documents, viewerRole, activeViewerPermissions],
  )

  const proofStatusItems = [
    {
      label: 'Proof Of Funds',
      value: workspace.cash.proofUploaded ? 'Uploaded' : 'Missing',
      status: workspace.cash.proofUploaded ? 'uploaded' : 'missing',
      copy: workspace.cash.proofUploaded ? 'Proof of funds has been added to the finance workspace.' : 'Proof of funds has not been uploaded yet.',
    },
    {
      label: 'Attorney Verification',
      value: workspace.cash.attorneyVerified ? 'Verified' : 'Pending',
      status: workspace.cash.attorneyVerified ? 'verified' : 'pending',
      copy: workspace.cash.attorneyVerified ? 'Attorney has verified the funding evidence.' : 'Attorney verification is still outstanding.',
    },
    {
      label: 'Guarantees',
      value: workspace.cash.guaranteesRequired ? (workspace.cash.guaranteesSecured ? 'Secured' : 'Pending') : 'Not required',
      status: workspace.cash.guaranteesRequired ? (workspace.cash.guaranteesSecured ? 'completed' : 'pending') : 'completed',
      copy: workspace.cash.guaranteesRequired ? 'Guarantees / funds secured status for transfer readiness.' : 'No additional guarantees are required for this transaction.',
    },
    {
      label: 'Finance Completion Status',
      value: workspace.cash.readyForTransfer ? 'Ready for transfer' : 'In progress',
      status: workspace.cash.readyForTransfer ? 'ready_for_transfer' : 'current',
      copy: workspace.cash.readyForTransfer ? 'Cash finance conditions are complete.' : 'Cash finance conditions are still being worked through.',
    },
  ]

  async function handleRequirementUpload(row, file, financeLane = 'bond', relatedEntityType = null, uploadedByParty = null) {
    if (!onUploadDocument) return
    try {
      setUploadingKey(row.key || row.id || 'upload')
      await onUploadDocument({
        file,
        category: row.label,
        documentType: row.key || 'finance_document',
        requiredDocumentKey: row.key || null,
        canonicalRequirementInstanceId: row.canonicalRequirementInstanceId || null,
        financeLane,
        relatedEntityType,
        uploadedByParty,
      })
    } finally {
      setUploadingKey('')
    }
  }

  const acceptedOfferId = workspace.bond.acceptedOffer?.id || ''

  return (
    <div className="space-y-5">
      <div className="grid gap-3 xl:grid-cols-5">
        {workspace.summaryBlocks.map((item) => (
          <SummaryBlock key={item.key} label={item.label} value={item.value} />
        ))}
      </div>

      <ProgressRail groups={workspace.railGroups} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.86fr)]">
        <div className="space-y-5">
          {(workspace.financeType === 'bond' || workspace.financeType === 'combination') ? (
            <SectionCard
              title="Buyer Finance Documents"
              copy="Required buyer documents, live status, and structured uploads that sync straight back into canonical transaction documents."
              actions={workspace.permissions.canReviewDocuments ? (
                <Button type="button" size="sm" variant="secondary" disabled={Boolean(loadingAction)} onClick={() => onReviewDocuments?.()}>
                  Mark reviewed
                </Button>
              ) : null}
            >
              <RequiredDocumentTable
                rows={workspace.bond.buyerDocuments}
                canUpload={workspace.permissions.canUploadDocuments}
                uploadingKey={uploadingKey}
                onUpload={(row, file) => handleRequirementUpload(row, file, 'bond', 'buyer_finance_document', workspace.permissions.role)}
                onOpenDocument={onOpenDocument}
              />
            </SectionCard>
          ) : null}

          {(workspace.financeType === 'cash' || workspace.financeType === 'combination') ? (
            <SectionCard
              title={workspace.financeType === 'combination' ? 'Cash Portion Documents' : 'Proof Of Funds'}
              copy="Proof of funds, deposit support, and guarantee evidence captured as shared finance documents."
              actions={workspace.permissions.canVerifyProofOfFunds ? (
                <Button type="button" size="sm" variant="secondary" disabled={Boolean(loadingAction)} onClick={() => onVerifyProofOfFunds?.()}>
                  Verify proof of funds
                </Button>
              ) : null}
            >
              <div className="space-y-4">
                <CashStatusList items={proofStatusItems.slice(0, 2)} />
                <div className="flex flex-wrap gap-2">
                  {workspace.permissions.canUploadDocuments ? (
                    <UploadAction
                      label={uploadingKey === 'proof_of_funds' ? 'Uploading...' : 'Upload proof of funds'}
                      disabled={uploadingKey === 'proof_of_funds'}
                      onSelect={(file) =>
                        handleRequirementUpload(
                          { key: 'proof_of_funds', label: 'Proof Of Funds' },
                          file,
                          'cash',
                          'proof_of_funds',
                          workspace.permissions.role,
                        )
                      }
                    />
                  ) : null}
                  {workspace.permissions.canUploadDocuments ? (
                    <UploadAction
                      label={uploadingKey === 'deposit_proof' ? 'Uploading...' : 'Upload deposit proof'}
                      disabled={uploadingKey === 'deposit_proof'}
                      onSelect={(file) =>
                        handleRequirementUpload(
                          { key: 'deposit_proof', label: 'Deposit Proof' },
                          file,
                          'cash',
                          'deposit_proof',
                          workspace.permissions.role,
                        )
                      }
                    />
                  ) : null}
                  {workspace.permissions.canUploadDocuments ? (
                    <UploadAction
                      label={uploadingKey === 'guarantees' ? 'Uploading...' : 'Upload guarantees'}
                      disabled={uploadingKey === 'guarantees'}
                      onSelect={(file) =>
                        handleRequirementUpload(
                          { key: 'guarantees', label: 'Guarantees' },
                          file,
                          'cash',
                          'guarantees',
                          workspace.permissions.role,
                        )
                      }
                    />
                  ) : null}
                </div>
                <FinanceDocumentList rows={[...workspace.cash.proofDocuments, ...workspace.cash.depositDocuments, ...workspace.cash.guaranteeDocuments]} emptyMessage="No proof of funds, deposit, or guarantee documents uploaded yet." onOpenDocument={onOpenDocument} />
              </div>
            </SectionCard>
          ) : null}

          {workspace.financeType === 'developer' ? (
            <SectionCard
              title="Developer Finance Application"
              copy="Application, deposit, approval, and payment-schedule documents captured against the shared finance lane."
            >
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {workspace.permissions.canUploadDocuments ? (
                    <UploadAction
                      label={uploadingKey === 'developer_application' ? 'Uploading...' : 'Upload application'}
                      disabled={uploadingKey === 'developer_application'}
                      onSelect={(file) =>
                        handleRequirementUpload(
                          { key: 'developer_application', label: 'Developer Finance Application' },
                          file,
                          'developer',
                          'developer_finance_application',
                          workspace.permissions.role,
                        )
                      }
                    />
                  ) : null}
                  {workspace.permissions.canUploadDocuments ? (
                    <UploadAction
                      label={uploadingKey === 'developer_deposit' ? 'Uploading...' : 'Upload deposit proof'}
                      disabled={uploadingKey === 'developer_deposit'}
                      onSelect={(file) =>
                        handleRequirementUpload(
                          { key: 'developer_deposit', label: 'Deposit Proof' },
                          file,
                          'developer',
                          'developer_deposit',
                          workspace.permissions.role,
                        )
                      }
                    />
                  ) : null}
                </div>
                <FinanceDocumentList rows={[...workspace.developer.applicationDocuments, ...workspace.developer.depositDocuments]} emptyMessage="No developer finance application or deposit documents uploaded yet." onOpenDocument={onOpenDocument} />
              </div>
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-5">
          {(workspace.financeType === 'bond' || workspace.financeType === 'combination') ? (
            <>
              <SectionCard
                title="Bank Applications"
                copy="Submitted bank applications, references, originator handling, and workflow progression."
              >
                <ApplicationsSection
                  rows={workspace.bond.applications}
                  canManage={workspace.permissions.canManageApplications}
                  loadingAction={loadingAction}
                  onSubmit={onSubmitBankApplication}
                  onUpdateStatus={(row, status) => onUpdateBankApplication?.(row, { status })}
                />
              </SectionCard>

              <SectionCard
                title="Bank Quotes / Offers"
                copy="Received offers, quote documents, repayment snapshots, and buyer decision controls."
              >
                <OffersSection
                  rows={workspace.bond.offers}
                  acceptedOfferId={acceptedOfferId}
                  canManage={workspace.permissions.canManageOffers}
                  canAccept={workspace.permissions.canAcceptOffer}
                  loadingAction={loadingAction}
                  onSubmit={(payload) => onCaptureBondOffer?.(payload)}
                  onAccept={(row) => onAcceptOffer?.(row)}
                  onDecline={(row) => onDeclineOffer?.(row)}
                  onOpenDocument={onOpenDocument}
                />
              </SectionCard>
            </>
          ) : null}

          {(workspace.financeType === 'cash' || workspace.financeType === 'combination') ? (
            <SectionCard
              title="Deposit / Guarantees"
              copy="Cash portion readiness, attorney verification, guarantees, and completion status."
            >
              <CashStatusList items={proofStatusItems.slice(2)} />
            </SectionCard>
          ) : null}

          {workspace.financeType === 'developer' ? (
            <SectionCard
              title="Developer Approval"
              copy="Approval letters, signed terms, and finance payment schedule support."
            >
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {workspace.permissions.canUploadDocuments ? (
                    <UploadAction
                      label={uploadingKey === 'developer_approval' ? 'Uploading...' : 'Upload approval'}
                      disabled={uploadingKey === 'developer_approval'}
                      onSelect={(file) =>
                        handleRequirementUpload(
                          { key: 'developer_approval', label: 'Finance Approval' },
                          file,
                          'developer',
                          'developer_finance_approval',
                          workspace.permissions.role,
                        )
                      }
                    />
                  ) : null}
                  {workspace.permissions.canUploadDocuments ? (
                    <UploadAction
                      label={uploadingKey === 'developer_terms' ? 'Uploading...' : 'Upload signed terms'}
                      disabled={uploadingKey === 'developer_terms'}
                      onSelect={(file) =>
                        handleRequirementUpload(
                          { key: 'developer_terms', label: 'Signed Terms' },
                          file,
                          'developer',
                          'developer_finance_terms',
                          workspace.permissions.role,
                        )
                      }
                    />
                  ) : null}
                  {workspace.permissions.canUploadDocuments ? (
                    <UploadAction
                      label={uploadingKey === 'developer_schedule' ? 'Uploading...' : 'Upload payment schedule'}
                      disabled={uploadingKey === 'developer_schedule'}
                      onSelect={(file) =>
                        handleRequirementUpload(
                          { key: 'developer_schedule', label: 'Payment Schedule' },
                          file,
                          'developer',
                          'developer_payment_schedule',
                          workspace.permissions.role,
                        )
                      }
                    />
                  ) : null}
                </div>
                <FinanceDocumentList rows={[...workspace.developer.approvalDocuments, ...workspace.developer.signedTermsDocuments, ...workspace.developer.paymentScheduleDocuments]} emptyMessage="No approval, signed terms, or payment schedule documents uploaded yet." onOpenDocument={onOpenDocument} />
              </div>
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-5">
          {(workspace.financeType === 'bond' || workspace.financeType === 'combination') ? (
            <>
              <SectionCard
                title="Buyer Decision"
                copy="Accepted or declined quote outcome stored against the shared transaction finance record."
              >
                <DecisionCard
                  acceptedOffer={workspace.bond.acceptedOffer}
                  latestDecision={workspace.bond.latestDecision}
                  canAccept={workspace.permissions.canAcceptOffer}
                  onOpenDocument={onOpenDocument}
                />
              </SectionCard>

              <SectionCard
                title="Instruction Status"
                copy="Instruction handoff to attorneys, including the supporting instruction document when captured."
              >
                <InstructionCard
                  instruction={workspace.bond.instruction}
                  acceptedOffer={workspace.bond.acceptedOffer}
                  canMark={workspace.permissions.canMarkInstructionSent}
                  loadingAction={loadingAction}
                  onSubmit={(payload) => onMarkInstructionSent?.(payload)}
                  onOpenDocument={onOpenDocument}
                />
              </SectionCard>
            </>
          ) : null}

          <SectionCard
            title="Finance Command"
            copy="Blockers, ownership, and next-action steering for the finance lane."
            actions={<ShieldCheck size={16} className="text-[#6d8197]" />}
          >
            <div className="space-y-3">
              <article className="rounded-[18px] border border-[#e5ecf4] bg-white px-4 py-4">
                <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8ca0b6]">Current Blocker</span>
                <strong className="mt-1 block text-sm font-semibold text-[#142132]">{workspace.summaryBlocks.find((item) => item.key === 'blocker_status')?.value || 'No blockers'}</strong>
                <p className="mt-1 text-xs leading-5 text-[#70839a]">{workspace.summaryBlocks.find((item) => item.key === 'next_action')?.value || 'Review finance progress.'}</p>
              </article>
              {workspace.permissions.canUpdateBlockers ? (
                <form
                  className="rounded-[18px] border border-[#e5ecf4] bg-[#fbfdff] p-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    onUpdateBlockers?.(blockerForm)
                    setBlockerForm({ blockerStatus: '', nextAction: '', financeOwner: '' })
                  }}
                >
                  <div className="grid gap-3">
                    <Field
                      placeholder="Blocker status"
                      value={blockerForm.blockerStatus}
                      onChange={(event) => setBlockerForm((current) => ({ ...current, blockerStatus: event.target.value }))}
                    />
                    <Field
                      placeholder="Next action"
                      value={blockerForm.nextAction}
                      onChange={(event) => setBlockerForm((current) => ({ ...current, nextAction: event.target.value }))}
                    />
                    <Field
                      placeholder="Finance owner"
                      value={blockerForm.financeOwner}
                      onChange={(event) => setBlockerForm((current) => ({ ...current, financeOwner: event.target.value }))}
                    />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button type="submit" size="sm" variant="secondary">
                      Update finance command
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            title="Financial Snapshot"
            copy="Core deal values exposed in the finance workspace."
          >
            <div className="grid gap-3">
              {[
                ['Purchase Price', workspace.amounts.purchasePrice],
                ['Deposit', workspace.amounts.deposit],
                ['Cash Portion', workspace.amounts.cashPortion],
                ['Bond Amount', workspace.amounts.bondAmount],
                ['Transfer Fees', workspace.amounts.transferFees],
                ['Bond Registration Fees', workspace.amounts.bondRegistrationFees],
                ['Commission', workspace.amounts.commission],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 rounded-[16px] border border-[#e5ecf4] bg-white px-4 py-3">
                  <span className="text-sm text-[#6b7d93]">{label}</span>
                  <strong className="text-sm font-semibold text-[#142132]">{value}</strong>
                </div>
              ))}
              {workspace.financeType === 'developer' ? (
                <div className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-4 text-xs leading-5 text-[#70839a]">
                  Developer finance uses the same shared transaction finance layer, so documents and state captured here remain visible in the wider Documents and Activity surfaces.
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

export default FinanceCommandCenter
