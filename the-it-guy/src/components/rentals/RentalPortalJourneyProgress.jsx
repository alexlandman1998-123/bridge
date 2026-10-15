const label = value => String(value || 'Not available').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
const money = value => value !== null && value !== undefined && Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(value)) : 'Not available'

export default function RentalPortalJourneyProgress({ journey, title = 'Your tenancy progress' }) {
  if (!journey) return null
  const signatures = journey.signatures || [], handover = journey.handover || {}
  return <section aria-label={title} className="rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="text-lg font-semibold">{title}</h2>
    <p className="mt-1 text-sm text-slate-600">Tenancy: {label(journey.tenancyStatus)}</p>
    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
      <div><dt className="text-sm text-slate-600">Lease preparation</dt><dd className="font-medium">{label(journey.leaseStatus)}</dd></div>
      <div><dt className="text-sm text-slate-600">Signed copies</dt><dd className="font-medium">{signatures.length ? `${signatures.filter(signer => signer.status === 'signed').length} of ${signatures.length} received` : 'Signing has not been prepared'}</dd></div>
      {(journey.payments || []).map(payment => <div key={payment.id}><dt className="text-sm text-slate-600">{payment.type === 'deposit' ? 'Deposit' : 'First rent'}</dt><dd className="font-medium">{label(payment.status)} · {money(payment.receivedAmount)} of {money(payment.requiredAmount)}</dd></div>)}
      <div><dt className="text-sm text-slate-600">Incoming inspection and handover</dt><dd className="font-medium">{label(handover.status)}{handover.totalItems ? ` · ${handover.completedItems} of ${handover.totalItems} items complete` : ''}</dd></div>
    </dl>
    {journey.tenancyStatus === 'draft' ? <p className="mt-4 text-sm text-slate-600">Your rental team reviews the uploaded agreements, payments and handover before activating your tenancy.</p> : null}
  </section>
}
