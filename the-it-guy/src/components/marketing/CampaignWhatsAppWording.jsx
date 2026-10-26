import { useState } from 'react'
export default function CampaignWhatsAppWording({
  suggestion,
  fields = [],
  disabled,
  onUse,
}) {
  const [notice, setNotice] = useState('')
  if (!suggestion || typeof suggestion.wording !== 'string') return null
  return (
    <aside className="wa-info-panel" aria-label="Campaign wording">
      <h2>Wording from your campaign</h2>
      <p>
        Choose an approved template. Use this wording in a suitable body field,
        then review the final message preview.
      </p>
      <label className="wa-field-label">
        <span>Suggested WhatsApp wording</span>
        <textarea readOnly rows={5} value={suggestion.wording} />
      </label>
      <div className="wa-inline-actions">
        <button
          className="wa-secondary-button"
          disabled={disabled}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(suggestion.wording)
              setNotice('Wording copied.')
            } catch {
              setNotice(
                'Select the wording above and copy it using your keyboard.',
              )
            }
          }}
        >
          Copy wording
        </button>
        {fields
          .filter((field) => field.kind === 'text' && field.section === 'body')
          .map((field) => (
            <button
              className="wa-secondary-button"
              key={field.key}
              disabled={disabled || suggestion.wording.length > 1024}
              onClick={() => onUse(field.key, suggestion.wording)}
            >
              Use wording in {field.label}
            </button>
          ))}
      </div>
      {suggestion.wording.length > 1024 && (
        <p>
          Shorten the wording in your campaign before using it in a template
          field. WhatsApp allows up to 1,024 characters per body field.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </aside>
  )
}
