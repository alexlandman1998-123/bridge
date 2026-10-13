import { buildSellerDocumentUploadEvidenceSummary } from '../../services/listings/listingSellerDocumentUploadModel.js'
import DocumentRequirementRemoveButton from './DocumentRequirementRemoveButton.jsx'
import DocumentUploadProgress from './DocumentUploadProgress.jsx'
import React, { useMemo, useState } from 'react'
import ListingDocumentActions from './ListingDocumentActions.jsx'
import { FileText, FolderOpen, LockKeyhole } from 'lucide-react'
import { summarizeLeadDocumentCategory } from './leadDocumentProgressModel'

function rowIdentity(row = {}, categoryKey = '') {
  return String(row.id || row.requirementId || row.requirement_id || row.requirementKey || row.requirement_key || row.key || `${categoryKey}-${row.label || row.title || 'document'}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
}

export default function LeadDocumentWorkspace({
  partyType = 'seller',
  partyName = '',
  categories = [],
  getStatusMeta,
  renderActions,
  renderRowActions,
  portalAction,
  portalActionLabel,
  portalActionDisabled = false,
  manageDocumentsAction,
  reviewSigningAction,
  createMandateAction,
  removalContext,
  uploadProgress,
}) {
  const partyLabel = partyType === 'buyer' ? 'Buyer' : 'Seller'
  const [selectedCategory, setSelectedCategory] = useState('')
  const normalizedCategories = useMemo(() => categories.map((category) => {
    const items = category.items || []
    return { ...category, items, ...summarizeLeadDocumentCategory(items, { getStatusMeta, partyType }) }
  }), [categories, getStatusMeta, partyType])
  const summary = useMemo(() => {
    const total = normalizedCategories.reduce((sum, category) => sum + category.total, 0)
    const completed = normalizedCategories.reduce((sum, category) => sum + category.completed, 0)
    return { total, completed, outstanding: Math.max(total - completed, 0), progress: total ? Math.round((completed / total) * 100) : 0 }
  }, [normalizedCategories])
  const uploadEvidence = useMemo(
    () => buildSellerDocumentUploadEvidenceSummary(normalizedCategories.flatMap(category => category.items)),
    [normalizedCategories],
  )
  const populatedCategories = useMemo(
    () => normalizedCategories.filter((category) => (category.items || []).length > 0),
    [normalizedCategories],
  )
  const activeCategory = normalizedCategories.find(category => category.key === selectedCategory) || populatedCategories[0] || normalizedCategories[0]
  const displayedCategories = partyType === 'seller' ? (activeCategory ? [activeCategory] : []) : populatedCategories

  return (
    <section className="overflow-hidden rounded-[26px] border border-[#dbe7f2] bg-white shadow-[0_18px_44px_rgba(31,54,78,0.06)]" data-testid={`${partyType}-document-workspace`}>
      <header className="border-b border-[#e6eef7] bg-[#fbfdff] px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#148a58]">{partyLabel} Profile <span className="px-1 text-[#9aabba]">/</span> Documents</p>
            <h4 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#102033]">Documents</h4>
            <p className="mt-1 truncate text-sm font-medium text-[#60758b]" title={partyName}>{partyName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {partyType === 'seller' ? <ListingDocumentActions label="Seller documents">
              {manageDocumentsAction ? <button type="button" onClick={manageDocumentsAction} className="min-h-10 rounded-lg px-3 text-xs font-semibold">Manage document requirements</button> : null}
              {reviewSigningAction ? <button type="button" onClick={reviewSigningAction} className="min-h-10 rounded-lg px-3 text-xs font-semibold">Review signing routes</button> : null}
              {createMandateAction ? <button type="button" onClick={createMandateAction} className="min-h-10 rounded-lg px-3 text-xs font-semibold">Create printable mandate</button> : null}
              {portalAction ? <button type="button" onClick={portalAction} disabled={portalActionDisabled} className="min-h-10 rounded-lg px-3 text-xs font-semibold disabled:opacity-50">{portalActionLabel || 'Send Seller Portal Link'}</button> : null}
            </ListingDocumentActions> : <>
              <span className="inline-flex min-h-10 items-center rounded-full border border-[#dbe7f2] bg-white px-4 text-sm font-semibold text-[#31506b]">{summary.completed} of {summary.total} complete</span>
              {portalAction ? <button type="button" onClick={portalAction} disabled={portalActionDisabled} className="inline-flex min-h-10 items-center rounded-[12px] border border-[#dbe4ee] bg-white px-4 text-sm font-semibold text-[#20364c] hover:border-[#b9cde3]">{portalActionLabel || 'Send Buyer Portal Link'}</button> : null}
            </>}
            {manageDocumentsAction ? <button type="button" onClick={manageDocumentsAction} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#176842] px-4 text-sm font-semibold text-white hover:bg-[#125634]"><FileText size={15} aria-hidden="true" />Upload / Request document</button> : null}
          </div>
        </div>
        {partyType === 'seller' ? <p className="mt-3 text-sm text-[#60758b]"><span className="font-semibold">{summary.completed} of {summary.total} complete</span> · {uploadEvidence.saved} {uploadEvidence.saved === 1 ? 'file' : 'files'} saved · {uploadEvidence.awaitingReview} awaiting review</p> : null}
        <DocumentUploadProgress progress={uploadProgress?.requirementKey ? null : uploadProgress} />
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#e6edf5]" aria-label={`${summary.progress}% complete`}><div className="h-full rounded-full bg-[#148a58] transition-all" style={{ width: `${summary.progress}%` }} /></div>
      </header>

      <div className="px-5 py-6 sm:px-6">
        {partyType === 'seller' ? <div role="tablist" aria-label="Seller document types" className="flex flex-wrap gap-2" data-testid="seller-document-trackers">
          {normalizedCategories.map(category => {
            const Icon = category.Icon || FileText
            const active = activeCategory?.key === category.key
            return <button key={category.key} id={`lead-document-tab-${category.key}`} role="tab" type="button" tabIndex={active ? 0 : -1} onKeyDown={event => {
              const index = normalizedCategories.indexOf(category)
              const next = event.key === 'ArrowRight' ? (index + 1) % normalizedCategories.length : event.key === 'ArrowLeft' ? (index + normalizedCategories.length - 1) % normalizedCategories.length : event.key === 'Home' ? 0 : event.key === 'End' ? normalizedCategories.length - 1 : -1
              if (next < 0) return
              event.preventDefault()
              setSelectedCategory(normalizedCategories[next].key)
              event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus()
            }} aria-selected={active} aria-controls={`lead-document-panel-${category.key}`} onClick={() => setSelectedCategory(category.key)} className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${active ? 'border-[#1f4f78] bg-[#edf4fb] text-[#1f4f78]' : 'border-[#dce6f2] bg-white text-[#607387] hover:bg-[#f7fbff]'}`}><Icon size={16} aria-hidden="true" />{category.label}<span className="rounded-full bg-white px-2 text-xs">{category.items.length}</span></button>
          })}
        </div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid={`${partyType}-document-trackers`}>
          {normalizedCategories.map((category) => {
            const CategoryIcon = category.Icon || FileText
            return (
              <article key={category.key} className={`rounded-[18px] border border-[#e3edf7] bg-white p-4 shadow-[0_8px_22px_rgba(31,54,78,0.04)] ${category.cardClass || ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[13px] border ${category.iconClass || 'border-[#dbe7f2] bg-[#f4f8fb] text-[#315b7a]'}`}><CategoryIcon className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <h5 className="truncate text-sm font-semibold text-[#102033]">{category.label}</h5>
                      <p className="mt-0.5 text-xs font-medium text-[#607891]">{category.completed} of {category.total} complete</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-[#dbe7f2] bg-[#fbfdff] px-3 py-1 text-xs font-semibold text-[#31506b]">{category.progress}%</span>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#e6edf5]" aria-label={`${category.progress}% of ${category.label} complete`}><div className="h-full rounded-full bg-[#148a58] transition-all" style={{ width: `${category.progress}%` }} /></div>
              </article>
            )
          })}
        </div>}

        <section className="mt-5 overflow-hidden rounded-[20px] border border-[#e3edf7] bg-[#f7fafc] shadow-[0_8px_22px_rgba(31,54,78,0.04)]" data-testid={`${partyType}-documents-list`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8eff6] px-5 py-4">
            {partyType !== 'seller' ? <div>
              <h5 className="text-base font-semibold text-[#102033]">Documents</h5>
              <p className="mt-1 text-xs text-[#7890a8]">Documents requested for this buyer, organised by purpose.</p>
            </div> : null}
            <span className="ml-auto rounded-full bg-[#eef3f7] px-3 py-1.5 text-xs font-semibold text-[#607891]">{summary.outstanding} outstanding</span>
          </div>
          {displayedCategories.length ? (
            <div className="space-y-4 p-4 sm:p-5">
              {displayedCategories.map((category) => {
                const CategoryIcon = category.Icon || FileText
                const outstanding = Math.max(category.total - category.completed, 0)
                return (
                  <section key={category.key} id={`lead-document-panel-${category.key}`} role={partyType === 'seller' ? 'tabpanel' : undefined} aria-labelledby={partyType === 'seller' ? `lead-document-tab-${category.key}` : undefined} className="overflow-hidden rounded-[18px] border border-[#e1eaf3] bg-white" data-testid={`${partyType}-document-category-${category.key}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8eff6] bg-[#fbfdff] px-4 py-3.5 sm:px-5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border ${category.iconClass || 'border-[#dbe7f2] bg-[#f4f8fb] text-[#315b7a]'}`}><CategoryIcon className="h-4 w-4" /></span>
                        <div className="min-w-0">
                          <h6 className="truncate text-sm font-semibold text-[#102033]">{category.label}</h6>
                          <p className="mt-0.5 text-xs text-[#71869b]">{category.description || `${partyLabel} document requirements`}</p>
                        </div>
                      </div>
                      <span className="rounded-full border border-[#dbe7f2] bg-white px-3 py-1 text-xs font-semibold text-[#607891]">{outstanding ? `${outstanding} outstanding` : 'Complete'}</span>
                    </div>
                    <div className={`hidden ${partyType === 'seller' ? 'xl:grid xl:grid-cols-[minmax(0,1.4fr)_minmax(100px,.7fr)_minmax(120px,1fr)_auto]' : 'lg:grid lg:grid-cols-[minmax(0,1fr)_auto_auto]'} gap-4 border-b border-[#edf2f7] px-5 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[#8295a9]`}>
                      <span>Document</span><span>Status</span>{partyType === 'seller' ? <span>Activity</span> : null}<span>Actions</span>
                    </div>
                    <div className="divide-y divide-[#edf2f7]">
                      {(category.items || []).map((row) => {
                        const status = getStatusMeta(row)
                        const id = rowIdentity(row, category.key)
                        return (
                          <div id={`lead-document-${category.key}-${id}`} tabIndex={-1} key={`${category.key}-${id}`} className={`grid gap-3 px-4 py-4 outline-none transition focus:bg-[#f4faf7] sm:px-5 ${partyType === 'seller' && status.signedAwaitingReview ? 'bg-[#effaf3]' : ''} ${partyType === 'seller' ? 'xl:grid-cols-[minmax(0,1.4fr)_minmax(100px,.7fr)_minmax(120px,1fr)_auto] xl:items-center xl:gap-4' : 'lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center lg:gap-4'}`}>
                            <div className="min-w-0">
                              <div className="flex items-start gap-2"><p className="min-w-0 break-words text-sm font-semibold text-[#20364c]" title={row.label || row.title}>{row.label || row.title}</p></div>
                              <p className="mt-1 text-xs text-[#7b8fa5]"><span className={`mr-2 inline-flex rounded-full border px-2 py-0.5 ${category.iconClass || 'border-[#dbe7f2] bg-[#f4f8fb] text-[#315b7a]'}`}>{category.label}</span>{row.required === false ? 'Optional' : 'Required'}</p>
                            </div>
                            <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${status.pillClass}`}>{status.label}</span>
                            {partyType === 'seller' ? <p className="text-xs leading-5 text-[#607387]">{row.uploadedAt ? `Uploaded ${new Date(row.uploadedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}` : row.fileName || (row.canDownload || row.originalDocument?.storage_path ? 'File saved' : 'Awaiting document')}</p> : null}
                            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{partyType === 'seller' ? <>{renderRowActions?.(row, category, status)}<ListingDocumentActions label={row.label || row.title || 'Document'}>{renderActions?.(row, category, status)}</ListingDocumentActions>{removalContext ? <DocumentRequirementRemoveButton row={row} {...removalContext} /> : null}</> : <>{renderActions?.(row, category, status)}{removalContext ? <DocumentRequirementRemoveButton row={row} {...removalContext} /> : null}</>}</div>
                            {uploadProgress?.requirementKey && uploadProgress.requirementKey === (row.requirementKey || row.requirement_key || row.key) ? <div className="xl:col-span-4"><DocumentUploadProgress progress={uploadProgress} /></div> : null}
                          </div>
                        )
                      })}
                    </div>
                    {!category.items.length ? <p className="px-5 py-8 text-sm text-[#607387]">No documents in this category yet.</p> : null}
                  </section>
                )
              })}
            </div>
          ) : (
            <div className="px-5 py-10 text-center"><FolderOpen className="mx-auto h-7 w-7 text-[#7b8fa5]" /><p className="mt-2 text-sm font-medium text-[#6d8298]">No document requirements requested yet.</p></div>
          )}
        </section>
      </div>
      <footer className="mx-5 mb-5 flex gap-3 rounded-[16px] border border-[#e3edf7] bg-[#fbfdff] px-4 py-3 text-xs text-[#607891] sm:mx-6"><LockKeyhole className="h-5 w-5 shrink-0 text-[#315b7a]" /><span><strong className="block text-[#20364c]">Secure storage</strong>All documents are securely stored and access is restricted to authorised users only.</span></footer>
    </section>
  )
}
