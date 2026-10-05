import { filterPreferredPartners } from '../../lib/preferredPartners.js'

export default function TransactionBondAttorneyCapture({ value, partners, onChange }) {
  const options = filterPreferredPartners(partners, { type: 'bond_attorney' })
  const change = (key, next) => onChange({ ...value, [key]: next })
  return <section aria-label="Bond registration attorney" className="mt-4 space-y-3 rounded-xl border p-4">
    <h4 className="font-semibold">Bond registration attorney</h4>
    <p className="text-sm text-slate-600">Capture the firm appointed by the bank if known. This is separate from the bond originator and transfer attorney. Approval and instruction still require evidence.</p>
    <label className="block text-sm">Bond attorney selection<select className="mt-1 block w-full rounded-lg border p-2" value={value.mode} onChange={(event) => change('mode', event.target.value)}>
      <option value="none">Not appointed / not known yet</option><option value="agency">Choose existing partner</option><option value="buyer">Capture external firm</option>
    </select></label>
    {value.mode === 'agency' ? <label className="block text-sm">Bond attorney partner<select className="mt-1 block w-full rounded-lg border p-2" value={value.partnerId || ''} onChange={(event) => change('partnerId', event.target.value)}><option value="">Select firm</option>{options.map((partner) => <option key={partner.id} value={partner.id}>{partner.companyName}</option>)}</select></label> : null}
    {value.mode === 'buyer' ? <div className="grid gap-3 sm:grid-cols-2">{[['companyName', 'Bond attorney firm'], ['contactPerson', 'Bond attorney contact'], ['email', 'Bond attorney email'], ['phone', 'Bond attorney phone']].map(([key, label]) => <label key={key} className="text-sm">{label}<input className="mt-1 block w-full rounded-lg border p-2" type={key === 'email' ? 'email' : 'text'} value={value[key] || ''} onChange={(event) => change(key, event.target.value)} /></label>)}</div> : null}
  </section>
}
