import { Mail, Send, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import Button from './ui/Button'
import Field from './ui/Field'
import Modal from './ui/Modal'
import SectionHeader from './ui/SectionHeader'

function defaultFormatLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function DevelopmentDocumentLibrary({
  documents = [],
  title = 'Document Library',
  description = 'Shared development-level documents and assets.',
  emptyTitle = 'No development documents uploaded yet.',
  emptyActionLabel = '',
  onEmptyAction = null,
  documentTypeOptions = [],
  formatDocumentTypeLabel = defaultFormatLabel,
  onEditDocument = null,
  canEdit = false,
  onDeleteDocument = null,
  documentSaving = false,
}) {
  const [documentTypeFilter, setDocumentTypeFilter] = useState('all')
  const [activeDocument, setActiveDocument] = useState(null)
  const [shareEmail, setShareEmail] = useState('')

  const scopedDocuments = useMemo(
    () =>
      documentTypeFilter === 'all'
        ? documents
        : documents.filter((item) => String(item.documentType || '').toLowerCase() === documentTypeFilter),
    [documentTypeFilter, documents],
  )

  function handleSendDocument() {
    if (!activeDocument) return
    const recipient = shareEmail.trim()
    const subject = encodeURIComponent(activeDocument.title || 'Development document')
    const body = encodeURIComponent(
      `Please find the document below:\n\n${activeDocument.title}${activeDocument.fileUrl ? `\n${activeDocument.fileUrl}` : ''}`,
    )
    window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${subject}&body=${body}`
  }

  return (
    <>
      <section className="panel development-documents-browser-card">
        <SectionHeader
          title={title}
          copy={description}
          actions={
            <div className="development-inline-filters">
              <Field as="select" value={documentTypeFilter} onChange={(event) => setDocumentTypeFilter(event.target.value)}>
                <option value="all">All groups</option>
                {documentTypeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Field>
            </div>
          }
        />

        {documents.length ? (
          <div className="development-document-card-scroll">
            <div className="development-document-card-grid">
              {scopedDocuments.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="development-document-card"
                  onClick={() => {
                    setActiveDocument(item)
                    setShareEmail('')
                  }}
                >
                  <div className="development-document-card-top">
                    <span className="meta-chip">{formatDocumentTypeLabel(item.documentType)}</span>
                    {item.linkedUnitType ? <small>{formatDocumentTypeLabel(item.linkedUnitType)}</small> : null}
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.description || 'No description added.'}</p>
                  <div className="development-document-card-meta">
                    <small>{item.fileUrl || 'No file reference added'}</small>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="development-empty-state">
            <p>{emptyTitle}</p>
            {emptyActionLabel && onEmptyAction ? (
              <div>
                <Button onClick={onEmptyAction}>
                  {emptyActionLabel}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {activeDocument ? (
        <Modal
          open={Boolean(activeDocument)}
          onClose={() => setActiveDocument(null)}
          title={activeDocument.title}
          subtitle={activeDocument.description || 'Development asset'}
          className="development-document-modal"
        >
            <div className="development-document-modal-meta">
              <article>
                <span>Document Type</span>
                <strong>{formatDocumentTypeLabel(activeDocument.documentType)}</strong>
              </article>
              <article>
                <span>Linked Scope</span>
                <strong>{activeDocument.linkedUnitType ? formatDocumentTypeLabel(activeDocument.linkedUnitType) : 'Development Wide'}</strong>
              </article>
            </div>

            <label className="full-width">
              Document Reference
              <Field value={activeDocument.fileUrl || ''} readOnly />
            </label>

            <div className="development-document-modal-actions">
              {activeDocument.fileUrl ? (
                <a className="ui-button-primary" href={activeDocument.fileUrl} target="_blank" rel="noreferrer">
                  Download / Open
                </a>
              ) : null}
              {canEdit && onEditDocument ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    onEditDocument(activeDocument)
                    setActiveDocument(null)
                  }}
                >
                  Edit Document
                </Button>
              ) : null}
              {canEdit && onDeleteDocument ? (
                <Button
                  variant="ghost"
                  className="danger"
                  onClick={() => {
                    void onDeleteDocument(activeDocument.id)
                    setActiveDocument(null)
                  }}
                  disabled={documentSaving}
                >
                  Remove
                </Button>
              ) : null}
            </div>

            <section className="development-document-modal-send">
              <SectionHeader title="Send Document" copy="Draft an email with this asset attached as a link or reference." />
              <div className="development-document-modal-send-row">
                <div className="input-with-icon">
                  <Mail size={15} />
                  <Field
                    type="email"
                    value={shareEmail}
                    onChange={(event) => setShareEmail(event.target.value)}
                    placeholder="recipient@email.com"
                  />
                </div>
                <Button variant="ghost" onClick={handleSendDocument} disabled={!shareEmail.trim()}>
                  <Send size={15} />
                  Send
                </Button>
              </div>
            </section>
        </Modal>
      ) : null}
    </>
  )
}

export default DevelopmentDocumentLibrary
