import Button from '../../../../components/ui/Button'
import { OnboardingSectionHeader } from '../../../../components/onboarding/OnboardingVisualStep.jsx'
import { RENTAL_APPLICATION_FIELD_GROUPS } from '../../../../services/rentals/rentalApplicationFieldContract.js'
import { rentalApplicationPersonFields, rentalApplicationVisibleFields } from '../../../../services/rentals/rentalApplicationWizardModel.js'

const display = (field, value) => {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (field.type === 'number') return Number(value).toLocaleString('en-ZA')
  if (['type', 'role', 'identityType', 'employmentType', 'incomeBasis', 'incomeFrequency', 'contractType', 'housingSituation', 'rentPayer', 'depositPayer', 'preferredContactMethod', 'primaryContactRole'].includes(field.key)) return String(value).replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
  return String(value)
}

export default function RentalApplicationAnswerSummary({ data, steps, readOnly, busy, onEdit }) {
  return <div className="mt-5 space-y-4">{steps.filter(step => step.groups.length).map(step => (
    <article key={step.key} className="rounded-[20px] border border-[#e2eaf3] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.05)] md:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#edf2f7] pb-4">
        <OnboardingSectionHeader title={step.title} />
        {!readOnly ? <Button type="button" variant="ghost" disabled={busy} onClick={() => onEdit(step.key)}>Edit {step.title}</Button> : null}
      </header>
      {step.groups.map(key => {
        const group = RENTAL_APPLICATION_FIELD_GROUPS.find(item => item.key === key)
        const records = group.collection ? data[key] || [] : [data[key] || {}]
        return records.map((record, index) => {
          const fields = (key === 'people' ? rentalApplicationPersonFields(group, record) : rentalApplicationVisibleFields(group, data)).filter(field => !field.key.endsWith('Id') && record[field.key] != null && record[field.key] !== '')
          if (!fields.length) return null
          return <dl key={`${key}-${record.id || index}`} className="mb-4 divide-y divide-[#edf2f7] last:mb-0">{fields.map(field => (
            <div key={field.key} className="grid gap-1 py-3 first:pt-0 last:pb-0 md:grid-cols-[180px_1fr] md:gap-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[#71869d]">{field.label}</dt>
              <dd className="break-words text-sm font-semibold leading-6 text-[#142132]">{display(field, record[field.key])}</dd>
            </div>
          ))}</dl>
        })
      })}
    </article>
  ))}</div>
}
