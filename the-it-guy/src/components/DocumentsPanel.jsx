import { CheckCircle2, Circle, Download, FileUp } from 'lucide-react'
import { useState } from 'react'
import Button from './ui/Button'
import Field from './ui/Field'

function isTemplateDocument(name = '') {
  return /(template|blank|draft|unsigned)/i.test(String(name))
}

function isSignedDocument(name = '') {
  return /(signed|executed|final)/i.test(String(name))
}

function isLegalFinanceDocument(document = {}) {
  const haystack = `${document.category || ''} ${document.name || ''}`.toLowerCase()
  return /(bond|finance|attorney|transfer|fica|guarantee|legal)/i.test(haystack)
}

function latestByCreatedAt(list = []) {
  return [...list].sort((left, right) => {
    const leftDate = new Date(left.created_at || 0).getTime()
    const rightDate = new Date(right.created_at || 0).getTime()
    return rightDate - leftDate
  })[0]
}

function resolveDocumentPair(documents, categoryLabel) {
  const normalized = String(categoryLabel || '').toLowerCase()
  const matching = (documents || []).filter((item) =>
    String(item.category || 'general').trim().toLowerCase().includes(normalized),
  )

  const template = latestByCreatedAt(matching.filter((item) => isTemplateDocument(item.name)))
  const signed = latestByCreatedAt(matching.filter((item) => isSignedDocument(item.name)))
  const latest = latestByCreatedAt(matching)

  return { template, signed, latest }
}

function getRequirementLevelMeta(level = 'required') {
  const normalized = String(level || 'required').trim().toLowerCase()

  if (normalized === 'optional_required') {
    return {
      label: 'Recommended',
      helper: 'Helpful for faster finance review, but not a hard blocker.',
      tone: 'optional',
    }
  }

  return {
    label: 'Required',
    helper: 'Needed before this requirement is treated as complete.',
    tone: 'required',
  }
}

function DocumentsPanel({
  checklist,
  documents,
  onSubmit,
  saving,
  canUpload,
  documentCategory,
  setDocumentCategory,
  markClientVisible,
  clientVisibleByDefault,
  setClientVisibleByDefault,
  onToggleClientVisibility,
}) {
  const [documentView, setDocumentView] = useState('repository')
  const [vaultFilter, setVaultFilter] = useState('all')
  const completeCount = checklist.filter((item) => item.complete).length
  const missingItems = checklist.filter((item) => !item.complete)
  const completionPercent = checklist.length ? Math.round((completeCount / checklist.length) * 100) : 0
  const signedDocuments = documents.filter((document) => isSignedDocument(document.name))
  const templateDocuments = documents.filter((document) => isTemplateDocument(document.name))
  const clientDocuments = documents.filter((document) => String(document.uploaded_by_role || '').toLowerCase() === 'client')
  const legalFinanceDocuments = documents.filter((document) => isLegalFinanceDocument(document))

  const vaultFilters = [
    { id: 'all', label: 'All Documents', count: documents.length },
    { id: 'missing', label: 'Missing Required', count: missingItems.length },
    { id: 'signed', label: 'Signed / Final', count: signedDocuments.length },
    { id: 'templates', label: 'Templates', count: templateDocuments.length },
    { id: 'client', label: 'Client Uploads', count: clientDocuments.length },
    { id: 'legal_finance', label: 'Legal & Finance', count: legalFinanceDocuments.length },
  ]

  const filteredDocuments =
    vaultFilter === 'all'
      ? documents
      : vaultFilter === 'signed'
        ? signedDocuments
        : vaultFilter === 'templates'
          ? templateDocuments
          : vaultFilter === 'client'
            ? clientDocuments
            : vaultFilter === 'legal_finance'
              ? legalFinanceDocuments
              : documents.filter((document) =>
                  missingItems.some((item) =>
                    String(document.category || '')
                      .toLowerCase()
                      .includes(String(item.label || '').toLowerCase()),
                  ),
                )

  return (
    <section className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Shared Documents</h3>
          <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Manage the transaction vault, track required items, and upload new files in one workspace.</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.76rem] font-semibold text-[#66758b]">
          {checklist.length ? `${completeCount}/${checklist.length} complete` : 'No requirements'}
        </span>
      </div>

      <div className="mt-5 inline-flex rounded-[16px] border border-[#dde4ee] bg-[#f7f9fc] p-1" role="tablist" aria-label="Document workspace view">
        {[
          { id: 'repository', label: 'Repository', count: documents.length },
          { id: 'checklist', label: 'Required Checklist', count: checklist.length },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={documentView === tab.id}
            className={[
              'inline-flex items-center gap-2 rounded-[12px] px-4 py-2 text-sm font-semibold transition duration-150 ease-out',
              documentView === tab.id ? 'bg-[#35546c] text-white shadow-[0_8px_20px_rgba(15,23,42,0.08)]' : 'text-[#4f647a] hover:bg-white',
            ].join(' ')}
            onClick={() => setDocumentView(tab.id)}
          >
            <span>{tab.label}</span>
            <em className={`text-[0.72rem] not-italic ${documentView === tab.id ? 'text-white/80' : 'text-[#8aa0b8]'}`}>{tab.count}</em>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[#142132]">Checklist Completion</h4>
            <span className="text-sm font-semibold text-[#4f647a]">{completionPercent}%</span>
          </div>

          <div className="mt-3 h-2 rounded-full bg-[#e6eef7]" aria-hidden>
            <div className="h-2 rounded-full bg-[#4f7ea8]" style={{ width: `${completionPercent}%` }} />
          </div>

          {documentView === 'checklist' ? (
            <ul className="mt-4 space-y-3">
              {checklist.map((item) => {
                const pair = resolveDocumentPair(documents, item.label)
                const latestSigned = pair.signed || (item.complete ? item.matchedDocument : null)
                const template = pair.template
                const requirementMeta = getRequirementLevelMeta(item.requirementLevel)

                return (
                  <li key={item.key} className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${item.complete ? 'bg-[#edf5fb] text-[#4f7ea8]' : 'bg-[#f5f8fb] text-[#8aa0b8]'}`}>
                            {item.complete ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                          </span>
                          <strong className="text-sm font-semibold text-[#142132]">{item.label}</strong>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] ${requirementMeta.tone === 'optional' ? 'bg-[#fff7ed] text-[#b54708]' : 'bg-[#edf5fb] text-[#4f7ea8]'}`}>
                            {requirementMeta.label}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[#7c8ea4]">{requirementMeta.helper}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${item.complete ? 'bg-[#edfdf3] text-[#1c7d45]' : 'bg-[#fff7ed] text-[#b54708]'}`}>
                        {item.complete ? 'Uploaded' : 'Missing'}
                      </span>
                    </div>

                    {(latestSigned?.url || template?.url) ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {latestSigned?.url ? (
                          <a
                            href={latestSigned.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-[12px] border border-[#dde4ee] bg-white px-3 py-2 text-sm font-semibold text-[#35546c] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-[#f8fafc]"
                            download={latestSigned.name || `${item.label}.pdf`}
                          >
                            <Download size={13} />
                            Download Latest Signed
                          </a>
                        ) : null}
                        {template?.url ? (
                          <a
                            href={template.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-[12px] border border-[#dde4ee] bg-white px-3 py-2 text-sm font-semibold text-[#35546c] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-[#f8fafc]"
                            download={template.name || `${item.label}-template.pdf`}
                          >
                            <Download size={13} />
                            Download Template
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                )
              })}
              {!checklist.length ? (
                <li className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                  No checklist requirements configured.
                </li>
              ) : null}
            </ul>
          ) : (
            <div className="mt-4 rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
              Switch to checklist view to see outstanding document requirements.
            </div>
          )}
        </section>

        <div className="grid gap-4">
          <section className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-5 no-print">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-[#142132]">Outstanding Next</h4>
              <span className="text-sm font-semibold text-[#4f647a]">{missingItems.length} missing</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {missingItems.slice(0, 6).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="inline-flex min-h-[38px] items-center justify-center rounded-[12px] border border-[#dde4ee] bg-white px-3 py-2 text-sm font-semibold text-[#35546c] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-[#f8fafc]"
                  onClick={() => setDocumentCategory(item.label)}
                >
                  {item.label}
                </button>
              ))}
              {!missingItems.length ? <p className="text-sm text-[#6b7d93]">All required documents are currently uploaded.</p> : null}
            </div>
          </section>

          <section className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-[#142132]">Document Vault</h4>
                <p className="mt-1 text-sm text-[#6b7d93]">{vaultFilters.find((item) => item.id === vaultFilter)?.label || 'All Documents'}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 no-print">
              {vaultFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  role="tab"
                  aria-selected={vaultFilter === filter.id}
                  className={[
                    'rounded-[16px] border px-4 py-3 text-left transition duration-150 ease-out',
                    vaultFilter === filter.id ? 'border-[#cfe1f7] bg-white shadow-[0_8px_20px_rgba(15,23,42,0.05)]' : 'border-transparent bg-white/60 hover:border-[#dde4ee]',
                  ].join(' ')}
                  onClick={() => setVaultFilter(filter.id)}
                >
                  <strong className="block text-sm font-semibold text-[#142132]">{filter.label}</strong>
                  <span className="mt-1 block text-xs text-[#7c8ea4]">{filter.count} {filter.count === 1 ? 'document' : 'documents'}</span>
                </button>
              ))}
            </div>

            {documentView === 'repository' ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {filteredDocuments.map((document) => (
                  <article key={document.id} className="flex min-w-0 items-start justify-between gap-3 rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-4">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm font-semibold text-[#142132]">{document.name}</strong>
                      <p className="mt-1 text-xs text-[#7c8ea4]">{document.category || 'General'}</p>
                      <span className="mt-1 block text-xs text-[#8aa0b8]">{new Date(document.created_at).toLocaleDateString()}</span>
                      {document.uploaded_by_role || document.uploaded_by_email ? (
                        <span className="mt-1 block text-xs text-[#8aa0b8]">
                          {document.uploaded_by_role ? document.uploaded_by_role.replace('_', ' ') : 'external'} • {document.uploaded_by_email || 'email hidden'}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {markClientVisible ? (
                        <button
                          type="button"
                          className={`inline-flex min-h-[34px] items-center justify-center rounded-[12px] border px-3 py-1.5 text-xs font-semibold transition duration-150 ease-out ${document.is_client_visible ? 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]' : 'border-[#f2d1d1] bg-[#fff7f7] text-[#b42318]'}`}
                          onClick={() => onToggleClientVisibility(document.id, !document.is_client_visible)}
                          disabled={saving}
                        >
                          {document.is_client_visible ? 'Client Visible' : 'Internal Only'}
                        </button>
                      ) : null}
                      {document.url ? (
                        <a
                          href={document.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-[#dde4ee] bg-white text-[#35546c] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-[#f8fafc]"
                          aria-label="Download"
                        >
                          <Download size={15} />
                        </a>
                      ) : null}
                    </div>
                  </article>
                ))}

                {filteredDocuments.length === 0 ? (
                  <div className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                    No documents in this vault section yet.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                Switch to repository view to review and manage uploaded files.
              </div>
            )}
          </section>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-5 grid gap-4 rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-5 no-print xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)_auto]">
        <label className="grid gap-2 text-sm font-medium text-[#35546c]">
          <span>File</span>
          <span className="inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#cfd9e5] bg-white px-4 py-3 text-sm font-semibold text-[#35546c] transition duration-150 ease-out hover:border-[#bfd3ea] hover:bg-[#f8fafc]">
            <FileUp size={14} />
            Choose file
            <input type="file" name="file" className="hidden" />
          </span>
        </label>

        <label className="grid gap-2 text-sm font-medium text-[#35546c]">
          <span>Document category</span>
          <Field
            type="text"
            list="document-category-suggestions"
            placeholder="Document category (OTP, FICA, Transfer...)"
            value={documentCategory}
            onChange={(event) => setDocumentCategory(event.target.value)}
          />
          <datalist id="document-category-suggestions">
            {[...new Set(['General', ...checklist.map((item) => item.label)])].map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
        </label>

        <div className="flex flex-col justify-end gap-3">
          {markClientVisible ? (
            <label className="inline-flex items-center gap-2 text-sm font-medium text-[#35546c]">
              <input
                type="checkbox"
                checked={clientVisibleByDefault}
                onChange={(event) => setClientVisibleByDefault(event.target.checked)}
                className="h-4 w-4 rounded border-[#cfd9e5]"
              />
              <span>Mark as client visible</span>
            </label>
          ) : null}
          <Button type="submit" disabled={saving || !canUpload}>
            Upload
          </Button>
        </div>

        {!canUpload ? (
          <div className="xl:col-span-3 rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-4 text-sm text-[#6b7d93]">
            Create a transaction first to upload documents.
          </div>
        ) : null}
      </form>
    </section>
  )
}

export default DocumentsPanel
