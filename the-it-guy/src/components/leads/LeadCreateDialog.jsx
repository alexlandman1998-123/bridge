import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import AgentAssignmentSelect from '../AgentAssignmentSelect'
import Button from '../ui/Button'
import Field from '../ui/Field'
import Modal from '../ui/Modal'

const LEAD_CREATE_SOURCE_OPTIONS = Object.freeze([
  'Property24',
  'Private Property',
  'Website',
  'Referral',
  'Show Day',
  'Walk-In',
  'WhatsApp',
  'Facebook',
  'Google',
  'Signboard',
  'Listing Call',
  'Cold Call',
  'Door Knock',
  'Manual Entry',
  'Other',
])

function createLeadCreateDraft(overrides = {}) {
  return {
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    category: 'buyer',
    source: 'Other',
    property: '',
    notes: '',
    agentId: '',
    ...overrides,
  }
}

function LeadCreateDialogContent({
  category = 'buyer',
  agents = [],
  currentAgent = {},
  saving = false,
  error = '',
  feedback = {},
  draft = null,
  sourceField = 'source',
  propertyLabel = '',
  lockProperty = false,
  showAgentAssignment = true,
  onChange,
  onClose,
  onSave,
}) {
  const [localDraft, setLocalDraft] = useState(() => createLeadCreateDraft({
    category,
    agentId: currentAgent.id || currentAgent.userId || '',
    property: propertyLabel,
  }))
  const controlled = Boolean(draft && typeof onChange === 'function')
  const form = controlled ? draft : localDraft

  const setField = (key, value) => {
    if (controlled) onChange(key, value)
    else setLocalDraft((previous) => ({ ...previous, [key]: value }))
  }
  const message = feedback?.message || error
  const isError = Boolean(error) || feedback?.kind === 'error'
  const buyer = category !== 'seller'
  const propertyValue = lockProperty ? propertyLabel : form.property || ''

  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      title={`Add ${buyer ? 'Buyer' : 'Seller'} Lead`}
      subtitle={lockProperty && propertyLabel
        ? `Capture the contact details now. This lead will be linked to ${propertyLabel}.`
        : 'Capture the contact details now and complete the full workspace afterwards.'}
      className="max-w-4xl"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="canonical-lead-create-form" disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {saving ? 'Creating' : 'Create Lead'}
          </Button>
        </div>
      )}
    >
      <form
        id="canonical-lead-create-form"
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          onSave?.({ ...form, category, property: propertyValue })
        }}
      >
        {message ? (
          <p role={isError ? 'alert' : 'status'} className={`rounded-[12px] border px-3 py-2 text-sm ${isError ? 'border-[#f2cccc] bg-[#fff5f4] text-[#9f3028]' : 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]'}`}>
            {message}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]">
            First name
            <Field required autoFocus value={form.firstName || ''} onChange={(event) => setField('firstName', event.target.value)} />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]">
            Last name
            <Field required value={form.lastName || ''} onChange={(event) => setField('lastName', event.target.value)} />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]">
            Mobile
            <Field required type="tel" inputMode="tel" value={form.phone || ''} onChange={(event) => setField('phone', event.target.value)} />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]">
            Email
            <Field required type="email" value={form.email || ''} onChange={(event) => setField('email', event.target.value)} />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]">
            Lead source
            <Field as="select" required value={form[sourceField] || 'Other'} onChange={(event) => setField(sourceField, event.target.value)}>
              {LEAD_CREATE_SOURCE_OPTIONS.map((source) => <option key={source} value={source}>{source}</option>)}
            </Field>
          </label>
          {showAgentAssignment ? (
            <div className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]">
              <span>Assigned to</span>
              <AgentAssignmentSelect
                compact
                value={form.agentId || currentAgent.id || currentAgent.userId || ''}
                agents={agents}
                onChange={(agent) => setField('agentId', agent?.userId || agent?.id || agent?.email || '')}
              />
            </div>
          ) : null}
        </div>

        <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]">
          {buyer && !lockProperty ? 'Property or area of interest' : 'Property address'}
          <Field
            value={propertyValue}
            readOnly={lockProperty}
            className={lockProperty ? 'bg-[#f5f8fb] text-[#526b82]' : ''}
            onChange={(event) => setField('property', event.target.value)}
          />
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-semibold text-[#29435d]">
          <span className="flex items-center justify-between gap-3"><span>Notes</span><span className="text-xs font-normal text-[#8295a9]">Optional</span></span>
          <Field as="textarea" rows={3} value={form.notes || ''} onChange={(event) => setField('notes', event.target.value)} />
        </label>
      </form>
    </Modal>
  )
}

export default function LeadCreateDialog(props) {
  if (!props.open) return null
  return <LeadCreateDialogContent {...props} />
}
