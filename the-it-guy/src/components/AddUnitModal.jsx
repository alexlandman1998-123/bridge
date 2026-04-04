import { useEffect, useState } from 'react'
import Button from './ui/Button'
import Field from './ui/Field'
import Modal from './ui/Modal'
import { createUnit } from '../lib/api'
import { STAGES } from '../lib/stages'

function AddUnitModal({ open, onClose, onCreated, developmentOptions, initialDevelopmentId = '' }) {
  const [form, setForm] = useState({
    developmentId: initialDevelopmentId || '',
    unitNumber: '',
    price: '',
    status: 'Available',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }

    setForm({
      developmentId: initialDevelopmentId || '',
      unitNumber: '',
      price: '',
      status: 'Available',
    })
    setError('')
  }, [open, initialDevelopmentId])

  async function handleSubmit(event) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')
      const created = await createUnit({
        developmentId: form.developmentId,
        unitNumber: form.unitNumber,
        price: form.price,
        status: form.status,
      })
      onCreated?.(created)
      onClose()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Unit"
      subtitle="Create a new unit inside a selected development."
      footer={null}
      className="add-unit-modal"
    >
      {error ? <p className="status-message error">{error}</p> : null}

      <form onSubmit={handleSubmit} className="stack-form grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-600">Development</span>
          <Field
            as="select"
            value={form.developmentId}
            onChange={(event) => setForm((previous) => ({ ...previous, developmentId: event.target.value }))}
          >
            <option value="">Select development</option>
            {developmentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </Field>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-600">Unit Number</span>
          <Field
            type="text"
            value={form.unitNumber}
            onChange={(event) => setForm((previous) => ({ ...previous, unitNumber: event.target.value }))}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-600">Price</span>
          <Field
            type="number"
            min="0"
            step="1000"
            value={form.price}
            onChange={(event) => setForm((previous) => ({ ...previous, price: event.target.value }))}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-600">Initial Status</span>
          <Field as="select" value={form.status} onChange={(event) => setForm((previous) => ({ ...previous, status: event.target.value }))}>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </Field>
        </label>

        <div className="flex items-center justify-end gap-3 border-t border-bridge-border pt-4">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Unit'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default AddUnitModal
