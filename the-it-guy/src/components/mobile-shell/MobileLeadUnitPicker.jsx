import { useEffect, useState } from 'react'

export default function MobileLeadUnitPicker({ developmentId, preferredUnitId = '', pending = false, refreshRequired = false, onSave, onClose }) {
  const [result, setResult] = useState(null)
  const [retry, setRetry] = useState(0)
  const [selectedId, setSelectedId] = useState(preferredUnitId)
  useEffect(() => {
    let active = true
    import('../../lib/api.js').then(({ fetchUnitsForTransactionSetup }) => fetchUnitsForTransactionSetup(developmentId))
      .then((units) => { if (active) setResult({ units }) })
      .catch(() => { if (active) setResult({ error: true }) })
    return () => { active = false }
  }, [developmentId, retry])

  async function handleSubmit(event) {
    event.preventDefault()
    if (pending || refreshRequired || !result?.units?.some((unit) => unit.id === selectedId) || selectedId === preferredUnitId) return
    if (await onSave(selectedId)) onClose()
  }

  return <form className="mobile-lead-unit-picker" onSubmit={handleSubmit} aria-label="Select preferred unit">
    <label htmlFor="mobile-lead-preferred-unit">Preferred unit</label>
    {result?.error ? <><p role="alert">We couldn’t load units for this development.</p><button type="button" onClick={() => { setResult(null); setRetry((value) => value + 1) }}>Retry units</button></> : <>
      <select id="mobile-lead-preferred-unit" value={selectedId} disabled={!result || pending} onChange={(event) => setSelectedId(event.target.value)}>
        <option value="">{!result ? 'Loading units…' : 'Select a unit'}</option>
        {result?.units?.map((unit) => <option key={unit.id} value={unit.id}>{unit.unit_number || unit.unitNumber || unit.name || unit.title || 'Unit'}</option>)}
      </select>
      {result?.units?.length === 0 && <p>No units are available in this development.</p>}
      <button type="submit" disabled={pending || refreshRequired || !result?.units?.some((unit) => unit.id === selectedId) || selectedId === preferredUnitId}>{pending ? 'Saving…' : 'Save Unit'}</button>
    </>}
    <button type="button" disabled={pending} onClick={onClose}>Cancel</button>
  </form>
}
