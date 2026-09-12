import { PARTY_TYPES, MARITAL_REGIMES, scenarioIssues, resolveMatterScenarioProfile } from '../../services/matterScenarioProfile.js'

export default function MatterScenarioProfileEditor({ value = resolveMatterScenarioProfile(), onChange }) {
  const update = (id, patch) => onChange({ ...value, parties: value.parties.map(p => p.id === id ? { ...p, ...patch, source: 'matter_profile' } : p) })
  const fieldClass = 'rounded border border-borderSoft bg-white p-2 text-sm w-full'
  const select = (label, current, options, change) => <label className="grid gap-1 text-sm">{label}<select className={fieldClass} value={current} onChange={e => change(e.target.value)}>{options.map(v => <option key={v} value={v}>{v.replaceAll('_', ' ')}</option>)}</select></label>
  return <section className="grid gap-3" aria-label="Party scenario facts">
    <h3 className="font-semibold">Buyer and seller capacity</h3>
    <p className="text-sm text-textMuted">Confirm each party separately. Unknown facts remain flagged for review.</p>
    {value.parties.map(p => <fieldset key={p.id} className="grid gap-3 rounded border border-borderSoft p-3">
      <legend>{p.role === 'buyer' ? 'Buyer' : 'Seller'} · {p.name || p.id}</legend>
      <label>Name<input className={fieldClass} value={p.name} onChange={e => update(p.id, { name: e.target.value })} /></label>
      {select('Legal type', p.entityType, PARTY_TYPES, entityType => update(p.id, { entityType }))}
      {p.entityType === 'individual' && select('Marital capacity', p.maritalRegime, MARITAL_REGIMES, maritalRegime => update(p.id, { maritalRegime }))}
      <label>Ownership share (%)<input className={fieldClass} type="number" min="0" max="100" step="any" value={p.ownershipShare ?? ''} onChange={e => update(p.id, { ownershipShare: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      {p.representatives.map(r => <div key={r.id} className="grid gap-2">
        <label>Representative name<input className={fieldClass} value={r.name} onChange={e => update(p.id, { representatives: p.representatives.map(x => x.id === r.id ? { ...x, name: e.target.value } : x) })} /></label>
        <label>Authority / capacity<input className={fieldClass} value={r.capacity} onChange={e => update(p.id, { representatives: p.representatives.map(x => x.id === r.id ? { ...x, capacity: e.target.value } : x) })} /></label>
        <button type="button" onClick={() => update(p.id, { representatives: p.representatives.filter(x => x.id !== r.id) })}>Remove representative</button>
      </div>)}
      <button type="button" onClick={() => update(p.id, { representatives: [...p.representatives, { id: crypto.randomUUID(), name: '', capacity: '' }] })}>Add representative</button>
      <button type="button" onClick={() => onChange({ ...value, parties: value.parties.filter(x => x.id !== p.id) })}>Remove scenario party</button>
    </fieldset>)}
    <div className="flex gap-4">{['buyer', 'seller'].map(role => <button key={role} type="button" onClick={() => onChange({ ...value, parties: [...value.parties, { id: crypto.randomUUID(), role, name: '', entityType: 'unknown', maritalRegime: 'unknown', ownershipShare: null, representatives: [], source: 'matter_profile' }] })}>Add {role}</button>)}</div>
    <label>Exceptional circumstances (one per line)<textarea className={fieldClass} value={value.exceptions.join('\n')} onChange={e => onChange({ ...value, exceptions: e.target.value.split('\n') })} /></label>
    {scenarioIssues(value).length > 0 && <details><summary>Facts needing review ({scenarioIssues(value).length})</summary><ul>{scenarioIssues(value).map((issue,i) => <li key={i}>{issue}</li>)}</ul></details>}
  </section>
}
