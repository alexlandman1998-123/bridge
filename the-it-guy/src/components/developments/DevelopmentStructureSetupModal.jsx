import { useMemo, useState } from 'react'
import { Building2, Check, ClipboardPaste, Layers3, ListPlus } from 'lucide-react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import Modal from '../ui/Modal'
import { DEVELOPMENT_STRUCTURE_TEMPLATES, buildDevelopmentStructureImportPreview } from '../../core/developments/developmentStructureModel'

const PRIMARY_TEMPLATES = new Set(['estate', 'apartment_blocks', 'mixed_use'])
const STEPS = [{ id: 'shape', label: 'Development type' }, { id: 'stock', label: 'Create stock' }, { id: 'review', label: 'Review' }]
const SAMPLE = 'unitNumber,building,floor,unitType,bedrooms,bathrooms,sizeSqm,listPrice\nA-1001,Tower A,10,Type A,2,2,84,1650000\nA-1002,Tower A,10,Type A,2,2,84,1650000'
const EMPTY_RANGE = { prefix: '', start: '1', end: '10', padding: '3', phase: '', precinct: '', building: '', block: '', floor: '', unitType: '', bedrooms: '', bathrooms: '', sizeSqm: '', listPrice: '' }

function buildRangeCsv(range) {
  const start = Number(range.start)
  const end = Number(range.end)
  const padding = Math.max(0, Math.min(8, Number(range.padding) || 0))
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || end - start > 499) return 'unitNumber'
  const headers = ['unitNumber', 'phase', 'precinct', 'building', 'block', 'floor', 'unitType', 'bedrooms', 'bathrooms', 'sizeSqm', 'listPrice']
  const rows = Array.from({ length: end - start + 1 }, (_, offset) => {
    const number = String(start + offset).padStart(padding, '0')
    return [`${range.prefix || ''}${number}`, range.phase, range.precinct, range.building, range.block, range.floor, range.unitType, range.bedrooms, range.bathrooms, range.sizeSqm, range.listPrice]
  })
  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
}

export default function DevelopmentStructureSetupModal({ open, onClose, onSave, saving = false }) {
  const [step, setStep] = useState('shape')
  const [templateId, setTemplateId] = useState('estate')
  const [stockSource, setStockSource] = useState('range')
  const [range, setRange] = useState(EMPTY_RANGE)
  const [csv, setCsv] = useState(SAMPLE)
  const importCsv = stockSource === 'range' ? buildRangeCsv(range) : csv
  const preview = useMemo(() => buildDevelopmentStructureImportPreview({ templateId, csv: importCsv }), [importCsv, templateId])
  const currentStepIndex = STEPS.findIndex((item) => item.id === step)
  const selectedTemplate = DEVELOPMENT_STRUCTURE_TEMPLATES.find((template) => template.id === templateId)
  const rangeError = stockSource === 'range' && (!Number.isInteger(Number(range.start)) || !Number.isInteger(Number(range.end)) || Number(range.end) < Number(range.start) || Number(range.end) - Number(range.start) > 499)
  const canContinue = step === 'shape' || (!rangeError && Boolean(preview.units.length) && !preview.errors.length)
  const groupFields = (selectedTemplate?.hierarchy || []).filter((field) => ['precinct', 'building', 'block', 'floor'].includes(field))

  function resetAndClose() {
    setStep('shape')
    setStockSource('range')
    setRange(EMPTY_RANGE)
    onClose()
  }

  function next() {
    if (canContinue) setStep(STEPS[Math.min(STEPS.length - 1, currentStepIndex + 1)].id)
  }

  return <Modal open={open} onClose={resetAndClose} title="Set up development structure" size="xl">
    <div className="grid gap-5">
      <div className="grid grid-cols-3 gap-2" aria-label="Structure setup progress">
        {STEPS.map((item, index) => <div key={item.id} className={`rounded-lg px-3 py-2 text-xs font-semibold ${index <= currentStepIndex ? 'bg-[#eaf7ef] text-[#167044]' : 'bg-[#f4f7fa] text-[#8292a4]'}`}><span className="mr-1.5">{index < currentStepIndex ? <Check size={13} className="inline" /> : index + 1}</span>{item.label}</div>)}
      </div>

      {step === 'shape' ? <section>
        <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">How is this development organised?</h3>
        <p className="mt-1 text-sm leading-6 text-[#607387]">Choose the simplest shape that reflects the stock you sell. Phases remain optional values on individual units for release planning.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {DEVELOPMENT_STRUCTURE_TEMPLATES.filter((template) => PRIMARY_TEMPLATES.has(template.id)).map((template) => <button key={template.id} type="button" onClick={() => setTemplateId(template.id)} className={`rounded-[16px] border p-4 text-left transition ${templateId === template.id ? 'border-[#2e8b67] bg-[#f2fbf6] ring-1 ring-[#2e8b67]' : 'border-[#dbe5ef] bg-white hover:border-[#98b8aa]'}`}><Building2 size={18} className="text-[#356a62]" /><strong className="mt-3 block text-sm text-[#142132]">{template.label}</strong><span className="mt-1 block text-xs leading-5 text-[#6b7d93]">{template.description}</span><span className="mt-3 block text-xs font-semibold text-[#356a62]">{template.hierarchy?.length ? `Development → ${template.hierarchy.map((field) => field[0].toUpperCase() + field.slice(1)).join(' → ')} → Unit` : 'Development → Unit'}</span></button>)}
        </div>
      </section> : null}

      {step === 'stock' ? <section className="grid gap-4">
        <div><h3 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Create the initial stock master</h3><p className="mt-1 text-sm leading-6 text-[#607387]">Generate a numbered range for a quick start, or paste an existing sheet. Nothing is created until you approve the review.</p></div>
        <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={stockSource === 'range' ? 'primary' : 'secondary'} onClick={() => setStockSource('range')}><ListPlus size={14} /> Numbered range</Button><Button type="button" size="sm" variant={stockSource === 'csv' ? 'primary' : 'secondary'} onClick={() => setStockSource('csv')}><ClipboardPaste size={14} /> Paste CSV</Button></div>
        {stockSource === 'range' ? <div className="grid gap-3 rounded-[16px] border border-[#dbe5ef] bg-[#fbfcfe] p-4 md:grid-cols-4"><label className="grid gap-1.5 text-xs font-semibold text-[#2d445e]">Prefix<Field value={range.prefix} placeholder="e.g. A-" disabled={saving} onChange={(event) => setRange((previous) => ({ ...previous, prefix: event.target.value }))} /></label><label className="grid gap-1.5 text-xs font-semibold text-[#2d445e]">First unit<Field type="number" min="0" value={range.start} disabled={saving} onChange={(event) => setRange((previous) => ({ ...previous, start: event.target.value }))} /></label><label className="grid gap-1.5 text-xs font-semibold text-[#2d445e]">Last unit<Field type="number" min="0" value={range.end} disabled={saving} onChange={(event) => setRange((previous) => ({ ...previous, end: event.target.value }))} /></label><label className="grid gap-1.5 text-xs font-semibold text-[#2d445e]">Number padding<Field type="number" min="0" max="8" value={range.padding} disabled={saving} onChange={(event) => setRange((previous) => ({ ...previous, padding: event.target.value }))} /></label>
          {groupFields.map((field) => <label key={field} className="grid gap-1.5 text-xs font-semibold capitalize text-[#2d445e]">{field}<Field value={range[field]} placeholder={field === 'floor' ? 'e.g. Ground' : `e.g. ${field === 'building' ? 'Building A' : field === 'block' ? 'Block A' : 'Precinct 1'}`} disabled={saving} onChange={(event) => setRange((previous) => ({ ...previous, [field]: event.target.value }))} /></label>)}
          <label className="grid gap-1.5 text-xs font-semibold text-[#2d445e]">Phase <span className="font-normal text-[#7c8da1]">(optional)</span><Field value={range.phase} placeholder="e.g. Phase 1" disabled={saving} onChange={(event) => setRange((previous) => ({ ...previous, phase: event.target.value }))} /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#2d445e]">Unit type <span className="font-normal text-[#7c8da1]">(optional)</span><Field value={range.unitType} placeholder="e.g. 2 bed" disabled={saving} onChange={(event) => setRange((previous) => ({ ...previous, unitType: event.target.value }))} /></label>
          <p className="md:col-span-4 text-xs leading-5 text-[#6b7d93]">This will create {rangeError ? 'a valid range of up to 500 units' : `${preview.units.length} unit${preview.units.length === 1 ? '' : 's'}`} {preview.units.length ? `(${preview.units.slice(0, 3).map((unit) => unit.unitNumber).join(', ')}${preview.units.length > 3 ? '…' : ''})` : ''}.</p>
        </div> : <section className="rounded-[16px] border border-[#dbe5ef] bg-white p-4"><label className="grid gap-2 text-sm font-semibold text-[#2d445e]">Unit sheet (CSV)<Field as="textarea" rows={9} value={csv} disabled={saving} onChange={(event) => setCsv(event.target.value)} /></label><p className="mt-3 text-xs leading-5 text-[#6b7d93]">Supported columns: unitNumber, phase, precinct, building, block, floor, unitType, bedrooms, bathrooms, sizeSqm, listPrice.</p></section>}
        {rangeError || preview.errors.length ? <div className="rounded-[12px] border border-[#f1dfb8] bg-[#fff8e8] p-3 text-sm text-[#8a641d]">{rangeError ? 'Use a valid start and end number, with no more than 500 units at once.' : preview.errors[0]}</div> : null}
      </section> : null}

      {step === 'review' ? <section className="grid gap-4"><div><h3 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Review before creating</h3><p className="mt-1 text-sm leading-6 text-[#607387]">This adds new stock and structure only. Existing units are not changed or overwritten.</p></div><div className="grid gap-3 md:grid-cols-3"><div className="rounded-[14px] border border-[#dbe5ef] bg-[#fbfcfe] p-4"><span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da1]">Development type</span><strong className="mt-2 block text-sm text-[#142132]">{selectedTemplate?.label}</strong></div><div className="rounded-[14px] border border-[#dbe5ef] bg-[#fbfcfe] p-4"><span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da1]">Stock to create</span><strong className="mt-2 block text-sm text-[#142132]">{preview.units.length} units</strong></div><div className="rounded-[14px] border border-[#dbe5ef] bg-[#fbfcfe] p-4"><span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da1]">Structure</span><strong className="mt-2 block text-sm text-[#142132]">{preview.nodes.length ? `${preview.nodes.length} hierarchy nodes` : 'Direct unit list'}</strong></div></div><div className="rounded-[16px] border border-[#dbe5ef] bg-white p-4"><div className="flex items-center gap-2"><Layers3 size={16} className="text-[#356a62]" /><h4 className="font-semibold text-[#142132]">Structure preview</h4></div>{preview.nodes.length ? <div className="mt-3 grid gap-2 md:grid-cols-2">{preview.nodes.slice(0, 10).map((node) => <div key={node.id} className="rounded-[10px] border border-[#e4ebf3] bg-[#fbfcfe] px-3 py-2 text-sm"><Building2 size={13} className="mr-1 inline text-[#54748e]" />{node.nodeType}: <strong>{node.label}</strong></div>)}</div> : <p className="mt-3 text-sm text-[#607387]">Units will sit directly under this development.</p>}<p className="mt-4 text-xs text-[#6b7d93]">First units: {preview.units.slice(0, 8).map((unit) => unit.unitNumber).join(', ')}{preview.units.length > 8 ? '…' : ''}</p></div></section> : null}

      <div className="flex justify-between gap-2 border-t border-[#e5edf6] pt-4"><div>{currentStepIndex > 0 ? <Button type="button" variant="secondary" disabled={saving} onClick={() => setStep(STEPS[currentStepIndex - 1].id)}>Back</Button> : null}</div><div className="flex gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={resetAndClose}>Cancel</Button>{step === 'review' ? <Button type="button" disabled={!canContinue || saving} onClick={() => onSave(preview)}>{saving ? 'Creating…' : 'Create structure and stock'}</Button> : <Button type="button" disabled={!canContinue || saving} onClick={next}>Continue</Button>}</div></div>
    </div>
  </Modal>
}
