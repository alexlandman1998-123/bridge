import { AlertCircle, CheckCircle2, Clock3, FileText, Folder, Lock, UploadCloud } from 'lucide-react'
import { useState } from 'react'
import { buyerPortalHexToRgba, createBuyerPortalTheme } from '../buyerPortalTheme'
import ClientDocumentUploadButton from './ClientDocumentUploadButton'

const STATUS_STYLES = {
  action: 'border-amber-200 bg-amber-50 text-amber-800',
  review: 'border-sky-200 bg-sky-50 text-sky-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  upcoming: 'border-slate-200 bg-slate-50 text-slate-600',
}

function DocumentStatusIcon({ status = 'upcoming', size = 18 }) {
  if (status === 'approved') return <CheckCircle2 size={size} />
  if (status === 'review') return <Clock3 size={size} />
  if (status === 'action') return <AlertCircle size={size} />
  return <FileText size={size} />
}

function UploadAction({ item, uploadingDocumentKey, onUpload, label = 'Upload', className = '' }) {
  if (!item?.uploadSpec || typeof onUpload !== 'function') return null
  return (
    <ClientDocumentUploadButton
      uploadKey={item.uploadKey || item.sourceId || item.id}
      uploadSpec={item.uploadSpec}
      uploadingDocumentKey={uploadingDocumentKey}
      onUpload={onUpload}
      label={label}
      className={className}
    />
  )
}

export function BuyerDocumentSummary({ model, action = null, compact = false }) {
  const categories = (model?.categories || []).filter((category) => category.counts.total > 0)
  return (
    <section data-buyer-documents="summary" data-document-source={model?.source || 'unknown'} className={`rounded-[22px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] ${compact ? 'h-[430px] overflow-hidden' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">Documents</h2>
          <p className="mt-1 text-sm leading-6 text-[#52657b]">Everything needed for your purchase, in one place.</p>
        </div>
        <span className="rounded-full bg-[#f2f4f7] px-3 py-1 text-xs font-semibold text-[#667085]">{model?.counts?.approved || 0} of {model?.counts?.total || 0} approved</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ['Action', model?.counts?.action || 0, 'action'],
          ['In review', model?.counts?.review || 0, 'review'],
          ['Approved', model?.counts?.approved || 0, 'approved'],
        ].map(([label, value, status]) => (
          <article key={label} className={`rounded-[13px] border px-3 py-2 ${STATUS_STYLES[status]}`}>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.11em] opacity-80">{label}</p>
            <p className="mt-1 text-lg font-semibold leading-none">{value}</p>
          </article>
        ))}
      </div>
      <div className="mt-4 grid gap-2 overflow-y-auto pr-1" style={{ maxHeight: compact ? '230px' : undefined }}>
        {categories.length ? categories.map((category) => (
          <article key={category.key} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3.5 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[#eef3f8] text-[#52657b]"><Folder size={16} /></span>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-[#142132]">{category.label}</h3>
                <p className="mt-0.5 text-xs text-[#667085]">{category.counts.approved} approved · {category.counts.review} in review</p>
              </div>
            </div>
            {category.counts.action ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[0.68rem] font-semibold text-amber-800">{category.counts.action} action</span> : null}
          </article>
        )) : <p className="rounded-[14px] border border-dashed border-[#d8e2ee] px-4 py-5 text-sm text-[#667085]">Documents will appear here when they are requested or shared.</p>}
      </div>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  )
}

export default function BuyerDocumentWorkspace({
  model,
  theme: themeInput,
  uploadingDocumentKey = '',
  openingDocumentPath = '',
  onUpload = null,
  onOpenDocument = null,
}) {
  const theme = themeInput?.primary ? themeInput : createBuyerPortalTheme(themeInput)
  const visibleCategories = (model?.categories || []).filter((category) => category.counts.total > 0)
  const [activeCategoryKey, setActiveCategoryKey] = useState(visibleCategories[0]?.key || 'sales')
  const activeCategory = visibleCategories.find((category) => category.key === activeCategoryKey) || visibleCategories[0] || null
  const [selectedDocumentId, setSelectedDocumentId] = useState(model?.firstActionItem?.id || model?.sortedItems?.[0]?.id || '')
  const selectedDocument = model?.items?.find((item) => item.id === selectedDocumentId) || activeCategory?.items?.[0] || model?.sortedItems?.[0] || null
  const actionItem = model?.firstActionItem || null
  const openKey = String(selectedDocument?.linkedDocument?.file_path || selectedDocument?.linkedDocument?.storage_path || selectedDocument?.linkedDocument?.id || '').trim()
  const canOpen = Boolean(selectedDocument?.linkedDocument && typeof onOpenDocument === 'function')

  const selectCategory = (key) => {
    setActiveCategoryKey(key)
    const category = visibleCategories.find((entry) => entry.key === key)
    if (category?.items?.length) setSelectedDocumentId(category.items[0].id)
  }

  return (
    <section data-buyer-documents="workspace" data-document-source={model?.source || 'unknown'} className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.06em] text-[#142132]">Your documents</h1>
          <p className="mt-2 text-base leading-6 text-[#52657b]">All the documents for your purchase, in one place.</p>
        </div>
        <div className="flex items-start gap-2 rounded-[14px] px-3 py-2 text-sm text-[#52657b]"><Lock size={15} className="mt-1 shrink-0 text-[#142132]" /><span>Your information is secure<br className="hidden lg:block" /> and encrypted.</span></div>
      </header>

      <section className="rounded-[20px] border border-[#dbe5ef] bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] lg:p-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:divide-x lg:divide-[#dbe5ef]">
          {[
            [`${model?.counts?.approved || 0} of ${model?.counts?.total || 0}`, 'Documents approved', 'approved'],
            [model?.counts?.action || 0, 'Needs your attention', 'action'],
            [model?.counts?.review || 0, 'Being reviewed', 'review'],
            [model?.counts?.upcoming || 0, 'Not available yet', 'upcoming'],
          ].map(([value, label, status]) => (
            <article key={label} className="flex items-start gap-3 rounded-[14px] border border-[#edf2f7] p-3 lg:rounded-none lg:border-0 lg:px-5 first:lg:pl-0 last:lg:pr-0">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border ${STATUS_STYLES[status]}`}><DocumentStatusIcon status={status} /></span>
              <div><strong className="text-xl font-semibold tracking-[-0.04em] text-[#142132]">{value}</strong><p className="mt-1 text-xs leading-5 text-[#52657b]">{label}</p></div>
            </article>
          ))}
        </div>
      </section>

      {actionItem ? (
        <section className="rounded-[20px] border border-amber-200 bg-amber-50/70 p-5" role="status">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700"><AlertCircle size={23} /></span><div><p className="text-sm font-semibold text-amber-700">{model.counts.action} document{model.counts.action === 1 ? ' needs' : 's need'} your attention</p><h2 className="mt-2 text-base font-semibold text-[#142132]">{actionItem.title}</h2><p className="mt-1 text-sm leading-6 text-[#52657b]">{actionItem.description}</p></div></div>
            <UploadAction item={actionItem} uploadingDocumentKey={uploadingDocumentKey} onUpload={onUpload} className="min-h-11 rounded-[12px] !border-[#111827] !bg-[#111827] px-5 !text-white hover:!bg-black" />
          </div>
        </section>
      ) : <section className="rounded-[20px] border border-emerald-200 bg-emerald-50/70 p-5"><p className="text-sm font-semibold text-emerald-700">You're all caught up</p><p className="mt-1 text-sm leading-6 text-[#52657b]">There are no documents we need from you right now.</p></section>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
        <section className="min-w-0 rounded-[24px] border border-[#dbe5ef] bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <nav className="flex gap-2 overflow-x-auto rounded-[16px] bg-[#f3f6fa] p-1.5" aria-label="Document categories">
            {visibleCategories.map((category) => <button key={category.key} type="button" onClick={() => selectCategory(category.key)} className={`min-h-[40px] shrink-0 rounded-[12px] px-3.5 text-sm font-semibold transition ${activeCategory?.key === category.key ? 'border border-[#d4e2ef] bg-white text-[#142132] shadow-[0_8px_18px_rgba(15,23,42,0.07)]' : 'text-[#6a7c92] hover:bg-white'}`}>{category.shortLabel} <span className="ml-1 text-xs">{category.counts.total}</span></button>)}
          </nav>
          <div className="mt-4 overflow-hidden rounded-[18px] border border-[#e4ebf3] bg-[#fbfdff]">
            {(activeCategory?.items || []).map((item) => (
              <button key={item.id} type="button" data-document-status={item.presentationStatus} onClick={() => setSelectedDocumentId(item.id)} className={`grid w-full gap-3 border-b border-[#e4ebf3] p-4 text-left transition last:border-b-0 md:grid-cols-[minmax(0,1fr)_130px] md:items-center ${selectedDocument?.id === item.id ? 'bg-white' : 'hover:bg-white'}`}>
                <span className="flex min-w-0 items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border ${STATUS_STYLES[item.presentationStatus]}`}><DocumentStatusIcon status={item.presentationStatus} /></span><span className="min-w-0"><span className="block text-sm font-semibold text-[#142132]">{item.title}</span><span className="mt-1 block text-sm leading-5 text-[#52657b]">{item.description}</span></span></span>
                <span className={`w-fit rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${STATUS_STYLES[item.presentationStatus]}`}>{item.presentationStatusLabel}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] xl:sticky xl:top-6 xl:self-start">
          {selectedDocument ? <>
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-[-0.04em] text-[#142132]">{selectedDocument.title}</h2><span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[selectedDocument.presentationStatus]}`}>{selectedDocument.presentationStatusLabel}</span></div><span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] border border-[#dbe5ef] text-[#52657b]"><DocumentStatusIcon status={selectedDocument.presentationStatus} /></span></div>
            <p className="mt-4 text-sm leading-6 text-[#52657b]">{selectedDocument.description}</p>
            <section className="mt-5 rounded-[16px] border p-4" style={{ borderColor: buyerPortalHexToRgba(theme.primary, 0.16), backgroundColor: buyerPortalHexToRgba(theme.primary, 0.045) }}><h3 className="text-sm font-semibold text-[#142132]">Why is this needed?</h3><p className="mt-2 text-sm leading-6 text-[#52657b]">{selectedDocument.education || selectedDocument.whatIsThis || 'This document supports compliance, legal, finance, or transfer progression for your purchase.'}</p></section>
            <div className="mt-5 grid gap-3">
              <UploadAction item={selectedDocument} uploadingDocumentKey={uploadingDocumentKey} onUpload={onUpload} label={selectedDocument.presentationStatus === 'action' ? 'Upload document' : 'Replace document'} className="min-h-11 rounded-[12px] !border-[#111827] !bg-[#111827] px-4 !text-white hover:!bg-black" />
              {canOpen ? <button type="button" disabled={openingDocumentPath === openKey} onClick={() => onOpenDocument(selectedDocument.linkedDocument)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#142132] disabled:opacity-60"><FileText size={15} />{openingDocumentPath === openKey ? 'Opening...' : 'View document'}</button> : null}
            </div>
          </> : <p className="text-sm leading-6 text-[#52657b]">Select a document to see its details.</p>}
        </aside>
      </div>
    </section>
  )
}
