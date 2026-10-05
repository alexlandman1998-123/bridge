import { createElement, useState } from 'react'
import { Landmark, Receipt, Users, Wallet } from 'lucide-react'
import Modal from '../../../../components/ui/Modal.jsx'

const CATEGORIES = [
  { type: 'tax', label: 'Tax owed', singular: 'tax amount', icon: Landmark, hint: 'Unpaid personal tax.', descriptionLabel: 'Tax authority and tax type', placeholder: 'For example, SARS income tax', note: 'Add tax you currently owe. Enter the outstanding balance, not your usual monthly tax deduction.' },
  { type: 'unpaid_bills', label: 'Unpaid bills', singular: 'unpaid bill', icon: Receipt, hint: 'Outstanding bills or overdue accounts.', descriptionLabel: 'Who do you owe and what is the bill for?', placeholder: 'For example, municipal account arrears', note: 'Add the amount still unpaid. Your normal monthly bills belong under monthly costs.' },
  { type: 'private_loan', label: 'Private loans', singular: 'private loan', icon: Users, hint: 'Money borrowed from family or another person.', descriptionLabel: 'Who did you borrow from?', placeholder: 'For example, family loan', note: 'Add money you personally owe to another person, if it has not already been captured in Existing debts.' },
  { type: 'other', label: 'Other amounts owed', singular: 'other amount owed', icon: Wallet, hint: 'Other money you are personally responsible for.', descriptionLabel: 'Who do you owe and what is it for?', placeholder: 'Describe the amount owed', note: 'Add only amounts you personally owe and have not listed elsewhere in this application.' },
]
const formatAmount = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(String(value || 0).replace(/[ ,]/g, '')) || 0)

export default function LiabilitiesScreen({ state, updateRepeatableGroup, issues = [] }) {
  const records = state.participants.primaryApplicant.liabilities || []
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(null)
  const [errors, setErrors] = useState({})
  const [removing, setRemoving] = useState(null)
  const category = CATEGORIES.find(item => item.type === draft?.type) || CATEGORIES[3]
  function close() { setDraft(null); setEditing(null); setErrors({}) }
  function open(type, index = null) {
    setEditing(index)
    setDraft(index === null ? { type, description: '', value: '', monthlyPayment: '' } : { ...records[index], type: CATEGORIES.some(item => item.type === records[index].type) ? records[index].type : 'other' })
    setErrors({})
  }
  function save() {
    const nextErrors = {}
    if (!String(draft.description || '').trim()) nextErrors.description = 'Enter who you owe and what the amount is for.'
    for (const key of ['value', 'monthlyPayment']) {
      const raw = String(draft[key] ?? '').trim()
      const amount = Number(raw.replace(/[ ,]/g, ''))
      if ((key === 'value' && !raw) || (raw && (!Number.isFinite(amount) || amount < 0))) nextErrors[key] = 'Enter an amount of R0 or more.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    const id = draft.id || draft.guidedItemId || globalThis.crypto.randomUUID()
    const record = { ...draft, description: draft.description.trim(), id, guidedItemId: id, source: 'guided' }
    updateRepeatableGroup('participants.primaryApplicant.liabilities', editing === null ? [...records, record] : records.map((item, index) => index === editing ? record : item))
    close()
  }
  return <div className="space-y-5">
    <div><h2 className="text-xl font-semibold text-[#142132]">What else do you owe?</h2><p className="mt-2 text-sm leading-6 text-[#61748a]">Liabilities are amounts you owe. Add any other money you are personally responsible for paying back.</p></div>
    <p className="rounded-xl bg-[#f5f8fb] p-3 text-sm leading-6 text-[#4d6279]">Home loans, vehicle finance, credit cards, store accounts and bank loans belong in Existing debts. Add each amount only once. Regular household bills belong under monthly costs.</p>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
      {CATEGORIES.map(({ type, label, icon, hint }) => <button key={type} type="button" aria-label={`Add ${label.toLowerCase()}`} onClick={() => open(type)} className="flex min-h-28 flex-col items-start gap-2 rounded-xl border border-[#dbe5ef] bg-white p-4 text-left hover:border-[#35546c] hover:bg-[#f8fbff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#35546c]">
        {createElement(icon, { size: 22, className: 'text-[#35546c]', 'aria-hidden': true })}<span className="text-sm font-semibold text-[#21384d]">{label}</span><span className="text-xs leading-5 text-[#61748a]">{hint}</span>
      </button>)}
    </div>
    {records.length ? <div className="space-y-3" aria-label="Your other liabilities">
      {records.map((item, index) => <article key={item.id || item.guidedItemId || item.legacyKey || index} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dbe5ef] bg-white p-4">
        <div><h3 className="text-sm font-semibold text-[#21384d]">{item.description || 'Previously captured amount owed'}</h3><p className="mt-1 text-sm text-[#61748a]">{CATEGORIES.find(entry => entry.type === item.type)?.label || 'Previously captured'} · {formatAmount(item.value)}{item.monthlyPayment ? ` · ${formatAmount(item.monthlyPayment)} per month` : ''}</p>
          {issues.filter(issue => issue.path.startsWith(`participants.primaryApplicant.liabilities.${index}.`)).map(issue => <p key={issue.path} role="alert" className="mt-1 text-xs text-[#b5472d]">{issue.message} Select Edit to update this item.</p>)}
        </div>
        <div className="flex gap-2"><button type="button" aria-label={`Edit ${item.description || 'amount owed'}`} onClick={() => open(item.type, index)} className="min-h-11 rounded-lg border px-3 text-xs font-semibold">Edit</button><button type="button" aria-label={`Remove ${item.description || 'amount owed'}`} onClick={() => setRemoving(index)} className="min-h-11 rounded-lg border px-3 text-xs font-semibold text-[#b5472d]">Remove</button></div>
      </article>)}
      <p className="rounded-xl bg-[#f5f8fb] p-4 text-sm text-[#21384d]">Other amounts owed here: <strong>{formatAmount(records.reduce((sum, item) => sum + (Number(String(item.value || 0).replace(/[ ,]/g, '')) || 0), 0))}</strong></p>
    </div> : <p className="text-sm leading-6 text-[#61748a]">No other amounts owed. If none of these apply, you can continue without adding an item.</p>}
    <Modal open={Boolean(draft)} onClose={close} title={`${editing === null ? 'Add' : 'Edit'} ${category.singular}`} subtitle={category.note} footer={<><button type="button" onClick={close} className="min-h-11 rounded-xl border px-4 text-sm font-semibold">Cancel</button><button type="submit" form="guided-liability-form" className="min-h-11 rounded-xl bg-[#35546c] px-4 text-sm font-semibold text-white">Save amount owed</button></>}>
      {draft ? <form id="guided-liability-form" onSubmit={event => { event.preventDefault(); save() }} noValidate className="space-y-4">
        {[{ key: 'description', label: category.descriptionLabel, placeholder: category.placeholder, required: true }, { key: 'value', label: 'Outstanding amount (R)', inputMode: 'decimal', required: true }, { key: 'monthlyPayment', label: 'Monthly repayment (R)', inputMode: 'decimal' }].map(field => <div key={field.key}>
          <label htmlFor={`liability-${field.key}`} className="block text-sm font-semibold text-[#21384d]">{field.label}{field.required ? ' *' : ' (optional)'}</label>
          <input id={`liability-${field.key}`} value={draft[field.key] ?? ''} inputMode={field.inputMode} placeholder={field.placeholder} onChange={event => setDraft(previous => ({ ...previous, [field.key]: event.target.value }))} aria-required={field.required || undefined} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `liability-${field.key}-error` : undefined} className="mt-2 min-h-11 w-full rounded-xl border border-[#d1deeb] px-3 text-sm" />
          {errors[field.key] ? <p id={`liability-${field.key}-error`} role="alert" className="mt-1 text-xs text-[#b5472d]">{errors[field.key]}</p> : null}
        </div>)}
      </form> : null}
    </Modal>
    <Modal open={removing !== null} onClose={() => setRemoving(null)} title="Remove this amount owed?" subtitle="Remove this item from your application." footer={<><button type="button" onClick={() => setRemoving(null)} className="min-h-11 rounded-xl border px-4">Keep item</button><button type="button" onClick={() => { updateRepeatableGroup('participants.primaryApplicant.liabilities', records.filter((_, index) => index !== removing)); setRemoving(null) }} className="min-h-11 rounded-xl bg-[#b5472d] px-4 text-white">Remove item</button></>} />
  </div>
}
