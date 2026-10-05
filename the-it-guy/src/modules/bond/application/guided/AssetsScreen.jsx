import { createElement, useState } from 'react'
import { Car, PiggyBank, TrendingUp, Landmark, BriefcaseBusiness, Package } from 'lucide-react'
import Modal from '../../../../components/ui/Modal.jsx'

const CATEGORIES = [
  { type: 'vehicle', label: 'Vehicles', singular: 'vehicle', icon: Car, hint: 'Cars, motorcycles and other vehicles.', descriptionLabel: 'Vehicle make and model', placeholder: 'For example, Toyota Corolla', extra: [{ key: 'year', label: 'Year', type: 'number', min: 1900, max: new Date().getFullYear() + 1 }], note: 'Enter its current resale value, rather than its purchase price. Add any vehicle finance in Existing debts.' },
  { type: 'savings', label: 'Savings', singular: 'savings account', icon: PiggyBank, hint: 'Money in savings or deposit accounts.', descriptionLabel: 'Bank and savings account name', placeholder: 'For example, FNB savings account', note: 'Enter the current balance. Do not enter account numbers or login details.' },
  { type: 'investments', label: 'Investments', singular: 'investment', icon: TrendingUp, hint: 'Shares, unit trusts and investment accounts.', descriptionLabel: 'Provider and investment name', placeholder: 'For example, Allan Gray unit trust', note: 'Enter the current value of your holding.' },
  { type: 'retirement_investment', label: 'Retirement funds', singular: 'retirement fund', icon: Landmark, hint: 'Pension, provident and retirement annuity funds.', descriptionLabel: 'Provider and fund name', placeholder: 'For example, retirement annuity provider', note: 'Use the value on your latest fund statement. This is an asset, even if you cannot withdraw it now.' },
  { type: 'business_interest', label: 'Business interests', singular: 'business interest', icon: BriefcaseBusiness, hint: 'Your ownership share in a business.', descriptionLabel: 'Business name', placeholder: 'Name of the business', extra: [{ key: 'ownershipPercentage', label: 'Your ownership share (%)', type: 'number', min: 0, max: 100 }], note: 'Enter the estimated value of your share, rather than the value of the whole business.' },
  { type: 'other', label: 'Other', singular: 'other asset', icon: Package, hint: 'Other valuable items you own.', descriptionLabel: 'What do you own?', placeholder: 'For example, furniture or equipment', note: 'Describe the item and estimate its current resale value.' },
]
const formatAmount = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(String(value || 0).replace(/[ ,]/g, '')) || 0)

export default function AssetsScreen({ state, updateRepeatableGroup, issues = [] }) {
  const records = state.participants.primaryApplicant.assets || []
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(null)
  const [errors, setErrors] = useState({})
  const [removing, setRemoving] = useState(null)
  const category = CATEGORIES.find((item) => item.type === draft?.type) || CATEGORIES[5]
  function close() { setDraft(null); setEditing(null); setErrors({}) }
  function open(type, index = null) {
    setEditing(index)
    setDraft(index === null ? { type, description: '', value: '' } : { ...records[index] })
    setErrors({})
  }
  function save() {
    const nextErrors = {}
    if (!CATEGORIES.some((item) => item.type === draft.type)) nextErrors.type = 'Choose a category.'
    if (!String(draft.description || '').trim()) nextErrors.description = `Enter ${category.descriptionLabel.toLowerCase()}.`
    const value = Number(String(draft.value ?? '').replace(/[ ,]/g, ''))
    if (draft.value === '' || draft.value == null || !Number.isFinite(value) || value < 0) nextErrors.value = 'Enter an estimated value of R0 or more.'
    for (const field of category.extra || []) {
      if (draft[field.key] !== undefined && draft[field.key] !== '') {
        const number = Number(draft[field.key])
        if (!Number.isFinite(number) || number < field.min || number > field.max || (field.key === 'year' && !Number.isInteger(number))) nextErrors[field.key] = `Enter ${field.label.toLowerCase()} between ${field.min} and ${field.max}.`
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    const id = draft.id || draft.guidedItemId || globalThis.crypto.randomUUID()
    const record = { ...draft, description: draft.description.trim(), id, guidedItemId: id, source: 'guided' }
    updateRepeatableGroup('participants.primaryApplicant.assets', editing === null ? [...records, record] : records.map((item, index) => index === editing ? record : item))
    close()
  }
  return <div className="space-y-5">
    <div><h2 className="text-xl font-semibold text-[#142132]">What do you own?</h2><p className="mt-2 text-sm leading-6 text-[#61748a]">Assets are things you own that have monetary value, such as a vehicle, savings or investments. Your bond consultant uses this to understand your financial position.</p></div>
    <p className="rounded-xl bg-[#f5f8fb] p-3 text-sm leading-6 text-[#4d6279]">Choose a category to add an item and its estimated value. Property is captured in the previous property questions. Add loans and vehicle finance under Existing debts.</p>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {CATEGORIES.map(({ type, label, icon, hint }) => <button key={type} type="button" aria-label={`Add ${label.toLowerCase()}`} onClick={() => open(type)} className="flex min-h-28 flex-col items-start gap-2 rounded-xl border border-[#dbe5ef] bg-white p-4 text-left hover:border-[#35546c] hover:bg-[#f8fbff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#35546c]">
        {createElement(icon, { size: 22, className: 'text-[#35546c]', 'aria-hidden': true })}<span className="text-sm font-semibold text-[#21384d]">{label}</span><span className="text-xs leading-5 text-[#61748a]">{hint}</span>
      </button>)}
    </div>
    {issues.length ? <p role="alert" className="text-sm text-[#b5472d]">Check the details of your saved items. Each item needs a category, a description and an estimated value.</p> : null}
    {records.length ? <div className="space-y-3" aria-label="Your assets">
      {records.map((item, index) => <article key={item.id || item.guidedItemId || item.legacyKey || index} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dbe5ef] bg-white p-4">
        <div><h3 className="text-sm font-semibold text-[#21384d]">{item.description || 'Previously captured asset'}</h3><p className="mt-1 text-sm text-[#61748a]">{CATEGORIES.find((entry) => entry.type === item.type)?.label || 'Previously captured'}{item.year ? ` · ${item.year}` : ''} · {formatAmount(item.value)}</p></div>
        <div className="flex gap-2"><button type="button" aria-label={`Edit ${item.description || 'asset'}`} onClick={() => open(item.type, index)} className="min-h-11 rounded-lg border px-3 text-xs font-semibold">Edit</button><button type="button" aria-label={`Remove ${item.description || 'asset'}`} onClick={() => setRemoving(index)} className="min-h-11 rounded-lg border px-3 text-xs font-semibold text-[#b5472d]">Remove</button></div>
      </article>)}
      <p className="rounded-xl bg-[#f5f8fb] p-4 text-sm text-[#21384d]">Items listed here: <strong>{formatAmount(records.reduce((sum, item) => sum + (Number(String(item.value || 0).replace(/[ ,]/g, '')) || 0), 0))}</strong></p>
    </div> : <p className="text-sm leading-6 text-[#61748a]">No items added. If you do not own any of these, you can continue without adding an item.</p>}
    <Modal open={Boolean(draft)} onClose={close} title={`${editing === null ? 'Add' : 'Edit'} ${category.singular}`} subtitle={category.note} footer={<><button type="button" onClick={close} className="min-h-11 rounded-xl border px-4 text-sm font-semibold">Cancel</button><button type="submit" form="guided-asset-form" className="min-h-11 rounded-xl bg-[#35546c] px-4 text-sm font-semibold text-white">Save {category.singular}</button></>}>
      {draft ? <form id="guided-asset-form" onSubmit={(event) => { event.preventDefault(); save() }} noValidate className="space-y-4">
        {[{ key: 'description', label: category.descriptionLabel, placeholder: category.placeholder, required: true }, ...(category.extra || []), { key: 'value', label: draft.type === 'savings' ? 'Current balance (R)' : 'Estimated current value (R)', inputMode: 'decimal', required: true }].map((field) => <div key={field.key}>
          <label htmlFor={`asset-${field.key}`} className="block text-sm font-semibold text-[#21384d]">{field.label}{field.required ? ' *' : ' (optional)'}</label>
          <input id={`asset-${field.key}`} value={draft[field.key] ?? ''} type={field.type || 'text'} inputMode={field.inputMode} min={field.min} max={field.max} step={field.key === 'year' ? 1 : 'any'} placeholder={field.placeholder} onChange={(event) => setDraft((previous) => ({ ...previous, [field.key]: event.target.value }))} aria-required={field.required || undefined} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `asset-${field.key}-error` : undefined} className="mt-2 min-h-11 w-full rounded-xl border border-[#d1deeb] px-3 text-sm" />
          {errors[field.key] ? <p id={`asset-${field.key}-error`} role="alert" className="mt-1 text-xs text-[#b5472d]">{errors[field.key]}</p> : null}
        </div>)}
        {editing !== null && !CATEGORIES.some((item) => item.type === draft.type) ? <div><label htmlFor="asset-category" className="text-sm font-semibold">Category</label><select id="asset-category" value="" onChange={(event) => setDraft((previous) => ({ ...previous, type: event.target.value }))} className="mt-2 min-h-11 w-full rounded-xl border px-3"><option value="">Choose a category</option>{CATEGORIES.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}</select></div> : null}
      </form> : null}
    </Modal>
    <Modal open={removing !== null} onClose={() => setRemoving(null)} title="Remove this asset?" subtitle="Remove this item from your application." footer={<><button type="button" onClick={() => setRemoving(null)} className="min-h-11 rounded-xl border px-4">Keep item</button><button type="button" onClick={() => { updateRepeatableGroup('participants.primaryApplicant.assets', records.filter((_, index) => index !== removing)); setRemoving(null) }} className="min-h-11 rounded-xl bg-[#b5472d] px-4 text-white">Remove item</button></>} />
  </div>
}
