import { Check, FileText, MapPinned, ShieldCheck } from 'lucide-react'

function value(value, fallback = 'Not supplied') {
  return value === null || value === undefined || value === '' ? fallback : value
}

function Detail({ label, children }) {
  return <div><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{children}</dd></div>
}

function IncludedFields({ title, description, fields, tone = 'blue', selected, onChange, required = false }) {
  const colours = tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-blue-200 bg-blue-50 text-blue-950'
  return <label className={`block rounded-xl border p-3 ${colours} ${required ? '' : 'cursor-pointer'}`}><div className="flex items-start gap-3"><input type="checkbox" className="sr-only" checked={selected} disabled={required} onChange={onChange} /><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${selected ? 'border-[#1769dc] bg-[#1769dc] text-white' : 'border-slate-300 bg-white'}`}>{selected ? <Check size={13} strokeWidth={3} /> : null}</span><span><span className="flex items-center gap-2"><strong className="text-sm font-semibold">{title}</strong>{required ? <span className="rounded-full bg-white/70 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide">Included</span> : <span className="rounded-full bg-white/70 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide">Optional</span>}</span><span className="mt-1 block text-xs leading-5 opacity-80">{description}</span></span></div><ul className="mt-2 space-y-1 pl-8 text-xs leading-5">{fields.map((field) => <li key={field}>• {field}</li>)}</ul></label>
}

export default function KnowledgeFactoryPropertyPanel({ property, reportTypes = [], onToggleReportType, onOpenReportBuilder }) {
  if (!property) {
    return <aside className="flex min-h-[280px] flex-col justify-center bg-slate-50 p-5 xl:min-h-0" aria-label="Property report overview"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200"><MapPinned size={20} /></span><h2 className="mt-4 text-lg font-semibold text-slate-900">Select a parcel</h2><p className="mt-2 text-sm leading-6 text-slate-500">Click a parcel on the map to review its available report content. This step does not request supplier data or use credits.</p></aside>
  }

  return <aside className="min-h-[360px] overflow-y-auto bg-slate-50 p-5 xl:min-h-0" aria-label="Property report overview" data-testid="knowledge-factory-property-panel">
    <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-100 text-[#1769dc]"><MapPinned size={18} /></span><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Selected parcel</p><h2 className="mt-1 text-lg font-semibold text-slate-900">Property {property.propertyId}</h2><p className="mt-1 text-sm text-slate-500">Map reference only — no report has been requested.</p></div></div>

    <dl className="mt-5 grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-4"><Detail label="Property ID">{property.propertyId}</Detail><Detail label="Erf">{value(property.erf, '—')}</Detail><Detail label="Portion">{value(property.portion, '—')}</Detail><Detail label="Suburb reference">{value(property.suburbId, '—')}</Detail></dl>

    <div className="mt-5"><div className="flex items-center gap-2"><FileText size={16} className="text-[#1769dc]" /><h2 className="text-sm font-semibold text-slate-900">Choose report sections</h2></div><p className="mt-1 text-xs leading-5 text-slate-500">Selections are only carried to the report builder. You will see the supplier credit estimate before anything is requested.</p></div>
    <div className="mt-3 space-y-3"><IncludedFields title="Property snapshot" description="Recommended starting report." required selected={reportTypes.includes('property_summary')} fields={['Property ID and address/locality', 'Erf, portion and extent', 'Property type, classification and name', 'Suburb, town, province and postal code']} /><IncludedFields title="Municipal valuation" description="Optional report section." tone="amber" selected={reportTypes.includes('municipal_valuation')} onChange={() => onToggleReportType?.('municipal_valuation')} fields={['Recorded municipal valuation', 'Valuation date and municipality', 'Zoning, when supplied by the provider']} /></div>

    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3"><div className="flex gap-2"><ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={16} /><div><h3 className="text-sm font-semibold text-slate-900">Not included in this report</h3><p className="mt-1 text-xs leading-5 text-slate-500">Ownership, bonds, transfers, recent sales, AVM, credit and FICA/KYC remain separate controlled workflows.</p></div></div></section>
    <button type="button" onClick={() => onOpenReportBuilder?.()} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1769dc] px-4 text-sm font-semibold text-white hover:bg-[#1359bc]"><FileText size={16} />Prepare report</button>
    <p className="mt-2 text-center text-xs leading-5 text-slate-500">You will remain in Canvassing. No supplier request or credits are used until you confirm a quote.</p>
  </aside>
}
