import { Loader2, Mail, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

function normalizeText(value) {
  return String(value || '').trim()
}

const INPUT_CLASS = 'h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]'
const TEXTAREA_CLASS = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]'

function CommercialLandlordOnboardingInviteModal({
  open = false,
  landlordOptions = [],
  defaultLandlordId = '',
  onClose = null,
  onSubmit = null,
}) {
  const [mode, setMode] = useState('existing')
  const [form, setForm] = useState({
    landlordId: '',
    legalName: '',
    entityType: 'company',
    recipientName: '',
    recipientEmail: '',
    recipientPhone: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      landlordId: defaultLandlordId || '',
      legalName: '',
      entityType: 'company',
      recipientName: '',
      recipientEmail: '',
      recipientPhone: '',
    })
    setMode(defaultLandlordId ? 'existing' : 'existing')
    setSaving(false)
    setError('')
  }, [defaultLandlordId, open])

  const selectedLandlord = useMemo(
    () => landlordOptions.find((option) => option.value === form.landlordId) || null,
    [form.landlordId, landlordOptions],
  )

  useEffect(() => {
    if (!selectedLandlord || mode !== 'existing') return
    setForm((previous) => ({
      ...previous,
      recipientName: previous.recipientName || normalizeText(selectedLandlord.contactPerson || selectedLandlord.contact_person || selectedLandlord.label),
      recipientEmail: previous.recipientEmail || normalizeText(selectedLandlord.email),
      recipientPhone: previous.recipientPhone || normalizeText(selectedLandlord.phone),
    }))
  }, [mode, selectedLandlord])

  if (!open) return null

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (mode === 'existing' && !normalizeText(form.landlordId)) {
      setError('Choose an existing landlord or switch to create a shell landlord first.')
      return
    }
    if (mode === 'new' && !normalizeText(form.legalName)) {
      setError('Add the landlord legal name before sending onboarding.')
      return
    }
    if (!normalizeText(form.recipientEmail)) {
      setError('A recipient email is required for the secure onboarding link.')
      return
    }
    setSaving(true)
    try {
      await onSubmit?.({
        landlordId: mode === 'existing' ? form.landlordId : '',
        landlordDraft: mode === 'new'
          ? {
              legal_name: form.legalName,
              name: form.legalName,
              entity_type: form.entityType,
              email: form.recipientEmail,
              phone: form.recipientPhone,
              contact_person: form.recipientName,
            }
          : null,
        recipientName: form.recipientName,
        recipientEmail: form.recipientEmail,
        recipientPhone: form.recipientPhone,
      })
      onClose?.()
    } catch (submitError) {
      setError(submitError?.message || 'Landlord onboarding could not be sent.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[28px] border border-white/70 bg-[#f8fafc] shadow-[0_28px_88px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-slate-400">Commercial Landlord</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#102236]">Send Landlord Onboarding</h2>
            <p className="mt-1 text-sm text-slate-500">Issue a secure onboarding link and let the landlord complete the portfolio pack without an Arch9 account.</p>
          </div>
          <button type="button" onClick={() => onClose?.()} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-5 px-5 py-5 sm:px-6">
          <div className="inline-flex w-fit rounded-2xl border border-slate-200 bg-white p-1">
            {[
              { value: 'existing', label: 'Use Existing' },
              { value: 'new', label: 'Create Shell Landlord' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === option.value ? 'bg-[#102b46] text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {mode === 'existing' ? (
            <label className="grid gap-1 text-sm font-semibold text-[#102236]">
              Landlord
              <select
                value={form.landlordId}
                onChange={(event) => setForm((previous) => ({ ...previous, landlordId: event.target.value }))}
                className={INPUT_CLASS}
              >
                <option value="">Select landlord</option>
                {landlordOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-[#102236]">
                Legal Entity Name
                <input
                  value={form.legalName}
                  onChange={(event) => setForm((previous) => ({ ...previous, legalName: event.target.value }))}
                  className={INPUT_CLASS}
                  placeholder="Growthpoint Properties"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-[#102236]">
                Entity Type
                <select
                  value={form.entityType}
                  onChange={(event) => setForm((previous) => ({ ...previous, entityType: event.target.value }))}
                  className={INPUT_CLASS}
                >
                  <option value="company">Company</option>
                  <option value="individual">Private Individual</option>
                  <option value="cc">Close Corporation</option>
                  <option value="trust">Trust</option>
                  <option value="fund">Property Fund</option>
                  <option value="reit">REIT</option>
                  <option value="listed_company">Listed Company</option>
                  <option value="government_entity">Government Entity</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-[#102236]">
              Recipient Name
              <input
                value={form.recipientName}
                onChange={(event) => setForm((previous) => ({ ...previous, recipientName: event.target.value }))}
                className={INPUT_CLASS}
                placeholder="Maya Patel"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#102236]">
              Recipient Email
              <input
                type="email"
                value={form.recipientEmail}
                onChange={(event) => setForm((previous) => ({ ...previous, recipientEmail: event.target.value }))}
                className={INPUT_CLASS}
                placeholder="maya@landlord.co.za"
              />
            </label>
          </div>

          <label className="grid gap-1 text-sm font-semibold text-[#102236]">
            Recipient Mobile
            <input
              value={form.recipientPhone}
              onChange={(event) => setForm((previous) => ({ ...previous, recipientPhone: event.target.value }))}
              className={INPUT_CLASS}
              placeholder="+27 82 000 0000"
            />
          </label>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <Mail size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#102236]">What gets sent</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  The landlord receives a secure link, broker contact details, a short explanation of the onboarding pack, and the supporting document request list.
                </p>
              </div>
            </div>
          </section>

          {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-end">
            <button type="button" onClick={() => onClose?.()} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {saving ? 'Sending...' : 'Send Onboarding'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CommercialLandlordOnboardingInviteModal
