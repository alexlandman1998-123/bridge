import { useState } from 'react'

// The API and saved form always use square metres; units only affect entry.
export default function ListingLandSizeInput({ value = '', onChange }) {
  const [unit, setUnit] = useState('m2')
  const factor = unit === 'ha' ? 10000 : 1
  const display = value === '' || value == null ? '' : Number((Number(value) / factor).toFixed(8))
  return <div className="grid gap-2">
    <label className="form-field"><span>Land size ({unit === 'ha' ? 'ha' : 'm²'})</span>
      <input name="erfSize" type="number" min="0" step="any" value={display} onChange={event => onChange(event.target.value === '' ? '' : String(Number((Number(event.target.value) * factor).toFixed(4))))} />
    </label>
    <label className="form-field"><span>Land size unit</span><select value={unit} onChange={event => setUnit(event.target.value)}><option value="m2">Square metres (m²)</option><option value="ha">Hectares (ha)</option></select></label>
    <p className="text-xs text-[#607387]">1 hectare = 10,000 m². Saved sizes are converted automatically.</p>
  </div>
}
