import { PARTY_ENTITY_OPTIONS, PARTY_MARITAL_OPTIONS, PARTY_MARRIAGE_REGIME_OPTIONS, PARTY_PERSON_ROLES, createTransactionPartyPerson, isNaturalParty, transactionPartyMissingDetails } from '../../core/transactions/transactionPartyProfile.js'

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800'
function Input({ label, value, onChange, type = 'text' }) {
  return <label className="block space-y-1 text-sm text-slate-700"><span>{label}</span><input className={inputClass} type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} /></label>
}
function Select({ label, value, onChange, options }) {
  return <label className="block space-y-1 text-sm text-slate-700"><span>{label}</span><select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
}
export default function TransactionPartyCapture({ side, value, onChange }) {
  const patch = (changes) => onChange({ ...value, ...changes })
  const personPatch = (id, changes) => patch({ people: value.people.map((person) => person.id === id ? { ...person, ...changes } : changes.primaryContact === true ? { ...person, primaryContact: false } : person) })
  const missing = transactionPartyMissingDetails(value, side)
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-label={`${side} party details`}>
    <h3 className="font-semibold text-slate-800">{side} entity and people</h3>
    <Select label={`${side} entity type`} value={value.entityType} options={PARTY_ENTITY_OPTIONS.filter((option) => side === 'Seller' || option.value !== 'deceased_estate')} onChange={(entityType) => patch({ entityType })} />
    {!isNaturalParty(value.entityType) && value.entityType !== 'unknown' ? <div className="grid gap-3 sm:grid-cols-2">
      <Input label={`${side} registered entity name`} value={value.name} onChange={(name) => patch({ name })} />
      <Input label="Registration number / estate reference" value={value.registrationNumber} onChange={(registrationNumber) => patch({ registrationNumber })} />
      {value.entityType.startsWith('foreign_') ? <Input label="Country of registration" value={value.countryOfRegistration} onChange={(countryOfRegistration) => patch({ countryOfRegistration })} /> : null}
    </div> : null}
    <p className="text-sm text-slate-600">Add every buyer, owner, spouse or representative involved. Record ownership and signing roles separately.</p>
    {value.people.map((person, index) => <fieldset key={person.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <legend className="px-1 text-sm font-semibold">{side} person {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Full name" value={person.name} onChange={(name) => personPatch(person.id, { name })} />
        <Select label="Person's role" value={person.role} options={PARTY_PERSON_ROLES} onChange={(role) => personPatch(person.id, { role })} />
        <Input label="Email" type="email" value={person.email} onChange={(email) => personPatch(person.id, { email })} />
        <Input label="Phone" type="tel" value={person.phone} onChange={(phone) => personPatch(person.id, { phone })} />
        <Input label="ID / passport number" value={person.identityNumber} onChange={(identityNumber) => personPatch(person.id, { identityNumber })} />
        <Select label="Marital status" value={person.maritalStatus} options={PARTY_MARITAL_OPTIONS} onChange={(maritalStatus) => personPatch(person.id, { maritalStatus, maritalRegime: 'unknown' })} />
        {person.maritalStatus === 'married' ? <Select label="Marriage regime" value={person.maritalRegime} options={PARTY_MARRIAGE_REGIME_OPTIONS} onChange={(maritalRegime) => personPatch(person.id, { maritalRegime })} /> : null}
        {person.role === 'spouse' ? <Select label="Spouse of" value={person.spouseOfId} options={[{ value: '', label: 'Select person' }, ...value.people.filter((other) => other.id !== person.id).map((other) => ({ value: other.id, label: other.name || 'Unnamed person' }))]} onChange={(spouseOfId) => personPatch(person.id, { spouseOfId })} /> : null}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">{[['isOwner', side === 'Buyer' ? 'Purchaser' : 'Legal owner'], ['signatory', 'Signs for this transaction'], ['primaryContact', 'Primary contact']].map(([key, label]) => <label key={key} className="inline-flex items-center gap-2"><input type="checkbox" checked={person[key]} onChange={(event) => personPatch(person.id, { [key]: event.target.checked })} />{label}</label>)}</div>
      <button type="button" className="text-sm font-medium text-red-700" onClick={() => patch({ people: value.people.filter((other) => other.id !== person.id).map((other) => other.spouseOfId === person.id ? { ...other, spouseOfId: '' } : other) })}>Remove person</button>
    </fieldset>)}
    <button type="button" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" onClick={() => patch({ people: [...value.people, createTransactionPartyPerson(isNaturalParty(value.entityType) ? 'owner' : value.entityType.includes('trust') ? 'trustee' : value.entityType === 'deceased_estate' ? 'executor' : 'authorised_representative')] })}>Add {side.toLowerCase()} person</button>
    {missing.length ? <details className="text-sm text-amber-800"><summary>{missing.length} details still to confirm</summary><ul className="mt-2 list-disc space-y-1 pl-5">{missing.map((item) => <li key={item}>{item}</li>)}</ul></details> : <p className="text-sm text-emerald-800">Party details captured. Documents still need to be provided and reviewed.</p>}
  </section>
}
