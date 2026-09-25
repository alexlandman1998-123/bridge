import { Plus, Trash2 } from 'lucide-react'

import { LISTING_SELLER_PROFILE_BRANCHES } from '../../lib/listingSellerProfileBuilderModel.js'
import Button from '../ui/Button.jsx'
import Field from '../ui/Field.jsx'

function Input({ label, field, draft, onChange, type = 'text', as, className = '' }) {
  return (
    <label className={`grid gap-1.5 text-sm font-semibold text-[#2d445e] ${className}`}>
      {label}
      <Field as={as} type={type} value={draft[field] || ''} onChange={(event) => onChange(field, event.target.value)} />
    </label>
  )
}

function PeopleEditor({ title, rows = [], onAdd, onUpdate, onRemove }) {
  return (
    <section className="space-y-3 rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4 sm:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-[#243d56]">{title}</h4>
        <Button type="button" size="sm" variant="secondary" onClick={onAdd}><Plus size={14} /> Add</Button>
      </div>
      {rows.length ? rows.map((person, index) => (
        <div key={person.id || `${title}-${index}`} className="grid gap-3 rounded-[14px] border border-[#dce6f2] bg-white p-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-[#607387]">First name<Field value={person.name || person.firstName || ''} onChange={(event) => onUpdate(index, 'name', event.target.value)} /></label>
          <label className="grid gap-1 text-xs font-semibold text-[#607387]">Surname<Field value={person.surname || person.lastName || ''} onChange={(event) => onUpdate(index, 'surname', event.target.value)} /></label>
          <label className="grid gap-1 text-xs font-semibold text-[#607387]">ID / passport<Field value={person.idNumber || ''} onChange={(event) => onUpdate(index, 'idNumber', event.target.value)} /></label>
          <label className="grid gap-1 text-xs font-semibold text-[#607387]">Email<Field type="email" value={person.email || ''} onChange={(event) => onUpdate(index, 'email', event.target.value)} /></label>
          <div className="sm:col-span-2 flex justify-end"><Button type="button" size="sm" variant="secondary" onClick={() => onRemove(index)}><Trash2 size={13} /> Remove</Button></div>
        </div>
      )) : <p className="text-sm text-[#8292a5]">No {title.toLowerCase()} captured.</p>}
    </section>
  )
}

export default function ListingSellerInformationEditor({
  draft = {},
  saving = false,
  onChange,
  onAddPerson,
  onUpdatePerson,
  onRemovePerson,
  onSubmit,
}) {
  const branch = draft.branch || ''
  const individual = ['individual', 'married', 'foreign_individual'].includes(branch)
  const company = ['company', 'foreign_company'].includes(branch)
  const trust = ['trust', 'foreign_trust'].includes(branch)
  const foreign = branch.startsWith('foreign_')

  return (
    <form id="listing-seller-information-editor-form" className="space-y-4" onSubmit={onSubmit}>
      <section className="grid gap-4 rounded-[18px] border border-[#dce6f2] bg-white p-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e] sm:col-span-2">
          Legal owner type
          <Field as="select" value={branch} onChange={(event) => onChange('branch', event.target.value)}>
            {LISTING_SELLER_PROFILE_BRANCHES.filter((item) => item.value).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Field>
        </label>
        {individual ? <>
          <Input label="First name" field="sellerFirstName" draft={draft} onChange={onChange} />
          <Input label="Surname" field="sellerSurname" draft={draft} onChange={onChange} />
          <Input label={foreign ? 'Passport number' : 'ID number'} field={foreign ? 'foreignPassportNumber' : 'idNumber'} draft={draft} onChange={onChange} />
          <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">Marital status<Field as="select" value={draft.maritalStatus || ''} onChange={(event) => onChange('maritalStatus', event.target.value)}><option value="">Not captured</option><option value="single">Single</option><option value="married_in_community">Married in community</option><option value="married_out_of_community">Married out of community</option><option value="divorced">Divorced</option><option value="widowed">Widowed</option></Field></label>
          {branch === 'married' || String(draft.maritalStatus || '').startsWith('married') ? <>
            <Input label="Spouse full name" field="spouseName" draft={draft} onChange={onChange} />
            <Input label="Spouse ID number" field="spouseIdNumber" draft={draft} onChange={onChange} />
            <Input label="Spouse email" field="spouseEmail" type="email" draft={draft} onChange={onChange} />
          </> : null}
        </> : null}
        {branch === 'multiple_owners' ? <PeopleEditor title="Owners" rows={draft.multipleOwners} onAdd={() => onAddPerson('multipleOwners', 'Owner')} onUpdate={(index, field, value) => onUpdatePerson('multipleOwners', index, field, value)} onRemove={(index) => onRemovePerson('multipleOwners', index)} /> : null}
        {company ? <>
          <Input label="Company / CC name" field="companyName" draft={draft} onChange={onChange} />
          <Input label="Registration number" field="companyRegistrationNumber" draft={draft} onChange={onChange} />
          <Input label="Registered address" field="companyRegisteredAddress" draft={draft} onChange={onChange} className="sm:col-span-2" />
          <PeopleEditor title="Directors / members" rows={draft.companyDirectors} onAdd={() => onAddPerson('companyDirectors', 'Director')} onUpdate={(index, field, value) => onUpdatePerson('companyDirectors', index, field, value)} onRemove={(index) => onRemovePerson('companyDirectors', index)} />
          <Input label="Authorised signatory" field="authorisedSignatoryName" draft={draft} onChange={onChange} />
          <Input label="Signatory capacity" field="authorisedSignatoryCapacity" draft={draft} onChange={onChange} />
          <Input label="Signatory email" field="authorisedSignatoryEmail" type="email" draft={draft} onChange={onChange} />
        </> : null}
        {trust ? <>
          <Input label="Trust name" field="trustName" draft={draft} onChange={onChange} />
          <Input label="Trust registration number" field="trustRegistrationNumber" draft={draft} onChange={onChange} />
          <Input label="Registered address" field="trustRegisteredAddress" draft={draft} onChange={onChange} className="sm:col-span-2" />
          <PeopleEditor title="Trustees" rows={draft.trustees} onAdd={() => onAddPerson('trustees', 'Trustee')} onUpdate={(index, field, value) => onUpdatePerson('trustees', index, field, value)} onRemove={(index) => onRemovePerson('trustees', index)} />
          <PeopleEditor title="Beneficial owners" rows={draft.trustBeneficiaries} onAdd={() => onAddPerson('trustBeneficiaries', 'Beneficiary')} onUpdate={(index, field, value) => onUpdatePerson('trustBeneficiaries', index, field, value)} onRemove={(index) => onRemovePerson('trustBeneficiaries', index)} />
          <Input label="Authorised trustee" field="authorisedTrusteeName" draft={draft} onChange={onChange} />
          <Input label="Trustee capacity" field="authorisedTrusteeCapacity" draft={draft} onChange={onChange} />
          <Input label="Trustee email" field="authorisedTrusteeEmail" type="email" draft={draft} onChange={onChange} />
        </> : null}
        {branch === 'deceased_estate' ? <><Input label="Estate name" field="deceasedEstateName" draft={draft} onChange={onChange} /><Input label="Estate reference" field="estateReferenceNumber" draft={draft} onChange={onChange} /><Input label="Executor" field="executorName" draft={draft} onChange={onChange} /><Input label="Executor email" field="executorEmail" type="email" draft={draft} onChange={onChange} /></> : null}
        {branch === 'power_of_attorney' ? <><Input label="Legal owner / principal" field="powerOfAttorneyPrincipalName" draft={draft} onChange={onChange} /><Input label="Principal ID number" field="powerOfAttorneyPrincipalIdNumber" draft={draft} onChange={onChange} /><Input label="Authorised representative" field="powerOfAttorneyName" draft={draft} onChange={onChange} /><Input label="Representative email" field="powerOfAttorneyEmail" type="email" draft={draft} onChange={onChange} /></> : null}
        {branch === 'other' ? <><Input label="Legal entity name" field="otherEntityName" draft={draft} onChange={onChange} /><Input label="Registration / reference" field="otherEntityRegistrationNumber" draft={draft} onChange={onChange} /></> : null}
        {foreign ? <><Input label="Country / jurisdiction" field="foreignOwnerCountry" draft={draft} onChange={onChange} /><Input label="Foreign registration number" field="foreignRegistrationNumber" draft={draft} onChange={onChange} /><Input label="Residency / signing status" field="foreignResidencyStatus" draft={draft} onChange={onChange} /></> : null}
      </section>

      <section className="grid gap-4 rounded-[18px] border border-[#dce6f2] bg-white p-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><h4 className="text-sm font-semibold text-[#243d56]">Primary contact details</h4></div>
        <Input label="Email" field="email" type="email" draft={draft} onChange={onChange} />
        <Input label="Phone" field="phone" type="tel" draft={draft} onChange={onChange} />
        <Input label="Alternative contact" field="alternativeContact" draft={draft} onChange={onChange} />
        <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">Preferred contact<Field as="select" value={draft.preferredContactMethod || ''} onChange={(event) => onChange('preferredContactMethod', event.target.value)}><option value="">Not captured</option><option value="email">Email</option><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option></Field></label>
      </section>

      <section className="grid gap-4 rounded-[18px] border border-[#dce6f2] bg-white p-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><h4 className="text-sm font-semibold text-[#243d56]">Property and ownership details</h4></div>
        <Input label="Property address" field="propertyAddress" draft={draft} onChange={onChange} className="sm:col-span-2" />
        <Input label="Title deed number" field="titleDeedNumber" draft={draft} onChange={onChange} />
        <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">Bond status<Field as="select" value={draft.bondStatus || 'unknown'} onChange={(event) => onChange('bondStatus', event.target.value)}><option value="unknown">Not known</option><option value="bonded">Bonded</option><option value="no_bond">No bond</option></Field></label>
        {draft.bondStatus === 'bonded' ? <><Input label="Bond holder" field="bondHolder" draft={draft} onChange={onChange} /><Input label="Outstanding bond" field="outstandingBond" type="number" draft={draft} onChange={onChange} /></> : null}
      </section>
      <button type="submit" className="sr-only" disabled={saving}>Save seller information</button>
    </form>
  )
}
