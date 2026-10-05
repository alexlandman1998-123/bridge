import Field from '../../ui/Field'

export default function AttorneyDocumentRequestForm({ formId, form, onChange, onSubmit, requirementOptions = [], requestedFromOptions = [], visibilityOptions = [], disabled = false, error = '' }) {
  const selected = requirementOptions.find(option => option.id === form.canonicalRequirementInstanceId)
  function chooseRequirement(id) {
    const option = requirementOptions.find(item => item.id === id)
    onChange({ ...form, canonicalRequirementInstanceId: id,
      ...(option ? { title: option.title, requestedFrom: option.requestedFrom } : {}),
    })
  }
  return (
    <form id={formId} onSubmit={onSubmit}>
      {error ? <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
      <fieldset disabled={disabled} className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-semibold text-textStrong">
          Checklist requirement
          <Field as="select" value={form.canonicalRequirementInstanceId || ''} onChange={event => chooseRequirement(event.target.value)}>
            <option value="">Additional document</option>
            {form.canonicalRequirementInstanceId && !selected ? <option value={form.canonicalRequirementInstanceId}>Selected task requirement</option> : null}
            {requirementOptions.map(option => <option key={option.id} value={option.id} disabled={option.disabled}>{option.label}{option.unavailableReason ? ` · ${option.unavailableReason}` : ''}</option>)}
          </Field>
        </label>
        <p className="-mt-2 text-xs leading-5 text-textMuted">{form.canonicalRequirementInstanceId ? 'The upload and review will update this exact checklist requirement. The recipient follows its responsible party.' : 'Use an additional request for supporting evidence. Its approval completes the request without completing a checklist requirement.'}</p>
        <label className="grid gap-1.5 text-sm font-semibold text-textStrong">
          Document requested
          <Field required value={form.title} onChange={event => onChange({ ...form, title: event.target.value })} placeholder="e.g. Rates clearance certificate" autoFocus />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold text-textStrong">
            Requested from
            <Field as="select" value={form.requestedFrom} disabled={Boolean(form.canonicalRequirementInstanceId)} onChange={event => onChange({ ...form, requestedFrom: event.target.value })}>
              {requestedFromOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Field>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-textStrong">
            Visibility
            <Field as="select" value={form.visibility} onChange={event => onChange({ ...form, visibility: event.target.value })}>
              {visibilityOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Field>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-textStrong">
            Priority
            <Field as="select" value={form.priority} onChange={event => onChange({ ...form, priority: event.target.value })}>
              <option value="normal">Normal</option><option value="urgent">Urgent</option>
            </Field>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-textStrong">
            Due date (optional)
            <Field type="date" value={form.dueDate} onChange={event => onChange({ ...form, dueDate: event.target.value })} />
          </label>
        </div>
        <label className="grid gap-1.5 text-sm font-semibold text-textStrong">
          Instructions for the recipient
          <Field as="textarea" rows={3} value={form.notes} onChange={event => onChange({ ...form, notes: event.target.value })} placeholder="Explain what is needed and any certification or signing requirements." />
        </label>
        <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-textMuted">{form.visibility === 'client_visible' ? 'The selected client can see this request and its instructions in their portal. Saving the request does not confirm email delivery.' : form.visibility === 'internal_only' ? 'This request is for internal matter users. It is not shown in the client portal.' : 'This request is shared with authorised professional role players. It is not shown in the client portal.'}</p>
      </fieldset>
    </form>
  )
}
