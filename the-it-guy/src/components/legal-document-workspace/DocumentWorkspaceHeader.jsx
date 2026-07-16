import { CheckCircle2, Eye, Loader2, Save, Settings2, Undo2 } from 'lucide-react'
import { Link } from 'react-router-dom'

const STATUS_STYLES = Object.freeze({
  live: 'border-[#c9e7d4] bg-[#eef9f2] text-[#176f43]',
  draft: 'border-[#eed8ab] bg-[#fff9eb] text-[#8c6216]',
  attorney_review: 'border-[#cbdced] bg-[#f1f6fb] text-[#37668e]',
  approved: 'border-[#c9e7d4] bg-[#eef9f2] text-[#176f43]',
  missing: 'border-[#dae4ed] bg-[#f6f8fa] text-[#62758a]',
})

export function DocumentWorkspaceHeader({
  document,
  workingDraft,
  previewPath,
  advancedEditorPath,
  editable,
  dirty,
  saving,
  saveMessage,
  onSave,
  onDiscard,
}) {
  const draftStatus = workingDraft?.status || ''
  const status = ['draft', 'attorney_review', 'approved'].includes(draftStatus)
    ? draftStatus
    : document?.status || 'missing'
  const statusLabel = status === 'live'
    ? 'Live'
    : status === 'draft'
      ? 'Draft'
      : status === 'attorney_review'
        ? 'In legal review'
        : status === 'approved'
          ? 'Approved'
          : 'Set up required'
  const saveLabel = saving
    ? 'Saving draft…'
    : dirty
      ? 'Unsaved changes'
      : saveMessage || (workingDraft?.saveStatus === 'saved' ? 'All changes saved' : 'No working draft')

  return (
    <header className="flex flex-col gap-5 border-b border-[#e1e8ef] pb-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <nav className="flex items-center gap-2 text-sm font-semibold" aria-label="Breadcrumb">
          <Link to="/settings/legal-templates" className="text-[#1c6ca1] transition hover:text-[#0f7f4f]">Legal Documents</Link>
          <span className="text-[#b2bec9]" aria-hidden="true">/</span>
          <span className="truncate text-[#42566d]" aria-current="page">{document?.label || 'Document'}</span>
        </nav>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[#102033] sm:text-[2.25rem]">{document?.label || 'Legal document'}</h1>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${STATUS_STYLES[status] || STATUS_STYLES.missing}`}>
            <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
            {statusLabel}
          </span>
          {document?.liveVersion ? <span className="text-xs font-medium text-[#7b8da1]">Version {document.liveVersion}</span> : null}
        </div>
        <p className="mt-2 inline-flex items-center gap-2 text-sm text-[#7a8ca1]">
          <CheckCircle2 className="h-4 w-4 text-[#7692a7]" aria-hidden="true" />
          {saveLabel}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={advancedEditorPath}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-transparent px-3 text-sm font-semibold text-[#6a7d92] transition hover:border-[#dce5ed] hover:bg-white hover:text-[#30455b]"
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          Advanced
        </Link>
        <Link
          to={previewPath}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[#d7e1ea] bg-white px-4 text-sm font-semibold text-[#30455b] shadow-[0_5px_14px_rgba(15,23,42,0.035)] transition hover:border-[#aac5b6] hover:bg-[#f8fcfa]"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          Preview
        </Link>
        {editable ? (
          <>
            {dirty ? (
              <button
                type="button"
                disabled={saving}
                onClick={onDiscard}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[#d7e1ea] bg-white px-4 text-sm font-semibold text-[#53687e] transition hover:bg-[#f8fafc] disabled:cursor-wait disabled:opacity-60"
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Discard
              </button>
            ) : null}
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={onSave}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[#0f7f4f] bg-[#0f7f4f] px-5 text-sm font-semibold text-white shadow-[0_9px_20px_rgba(15,127,79,0.18)] transition hover:bg-[#0c7045] disabled:cursor-not-allowed disabled:border-[#9bbdab] disabled:bg-[#dfeae3] disabled:text-[#688174] disabled:shadow-none"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save draft'}
            </button>
          </>
        ) : null}
      </div>
    </header>
  )
}
