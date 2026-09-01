import { Check, CheckCircle2, FileText, Info, LoaderCircle, MapPin, Trash2 } from 'lucide-react'
import { useState } from 'react'

const EMPTY_LIST = Object.freeze([])

function MiniParcel({ index = 0 }) {
  const rotations = [-7, 4, -3]
  return (
    <svg viewBox="0 0 72 58" className="h-14 w-[72px] shrink-0 rounded-xl border border-slate-200 bg-[#e9f0e4]" aria-hidden="true">
      <path d="M0 16 C18 8 36 23 72 11 M0 43 C25 33 50 50 72 37" fill="none" stroke="white" strokeWidth="8" />
      <g transform={`rotate(${rotations[index % rotations.length]} 36 29)`}>
        <rect x="20" y="12" width="33" height="34" rx="2" fill="#bfdbfe" stroke="#1769dc" strokeWidth="2" />
        <circle cx="37" cy="29" r="4" fill="#1769dc" stroke="white" strokeWidth="1.5" />
      </g>
    </svg>
  )
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(value || 0))
}

function OrderStatus({ orderState, isDemoData }) {
  if (!orderState || orderState.status === 'idle') return null
  if (orderState.status === 'error') {
    return <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">{orderState.error}</div>
  }
  if (orderState.status === 'ready') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
        <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 size={16} />Property reports are ready</p>
        <p className="mt-1 text-xs leading-5 text-emerald-700">Order {orderState.order?.id} completed {isDemoData ? 'using fictional demonstration data.' : 'through the connected provider.'}</p>
      </div>
    )
  }
  const label = orderState.status === 'submitting' ? `Submitting ${isDemoData ? 'demo ' : ''}order…` : orderState.status === 'queued' ? 'Reports queued…' : 'Generating property reports…'
  return <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800"><LoaderCircle className="animate-spin" size={16} />{label}</div>
}

export default function PropertyReportBasket({
  properties = EMPTY_LIST,
  reportTypes = EMPTY_LIST,
  selectedReportTypeIds = EMPTY_LIST,
  quote,
  quoteStatus = 'idle',
  quoteError = '',
  orderState,
  isDemoData = true,
  onRemoveProperty,
  onClear,
  onToggleReportType,
  onRequestReports,
  onViewReports,
}) {
  const [confirmedOrderSignature, setConfirmedOrderSignature] = useState('')
  const isOrdering = ['submitting', 'queued', 'processing'].includes(orderState?.status)
  const orderSignature = `${properties.map((property) => property.id).join('|')}::${selectedReportTypeIds.join('|')}::${quote?.total || 0}`
  const liveOrderConfirmed = confirmedOrderSignature === orderSignature
  const canOrder = properties.length > 0 && selectedReportTypeIds.length > 0 && quoteStatus === 'ready' && quote?.total > 0 && !isOrdering && (isDemoData || liveOrderConfirmed)

  async function requestReports() {
    await onRequestReports?.()
    if (!isDemoData) setConfirmedOrderSignature('')
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50/70" data-testid="property-report-basket">
      <div className="border-b border-slate-200 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Report basket</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{properties.length ? `${properties.length} ${properties.length === 1 ? 'property' : 'properties'} selected` : 'No properties selected'}</h3>
          </div>
          {properties.length && !isOrdering ? <button type="button" onClick={onClear} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Clear</button> : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        <div className="p-4">
          {properties.length ? (
            <div className="max-h-[300px] space-y-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]" aria-label="Selected properties">
              {properties.map((property, index) => (
                <article key={property.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <MiniParcel index={index} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{property.address}</p>
                    <p className="mt-1 text-xs text-slate-500">Erf {property.erfNumber}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{property.suburb}</p>
                  </div>
                  <button type="button" disabled={isOrdering} onClick={() => onRemoveProperty?.(property.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Remove ${property.address} from report basket`}><Trash2 size={16} /></button>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid min-h-[230px] place-items-center px-4 text-center">
              <div><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200"><MapPin size={20} /></span><p className="mt-4 text-sm font-semibold text-slate-700">Select properties from the map</p><p className="mt-1 text-xs leading-5 text-slate-500">Click a parcel, review its details and add it to this basket.</p></div>
            </div>
          )}
        </div>

        {properties.length ? (
          <div className="border-t border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-900">Select reports</h4>
              <span title={isDemoData ? 'Indicative fictional prices only' : 'Pricing returned by the connected provider'}><Info size={15} className="text-slate-400" /></span>
            </div>
            <div className="mt-3 space-y-2">
              {reportTypes.map((reportType) => {
                const checked = selectedReportTypeIds.includes(reportType.id)
                const providerLineItem = quote?.lineItems?.find((lineItem) => lineItem.reportType === reportType.id)
                const displayedUnitPrice = isDemoData ? formatCurrency(reportType.unitPrice) : providerLineItem ? formatCurrency(providerLineItem.amount) : 'Provider priced'
                return (
                  <label key={reportType.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${checked ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'} ${isOrdering ? 'cursor-not-allowed opacity-60' : ''}`}>
                    <input type="checkbox" className="sr-only" checked={checked} disabled={isOrdering} onChange={() => onToggleReportType?.(reportType.id)} />
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${checked ? 'border-[#1769dc] bg-[#1769dc] text-white' : 'border-slate-300 bg-white'}`}>{checked ? <Check size={13} strokeWidth={3} /> : null}</span>
                    <FileText size={17} className="mt-0.5 shrink-0 text-slate-500" />
                    <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold text-slate-800">{reportType.label}</strong><span className="mt-0.5 block text-xs leading-4 text-slate-500">{reportType.description}</span></span>
                    <strong className="shrink-0 text-xs font-semibold text-slate-700">{displayedUnitPrice}</strong>
                  </label>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 border-t border-slate-200 bg-white p-4">
        <OrderStatus orderState={orderState} isDemoData={isDemoData} />
        {quoteStatus === 'error' ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">{quoteError}</div> : null}
        {properties.length ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-end justify-between gap-3">
              <div><p className="text-xs font-semibold text-slate-700">{isDemoData ? 'Indicative demo pricing' : 'Provider pricing'}</p><p className="mt-1 text-[11px] text-slate-500">{quoteStatus === 'loading' ? 'Calculating…' : `${quote?.reportCount || 0} report items • Ex VAT`}</p></div>
              <strong className="text-2xl font-semibold tracking-tight text-slate-900">{quoteStatus === 'ready' ? formatCurrency(quote?.total) : '—'}</strong>
            </div>
          </div>
        ) : null}
        {!isDemoData && properties.length && orderState?.status !== 'ready' ? <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-amber-300" checked={liveOrderConfirmed} disabled={isOrdering} onChange={(event) => setConfirmedOrderSignature(event.target.checked ? orderSignature : '')} /><span>I understand that the connected provider’s report charges may apply.</span></label> : null}
        <button type="button" disabled={orderState?.status === 'ready' ? false : !canOrder} onClick={orderState?.status === 'ready' ? onViewReports : requestReports} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1769dc] px-4 text-sm font-semibold text-white transition hover:bg-[#1359bc] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
          {isOrdering ? <LoaderCircle className="animate-spin" size={17} /> : <FileText size={17} />}
          {orderState?.status === 'ready' ? 'View property reports' : `Pull ${properties.length || 0} ${properties.length === 1 ? 'property report' : 'property reports'}`}
        </button>
        <p className="text-center text-xs text-slate-500">{isDemoData ? 'Simulation only — nothing will be charged' : 'Orders are fulfilled by the connected provider and may incur charges'}</p>
      </div>
    </aside>
  )
}
