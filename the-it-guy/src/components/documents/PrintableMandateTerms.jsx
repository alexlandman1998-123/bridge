import Field from '../ui/Field.jsx'
import { isMandateCalendarDate, MANDATE_VAT_OPTIONS, readSellerMandateTerms } from '../../lib/sellerMandateCapture.js'

export default function PrintableMandateTerms({ value, initialValue, onChange, disabled = false }) {
  const terms = readSellerMandateTerms(value)
  const initial = readSellerMandateTerms(initialValue)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const change = (key, next) => onChange({ ...terms, [key]: next })
  const fields = [
    !isMandateCalendarDate(initial.startDate) && ['startDate', 'Mandate start date', 'date'],
    terms.mandateDuration === 'fixed' && ['endDate', 'Mandate end date', 'date'],
    !/^\d+$/.test(String(initial.protectionPeriod)) && ['protectionPeriod', 'Protection period (calendar days; enter 0 for none)', 'number'],
    !['percentage', 'fixed'].includes(initial.commissionBasis) && ['commissionBasis', 'Commission basis', [['', 'Choose'], ['percentage', 'Percentage'], ['fixed', 'Fixed Rand amount']]],
    terms.commissionBasis === 'percentage' && !(Number(initial.commissionPercentage) > 0) && ['commissionPercentage', 'Commission percentage', 'number'],
    terms.commissionBasis === 'fixed' && !(Number(initial.commissionAmount) > 0) && ['commissionAmount', 'Fixed commission (Rand)', 'number'],
    !MANDATE_VAT_OPTIONS.some(([key]) => key === initial.vatHandling && key) && ['vatHandling', 'Commission VAT treatment', MANDATE_VAT_OPTIONS],
    terms.mandateType === 'dual' && !initial.otherAgencyName && ['otherAgencyName', 'Second agency name', 'text'],
  ].filter(Boolean)
  return <section className="space-y-4 rounded-xl border border-[#dce6f2] bg-white p-4">
    <p className="text-sm font-semibold text-[#243d56]">Saved mandate terms</p>
    <dl className="grid gap-2 text-sm text-[#47637d] sm:grid-cols-2">
      <div><dt className="font-semibold">Period</dt><dd>{terms.startDate || 'Start date needed'} → {terms.mandateDuration === 'until_cancelled' ? 'Until cancelled' : terms.endDate || 'End date needed'}</dd></div>
      <div><dt className="font-semibold">Commission</dt><dd>{terms.commissionBasis === 'fixed' ? `R ${terms.commissionAmount || 'Amount needed'}` : `${terms.commissionPercentage || 'Percentage needed'}%`} · {terms.vatHandling || 'VAT treatment needed'}</dd></div>
      <div><dt className="font-semibold">Protection period</dt><dd>{terms.protectionPeriod === '' ? 'Not captured' : `${terms.protectionPeriod} days`}</dd></div>
    </dl>
    {terms.mandateDuration === 'fixed' && isMandateCalendarDate(terms.endDate) && terms.endDate <= today ? <p role="alert" className="text-sm text-[#8a641d]">The saved mandate end date is today or earlier. Confirm the agreed future end date before advertising this property. No date is changed automatically.</p> : null}
    {fields.length ? <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-3 text-sm font-semibold text-[#243d56]">Confirm the end date and complete missing terms</legend>
      {fields.map(([key, label, type]) => <label key={key} className="grid gap-1.5 text-sm font-semibold text-[#243d56]">
        {label}
        <Field as={Array.isArray(type) ? 'select' : undefined} type={Array.isArray(type) ? undefined : type} min={type === 'number' ? 0 : undefined} step={key === 'protectionPeriod' ? '1' : type === 'number' ? '0.01' : undefined} value={terms[key] || ''} onChange={event => change(key, event.target.value)}>
          {Array.isArray(type) ? type.map(([key, label]) => <option key={key} value={key}>{label}</option>) : null}
        </Field>
      </label>)}
    </fieldset> : <p className="text-sm text-[#176842]">The saved terms are complete. Review them before preparing the copy.</p>}
  </section>
}
