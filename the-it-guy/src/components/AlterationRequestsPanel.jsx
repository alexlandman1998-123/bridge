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

function formatStatusLabel(status) {
  return String(status || 'pending')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function getStatusPillClass(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'approved' || normalized === 'completed' || normalized === 'paid') {
    return 'border-[#b8dfc7] bg-[#effaf3] text-[#22824d]'
  }
  if (normalized === 'declined' || normalized === 'rejected' || normalized === 'cancelled') {
    return 'border-[#f1cbc7] bg-[#fff5f4] text-[#b42318]'
  }
  if (normalized === 'in_progress' || normalized === 'review') {
    return 'border-[#d8e7f6] bg-[#f6fbff] text-[#35546c]'
  }
  return 'border-[#dde7f1] bg-[#fbfdff] text-[#64748b]'
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
    <Wrapper className={embedded ? 'space-y-5' : 'space-y-5'}>
      {showHeader ? (
        <div className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
          <h3 className="text-[1.15rem] font-semibold tracking-[-0.03em] text-[#142132]">Alteration Requests</h3>
          <p className="mt-2 text-sm leading-6 text-[#6b7d93]">
              Log post-registration alterations, capture costs, and upload supporting invoices or proof of payment.
          </p>
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ['Total requests', requests.length],
          ['Total amount (incl. VAT)', currencyFormatter.format(Number(totalAmount) || 0)],
          ['Awaiting action', requests.filter((item) => !['approved', 'completed', 'paid', 'declined', 'rejected', 'cancelled'].includes(String(item?.status || '').toLowerCase())).length],
        ].map(([label, value]) => (
          <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
            <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{label}</span>
            <strong className="mt-2 block text-sm font-semibold text-[#142132]">{value}</strong>
          </article>
        ))}
      </section>

      {onCreate ? (
        <form className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]" onSubmit={handleCreate}>
          <div className="mb-5">
            <h4 className="text-base font-semibold text-[#142132]">New alteration request</h4>
            <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
              Capture the requested change, supporting files, and expected budget in one structured record.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-[#35546c]">
              <span>Title</span>
              <input
                type="text"
                value={formState.title}
                onChange={(event) => setFormState((previous) => ({ ...previous, title: event.target.value }))}
                placeholder="Describe the alteration"
                required
                className="w-full rounded-[14px] border border-[#dbe5ef] bg-white px-3.5 py-2.5 text-sm text-[#142132] outline-none transition focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-[#35546c]">
              <span>Category</span>
              <input
                type="text"
                value={formState.category}
                onChange={(event) => setFormState((previous) => ({ ...previous, category: event.target.value }))}
                placeholder="Optional category"
                className="w-full rounded-[14px] border border-[#dbe5ef] bg-white px-3.5 py-2.5 text-sm text-[#142132] outline-none transition focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-[#35546c]">
              <span>Description</span>
              <textarea
                rows={3}
                value={formState.description}
                onChange={(event) => setFormState((previous) => ({ ...previous, description: event.target.value }))}
                placeholder="What needs to be done?"
                required
                className="w-full rounded-[14px] border border-[#dbe5ef] bg-white px-3.5 py-2.5 text-sm leading-6 text-[#142132] outline-none transition focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                <span>Amount (incl. VAT)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formState.amount}
                  onChange={(event) => setFormState((previous) => ({ ...previous, amount: event.target.value }))}
                  placeholder="0.00"
                  className="w-full rounded-[14px] border border-[#dbe5ef] bg-white px-3.5 py-2.5 text-sm text-[#142132] outline-none transition focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                <span>Invoice</span>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(event) =>
                    setFormState((previous) => ({ ...previous, invoiceFile: event.target.files?.[0] || null }))
                  }
                  className="w-full rounded-[14px] border border-[#dbe5ef] bg-white px-3 py-2 text-sm text-[#4f647a]"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                <span>Proof of payment</span>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(event) =>
                    setFormState((previous) => ({ ...previous, proofFile: event.target.files?.[0] || null }))
                  }
                  className="w-full rounded-[14px] border border-[#dbe5ef] bg-white px-3 py-2 text-sm text-[#4f647a]"
                />
              </label>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-start justify-between gap-3 border-t border-[#e6edf5] pt-4">
            <p className="text-sm text-[#35546c]">
              Total recorded amount (incl. VAT): <strong>{currencyFormatter.format(totalAmount)}</strong>
            </p>
            <div className="flex flex-col items-end gap-2">
              {(creationError || localCreationError) ? (
                <span className="text-xs text-[#b42318]">{localCreationError || creationError}</span>
              ) : null}
              <button
                type="submit"
                disabled={createDisabled || creating || saving}
                className="inline-flex min-h-[40px] items-center justify-center rounded-[14px] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white transition duration-150 ease-out hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? 'Adding…' : createDisabled ? 'Save transaction first' : 'Add alteration'}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="rounded-[14px] border border-[#f1cbc7] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">
          {error}
        </p>
      ) : null}

      <section className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h4 className="text-base font-semibold text-[#142132]">Logged requests</h4>
          <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#64748b]">
            {requests.length} total
          </span>
        </div>

        <ul className="space-y-3">
          {requests.map((request) => (
            <li key={request.id} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm font-semibold text-[#142132]">{request.title || 'Alteration request'}</strong>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${getStatusPillClass(request.status)}`}>
                      {formatStatusLabel(request.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#4f647a]">{request.description || 'No description provided.'}</p>
                  <p className="mt-2 text-xs text-[#7c8ea4]">
                    {request.category || 'General'} • {request.budget_range || 'Budget not specified'} •{' '}
                    {request.preferred_timing || 'Timing not specified'}
                  </p>
                  <p className="mt-2 text-sm text-[#142132]">
                    Amount (incl. VAT): <strong>{currencyFormatter.format(Number(request.amount_inc_vat || 0))}</strong>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    {request.invoice_url ? (
                      <a
                        href={request.invoice_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7]"
                      >
                        Invoice
                      </a>
                    ) : null}
                    {request.proof_url ? (
                      <a
                        href={request.proof_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7]"
                      >
                        Proof of payment
                      </a>
                    ) : null}
                    {request.reference_image_url ? (
                      <a
                        href={request.reference_image_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7]"
                      >
                        Reference image
                      </a>
                    ) : null}
                  </div>
                </div>
                <label className="grid min-w-[180px] gap-2 text-sm font-medium text-[#35546c]">
                  <span>Status</span>
                  <select
                    value={request.status}
                    onChange={(event) => void handleStatusChange(request.id, event.target.value)}
                    disabled={saving}
                    className="w-full rounded-[14px] border border-[#dbe5ef] bg-white px-3.5 py-2.5 text-sm text-[#142132] outline-none transition focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                  >
                    {ALTERATION_REQUEST_STATUSES.map((status) => (
                      <option value={status} key={status}>
                        {formatStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </li>
          ))}

          {!requests.length ? (
            <li className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-4 py-5 text-sm text-[#6b7d93]">
              No alteration requests submitted yet.
            </li>
          ) : null}
        </ul>
      </section>
    </Wrapper>
  )
}

export default AlterationRequestsPanel
