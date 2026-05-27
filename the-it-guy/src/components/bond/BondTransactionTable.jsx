import { useNavigate } from 'react-router-dom'
import BondEmptyState from './BondEmptyState'
import BondRiskBadge from './BondRiskBadge'
import BondSectionCard from './BondSectionCard'
import BondStatusBadge from './BondStatusBadge'
import BondTransactionStatusBadge from './BondTransactionStatusBadge'

function HeaderCell({ children, className = '' }) {
  return (
    <th className={`bg-[#f8fbff] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-[#7d90a5] ${className}`.trim()}>
      {children}
    </th>
  )
}

export default function BondTransactionTable({ rows = [] }) {
  const navigate = useNavigate()

  return (
    <BondSectionCard
      eyebrow="Linked Transactions"
      title="Property deals still in motion after finance approval"
      description="Bond applications stay attached here through grant signing, instruction to attorneys, transfer progress, and final registration."
      padded={false}
      contentClassName="mt-0"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 z-[1]">
            <tr>
              <HeaderCell>Buyer / Client</HeaderCell>
              <HeaderCell>Property</HeaderCell>
              <HeaderCell>Agent / Developer</HeaderCell>
              <HeaderCell>Attorney</HeaderCell>
              <HeaderCell>Finance Stage</HeaderCell>
              <HeaderCell>Transfer Stage</HeaderCell>
              <HeaderCell>Bond Status</HeaderCell>
              <HeaderCell>Last Activity</HeaderCell>
              <HeaderCell>Next Action</HeaderCell>
              <HeaderCell className="text-right">Action</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="cursor-pointer border-t border-[#edf2f7] transition hover:bg-[#fbfdff]"
                onClick={() => row.transactionId && navigate(`/transactions/${row.transactionId}`)}
              >
                <td className="px-4 py-4 align-top">
                  <p className="text-sm font-semibold text-[#142132]">{row.client}</p>
                  <p className="mt-1 text-xs text-[#71869d]">{row.consultant}</p>
                  <p className="mt-2 text-xs text-[#7b8ea3]">Processor: {row.processor}</p>
                </td>
                <td className="px-4 py-4 align-top">
                  <p className="text-sm font-semibold text-[#142132]">{row.property}</p>
                  <p className="mt-1 text-xs text-[#71869d]">{row.bank}</p>
                  <p className="mt-2 text-xs text-[#7b8ea3]">{row.bondAmountLabel}</p>
                </td>
                <td className="px-4 py-4 align-top text-sm text-[#17324d]">{row.partner}</td>
                <td className="px-4 py-4 align-top text-sm text-[#17324d]">{row.attorney}</td>
                <td className="px-4 py-4 align-top">
                  <p className="text-sm font-semibold text-[#142132]">{row.financeStageLabel}</p>
                  <div className="mt-2">
                    <BondStatusBadge
                      status={row.linkedApplicationId ? 'client_portal_active' : 'awaiting_contact'}
                      label={row.linkedApplicationId ? 'Linked application active' : 'Application link pending'}
                    />
                  </div>
                </td>
                <td className="px-4 py-4 align-top">
                  <p className="text-sm font-semibold text-[#142132]">{row.transferStageLabel}</p>
                  <p className="mt-1 text-xs text-[#71869d]">{row.registrationStatus}</p>
                </td>
                <td className="px-4 py-4 align-top">
                  <BondTransactionStatusBadge
                    status={row.status}
                    label={row.status === 'at_risk' ? row.riskStatus : row.registrationStatus}
                  />
                </td>
                <td className="px-4 py-4 align-top">
                  <p className="text-sm font-semibold text-[#142132]">{row.lastActivityLabel}</p>
                  <div className="mt-2">
                    <BondRiskBadge
                      status={row.status === 'at_risk' ? 'overdue' : 'healthy'}
                      label={row.status === 'at_risk' ? row.riskStatus : 'On track'}
                    />
                  </div>
                </td>
                <td className="px-4 py-4 align-top text-sm leading-6 text-[#17324d]">{row.nextAction}</td>
                <td className="px-4 py-4 align-top text-right">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (row.transactionId) {
                        navigate(`/transactions/${row.transactionId}`)
                      }
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-[12px] border border-[#dbe5f0] bg-[#f8fbff] px-3 text-sm font-semibold text-[#17324d] transition hover:border-[#c5d5e6]"
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}

            {!rows.length ? (
              <tr>
                <td colSpan={10} className="px-4 py-6">
                  <BondEmptyState
                    compact
                    title="No linked transactions found"
                    description="When bond-linked property transactions match this view, they will appear here."
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
