import { sellerFicaBranch, sellerYesNoValue } from '../../lib/sellerFicaOnboardingFields.js'

const inputClass = 'min-h-[42px] w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm text-[#22364a] outline-none focus:border-[#5b829e]'

function PersonList({ title, roleTitle, hint, rows = [], collectionKey, onAddPerson, onUpdatePerson, onRemovePerson }) {
  return (
    <section className="space-y-3 rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h4 className="text-sm font-semibold text-[#22364a]">{title}</h4><p className="mt-1 text-xs text-[#60748b]">{hint}</p></div>
        <button type="button" className="rounded-[9px] border border-[#cbd9e8] bg-white px-3 py-2 text-sm font-semibold text-[#35546c]" onClick={() => onAddPerson(collectionKey, roleTitle)}>Add</button>
      </div>
      {rows.map((person, index) => (
        <div key={person.id || `${collectionKey}-${index}`} className="grid gap-3 rounded-[12px] border border-[#dce6f2] bg-white p-3 sm:grid-cols-2">
          {[
            ['name', 'First name'], ['surname', 'Surname'], ['idNumber', 'ID / passport number'],
            ['nationality', 'Nationality'], ['residentialAddress', 'Residential address'],
          ].map(([field, label]) => (
            <label key={field} className={`grid gap-1 text-xs font-semibold text-[#607387] ${field === 'residentialAddress' ? 'sm:col-span-2' : ''}`}>
              {label}
              <input className={inputClass} value={person[field] || ''} onChange={(event) => onUpdatePerson(collectionKey, index, field, event.target.value)} />
            </label>
          ))}
          {collectionKey === 'companyBeneficialOwners' ? <>
            <label className="grid gap-1 text-xs font-semibold text-[#607387]">Ownership share, if known
              <input className={inputClass} value={person.ownershipShare || ''} onChange={(event) => onUpdatePerson(collectionKey, index, 'ownershipShare', event.target.value)} placeholder="For example, 30%" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#607387]">How this person controls the company
              <input className={inputClass} value={person.controlBasis || ''} onChange={(event) => onUpdatePerson(collectionKey, index, 'controlBasis', event.target.value)} placeholder="Shareholding, voting rights or other control" />
            </label>
          </> : null}
          <button type="button" className="justify-self-start text-xs font-semibold text-[#9f1239]" onClick={() => onRemovePerson(collectionKey, index)}>Remove</button>
        </div>
      ))}
    </section>
  )
}

export default function SellerFicaQuestions({ form = {}, onChange, onAddPerson, onUpdatePerson, onRemovePerson }) {
  const branch = sellerFicaBranch(form)
  return (
    <section className="space-y-4 rounded-[18px] border border-[#dce6f2] bg-white p-4">
      <div><h3 className="text-sm font-semibold text-[#22364a]">FICA declaration details</h3><p className="mt-1 text-sm text-[#60748b]">These answers will be reused when preparing the declaration. Evidence can be checked during agent review.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-[#2a4057]">Occupation or business activity
          <input className={inputClass} value={form.occupation || ''} onChange={(event) => onChange('occupation', event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#2a4057]">Source of funds / wealth
          <input className={inputClass} value={form.sourceOfFunds || ''} onChange={(event) => onChange('sourceOfFunds', event.target.value)} placeholder="For example, employment, business or inheritance" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#2a4057]">Is the seller, an owner / controller or a representative politically exposed?
          <select className={inputClass} value={sellerYesNoValue(form.politicallyExposedPerson)} onChange={(event) => onChange('politicallyExposedPerson', event.target.value)}>
            <option value="">Select one</option><option value="no">No</option><option value="yes">Yes</option>
          </select>
        </label>
        {sellerYesNoValue(form.politicallyExposedPerson) === 'yes' ? <label className="grid gap-1 text-sm font-medium text-[#2a4057]">Who and in what capacity?
          <input className={inputClass} value={form.politicallyExposedDetails || ''} onChange={(event) => onChange('politicallyExposedDetails', event.target.value)} />
        </label> : null}
      </div>
      {branch === 'company' ? <PersonList title="Beneficial owners" roleTitle="Beneficial Owner" hint="Add each natural person who ultimately owns or controls the company." rows={form.companyBeneficialOwners} collectionKey="companyBeneficialOwners" onAddPerson={onAddPerson} onUpdatePerson={onUpdatePerson} onRemovePerson={onRemovePerson} /> : null}
      {branch === 'trust' ? <>
        <PersonList title="Founders" roleTitle="Founder" hint="Add the trust founders." rows={form.trustFounders} collectionKey="trustFounders" onAddPerson={onAddPerson} onUpdatePerson={onUpdatePerson} onRemovePerson={onRemovePerson} />
        <PersonList title="Beneficiaries" roleTitle="Beneficiary" hint="Add named beneficiaries, or describe the beneficiary class below." rows={form.trustBeneficiaries} collectionKey="trustBeneficiaries" onAddPerson={onAddPerson} onUpdatePerson={onUpdatePerson} onRemovePerson={onRemovePerson} />
        <label className="grid gap-1 text-sm font-medium text-[#2a4057]">Beneficiary class, if beneficiaries are not named
          <input className={inputClass} value={form.trustBeneficiaryClass || ''} onChange={(event) => onChange('trustBeneficiaryClass', event.target.value)} />
        </label>
      </> : null}
    </section>
  )
}
