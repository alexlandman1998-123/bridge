import { ArrowLeft, ArrowUpRight, Bath, BedDouble, CarFront, Check, ChevronRight, Clock3, ImageOff, Ruler } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import { useWorkspace } from '../../context/WorkspaceContext'
import { getAgentClientProfile } from '../../core/clients/agentClientDirectory'
import { fetchTransactionsByParticipantSummary } from '../../lib/transactionsListApi'
import { isSupabaseConfigured } from '../../lib/supabaseClient'

const currency = value => Number.isFinite(Number(value)) && Number(value) > 0
  ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value) : 'Value not captured'
const dateLabel = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-ZA', { dateStyle: 'medium' }) : 'Not set'
const statusClass = transaction => transaction.status === 'Completed'
  ? 'border-[#dbe4ec] bg-[#f2f6fa] text-[#53677a]' : 'border-[#d7e9dc] bg-[#eef7f0] text-[#285d3e]'
const EMPTY_TRANSACTIONS = []

function PropertyPhoto({ transaction, className = '' }) {
  const [failed, setFailed] = useState(false)
  return <span className={`relative block overflow-hidden bg-[#edf2ee] ${className}`}>
    {transaction.imageUrl && !failed
      ? <img src={transaction.imageUrl} alt={`Property at ${transaction.propertyLabel}`} loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" />
      : <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#8a9b8f]"><ImageOff size={28} aria-hidden="true" /><span className="text-xs">Property image unavailable</span></span>}
  </span>
}

function PropertyFacts({ transaction }) {
  const facts = [
    { value: transaction.bedrooms, label: 'beds', icon: <BedDouble size={15} aria-hidden="true" /> },
    { value: transaction.bathrooms, label: 'baths', icon: <Bath size={15} aria-hidden="true" /> },
    { value: transaction.parking, label: 'parking', icon: <CarFront size={15} aria-hidden="true" /> },
    { value: transaction.floorArea, label: 'm²', icon: <Ruler size={15} aria-hidden="true" /> },
  ].filter(({ value }) => Number(value) > 0)
  return facts.length ? <span className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#66796c]">{facts.map(({ value, label, icon }) => <span key={label} className="inline-flex items-center gap-1.5">{icon}{value} {label}</span>)}</span> : null
}

function TransactionDetails({ transaction, client }) {
  const fields = [
    ['Client', client.name], ['Client role', transaction.typeLabel],
    ['Transaction reference', transaction.reference], ['Current stage', transaction.stageLabel],
    ['Finance', transaction.financeLabel], ['Deposit', transaction.deposit ? currency(transaction.deposit) : 'Not captured'],
    [transaction.status === 'Completed' ? 'Transfer date' : 'Target transfer', dateLabel(transaction.expectedTransferDate)], ['Last activity', dateLabel(transaction.lastActivityAt)],
    ['Agent', transaction.assignedAgentName || 'Not assigned'], ['Conveyancer', transaction.attorneyName || 'Not assigned'],
  ].filter(([, value]) => value)
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs text-[#6b7e71]">Sale value</p><p className="mt-1 text-2xl font-semibold tracking-tight text-[#244b35]">{currency(transaction.price)}</p></div>
      <span className={`rounded-full border px-3 py-1.5 text-xs font-medium ${statusClass(transaction)}`}>{transaction.status}</span>
    </div>
    <PropertyFacts transaction={transaction} />
    <dl className="grid gap-x-6 gap-y-4 border-t border-[#e7ede8] pt-5 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-[#6b7e71]">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-[#314838]">{value}</dd></div>)}</dl>
    {transaction.nextAction ? <div className="rounded-xl border border-[#e0e9df] bg-[#f4f8f1] p-4"><p className="text-xs font-semibold text-[#496c4d]">{transaction.status === 'Completed' ? 'Handover' : 'Next step'}</p><p className="mt-1.5 text-sm leading-6 text-[#4f6854]">{transaction.nextAction}</p></div> : null}
    {transaction.milestones?.length ? <div className="border-t border-[#e7ede8] pt-5"><h4 className="text-sm font-semibold text-[#314838]">Transaction milestones</h4><ol className="mt-3 space-y-3">{transaction.milestones.map(milestone => <li key={milestone.label} className="flex items-center gap-3"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${milestone.complete ? 'bg-[#e9f3e9] text-[#3f734a]' : 'border border-[#dce5dd] text-[#86968b]'}`}>{milestone.complete ? <Check size={13} aria-hidden="true" /> : <Clock3 size={12} aria-hidden="true" />}<span className="sr-only">{milestone.complete ? 'Completed' : 'Pending'}</span></span><span className="min-w-0 flex-1 text-sm text-[#4f6854]">{milestone.label}</span><span className="shrink-0 text-xs text-[#6b7e71]">{dateLabel(milestone.date)}</span></li>)}</ol></div> : null}
  </div>
}

export default function ClientTransactionsPanel({ client, transactions = [], preview = false }) {
  const { profile } = useWorkspace()
  const location = useLocation()
  const [enrichmentResult, setEnrichmentResult] = useState(null)
  const [selectedKey, setSelectedKey] = useState(null)
  const requestScope = useMemo(() => ({ client, transactions, preview, userId: profile?.id, email: profile?.email || '', fullName: profile?.fullName || '' }), [client, transactions, preview, profile?.id, profile?.email, profile?.fullName])
  const enrichment = enrichmentResult?.scope === requestScope ? enrichmentResult.transactions : EMPTY_TRANSACTIONS
  const mediaError = enrichmentResult?.scope === requestScope && enrichmentResult.error
  useEffect(() => {
    const { client, transactions, preview, userId, email, fullName } = requestScope
    if (preview || !isSupabaseConfigured || !userId || !transactions.length) return undefined
    let current = true
    const ids = new Set(transactions.map(transaction => transaction.id).filter(Boolean))
    // Keep the directory's fast summary read; load property photos only in this tab.
    void fetchTransactionsByParticipantSummary({ userId, roleType: 'agent', organisationId: client.organisationId, identityContext: { email, fullName } })
      .then(rows => {
        if (!current) return
        const matched = rows.filter(row => ids.has(row.transaction?.id))
        const enriched = getAgentClientProfile([{ ...client, transactions: matched }], client.id)
        setEnrichmentResult({ scope: requestScope, transactions: enriched?.transactions || [], error: false })
      }).catch(() => { if (current) setEnrichmentResult({ scope: requestScope, transactions: EMPTY_TRANSACTIONS, error: true }) })
    return () => { current = false }
  }, [requestScope])
  const cards = useMemo(() => {
    const byId = new Map(enrichment.map(transaction => [transaction.id, transaction]))
    return transactions.map(transaction => ({ ...transaction, ...byId.get(transaction.id), imageUrl: byId.get(transaction.id)?.imageUrl || transaction.imageUrl }))
  }, [transactions, enrichment])
  const selected = cards.find(transaction => (transaction.id || transaction.reference) === selectedKey)
  return <section aria-label="Client transactions" className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold tracking-tight text-[#293f34]">Transactions</h3><p className="mt-1 text-sm text-[#718176]">Property deals linked to {client.name}.</p></div><span className="rounded-full border border-[#e0e7e2] bg-white px-3 py-1 text-xs font-medium text-[#63766a]">{cards.length} {cards.length === 1 ? 'transaction' : 'transactions'}</span></div>
    {mediaError ? <p className="text-xs text-[#718176]">Some property details could not refresh. The saved transaction summaries are shown below.</p> : null}
    {cards.length ? <div className="grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3">{cards.map(transaction => <article key={transaction.id || transaction.reference} className="min-w-0">
      <button type="button" aria-label={`View transaction details for ${transaction.propertyLabel}`} onClick={() => setSelectedKey(transaction.id || transaction.reference)} className="group flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[#dfe7e0] bg-white text-left shadow-[0_3px_12px_rgba(24,50,34,0.03)] transition duration-200 hover:-translate-y-1 hover:border-[#c7d6ca] hover:shadow-[0_12px_28px_rgba(24,50,34,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
        <span className="relative block w-full"><PropertyPhoto key={transaction.imageUrl || 'placeholder'} transaction={transaction} className="aspect-[16/9] w-full" /><span className="absolute left-3 top-3 rounded-full border border-white/50 bg-white/95 px-2.5 py-1 text-xs font-medium text-[#405b49]">{transaction.typeLabel}</span><span className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(transaction)}`}>{transaction.status}</span></span>
        <span className="flex w-full min-w-0 flex-1 flex-col gap-4 p-5">
          <span><span className="block min-h-12 break-words text-lg font-semibold leading-6 tracking-tight text-[#293f34]">{transaction.propertyLabel}</span><span className="mt-2 block text-xl font-semibold tracking-tight text-[#244b35]">{currency(transaction.price)}</span></span>
          <PropertyFacts transaction={transaction} />
          <span className="flex flex-wrap items-center justify-between gap-2 border-t border-[#edf1ee] pt-3"><span className="text-xs text-[#809085]">{transaction.reference}</span><span className="inline-flex items-center gap-1.5 rounded-lg bg-[#f0f5ed] px-2.5 py-1.5 text-xs font-medium text-[#59734e]">{transaction.stageLabel}</span></span>
          <span className="mt-auto flex items-center justify-between border-t border-[#edf1ee] pt-3 text-xs"><span className="text-[#809085]">Updated {dateLabel(transaction.lastActivityAt)}</span><span className="inline-flex items-center gap-1 font-semibold text-[#3c6649]">View details<ChevronRight size={15} aria-hidden="true" /></span></span>
        </span>
      </button>
    </article>)}</div> : <div className="rounded-2xl border border-[#e0e7e3] bg-white p-8 text-center"><h4 className="font-semibold text-[#293f34]">No linked transactions yet</h4><p className="mt-2 text-sm text-[#718176]">This client’s property deals will appear here once a transaction is opened.</p></div>}
    <Modal open={Boolean(selected)} onClose={() => setSelectedKey(null)} title={selected?.propertyLabel} subtitle={selected?.reference} className="max-w-[820px]" footer={<><Button variant="secondary" onClick={() => setSelectedKey(null)}>Close</Button>{selected?.id ? <Button asChild><Link to={`/transactions/${encodeURIComponent(selected.id)}`} state={{ clientProfileReturnTo: location.pathname }}>Open full transaction<ArrowUpRight size={16} aria-hidden="true" /></Link></Button> : <Button disabled>Full transaction unavailable</Button>}</>}>
      {selected ? <><PropertyPhoto key={`${selected.id}:${selected.imageUrl}`} transaction={selected} className="-mx-6 -mt-6 mb-5 aspect-[16/6] sm:aspect-[16/5]" /><TransactionDetails transaction={selected} client={client} /></> : null}
    </Modal>
  </section>
}

export function LocalClientTransactionPreviewPage({ preview }) {
  const location = useLocation()
  const { transaction, client, profilePath } = preview
  const returnTo = /^\/clients\/[^/?]+$/.test(location.state?.clientProfileReturnTo || '') ? location.state.clientProfileReturnTo : profilePath
  return <section className="min-w-0 space-y-5">
    <Link to={returnTo} className="inline-flex items-center gap-2 text-sm font-medium text-[#49654c]"><ArrowLeft size={16} aria-hidden="true" />Back to {client.name}</Link>
    <div className="rounded-xl border border-[#dbe7dc] bg-[#f0f6ef] px-4 py-3 text-xs text-[#49654c]"><strong>Mock transaction</strong> · Local preview for layout review.</div>
    <div><p className="text-xs font-medium text-[#718176]">{transaction.reference}</p><h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-[#293f34]">{transaction.propertyLabel}</h1></div>
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-2"><div className="overflow-hidden rounded-2xl border border-[#e0e7e3] bg-white"><PropertyPhoto transaction={transaction} className="aspect-[4/3]" /></div><div className="rounded-2xl border border-[#e0e7e3] bg-white p-5 sm:p-6"><TransactionDetails transaction={transaction} client={client} /></div></div>
  </section>
}
