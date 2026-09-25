import { LISTING_FEATURE_CATALOG, LISTING_FEATURE_GROUPS } from '../../services/listings/listingFeatureCatalog'

export default function ListingFeatureFields({ facts = {}, onChange, compact = false, listingType = 'sale' }) {
  return <div className="grid gap-3">
    <p className="text-xs text-[#607387]">Choose Yes, No or Unknown for each fact. Only confirmed Yes features become selling points; portal-native mapping is reviewed separately.</p>
    {LISTING_FEATURE_GROUPS.map((group, index) => {
      const features = LISTING_FEATURE_CATALOG.filter((feature) => feature.group === group && (
        feature.listingTypes.includes(String(listingType).toLowerCase()) || facts[feature.key] !== undefined && facts[feature.key] !== null
      ))
      if (!features.length) return null
      const known = features.filter((feature) => facts[feature.key] !== undefined && facts[feature.key] !== null).length
      return <details key={group} defaultOpen={index === 0} className="rounded-xl border border-[#dbe6f2] bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-[#243d56]">{group} <span className="ml-2 text-xs font-normal text-[#607387]">{known}/{features.length} answered</span></summary>
        <div className={`mt-3 grid gap-3 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
          {features.map((feature) => <label key={feature.key} className="grid gap-1 text-xs font-semibold text-[#2d445e]">
            <span>{feature.label}</span>
            {feature.type === 'boolean' ? <select
              value={facts[feature.key] === true ? 'yes' : facts[feature.key] === false ? 'no' : ''}
              onChange={(event) => onChange(feature.key, event.target.value || null)}
              className="min-h-9 rounded-lg border border-[#dbe6f2] bg-white px-2 text-sm text-[#243d56]"
            ><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select> : feature.type === 'count' ? <input
              type="number" min="0" step="1" inputMode="numeric"
              value={facts[feature.key] ?? ''}
              onChange={(event) => onChange(feature.key, event.target.value)}
              placeholder="Unknown"
              className="min-h-9 rounded-lg border border-[#dbe6f2] bg-white px-2 text-sm text-[#243d56]"
            /> : <select
              value={facts[feature.key] ?? ''}
              onChange={(event) => onChange(feature.key, event.target.value || null)}
              className="min-h-9 rounded-lg border border-[#dbe6f2] bg-white px-2 text-sm text-[#243d56]"
            ><option value="">Unknown</option>{feature.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>}
          </label>)}
        </div>
      </details>
    })}
  </div>
}
