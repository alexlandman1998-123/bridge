import { useId, useState } from 'react'
import { CheckCircle2, ChevronDown, Plus, Users, X } from 'lucide-react'
import Field from '../../../../components/ui/Field'
import { isAddressFieldKey } from '../../../../components/location/addressInputModel'
import { LANDLORD_TYPES, landlordHasRepresentative, landlordPersonFields, landlordPeopleRole, LANDLORD_DRAFT_HELP } from '../../../../services/rentals/rentalLandlordProfileRules.js'
import { landlordProfileCompletion, landlordPersonComplete } from '../../../../services/rentals/rentalLandlordProfileLayout.js'
import { selectLandlordSignatory, updateLandlordPeople } from '../../../../services/rentals/rentalLandlordSignatories.js'

const text = value => String(value ?? '').trim()
const badges = { complete: ['Ready', 'bg-[#eaf7ef] text-[#1c7051]'], incomplete: ['Details needed', 'bg-[#fff4df] text-[#896319]'], optional: ['Optional', 'bg-[#f0f4f8] text-[#607387]'] }
function Badge({ status }) {
  const [label, style] = badges[status]
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${style}`}>{label}</span>
}
function ProfileField({ definition, value, onChange, prefix = '', disabled }) {
  const [key, label, type] = definition
  const ariaLabel = `${prefix}${label}`
  return <label className={`grid min-w-0 gap-1.5 text-xs font-semibold text-[#53687c] ${type === 'textarea' ? 'sm:col-span-2' : ''}`}>
    {label}
    {Array.isArray(type) ? <Field as="select" aria-label={ariaLabel} value={value ?? ''} disabled={disabled} onChange={event => onChange(key, event.target.value)}>
      <option value="">Not captured</option>
      {value && !type.some(([id]) => id === value) ? <option value={value}>{value} (previous answer)</option> : null}
      {type.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
    </Field> : <Field addressSearch={isAddressFieldKey(key)} as={type === 'textarea' ? 'textarea' : 'input'} type={type === 'textarea' ? undefined : type || 'text'} rows={3} aria-label={ariaLabel} value={value ?? ''} disabled={disabled} min={type === 'number' ? 0 : undefined} max={key === 'ownershipShare' ? 100 : undefined} step={type === 'number' ? 'any' : undefined} onChange={event => onChange(key, event.target.value)} />}
  </label>
}
export default function RentalLandlordProfileEditor({ profile = {}, portfolio, onChange, publicSource = false, disabled = false, saveState, submitted = false }) {
  const id = useId()
  const [openSections, setOpenSections] = useState({ contact: true })
  const [openPeople, setOpenPeople] = useState({})
  const completion = landlordProfileCompletion(profile, { publicSource, portfolio })
  const people = Array.isArray(profile.people) ? profile.people : []
  const selected = people.find(person => person.id === profile.primarySignatoryId)
  const setField = (key, value) => onChange({ ...profile, [key]: value })
  const setPeople = next => onChange(updateLandlordPeople(profile, next))
  const editPerson = personId => {
    setOpenSections(current => ({ ...current, people: true }))
    setOpenPeople(current => ({ ...current, [personId]: true }))
  }
  const addPerson = () => {
    const personId = crypto.randomUUID()
    setPeople([...people, { id: personId, name: '', role: landlordPeopleRole(profile), signingAuthority: false }])
    editPerson(personId)
  }
  const renderField = (definition, row = profile, update = setField, prefix = '') => <ProfileField key={definition[0]} definition={definition} value={row[definition[0]]} onChange={update} prefix={prefix} disabled={disabled} />
  const signingFields = section => {
    const representative = landlordHasRepresentative(profile)
    return <>
      {section.fields.filter(([key]) => key === 'hasRepresentative').map(field => renderField(field))}
      <div className="mt-3 space-y-2">
        {people.filter(person => text(person.name)).length ? <p className="text-xs text-[#607387]">Select the people authorised to sign. This records their role; your agent still reviews the authority evidence.</p> : <p className="text-xs text-[#607387]">Add people above to choose signatories, or capture a separate signatory below.</p>}
        {people.filter(person => text(person.name)).map(person => <label key={person.id} className="flex min-h-10 items-center gap-3 rounded-lg border border-[#e3ebf2] px-3 py-2 text-sm text-[#29435d]">
          <input type="checkbox" aria-label={`Authorise ${person.name} to sign`} disabled={disabled} checked={person.signingAuthority === true} onChange={event => setPeople(people.map(item => item.id === person.id ? { ...item, signingAuthority: event.target.checked } : item))} />
          <span className="min-w-0 flex-1 truncate font-semibold">{person.name}</span><span className="text-xs text-[#607387]">{person.role || person.capacity || 'Role needed'}</span>
        </label>)}
      </div>
      {representative ? <div className="mt-4 space-y-4">
        <label className="grid gap-1.5 text-xs font-semibold text-[#53687c]">Primary signatory
          <Field as="select" aria-label="Primary signatory" disabled={disabled} value={profile.primarySignatoryId || ''} onChange={event => onChange(selectLandlordSignatory(profile, event.target.value))}>
            <option value="">Enter separate signatory details</option>
            {profile.primarySignatoryId && !selected ? <option value={profile.primarySignatoryId}>Previous person unavailable — choose again</option> : null}
            {people.filter(person => text(person.name) || person.id === profile.primarySignatoryId).map(person => <option key={person.id} value={person.id}>{person.name || 'Unnamed person'} · {person.capacity || person.role || 'Role needed'}</option>)}
          </Field>
        </label>
        {selected ? <div className="rounded-xl border border-[#d8e9df] bg-[#f4faf6] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#234b3b]">{selected.name || 'Name needed'}</p><p className="mt-1 text-xs text-[#5d786a]">{selected.capacity || selected.role || 'Signing capacity needed'} · {selected.email || selected.phone || 'Contact details needed'}</p></div><button type="button" className="text-xs font-semibold text-[#176448] underline underline-offset-4" onClick={() => editPerson(selected.id)}>{disabled ? 'View selected person' : 'Edit selected person'}</button></div>
          <p className="mt-2 text-xs text-[#5d786a]">Uses this person’s identity and contact details. Edit the person to update them.</p>
        </div> : <div className="grid gap-3 sm:grid-cols-2">{section.fields.filter(([key]) => key.startsWith('authorisedSignatory')).map(field => renderField(field))}</div>}
        <div className="grid gap-3 sm:grid-cols-2">{section.fields.filter(([key]) => ['authorityBasis','resolutionDate'].includes(key)).map(field => renderField(field))}</div>
      </div> : null}
    </>
  }
  return <div className="min-w-0 space-y-3" aria-label="Landlord profile details">
    <div className="rounded-2xl border border-[#dce7f2] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-[#20364c]">Landlord profile</h2><p className="mt-1 text-xs text-[#607387]">{submitted ? 'Submitted for review' : completion.complete ? 'Details ready for submission' : completion.profileComplete ? 'Profile ready — property addresses still needed' : 'Draft — complete the highlighted sections before submitting'}</p></div><span className="rounded-full bg-[#eef4f8] px-3 py-1.5 text-xs font-semibold text-[#425970]">{completion.completeSections} of {completion.sections.length} profile sections ready</span></div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#edf2f6]" role="progressbar" aria-label="Profile sections ready" aria-valuemin={0} aria-valuemax={completion.sections.length} aria-valuenow={completion.completeSections}><div className="h-full rounded-full bg-[#21845c] transition-[width]" style={{ width: `${completion.sections.length ? completion.completeSections / completion.sections.length * 100 : 0}%` }} /></div>
      {saveState ? <p className="mt-3 text-xs text-[#607387]">{saveState === 'saved' ? 'Saved details' : saveState === 'saving' ? 'Saving changes…' : 'Unsaved draft changes'}</p> : null}
      {completion.errors.length ? <details className="mt-3 text-xs text-[#607387]"><summary className="cursor-pointer font-semibold">Remaining details ({completion.errors.length})</summary><ul className="mt-2 list-disc space-y-1 pl-5">{completion.errors.map(message => <li key={message}>{message}</li>)}</ul></details> : <p className="mt-3 text-xs text-[#607387]">Profile completion and evidence review are tracked separately.</p>}
    </div>
    {completion.sections.map(section => {
      const open = openSections[section.id] === true
      return <section key={section.id} className="overflow-hidden rounded-xl border border-[#dce7f2] bg-white" aria-label={section.title}>
        <h3><button type="button" aria-expanded={open} aria-controls={`${id}-${section.id}`} className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpenSections(current => ({ ...current, [section.id]: !open }))}>
          {section.status === 'complete' ? <CheckCircle2 size={17} className="shrink-0 text-[#21845c]" /> : <span className="h-4 w-4 shrink-0 rounded-full border border-[#b9c8d5]" />}
          <span className="min-w-0 flex-1 text-sm font-semibold text-[#20364c]">{section.title}</span><Badge status={section.status} /><ChevronDown size={16} className={`shrink-0 text-[#8294aa] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button></h3>
        <div id={`${id}-${section.id}`} hidden={!open} className="border-t border-[#edf2f6] px-4 pb-4 pt-3">
          <p className="mb-3 text-xs text-[#607387]">{section.description}</p>
          {section.id === 'contact' ? <>
            {renderField(['type','Landlord type',LANDLORD_TYPES])}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">{section.fields.map(field => renderField(field))}</div>
            <p className="mt-3 text-xs leading-5 text-[#607387]">{LANDLORD_DRAFT_HELP}</p>
          </> : section.id === 'people' ? <>
            <div className="space-y-2">{people.map((person, index) => {
              const expanded = openPeople[person.id] === true
              const complete = landlordPersonComplete(profile, person)
              const update = (key, value) => setPeople(people.map(item => item.id === person.id ? { ...item, [key]: value } : item))
              return <article key={person.id} className="overflow-hidden rounded-xl border border-[#e3ebf2]">
                <div className="flex items-center gap-2 p-3">
                  <button type="button" aria-expanded={expanded} aria-controls={`${id}-person-${person.id}`} aria-label={`${expanded ? 'Close' : disabled ? 'View' : 'Edit'} person ${index + 1}: ${person.name || 'New person'}`} onClick={() => setOpenPeople(current => ({ ...current, [person.id]: !expanded }))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eef4f8] text-xs font-semibold text-[#48677e]">{text(person.name).slice(0,1).toUpperCase() || <Users size={14}/>}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#29435d]">{person.name || `New person ${index + 1}`}</span><span className="block text-xs text-[#607387]">{person.role || person.capacity || 'Role needed'}{landlordPersonFields(profile).some(([key]) => key === 'ownershipShare') && text(person.ownershipShare) ? ` · ${person.ownershipShare}% share` : ''}{person.signingAuthority ? ' · Signatory' : ''}</span></span>
                    <span className="shrink-0"><Badge status={complete ? 'complete' : 'incomplete'} /></span><ChevronDown size={15} className={expanded ? 'rotate-180 text-[#8294aa]' : 'text-[#8294aa]'} />
                  </button>
                  <button type="button" aria-label={`Remove person ${index + 1}`} disabled={disabled} onClick={() => setPeople(people.filter(item => item.id !== person.id))} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#8294aa] hover:bg-[#fff0f0] hover:text-red-700"><X size={15}/></button>
                </div>
                <div id={`${id}-person-${person.id}`} hidden={!expanded} className="border-t border-[#edf2f6] bg-[#fbfdff] p-3">
                  <div className="grid gap-3 sm:grid-cols-2">{[['role','Role'], ...landlordPersonFields(profile)].map(field => renderField(field, person, update, `Person ${index + 1} `))}</div>
                  <label className="mt-3 flex items-center gap-2 text-xs text-[#425970]"><input type="checkbox" aria-label={`Person ${index + 1} Authorised to sign`} disabled={disabled} checked={person.signingAuthority === true} onChange={event => update('signingAuthority', event.target.checked)} />Authorised to sign the rental mandate</label>
                  {!complete ? <p className="mt-3 text-xs text-[#896319]">Identity, address and role details are still needed before submission.</p> : null}
                </div>
              </article>
            })}</div>
            {!people.length ? <p className="rounded-lg bg-[#f5f8fb] p-3 text-xs text-[#607387]">No people captured yet.</p> : null}
            <button type="button" disabled={disabled} onClick={addPerson} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#dce7f2] px-3 py-2 text-xs font-semibold text-[#425970]"><Plus size={14}/>Add person</button>
          </> : section.id === 'signing' ? signingFields(section) : <div className="grid gap-3 sm:grid-cols-2">{section.fields.map(field => renderField(field))}</div>}
          {section.messages.length ? <ul className="mt-3 space-y-1 text-xs text-[#896319]">{section.messages.map(message => <li key={message}>{message}</li>)}</ul> : null}
        </div>
      </section>
    })}
  </div>
}
