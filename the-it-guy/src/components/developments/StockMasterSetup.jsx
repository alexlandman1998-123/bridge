import { Building2, Check, House, Plus, Trash2 } from 'lucide-react'
import Button from '../ui/Button'
import { STOCK_STEPS, buildStockSummary, buildStockTargets, createStockFloorplan, createStockGroup, createStockUnitType } from '../../core/developments/developmentStockPlan.js'

const STRUCTURES = [
  { value: 'none', label: 'Units', description: 'Houses, townhouses and duplexes. Each unit can have one or multiple storeys.', icon: House },
  { value: 'buildings', label: 'Buildings + Units', description: 'One or multiple buildings, with optional floors containing units.', icon: Building2 },
]

export default function StockMasterSetup({ plan, onChange, step, onDefer }) {
  const targets = buildStockTargets(plan)
  const summary = step === 2 ? buildStockSummary(plan) : null
  const groupLabel = 'Building'

  function updateGroup(id, changes) {
    onChange((previous) => ({ ...previous, groups: previous.groups.map((group) => group.id === id ? { ...group, ...changes } : group) }))
  }
  function updateType(id, changes) {
    onChange((previous) => ({ ...previous, unitTypes: previous.unitTypes.map((type) => type.id === id ? { ...type, ...changes } : type) }))
  }
  function updateLayout(typeId, layoutId, changes) {
    onChange((previous) => ({ ...previous, unitTypes: previous.unitTypes.map((type) => type.id === typeId ? { ...type, floorplans: type.floorplans.map((layout) => layout.id === layoutId ? { ...layout, ...changes } : layout) } : type) }))
  }
  function changeStructure(value) {
    onChange((previous) => ({
      ...previous, structureType: value,
      groups: value === 'none' ? [] : previous.groups.length ? previous.groups : [createStockGroup()],
    }))
  }
  function addFloor(group) {
    let index = 0
    let name = 'Ground floor'
    while (group.floors.some((floor) => floor.name.trim().toLowerCase() === name.toLowerCase())) {
      index += 1
      name = `Floor ${index}`
    }
    updateGroup(group.id, { floors: [...group.floors, { id: crypto.randomUUID(), name }] })
  }
  function addGroup() {
    let index = 0
    let name = `${groupLabel} A`
    while (plan.groups.some((group) => group.name.trim().toLowerCase() === name.toLowerCase())) {
      index += 1
      name = `${groupLabel} ${index < 26 ? String.fromCharCode(65 + index) : index + 1}`
    }
    const group = createStockGroup(name)
    onChange((previous) => ({ ...previous, groups: [...previous.groups, group] }))
  }

  return <section className="development-create-section stock-master">
    <div className="stock-layout-heading"><h4>Unit setup</h4><Button type="button" variant="ghost" size="sm" onClick={onDefer}>Set up units later</Button></div>
    <ol className="stock-master-progress" aria-label="Unit setup progress">
      {STOCK_STEPS.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={step === index ? 'is-current' : step > index ? 'is-complete' : ''}>
        <span>{step > index ? <Check size={14} aria-hidden="true" /> : index + 1}</span><strong>{label}</strong>
      </li>)}
    </ol>

    {step === 0 ? <div className="stock-master-panel">
      <h5>Physical structure</h5>
      <fieldset className="development-type-picker">
        <legend>How are the units organised?</legend>
        <div className="development-type-options stock-structure-options">
          {STRUCTURES.map((option) => <label key={option.value} className={`development-type-option${(plan.structureType === 'blocks' ? 'buildings' : plan.structureType) === option.value ? ' is-selected' : ''}`}>
            <input type="radio" aria-label={option.label} aria-describedby={`stock-structure-${option.value}-description`} name="stockStructure" value={option.value} checked={(plan.structureType === 'blocks' ? 'buildings' : plan.structureType) === option.value} onChange={() => changeStructure(option.value)} />
            <span className="development-type-icon"><option.icon size={22} aria-hidden="true" /></span><span>{option.label}</span>
            <span id={`stock-structure-${option.value}-description`} className="development-create-hint stock-structure-description">{option.description}</span>
            {(plan.structureType === 'blocks' ? 'buildings' : plan.structureType) === option.value ? <Check className="development-type-check" size={16} aria-hidden="true" /> : null}
          </label>)}
        </div>
      </fieldset>
      {plan.structureType === 'none' ? <p className="development-create-hint">Units sit directly under the development. Set the number of storeys inside each unit in its layout on the next screen.</p> : <div className="stock-group-list">
        <p className="development-create-hint">Add each building, then its floors if needed. For example: Building A → Floor 3 → Apartment 301. Internal unit storeys are set separately in each layout.</p>
        {plan.groups.map((group, index) => <div key={group.id} className="stock-group">
          <div className="stock-group-heading">
            <label>{groupLabel} {index + 1} name<input value={group.name} onChange={(event) => updateGroup(group.id, { name: event.target.value })} /></label>
            <Button type="button" variant="ghost" aria-label={`Remove ${group.name || `${groupLabel} ${index + 1}`}`} onClick={() => onChange((previous) => ({ ...previous, groups: previous.groups.filter((item) => item.id !== group.id) }))}><Trash2 size={16} /></Button>
          </div>
          {group.floors.length ? <div className="stock-floors">
            {group.floors.map((floor, floorIndex) => <div key={floor.id} className="stock-floor">
              <label>Floor {floorIndex + 1} in {group.name || groupLabel}<input value={floor.name} placeholder="e.g. Ground floor" onChange={(event) => updateGroup(group.id, { floors: group.floors.map((item) => item.id === floor.id ? { ...item, name: event.target.value } : item) })} /></label>
              <Button type="button" variant="ghost" aria-label={`Remove ${floor.name || `floor ${floorIndex + 1}`} from ${group.name}`} onClick={() => updateGroup(group.id, { floors: group.floors.filter((item) => item.id !== floor.id) })}><Trash2 size={14} /></Button>
            </div>)}
          </div> : <p className="development-create-hint">Units can belong directly to this {groupLabel.toLowerCase()}. Add floors if needed.</p>}
          <Button type="button" variant="ghost" size="sm" onClick={() => addFloor(group)}><Plus size={14} />Add floor to {group.name || groupLabel}</Button>
        </div>)}
        <Button type="button" variant="secondary" onClick={addGroup}><Plus size={14} />Add {groupLabel.toLowerCase()}</Button>
      </div>}
    </div> : null}

    {step === 1 ? <div className="stock-master-panel">
      <h5>Unit templates & allocation</h5>
      <p className="development-create-hint">Define each layout once, then assign its units to their physical location.</p>
      {plan.unitTypes.map((type, typeIndex) => <article key={type.id} className="stock-unit-type">
        <div className="stock-group-heading">
          <label>Unit type {typeIndex + 1}<input value={type.name} placeholder="e.g. 2 bedroom apartment" onChange={(event) => updateType(type.id, { name: event.target.value })} /></label>
          {plan.unitTypes.length > 1 ? <Button type="button" variant="ghost" aria-label={`Remove unit type ${typeIndex + 1}`} onClick={() => onChange((previous) => ({ ...previous, unitTypes: previous.unitTypes.filter((item) => item.id !== type.id) }))}><Trash2 size={16} /></Button> : null}
        </div>
        {type.floorplans.map((layout, layoutIndex) => {
          const prefix = `${type.name || `Unit type ${typeIndex + 1}`} / ${layout.name || `Layout ${layoutIndex + 1}`}`
          const assigned = (layout.allocations || []).filter((entry) => targets.some((target) => target.id === entry.targetId)).reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0)
          return <div key={layout.id} className="stock-layout">
            <div className="stock-layout-heading"><h6>Layout {layoutIndex + 1}</h6>{type.floorplans.length > 1 ? <Button type="button" variant="ghost" size="sm" aria-label={`Remove layout ${layoutIndex + 1} from unit type ${typeIndex + 1}`} onClick={() => updateType(type.id, { floorplans: type.floorplans.filter((item) => item.id !== layout.id) })}><Trash2 size={14} /></Button> : null}</div>
            <div className="development-create-fields">
              <label>Layout name<input aria-label={`Layout name for ${prefix}`} value={layout.name} placeholder="e.g. A1" onChange={(event) => updateLayout(type.id, layout.id, { name: event.target.value })} /></label>
              <label>Size (m²)<input aria-label={`Size for ${prefix}`} type="number" min="0.01" step="0.01" value={layout.sizeSqm} onChange={(event) => updateLayout(type.id, layout.id, { sizeSqm: event.target.value })} /></label>
              <label>Number of storeys<input aria-label={`Number of storeys for ${prefix}`} aria-describedby={`stock-storeys-${layout.id}-hint`} type="number" min="1" step="1" value={layout.storeys ?? '1'} onChange={(event) => updateLayout(type.id, layout.id, { storeys: event.target.value })} /><span id={`stock-storeys-${layout.id}-hint`} className="development-create-hint">Levels inside one unit: 1 for single-storey, 2 for a duplex.</span></label>
              <label>List price (R)<input aria-label={`List price for ${prefix}`} type="number" min="0.01" step="0.01" value={layout.listPrice} onChange={(event) => updateLayout(type.id, layout.id, { listPrice: event.target.value })} /></label>
              <label>Total units<input aria-label={`Total units for ${prefix}`} type="number" min="1" step="1" value={layout.quantity} onChange={(event) => updateLayout(type.id, layout.id, { quantity: event.target.value })} /></label>
            </div>
            {targets.length > 1 ? <div className="stock-allocation">
              <div className="stock-layout-heading"><strong>Allocate units</strong><span className={assigned === Number(layout.quantity) && assigned > 0 ? 'stock-count-complete' : 'development-create-hint'}>{assigned} / {layout.quantity || 0} assigned</span></div>
              {targets.map((target) => <label className="stock-allocation-row" key={target.id}><span>{target.label}</span><input aria-label={`Units in ${target.label} for ${prefix}`} type="number" min="0" step="1" value={(layout.allocations || []).find((entry) => entry.targetId === target.id)?.quantity ?? ''} onChange={(event) => {
                const allocations = (layout.allocations || []).filter((entry) => entry.targetId !== target.id)
                updateLayout(type.id, layout.id, { allocations: [...allocations, { targetId: target.id, quantity: event.target.value }] })
              }} /></label>)}
            </div> : <p className="development-create-hint stock-allocation">All {layout.quantity || 0} units go to {targets[0]?.label || 'the development'}.</p>}
          </div>
        })}
        <Button type="button" variant="ghost" size="sm" onClick={() => updateType(type.id, { floorplans: [...type.floorplans, createStockFloorplan()] })}><Plus size={14} />Add layout to {type.name || `unit type ${typeIndex + 1}`}</Button>
      </article>)}
      <Button type="button" variant="secondary" onClick={() => onChange((previous) => ({ ...previous, unitTypes: [...previous.unitTypes, createStockUnitType()] }))}><Plus size={14} />Add unit type</Button>
    </div> : null}

    {step === 2 ? <div className="stock-master-panel">
      <div className="stock-layout-heading"><h5>Review units</h5><strong>{summary.totalUnits} units</strong></div>
      <div className="development-create-fields">
        <label>Unit numbering<select value={plan.numberingStrategy} onChange={(event) => onChange((previous) => ({ ...previous, numberingStrategy: event.target.value }))}><option value="sequential">Sequential (001, 002)</option>{plan.structureType !== 'none' ? <option value="structure">Building / floor prefix</option> : null}</select></label>
        <label>Number padding<input type="number" min="1" max="8" value={plan.numberingPadding} onChange={(event) => onChange((previous) => ({ ...previous, numberingPadding: event.target.value }))} /></label>
      </div>
      {summary.warnings.length ? <div className="stock-validation" role="status">{summary.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : <>
        <div className="stock-review-table-wrap"><table className="stock-review-table"><caption>Stock allocation and unit numbers</caption><thead><tr><th>Location</th><th>Unit type / layout</th><th>Storeys per unit</th><th>Units</th><th>Unit numbers</th></tr></thead><tbody>{summary.rows.map((row) => <tr key={row.key}><td data-label="Location">{row.location}</td><td data-label="Unit type / layout">{row.type}<span>{row.layout}</span></td><td data-label="Storeys per unit">{row.storeys}</td><td data-label="Units">{row.quantity}</td><td data-label="Unit numbers">{row.firstNumber}{row.quantity > 1 ? ` → ${row.lastNumber}` : ''}</td></tr>)}</tbody></table></div>
        <p className="development-create-hint">Use these units to continue to Sales setup. Units are saved when you create the development or save a draft.</p>
      </>}
    </div> : null}
  </section>
}
