import { useNavigate } from 'react-router-dom'
import BondEmptyState from './BondEmptyState'
import BondRiskBadge from './BondRiskBadge'
import BondStatusBadge from './BondStatusBadge'
import { FINANCE_INTELLIGENCE_DISCLAIMER } from '../../services/financeIntelligenceService'

function normalizeText(value) {
  return String(value || '').trim()
}

const PROGRESS_STAGE_ORDER = [
  'documents_received',
  'documents_reviewed',
  'applications_submitted',
  'quotes_received',
  'quote_approved',
  'instruction_sent',
]

const PROGRESS_STAGE_LABELS = {
  documents_received: 'Documents Received',
  documents_reviewed: 'Documents Reviewed',
  applications_submitted: 'Applications Submitted',
  quotes_received: 'Quotes Received',
  quote_approved: 'Quote Approved',
  instruction_sent: 'Instruction Sent',
  registered: 'Registered',
  declined: 'Declined',
}

export const APPLICATION_PROGRESS_STAGE_OPTIONS = [
  { key: 'all', label: 'All stages' },
  { key: 'documents_received', label: PROGRESS_STAGE_LABELS.documents_received },
  { key: 'documents_reviewed', label: PROGRESS_STAGE_LABELS.documents_reviewed },
  { key: 'applications_submitted', label: PROGRESS_STAGE_LABELS.applications_submitted },
  { key: 'quotes_received', label: PROGRESS_STAGE_LABELS.quotes_received },
  { key: 'quote_approved', label: PROGRESS_STAGE_LABELS.quote_approved },
  { key: 'instruction_sent', label: PROGRESS_STAGE_LABELS.instruction_sent },
  { key: 'registered', label: PROGRESS_STAGE_LABELS.registered },
  { key: 'declined', label: PROGRESS_STAGE_LABELS.declined },
]

export function resolveBondProgressStage(row = {}) {
  const normalized = {
    financeKey: normalizeText(row?.financeStageKey).toLowerCase(),
    financeLabel: normalizeText(row?.financeStageLabel).toLowerCase(),
    transferKey: normalizeText(row?.transferStageKey).toLowerCase(),
    transferLabel: normalizeText(row?.transferStageLabel).toLowerCase(),
    status: normalizeText(row?.status).toLowerCase(),
    risk: normalizeText(row?.riskStatus).toLowerCase(),
    nextAction: normalizeText(row?.nextAction).toLowerCase(),
  }

  if (normalized.status === 'cancelled') {
    return 'declined'
  }
  if (normalized.status === 'registered' || normalized.transferKey === 'registered') {
    return 'registered'
  }
  if (['bond_approved', 'bond_approved_', 'bond_instruction_sent', 'instruction_sent', 'grant_signed'].includes(normalized.financeKey)) {
    return 'instruction_sent'
  }
  if (['bond_application_open', 'pre_approval', 'docs_collection', 'finance_requested'].includes(normalized.financeKey)) {
    return normalized.financeKey === 'pre_approval' ? 'documents_reviewed' : 'documents_received'
  }
  if (normalized.financeKey === 'submitted_to_banks' || normalized.financeLabel.includes('submitted')) {
    return 'applications_submitted'
  }
  if (normalized.financeKey === 'bank_feedback' || normalized.status === 'bank_feedback' || normalized.risk.includes('bank feedback') || normalized.nextAction.includes('bank')) {
    return 'quotes_received'
  }
  if (normalized.status === 'approved' || normalized.financeLabel.includes('approved') || normalized.financeLabel.includes('quote')) {
    return 'quote_approved'
  }
  if (normalized.transferKey === 'lodgement' || normalized.transferLabel.includes('lodgement') || normalized.transferLabel.includes('registered')) {
    return 'instruction_sent'
  }

  return 'documents_received'
}

function resolveProgressStep(row = {}) {
  const stage = resolveBondProgressStage(row)
  if (stage === 'registered') {
    return PROGRESS_STAGE_ORDER.length - 1
  }
  if (stage === 'declined') {
    return 0
  }
  return PROGRESS_STAGE_ORDER.includes(stage) ? PROGRESS_STAGE_ORDER.indexOf(stage) : 0
}

function resolveProgressLabel(row = {}) {
  const mapped = resolveBondProgressStage(row)
  return (
    PROGRESS_STAGE_LABELS[mapped]
    || normalizeText(row?.financeStageLabel)
    || normalizeText(row?.transferStageLabel)
    || 'In progress'
  )
}

function buildActionCopy(nextAction = '') {
  const normalized = normalizeText(nextAction).toLowerCase()
  if (!normalized || normalized === 'no next action set') {
    return { label: 'Open', reason: '' }
  }
  if (/(review|check|verify|approve|audit)/.test(normalized)) {
    return { label: 'Review', reason: normalizeText(nextAction) }
  }
  if (/(follow|call|ping|contact|remind|update|chase)/.test(normalized)) {
    return { label: 'Follow up', reason: normalizeText(nextAction) }
  }
  if (/(doc|fica|statement|pay slip|contract|quote|upload|missing)/.test(normalized)) {
    return { label: 'Request docs', reason: normalizeText(nextAction) }
  }
  return { label: 'Open', reason: normalizeText(nextAction) }
}

function resolveProblemBadge(row = {}) {
  const status = normalizeText(row?.status).toLowerCase()
  const risk = normalizeText(row?.riskStatus).toLowerCase()
  const nextAction = normalizeText(row?.nextAction)

  if (status === 'at_risk' || normalizeText(row?.riskTone).toLowerCase() === 'risk') {
    return 'At risk'
  }
  if (/document|missing/.test(risk)) {
    return 'Documents outstanding'
  }
  if (/bank feedback/.test(risk)) {
    return 'Bank feedback'
  }
  if (nextAction) {
    return 'Needs action'
  }

  return ''
}

function HeaderCell({ children, className = '' }) {
  return (
    <th className={`bg-[#f8fbff] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-[#7d90a5] ${className}`.trim()}>
      {children}
    </th>
  )
}

export default function BondTransactionTable({ rows = [] }) {
  const navigate = useNavigate()
  const totalProgressStages = PROGRESS_STAGE_ORDER.length

  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dbe5f0] bg-white shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 z-[1]">
            <tr>
              <HeaderCell>Buyer</HeaderCell>
              <HeaderCell>Consultant</HeaderCell>
              <HeaderCell>Progress</HeaderCell>
              <HeaderCell>Last Activity</HeaderCell>
              <HeaderCell className="text-right">Action</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const progressIndex = resolveProgressStep(row)
              const progressStep = progressIndex + 1
              const progressPercent = Math.max(0, Math.min(100, Math.round((progressStep / totalProgressStages) * 100)))
              const progressLabel = resolveProgressLabel(row)
              const actionCopy = buildActionCopy(row?.nextAction)
              const issueBadge = resolveProblemBadge(row)
              const showActionReason = actionCopy.label !== 'Open' && Boolean(actionCopy.reason)

              return (
                <tr
                  key={row.key}
                  className="cursor-pointer border-t border-[#edf2f7] transition hover:bg-[#fbfdff]"
                  onClick={() => row.transactionId && navigate(`/bond/files/${row.transactionId}`)}
                >
                  <td className="w-[30%] px-4 py-4 align-top">
                    <p className="text-sm font-semibold text-[#142132]">{row.client || 'Buyer pending'}</p>
                    {row.bank ? <p className="mt-1 text-xs text-[#6e849b]">{row.bank}</p> : null}
                    {row.property ? <p className="mt-1 text-xs text-[#60758d]">{row.property}</p> : null}
                    {row.applicationReference ? <p className="mt-1 text-xs text-[#7b8ea3]">{row.applicationReference}</p> : null}
                  </td>
                  <td className="w-[22%] px-4 py-4 align-top">
                    <p className="text-sm font-semibold text-[#142132]">{row.consultant || 'Consultant pending'}</p>
                    <p className="mt-1 text-xs text-[#60758d]">
                      {row.partner ? `${row.partner}` : ''}
                      {row.partner && row.processor ? ' · ' : ''}
                      {row.processor || ''}
                      {!row.partner && !row.processor ? 'Source not linked' : ''}
                    </p>
                  </td>
                  <td className="w-[28%] px-4 py-4 align-top">
                    <p className="text-sm font-semibold text-[#142132]">{progressLabel}</p>
                    <p className="mt-1 text-xs font-semibold text-[#60758d]">{`${progressStep} / ${totalProgressStages}`}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e6edf6]">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-[#1c4f8a] to-[#1f66b3] transition-all"
                        style={{ width: `${progressPercent}%` }}
                        aria-hidden="true"
                      />
                    </div>
                    {issueBadge ? (
                      <BondStatusBadge
                        status={
                          issueBadge === 'At risk'
                            ? 'at_risk'
                            : issueBadge === 'Bank feedback'
                              ? 'bank_feedback'
                              : issueBadge === 'Needs action'
                                ? 'documents_required'
                                : 'documents_required'
                        }
                        label={issueBadge}
                        className="mt-2"
                      />
                    ) : null}
                  </td>
                  <td className="w-[20%] px-4 py-4 align-top text-sm text-[#17324d]">
                    <p className="font-semibold text-[#142132]">{row.lastActivityLabel || 'No recent update'}</p>
                    {row.nextAction && row.nextAction !== 'No next action set' ? (
                      <p className="mt-1 text-xs text-[#60758d]">{row.nextAction}</p>
                    ) : (
                      <BondRiskBadge
                        status={row.status === 'at_risk' ? 'overdue' : 'healthy'}
                        label={row.status === 'at_risk' ? row.riskStatus || 'At risk' : 'On track'}
                        className="mt-1 inline-flex"
                      />
                    )}
                  </td>
                  <td className="w-[14%] px-4 py-4 align-top text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (row.transactionId) {
                          navigate(`/bond/files/${row.transactionId}`)
                        }
                      }}
                      className="inline-flex h-9 min-w-24 items-center justify-center rounded-[12px] border border-[#dbe5f0] bg-[#f8fbff] px-3 text-sm font-semibold text-[#17324d] transition hover:border-[#c9d8ea] hover:bg-white"
                    >
                      {actionCopy.label}
                    </button>
                    {showActionReason ? <p className="mt-1 text-xs text-[#60758d]">{actionCopy.reason}</p> : null}
                  </td>
                </tr>
              )
            })}

            {!rows.length ? (
              <tr>
                <td colSpan={5} className="px-4 py-6">
                  <BondEmptyState
                    compact
                    title="No applications found."
                    description="When bond-linked applications match this view, they will appear here."
                  />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="border-t border-[#edf2f7] px-4 py-3 text-xs leading-5 text-[#60758d]">
        {FINANCE_INTELLIGENCE_DISCLAIMER}
      </p>
    </div>
  )
}
