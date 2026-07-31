import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  BadgeCheck,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  FileText,
  Landmark,
  MessageSquarePlus,
  MoreHorizontal,
  ShieldCheck,
  UploadCloud,
  UserRound,
} from 'lucide-react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { buildTransactionFinanceWorkspace } from '../../services/transactionFinanceService'
import IndicativeFinanceReadinessContainer from '../finance/IndicativeFinanceReadinessContainer'

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

const SUMMARY_ICONS = {
  finance_type: Landmark,
  finance_owner: UserRound,
  current_stage: FileText,
  next_action: ClipboardCheck,
  blocker_status: BadgeCheck,
}

const FINANCE_WORKSPACE_STORAGE_KEY = 'arch9.financeWorkspace.activeTab'
const FINANCE_WORKSPACE_TABS = [
  { key: 'accounts', label: 'Accounts', icon: UserRound },
  { key: 'requests', label: 'Client Requests', icon: ClipboardCheck },
  { key: 'payments', label: 'Payments', icon: Landmark },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'bond-workflow', label: 'Bond Workflow', icon: ShieldCheck },
  { key: 'handover', label: 'Handover / Transfer', icon: UploadCloud },
  { key: 'audit', label: 'Audit Log', icon: Clock3 },
]

function normalizeFinanceWorkspaceKey(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replaceAll('_', '-')
  return FINANCE_WORKSPACE_TABS.some((tab) => tab.key === normalized) ? normalized : ''
}

function SummaryBlock({ item }) {
  const Icon = SUMMARY_ICONS[item.key] || Circle
  const isBlocked = item.key === 'blocker_status' && String(item.value || '').toLowerCase() !== 'no blockers'
  return (
    <article className="flex min-w-0 items-start gap-2.5 border-[#e1e9f2] px-3 py-3 sm:border-r last:border-r-0">
      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
        isBlocked
          ? 'border-[#f1cbc7] bg-[#fff5f4] text-[#b42318]'
          : item.key === 'next_action'
            ? 'border-[#ffe0b2] bg-[#fff8ed] text-[#b26a00]'
            : item.key === 'finance_type'
              ? 'border-[#c9e0f7] bg-[#eef7ff] text-[#0b75d1]'
              : 'border-[#d9e5f0] bg-[#f7fbff] text-[#55708d]'
      }`}>
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#8397ad]">{item.label}</span>
        <strong className="mt-1 block text-sm font-semibold leading-5 text-[#142132]">{item.value}</strong>
        {item.subtext ? <span className="block truncate text-xs text-[#6f8299]">{item.subtext}</span> : null}
      </div>
    </article>
  )
}

function OwnershipBadge({ label, status = 'active', detail = '' }) {
  const tone =
    status === 'active'
      ? 'border-[#cde4d5] bg-[#f4fbf6] text-[#2f7a51]'
      : status === 'disabled'
        ? 'border-[#e3e9f1] bg-[#f7f9fc] text-[#7b8da3]'
        : 'border-[#f3ddb8] bg-[#fffaf0] text-[#9a6500]'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${tone}`}>
      <Circle size={7} fill="currentColor" />
      {label}
      {detail ? <span className="font-medium opacity-80">{detail}</span> : null}
    </span>
  )
}

function OwnershipBadgeStrip({
  financeType = '',
  financeOwner = '',
  originatorManagedFinance = false,
  clientManagedBondFinance = false,
  canProxyFinanceWorkflow = false,
}) {
  const isBond = financeType === 'bond' || financeType === 'combination'
  const isCash = financeType === 'cash' || financeType === 'combination'
  return (
    <div className="flex flex-wrap gap-2">
      {isBond && originatorManagedFinance ? <OwnershipBadge label="Bond Originator" detail="bond lane" /> : null}
      {isBond && clientManagedBondFinance ? <OwnershipBadge label="Buyer / Attorney" detail="external finance" /> : null}
      {isCash ? <OwnershipBadge label="Buyer" detail="cash evidence" /> : null}
      {isCash ? <OwnershipBadge label="Attorney" detail="verification" /> : null}
      {financeOwner && !isBond ? <OwnershipBadge label={financeOwner} detail="finance owner" /> : null}
      <OwnershipBadge
        label="Agent proxy"
        status={canProxyFinanceWorkflow ? 'warning' : 'disabled'}
        detail={canProxyFinanceWorkflow ? 'available' : 'not enabled'}
      />
    </div>
  )
}

function CashPortionStatusPanel({ items = [], title = 'Cash Portion Status' }) {
  return (
    <section className="rounded-[18px] border border-[#dfe7f1] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-[-0.02em] text-[#101b2d]">{title}</h3>
          <p className="mt-1 text-sm text-[#66758b]">Proof of funds and attorney verification for the cash lane.</p>
        </div>
        <span className="inline-flex rounded-full border border-[#dbe5ef] bg-[#fbfdff] px-3 py-1 text-[0.72rem] font-semibold text-[#61758a]">
          Parallel lane
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <article key={item.label} className="rounded-[8px] border border-[#e5ecf4] bg-[#fbfdff] px-3 py-3">
            <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[#8ca0b6]">{item.label}</span>
            <strong className="mt-1 block text-sm font-semibold text-[#142132]">{item.value}</strong>
            <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${getStatusTone(item.status)}`}>
              {titleCaseStatus(item.status)}
            </span>
          </article>
        ))}
      </div>
    </section>
  )
}

function titleCaseStatus(value = '') {
  return title(String(value || 'pending').replaceAll('-', '_'))
}

function SectionCard({ title, copy, children, actions = null }) {
  return (
    <section className="rounded-[8px] border border-[#dbe5ef] bg-white p-3.5 shadow-[0_10px_22px_rgba(15,23,42,0.045)]">
      <header className="flex flex-wrap items-start justify-between gap-2.5">
        <div>
          <h3 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">{title}</h3>
          {copy ? <p className="mt-1 text-sm leading-5 text-[#6b7d93]">{copy}</p> : null}
        </div>
        {actions}
      </header>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function EmptyState({ message, action = null }) {
  return (
    <div className="rounded-[8px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-3.5 py-3.5 text-sm text-[#334155]">
      <p>{message}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

function ProgressRail({ groups = [] }) {
  return (
    <section className="rounded-[8px] border border-[#dbe5ef] bg-white p-3.5 shadow-[0_10px_22px_rgba(15,23,42,0.045)]">
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Landmark size={16} className="text-[#35546c]" />
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#6d8197]">{group.label}</h3>
              </div>
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#94a6ba]">
                {(group.steps || []).filter((item) => item.status === 'completed').length}/{group.steps?.length || 0}
              </span>
            </div>
            <div className="overflow-x-auto pb-1">
              <div
                className="relative grid min-w-[680px] gap-0"
                style={{ gridTemplateColumns: `repeat(${Math.max(group.steps?.length || 1, 1)}, minmax(112px, 1fr))` }}
              >
                <div className="absolute left-12 right-12 top-[16px] h-px bg-[#cfddeb]" aria-hidden="true" />
                {(group.steps || []).map((step) => {
                  const Icon = step.status === 'completed' ? CheckCircle2 : step.status === 'current' ? Clock3 : Circle
                  return (
                    <article key={step.key} className="relative z-10 flex min-w-0 flex-col items-center px-2 text-center">
                      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${getStepTone(step.status)}`}>
                          <Icon size={14} />
                        </span>
                      <strong className="mt-2.5 block text-sm font-semibold leading-5 text-[#142132]">{step.label}</strong>
                      <span className="mt-1 block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8ca0b6]">
                        {step.status === 'completed' ? formatDate(step.completedAt, 'Completed') : step.status === 'current' ? 'Current' : 'Upcoming'}
                      </span>
                      <span className="mt-1 block max-w-[140px] truncate text-xs text-[#6f8299]">{step.responsibleRole || group.responsibleRole || 'Finance team'}</span>
                    </article>
                  )
                })}
              </div>
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
    <div className="overflow-hidden rounded-[8px] border border-[#e1e9f2]">
      <table className="min-w-full divide-y divide-[#e6eef6] text-left text-sm">
        <thead className="bg-[#f8fbff]">
          <tr className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7f94aa]">
            <th className="px-3 py-2.5">Document</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Uploaded Date</th>
            <th className="px-3 py-2.5 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf2f7] bg-white">
          {rows.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="px-3 py-2.5">
                <strong className="block text-sm font-semibold text-[#142132]">{row.label}</strong>
                <span className="block truncate text-xs text-[#70839a]">{row.matchedDocument?.name || row.requiredParty}</span>
              </td>
              <td className="px-3 py-2.5">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${getStatusTone(row.status)}`}>
                  {row.statusLabel}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sm text-[#5f7288]">{formatDate(row.uploadedAt, '-')}</td>
              <td className="px-3 py-2.5">
                <div className="flex justify-end gap-2">
                  {row.matchedDocument?.url ? (
                    <Button type="button" variant="secondary" size="sm" onClick={() => onOpenDocument?.(row.matchedDocument)}>
                      <Eye size={14} />
                      View
                    </Button>
                  ) : null}
                  {canUpload ? (
                    <UploadAction
                      label={uploadingKey === row.key ? 'Uploading...' : row.matchedDocument?.id ? 'Replace' : 'Upload'}
                      disabled={uploadingKey === row.key}
                      onSelect={(file) => onUpload?.(row, file)}
                    />
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FinanceDocumentList({ rows = [], emptyMessage = 'No finance documents uploaded yet.', onOpenDocument }) {
  if (!rows.length) {
    return <EmptyState message={emptyMessage} />
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <article key={row.id} className="rounded-[8px] border border-[#e5ecf4] bg-white px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <strong className="block text-sm font-semibold text-[#142132]">{row.name}</strong>
              <p className="mt-1 text-xs leading-4 text-[#70839a]">
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
    <div className="space-y-3">
      {rows.length ? (
        <div className="overflow-hidden rounded-[8px] border border-[#e1e9f2]">
          <table className="min-w-full divide-y divide-[#e6eef6] text-left text-sm">
            <thead className="bg-[#f8fbff]">
              <tr className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7f94aa]">
                <th className="px-3 py-2.5">Bank</th>
                <th className="px-3 py-2.5">Date Submitted</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Originator</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f7] bg-white">
              {rows.map((row) => (
                <tr key={row.id} className="align-middle">
                  <td className="px-3 py-2.5">
                    <strong className="block text-sm font-semibold text-[#142132]">{row.bankName}</strong>
                    {row.applicationReference ? <span className="block text-xs text-[#70839a]">Ref {row.applicationReference}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-[#5f7288]">{formatDate(row.submittedAt, '-')}</td>
                  <td className="px-3 py-2.5">
                    {canManage ? (
                      <Field
                        as="select"
                        className="min-w-[150px]"
                        value={row.status}
                        disabled={Boolean(loadingAction)}
                        onChange={(event) => onUpdateStatus?.(row, event.target.value)}
                      >
                        {['pending', 'submitted', 'feedback_received', 'quote_received', 'additional_documents_required', 'declined', 'approved', 'buyer_approved', 'expired'].map((status) => (
                          <option key={status} value={status}>{title(status)}</option>
                        ))}
                      </Field>
                    ) : (
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${getStatusTone(row.status)}`}>
                        {row.statusLabel || title(row.status)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[#5f7288]">{row.submittedByName || row.createdByName || 'Finance owner'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <Button type="button" variant="secondary" size="sm">
                        <Eye size={14} />
                        View
                      </Button>
                      <Button type="button" variant="secondary" size="sm" disabled={!canManage}>
                        <MessageSquarePlus size={14} />
                        Add Note
                      </Button>
                      <Button type="button" variant="secondary" size="sm" disabled={!canManage}>
                        <MoreHorizontal size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="No bank applications submitted yet." />
      )}

      {canManage ? (
        <form
          className="rounded-[8px] border border-[#e5ecf4] bg-[#fbfdff] p-3"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit?.(form)
            setForm({ bankName: '', submittedAt: '', applicationReference: '', status: 'submitted', notes: '' })
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
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

function BankOutcomeHistory({ rows = [] }) {
  if (!rows.length) {
    return <EmptyState message="No final bank outcomes recorded yet. Updating an application to approved, declined, expired, or additional documents will add an auditable outcome here." />
  }
  return (
    <div className="space-y-2">
      {rows.slice(0, 8).map((row) => (
        <article key={row.id} className="flex flex-wrap items-start justify-between gap-3 rounded-[8px] border border-[#e5ecf4] bg-white px-3 py-3">
          <div>
            <strong className="block text-sm font-semibold text-[#142132]">{row.bankName || 'Bank outcome'}</strong>
            <p className="mt-1 text-xs leading-4 text-[#70839a]">
              {formatDate(row.outcomeAt)}{row.recordedByName ? ` • ${row.recordedByName}` : ''}
              {row.approvedAmount ? ` • ${formatCurrency(row.approvedAmount)}` : ''}
            </p>
            {row.declineReason || row.conditions || row.notes ? <p className="mt-2 text-xs leading-4 text-[#63758a]">{row.declineReason || row.conditions || row.notes}</p> : null}
          </div>
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${getStatusTone(row.outcome)}`}>
            {title(row.outcome)}
          </span>
        </article>
      ))}
    </div>
  )
}

function RegistrationHandoffCard({ transaction = {} }) {
  const registrationDate = transaction.registration_date || transaction.registrationDate || transaction.registered_at || transaction.registeredAt || null
  const signal = String(transaction.registration_status || transaction.registrationStatus || transaction.stage || transaction.status || transaction.lifecycle_state || '').toLowerCase()
  const registered = Boolean(transaction.registered_at || transaction.registeredAt || signal.includes('registered'))
  const lodged = !registered && (signal.includes('lodged') || signal.includes('registration'))
  const status = registered ? 'registered' : lodged ? 'lodged' : 'awaiting_registration'
  return (
    <article className="rounded-[8px] border border-[#e5ecf4] bg-white px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8ca0b6]">Registration handoff</span>
          <strong className="mt-1 block text-sm font-semibold text-[#142132]">{registered ? 'Transaction registered' : lodged ? 'Lodged for registration' : 'Awaiting registration'}</strong>
          <p className="mt-1 text-xs leading-4 text-[#70839a]">
            {registered ? `Registered ${formatDate(registrationDate)}` : lodged ? 'Attorney registration process is in progress.' : 'Keep the grant and attorney instruction records current while the transfer progresses.'}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${getStatusTone(status)}`}>
          {registered ? 'Registered' : lodged ? 'Lodged' : 'Pending'}
        </span>
      </div>
    </article>
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
    <div className="space-y-3">
      {rows.length ? (
        <div className="overflow-hidden rounded-[8px] border border-[#e1e9f2]">
          <table className="min-w-full divide-y divide-[#e6eef6] text-left text-sm">
            <thead className="bg-[#f8fbff]">
              <tr className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7f94aa]">
                <th className="px-3 py-2.5">Bank</th>
                <th className="px-3 py-2.5">Date Received</th>
                <th className="px-3 py-2.5">Offer Amount</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f7] bg-white">
              {rows.map((row) => {
                const isAccepted = String(row.id || '') === String(acceptedOfferId || '')
                return (
                  <tr key={row.id} className="align-middle">
                    <td className="px-3 py-2.5">
                      <strong className="block text-sm font-semibold text-[#142132]">{row.bankName}</strong>
                      <span className="block text-xs text-[#70839a]">{row.interestRateDisplay || (row.interestRate ? `${row.interestRate}%` : 'Rate pending')}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[#5f7288]">{formatDate(row.quoteReceivedAt || row.createdAt, '-')}</td>
                    <td className="px-3 py-2.5 font-semibold text-[#142132]">{formatCurrency(row.quotedAmount, '-')}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${getStatusTone(isAccepted ? 'accepted' : row.quoteStatus)}`}>
                        {isAccepted ? 'Accepted' : title(row.quoteStatusLabel || row.quoteStatus || 'received')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        {row.quoteDocumentId || row.relatedEntityId || row.url ? (
                          <>
                            <Button type="button" variant="secondary" size="sm" onClick={() => onOpenDocument?.(row)}>
                              <Eye size={14} />
                              View Quote
                            </Button>
                            <Button type="button" variant="secondary" size="sm" onClick={() => onOpenDocument?.(row)}>
                              <Download size={14} />
                            </Button>
                          </>
                        ) : null}
                        {canAccept ? (
                          <>
                            <Button type="button" size="sm" disabled={Boolean(loadingAction) || isAccepted} onClick={() => onAccept?.(row)}>
                              {isAccepted ? 'Accepted' : 'Accept'}
                            </Button>
                            <Button type="button" variant="secondary" size="sm" disabled={Boolean(loadingAction) || row.quoteStatus === 'declined'} onClick={() => onDecline?.(row)}>
                              Decline
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="No quotes received yet." />
      )}

      {canManage ? (
        <form
          className="rounded-[8px] border border-[#e5ecf4] bg-[#fbfdff] p-3"
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
          <div className="grid gap-2 sm:grid-cols-2">
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

function DecisionCard({
  acceptedOffer,
  latestDecision,
  offers = [],
  canAccept = false,
  loadingAction = '',
  onAccept,
  onDecline,
  onOpenDocument,
}) {
  const actionableOffer = acceptedOffer || offers.find((item) => !['declined', 'expired', 'not_selected'].includes(String(item?.quoteStatus || '').toLowerCase())) || null

  if (!acceptedOffer && !latestDecision && !actionableOffer) {
    return (
      <EmptyState
        message="Buyer has not accepted an offer yet."
        action={canAccept ? <span className="text-xs font-medium text-[#7c8ea4]">Quote decision actions appear once an offer is received.</span> : null}
      />
    )
  }

  const offerForSummary = acceptedOffer || actionableOffer
  const label = acceptedOffer ? 'Accepted Quote' : latestDecision ? 'Latest Decision' : 'Decision Required'
  const status = acceptedOffer ? 'accepted' : latestDecision?.decision || offerForSummary?.quoteStatus || 'pending'
  const bankName = offerForSummary?.bankName || latestDecision?.bankName || 'Offer recorded'

  return (
    <article className="rounded-[8px] border border-[#e5ecf4] bg-white px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8ca0b6]">{label}</span>
          <strong className="mt-1 block text-sm font-semibold text-[#142132]">{bankName}</strong>
          <p className="mt-1 text-xs leading-4 text-[#70839a]">
            {offerForSummary ? `${formatCurrency(offerForSummary.quotedAmount)} • ${offerForSummary.interestRateDisplay || offerForSummary.interestRate || 'Rate pending'}` : title(latestDecision?.decision || 'pending')}
          </p>
          {offerForSummary?.monthlyRepayment ? <p className="mt-1 text-xs leading-4 text-[#70839a]">{formatCurrency(offerForSummary.monthlyRepayment)} monthly repayment</p> : null}
          {offerForSummary?.termMonths ? <p className="mt-1 text-xs leading-4 text-[#70839a]">{Math.round(Number(offerForSummary.termMonths) / 12)} Years</p> : null}
        </div>
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${getStatusTone(status)}`}>
          {title(status)}
        </span>
      </div>
      {offerForSummary ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {offerForSummary.quoteDocumentId || offerForSummary.url ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => onOpenDocument?.(offerForSummary)}>
              <Eye size={14} />
              View Quote
            </Button>
          ) : null}
          {canAccept ? (
            <>
              <Button type="button" size="sm" disabled={Boolean(loadingAction) || Boolean(acceptedOffer)} onClick={() => onAccept?.(offerForSummary)}>
                {acceptedOffer ? 'Quote Accepted' : 'Accept Quote'}
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={Boolean(loadingAction) || Boolean(acceptedOffer)} onClick={() => onDecline?.(offerForSummary)}>
                Decline Quote
              </Button>
            </>
          ) : null}
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
  const grantSubmitted = Boolean(instruction?.grantSubmitted || instruction?.grant_submitted)
  const existingInstructionDocumentId = instruction?.instructionDocumentId || instruction?.instruction_document_id || null

  return (
    <div className="space-y-3">
      {sent ? (
        <article className="rounded-[8px] border border-[#e5ecf4] bg-white px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <strong className="block text-sm font-semibold text-[#142132]">Instruction sent</strong>
              <p className="mt-1 text-xs leading-4 text-[#70839a]">
                Sent {formatDate(instruction?.instructionSentAt || instruction?.instruction_sent_at)}{instruction?.instructionSentByName ? ` • ${instruction.instructionSentByName}` : ''}
              </p>
              {instruction?.notes ? <p className="mt-2 text-xs leading-4 text-[#63758a]">{instruction.notes}</p> : null}
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
          action={
            !acceptedOffer
              ? <span className="text-xs font-medium text-[#7c8ea4]">A quote must be accepted before instruction can be sent.</span>
              : !grantSubmitted
                ? <span className="text-xs font-medium text-[#7c8ea4]">The signed grant must be submitted before instruction can be sent.</span>
                : null
          }
        />
      )}

      {canMark ? (
        <form
          className="rounded-[8px] border border-[#e5ecf4] bg-[#fbfdff] p-3"
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
            <Button type="submit" size="sm" disabled={Boolean(loadingAction) || !acceptedOffer || !grantSubmitted || (!instructionFile && !existingInstructionDocumentId)}>
              {loadingAction === 'instruction_sent' ? 'Sending...' : 'Mark instruction sent'}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function GrantMilestoneCard({
  instruction,
  acceptedOffer,
  documents = [],
  canMark = false,
  loadingAction = '',
  onSubmit,
  onOpenDocument,
}) {
  const [notes, setNotes] = useState('')
  const [grantFile, setGrantFile] = useState(null)
  const [signedGrantFile, setSignedGrantFile] = useState(null)
  const grantReceived = Boolean(instruction?.grantReceived || instruction?.grant_received || instruction?.grantDocumentId || instruction?.grant_document_id)
  const grantSigned = Boolean(instruction?.grantSigned || instruction?.grant_signed || instruction?.signedGrantDocumentId || instruction?.signed_grant_document_id)
  const grantSubmitted = Boolean(instruction?.grantSubmitted || instruction?.grant_submitted)
  const grantDocumentId = instruction?.grantDocumentId || instruction?.grant_document_id || null
  const signedGrantDocumentId = instruction?.signedGrantDocumentId || instruction?.signed_grant_document_id || null
  const findDocument = (documentId) => (documents || []).find((item) => String(item?.id || item?.documentId || item?.document_id || '') === String(documentId || '')) || null
  const grantDocument = findDocument(grantDocumentId)
  const signedGrantDocument = findDocument(signedGrantDocumentId)

  const submitMilestone = (stage) => {
    onSubmit?.({
      stage,
      notes,
      file: stage === 'grant_received' ? grantFile : null,
      signedFile: ['grant_signed', 'grant_submitted'].includes(stage) ? signedGrantFile : null,
      grantDocumentId,
      signedGrantDocumentId,
    })
    setNotes('')
    if (stage === 'grant_received') setGrantFile(null)
    if (['grant_signed', 'grant_submitted'].includes(stage)) setSignedGrantFile(null)
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ['Grant Received', grantReceived, instruction?.grantReceivedAt || instruction?.grant_received_at],
          ['Grant Signed', grantSigned, instruction?.grantSignedAt || instruction?.grant_signed_at],
          ['Grant Submitted', grantSubmitted, instruction?.grantSubmittedAt || instruction?.grant_submitted_at],
        ].map(([label, complete, date]) => (
          <article key={label} className="rounded-[8px] border border-[#e5ecf4] bg-white px-3 py-3">
            <strong className="block text-sm font-semibold text-[#142132]">{label}</strong>
            <p className="mt-1 text-xs leading-4 text-[#70839a]">{complete ? formatDate(date, 'Recorded') : 'Pending'}</p>
            <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${getStatusTone(complete ? 'completed' : 'pending')}`}>
              {complete ? 'Complete' : 'Waiting'}
            </span>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {grantDocument?.url ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenDocument?.(grantDocument)}>
            View grant
          </Button>
        ) : null}
        {signedGrantDocument?.url ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenDocument?.(signedGrantDocument)}>
            View signed grant
          </Button>
        ) : null}
      </div>

      {canMark ? (
        <form
          className="rounded-[8px] border border-[#e5ecf4] bg-[#fbfdff] p-3"
          onSubmit={(event) => event.preventDefault()}
        >
          <Field
            as="textarea"
            placeholder="Grant notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <UploadAction label={grantFile ? grantFile.name : 'Attach grant document'} onSelect={setGrantFile} disabled={grantReceived} />
            <Button
              type="button"
              size="sm"
              variant={grantReceived ? 'secondary' : 'primary'}
              disabled={Boolean(loadingAction) || !acceptedOffer || grantReceived || (!grantFile && !grantDocumentId)}
              onClick={() => submitMilestone('grant_received')}
            >
              {loadingAction === 'grant_received' ? 'Recording...' : 'Record grant received'}
            </Button>
            <UploadAction label={signedGrantFile ? signedGrantFile.name : 'Attach signed grant'} onSelect={setSignedGrantFile} disabled={grantSigned} />
            <Button
              type="button"
              size="sm"
              variant={grantSigned ? 'secondary' : 'primary'}
              disabled={Boolean(loadingAction) || !grantReceived || grantSigned || (!signedGrantFile && !signedGrantDocumentId)}
              onClick={() => submitMilestone('grant_signed')}
            >
              {loadingAction === 'grant_signed' ? 'Recording...' : 'Record grant signed'}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={Boolean(loadingAction) || !grantSigned || grantSubmitted}
              onClick={() => submitMilestone('grant_submitted')}
            >
              {loadingAction === 'grant_submitted' ? 'Submitting...' : 'Mark grant submitted'}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function CashStatusList({ items = [] }) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <article key={item.label} className="rounded-[8px] border border-[#e5ecf4] bg-white px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <strong className="block text-sm font-semibold text-[#142132]">{item.label}</strong>
              <p className="mt-1 text-xs leading-4 text-[#70839a]">{item.copy}</p>
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

function FinanceWorkspaceNav({ activeKey = 'accounts', onChange }) {
  return (
    <section className="border-b border-[#dfe7f1] bg-white">
      <div className="flex flex-wrap items-end gap-5 px-1 pt-1">
        {FINANCE_WORKSPACE_TABS.map((tab) => {
          const Icon = tab.icon
          const active = tab.key === activeKey
          return (
            <button
              key={tab.key}
              type="button"
              className={`inline-flex min-h-[46px] items-center gap-2 border-b-2 px-1 text-sm font-semibold transition ${
                active
                  ? 'border-[#0f8f63] text-[#08734f]'
                  : 'border-transparent text-[#31445f] hover:border-[#cfd9e6] hover:text-[#142132]'
              }`}
              onClick={() => onChange?.(tab.key)}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function MetricStrip({ items = [] }) {
  return (
    <div className="grid overflow-hidden rounded-[8px] border border-[#dbe5ef] bg-white shadow-[0_10px_22px_rgba(15,23,42,0.045)] sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => (
        <SummaryBlock key={item.key} item={item} />
      ))}
    </div>
  )
}

function FinanceWorkspaceFrame({ title, copy, children }) {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#08734f]">Finance Workspace</p>
        <h3 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#101b2d]">{title}</h3>
        {copy ? <p className="mt-1 text-sm leading-6 text-[#66758b]">{copy}</p> : null}
      </div>
      {children}
    </section>
  )
}

function AccountSummaryTile({ label, value, copy = '' }) {
  return (
    <article className="rounded-[8px] border border-[#e1e9f2] bg-white px-4 py-4">
      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8ca0b6]">{label}</span>
      <strong className="mt-2 block text-lg font-semibold tracking-[-0.02em] text-[#142132]">{value}</strong>
      {copy ? <p className="mt-1 text-xs leading-5 text-[#70839a]">{copy}</p> : null}
    </article>
  )
}

function FinanceAccountsPage({ workspace, proofStatusItems, financeCommandCard, financeReadinessHandoff, matterAccountsPanel = null }) {
  const nextAction = workspace.summaryBlocks.find((item) => item.key === 'next_action')?.value || 'Review finance progress'
  const buyerAmount = workspace.amounts.bondAmount !== 'Not captured' ? workspace.amounts.bondAmount : workspace.amounts.cashPortion
  return (
    <FinanceWorkspaceFrame
      title="Accounts"
      copy="Buyer, seller, balance and readiness summaries for the matter."
    >
      <MetricStrip items={workspace.summaryBlocks} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <main className="space-y-4">
          {matterAccountsPanel}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AccountSummaryTile label="Buyer Account" value={buyerAmount} copy="Captured buyer finance contribution." />
            <AccountSummaryTile label="Seller Account" value={workspace.amounts.purchasePrice} copy="Matter purchase price reference." />
            <AccountSummaryTile label="Deposit" value={workspace.amounts.deposit} copy="Deposit or paid contribution." />
            <AccountSummaryTile label="Next Action" value={nextAction} copy={workspace.financeOwner || 'Finance owner'} />
          </div>
          <SectionCard title="Finance Position" copy="Matter amounts and finance route in one place.">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Purchase Price', workspace.amounts.purchasePrice],
                ['Bond Amount', workspace.amounts.bondAmount],
                ['Cash Portion', workspace.amounts.cashPortion],
                ['Transfer Fees', workspace.amounts.transferFees],
                ['Bond Registration Fees', workspace.amounts.bondRegistrationFees],
                ['Commission', workspace.amounts.commission],
              ].map(([label, value]) => (
                <article key={label} className="rounded-[8px] border border-[#e5ecf4] bg-[#fbfdff] px-3 py-3">
                  <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[#8ca0b6]">{label}</span>
                  <strong className="mt-1 block text-sm font-semibold text-[#142132]">{value}</strong>
                </article>
              ))}
            </div>
          </SectionCard>
          <CashPortionStatusPanel items={proofStatusItems} title={workspace.financeType === 'combination' ? 'Cash Portion Readiness' : 'Funding Readiness'} />
        </main>
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <IndicativeFinanceReadinessContainer handoff={financeReadinessHandoff} variant="compact" />
          {financeCommandCard}
        </aside>
      </div>
    </FinanceWorkspaceFrame>
  )
}

function splitRequestRows(rows = []) {
  return rows.reduce((groups, row) => {
    const status = String(row.status || '').toLowerCase()
    const key = ['approved', 'verified', 'completed', 'accepted'].includes(status)
      ? 'completed'
      : ['uploaded', 'submitted', 'received', 'pending_review', 'in_review'].includes(status)
        ? 'waiting'
        : 'outstanding'
    groups[key].push(row)
    return groups
  }, { outstanding: [], waiting: [], completed: [] })
}

function RequestQueueSection({ title, rows, canUpload, uploadingKey, onUpload, onOpenDocument }) {
  return (
    <SectionCard title={title}>
      <RequiredDocumentTable
        rows={rows}
        canUpload={canUpload}
        uploadingKey={uploadingKey}
        onUpload={onUpload}
        onOpenDocument={onOpenDocument}
      />
    </SectionCard>
  )
}

function FinanceRequestsPage({
  workspace,
  hasExternalBondFinance,
  hasCashWorkflow,
  hasDeveloperWorkflow,
  proofStatusItems,
  uploadingKey,
  handleRequirementUpload,
  loadingAction,
  onReviewDocuments,
  onVerifyProofOfFunds,
  onOpenDocument,
}) {
  const groups = splitRequestRows(workspace.bond.buyerDocuments)
  return (
    <FinanceWorkspaceFrame
      title="Client Requests"
      copy="Outstanding, waiting and completed finance requests."
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.48fr)]">
        <main className="space-y-4">
          <RequestQueueSection
            title="Outstanding"
            rows={groups.outstanding}
            canUpload={workspace.permissions.canUploadDocuments}
            uploadingKey={uploadingKey}
            onUpload={(row, file) =>
              handleRequirementUpload(
                row,
                file,
                hasExternalBondFinance ? 'external' : 'bond',
                hasExternalBondFinance ? 'external_finance_document' : 'buyer_finance_document',
                workspace.permissions.role,
              )
            }
            onOpenDocument={onOpenDocument}
          />
          <RequestQueueSection
            title="Waiting"
            rows={groups.waiting}
            canUpload={workspace.permissions.canUploadDocuments}
            uploadingKey={uploadingKey}
            onUpload={(row, file) =>
              handleRequirementUpload(row, file, hasExternalBondFinance ? 'external' : 'bond', 'buyer_finance_document', workspace.permissions.role)
            }
            onOpenDocument={onOpenDocument}
          />
          <RequestQueueSection
            title="Completed"
            rows={groups.completed}
            canUpload={false}
            uploadingKey={uploadingKey}
            onOpenDocument={onOpenDocument}
          />
        </main>
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          {hasCashWorkflow ? (
            <SectionCard
              title={workspace.financeType === 'combination' ? 'Cash Portion Requests' : 'Proof Of Funds Requests'}
              copy="Proof of funds, deposit evidence and guarantees."
              actions={workspace.permissions.canVerifyProofOfFunds ? (
                <Button type="button" size="sm" variant="secondary" disabled={Boolean(loadingAction)} onClick={() => onVerifyProofOfFunds?.()}>
                  Verify
                </Button>
              ) : null}
            >
              <div className="space-y-3">
                <CashStatusList items={proofStatusItems} />
                <div className="flex flex-wrap gap-2">
                  {workspace.permissions.canUploadDocuments ? (
                    <UploadAction
                      label={uploadingKey === 'proof_of_funds' ? 'Uploading...' : 'Upload proof of funds'}
                      disabled={uploadingKey === 'proof_of_funds'}
                      onSelect={(file) => handleRequirementUpload({ key: 'proof_of_funds', label: 'Proof Of Funds' }, file, 'cash', 'proof_of_funds', workspace.permissions.role)}
                    />
                  ) : null}
                  {workspace.permissions.canUploadDocuments ? (
                    <UploadAction
                      label={uploadingKey === 'deposit_proof' ? 'Uploading...' : 'Upload deposit proof'}
                      disabled={uploadingKey === 'deposit_proof'}
                      onSelect={(file) => handleRequirementUpload({ key: 'deposit_proof', label: 'Deposit Proof' }, file, 'cash', 'deposit_proof', workspace.permissions.role)}
                    />
                  ) : null}
                </div>
              </div>
            </SectionCard>
          ) : null}
          {hasDeveloperWorkflow ? (
            <SectionCard title="Developer Finance Requests" copy="Application, deposit, approval and payment schedule requests.">
              <div className="flex flex-wrap gap-2">
                {[
                  ['developer_application', 'Upload application', 'developer_finance_application'],
                  ['developer_deposit', 'Upload deposit proof', 'developer_deposit'],
                  ['developer_approval', 'Upload approval', 'developer_finance_approval'],
                  ['developer_terms', 'Upload signed terms', 'developer_finance_terms'],
                  ['developer_schedule', 'Upload payment schedule', 'developer_payment_schedule'],
                ].map(([key, label, type]) => (
                  <UploadAction
                    key={key}
                    label={uploadingKey === key ? 'Uploading...' : label}
                    disabled={uploadingKey === key || !workspace.permissions.canUploadDocuments}
                    onSelect={(file) => handleRequirementUpload({ key, label }, file, 'developer', type, workspace.permissions.role)}
                  />
                ))}
              </div>
            </SectionCard>
          ) : null}
          {workspace.permissions.canReviewDocuments ? (
            <Button type="button" size="sm" variant="secondary" disabled={Boolean(loadingAction)} onClick={() => onReviewDocuments?.()}>
              Mark finance documents reviewed
            </Button>
          ) : null}
        </aside>
      </div>
    </FinanceWorkspaceFrame>
  )
}

function FinancePaymentsPage({ workspace }) {
  return (
    <FinanceWorkspaceFrame title="Payments" copy="Focused payment posting, adjustments, ledger and history.">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <SectionCard title="Post Payment">
            <div className="grid gap-2">
              <Field placeholder="Amount" inputMode="decimal" />
              <Field as="select" defaultValue="buyer">
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
                <option value="third_party">Third party</option>
              </Field>
              <Field placeholder="Reference" />
              <Button type="button" size="sm" disabled>Post payment</Button>
            </div>
          </SectionCard>
          <SectionCard title="Adjust Balance">
            <div className="grid gap-2">
              <Field placeholder="Adjustment amount" inputMode="decimal" />
              <Field placeholder="Reason" />
              <Button type="button" size="sm" variant="secondary" disabled>Adjust balance</Button>
            </div>
          </SectionCard>
        </div>
        <div className="space-y-4">
          <SectionCard title="Ledger">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <AccountSummaryTile label="Purchase Price" value={workspace.amounts.purchasePrice} />
              <AccountSummaryTile label="Deposit" value={workspace.amounts.deposit} />
              <AccountSummaryTile label="Transfer Fees" value={workspace.amounts.transferFees} />
              <AccountSummaryTile label="Commission" value={workspace.amounts.commission} />
            </div>
          </SectionCard>
          <SectionCard title="History">
            <EmptyState message="No finance payment ledger entries are available in this workspace yet." />
          </SectionCard>
        </div>
      </div>
    </FinanceWorkspaceFrame>
  )
}

function buildFinanceDocumentCollections(workspace) {
  return [
    { key: 'invoices', title: 'Invoices', rows: [] },
    { key: 'statements', title: 'Statements', rows: [] },
    { key: 'pops', title: 'POPs', rows: [...workspace.cash.proofDocuments, ...workspace.cash.depositDocuments] },
    { key: 'guarantees', title: 'Guarantees', rows: [...workspace.cash.guaranteeDocuments, ...workspace.bond.offerDocuments] },
    { key: 'other', title: 'Other', rows: [...workspace.bond.supportingDocuments, ...workspace.bond.instructionDocuments, ...workspace.developer.applicationDocuments, ...workspace.developer.approvalDocuments, ...workspace.developer.signedTermsDocuments, ...workspace.developer.paymentScheduleDocuments] },
  ]
}

function FinanceDocumentsPage({ workspace, uploadingKey, handleRequirementUpload, onOpenDocument }) {
  return (
    <FinanceWorkspaceFrame title="Documents" copy="Finance documents only, grouped by operating category.">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {workspace.permissions.canUploadDocuments ? (
            <UploadAction
              label={uploadingKey === 'finance_document' ? 'Uploading...' : 'Upload finance document'}
              disabled={uploadingKey === 'finance_document'}
              onSelect={(file) => handleRequirementUpload({ key: 'finance_document', label: 'Finance Document' }, file, 'finance', 'finance_document', workspace.permissions.role)}
            />
          ) : null}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {buildFinanceDocumentCollections(workspace).map((group) => (
            <SectionCard key={group.key} title={group.title}>
              <FinanceDocumentList rows={group.rows} emptyMessage={`No ${group.title.toLowerCase()} uploaded yet.`} onOpenDocument={onOpenDocument} />
            </SectionCard>
          ))}
        </div>
      </div>
    </FinanceWorkspaceFrame>
  )
}

function getStepStatusLabel(status = '') {
  if (status === 'completed') return 'Completed'
  if (status === 'current') return 'In Progress'
  return 'Pending'
}

function getBondStageDocuments(stageKey, workspace) {
  if (stageKey === 'documents') return [...workspace.bond.supportingDocuments]
  if (stageKey === 'quote_received' || stageKey === 'quote_accepted' || stageKey === 'bond_approved') return workspace.bond.offerDocuments
  if (['grant_received', 'grant_signed', 'grant_submitted'].includes(stageKey)) return workspace.bond.supportingDocuments
  if (stageKey === 'instruction_sent' || stageKey === 'complete') return workspace.bond.instructionDocuments
  return []
}

function getBondStageRequirements(stageKey, selectedStep, workspace) {
  const instruction = workspace.bond.instruction || {}
  const acceptedOffer = workspace.bond.acceptedOffer
  const completed = selectedStep?.status === 'completed'
  const current = selectedStep?.status === 'current'
  const basic = (label, done = completed, detail = '') => ({ id: label, label, status: done ? 'completed' : current ? 'in_progress' : 'pending', detail })
  if (stageKey === 'documents') {
    return workspace.bond.buyerDocuments.map((row) => ({
      id: row.id,
      label: row.label,
      status: ['approved', 'verified', 'completed'].includes(String(row.status || '').toLowerCase()) ? 'completed' : row.matchedDocument ? 'in_progress' : 'pending',
      detail: row.statusLabel || row.requiredParty,
    }))
  }
  if (stageKey === 'submitted_to_banks') {
    return workspace.bond.applications.length
      ? workspace.bond.applications.map((row) => ({ id: row.id, label: row.bankName || 'Bank application', status: 'completed', detail: row.applicationReference || row.statusLabel }))
      : [basic('Bank application submitted', false)]
  }
  if (stageKey === 'quote_received') {
    return workspace.bond.offers.length
      ? workspace.bond.offers.map((row) => ({ id: row.id, label: row.bankName || 'Bank offer', status: 'completed', detail: formatCurrency(row.quotedAmount, row.quoteStatusLabel || 'Offer received') }))
      : [basic('Offer received from bank', false)]
  }
  if (stageKey === 'quote_accepted' || stageKey === 'bond_approved') {
    return [basic('Buyer accepted a bond offer', Boolean(acceptedOffer), acceptedOffer?.bankName || '')]
  }
  if (stageKey === 'grant_received') {
    return [basic('Grant received from bank', Boolean(instruction.grantReceived || instruction.grant_received || instruction.grantDocumentId || instruction.grant_document_id))]
  }
  if (stageKey === 'grant_signed') {
    return [basic('Grant signed', Boolean(instruction.grantSigned || instruction.grant_signed || instruction.signedGrantDocumentId || instruction.signed_grant_document_id))]
  }
  if (stageKey === 'grant_submitted') {
    return [basic('Signed grant submitted', Boolean(instruction.grantSubmitted || instruction.grant_submitted))]
  }
  if (stageKey === 'instruction_sent') {
    return [basic('Instruction sent to transfer attorney', Boolean(instruction.instructionSent || instruction.instruction_sent))]
  }
  return [basic(selectedStep?.label || 'Stage requirement', completed)]
}

function BondWorkflowWorkspace({
  workspace,
  documents,
  loadingAction,
  onStageChange,
  onSubmitBankApplication,
  onUpdateBankApplication,
  onCaptureBondOffer,
  onAcceptOffer,
  onDeclineOffer,
  onMarkGrantMilestone,
  onMarkInstructionSent,
  onOpenDocument,
}) {
  const bondGroup = workspace.railGroups.find((group) => group.key === 'bond') || workspace.railGroups[0] || { steps: [] }
  const currentStep = bondGroup.steps.find((step) => step.status === 'current') || bondGroup.steps.find((step) => step.status !== 'completed') || bondGroup.steps[0] || null
  const [selectedStageKey, setSelectedStageKey] = useState(currentStep?.key || '')
  const [activeTaskTab, setActiveTaskTab] = useState('checklist')

  useEffect(() => {
    if (!bondGroup.steps.some((step) => step.key === selectedStageKey)) {
      setSelectedStageKey(currentStep?.key || bondGroup.steps[0]?.key || '')
    }
  }, [bondGroup.steps, currentStep?.key, selectedStageKey])

  const selectedStep = bondGroup.steps.find((step) => step.key === selectedStageKey) || currentStep || bondGroup.steps[0] || null
  const requirements = getBondStageRequirements(selectedStep?.key, selectedStep, workspace)
  const attentionItems = requirements.filter((item) => item.status !== 'completed')
  const stageDocuments = getBondStageDocuments(selectedStep?.key, workspace)
  const editable = workspace.permissions.canManageApplications || workspace.permissions.canMarkInstructionSent || workspace.permissions.canAcceptOffer

  return (
    <FinanceWorkspaceFrame title="Bond Workflow" copy="Operational bond stages, task requirements, documents and actions.">
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-[8px] border border-[#dbe5ef] bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.045)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-[#142132]">Bond Workflow</h4>
              <p className="mt-1 text-sm text-[#66758b]">{bondGroup.steps.length} stages visible</p>
            </div>
            <span className="text-xs font-semibold text-[#08734f]">
              {bondGroup.steps.length ? Math.round((bondGroup.steps.filter((step) => step.status === 'completed').length / bondGroup.steps.length) * 100) : 0}%
            </span>
          </div>
          <div className="mt-4 space-y-1.5">
            {bondGroup.steps.map((step, index) => {
              const active = step.key === selectedStep?.key
              const Icon = step.status === 'completed' ? CheckCircle2 : step.status === 'current' ? Clock3 : Circle
              return (
                <button
                  key={step.key}
                  type="button"
                  className={`flex w-full items-start gap-3 rounded-[8px] px-3 py-3 text-left transition ${
                    active ? 'border border-[#ccebdc] bg-[#effbf5]' : 'border border-transparent hover:bg-[#f7fbff]'
                  }`}
                  onClick={() => setSelectedStageKey(step.key)}
                >
                  <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${getStepTone(step.status)}`}>
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm font-semibold text-[#142132]">{index + 1}. {step.label}</strong>
                    <span className="mt-1 block text-xs font-medium text-[#61758a]">{getStepStatusLabel(step.status)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        <main className="rounded-[8px] border border-[#dbe5ef] bg-white shadow-[0_10px_22px_rgba(15,23,42,0.045)]">
          <div className="border-b border-[#e5ecf4] px-5 py-4">
            <p className="text-xs font-semibold text-[#35546c]">Bond Workflow Stage</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h4 className="text-xl font-semibold tracking-[-0.02em] text-[#101b2d]">{selectedStep?.label || 'Bond stage'}</h4>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusTone(selectedStep?.status || 'pending')}`}>
                {getStepStatusLabel(selectedStep?.status)}
              </span>
            </div>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ['Status', getStepStatusLabel(selectedStep?.status)],
                ['Assigned To', selectedStep?.responsibleRole || 'Finance team'],
                ['Due Date', formatDate(selectedStep?.completedAt, 'Not set')],
                ['Dependencies', attentionItems.length ? `${attentionItems.length} open` : 'None'],
              ].map(([label, value]) => (
                <article key={label} className="rounded-[8px] border border-[#e5ecf4] bg-[#fbfdff] px-3 py-3">
                  <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[#8ca0b6]">{label}</span>
                  <strong className="mt-1 block text-sm font-semibold text-[#142132]">{value}</strong>
                </article>
              ))}
            </div>

            {attentionItems.length ? (
              <div className="rounded-[8px] border border-[#ffd596] bg-[#fff8e8] px-4 py-3 text-sm text-[#9a4b00]">
                <strong className="block font-semibold">Action required</strong>
                <span className="mt-1 block">{attentionItems[0].label} is not complete.</span>
              </div>
            ) : null}

            <div className="border-b border-[#e5ecf4]">
              <div className="flex flex-wrap gap-5">
                {[
                  ['checklist', 'Checklist', requirements.length],
                  ['documents', 'Documents', stageDocuments.length],
                  ['notes', 'Notes', 0],
                  ['activity', 'Activity', 0],
                ].map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    className={`border-b-2 pb-3 text-sm font-semibold ${
                      activeTaskTab === key ? 'border-[#0f8f63] text-[#08734f]' : 'border-transparent text-[#526780]'
                    }`}
                    onClick={() => setActiveTaskTab(key)}
                  >
                    {label} <span className="ml-1 rounded-full bg-[#edf4fb] px-1.5 py-0.5 text-xs text-[#526780]">{count}</span>
                  </button>
                ))}
              </div>
            </div>

            {activeTaskTab === 'checklist' ? (
              <div className="overflow-hidden rounded-[8px] border border-[#e1e9f2]">
                {requirements.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 border-b border-[#edf2f7] px-4 py-3 last:border-b-0">
                    <span>
                      <strong className="block text-sm font-semibold text-[#142132]">{item.label}</strong>
                      {item.detail ? <span className="block text-xs text-[#70839a]">{item.detail}</span> : null}
                    </span>
                    <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusTone(item.status)}`}>
                      {titleCaseStatus(item.status)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {activeTaskTab === 'documents' ? (
              <FinanceDocumentList rows={stageDocuments} emptyMessage="No documents are linked to this stage yet." onOpenDocument={onOpenDocument} />
            ) : null}

            {activeTaskTab === 'notes' ? <EmptyState message="No finance notes recorded for this stage yet." /> : null}
            {activeTaskTab === 'activity' ? (
              <BankOutcomeHistory rows={workspace.bond.bankOutcomes} />
            ) : null}

            <div className="sticky bottom-0 -mx-5 -mb-4 flex flex-wrap items-center gap-3 border-t border-[#e5ecf4] bg-white px-5 py-4">
              <Button type="button" disabled={!editable || !selectedStep || Boolean(loadingAction)} onClick={() => onStageChange?.(selectedStep?.key)}>
                <CheckCircle2 size={15} />
                Mark Complete
              </Button>
              <Button type="button" variant="secondary" disabled>
                <ShieldCheck size={15} />
                Mark Blocked
              </Button>
              <Button type="button" variant="secondary" disabled>
                <Clock3 size={15} />
                Mark Waiting
              </Button>
              <Button type="button" variant="secondary" disabled>
                More Actions
                <MoreHorizontal size={15} />
              </Button>
            </div>
          </div>
        </main>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Bank Applications" copy="Submitted applications, references, originator, and status.">
          <ApplicationsSection
            rows={workspace.bond.applications}
            canManage={workspace.permissions.canManageApplications}
            loadingAction={loadingAction}
            onSubmit={onSubmitBankApplication}
            onUpdateStatus={(row, status) => onUpdateBankApplication?.(row, { status })}
          />
        </SectionCard>
        <SectionCard title="Offers / Buyer Decision" copy="Received bank offers, quote documents, and buyer outcome.">
          <OffersSection
            rows={workspace.bond.offers}
            acceptedOfferId={workspace.bond.acceptedOffer?.id || ''}
            canManage={workspace.permissions.canManageOffers}
            canAccept={workspace.permissions.canAcceptOffer}
            loadingAction={loadingAction}
            onSubmit={(payload) => onCaptureBondOffer?.(payload)}
            onAccept={(row) => onAcceptOffer?.(row)}
            onDecline={(row) => onDeclineOffer?.(row)}
            onOpenDocument={onOpenDocument}
          />
        </SectionCard>
        <SectionCard title="Grant Milestones" copy="Grant received, signed and submitted.">
          <GrantMilestoneCard
            instruction={workspace.bond.instruction}
            acceptedOffer={workspace.bond.acceptedOffer}
            documents={documents}
            canMark={workspace.permissions.canMarkInstructionSent}
            loadingAction={loadingAction}
            onSubmit={(payload) => onMarkGrantMilestone?.(payload)}
            onOpenDocument={onOpenDocument}
          />
        </SectionCard>
        <SectionCard title="Instruction to Attorney" copy="Bond instruction handoff to the transfer attorneys.">
          <InstructionCard
            instruction={workspace.bond.instruction}
            acceptedOffer={workspace.bond.acceptedOffer}
            canMark={workspace.permissions.canMarkInstructionSent}
            loadingAction={loadingAction}
            onSubmit={(payload) => onMarkInstructionSent?.(payload)}
            onOpenDocument={onOpenDocument}
          />
        </SectionCard>
      </div>
    </FinanceWorkspaceFrame>
  )
}

function FinanceHandoverPage({ workspace, transaction, documents, loadingAction, handoffPanel = null, onMarkGrantMilestone, onMarkInstructionSent, onOpenDocument }) {
  return (
    <FinanceWorkspaceFrame title="Handover / Transfer" copy="Bond grant, attorney handoff and submission package.">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.5fr)]">
        <main className="space-y-4">
          {handoffPanel}
          <SectionCard title="Bond Grant">
            <GrantMilestoneCard
              instruction={workspace.bond.instruction}
              acceptedOffer={workspace.bond.acceptedOffer}
              documents={documents}
              canMark={workspace.permissions.canMarkInstructionSent}
              loadingAction={loadingAction}
              onSubmit={(payload) => onMarkGrantMilestone?.(payload)}
              onOpenDocument={onOpenDocument}
            />
          </SectionCard>
          <SectionCard title="Attorney Handoff">
            <InstructionCard
              instruction={workspace.bond.instruction}
              acceptedOffer={workspace.bond.acceptedOffer}
              canMark={workspace.permissions.canMarkInstructionSent}
              loadingAction={loadingAction}
              onSubmit={(payload) => onMarkInstructionSent?.(payload)}
              onOpenDocument={onOpenDocument}
            />
          </SectionCard>
        </main>
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <SectionCard title="Submission Package">
            <FinanceDocumentList rows={[...workspace.bond.supportingDocuments, ...workspace.bond.offerDocuments, ...workspace.bond.instructionDocuments]} emptyMessage="No handover documents uploaded yet." onOpenDocument={onOpenDocument} />
          </SectionCard>
          <RegistrationHandoffCard transaction={transaction} />
        </aside>
      </div>
    </FinanceWorkspaceFrame>
  )
}

function FinanceAuditPage({ workspace, transaction }) {
  const auditRows = [
    { id: 'stage', label: 'Current finance stage', value: workspace.summaryBlocks.find((item) => item.key === 'current_stage')?.value || 'Not captured' },
    { id: 'blocker', label: 'Blocker status', value: workspace.summaryBlocks.find((item) => item.key === 'blocker_status')?.value || 'No blockers' },
    { id: 'updated', label: 'Matter updated', value: formatDate(transaction?.updated_at || transaction?.updatedAt, 'Not recorded') },
  ]
  return (
    <FinanceWorkspaceFrame title="Audit Log" copy="Ledger history, workflow updates and bank outcome history.">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)]">
        <SectionCard title="Timeline">
          <div className="space-y-2">
            {auditRows.map((row) => (
              <article key={row.id} className="rounded-[8px] border border-[#e5ecf4] bg-white px-3 py-3">
                <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[#8ca0b6]">{row.label}</span>
                <strong className="mt-1 block text-sm font-semibold text-[#142132]">{row.value}</strong>
              </article>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Bank Outcome History">
          <BankOutcomeHistory rows={workspace.bond.bankOutcomes} />
        </SectionCard>
      </div>
    </FinanceWorkspaceFrame>
  )
}

function FinanceCommandCenter({
  transaction = {},
  workflowData = null,
  requiredDocumentChecklist = [],
  documents = [],
  viewerRole = '',
  activeViewerPermissions = null,
  financeReadinessHandoff = null,
  matterAccountsPanel = null,
  handoffPanel = null,
  loadingAction = '',
  onUploadDocument,
  onSubmitBankApplication,
  onUpdateBankApplication,
  onCaptureBondOffer,
  onAcceptOffer,
  onDeclineOffer,
  onStageChange,
  onMarkGrantMilestone,
  onMarkInstructionSent,
  onReviewDocuments,
  onVerifyProofOfFunds,
  onUpdateBlockers,
  onOpenDocument,
}) {
  const location = useLocation()
  const navigate = useNavigate()
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

  const hasBondLikeFinance = workspace.financeType === 'bond' || workspace.financeType === 'combination'
  const hasBondWorkflow = hasBondLikeFinance && workspace.originatorManagedFinance
  const hasExternalBondFinance = hasBondLikeFinance && workspace.clientManagedBondFinance
  const hasCashWorkflow = workspace.financeType === 'cash' || workspace.financeType === 'combination'
  const hasDeveloperWorkflow = workspace.financeType === 'developer'
  const defaultWorkspaceKey = hasBondWorkflow ? 'bond-workflow' : 'accounts'
  const [activeWorkspaceKey, setActiveWorkspaceKey] = useState(() => {
    const search = typeof window !== 'undefined' ? window.location.search : ''
    const params = new URLSearchParams(search)
    const urlKey = normalizeFinanceWorkspaceKey(params.get('financeWorkspace'))
    if (urlKey) return urlKey
    if (typeof window !== 'undefined') {
      return normalizeFinanceWorkspaceKey(window.localStorage?.getItem(FINANCE_WORKSPACE_STORAGE_KEY)) || defaultWorkspaceKey
    }
    return defaultWorkspaceKey
  })

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const urlKey = normalizeFinanceWorkspaceKey(params.get('financeWorkspace'))
    if (urlKey && urlKey !== activeWorkspaceKey) {
      setActiveWorkspaceKey(urlKey)
    }
  }, [activeWorkspaceKey, location.search])

  function handleWorkspaceChange(nextKey) {
    const normalizedKey = normalizeFinanceWorkspaceKey(nextKey) || 'accounts'
    setActiveWorkspaceKey(normalizedKey)
    if (typeof window !== 'undefined') {
      window.localStorage?.setItem(FINANCE_WORKSPACE_STORAGE_KEY, normalizedKey)
    }
    const params = new URLSearchParams(location.search)
    params.set('financeWorkspace', normalizedKey)
    navigate({ pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash }, { replace: false })
  }

  const financeCommandCard = (
    <SectionCard
      title="Finance Command"
      copy="Blockers, ownership, and next action."
      actions={<ShieldCheck size={16} className="text-[#6d8197]" />}
    >
      <div className="space-y-2.5">
        <article className="rounded-[8px] border border-[#e5ecf4] bg-white px-3 py-3">
          <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8ca0b6]">Current Blocker</span>
          <strong className="mt-1 block text-sm font-semibold text-[#142132]">{workspace.summaryBlocks.find((item) => item.key === 'blocker_status')?.value || 'No blockers'}</strong>
          <p className="mt-1 text-xs leading-4 text-[#70839a]">{workspace.summaryBlocks.find((item) => item.key === 'next_action')?.value || 'Review finance progress.'}</p>
        </article>
        {workspace.permissions.canUpdateBlockers ? (
          <form
            className="rounded-[8px] border border-[#e5ecf4] bg-[#fbfdff] p-3"
            onSubmit={(event) => {
              event.preventDefault()
              onUpdateBlockers?.(blockerForm)
              setBlockerForm({ blockerStatus: '', nextAction: '', financeOwner: '' })
            }}
          >
            <div className="grid gap-2">
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
  )

  const activeFinanceWorkspace =
    activeWorkspaceKey === 'requests' ? (
      <FinanceRequestsPage
        workspace={workspace}
        hasExternalBondFinance={hasExternalBondFinance}
        hasCashWorkflow={hasCashWorkflow}
        hasDeveloperWorkflow={hasDeveloperWorkflow}
        proofStatusItems={proofStatusItems}
        uploadingKey={uploadingKey}
        handleRequirementUpload={handleRequirementUpload}
        loadingAction={loadingAction}
        onReviewDocuments={onReviewDocuments}
        onVerifyProofOfFunds={onVerifyProofOfFunds}
        onOpenDocument={onOpenDocument}
      />
    ) : activeWorkspaceKey === 'payments' ? (
      <FinancePaymentsPage workspace={workspace} />
    ) : activeWorkspaceKey === 'documents' ? (
      <FinanceDocumentsPage
        workspace={workspace}
        uploadingKey={uploadingKey}
        handleRequirementUpload={handleRequirementUpload}
        onOpenDocument={onOpenDocument}
      />
    ) : activeWorkspaceKey === 'bond-workflow' ? (
      hasBondWorkflow ? (
        <BondWorkflowWorkspace
          workspace={workspace}
          documents={documents}
          loadingAction={loadingAction}
          onStageChange={onStageChange}
          onSubmitBankApplication={onSubmitBankApplication}
          onUpdateBankApplication={onUpdateBankApplication}
          onCaptureBondOffer={onCaptureBondOffer}
          onAcceptOffer={onAcceptOffer}
          onDeclineOffer={onDeclineOffer}
          onMarkGrantMilestone={onMarkGrantMilestone}
          onMarkInstructionSent={onMarkInstructionSent}
          onOpenDocument={onOpenDocument}
        />
      ) : (
        <FinanceWorkspaceFrame title="Bond Workflow" copy="This matter is not using an originator-managed bond workflow.">
          <ProgressRail groups={workspace.railGroups} />
        </FinanceWorkspaceFrame>
      )
    ) : activeWorkspaceKey === 'handover' ? (
      <FinanceHandoverPage
        workspace={workspace}
        transaction={transaction}
        documents={documents}
        loadingAction={loadingAction}
        handoffPanel={handoffPanel}
        onMarkGrantMilestone={onMarkGrantMilestone}
        onMarkInstructionSent={onMarkInstructionSent}
        onOpenDocument={onOpenDocument}
      />
    ) : activeWorkspaceKey === 'audit' ? (
      <FinanceAuditPage workspace={workspace} transaction={transaction} />
    ) : (
      <FinanceAccountsPage
        workspace={workspace}
        proofStatusItems={proofStatusItems}
        financeCommandCard={financeCommandCard}
        financeReadinessHandoff={financeReadinessHandoff}
        matterAccountsPanel={matterAccountsPanel}
      />
    )

  return (
    <div className="space-y-5">
      <FinanceWorkspaceNav activeKey={activeWorkspaceKey} onChange={handleWorkspaceChange} />
      <OwnershipBadgeStrip
        financeType={workspace.financeType}
        financeOwner={workspace.financeOwner}
        originatorManagedFinance={workspace.originatorManagedFinance}
        clientManagedBondFinance={workspace.clientManagedBondFinance}
        canProxyFinanceWorkflow={workspace.permissions.canProxyFinanceWorkflow}
      />
      {activeFinanceWorkspace}
    </div>
  )
}

export default FinanceCommandCenter
