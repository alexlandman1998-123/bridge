import { getVisibleOnboardingSections } from '../../lib/purchaserPersonas.js'
import Button from '../ui/Button.jsx'

// Reuse the lead/onboarding questions; commercial terms and documents have
// dedicated transaction tabs. Partial agent capture never submits onboarding.
const PERSON_SECTIONS = new Set(['personal_details', 'married_coc_details', 'married_anc_details', 'company_entity', 'directors', 'trust_entity', 'trustees'])
const CONTACT_KEYS = new Set(['first_name', 'last_name', 'email', 'phone'])

function CaptureField({ field, value, disabled, onChange }) {
  const classes = 'mt-1 w-full rounded-control border border-borderDefault bg-surface p-2 text-sm font-normal'
  if (field.type === 'checkbox') return <label className="flex items-center gap-2 text-sm text-textMuted"><input type="checkbox" disabled={disabled} checked={value === true} onChange={event => onChange(event.target.checked)} />{field.label}</label>
  return <label className={`text-sm font-medium text-textMuted ${field.fullWidth ? 'sm:col-span-2' : ''}`}>{field.label}
    {field.type === 'select' || field.type === 'radio' ? <select className={classes} disabled={disabled} value={value ?? ''} onChange={event => onChange(event.target.value)}><option value="">Not captured</option>{(field.options || []).filter(option => option.value !== '').map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      : field.type === 'textarea' ? <textarea className={classes} disabled={disabled} value={value ?? ''} onChange={event => onChange(event.target.value)} rows={2} />
        : <input className={classes} disabled={disabled} type={field.type === 'currency' ? 'number' : field.type || 'text'} value={value ?? ''} onChange={event => onChange(event.target.value)} />}
  </label>
}

export default function TransactionBuyerProfileFields({ value = {}, purchaserType = 'individual', disabled = false, onChange }) {
  const sections = getVisibleOnboardingSections({ purchaserType, financeType: 'cash', values: { ...value, purchaser_type: purchaserType } })
    .filter(section => PERSON_SECTIONS.has(section.key))
    .map(section => ({ ...section, fields: section.fields.filter(field => !(section.key === 'personal_details' && CONTACT_KEYS.has(field.key)) && !field.key.endsWith('_available')) }))
  const collection = section => Array.isArray(value[section.key]) ? value[section.key] : section.key === 'directors' && Array.isArray(value.company?.directors) ? value.company.directors : section.key === 'trustees' && Array.isArray(value.trust?.trustees) ? value.trust.trustees : []
  const updateCollection = (section, people) => onChange({ ...value, [section.key]: people, ...(section.key === 'directors' && value.company ? { company: { ...value.company, directors: people } } : section.key === 'trustees' && value.trust ? { trust: { ...value.trust, trustees: people } } : {}) })
  return <div className="space-y-4">{sections.map(section => <section key={section.key} className="rounded-xl border border-borderSoft bg-surface p-4">
    <h5 className="mb-3 text-sm font-semibold text-textStrong">{section.key === 'personal_details' ? 'Personal details' : section.title}</h5>
    {section.repeatable ? <div className="space-y-3">{collection(section).map((person, index, people) => <div key={person.id || index} className="grid gap-3 rounded-control border border-borderSoft p-3 sm:grid-cols-2">
      {section.fields.map(field => <CaptureField key={field.key} field={field} value={person[field.key]} disabled={disabled} onChange={next => updateCollection(section, people.map((entry, position) => position === index ? { ...entry, [field.key]: next } : entry))} />)}
      <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => updateCollection(section, people.filter((_, position) => position !== index))}>Remove {section.itemLabel.toLowerCase()}</Button>
    </div>)}<Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => updateCollection(section, [...collection(section), { ...section.createItem?.(), id: crypto.randomUUID() }])}>{section.addLabel}</Button></div>
      : <div className="grid gap-3 sm:grid-cols-2">{section.fields.map(field => <CaptureField key={field.key} field={field} value={value[field.key] ?? (field.key === 'residential_address' ? value.physical_address : field.key === 'spouse_id_number' ? value.spouse_identity_number : undefined)} disabled={disabled} onChange={next => onChange({ ...value, [field.key]: next, ...(field.key === 'residential_address' ? { physical_address: next } : field.key === 'spouse_id_number' ? { spouse_identity_number: next } : {}) })} />)}</div>}
  </section>)}</div>
}
