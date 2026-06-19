import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { COMMERCIAL_DOCUMENT_REQUEST_PRIORITIES, COMMERCIAL_DOCUMENT_STATUSES, getCommercialDocumentCategories } from '../commercialDocumentConstants'

function CommercialDocumentRequestModal({ open, entityType, onClose, onSubmit }) {
  const categories = getCommercialDocumentCategories(entityType)
  const [form, setForm] = useState({
    documentName: '',
    category: categories[0]?.value || '',
    requestedFrom: '',
    dueDate: '',
    priority: 'normal',
    notes: '',
    status: 'requested',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({ documentName: '', category: categories[0]?.value || '', requestedFrom: '', dueDate: '', priority: 'normal', notes: '', status: 'requested' })
    setError('')
  }, [categories, open])

  if (!open) return null

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!form.documentName.trim()) {
      setError('Document name is required.')
      return
    }
    try {
      setSaving(true)
      await onSubmit?.(form)
      onClose?.()
    } catch (requestError) {
      setError(requestError?.message || 'Document request could not be created.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/35 px-3 py-4 backdrop-blur-sm sm:px-4">
      <form onSubmit={handleSubmit} className="my-auto flex max-h-[calc(100dvh-32px)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Request document</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-[#102236]">Internal Commercial Request</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <X size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain p-5 sm:grid-cols-2">
          {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 sm:col-span-2">{error}</div> : null}
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Document name *</span>
            <input
              value={form.documentName}
              onChange={(event) => setForm((previous) => ({ ...previous, documentName: event.target.value }))}
              className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Category</span>
            <select
              value={form.category}
              onChange={(event) => setForm((previous) => ({ ...previous, category: event.target.value }))}
              className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
            >
              {categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Requested from</span>
            <input
              value={form.requestedFrom}
              onChange={(event) => setForm((previous) => ({ ...previous, requestedFrom: event.target.value }))}
              placeholder="Tenant, landlord, broker..."
              className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Due date</span>
            <input
              type="date"
              value={form.dueDate}
              onChange={(event) => setForm((previous) => ({ ...previous, dueDate: event.target.value }))}
              className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Status</span>
            <select
              value={form.status}
              onChange={(event) => setForm((previous) => ({ ...previous, status: event.target.value }))}
              className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
            >
              {COMMERCIAL_DOCUMENT_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Priority</span>
            <select
              value={form.priority}
              onChange={(event) => setForm((previous) => ({ ...previous, priority: event.target.value }))}
              className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
            >
              {COMMERCIAL_DOCUMENT_REQUEST_PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Notes</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
            />
          </label>
        </div>

        <footer className="flex shrink-0 justify-end gap-3 border-t border-slate-200 p-5">
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-2xl bg-[#102b46] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60">
            {saving ? 'Creating...' : 'Create request'}
          </button>
        </footer>
      </form>
    </div>
  )
}

export default CommercialDocumentRequestModal
