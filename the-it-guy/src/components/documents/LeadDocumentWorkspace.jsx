import React, { useMemo } from 'react'
import { CheckCircle2, FileText, FolderOpen, LockKeyhole, ShieldCheck } from 'lucide-react'

function rowIdentity(row = {}, categoryKey = '') {
  return String(row.id || row.requirementId || row.requirement_id || row.requirementKey || row.requirement_key || row.key || `${categoryKey}-${row.label || row.title || 'document'}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
}

function isCompletedStatus(status = {}) {
  return status.state === 'complete' || status.state === 'review'
}

export default function LeadDocumentWorkspace({
  partyType = 'seller',
  partyName = '',
  categories = [],
  getStatusMeta,
  renderActions,
  portalAction,
  portalActionLabel,
}) {
  const partyLabel = partyType === 'buyer' ? 'Buyer' : 'Seller'
  const normalizedCategories = useMemo(() => categories.map((category) => {
    const requiredItems = (category.items || []).filter((row) => row.required !== false)
    const completed = requiredItems.filter((row) => isCompletedStatus(getStatusMeta(row))).length
    const total = requiredItems.length
    return { ...category, completed, total, progress: total ? Math.round((completed / total) * 100) : 0 }
  }), [categories, getStatusMeta])
  const summary = useMemo(() => {
    const total = normalizedCategories.reduce((sum, category) => sum + category.total, 0)
    const completed = normalizedCategories.reduce((sum, category) => sum + category.completed, 0)
    return { total, completed, outstanding: Math.max(total - completed, 0), progress: total ? Math.round((completed / total) * 100) : 0 }
  }, [normalizedCategories])
  const outstanding = useMemo(() => {
    const seen = new Set()
    return normalizedCategories.flatMap((category) => (category.items || []).map((row) => ({ row, category })))
      .filter(({ row }) => row.required !== false && !isCompletedStatus(getStatusMeta(row)))
      .filter(({ row, category }) => {
        const identity = rowIdentity(row, category.key)
        if (seen.has(identity)) return false
        seen.add(identity)
        return true
      })
  }, [getStatusMeta, normalizedCategories])

  const focusRow = (row, category) => {
    const element = document.getElementById(`lead-document-${rowIdentity(row, category.key)}`)
    element?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    element?.focus?.({ preventScroll: true })
  }

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
            <span className="inline-flex min-h-10 items-center rounded-full border border-[#dbe7f2] bg-white px-4 text-sm font-semibold text-[#31506b]">{summary.completed} of {summary.total} complete</span>
            {portalAction ? <button type="button" onClick={portalAction} className="inline-flex min-h-10 items-center rounded-[12px] border border-[#dbe4ee] bg-white px-4 text-sm font-semibold text-[#20364c] hover:border-[#b9cde3]">{portalActionLabel || `Send ${partyLabel} Portal Link`}</button> : null}
          </div>
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#e6edf5]" aria-label={`${summary.progress}% complete`}><div className="h-full rounded-full bg-[#148a58] transition-all" style={{ width: `${summary.progress}%` }} /></div>
      </header>

      <div className="grid gap-5 px-5 py-6 sm:px-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid items-start gap-5 md:grid-cols-2" data-testid={`${partyType}-documents-list`}>
          {normalizedCategories.map((category) => {
            const CategoryIcon = category.Icon || FileText
            return (
              <article key={category.key} className={`overflow-hidden rounded-[20px] border border-[#e3edf7] bg-white shadow-[0_8px_22px_rgba(31,54,78,0.04)] ${category.cardClass || ''}`}>
                <div className="flex items-start justify-between gap-3 px-5 py-4">
                  <div className="flex min-w-0 gap-3">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border ${category.iconClass || 'border-[#dbe7f2] bg-[#f4f8fb] text-[#315b7a]'}`}><CategoryIcon className="h-5 w-5" /></span>
                    <div className="min-w-0"><h5 className="truncate text-base font-semibold text-[#102033]">{category.label}</h5><p className="mt-1 text-xs font-semibold text-[#607891]">{category.completed} of {category.total} complete</p><p className="mt-1 text-xs leading-5 text-[#7890a8]">{category.description}</p></div>
                  </div>
                  <span className="shrink-0 rounded-full border border-[#dbe7f2] bg-[#fbfdff] px-3 py-1 text-xs font-semibold text-[#31506b]">{category.progress}%</span>
                </div>
                <div className="border-t border-[#e8eff6]">
                  {(category.items || []).length ? (
                    <>
                      <div className="hidden grid-cols-[minmax(0,1fr)_auto_auto] gap-3 px-5 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[#8295a9] sm:grid"><span>Item</span><span>Status</span><span>Action</span></div>
                      {(category.items || []).map((row) => {
                        const status = getStatusMeta(row)
                        const id = rowIdentity(row, category.key)
                        return (
                          <div id={`lead-document-${id}`} tabIndex={-1} key={id} className="grid gap-3 border-t border-[#edf2f7] px-5 py-3 outline-none transition focus:bg-[#f4faf7] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                            <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#20364c]" title={row.label || row.title}>{row.label || row.title}</p><p className="mt-0.5 text-xs text-[#7b8fa5]">{row.required === false ? 'Optional' : 'Required'}{row.uploadedAt ? ` · ${new Date(row.uploadedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</p></div>
                            <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${status.pillClass}`}>{status.label}</span>
                            <div className="flex flex-wrap items-center gap-2">{renderActions?.(row, category, status)}</div>
                          </div>
                        )
                      })}
                    </>
                  ) : <div className="border-t border-[#edf2f7] px-5 py-7 text-center"><FolderOpen className="mx-auto h-6 w-6 text-[#7b8fa5]" /><p className="mt-2 text-sm font-medium text-[#6d8298]">No {category.label.toLowerCase()} requested yet.</p></div>}
                </div>
              </article>
            )
          })}
        </div>

        <aside className="space-y-4">
          <section className="rounded-[20px] bg-[#102033] p-5 text-white shadow-[0_18px_38px_rgba(16,32,51,0.16)]"><p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#a8bfd3]">Document Progress</p><p className="mt-4 text-4xl font-semibold tracking-[-0.05em]">{summary.progress}%</p><p className="mt-2 text-sm leading-6 text-[#c7d5e2]">{summary.outstanding ? `${summary.outstanding} document${summary.outstanding === 1 ? '' : 's'} still need attention before this ${partyType} pack is complete.` : `This ${partyType} pack is complete.`}</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#6bd09a]" style={{ width: `${summary.progress}%` }} /></div></section>
          <section className="rounded-[20px] border border-[#e3edf7] bg-white p-5"><div className="flex items-center justify-between"><h5 className="text-sm font-semibold text-[#20364c]">Still Needed</h5><span className="rounded-full bg-[#eef3f7] px-2.5 py-1 text-xs font-semibold text-[#607891]">{outstanding.length}</span></div><div className="mt-3 divide-y divide-[#edf2f7]">{outstanding.length ? outstanding.map(({ row, category }) => <button type="button" key={`${category.key}-${rowIdentity(row, category.key)}`} onClick={() => focusRow(row, category)} className="block w-full py-3 text-left hover:text-[#13784f]"><span className="block truncate text-sm font-semibold">{row.label || row.title}</span><span className="mt-1 block text-xs text-[#7b8fa5]">{category.label}</span></button>) : <p className="py-3 text-sm font-semibold text-[#25764a]"><CheckCircle2 className="mr-2 inline h-4 w-4" />Nothing outstanding.</p>}</div></section>
          <section className="rounded-[20px] border border-[#d9ebe2] bg-[#f3faf6] p-5"><ShieldCheck className="h-8 w-8 text-[#148a58]" /><h5 className="mt-3 text-sm font-semibold text-[#20364c]">Keep everything complete</h5><p className="mt-2 text-xs leading-5 text-[#607891]">A complete {partyType} pack helps us move faster and reduce delays.</p></section>
        </aside>
      </div>
      <footer className="mx-5 mb-5 flex gap-3 rounded-[16px] border border-[#e3edf7] bg-[#fbfdff] px-4 py-3 text-xs text-[#607891] sm:mx-6"><LockKeyhole className="h-5 w-5 shrink-0 text-[#315b7a]" /><span><strong className="block text-[#20364c]">Secure storage</strong>All documents are securely stored and access is restricted to authorised users only.</span></footer>
    </section>
  )
}
