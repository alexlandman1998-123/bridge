import { useState } from 'react'
import { CalendarClock, Mail, Phone, Save, ShieldCheck, X } from 'lucide-react'
import {
  formatIntakeKind,
  formatLeadDate,
  formatLeadList,
  getLeadName,
  LEAD_PRIORITY_OPTIONS,
  LEAD_STAGE_OPTIONS,
} from '../../../lib/adminIntakeLeadPresentation'

const FIELD_CLASS = 'mt-1.5 min-h-10 w-full rounded-[11px] border border-[#dce5eb] bg-white px-3 text-sm font-medium text-[#2d4353] outline-none transition focus:border-[#5ba98c] focus:ring-2 focus:ring-[#dff3eb] disabled:cursor-not-allowed disabled:bg-[#f4f6f8]'
const MUTABLE_STAGE_OPTIONS = LEAD_STAGE_OPTIONS.filter((option) => !['all', 'closed'].includes(option.value))
const MUTABLE_PRIORITY_OPTIONS = LEAD_PRIORITY_OPTIONS.filter((option) => option.value !== 'all')

function toLocalDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function createDraft(lead = {}) {
  return {
    salesStage: lead.sales_stage || 'new',
    priority: lead.priority || 'normal',
    assignedToUserId: lead.assigned_to_user_id || '',
    nextAction: lead.next_action || '',
    nextActionAt: toLocalDateTime(lead.next_action_at),
    lostReason: lead.lost_reason || '',
    internalNotes: lead.internal_notes || '',
  }
}

function DetailItem({ label, children }) {
  return (
    <div className="border-b border-[#edf1f4] py-3 last:border-0">
      <dt className="text-[0.68rem] font-medium uppercase tracking-[0.075em] text-[#82909d]">{label}</dt>
      <dd className="mt-1 text-sm font-medium leading-5 text-[#283e4e]">{children || 'Not provided'}</dd>
    </div>
  )
}

export function LeadDetailPanel({ lead, assignees = [], saving, retryingNotification, onSave, onRetryNotification, onClose }) {
  const [draft, setDraft] = useState(() => createDraft(lead))
  const [validationError, setValidationError] = useState('')

  if (!lead) return null

  function updateDraft(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
    setValidationError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (draft.salesStage === 'lost' && !draft.lostReason.trim()) {
      setValidationError('Add a lost reason before saving this stage.')
      return
    }
    await onSave({
      ...draft,
      assignedToUserId: draft.assignedToUserId || null,
      nextAction: draft.nextAction.trim() || null,
      nextActionAt: draft.nextActionAt ? new Date(draft.nextActionAt).toISOString() : null,
      lostReason: draft.salesStage === 'lost' ? draft.lostReason.trim() : null,
      internalNotes: draft.internalNotes.trim() || null,
    })
  }

  return (
    <aside className="rounded-[20px] border border-[#dfe7ee] bg-white p-5 shadow-[0_20px_48px_rgba(23,42,58,0.055)]" aria-label="Selected lead details">
      <div className="flex items-start justify-between gap-4 border-b border-[#e9eef3] pb-4">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-medium uppercase tracking-[0.08em] text-[#758696]">Lead workflow</p>
          <h2 className="mt-1 truncate text-xl font-semibold tracking-[-0.035em] text-[#172a39]">{getLeadName(lead)}</h2>
          <p className="mt-1 truncate text-sm font-medium text-[#687b8c]">{lead.company || 'Company not supplied'}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close lead details" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#dfe6ec] text-[#657887] hover:bg-[#f6f8fa] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#17805f]">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        <a href={`mailto:${lead.email}`} className="inline-flex min-h-10 items-center gap-2 rounded-[11px] border border-[#dce5eb] px-3 text-sm font-semibold text-[#2d5261] hover:bg-[#f5faf8]"><Mail className="h-4 w-4" aria-hidden="true" />{lead.email || 'No email'}</a>
        <a href={lead.phone ? `tel:${lead.phone}` : undefined} className="inline-flex min-h-10 items-center gap-2 rounded-[11px] border border-[#dce5eb] px-3 text-sm font-semibold text-[#2d5261] hover:bg-[#f5faf8]"><Phone className="h-4 w-4" aria-hidden="true" />{lead.phone || 'No phone'}</a>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-[12px] border border-[#e2e8ed] bg-[#f8fafb] px-3 py-2.5">
        <div>
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-[#7b8b98]">Admin notification</p>
          <p className="mt-0.5 text-sm font-semibold capitalize text-[#344b5c]">{lead.notification_status || 'pending'}</p>
        </div>
        {lead.notification_status !== 'sent' ? (
          <button type="button" disabled={retryingNotification} onClick={onRetryNotification} className="min-h-9 rounded-[10px] border border-[#d4e2dc] bg-white px-3 text-xs font-semibold text-[#176149] hover:bg-[#f1faf6] disabled:opacity-50">
            {retryingNotification ? 'Retrying…' : 'Retry delivery'}
          </button>
        ) : null}
      </div>

      <form className="mt-5 rounded-[15px] border border-[#e4eaef] bg-[#fafcfc] p-4" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label className="text-xs font-semibold text-[#5f7383]">Sales stage
            <select value={draft.salesStage} onChange={(event) => updateDraft('salesStage', event.target.value)} disabled={saving} className={FIELD_CLASS}>{MUTABLE_STAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          </label>
          <label className="text-xs font-semibold text-[#5f7383]">Priority
            <select value={draft.priority} onChange={(event) => updateDraft('priority', event.target.value)} disabled={saving} className={FIELD_CLASS}>{MUTABLE_PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          </label>
          <label className="text-xs font-semibold text-[#5f7383]">Owner
            <select value={draft.assignedToUserId} onChange={(event) => updateDraft('assignedToUserId', event.target.value)} disabled={saving} className={FIELD_CLASS}><option value="">Unassigned</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}{assignee.role ? ` · ${assignee.role}` : ''}</option>)}</select>
          </label>
          <label className="text-xs font-semibold text-[#5f7383]">Next action date
            <input type="datetime-local" value={draft.nextActionAt} onChange={(event) => updateDraft('nextActionAt', event.target.value)} disabled={saving} className={FIELD_CLASS} />
          </label>
        </div>
        <label className="mt-3 block text-xs font-semibold text-[#5f7383]">Next action
          <input value={draft.nextAction} maxLength={500} onChange={(event) => updateDraft('nextAction', event.target.value)} disabled={saving} placeholder="e.g. Call to confirm onboarding needs" className={FIELD_CLASS} />
        </label>
        {draft.salesStage === 'lost' ? <label className="mt-3 block text-xs font-semibold text-[#5f7383]">Lost reason
          <textarea required value={draft.lostReason} maxLength={1000} onChange={(event) => updateDraft('lostReason', event.target.value)} disabled={saving} rows={3} className={`${FIELD_CLASS} py-2.5`} />
        </label> : null}
        <label className="mt-3 block text-xs font-semibold text-[#5f7383]">Internal notes
          <textarea value={draft.internalNotes} maxLength={5000} onChange={(event) => updateDraft('internalNotes', event.target.value)} disabled={saving} rows={4} placeholder="Visible to Arch9 staff only" className={`${FIELD_CLASS} py-2.5`} />
        </label>
        {validationError ? <p role="alert" className="mt-3 text-xs font-semibold text-[#992f29]">{validationError}</p> : null}
        <button type="submit" disabled={saving} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[11px] bg-[#126149] px-4 text-sm font-semibold text-white transition hover:bg-[#0d513d] disabled:cursor-not-allowed disabled:opacity-60">
          <Save className="h-4 w-4" aria-hidden="true" />{saving ? 'Saving workflow…' : 'Save lead workflow'}
        </button>
      </form>

      <dl className="mt-4">
        <DetailItem label="Intake type">{formatIntakeKind(lead.intake_kind)}</DetailItem>
        <DetailItem label="Role / organisation type">{lead.role}</DetailItem>
        <DetailItem label="Business size">{lead.business_size}</DetailItem>
        <DetailItem label="Monthly volume">{lead.monthly_volume}</DetailItem>
        <DetailItem label="Services interested in">{formatLeadList(lead.services_interested?.length ? lead.services_interested : lead.demo_focus)}</DetailItem>
        <DetailItem label="Preferred contact">{lead.preferred_contact_method?.replace(/_/g, ' ')}</DetailItem>
        <DetailItem label="Preferred window">{formatLeadList(lead.preferred_window)}</DetailItem>
        <DetailItem label="Source">{lead.source || 'Direct'}{lead.page_url ? <span className="mt-1 block break-all text-xs font-normal text-[#7d8c98]">{lead.page_url}</span> : null}</DetailItem>
        <DetailItem label="Consent"><span className="inline-flex items-center gap-1.5"><ShieldCheck className={`h-4 w-4 ${lead.popia_consent_given ? 'text-[#177357]' : 'text-[#9a6a3d]'}`} aria-hidden="true" />{lead.popia_consent_given ? 'POPIA consent recorded' : 'Legacy / not recorded'}</span></DetailItem>
        <DetailItem label="Received">{formatLeadDate(lead.submitted_at || lead.created_at)}</DetailItem>
        <DetailItem label="Last updated"><span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-[#718393]" aria-hidden="true" />{formatLeadDate(lead.updated_at)}</span></DetailItem>
      </dl>
    </aside>
  )
}
