import { useState } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'

export default function DevelopmentLeadReservationDialog({ leads, units, initialLeadId = '', initialUnitId = '', saving, error, onClose, onReserve, onCreateLead }) {
  const [leadId, setLeadId] = useState(initialLeadId)
  const [unitId, setUnitId] = useState(() => units.some(unit => unit.id === initialUnitId && !unit.currentTransactionId && String(unit.status || '').toLowerCase() === 'available') ? initialUnitId : '')
  return <Modal open title="Reserve a unit" subtitle="Choose the buyer and the unit to hold for them." onClose={saving ? undefined : onClose} className="max-w-[560px]">
    <form className="grid gap-4" onSubmit={event => { event.preventDefault(); if (leadId && unitId && !saving) onReserve({ developerLeadId: leadId, unitId }) }}>
      <label className="grid gap-2 text-sm font-semibold">Buyer lead
        <select value={leadId} onChange={event => setLeadId(event.target.value)} disabled={saving} required className="h-11 rounded-xl border border-slate-200 bg-white px-3">
          <option value="">Select a buyer lead</option>
          {leads.filter(lead => !lead.convertedTransactionId && lead.leadStatus !== 'lost').map(lead => <option key={lead.developerLeadId} value={lead.developerLeadId}>{lead.buyerFullName || lead.publicReference || lead.protectedSummary || 'Buyer lead'}</option>)}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold">Unit
        <select value={unitId} onChange={event => setUnitId(event.target.value)} disabled={saving} required className="h-11 rounded-xl border border-slate-200 bg-white px-3">
          <option value="">Select a unit</option>
          {units.filter(unit => !unit.currentTransactionId && String(unit.status || '').toLowerCase() === 'available').map(unit => <option key={unit.id} value={unit.id}>{unit.unitNumber || unit.unit_number}</option>)}
        </select>
      </label>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap justify-between gap-3">
        <Button type="button" variant="secondary" disabled={saving} onClick={onCreateLead}>Create buyer lead</Button>
        <div className="flex gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || !leadId || !unitId}>{saving ? 'Reserving…' : 'Confirm reservation'}</Button></div>
      </div>
    </form>
  </Modal>
}
