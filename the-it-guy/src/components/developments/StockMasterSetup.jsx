import { Building2, Check, Copy, FileImage, House, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getDocumentUploadPolicy, validateDocumentUploadFile } from '../../lib/documentUploadPolicy.js'
import Button from '../ui/Button'
import { STOCK_STEPS, buildStockSummary, buildStockTargets, createStockGroup, createStockUnitType, validateStockStep } from '../../core/developments/developmentStockPlan.js'

const STRUCTURES = [
  { value: 'none', label: 'Units', description: 'Houses, townhouses and duplexes.', icon: House },
  { value: 'buildings', label: 'Buildings + Units', description: 'Units grouped by building and floor.', icon: Building2 },
]

const UPLOAD_POLICY = getDocumentUploadPolicy({ surface: 'development_plan' })

export function LayoutPreview({ file, fileUrl, name, emptyLabel = 'Add a floor plan or image' }) {
  const imageRef = useRef(null)
  useEffect(() => {
    if (!file?.type?.startsWith('image/') || !URL.createObjectURL) return
    const url = URL.createObjectURL(file)
    if (imageRef.current) imageRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  const isImage = file?.type?.startsWith('image/') || (!file && fileUrl)
  return <div className="stock-card-preview">{isImage ? <img ref={imageRef} src={file ? undefined : fileUrl} alt={`Floor plan for ${name}`} /> : <><FileImage size={22} aria-hidden="true" /><span>{file?.name || emptyLabel}</span></>}</div>
}

export default function StockMasterSetup({ plan, onChange, step, onDefer, plannedUnits, editor, onEditorChange: setEditor }) {
  const targets = buildStockTargets(plan)
  const summary = step === 2 ? buildStockSummary(plan) : null
  const groupLabel = 'Building'
  const [editorError, setEditorError] = useState('')
  const editorRef = useRef(null)
  const addRef = useRef(null)
  const layouts = plan.unitTypes.flatMap((type) => type.floorplans.map((layout) => ({ type, layout })))
  const totalUnits = layouts.reduce((total, { layout }) => total + (Number(layout.quantity) || 0), 0)

  function openEditor(type, layout) {
    const nextType = type || createStockUnitType()
    const nextLayout = layout || nextType.floorplans[0]
    setEditor({ typeId: nextType.id, layoutId: nextLayout.id, isNew: !type, bedrooms: type?.bedrooms ?? '', bathrooms: type?.bathrooms ?? '', layout: { ...nextLayout, propertyType: nextLayout.propertyType || type?.name || 'Apartment', allocations: [...(nextLayout.allocations || [])] } })
    setEditorError('')
  }
  function duplicateLayout(type, layout) {
    const copy = createStockUnitType()
    const names = new Set(layouts.map((entry) => entry.layout.name.trim().toLowerCase()))
    let name = `${layout.name} copy`
    let suffix = 2
    while (names.has(name.trim().toLowerCase())) name = `${layout.name} copy ${suffix++}`
    setEditor({ typeId: copy.id, layoutId: copy.floorplans[0].id, isNew: true,
      bedrooms: type.bedrooms ?? '', bathrooms: type.bathrooms ?? '',
      layout: { ...layout, id: copy.floorplans[0].id, name, quantity: '', allocations: [] },
    })
    setEditorError('')
  }
  function closeEditor() {
    setEditor(null)
    setEditorError('')
    requestAnimationFrame(() => addRef.current?.focus())
  }
  function updateDraft(changes) {
    setEditorError('')
    setEditor((previous) => ({ ...previous, layout: { ...previous.layout, ...changes } }))
  }
  function selectFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      validateDocumentUploadFile(file, { surface: 'development_plan' })
      updateDraft({ file, fileUrl: '', recoveryFileName: '' })
    } catch (error) {
      setEditorError(error.message)
      event.target.value = ''
    }
  }
  function saveLayout() {
    try {
      const layout = { ...editor.layout, name: editor.layout.name.trim() }
      if (layout.recoveryFileName) throw new Error('Reattach or remove the missing attachment.')
      if (!layout.propertyType.trim()) throw new Error('Enter a property type.')
      if (editor.bedrooms === '' || editor.bathrooms === '') throw new Error('Enter the bedrooms and bathrooms for this layout.')
      const name = `${layout.propertyType.trim()} ${layout.name}`.trim()
      if (plan.unitTypes.some((type) => type.id !== editor.typeId && type.name.toLowerCase() === name.toLowerCase())) throw new Error('This layout already exists. Use a different layout name.')
      const type = { id: editor.typeId, name, bedrooms: editor.bedrooms, bathrooms: editor.bathrooms, floorplans: [layout] }
      validateStockStep({ ...plan, unitTypes: [type] }, 1)
      const nextTotal = totalUnits - (layouts.find((entry) => entry.layout.id === editor.layoutId)?.layout.quantity || 0) + Number(layout.quantity)
      if (nextTotal > 10000) throw new Error('Set up up to 10,000 units at a time.')
      onChange((previous) => ({ ...previous, unitTypes: editor.isNew ? [...previous.unitTypes, type] : previous.unitTypes.map((entry) => entry.id === editor.typeId ? { ...entry, name, bedrooms: editor.bedrooms, bathrooms: editor.bathrooms, floorplans: entry.floorplans.map((item) => item.id === editor.layoutId ? layout : item) } : entry) }))
      closeEditor()
    } catch (error) {
      setEditorError(error.message)
    }
  }
  function removeLayout(typeId, layoutId) {
    const name = layouts.find((entry) => entry.layout.id === layoutId)?.layout.name || 'Layout'
    onChange((previous) => ({ ...previous, unitTypes: previous.unitTypes.map((type) => type.id === typeId ? { ...type, floorplans: type.floorplans.filter((layout) => layout.id !== layoutId) } : type).filter((type) => type.floorplans.length) }), `${name} removed`)
  }


  function updateGroup(id, changes, undoLabel) {
    onChange((previous) => ({ ...previous, groups: previous.groups.map((group) => group.id === id ? { ...group, ...changes } : group) }), undoLabel)
  }
  function changeStructure(value) {
    onChange((previous) => ({
      ...previous, structureType: value,
      groups: value === 'none' ? [] : previous.groups.length ? previous.groups : [createStockGroup()],
    }), 'Structure changed')
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
    <div className="stock-layout-heading"><span>Unit setup · {step + 1} of {STOCK_STEPS.length}: {STOCK_STEPS[step]}</span><Button type="button" variant="ghost" size="sm" disabled={Boolean(editor)} onClick={onDefer}>Set up units later</Button></div>
    <div className="stock-setup-progress" role="progressbar" aria-label="Unit setup progress" aria-valuemin={0} aria-valuemax={3} aria-valuenow={step + 1}><span style={{ width: `${(step + 1) / 3 * 100}%` }} /></div>

    {step === 0 ? <div className="stock-master-panel">

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
      {plan.structureType === 'none' ? null : <div className="stock-group-list">
        <p className="development-create-hint">Add buildings and optional floors.</p>
        {plan.groups.map((group, index) => <div key={group.id} className="stock-group">
          <div className="stock-group-heading">
            <label>{groupLabel} {index + 1} name<input value={group.name} onChange={(event) => updateGroup(group.id, { name: event.target.value })} /></label>
            <Button type="button" variant="ghost" aria-label={`Remove ${group.name || `${groupLabel} ${index + 1}`}`} onClick={() => onChange((previous) => ({ ...previous, groups: previous.groups.filter((item) => item.id !== group.id) }), `${group.name || groupLabel} removed`)}><Trash2 size={16} /></Button>
          </div>
          {group.floors.length ? <div className="stock-floors">
            {group.floors.map((floor, floorIndex) => <div key={floor.id} className="stock-floor">
              <label>Floor {floorIndex + 1} in {group.name || groupLabel}<input value={floor.name} placeholder="e.g. Ground floor" onChange={(event) => updateGroup(group.id, { floors: group.floors.map((item) => item.id === floor.id ? { ...item, name: event.target.value } : item) })} /></label>
              <Button type="button" variant="ghost" aria-label={`Remove ${floor.name || `floor ${floorIndex + 1}`} from ${group.name}`} onClick={() => updateGroup(group.id, { floors: group.floors.filter((item) => item.id !== floor.id) }, `${floor.name || 'Floor'} removed`)}><Trash2 size={14} /></Button>
            </div>)}
          </div> : <p className="development-create-hint">Floors are optional.</p>}
          <Button type="button" variant="ghost" size="sm" onClick={() => addFloor(group)}><Plus size={14} />Add floor to {group.name || groupLabel}</Button>
        </div>)}
        <Button type="button" variant="secondary" onClick={addGroup}><Plus size={14} />Add {groupLabel.toLowerCase()}</Button>
      </div>}
    </div> : null}

    {step === 1 ? <div className="stock-master-panel">
      {editor ? <section className="stock-layout-editor" aria-labelledby="stock-editor-heading" ref={editorRef} onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.repeat) return
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeEditor() }
        else if (((event.ctrlKey || event.metaKey) && (event.key === 'Enter' || event.key.toLowerCase() === 's')) || (event.key === 'Enter' && event.target.tagName === 'INPUT' && event.target.type !== 'file')) { event.preventDefault(); event.stopPropagation(); saveLayout() }
      }}>
        <div><h5 id="stock-editor-heading">{editor.isNew ? 'Add unit layout' : `Edit ${editor.layout.name}`}</h5><p className="development-create-hint">Describe this layout once, then choose how many units to create.</p></div>
        <div className="development-create-fields">
          <label>Layout name<input autoFocus value={editor.layout.name} placeholder="e.g. A2" onChange={(event) => updateDraft({ name: event.target.value })} /></label>
          <label>Property type<input list="stock-property-types" value={editor.layout.propertyType} onChange={(event) => updateDraft({ propertyType: event.target.value })} /><datalist id="stock-property-types"><option value="Apartment" /><option value="House" /><option value="Townhouse" /><option value="Duplex" /></datalist></label>
          <label>Bedrooms<input type="number" min="0" step="1" value={editor.bedrooms} onChange={(event) => setEditor((previous) => ({ ...previous, bedrooms: event.target.value }))} /></label>
          <label>Bathrooms<input type="number" min="0" step="0.5" value={editor.bathrooms} onChange={(event) => setEditor((previous) => ({ ...previous, bathrooms: event.target.value }))} /></label>
          <label>Size (m²)<input type="number" min="0.01" step="0.01" value={editor.layout.sizeSqm} onChange={(event) => updateDraft({ sizeSqm: event.target.value })} /></label>
          <label>List price (R)<input type="number" min="0.01" step="0.01" value={editor.layout.listPrice} onChange={(event) => updateDraft({ listPrice: event.target.value })} /></label>
          <label>How many units?<input type="number" min="1" step="1" value={editor.layout.quantity} onChange={(event) => updateDraft({ quantity: event.target.value })} /></label>
          <label>Storeys inside each unit<input aria-label="Storeys inside each unit" aria-describedby="stock-storeys-hint" type="number" min="1" step="1" value={editor.layout.storeys ?? '1'} onChange={(event) => updateDraft({ storeys: event.target.value })} /><span id="stock-storeys-hint" className="development-create-hint">1 for single-storey, 2 for a duplex.</span></label>
          <label className="full-width">Floor plan or unit image (optional)<input type="file" aria-label="Floor plan or unit image (optional)" aria-describedby="stock-upload-hint" accept={UPLOAD_POLICY.accept} onChange={selectFile} /><span id="stock-upload-hint" className="development-create-hint">{UPLOAD_POLICY.helpText} Files upload when you save the development.</span></label>
        </div>
        {editor.layout.file || editor.layout.fileUrl || editor.layout.recoveryFileName ? <div className="stock-editor-image"><LayoutPreview file={editor.layout.file} fileUrl={editor.layout.fileUrl} name={editor.layout.name} /><Button type="button" variant="ghost" size="sm" onClick={() => updateDraft({ file: null, fileUrl: '', recoveryFileName: '' })}>Remove attachment</Button></div> : null}
        {plan.structureType !== 'none' ? <section className="stock-allocation" aria-label="Building allocation">
          <div className="stock-layout-heading"><h6>Where are these units?</h6>{targets.length > 1 ? <span className="development-create-hint">{editor.layout.allocations.filter((entry) => targets.some((target) => target.id === entry.targetId)).reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0)} of {editor.layout.quantity || 0} assigned</span> : null}</div>
          {targets.length > 1 ? targets.map((target) => <label className="stock-allocation-row" key={target.id}><span>{target.label}</span><input aria-label={`Units in ${target.label}`} type="number" min="0" step="1" value={editor.layout.allocations.find((entry) => entry.targetId === target.id)?.quantity ?? ''} onChange={(event) => updateDraft({ allocations: [...editor.layout.allocations.filter((entry) => entry.targetId !== target.id), { targetId: target.id, quantity: event.target.value }] })} /></label>) : <p className="development-create-hint">All {editor.layout.quantity || 0} units will go to {targets[0]?.label}.</p>}
        </section> : null}
        {editor.layout.recoveryFileName ? <p className="stock-validation" role="alert">Reattach {editor.layout.recoveryFileName} or remove it.</p> : null}
        {editorError ? <p className="stock-validation" role="alert">{editorError}</p> : null}
        <div className="stock-editor-actions"><Button type="button" variant="secondary" aria-keyshortcuts="Escape" title="Cancel layout (Esc)" onClick={closeEditor}>Cancel layout</Button><Button type="button" aria-keyshortcuts="Control+Enter Meta+Enter Control+s Meta+s" title="Save layout (Ctrl/⌘ + Enter)" onClick={saveLayout}>Save layout</Button></div>
      </section> : <>
        <div className="stock-layout-heading"><h5>What unit layouts are available?</h5><span className="development-create-hint" role="status">{totalUnits}{plannedUnits ? ` of ${plannedUnits} planned` : ''} units</span></div>
        <p className="development-create-hint">Add one layout for each floor plan.</p>
        {layouts.length ? <div className="stock-layout-cards">{layouts.map(({ type, layout }) => {
          const allocated = (layout.allocations || []).filter((entry) => targets.some((target) => target.id === entry.targetId)).reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0)
          return <article key={layout.id} className="stock-layout-card" aria-label={`Layout ${layout.name}`}>
            <LayoutPreview file={layout.file} fileUrl={layout.fileUrl} name={layout.name} />
            <div className="stock-card-content">{layout.recoveryFileName ? <p className="stock-allocation-warning">Reattach {layout.recoveryFileName}</p> : null}<h6>{layout.name} · {layout.propertyType || type.name}</h6><p>{type.bedrooms ?? '—'} bed · {type.bathrooms ?? '—'} bath · {layout.sizeSqm} m²</p><p className="development-create-hint">R {Number(layout.listPrice).toLocaleString('en-ZA')} · {layout.storeys || 1} {Number(layout.storeys || 1) === 1 ? 'storey' : 'storeys'}</p><strong>{layout.quantity} units</strong>
              {targets.length > 1 ? <p className={allocated === Number(layout.quantity) ? 'development-create-hint' : 'stock-allocation-warning'}>{allocated === Number(layout.quantity) ? `${allocated} units assigned to buildings / floors` : `${allocated} of ${layout.quantity} assigned — update locations`}</p> : plan.structureType !== 'none' ? <p className="development-create-hint">{targets[0]?.label}</p> : null}
              <div className="stock-card-actions"><Button type="button" variant="secondary" size="sm" aria-label={`Edit layout ${layout.name}`} onClick={() => openEditor(type, layout)}>Edit</Button><Button type="button" variant="ghost" size="sm" aria-label={`Duplicate layout ${layout.name}`} onClick={() => duplicateLayout(type, layout)}><Copy size={14} aria-hidden="true" />Duplicate</Button><Button type="button" variant="ghost" size="sm" aria-label={`Remove layout ${layout.name}`} onClick={() => removeLayout(type.id, layout.id)}><Trash2 size={14} aria-hidden="true" /></Button></div>
            </div>
          </article>
        })}</div> : <p className="stock-layout-empty">Add your first layout.</p>}
        <div><Button ref={addRef} type="button" variant="secondary" onClick={() => openEditor()}><Plus size={14} />Add unit layout</Button></div>
      </>}
    </div> : null}

    {step === 2 ? <div className="stock-master-panel">
      <div className="stock-layout-heading"><h5>Check your units</h5><strong>{summary.totalUnits} units</strong></div>
      {summary.warnings.length ? <div className="stock-validation" role="status">{summary.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : <>
        <p className="stock-review-intro">{summary.totalUnits} units will be created from {layouts.length} {layouts.length === 1 ? 'layout' : 'layouts'}.</p>
        <ul className="stock-review-list" aria-label="Units to create">{summary.rows.map((row) => <li key={row.key}><div><strong>{row.layout}</strong><span>{row.type}</span>{plan.structureType !== 'none' ? <span>{row.location}</span> : null}<span>{row.storeys} {row.storeys === 1 ? 'storey' : 'storeys'} per unit</span></div><div><strong>{row.quantity} units</strong><span>{row.firstNumber}{row.quantity > 1 ? `–${row.lastNumber}` : ''}</span></div></li>)}</ul>
        <p className="development-create-hint">Automatic unit numbers. Saved with the development.</p>
      </>}
      <details className="stock-numbering"><summary>Change unit numbering</summary><div className="development-create-fields">
        <label>Numbering format<select value={plan.numberingStrategy} onChange={(event) => onChange((previous) => ({ ...previous, numberingStrategy: event.target.value }))}><option value="sequential">Sequential (001, 002)</option>{plan.structureType !== 'none' ? <option value="structure">Building / floor prefix</option> : null}</select></label>
        <label>Digits in each number<select value={plan.numberingPadding} onChange={(event) => onChange((previous) => ({ ...previous, numberingPadding: Number(event.target.value) }))}>{Array.from({ length: 8 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} ({String(1).padStart(index + 1, '0')})</option>)}</select></label>
      </div></details>
    </div> : null}
  </section>
}
