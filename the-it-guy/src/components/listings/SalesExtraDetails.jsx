import { useState } from 'react'
import { Building2, Car, ChevronRight, ClipboardList, Droplets, Eye, House, PawPrint, ShieldCheck, Trees, Wifi, Ruler } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { LISTING_FEATURE_CATALOG, LISTING_FEATURE_GROUPS, normalizeListingFeatureFacts } from '../../services/listings/listingFeatureCatalog'
import { getSpecialistSalesListingSchema } from '../../services/listings/specialistSalesListingSchema'
import { plainPropertyFieldLabel } from '../../services/listings/listingAdvertPreviewModel'
import './listing-capture-layout.css'

const icons = { Security: ShieldCheck, 'Rooms & living': House, 'Parking & buildings': Car, 'Energy & water': Droplets, 'Connectivity & utilities': Wifi, 'Outdoor & leisure': Trees, 'Accessibility & views': Eye, 'Pet friendly': PawPrint, Other: ClipboardList, 'Category-specific details': Ruler }
const answered = value => value !== null && value !== undefined && value !== ''
const specialistLabel = field => `${field.key === 'parking' ? 'Parking details' : plainPropertyFieldLabel(field)}${field.unit ? ` (${field.unit === 'ha' ? 'hectares' : field.unit})` : ''}`

export default function SalesExtraDetails({ form, onChange, onFeatureChange, disabled = false }) {
  const [activeGroup, setActiveGroup] = useState(null)
  const facts = normalizeListingFeatureFacts(form.featureFacts, form.keySellingPoints)
  const specialist = getSpecialistSalesListingSchema(form.propertyCategory, form.listingType).fields.filter(field => field.key !== 'erfSize')
  const groups = [
    ...(specialist.length ? [{ name: 'Category-specific details', fields: specialist.map(field => ({ ...field, specialist: true, label: specialistLabel(field), type: field.kind === 'boolean' ? 'boolean' : field.kind === 'measurement' ? 'count' : field.kind })) }] : []),
    ...[...LISTING_FEATURE_GROUPS.filter(group => group !== 'Other'), 'Pet friendly', 'Other'].map(name => ({ name, fields: LISTING_FEATURE_CATALOG.filter(feature => (name === 'Pet friendly' ? feature.key === 'pet_friendly' : feature.group === name && feature.key !== 'pet_friendly') && (feature.listingTypes.includes(form.listingType || 'sale') || answered(facts[feature.key]))) })),
  ].filter(group => group.fields.length && !(form.propertyCategory === 'vacant_land' && ['Rooms & living', 'Parking & buildings'].includes(group.name)))
  const valueFor = field => field.specialist ? form[field.key] : facts[field.key]
  const change = (field, value) => field.specialist ? onChange(field.key, value) : onFeatureChange(field.key, value)
  const selectedGroup = groups.find(group => group.name === activeGroup)
  return <section className="sales-extra-details">
    <h2 className="text-xl font-semibold text-[#18324b]">Extra details (optional)</h2>
    <p className="mt-2 text-sm text-[#607387]">Add what you know to make your Property24 and Private Property adverts more complete. You can skip this step and return later.</p>
    <div className="sales-extra-groups">
      {groups.map(group => {
        const Icon = icons[group.name] || Building2
        const count = group.fields.filter(field => answered(valueFor(field))).length
        return <button key={group.name} type="button" disabled={disabled} onClick={() => setActiveGroup(group.name)} aria-label={`Open ${group.name}`}>
          <span className="sales-extra-icon"><Icon size={23} aria-hidden="true" /></span>
          <span className="sales-extra-group-label"><strong>{group.name}</strong><span>{count ? `${count} detail${count === 1 ? '' : 's'} added` : 'Optional'}</span></span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      })}
    </div>
    <Modal open={Boolean(selectedGroup)} onClose={() => setActiveGroup(null)} title={selectedGroup?.name || ''} subtitle="Leave details you cannot confirm blank. You can change these answers later." className="sales-extra-dialog" footer={<Button type="button" onClick={() => setActiveGroup(null)}>Done</Button>}>
      <fieldset disabled={disabled} className="sales-extra-fields">
        {selectedGroup?.fields.map(field => {
          const value = valueFor(field)
          return <div key={field.key} data-listing-field={field.key} className={`sales-extra-field ${field.type === 'terms' ? 'sales-extra-field-wide' : ''}`}>
            {field.type === 'boolean' ? <div role="group" aria-label={field.label}>
              <p className="sales-extra-field-label">{field.label}</p>
              <div className="sales-extra-answers">{['yes', 'no'].map(choice => <button key={choice} type="button" aria-pressed={value === (choice === 'yes')} onClick={() => change(field, field.specialist ? choice === 'yes' : choice)}>{choice === 'yes' ? 'Yes' : 'No'}</button>)}</div>
              <div className="sales-extra-answer-state"><span>{answered(value) ? 'Answered' : 'Not answered'}</span>{!field.specialist && answered(value) ? <button type="button" onClick={() => change(field, null)}>Clear</button> : null}</div>
            </div> : <label>
              <span className="sales-extra-field-label">{field.label}</span>
              {field.options ? <select name={field.key} value={value ?? ''} onChange={event => change(field, event.target.value || null)}><option value="">Not captured</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select>
                : field.type === 'terms' ? <textarea name={field.key} value={value ?? ''} onChange={event => change(field, event.target.value)} placeholder="Add the terms you can confirm" />
                  : <input name={field.key} type={field.type === 'count' ? 'number' : 'text'} min={field.type === 'count' ? '0' : undefined} step={field.type === 'count' ? field.specialist ? '0.1' : '1' : undefined} value={value ?? ''} onChange={event => change(field, event.target.value)} placeholder="Not captured" />}
            </label>}
          </div>
        })}
      </fieldset>
    </Modal>
  </section>
}
