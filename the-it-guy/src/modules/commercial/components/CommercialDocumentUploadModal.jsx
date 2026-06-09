import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { COMMERCIAL_DOCUMENT_STATUSES, getCommercialDocumentCategories } from '../commercialDocumentConstants'

function CommercialDocumentUploadModal({ open, entityType, onClose, onSubmit }) {
  const [form, setForm] = useState({ documentName: '', category: '', status: 'uploaded', versionNumber: '1', expiresAt: '', notes: '', file: null })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const categories = getCommercialDocumentCategories(entityType)

  useEffect(() => {
    if (!open) return
    setForm({ documentName: '', category: categories[0]?.value || '', status: 'uploaded', versionNumber: '1', expiresAt: '', notes: '', file: null })
    setError('')
  }, [categories, open])

  if (!open) return null

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!form.documentName.trim() && !form.file?.name) {
      setError('Add a document name or choose a file.')
      return
    }
    try {
      setSaving(true)
      await onSubmit?.(form)
      onClose?.()
    } catch (uploadError) {
      setError(uploadError?.message || 'Document could not be uploaded.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Upload document</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-[#102236]">Commercial Document</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <X size={18} />
          </button>
        </header>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 sm:col-span-2">{error}</div> : null}
          <label className="grid gap-1.5 sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">File</span>
            <input
              type="file"
              onChange={(event) => setForm((previous) => ({ ...previous, file: event.target.files?.[0] || null }))}
              className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#102236]"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Document name</span>
            <input
              value={form.documentName}
              onChange={(event) => setForm((previous) => ({ ...previous, documentName: event.target.value }))}
              placeholder={form.file?.name || 'Heads of Terms'}
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
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Version</span>
            <input
              type="number"
              min="1"
              value={form.versionNumber}
              onChange={(event) => setForm((previous) => ({ ...previous, versionNumber: event.target.value }))}
              className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Expiry date</span>
            <input
              type="date"
              value={form.expiresAt}
              onChange={(event) => setForm((previous) => ({ ...previous, expiresAt: event.target.value }))}
              className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-[#102236] outline-none focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
            />
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

        <footer className="flex justify-end gap-3 border-t border-slate-200 p-5">
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-2xl bg-[#102b46] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60">
            {saving ? 'Uploading...' : 'Upload document'}
          </button>
        </footer>
      </form>
    </div>
  )
}

export default CommercialDocumentUploadModal
