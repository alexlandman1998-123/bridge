import {
  DOCUMENT_REQUEST_ACCESS_OPTIONS,
  toggleDocumentAccessSelection,
} from '../../services/documents/documentRequestAccessForm'

export default function DocumentAccessSelectionGrid({ selections = [], onChange }) {
  const selected = Array.isArray(selections) ? selections : []
  return (
    <fieldset className="grid gap-2">
      <legend className="text-label font-semibold uppercase text-textMuted">Can view/download uploaded file</legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex min-h-[42px] items-center gap-2 rounded-control border border-borderSoft bg-surface px-3 py-2 text-sm font-medium text-textStrong">
          <input type="checkbox" checked readOnly disabled className="h-4 w-4 accent-[#244966]" />
          Requester
        </label>
        {DOCUMENT_REQUEST_ACCESS_OPTIONS.map((option) => (
          <label key={option.value} className="flex min-h-[42px] items-center gap-2 rounded-control border border-borderSoft bg-surface px-3 py-2 text-sm font-medium text-textStrong">
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => onChange?.(toggleDocumentAccessSelection(selected, option.value))}
              className="h-4 w-4 accent-[#244966]"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
