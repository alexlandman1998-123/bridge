import { useMemo, useState } from 'react'
import { ArrowRight, Bell, FilePlus2 } from 'lucide-react'
import {
  BOND_OPERATIONAL_QUEUE_KEYS,
  buildBondNewApplicationViewModel,
} from '../services/bondOperationalQueueService'
import { BOND_INTAKE_STATUSES } from '../core/transactions/bondIntakeSelectors'
import { getBondApplicationStage } from '../core/transactions/bondSelectors'
import { getTransactionScopeForRow } from '../core/transactions/transactionScope'
import { resolveEffectiveBondAssignment } from '../services/bondAssignmentService'
import BondEmptyState from './bond/BondEmptyState'
import BondRiskBadge from './bond/BondRiskBadge'
import BondSectionCard from './bond/BondSectionCard'
import BondStatusBadge from './bond/BondStatusBadge'

const CURRENCY = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function formatCurrency(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) {
    return 'R 0'
  }

  return CURRENCY.format(amount)
}

function formatDate(value) {
  const parsed = new Date(value || 0)
  if (Number.isNaN(parsed.getTime())) {
    return '—'
  }

  return parsed.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getUpdatedAt(row) {
  return row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
}

function getDaysSinceUpdate(row) {
  const timestamp = new Date(getUpdatedAt(row) || 0).getTime()
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0
  return Math.max(0, Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24)))
}

function stageLabelFromKey(key) {
  if (key === 'docs_requested') return 'Documents Required'
  if (key === 'docs_received') return 'Ready for Submission'
  if (key === 'application_submitted') return 'Submitted'
  if (key === 'bank_reviewing') return 'Bank Feedback'
  if (key === 'approval_granted') return 'Approved'
  if (key === 'declined') return 'Declined'
  return 'Awaiting Documents'
}

function getPropertyLabel(row) {
  if (getTransactionScopeForRow(row) === 'private') {
    return (
      row?.transaction?.property_description ||
      row?.transaction?.property_address_line_1 ||
      [row?.transaction?.suburb, row?.transaction?.city].filter(Boolean).join(', ') ||
      'Private property matter'
    )
  }

  const unitNumber = row?.unit?.unit_number ? `Unit ${row.unit.unit_number}` : 'Unit pending'
  const development = row?.development?.name || 'Development pending'
  return `${unitNumber}, ${development}`
}

function getBuyerLabel(row) {
  return row?.buyer?.name || row?.transaction?.buyer_name || 'Buyer pending'
}

function getMissingDocumentCount(row) {
  const explicit = Number(row?.documentSummary?.missingCount)
  if (Number.isFinite(explicit)) return explicit
  const totalRequired = Number(row?.documentSummary?.totalRequired || 0)
  const uploadedCount = Number(row?.documentSummary?.uploadedCount || 0)
  return Math.max(totalRequired - uploadedCount, 0)
}

function getRiskMeta(row) {
  const stage = getBondApplicationStage(row)
  const missingDocuments = getMissingDocumentCount(row)
  const daysSinceUpdate = getDaysSinceUpdate(row)

  if (stage === 'declined') {
    return { status: 'overdue', label: 'Blocked' }
  }

  if (missingDocuments > 0) {
    return { status: 'watch', label: `${missingDocuments} doc${missingDocuments === 1 ? '' : 's'} missing` }
  }

  if (daysSinceUpdate >= 8) {
    return { status: 'overdue', label: `${daysSinceUpdate}d stale` }
  }

  return { status: 'healthy', label: 'On track' }
}

function resolveBankLabel(row) {
  return row?.transaction?.bank || row?.transaction?.selected_bank || 'Bank not assigned'
}

function resolveBondValue(row) {
  return formatCurrency(
    row?.transaction?.bond_amount ??
      row?.transaction?.loan_amount ??
      row?.transaction?.sales_price ??
      row?.unit?.price ??
      0,
  )
}

function resolveTeamAssignment(row) {
  const assignment = resolveEffectiveBondAssignment(row?.transaction || {})
  return {
    consultant:
      assignment.primaryConsultantName ||
      assignment.primaryConsultantEmail ||
      row?.transaction?.bond_originator ||
      'Unassigned consultant',
    processor:
      assignment.processorName ||
      assignment.processorEmail ||
      row?.transaction?.processor ||
      'Processor pending',
  }
}

function progressLabel(status = '') {
  if (status === 'SUBMITTED') return 'Submitted'
  if (status === 'IN_PROGRESS') return 'In progress'
  return 'Not started'
}

function intakeFilterLabel(status = '') {
  if (status === BOND_INTAKE_STATUSES.AWAITING_BUYER_APPLICATION) return 'Awaiting Buyer'
  if (status === BOND_INTAKE_STATUSES.BUYER_IN_PROGRESS) return 'In Progress'
  if (status === BOND_INTAKE_STATUSES.AWAITING_DOCUMENTS) return 'Awaiting Docs'
  if (status === BOND_INTAKE_STATUSES.READY_FOR_REVIEW) return 'Ready For Review'
  return 'All'
}

function NewApplicationsEmptyState() {
  return (
    <BondSectionCard
      eyebrow="Intake"
      title="New Applications"
      description="Review incoming Bond and Hybrid buyer applications before they are accepted into the active finance book."
    >
      <div className="rounded-[20px] border border-dashed border-[#d8e2ec] bg-[#fbfdff] px-5 py-7 text-center">
        <p className="text-lg font-semibold text-[#142132]">No new bond applications</p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#60758d]">
          When buyers select Bond or Hybrid and complete their onboarding, they will appear here for review.
        </p>
        <a
          href="/applications"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-[12px] border border-[#dbe5f0] bg-white px-4 text-sm font-semibold text-[#17324d] transition hover:border-[#c5d5e6]"
        >
          View all applications
        </a>
      </div>
    </BondSectionCard>
  )
}

function NewApplicationCard({ item, onRowClick }) {
  const sourceRow = item.sourceRow || {}
  const openRow = () => onRowClick(sourceRow)
  const missingPreview = item.missingDocumentLabels?.length
    ? item.missingDocumentLabels.slice(0, 2).join(', ')
    : 'No missing documents'

  return (
    <article className="rounded-[20px] border border-[#dbe5f0] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.035)]">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)_minmax(230px,0.65fr)] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#315f8c]" />
            <p className="truncate text-base font-semibold text-[#142132]">{item.buyerName}</p>
            <BondStatusBadge label={item.financeType} status="submitted" tone="blue" />
          </div>
          <p className="mt-2 text-sm font-semibold text-[#31445a]">{item.propertyLabel}</p>
          <p className="mt-1 text-sm text-[#60758d]">{item.developmentName} · {item.agentName}</p>
          <p className="mt-2 text-xs text-[#7a8fa5]">Preferred originator: {item.preferredOriginatorName}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Application</p>
            <p className="mt-2 text-sm font-semibold text-[#142132]">{progressLabel(item.bondApplicationStatus)}</p>
            <p className="mt-1 text-xs text-[#60758d]">{item.bondApplicationSubmittedAt ? formatDate(item.bondApplicationSubmittedAt) : item.ageLabel}</p>
          </div>
          <div className="rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Documents</p>
            <p className="mt-2 text-sm font-semibold text-[#142132]">
              {item.documentUploadedCount} / {item.documentRequiredCount} docs submitted
            </p>
            <p className="mt-1 truncate text-xs text-[#60758d]">{item.documentMissingCount} missing · {missingPreview}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:items-end">
          <BondStatusBadge label={item.intakeLabel} status={item.intakeStatus} tone={item.intakeUiTone} className="justify-center" />
          <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
            <button
              type="button"
              onClick={openRow}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-[12px] border border-[#dbe5f0] bg-[#f8fbff] px-3 text-sm font-semibold text-[#17324d] transition hover:border-[#c5d5e6]"
            >
              View
              <ArrowRight size={14} />
            </button>
            <button
              type="button"
              disabled
              className="inline-flex h-9 items-center justify-center gap-1 rounded-[12px] border border-[#dbe5f0] bg-white px-3 text-sm font-semibold text-[#8aa0b6] opacity-70"
            >
              <Bell size={14} />
              Remind Buyer
            </button>
            <button
              type="button"
              disabled
              className="inline-flex h-9 items-center justify-center gap-1 rounded-[12px] border border-[#dbe5f0] bg-white px-3 text-sm font-semibold text-[#8aa0b6] opacity-70"
            >
              <FilePlus2 size={14} />
              Request Documents
            </button>
            <button
              type="button"
              disabled={!item.canAccept}
              title={item.canAccept ? 'Accept action will be enabled in Phase 3.' : 'Application must be ready for review before it can be accepted.'}
              className="inline-flex h-9 items-center justify-center rounded-[12px] bg-[#143250] px-3 text-sm font-semibold text-white transition enabled:hover:bg-[#173a5e] disabled:cursor-not-allowed disabled:bg-[#c7d3df]"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function NewApplicationsInbox({ rows = [], onRowClick }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const items = useMemo(() => rows.map(buildBondNewApplicationViewModel), [rows])
  const visibleItems = statusFilter === 'all' ? items : items.filter((item) => item.intakeStatus === statusFilter)
  const filters = [
    { key: 'all', label: `All (${items.length})` },
    ...[
      BOND_INTAKE_STATUSES.AWAITING_BUYER_APPLICATION,
      BOND_INTAKE_STATUSES.BUYER_IN_PROGRESS,
      BOND_INTAKE_STATUSES.AWAITING_DOCUMENTS,
      BOND_INTAKE_STATUSES.READY_FOR_REVIEW,
    ].map((status) => ({
      key: status,
      label: `${intakeFilterLabel(status)} (${items.filter((item) => item.intakeStatus === status).length})`,
    })),
  ]

  if (!items.length) {
    return <NewApplicationsEmptyState />
  }

  return (
    <BondSectionCard
      eyebrow="Intake"
      title="New Applications"
      description="Incoming Bond and Hybrid transactions waiting for buyer completion, document readiness, or review."
      action={<span className="rounded-full border border-[#dbe5f0] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#516a83]">{visibleItems.length} new</span>}
    >
      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setStatusFilter(filter.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === filter.key
                ? 'border-[#143250] bg-[#143250] text-white'
                : 'border-[#dbe5f0] bg-[#f8fbff] text-[#516a83] hover:border-[#c5d5e6]'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {visibleItems.map((item) => (
          <NewApplicationCard key={item.id} item={item} onRowClick={onRowClick} />
        ))}
      </div>
    </BondSectionCard>
  )
}

function HeaderCell({ children, className = '' }) {
  return (
    <th className={`bg-[#f8fbff] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[#7d90a5] ${className}`.trim()}>
      {children}
    </th>
  )
}

function ApplicationRow({ row, onRowClick }) {
  const stageKey = getBondApplicationStage(row)
  const updatedAt = getUpdatedAt(row)
  const risk = getRiskMeta(row)
  const team = resolveTeamAssignment(row)
  const canOpenRow = Boolean(row?.unit?.id || row?.transaction?.id)

  const openRow = () => {
    if (!canOpenRow) return
    onRowClick(row)
  }

  return (
    <tr
      className={canOpenRow ? 'cursor-pointer border-t border-[#edf2f7] transition hover:bg-[#fbfdff]' : 'border-t border-[#edf2f7]'}
      onClick={openRow}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && canOpenRow) {
          event.preventDefault()
          openRow()
        }
      }}
      tabIndex={canOpenRow ? 0 : -1}
      role={canOpenRow ? 'button' : undefined}
    >
      <td className="px-4 py-4 align-top">
        <p className="text-sm font-semibold text-[#142132]">{getBuyerLabel(row)}</p>
        <p className="mt-1 text-xs text-[#71869d]">{row?.buyer?.email || row?.buyer?.phone || 'Client details pending'}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="text-sm font-semibold text-[#142132]">{getPropertyLabel(row)}</p>
        <p className="mt-1 text-xs text-[#71869d]">{row?.development?.suburb || row?.transaction?.suburb || row?.transaction?.city || 'Property context loading'}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="text-sm font-semibold text-[#142132]">{team.consultant}</p>
        <p className="mt-1 text-xs text-[#71869d]">Owner</p>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="text-sm font-semibold text-[#142132]">{team.processor}</p>
        <p className="mt-1 text-xs text-[#71869d]">Processor</p>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="text-sm font-semibold text-[#142132]">{resolveBankLabel(row)}</p>
        <p className="mt-1 text-xs text-[#71869d]">{resolveBondValue(row)}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <BondStatusBadge status={stageKey} label={stageLabelFromKey(stageKey)} />
      </td>
      <td className="px-4 py-4 align-top text-sm text-[#17324d]">{formatDate(updatedAt)}</td>
      <td className="px-4 py-4 align-top">
        <BondRiskBadge status={risk.status} label={risk.label} />
      </td>
      <td className="px-4 py-4 align-top text-right">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            openRow()
          }}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-[12px] border border-[#dbe5f0] bg-[#f8fbff] px-3 text-sm font-semibold text-[#17324d] transition hover:border-[#c5d5e6]"
        >
          Open
          <ArrowRight size={14} />
        </button>
      </td>
    </tr>
  )
}

function BondApplicationsTable({ rows = [], onRowClick, title = 'Applications Queue', queue = 'all' }) {
  if (queue === BOND_OPERATIONAL_QUEUE_KEYS.NEW_APPLICATIONS) {
    return <NewApplicationsInbox rows={rows} onRowClick={onRowClick} />
  }

  return (
    <BondSectionCard
      eyebrow="Applications"
      title={title}
      description="Manage the bond finance workflow separately from the post-approval property transaction tracker."
      action={<span className="rounded-full border border-[#dbe5f0] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#516a83]">{rows.length} applications</span>}
      padded={false}
      contentClassName="mt-0"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 z-[1]">
            <tr>
              <HeaderCell>Client</HeaderCell>
              <HeaderCell>Property</HeaderCell>
              <HeaderCell>Consultant</HeaderCell>
              <HeaderCell>Processor</HeaderCell>
              <HeaderCell>Bank / Value</HeaderCell>
              <HeaderCell>Stage</HeaderCell>
              <HeaderCell>Last Activity</HeaderCell>
              <HeaderCell>Risk</HeaderCell>
              <HeaderCell className="text-right">Action</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <ApplicationRow
                key={row?.transaction?.id || row?.unit?.id || `bond-row-${row?.buyer?.id || 'buyer'}`}
                row={row}
                onRowClick={onRowClick}
              />
            ))}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6">
                  <BondEmptyState
                    compact
                    title="No applications found"
                    description="When finance applications match this queue, they will appear here."
                  />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </BondSectionCard>
  )
}

export default BondApplicationsTable
