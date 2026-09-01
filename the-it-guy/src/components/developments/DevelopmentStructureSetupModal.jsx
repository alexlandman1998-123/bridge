import { useMemo, useState } from 'react'
import { Building2, FileUp, Layers3 } from 'lucide-react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import Modal from '../ui/Modal'
import { DEVELOPMENT_STRUCTURE_TEMPLATES, buildDevelopmentStructureImportPreview } from '../../core/developments/developmentStructureModel'

const SAMPLE = 'unitNumber,building,floor,unitType,listPrice\nA-1001,Tower A,10,Type A,1650000\nA-1002,Tower A,10,Type A,1650000'

export default function DevelopmentStructureSetupModal({ open, onClose, onSave, saving = false }) {
  const [templateId, setTemplateId] = useState('tower')
  const [csv, setCsv] = useState(SAMPLE)
  const preview = useMemo(() => buildDevelopmentStructureImportPreview({ templateId, csv }), [csv, templateId])
  const canSave = Boolean(preview.units.length) && !preview.errors.length && !saving

  return <Modal open={open} onClose={onClose} title="Set up development structure" size="xl">
    <div className="grid gap-5"><p className="text-sm leading-6 text-[#607387]">Choose a project shape, paste a simple unit sheet, and review the generated hierarchy before creating anything. Existing units are not changed.</p>
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]"><section className="rounded-[16px] border border-[#dbe5ef] bg-[#fbfcfe] p-4"><label className="grid gap-2 text-sm font-semibold text-[#2d445e]">Project shape<Field as="select" value={templateId} disabled={saving} onChange={(event) => setTemplateId(event.target.value)}>{DEVELOPMENT_STRUCTURE_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</Field></label><p className="mt-4 text-xs leading-5 text-[#6b7d93]">Columns supported: unitNumber, building, block, precinct, zone, floor, level, wing, unitType, listPrice.</p></section><section className="rounded-[16px] border border-[#dbe5ef] bg-white p-4"><label className="grid gap-2 text-sm font-semibold text-[#2d445e]">Unit sheet (CSV)<Field as="textarea" rows={7} value={csv} disabled={saving} onChange={(event) => setCsv(event.target.value)} /></label></section></div>
      <section className="rounded-[16px] border border-[#dbe5ef] bg-white p-4"><div className="flex items-center gap-2"><Layers3 size={16} className="text-[#356a62]"/><h3 className="font-semibold text-[#142132]">Preview</h3><span className="text-sm text-[#607387]">{preview.nodes.length} structure nodes · {preview.units.length} units</span></div>{preview.errors.length ? <ul className="mt-3 grid gap-2 rounded-[12px] border border-[#f1dfb8] bg-[#fff8e8] p-3 text-sm text-[#8a641d]">{preview.errors.map((error) => <li key={error}>{error}</li>)}</ul> : <div className="mt-3 grid gap-2 md:grid-cols-2">{preview.nodes.slice(0, 8).map((node) => <div key={node.id} className="rounded-[10px] border border-[#e4ebf3] bg-[#fbfcfe] px-3 py-2 text-sm"><Building2 size={13} className="mr-1 inline text-[#54748e]"/>{node.nodeType}: <strong>{node.label}</strong></div>)}</div>}</section>
      <div className="flex justify-end gap-2 border-t border-[#e5edf6] pt-4"><Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button type="button" disabled={!canSave} onClick={() => onSave(preview)}><FileUp size={15}/>{saving ? 'Creating…' : 'Create structure and units'}</Button></div>
    </div>
  </Modal>
}
