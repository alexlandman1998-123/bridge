import AreaAutocomplete from '../location/AreaAutocomplete'
import Field from '../ui/Field'

const BUYER_MOVE_TIMEFRAME_OPTIONS = ['', 'Immediately', '1-3 months', '3-6 months', '6+ months', 'Just browsing']
const BUYER_BUDGET_OPTIONS = ['', 'Under R 1m', 'R 1m – R 2m', 'R 2m – R 3m', 'R 3m – R 5m', 'R 5m – R 8m', 'R 8m+', 'Flexible / discuss']
const BUYER_PRE_APPROVAL_OPTIONS = ['', 'Not started', 'Pre-approved', 'Submitted', 'Needs bond originator', 'Cash buyer']
const BUYER_QUALIFICATION_LABEL_CLASS = 'grid gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-[#60758b]'
const BUYER_QUALIFICATION_FIELD_CLASS = 'h-11 rounded-[12px] px-3 text-sm font-medium tracking-normal placeholder:font-medium placeholder:tracking-normal'
const BUYER_QUALIFICATION_TEXTAREA_CLASS = 'min-h-[132px] rounded-[12px] px-3 py-3 text-sm font-medium leading-6 tracking-normal placeholder:font-medium placeholder:tracking-normal'

function withSavedValue(options, value) {
  return value && !options.includes(value) ? [options[0], value, ...options.slice(1)] : options
}

export default function BuyerQualificationFields({ form, onChange, disabled = false, id = 'buyer-qualification-editor' }) {
  const budgetOptions = withSavedValue(BUYER_BUDGET_OPTIONS, form.budget)
  const preApprovalOptions = withSavedValue(BUYER_PRE_APPROVAL_OPTIONS, form.preApprovalStatus)
  const timeframeOptions = withSavedValue(BUYER_MOVE_TIMEFRAME_OPTIONS, form.moveTimeframe)
  const financeOptions = withSavedValue(['Cash', 'Bond', 'Cash + bond', 'Pre-approved', 'Needs assistance'], form.financeType)
  const normalizeText = value => String(value || '').trim()
  return (
    <fieldset id={id} disabled={disabled} className="mt-4 grid min-w-0 gap-4 border-0 p-0" data-testid="buyer-qualification-editor">
      <div className="grid gap-4 md:grid-cols-2">
        <label className={BUYER_QUALIFICATION_LABEL_CLASS}>
          What is your budget?
          <Field as="select" className={BUYER_QUALIFICATION_FIELD_CLASS} value={form.budget} onChange={(event) => onChange('budget', event.target.value)}>
            {budgetOptions.map((option) => <option key={option || 'empty-budget'} value={option}>{option || 'Select budget range'}</option>)}
          </Field>
        </label>
        <label className={BUYER_QUALIFICATION_LABEL_CLASS}>
          When would you like to move?
          <Field as="select" className={BUYER_QUALIFICATION_FIELD_CLASS} value={form.moveTimeframe} onChange={(event) => onChange('moveTimeframe', event.target.value)}>
            {timeframeOptions.map((option) => (
              <option key={option || 'empty-timeframe'} value={option}>{option || 'Select timeframe'}</option>
            ))}
          </Field>
        </label>
      </div>
      <AreaAutocomplete
        label="Which area should we focus on?"
        value={form.areaInterest}
        disabled={disabled}
        onChange={(value) => onChange('areaInterest', value)}
        placeholder="Search saved areas or enter an area"
        description="Choose an Arch9 area or type a suburb, town, or region."
      />
      <div>
        <span className={BUYER_QUALIFICATION_LABEL_CLASS}>Finance readiness</span>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          {financeOptions.map((option) => {
            const selected = form.financeType === option
            return <button key={option} type="button" className={`rounded-[12px] border px-3 py-3 text-sm font-semibold transition ${selected ? 'border-[#157aaf] bg-[#eaf5fb] text-[#135e89] ring-2 ring-[#c9e7f5]' : 'border-[#dbe7f2] bg-white text-[#29435d] hover:border-[#9ec9df]'}`} onClick={() => onChange('financeType', option)} aria-pressed={selected}>{option}</button>
          })}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className={BUYER_QUALIFICATION_LABEL_CLASS}>
          Deposit available?
          <Field className={BUYER_QUALIFICATION_FIELD_CLASS} placeholder="R 400 000" value={form.depositAvailable} onChange={(event) => onChange('depositAvailable', event.target.value)} />
        </label>
        {normalizeText(form.financeType).toLowerCase() !== 'cash' && (
          <label className={BUYER_QUALIFICATION_LABEL_CLASS}>
            Bond pre-approval status?
            <Field as="select" className={BUYER_QUALIFICATION_FIELD_CLASS} value={form.preApprovalStatus} onChange={(event) => onChange('preApprovalStatus', event.target.value)}>
              {preApprovalOptions.map((option) => (
                <option key={option || 'empty-pre-approval'} value={option}>{option || 'Select status'}</option>
              ))}
            </Field>
          </label>
        )}
        <div>
          <span className={BUYER_QUALIFICATION_LABEL_CLASS}>Do you need to sell a property first?</span>
          <div className="mt-2 flex gap-2">
            {['Yes', 'No'].map((option) => <button key={option} type="button" className={`flex-1 rounded-[12px] border px-3 py-2.5 text-sm font-semibold ${form.propertyToSell === option ? 'border-[#157aaf] bg-[#eaf5fb] text-[#135e89]' : 'border-[#dbe7f2] bg-white text-[#29435d]'}`} onClick={() => onChange('propertyToSell', option)} aria-pressed={form.propertyToSell === option}>{option}</button>)}
          </div>
        </div>
      </div>
      <label className={BUYER_QUALIFICATION_LABEL_CLASS}>
        What type of property do you need?
        <Field className={BUYER_QUALIFICATION_FIELD_CLASS} placeholder="Property type, bedrooms, must-haves" value={form.propertyNeed} onChange={(event) => onChange('propertyNeed', event.target.value)} />
      </label>
      <label className={BUYER_QUALIFICATION_LABEL_CLASS}>
        What did the buyer say on the call?
        <Field as="textarea" className={BUYER_QUALIFICATION_TEXTAREA_CLASS} rows={5} placeholder="Capture affordability, urgency, must-haves, exclusions, and next step..." value={form.additionalNotes} onChange={(event) => onChange('additionalNotes', event.target.value)} />
      </label>
    </fieldset>
  )
}
