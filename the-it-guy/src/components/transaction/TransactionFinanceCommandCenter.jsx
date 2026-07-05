import { useMemo, useState } from 'react'
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
import FinanceProgressBar from '../finance/FinanceProgressBar'

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

function getOwnershipValue(sources = [], fallback = 'Unassigned') {
  return sources.map((value) => String(value || '').trim()).find(Boolean) || fallback
}

function buildApplicationOwnershipCard(transaction = {}, workspace = {}) {
  const application = workspace.bond?.applications?.[0] || {}
  return {
    consultant: getOwnershipValue([
      transaction.assignedConsultantName,
      transaction.assigned_consultant_name,
      transaction.assignedBondOriginatorName,
      transaction.assigned_bond_originator_name,
      transaction.assigned_agent,
      application.originatorName,
      application.assignedUserName,
      application.assigned_user_name,
      application.assignedUserEmail,
      application.assigned_user_email,
    ]),
    branch: getOwnershipValue([
      transaction.assignedBranchName,
      transaction.assigned_branch_name,
      transaction.branch,
      transaction.branch_name,
      application.branch,
      application.assignedBranchName,
      application.assigned_branch_name,
      transaction.assignedBranchId,
      transaction.assigned_branch_id,
      application.assignedBranchId,
      application.assigned_branch_id,
    ]),
    region: getOwnershipValue([
      transaction.assignedRegionName,
      transaction.assigned_region_name,
      transaction.region,
      transaction.region_name,
      application.region,
      application.assignedRegionName,
      application.assigned_region_name,
      transaction.assignedRegionId,
      transaction.assigned_region_id,
      application.assignedRegionId,
      application.assigned_region_id,
    ]),
    assignedAt: getOwnershipValue([
      transaction.assignedAt,
      transaction.assigned_at,
      application.assignedAt,
      application.assigned_at,
      application.scope_metadata?.assignedAt,
    ], 'Not assigned yet'),
    method: getOwnershipValue([
      transaction.assignmentMethod,
      transaction.assignment_method,
      transaction.bond_assignment_method,
      application.assignmentMethod,
      application.assignment_method,
      application.bond_assignment_method,
      application.scope_metadata?.method,
    ], 'Not assigned'),
    routingSource: getOwnershipValue([
      transaction.routingSource,
      transaction.routing_source,
      application.routingSource,
      application.routing_source,
      application.scope_metadata?.routingSource,
    ], 'Not captured'),
    routingRule: getOwnershipValue([
      transaction.routingRuleId,
      transaction.routing_rule_id,
      application.routingRuleId,
      application.routing_rule_id,
      application.scope_metadata?.routingRuleId,
    ], 'No rule'),
  }
}

const SUMMARY_ICONS = {
  finance_type: Landmark,
  finance_owner: UserRound,
  current_stage: FileText,
  next_action: ClipboardCheck,
  blocker_status: BadgeCheck,
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

function FinanceCommandCenter({
  transaction = {},
  workflowData = null,
  requiredDocumentChecklist = [],
  documents = [],
  viewerRole = '',
  activeViewerPermissions = null,
  financeReadinessHandoff = null,
  loadingAction = '',
  onUploadDocument,
  onSubmitBankApplication,
  onUpdateBankApplication,
  onCaptureBondOffer,
  onAcceptOffer,
  onDeclineOffer,
  onMarkGrantMilestone,
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
  const hasBondLikeFinance = workspace.financeType === 'bond' || workspace.financeType === 'combination'
  const hasBondWorkflow = hasBondLikeFinance && workspace.originatorManagedFinance
  const hasExternalBondFinance = hasBondLikeFinance && workspace.clientManagedBondFinance
  const hasBondDocumentWorkflow = hasBondLikeFinance
  const hasCashWorkflow = workspace.financeType === 'cash' || workspace.financeType === 'combination'
  const hasDeveloperWorkflow = workspace.financeType === 'developer'
  const applicationOwnership = buildApplicationOwnershipCard(transaction, workspace)
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

  return (
    <div className="space-y-4">
      <div className="grid overflow-hidden rounded-[8px] border border-[#dbe5ef] bg-white shadow-[0_10px_22px_rgba(15,23,42,0.045)] sm:grid-cols-2 xl:grid-cols-5">
        {workspace.summaryBlocks.map((item) => (
          <SummaryBlock key={item.key} item={item} />
        ))}
      </div>

      <OwnershipBadgeStrip
        financeType={workspace.financeType}
        financeOwner={workspace.financeOwner}
        originatorManagedFinance={workspace.originatorManagedFinance}
        clientManagedBondFinance={workspace.clientManagedBondFinance}
        canProxyFinanceWorkflow={workspace.permissions.canProxyFinanceWorkflow}
      />

      {hasBondWorkflow ? (
        <div className={workspace.financeType === 'combination' ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.55fr)]' : ''}>
          <FinanceProgressBar
            workflowData={workflowData}
            mode="readonly"
            viewerRole={viewerRole}
            title="Bond Application Progress"
            description={workspace.financeType === 'combination'
              ? 'Bond lane progress for the hybrid finance workflow.'
              : 'Bond finance workflow status shared across Arch9.'}
          />
          {workspace.financeType === 'combination' ? (
            <CashPortionStatusPanel items={proofStatusItems} />
          ) : null}
        </div>
      ) : (
        <ProgressRail groups={workspace.railGroups} />
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <main className="space-y-4">
          {hasBondDocumentWorkflow ? (
            <SectionCard
              title={hasExternalBondFinance ? 'External Finance Documents' : 'Buyer Finance Documents'}
              copy={
                hasExternalBondFinance
                  ? 'Approval letters, bank confirmations, and buyer-arranged finance evidence.'
                  : 'Required buyer finance documents and upload status.'
              }
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
            </SectionCard>
          ) : null}

          {hasCashWorkflow ? (
            <SectionCard
              title={workspace.financeType === 'combination' ? 'Cash Portion Evidence' : 'Proof Of Funds Evidence'}
              copy="Proof of funds, deposit support, source of funds, and guarantees."
              actions={workspace.permissions.canVerifyProofOfFunds ? (
                <Button type="button" size="sm" variant="secondary" disabled={Boolean(loadingAction)} onClick={() => onVerifyProofOfFunds?.()}>
                  Verify proof of funds
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

          {hasDeveloperWorkflow ? (
            <SectionCard
              title="Developer Finance Application"
              copy="Application, deposit, approval, and payment schedule support."
            >
              <div className="space-y-3">
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

          {hasBondWorkflow ? (
            <SectionCard
              title="Bank Applications"
              copy="Submitted applications, references, originator, and status."
            >
              <ApplicationsSection
                rows={workspace.bond.applications}
                canManage={workspace.permissions.canManageApplications}
                loadingAction={loadingAction}
                onSubmit={onSubmitBankApplication}
                onUpdateStatus={(row, status) => onUpdateBankApplication?.(row, { status })}
              />
            </SectionCard>
          ) : null}

          {hasBondWorkflow ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
              <SectionCard
                title="Offers / Buyer Decision"
                copy="Received bank offers, quote documents, and buyer outcome."
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

              <SectionCard
                title="Buyer Decision"
                copy="Accepted or declined quote outcome."
              >
                <DecisionCard
                  acceptedOffer={workspace.bond.acceptedOffer}
                  latestDecision={workspace.bond.latestDecision}
                  offers={workspace.bond.offers}
                  canAccept={workspace.permissions.canAcceptOffer}
                  loadingAction={loadingAction}
                  onAccept={(row) => onAcceptOffer?.(row)}
                  onDecline={(row) => onDeclineOffer?.(row)}
                  onOpenDocument={onOpenDocument}
                />
              </SectionCard>
            </div>
          ) : null}

          {hasDeveloperWorkflow ? (
            <SectionCard
              title="Developer Approval"
              copy="Approval letters, signed terms, and payment schedule."
            >
              <div className="space-y-3">
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

          {hasBondWorkflow ? (
            <SectionCard
              title="Instruction to Attorney"
              copy="Bond instruction handoff to the transfer attorneys."
            >
              <div className="space-y-4">
                <GrantMilestoneCard
                  instruction={workspace.bond.instruction}
                  acceptedOffer={workspace.bond.acceptedOffer}
                  documents={documents}
                  canMark={workspace.permissions.canMarkInstructionSent}
                  loadingAction={loadingAction}
                  onSubmit={(payload) => onMarkGrantMilestone?.(payload)}
                  onOpenDocument={onOpenDocument}
                />
                <InstructionCard
                  instruction={workspace.bond.instruction}
                  acceptedOffer={workspace.bond.acceptedOffer}
                  canMark={workspace.permissions.canMarkInstructionSent}
                  loadingAction={loadingAction}
                  onSubmit={(payload) => onMarkInstructionSent?.(payload)}
                  onOpenDocument={onOpenDocument}
                />
              </div>
            </SectionCard>
          ) : null}
        </main>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          {hasBondWorkflow ? (
            <IndicativeFinanceReadinessContainer handoff={financeReadinessHandoff} variant="compact" />
          ) : null}

          {hasBondWorkflow ? (
            <SectionCard
              title="Bond Application Owner"
              copy="Originator assignment, routing, and ownership."
              actions={<UserRound size={16} className="text-[#6d8197]" />}
            >
              <div className="grid gap-2">
                {[
                  { label: 'Consultant', value: applicationOwnership.consultant },
                  { label: 'Branch', value: applicationOwnership.branch },
                  { label: 'Region', value: applicationOwnership.region },
                  { label: 'Assigned', value: formatDate(applicationOwnership.assignedAt, applicationOwnership.assignedAt) },
                  { label: 'Method', value: title(applicationOwnership.method) },
                  { label: 'Routing Source', value: title(applicationOwnership.routingSource) },
                  { label: 'Routing Rule', value: applicationOwnership.routingRule },
                ].map((item) => (
                  <article key={item.label} className="rounded-[8px] border border-[#e5ecf4] bg-[#fbfdff] px-3 py-3">
                    <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[#8ca0b6]">{item.label}</span>
                    <strong className="mt-1 block text-sm font-semibold leading-5 text-[#142132]">{item.value}</strong>
                  </article>
                ))}
              </div>
            </SectionCard>
          ) : null}

          {financeCommandCard}
        </aside>
      </div>
    </div>
  )
}

export default FinanceCommandCenter
