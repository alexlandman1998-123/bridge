import { Loader2, Mail } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import Modal from '../../../components/ui/Modal'
import { buildCommercialOnboardingInviteDraft } from '../services/commercialOnboardingApi'

function Field({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-[#102236]">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
      />
    </label>
  )
}

function CommercialOnboardingSendModal({
  open = false,
  kind = '',
  record = null,
  lookups = {},
  onClose,
  onSend,
}) {
  const draft = useMemo(() => buildCommercialOnboardingInviteDraft({ kind, record: record || {}, lookups }), [kind, lookups, record])
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      name: draft.contact?.name || '',
      email: draft.contact?.email || '',
      phone: draft.contact?.phone || '',
      company: draft.contact?.company || '',
    })
    setError('')
    setSending(false)
  }, [draft.contact?.company, draft.contact?.email, draft.contact?.name, draft.contact?.phone, open])

  async function handleSubmit(event) {
    event.preventDefault()
    setSending(true)
    setError('')
    try {
      await onSend?.({
        ...draft,
        contact: {
          name: form.name,
          email: form.email,
          phone: form.phone,
          company: form.company,
        },
      })
      onClose?.()
    } catch (sendError) {
      setError(sendError?.message || 'Onboarding email could not be sent.')
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  return (
    <Modal open title={draft.title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div>
          <p className="text-sm font-semibold text-[#102236]">{draft.description}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">We’ll send a secure link and let the portal collect the conditional fields and documents.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Contact Name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
          <Field label="Email" type="email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} />
          <Field label="Phone" value={form.phone} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} />
          <Field label="Company" value={form.company} onChange={(value) => setForm((current) => ({ ...current, company: value }))} />
        </div>

        {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={sending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
            {draft.label}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default CommercialOnboardingSendModal
