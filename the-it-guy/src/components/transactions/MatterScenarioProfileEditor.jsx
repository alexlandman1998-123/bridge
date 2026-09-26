import { PARTY_TYPES, MARITAL_REGIMES, IDENTITY_ROUTES, TAX_RESIDENCES, PARTY_CAPACITY_STATUSES, partyCapacityCheckRequirements, scenarioIssues, resolveMatterScenarioProfile } from '../../services/matterScenarioProfile.js'
import { SPECIALIST_ROUTE_LABELS, SPECIALIST_ROUTE_STATUSES, SPECIALIST_INSTRUMENTS, requiredSpecialistRouteKeys } from '../../services/attorneyWorkflow/specialistRoutePolicy.js'

export default function MatterScenarioProfileEditor({ value = resolveMatterScenarioProfile(), propertyTenure = '', onChange }) {
  const update = (id, patch) => onChange({ ...value, parties: value.parties.map(p => p.id === id ? {
    ...p, ...patch, source: 'matter_profile',
    capacityReview: patch.capacityReview || { ...p.capacityReview, status: 'pending', confirmations: {}, reviewedBy: '', reviewedAt: '', reviewedFacts: null },
  } : p) })
  const fieldClass = 'rounded border border-borderSoft bg-white p-2 text-sm w-full'
  const select = (label, current, options, change) => <label className="grid gap-1 text-sm">{label}<select className={fieldClass} value={current} onChange={e => change(e.target.value)}>{options.map(v => <option key={v} value={v}>{v.replaceAll('_', ' ')}</option>)}</select></label>
  const automaticRoutes = requiredSpecialistRouteKeys({ ...value, specialistRoutes: {} }, propertyTenure)
  const updateRoute = (key, patch) => onChange({ ...value, specialistRoutes: {
    ...value.specialistRoutes,
    [key]: { active: true, status: 'pending', owner: 'Transfer attorney', reason: `${SPECIALIST_ROUTE_LABELS[key]} needs classification.`, instrument: 'unknown', evidenceReference: '', ...value.specialistRoutes?.[key], ...patch },
  } })
  return <section className="grid gap-3" aria-label="Party scenario facts">
    <h3 className="font-semibold">Buyer and seller capacity</h3>
    <p className="text-sm text-textMuted">Confirm each party separately. Unknown facts remain flagged for review.</p>
    {value.parties.map(p => <fieldset key={p.id} className="grid gap-3 rounded border border-borderSoft p-3">
      <legend>{p.role === 'buyer' ? 'Buyer' : 'Seller'} · {p.name || p.id}</legend>
      <label>Name<input className={fieldClass} value={p.name} onChange={e => update(p.id, { name: e.target.value })} /></label>
      {select('Legal type', p.entityType, PARTY_TYPES, entityType => update(p.id, { entityType }))}
      {p.entityType === 'individual' && select('Marital capacity', p.maritalRegime, MARITAL_REGIMES, maritalRegime => update(p.id, { maritalRegime }))}
      {p.entityType === 'individual' && select('Identity route', p.identityRoute || 'unknown', IDENTITY_ROUTES, identityRoute => update(p.id, { identityRoute }))}
      {select('Tax residence', p.taxResidence || 'unknown', TAX_RESIDENCES, taxResidence => update(p.id, { taxResidence }))}
      <label>Ownership share (%)<input className={fieldClass} type="number" min="0" max="100" step="any" value={p.ownershipShare ?? ''} onChange={e => update(p.id, { ownershipShare: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      {p.representatives.map(r => <div key={r.id} className="grid gap-2">
        <label>Representative name<input className={fieldClass} value={r.name} onChange={e => update(p.id, { representatives: p.representatives.map(x => x.id === r.id ? { ...x, name: e.target.value } : x) })} /></label>
        <label>Authority / capacity<input className={fieldClass} value={r.capacity} onChange={e => update(p.id, { representatives: p.representatives.map(x => x.id === r.id ? { ...x, capacity: e.target.value } : x) })} /></label>
        <button type="button" onClick={() => update(p.id, { representatives: p.representatives.filter(x => x.id !== r.id) })}>Remove representative</button>
      </div>)}
      <button type="button" onClick={() => update(p.id, { representatives: [...p.representatives, { id: crypto.randomUUID(), name: '', capacity: '' }] })}>Add representative</button>
      {partyCapacityCheckRequirements(p).map(check => <label key={check.key} className="flex gap-2 text-sm">
        <input type="checkbox" checked={p.capacityReview?.confirmations?.[check.key] === true} onChange={e => update(p.id, { capacityReview: { ...p.capacityReview, confirmations: { ...p.capacityReview?.confirmations, [check.key]: e.target.checked } } })} />
        {check.label}
      </label>)}
      {select('Attorney capacity decision', p.capacityReview?.status || 'pending', PARTY_CAPACITY_STATUSES.filter(status => !(['unknown', 'estate', 'insolvency', 'other'].includes(p.entityType) || (p.entityType === 'individual' && p.maritalRegime === 'other')) || status !== 'cleared'), status => update(p.id, { capacityReview: { ...p.capacityReview, status } }))}
      <label>Capacity / hold basis<textarea className={fieldClass} value={p.capacityReview?.note || ''} onChange={e => update(p.id, { capacityReview: { ...p.capacityReview, note: e.target.value } })} /></label>
      {p.capacityReview?.status === 'cleared' && <p className="text-sm text-textMuted">Reviewed {p.capacityReview.reviewedAt || 'when saved'} for the recorded party facts. Changing those facts requires a new decision.</p>}
      <button type="button" onClick={() => onChange({ ...value, parties: value.parties.filter(x => x.id !== p.id) })}>Remove scenario party</button>
    </fieldset>)}
    <div className="flex gap-4">{['buyer', 'seller'].map(role => <button key={role} type="button" onClick={() => onChange({ ...value, parties: [...value.parties, { id: crypto.randomUUID(), role, name: '', entityType: 'unknown', maritalRegime: 'unknown', ownershipShare: null, representatives: [], source: 'matter_profile' }] })}>Add {role}</button>)}</div>
    <label>Exceptional circumstances (one per line)<textarea className={fieldClass} value={value.exceptions.join('\n')} onChange={e => onChange({ ...value, exceptions: e.target.value.split('\n') })} /></label>
    <fieldset className="grid gap-3 rounded border border-borderSoft p-3">
      <legend className="font-semibold">Specialist route classification</legend>
      <p className="text-sm text-textMuted">Select every applicable route. A specialist decision must name its owner, reason, instrument and evidence. Other instruments stay outside ordinary deeds lodgement.</p>
      {Object.entries(SPECIALIST_ROUTE_LABELS).map(([key, label]) => {
        const route = value.specialistRoutes?.[key] || {}
        const active = automaticRoutes.includes(key) || route.active === true
        return <div key={key} className="grid gap-2 rounded border border-borderSoft p-2">
          <label className="flex gap-2"><input type="checkbox" checked={active} disabled={automaticRoutes.includes(key)} onChange={e => updateRoute(key, { active: e.target.checked, status: 'pending' })} />{label}{automaticRoutes.includes(key) ? ' (required by matter facts)' : ''}</label>
          {active && <>
            {select('Attorney classification', route.status || 'pending', SPECIALIST_ROUTE_STATUSES, status => updateRoute(key, { status }))}
            <label>Specialist owner<input className={fieldClass} value={route.owner || 'Transfer attorney'} onChange={e => updateRoute(key, { owner: e.target.value })} /></label>
            <label>Reason and required route<textarea className={fieldClass} value={route.reason || `${label} needs classification.`} onChange={e => updateRoute(key, { reason: e.target.value })} /></label>
            {select('Transfer instrument', route.instrument || 'unknown', SPECIALIST_INSTRUMENTS, instrument => updateRoute(key, { instrument }))}
            <label>Specialist opinion / authority reference<input className={fieldClass} value={route.evidenceReference || ''} onChange={e => updateRoute(key, { evidenceReference: e.target.value })} /></label>
            {route.reviewedAt && <p className="text-sm text-textMuted">Reviewed {route.reviewedAt}. Any changed facts reopen classification.</p>}
          </>}
        </div>
      })}
    </fieldset>
    {scenarioIssues(value).length > 0 && <details><summary>Facts needing review ({scenarioIssues(value).length})</summary><ul>{scenarioIssues(value).map((issue,i) => <li key={i}>{issue}</li>)}</ul></details>}
  </section>
}
