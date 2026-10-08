import { ListingValidationTarget } from './ListingValidation'
import { focusListingField, listingFieldId } from './useListingIssueNavigation'
import { useEffect, useState } from 'react'
import { Building2, Car, ChevronRight, ClipboardList, Droplets, Eye, House, PawPrint, ShieldCheck, Trees, Warehouse, Wifi } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { captureRentalPortalFacts } from '../../services/rentals/rentalPortalFieldContract.js'
import { rentalFeatureCaptureFields, rentalFeatureGroup } from '../../services/rentals/rentalFeatureCaptureModel.js'

const icons = { Security: ShieldCheck, 'Rooms & living': House, 'Parking & buildings': Car, 'Energy & water': Droplets, 'Connectivity & utilities': Wifi, 'Property & title details': ClipboardList, 'Outdoor & leisure': Trees, 'Accessibility & views': Eye, 'Pet friendly': PawPrint, 'Business premises': Building2, 'Warehouse & loading': Warehouse }
const optionLabel = (value) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')

export default function RentalCategoryFields({ form, onChange, disabled = false, focusRequest = null }) {
  const [activeGroup, setActiveGroup] = useState(null)
  const answers = captureRentalPortalFacts(form)
  const fields = rentalFeatureCaptureFields(form)
  const groups = [...new Set(fields.map(rentalFeatureGroup))]
  const [dismissedRequest, setDismissedRequest] = useState(null)
  const requestedField = focusRequest?.step === 'features' && focusRequest !== dismissedRequest
    ? fields.find((field) => (field.formKey || field.key) === focusRequest.field) : null
  const visibleGroup = requestedField ? rentalFeatureGroup(requestedField) : activeGroup
  function closeGroup() { setActiveGroup(null); setDismissedRequest(focusRequest) }
  useEffect(() => {
    if (visibleGroup && focusRequest?.step === 'features') focusListingField(focusRequest.field)
  }, [visibleGroup, focusRequest])
  function update(field, next) {
    if (field.key === 'feature.pet_friendly') {
      onChange('petsPolicy', next === 'yes' ? 'allowed' : next === 'no' ? 'not_allowed' : 'subject_to_approval')
    } else if (field.formKey) onChange(field.formKey, next)
    else onChange('rentalPortalFacts', { ...form.rentalPortalFacts, [field.key]: next })
  }
  return <section>
    <h2 className="text-xl font-semibold text-[#18324b]">Additional property details</h2>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => {
        const groupFields = fields.filter((field) => rentalFeatureGroup(field) === group)
        const answered = groupFields.filter((field) => answers[field.key] !== undefined && answers[field.key] !== null).length
        const Icon = icons[group] || Building2
        return <button key={group} type="button" data-rental-control="feature-category" disabled={disabled} onClick={() => { setDismissedRequest(focusRequest); setActiveGroup(group) }} className="flex min-h-28 items-center gap-4 rounded-2xl border border-[#dbe6f2] bg-white p-5 text-left transition hover:border-[#91abc0] hover:bg-[#f7fafc]" aria-label={`Open ${group}`}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#eef4fa] text-[#315f80]"><Icon size={23} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#18324b]">{group}</span><span className="mt-1 block text-xs text-[#607891]">{answered} of {groupFields.length} answered</span></span><ChevronRight size={18} className="shrink-0 text-[#607891]" aria-hidden="true" />
        </button>
      })}
    </div>
    <Modal open={Boolean(visibleGroup)} onClose={closeGroup} title={visibleGroup} initialFocusId={requestedField ? listingFieldId(focusRequest.field) : ''} className="rental-feature-dialog" footer={<Button type="button" onClick={closeGroup}>Done</Button>}>
      <fieldset disabled={disabled} className="grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2">
        {fields.filter((field) => rentalFeatureGroup(field) === visibleGroup).map((field) => {
          const value = answers[field.key]
          return <ListingValidationTarget key={field.key} field={field.formKey || field.key}><div className="min-w-0 rounded-xl border border-[#e0e8f1] bg-[#fbfdff] p-4">
            {field.type === 'boolean' ? <div role="group" aria-label={field.label}>
              <p className="text-sm font-semibold text-[#2d445e]">{field.label}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">{['yes', 'no'].map((choice) => {
                const selected = value === (choice === 'yes')
                return <button key={choice} type="button" data-rental-control="feature-answer" aria-pressed={selected} onClick={() => update(field, selected ? '' : choice)} className={`min-h-10 rounded-lg border text-sm font-semibold ${selected ? 'border-[#274c69] bg-[#eaf2f8] text-[#18324b]' : 'border-[#dbe6f2] bg-white text-[#526f88]'}`}>{choice === 'yes' ? 'Yes' : 'No'}</button>
              })}</div>
              <div className="mt-2 flex min-h-6 items-center justify-between gap-2 text-xs text-[#607891]">
                <span>{value === null || value === undefined ? field.key === 'feature.pet_friendly' ? 'Subject to approval' : 'Not answered' : 'Answered'}</span>
                {value !== null && value !== undefined ? <button type="button" data-rental-control="clear-answer" onClick={() => update(field, '')} className="underline underline-offset-2">Clear</button> : null}
              </div>
            </div> : <label className="form-field"><span>{field.label}</span>{field.options ? <select value={value ?? ''} onChange={(event) => update(field, event.target.value)}><option value="">Not captured</option>{field.options.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select>
              : <input type={field.format === 'date-time' ? 'date' : field.type === 'integer' || field.type === 'number' ? 'number' : 'text'} min={field.type === 'integer' || field.type === 'number' ? 0 : undefined} max={field.max} step={field.type === 'integer' ? 1 : field.type === 'number' ? 'any' : undefined} value={field.formKey ? form[field.formKey] ?? '' : field.format === 'date-time' ? (form.rentalPortalFacts?.[field.key] || '').slice(0, 10) : form.rentalPortalFacts?.[field.key] ?? ''} onChange={(event) => update(field, event.target.value)} placeholder="Not captured" />}</label>}
          </div></ListingValidationTarget>
        })}
      </fieldset>
    </Modal>
  </section>
}
