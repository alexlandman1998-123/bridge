import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  createDevelopmentDocumentRequirement,
  deleteDevelopmentDocumentRequirement,
  fetchDevelopmentDocumentRequirements,
} from '../lib/api'

function DevelopmentDocumentsSetup({ developmentId, items, onItemsChange }) {
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    const rows = await fetchDevelopmentDocumentRequirements(developmentId)
    onItemsChange(rows)
  }

  async function handleAdd(event) {
    event.preventDefault()
    if (!label.trim()) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await createDevelopmentDocumentRequirement({
        developmentId,
        label: label.trim(),
      })
      setLabel('')
      await refresh()
      window.dispatchEvent(new Event('itg:document-requirements-changed'))
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    try {
      setSaving(true)
      setError('')
      await deleteDevelopmentDocumentRequirement(id)
      await refresh()
      window.dispatchEvent(new Event('itg:document-requirements-changed'))
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel development-doc-setup no-print">
      <div className="section-header">
        <div className="section-header-copy">
          <h3>Supporting Documentation Setup</h3>
          <p>Configure required development-specific documents for checklist tracking.</p>
        </div>
      </div>

      {error ? <p className="status-message error">{error}</p> : null}

      <ul className="doc-setup-list">
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.label}</strong>
              <span>Key: {item.category_key}</span>
            </div>

            <button type="button" className="ghost-button danger-ghost" onClick={() => handleDelete(item.id)} disabled={saving}>
              <Trash2 size={14} />
              Remove
            </button>
          </li>
        ))}

        {!items.length ? <li className="empty-text">No development-specific requirements configured yet.</li> : null}
      </ul>

      <form onSubmit={handleAdd} className="doc-setup-form">
        <input
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Add required document (e.g. Conduct Rules)"
        />
        <button type="submit" disabled={saving || !label.trim()}>
          <Plus size={14} />
          Add Document Type
        </button>
      </form>
    </section>
  )
}

export default DevelopmentDocumentsSetup
