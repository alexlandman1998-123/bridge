import { useState } from 'react'
import { ALTERATION_REQUEST_STATUSES, updateAlterationRequestStatus } from '../lib/api'

const currencyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const initialCreationForm = {
  title: '',
  description: '',
  category: '',
  amount: '',
  invoiceFile: null,
  proofFile: null,
}

function AlterationRequestsPanel({
  requests = [],
  onUpdated,
  saving,
  embedded = false,
  showHeader = true,
  onCreate = null,
  creating = false,
  createDisabled = false,
  creationError = '',
  totalAmount = 0,
}) {
  const [error, setError] = useState('')
  const [formState, setFormState] = useState(initialCreationForm)
  const [localCreationError, setLocalCreationError] = useState('')
  const Wrapper = embedded ? 'div' : 'section'

  async function handleStatusChange(requestId, status) {
    try {
      setError('')
      await updateAlterationRequestStatus(requestId, status)
      if (onUpdated) {
        await onUpdated()
      }
    } catch (statusError) {
      setError(statusError.message)
    }
  }

  async function handleCreate(event) {
    event.preventDefault()
    if (!onCreate || createDisabled) {
      return
    }

    if (!formState.title.trim() || !formState.description.trim()) {
      setLocalCreationError('Title and description are required.')
      return
    }

    try {
      setLocalCreationError('')
      await onCreate({
        title: formState.title.trim(),
        description: formState.description.trim(),
        category: formState.category.trim(),
        amountIncVat: Number(formState.amount) || 0,
        invoiceFile: formState.invoiceFile,
        proofFile: formState.proofFile,
      })
      setFormState(initialCreationForm)
      if (onUpdated) {
        await onUpdated()
      }
    } catch (createError) {
      setLocalCreationError(createError?.message || 'Unable to add alteration.')
    }
  }

  return (
    <Wrapper className={embedded ? 'request-panel-embedded' : 'panel-section'}>
      {showHeader ? (
        <div className="section-header">
          <div className="section-header-copy">
            <h3>Alteration Requests</h3>
            <p className="leading-6 text-[#6b7d93]">
              Log post-registration alterations, capture costs, and upload supporting invoices or proof of payment.
            </p>
          </div>
        </div>
      ) : null}

      {onCreate ? (
        <form className="request-add-form space-y-4" onSubmit={handleCreate}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-[#142132]">
              Title
              <input
                type="text"
                value={formState.title}
                onChange={(event) => setFormState((previous) => ({ ...previous, title: event.target.value }))}
                placeholder="Describe the alteration"
                required
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[#142132]">
              Category
              <input
                type="text"
                value={formState.category}
                onChange={(event) => setFormState((previous) => ({ ...previous, category: event.target.value }))}
                placeholder="Optional category"
              />
            </label>
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-semibold text-[#142132]">
              Description
              <textarea
                rows={2}
                value={formState.description}
                onChange={(event) => setFormState((previous) => ({ ...previous, description: event.target.value }))}
                placeholder="What needs to be done?"
                required
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-[#142132]">
                Amount (inc VAT)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formState.amount}
                  onChange={(event) => setFormState((previous) => ({ ...previous, amount: event.target.value }))}
                  placeholder="0.00"
                />
              </label>
              <div className="grid gap-1 text-sm font-semibold text-[#142132]">
                Invoice
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(event) =>
                    setFormState((previous) => ({ ...previous, invoiceFile: event.target.files?.[0] || null }))
                  }
                />
              </div>
              <div className="grid gap-1 text-sm font-semibold text-[#142132]">
                Proof of payment
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(event) =>
                    setFormState((previous) => ({ ...previous, proofFile: event.target.files?.[0] || null }))
                  }
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-sm text-[#35546c]">
              Total recorded amount (incl. VAT): <strong>{currencyFormatter.format(totalAmount)}</strong>
            </div>
            <div className="flex flex-col gap-2">
              {(creationError || localCreationError) ? (
                <span className="text-xs text-[#b42318]">{localCreationError || creationError}</span>
              ) : null}
              <button
                type="submit"
                disabled={createDisabled || creating || saving}
                className="inline-flex items-center justify-center rounded-[14px] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.25)] transition duration-150 ease-out disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {creating ? 'Adding …' : createDisabled ? 'Save transaction first' : 'Add alteration'}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {error ? <p className="status-message error">{error}</p> : null}

      <hr className="my-4 border-dashed border-[#dfe6f1]" />

      <ul className="request-list">
        {requests.map((request) => (
          <li key={request.id} className="request-row">
            <div className="request-main space-y-2">
              <div className="flex items-center justify-between gap-3">
                <strong>{request.title}</strong>
                <span className="text-xs uppercase tracking-[0.08em] text-[#94a7bd]">{request.status}</span>
              </div>
              <p className="text-sm text-[#4f647a]">{request.description}</p>
              <p className="text-xs text-[#7c8ea4]">
                {request.category || 'General'} • {request.budget_range || 'Budget not specified'} •{' '}
                {request.preferred_timing || 'Timing not specified'}
              </p>
              <p className="text-sm text-[#142132]">
                Amount (incl. VAT): <strong>{currencyFormatter.format(Number(request.amount_inc_vat || 0))}</strong>
              </p>
              <div className="flex flex-wrap gap-3 text-sm text-[#35546c]">
                {request.invoice_url ? (
                  <a href={request.invoice_url} target="_blank" rel="noreferrer" className="inline-link">
                    Invoice
                  </a>
                ) : null}
                {request.proof_url ? (
                  <a href={request.proof_url} target="_blank" rel="noreferrer" className="inline-link">
                    Proof of payment
                  </a>
                ) : null}
                {request.reference_image_url ? (
                  <a href={request.reference_image_url} target="_blank" rel="noreferrer" className="inline-link">
                    Reference image
                  </a>
                ) : null}
              </div>
            </div>

            <label className="request-status">
              Status
              <select
                value={request.status}
                onChange={(event) => void handleStatusChange(request.id, event.target.value)}
                disabled={saving}
              >
                {ALTERATION_REQUEST_STATUSES.map((status) => (
                  <option value={status} key={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}

        {!requests.length ? <li className="empty-text">No alteration requests submitted yet.</li> : null}
      </ul>
    </Wrapper>
  )
}

export default AlterationRequestsPanel
