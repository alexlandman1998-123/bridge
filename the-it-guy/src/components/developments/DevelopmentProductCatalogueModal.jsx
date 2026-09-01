import { useMemo, useState } from 'react'
import { BookOpenCheck, Plus, Tags } from 'lucide-react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import Modal from '../ui/Modal'
import { buildCataloguePriceByUnitType, validateDevelopmentProductCatalogue } from '../../core/developments/developmentProductCatalogueModel'

const newId = () => crypto.randomUUID()
const blankType = () => ({ id: newId(), code: '', name: '', bedrooms: '', bathrooms: '', parkingCount: '', internalSizeSqm: '', noTransferDuty: false, isActive: true })
const blankFloorplan = () => ({ id: newId(), unitTypeId: '', code: '', name: '', documentId: '', internalSizeSqm: '', externalSizeSqm: '', isActive: true })

function buildDraft(catalogue = {}) {
  // Catalogue tables are additive and may not exist yet for older/seed
  // developments. A missing catalogue is an empty editable state, not a
  // reason to prevent the surrounding development workspace from rendering.
  const source = catalogue && typeof catalogue === 'object' ? catalogue : {}
  const unitTypes = (source.unitTypes || []).map((item) => ({ ...item }))
  const priceByType = buildCataloguePriceByUnitType(source)
  return {
    unitTypes: unitTypes.length ? unitTypes : [blankType()],
    floorplans: (source.floorplans || []).map((item) => ({ ...item })),
    prices: unitTypes.map((item) => ({ ...(priceByType.get(item.id) || {}), id: priceByType.get(item.id)?.id || newId(), unitTypeId: item.id, listPrice: priceByType.get(item.id)?.listPrice ?? '', priceFrom: priceByType.get(item.id)?.priceFrom ?? '', priceTo: priceByType.get(item.id)?.priceTo ?? '' })),
    priceBook: (source.priceBooks || []).find((item) => item.isDefault) || { name: 'Current sales price list', currencyCode: 'ZAR', status: 'active' },
  }
}

export default function DevelopmentProductCatalogueModal({ open, onClose, onSave, saving = false, catalogue, documents = [] }) {
  const [draft, setDraft] = useState(() => buildDraft(catalogue))
  const errors = useMemo(() => validateDevelopmentProductCatalogue(draft), [draft])
  const updateType = (id, patch) => setDraft((previous) => ({ ...previous, unitTypes: previous.unitTypes.map((item) => item.id === id ? { ...item, ...patch } : item) }))
  const updatePrice = (unitTypeId, patch) => setDraft((previous) => ({ ...previous, prices: previous.prices.map((item) => item.unitTypeId === unitTypeId ? { ...item, ...patch } : item) }))
  const updateFloorplan = (id, patch) => setDraft((previous) => ({ ...previous, floorplans: previous.floorplans.map((item) => item.id === id ? { ...item, ...patch } : item) }))
  const addType = () => setDraft((previous) => { const item = blankType(); return { ...previous, unitTypes: [...previous.unitTypes, item], prices: [...previous.prices, { id: newId(), unitTypeId: item.id, listPrice: '', priceFrom: '', priceTo: '' }] } })

  return <Modal open={open} onClose={onClose} title="Product catalogue" subtitle="Define the sellable product types, their floorplans and the current price book once — then link individual units as needed." size="xl">
    <div className="grid gap-6">
      <section className="rounded-[18px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
        <div className="flex items-center gap-2"><BookOpenCheck size={17} className="text-[#1f7a45]" /><h3 className="font-semibold text-[#142132]">Current sales price list</h3></div>
        <div className="mt-3 grid gap-3 md:grid-cols-3"><Field value={draft.priceBook.name || ''} onChange={(event) => setDraft((previous) => ({ ...previous, priceBook: { ...previous.priceBook, name: event.target.value } }))} placeholder="Price book name" /><Field value={draft.priceBook.currencyCode || 'ZAR'} onChange={(event) => setDraft((previous) => ({ ...previous, priceBook: { ...previous.priceBook, currencyCode: event.target.value.toUpperCase() } }))} placeholder="Currency" /><Field type="date" value={draft.priceBook.effectiveFrom || ''} onChange={(event) => setDraft((previous) => ({ ...previous, priceBook: { ...previous.priceBook, effectiveFrom: event.target.value } }))} /></div>
      </section>

      <section><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-[#142132]">Unit types</h3><p className="text-sm text-[#6b7d93]">These are commercial products, not physical floors or blocks.</p></div><Button type="button" size="sm" variant="secondary" onClick={addType} disabled={saving}><Plus size={14} />Add type</Button></div><div className="grid gap-3">{draft.unitTypes.map((item, index) => <article key={item.id} className="grid gap-3 rounded-[16px] border border-[#dbe5ef] bg-white p-4 md:grid-cols-6"><Field value={item.name} onChange={(event) => updateType(item.id, { name: event.target.value })} placeholder={`Type ${index + 1} name`} /><Field value={item.code} onChange={(event) => updateType(item.id, { code: event.target.value })} placeholder="Code" /><Field type="number" min="0" value={item.bedrooms} onChange={(event) => updateType(item.id, { bedrooms: event.target.value })} placeholder="Beds" /><Field type="number" min="0" value={item.bathrooms} onChange={(event) => updateType(item.id, { bathrooms: event.target.value })} placeholder="Baths" /><Field type="number" min="0" value={item.internalSizeSqm} onChange={(event) => updateType(item.id, { internalSizeSqm: event.target.value })} placeholder="m²" /><Field type="number" min="0" value={draft.prices.find((price) => price.unitTypeId === item.id)?.listPrice ?? ''} onChange={(event) => updatePrice(item.id, { listPrice: event.target.value })} placeholder="List price" /></article>)}</div></section>

      <section><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-[#142132]">Floorplans</h3><p className="text-sm text-[#6b7d93]">Optional canonical plans can reference your existing floorplan documents.</p></div><Button type="button" size="sm" variant="secondary" onClick={() => setDraft((previous) => ({ ...previous, floorplans: [...previous.floorplans, blankFloorplan()] }))} disabled={saving}><Plus size={14} />Add floorplan</Button></div><div className="grid gap-3">{draft.floorplans.map((item, index) => <article key={item.id} className="grid gap-3 rounded-[16px] border border-[#dbe5ef] bg-white p-4 md:grid-cols-4"><Field value={item.name} onChange={(event) => updateFloorplan(item.id, { name: event.target.value })} placeholder={`Floorplan ${index + 1} name`} /><Field as="select" value={item.unitTypeId} onChange={(event) => updateFloorplan(item.id, { unitTypeId: event.target.value })}><option value="">Any unit type</option>{draft.unitTypes.map((unitType) => <option key={unitType.id} value={unitType.id}>{unitType.name || 'Unnamed type'}</option>)}</Field><Field value={item.code} onChange={(event) => updateFloorplan(item.id, { code: event.target.value })} placeholder="Plan code" /><Field as="select" value={item.documentId} onChange={(event) => updateFloorplan(item.id, { documentId: event.target.value })}><option value="">No document linked</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</Field></article>)}</div></section>

      {errors.length ? <div className="rounded-[14px] border border-[#f1dfb8] bg-[#fff8e8] p-3 text-sm text-[#8a641d]">{errors.map((error) => <p key={error}>{error}</p>)}</div> : null}
      <div className="flex justify-end gap-2 border-t border-[#e5edf6] pt-4"><Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="button" disabled={saving || errors.length > 0} onClick={() => onSave(draft)}><Tags size={15} />{saving ? 'Saving…' : 'Save catalogue'}</Button></div>
    </div>
  </Modal>
}
