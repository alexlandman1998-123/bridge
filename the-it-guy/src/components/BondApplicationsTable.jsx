import { ArrowRight } from 'lucide-react'
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

function BondApplicationsTable({ rows = [], onRowClick, title = 'Applications Queue' }) {
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
