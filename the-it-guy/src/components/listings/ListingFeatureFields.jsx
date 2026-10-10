import { useId } from 'react'
import { LISTING_FEATURE_CATALOG, LISTING_FEATURE_GROUPS } from '../../services/listings/listingFeatureCatalog'

export default function ListingFeatureFields({ facts = {}, onChange, compact = false, listingType = 'sale', presentation = 'rows' }) {
  const fieldId = useId()
  const cards = presentation === 'cards'
  const groups = cards ? [...LISTING_FEATURE_GROUPS.filter((group) => group !== 'Other'), 'Pet friendly', 'Other'] : LISTING_FEATURE_GROUPS
  return <div className={cards ? 'sales-feature-groups' : 'grid gap-3'}>
    {!cards ? <p className="text-xs text-[#607387]">Choose Yes, No or Unknown for each fact. Only confirmed Yes features become selling points; portal-native mapping is reviewed separately.</p> : null}
    {groups.map((group, index) => {
      const features = LISTING_FEATURE_CATALOG.filter((feature) => (group === 'Pet friendly' ? feature.key === 'pet_friendly' : feature.group === group && (!cards || feature.key !== 'pet_friendly')) && (
        feature.listingTypes.includes(String(listingType).toLowerCase()) || facts[feature.key] !== undefined && facts[feature.key] !== null
      ))
      if (!features.length) return null
      const known = features.filter((feature) => facts[feature.key] !== undefined && facts[feature.key] !== null).length
      return <details key={group} open={!cards && index === 0} className="rounded-xl border border-[#dbe6f2] bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-[#243d56]">{group} <span className="ml-2 text-xs font-normal text-[#607387]">{known}/{features.length} answered</span></summary>
        <div className={`mt-3 grid gap-3 ${cards || compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
          {features.map((feature) => <div key={feature.key} className={`grid ${cards ? 'gap-2' : 'gap-1'} text-xs font-semibold text-[#2d445e]`}>
            <span id={`${fieldId}-${feature.key}`}>{feature.label}</span>
            {cards && feature.type === 'boolean' ? <div className="sales-feature-answers" role="group" aria-labelledby={`${fieldId}-${feature.key}`}>
              {[{ label: 'Yes', value: 'yes', active: facts[feature.key] === true }, { label: 'No', value: 'no', active: facts[feature.key] === false }, { label: 'Unknown', value: null, active: facts[feature.key] == null }].map((answer) => <button key={answer.label} type="button" aria-pressed={answer.active} onClick={() => onChange(feature.key, answer.value)}>{answer.label}</button>)}
            </div> : feature.type === 'boolean' ? <select
              aria-labelledby={`${fieldId}-${feature.key}`}
              value={facts[feature.key] === true ? 'yes' : facts[feature.key] === false ? 'no' : ''}
              onChange={(event) => onChange(feature.key, event.target.value || null)}
              className="min-h-9 rounded-lg border border-[#dbe6f2] bg-white px-2 text-sm text-[#243d56]"
            ><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select> : feature.type === 'count' ? <input
              aria-labelledby={`${fieldId}-${feature.key}`}
              type="number" min="0" step="1" inputMode="numeric"
              value={facts[feature.key] ?? ''}
              onChange={(event) => onChange(feature.key, event.target.value)}
              placeholder="Unknown"
              className="min-h-9 rounded-lg border border-[#dbe6f2] bg-white px-2 text-sm text-[#243d56]"
            /> : <select
              aria-labelledby={`${fieldId}-${feature.key}`}
              value={facts[feature.key] ?? ''}
              onChange={(event) => onChange(feature.key, event.target.value || null)}
              className="min-h-9 rounded-lg border border-[#dbe6f2] bg-white px-2 text-sm text-[#243d56]"
            ><option value="">Unknown</option>{feature.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>}
          </div>)}
        </div>
      </details>
    })}
  </div>
}
