import { useState } from 'react'
import { saveOrganisationCommissionStructure } from '../../lib/settingsApi'
import Button from '../ui/Button'
import Field from '../ui/Field'

// No nested form: this editor is safe inside any invite form.
export default function InlineCommissionStructure({ onCreated, onSavingChange, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [listing, setListing] = useState('5')
  const [split, setSplit] = useState('60')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    const agent = Number(split), rate = Number(listing)
    if (!name.trim() || split === '' || listing === '' || !Number.isFinite(agent) || agent < 0 || agent > 100 || !Number.isFinite(rate) || rate <= 0 || rate > 100) {
      setError('Enter a name, a listing commission above 0% and up to 100%, and an agent split from 0% to 100%.')
      return
    }
    setSaving(true)
    onSavingChange?.(true)
    setError('')
    try {
      const structure = await saveOrganisationCommissionStructure({ name: name.trim(), listingCommissionType: 'percentage', listingCommissionPercentage: rate, agentSplitPercentage: agent, agencySplitPercentage: 100 - agent, isActive: true, isDefault: false })
      if (!structure?.id) throw new Error('The commission structure was not saved. Please try again.')
      onCreated(structure)
      setOpen(false)
      setName('')
    } catch (saveError) {
      setError(saveError.message || 'Unable to save commission structure. Your agent details have been kept.')
    } finally { setSaving(false); onSavingChange?.(false) }
  }
  if (!open) return <Button type="button" variant="ghost" disabled={disabled} onClick={() => setOpen(true)}>Create commission structure here</Button>
  return <section className="mt-3 grid gap-3 rounded-xl border p-3" aria-label="New commission structure">
    <p className="text-sm">Save a structure without leaving Add Agent. It will be selected for this invitation; the organisation default will not change.</p>
    <label>Structure name<Field value={name} disabled={saving} onChange={(event) => setName(event.target.value)} /></label>
    <label>Listing commission (%)<Field type="number" min="0.01" max="100" step="0.01" value={listing} disabled={saving} onChange={(event) => setListing(event.target.value)} /></label>
    <label>Agent share (%)<Field type="number" min="0" max="100" step="0.01" value={split} disabled={saving} onChange={(event) => setSplit(event.target.value)} /></label>
    <p className="text-sm">Agency share: {split !== '' && Number.isFinite(Number(split)) ? 100 - Number(split) : '—'}%</p>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <div className="flex gap-2"><Button type="button" disabled={disabled || saving} onClick={save}>{saving ? 'Saving structure…' : 'Save and select structure'}</Button><Button type="button" variant="ghost" disabled={saving} onClick={() => setOpen(false)}>Cancel structure</Button></div>
  </section>
}
