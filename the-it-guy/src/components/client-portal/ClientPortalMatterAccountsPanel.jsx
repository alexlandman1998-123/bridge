import { ArrowDownCircle, ArrowUpCircle, ClipboardList, Download, FileText, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { downloadMatterFinancialStatement } from '../../core/attorneyAccounting/matterAccountStatement'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
})

function formatCurrency(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? currency.format(amount) : currency.format(0)
}

function formatDate(value) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function title(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function statusTone(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['published', 'posted', 'accepted', 'complete'].includes(normalized)) return 'border-[#cfe7d8] bg-[#eef9f2] text-[#25764e]'
  if (['draft', 'pending', 'requested', 'submitted', 'awaiting_review'].includes(normalized)) return 'border-[#f0d8ae] bg-[#fff7eb] text-[#9a5b0f]'
  if (normalized === 'rejected') return 'border-[#f1cbc7] bg-[#fff5f4] text-[#b42318]'
  return 'border-[#dde7f1] bg-[#fbfdff] text-[#64748b]'
}

function accountEventLabel(event = {}) {
  const payload = event.payload || {}
  const labels = {
    financial_document_uploaded_and_published: 'Document published',
    financial_document_published: 'Document published',
    financial_entry_posted: 'Account entry posted',
    financial_entry_reversed: 'Account entry reversed',
    client_payment_proof_uploaded: 'Proof sent to legal team',
    client_payment_proof_posted: 'Payment confirmed',
    finance_document_request_created: 'Finance request added',
    finance_document_request_status_updated: 'Finance request updated',
    client_finance_request_document_uploaded: 'Requested document sent',
  }
  return payload.title || payload.description || labels[event.eventType] || title(event.eventType)
}

function accountEventDetail(event = {}) {
  const payload = event.payload || {}
  if (payload.amount) return formatCurrency(payload.amount)
  if (payload.documentType) return title(payload.documentType)
  return title(event.eventType)
}

export default function ClientPortalMatterAccountsPanel({
  accounts = [],
  summary = {},
  loading = false,
  error = '',
  unavailable = false,
  workspace = 'buyer',
  uploadingProofAccountId = '',
  proofUploadFeedback = null,
  onUploadProof = null,
  uploadingRequestId = '',
  requestUploadFeedback = null,
  onUploadRequestDocument = null,
}) {
  const workspaceLabel = workspace === 'seller' || workspace === 'selling' ? 'seller' : 'buyer'
  const accountCount = Array.isArray(accounts) ? accounts.length : 0
  const hasAccounts = accountCount > 0
  const [proofDrafts, setProofDrafts] = useState({})
  const [proofFiles, setProofFiles] = useState({})
  const [requestDrafts, setRequestDrafts] = useState({})
  const [requestFiles, setRequestFiles] = useState({})

  const getProofDraft = (accountId) => proofDrafts[accountId] || {
    amount: '',
    paidOn: new Date().toISOString().slice(0, 10),
    reference: '',
    requestId: '',
    notes: '',
  }
  const updateProofDraft = (accountId, patch) => {
    setProofDrafts((previous) => ({
      ...previous,
      [accountId]: {
        ...getProofDraft(accountId),
        ...patch,
      },
    }))
  }
  const handleSubmitProof = async (event, account) => {
    event.preventDefault()
    if (!onUploadProof || !account?.id) return
    const result = await onUploadProof({
      account,
      file: proofFiles[account.id] || null,
      ...getProofDraft(account.id),
    })
    if (result?.ok !== false) {
      setProofDrafts((previous) => ({
        ...previous,
        [account.id]: {
          amount: '',
          paidOn: new Date().toISOString().slice(0, 10),
          reference: '',
          requestId: '',
          notes: '',
        },
      }))
      setProofFiles((previous) => ({
        ...previous,
        [account.id]: null,
      }))
    }
  }
  const handleDownloadStatement = (account) => {
    downloadMatterFinancialStatement(account, {
      scope: workspaceLabel,
      generatedFor: workspaceLabel,
      includeInternal: false,
    })
  }
  const getRequestDraft = (requestId) => requestDrafts[requestId] || {
    amount: '',
    documentDate: new Date().toISOString().slice(0, 10),
    reference: '',
    notes: '',
  }
  const updateRequestDraft = (requestId, patch) => {
    setRequestDrafts((previous) => ({
      ...previous,
      [requestId]: {
        ...getRequestDraft(requestId),
        ...patch,
      },
    }))
  }
  const handleSubmitRequestDocument = async (event, account, request) => {
    event.preventDefault()
    if (!onUploadRequestDocument || !account?.id || !request?.id) return
    const result = await onUploadRequestDocument({
      account,
      request,
      file: requestFiles[request.id] || null,
      ...getRequestDraft(request.id),
    })
    if (result?.ok !== false) {
      setRequestDrafts((previous) => ({
        ...previous,
        [request.id]: {
          amount: '',
          documentDate: new Date().toISOString().slice(0, 10),
          reference: '',
          notes: '',
        },
      }))
      setRequestFiles((previous) => ({
        ...previous,
        [request.id]: null,
      }))
    }
  }

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="rounded-[26px] border border-[#dbe5ef] bg-white px-6 py-6 shadow-[0_16px_34px_rgba(15,23,42,0.06)]">
          <div className="h-5 w-48 animate-pulse rounded-full bg-[#e8eef6]" />
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-[16px] bg-[#f3f6fb]" />
            ))}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <header className="rounded-[26px] border border-[#dbe5ef] bg-white px-6 py-6 shadow-[0_16px_34px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              <ShieldCheck size={13} />
              Secure {title(workspaceLabel)} account
            </span>
            <h3 className="mt-3 text-[1.36rem] font-semibold tracking-[-0.03em] text-[#142132]">Account details</h3>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#6b7d93]">
              These figures and documents are published by your legal team. Drafts and internal notes are kept private until they are approved for your portal.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#fbfdff] px-4 py-2 text-sm font-semibold text-[#64748b]">
            {hasAccounts ? `${accountCount} active account${accountCount === 1 ? '' : 's'}` : 'No account published yet'}
          </span>
        </div>

        {error ? (
          <p className="mt-4 rounded-[14px] border border-[#f1cbc7] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">{error}</p>
        ) : null}
        {unavailable && !error ? (
          <p className="mt-4 rounded-[14px] border border-[#f0d8ae] bg-[#fff7eb] px-4 py-3 text-sm text-[#9a5b0f]">
            Matter account details are being prepared and will appear here once your legal team publishes them.
          </p>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {[
            ['Balance due', formatCurrency(summary.balanceDue || 0), 'Visible posted entries'],
            ['Charged', formatCurrency(summary.totalCharged || 0), 'Published charges/debits'],
            ['Received / credited', formatCurrency(summary.totalCredited || 0), 'Payments, credits, write-offs'],
            ['Requests', summary.openRequests || 0, `${summary.overdueRequests || 0} overdue checklist items`],
            ['Updates', summary.eventCount || 0, 'Published account updates'],
          ].map(([label, value, helper]) => (
            <article key={label} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
              <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">{label}</span>
              <strong className="mt-1.5 block text-lg font-semibold text-[#142132]">{value}</strong>
              <p className="mt-1 text-xs leading-5 text-[#6b7d93]">{helper}</p>
            </article>
          ))}
        </div>
      </header>

      {!hasAccounts ? (
        <section className="rounded-[24px] border border-dashed border-[#d5e1ee] bg-white px-6 py-8 text-center shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
          <FileText className="mx-auto text-[#7b8ca2]" size={30} />
          <h4 className="mt-3 text-base font-semibold text-[#142132]">No account details published yet</h4>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#6b7d93]">
            Your legal team can publish invoices, statements, and payment updates here once they are ready for you to review.
          </p>
        </section>
      ) : null}

      {accounts.map((account) => (
        <article key={account.id} className="rounded-[26px] border border-[#dbe5ef] bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <span className="inline-flex rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                {title(account.partyRole)}
              </span>
              <h4 className="mt-3 text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">
                {account.partyLabel || title(account.partyRole)}
              </h4>
              {account.partyEmail ? <p className="mt-1 text-sm text-[#6b7d93]">{account.partyEmail}</p> : null}
            </div>
            <div className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3 text-right">
              <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Current balance</span>
              <strong className="mt-1.5 block text-xl font-semibold text-[#142132]">{formatCurrency(account.balance?.balanceDue || 0)}</strong>
              <button
                type="button"
                onClick={() => handleDownloadStatement(account)}
                className="mt-3 inline-flex min-h-[34px] items-center justify-center gap-2 rounded-[10px] border border-[#d1deeb] bg-white px-3 py-1.5 text-xs font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
              >
                <Download size={13} />
                Download statement
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {account.paymentInstructions?.published ? (
              <section className="space-y-3 xl:col-span-2">
                <div>
                  <h5 className="text-sm font-semibold text-[#142132]">Payment instructions</h5>
                  <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Use these details exactly as provided by your legal team.</p>
                </div>
                <div className="grid gap-3 rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Account holder', account.paymentInstructions.accountHolder],
                    ['Bank', account.paymentInstructions.bankName],
                    ['Account number', account.paymentInstructions.accountNumber],
                    ['Branch code', account.paymentInstructions.branchCode],
                    ['Account type', account.paymentInstructions.accountType],
                    ['Payment reference', account.paymentInstructions.paymentReference],
                  ].filter(([, value]) => value).map(([label, value]) => (
                    <div key={label} className="rounded-[14px] border border-[#e3ebf4] bg-white px-3 py-2">
                      <span className="block text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{label}</span>
                      <strong className="mt-1 block break-words text-sm font-semibold text-[#142132]">{value}</strong>
                    </div>
                  ))}
                  {account.paymentInstructions.instructions ? (
                    <p className="rounded-[14px] border border-[#e3ebf4] bg-white px-3 py-2 text-sm leading-6 text-[#142132] md:col-span-2 xl:col-span-4">
                      {account.paymentInstructions.instructions}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            <section className="space-y-3 xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h5 className="text-sm font-semibold text-[#142132]">Requested from you</h5>
                  <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Your legal team will list required POPs, statements, invoices, or supporting finance documents here.</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1 text-xs font-semibold text-[#64748b]">
                  <ClipboardList size={13} />
                  {account.requests?.length || 0} item{account.requests?.length === 1 ? '' : 's'}
                </span>
              </div>
              {account.requests?.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {account.requests.map((request) => {
                    const canUploadRequest = Boolean(onUploadRequestDocument) && ['requested', 'rejected'].includes(request.requestStatus)
                    const draft = getRequestDraft(request.id)
                    const isProofRequest = request.requestType === 'proof_of_payment'
                    return (
                      <article key={request.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className="text-sm font-semibold text-[#142132]">{request.title}</strong>
                              <span className={`rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold ${statusTone(request.requestStatus)}`}>
                                {title(request.requestStatus)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                              {title(request.requestType)} · {request.externalReference || 'No reference'} · Due {formatDate(request.dueOn)}
                            </p>
                            {request.amountDue ? (
                              <p className="mt-2 text-xs font-semibold text-[#142132]">Amount requested {formatCurrency(request.amountDue)}</p>
                            ) : null}
                            {request.description ? <p className="mt-2 text-xs leading-5 text-[#6b7d93]">{request.description}</p> : null}
                            {request.reviewNotes ? <p className="mt-2 text-xs leading-5 text-[#6b7d93]">Legal team note: {request.reviewNotes}</p> : null}
                          </div>
                        </div>
                        {requestUploadFeedback?.requestId === request.id && requestUploadFeedback?.message ? (
                          <p className={`mt-3 rounded-[14px] border px-3 py-2 text-xs ${
                            requestUploadFeedback.tone === 'success'
                              ? 'border-[#cfe7d8] bg-[#eef9f2] text-[#25764e]'
                              : 'border-[#f1cbc7] bg-[#fff5f4] text-[#b42318]'
                          }`}>
                            {requestUploadFeedback.message}
                          </p>
                        ) : null}
                        {canUploadRequest ? (
                          <form className="mt-3 grid gap-2 rounded-[14px] border border-[#e3ebf4] bg-white p-3 md:grid-cols-2" onSubmit={(event) => handleSubmitRequestDocument(event, account, request)}>
                            <label className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">
                              {isProofRequest ? 'Amount paid' : 'Amount'}
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft.amount}
                                onChange={(event) => updateRequestDraft(request.id, { amount: event.target.value })}
                                placeholder={request.amountDue ? String(request.amountDue) : ''}
                                className="mt-1.5 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#162334] outline-none placeholder:text-[#8ca0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
                              />
                            </label>
                            <label className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">
                              {isProofRequest ? 'Paid on' : 'Document date'}
                              <input
                                type="date"
                                value={draft.documentDate}
                                onChange={(event) => updateRequestDraft(request.id, { documentDate: event.target.value })}
                                className="mt-1.5 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#162334] outline-none focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
                              />
                            </label>
                            <label className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">
                              Reference
                              <input
                                value={draft.reference}
                                onChange={(event) => updateRequestDraft(request.id, { reference: event.target.value })}
                                placeholder="Invoice / EFT / statement ref"
                                className="mt-1.5 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#162334] outline-none placeholder:text-[#8ca0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
                              />
                            </label>
                            <label className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">
                              File
                              <input
                                type="file"
                                onChange={(event) => setRequestFiles((previous) => ({ ...previous, [request.id]: event.target.files?.[0] || null }))}
                                className="mt-1.5 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#162334] outline-none file:mr-3 file:rounded-md file:border-0 file:bg-[#eef5fb] file:px-2 file:py-1 file:text-xs file:font-semibold file:text-[#35546c]"
                              />
                            </label>
                            <label className="md:col-span-2 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">
                              Note
                              <textarea
                                rows={2}
                                value={draft.notes}
                                onChange={(event) => updateRequestDraft(request.id, { notes: event.target.value })}
                                placeholder="Optional context for your legal team"
                                className="mt-1.5 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#162334] outline-none placeholder:text-[#8ca0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
                              />
                            </label>
                            <button
                              type="submit"
                              disabled={uploadingRequestId === request.id}
                              className="md:col-span-2 inline-flex min-h-[38px] items-center justify-center rounded-[11px] bg-[#35546c] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]"
                            >
                              {uploadingRequestId === request.id ? 'Uploading…' : `Submit ${title(request.requestType)}`}
                            </button>
                          </form>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
              ) : (
                <p className="rounded-[16px] border border-dashed border-[#d5e1ee] bg-[#fbfdff] px-4 py-5 text-sm text-[#6b7d93]">
                  No finance documents or proof items have been requested from you yet.
                </p>
              )}
            </section>

            <section className="space-y-3 xl:col-span-2">
              <div>
                <h5 className="text-sm font-semibold text-[#142132]">Upload proof of payment</h5>
                <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                  Send payment evidence to your legal team. This does not mark the account as paid until they review and post the payment.
                </p>
              </div>
              {proofUploadFeedback?.accountId === account.id && proofUploadFeedback?.message ? (
                <p className={`rounded-[14px] border px-4 py-3 text-sm ${
                  proofUploadFeedback.tone === 'success'
                    ? 'border-[#cfe7d8] bg-[#eef9f2] text-[#25764e]'
                    : 'border-[#f1cbc7] bg-[#fff5f4] text-[#b42318]'
                }`}>
                  {proofUploadFeedback.message}
                </p>
              ) : null}
              <form className="grid gap-3 rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4 md:grid-cols-2 xl:grid-cols-5" onSubmit={(event) => handleSubmitProof(event, account)}>
                {account.requests?.some((request) => !['complete', 'cancelled'].includes(request.requestStatus)) ? (
                  <label className="md:col-span-2 xl:col-span-5 text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">
                    Related request
                    <select
                      value={getProofDraft(account.id).requestId}
                      onChange={(event) => updateProofDraft(account.id, { requestId: event.target.value })}
                      className="mt-1.5 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#162334] outline-none focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
                    >
                      <option value="">General proof upload</option>
                      {account.requests
                        .filter((request) => !['complete', 'cancelled'].includes(request.requestStatus))
                        .map((request) => (
                          <option key={request.id} value={request.id}>
                            {request.title} · {title(request.requestStatus)}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
                <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">
                  Amount paid
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={getProofDraft(account.id).amount}
                    onChange={(event) => updateProofDraft(account.id, { amount: event.target.value })}
                    className="mt-1.5 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#162334] outline-none focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">
                  Paid on
                  <input
                    type="date"
                    value={getProofDraft(account.id).paidOn}
                    onChange={(event) => updateProofDraft(account.id, { paidOn: event.target.value })}
                    className="mt-1.5 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#162334] outline-none focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">
                  Reference
                  <input
                    value={getProofDraft(account.id).reference}
                    onChange={(event) => updateProofDraft(account.id, { reference: event.target.value })}
                    placeholder="EFT / bank ref"
                    className="mt-1.5 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#162334] outline-none placeholder:text-[#8ca0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">
                  File
                  <input
                    type="file"
                    onChange={(event) => setProofFiles((previous) => ({ ...previous, [account.id]: event.target.files?.[0] || null }))}
                    className="mt-1.5 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#162334] outline-none file:mr-3 file:rounded-md file:border-0 file:bg-[#eef5fb] file:px-2 file:py-1 file:text-xs file:font-semibold file:text-[#35546c]"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={!onUploadProof || uploadingProofAccountId === account.id}
                    className="inline-flex min-h-[40px] w-full items-center justify-center rounded-[11px] bg-[#35546c] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]"
                  >
                    {uploadingProofAccountId === account.id ? 'Uploading…' : 'Submit proof'}
                  </button>
                </div>
                <label className="md:col-span-2 xl:col-span-5 text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">
                  Note for legal team
                  <textarea
                    rows={2}
                    value={getProofDraft(account.id).notes}
                    onChange={(event) => updateProofDraft(account.id, { notes: event.target.value })}
                    placeholder="Optional context, payer name, or split-payment note"
                    className="mt-1.5 w-full rounded-[10px] border border-[#d9e2ee] bg-white px-3 py-2 text-sm normal-case tracking-normal text-[#162334] outline-none placeholder:text-[#8ca0b8] focus:border-[#35546c]/45 focus:ring-2 focus:ring-[#35546c]/12"
                  />
                </label>
              </form>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h5 className="text-sm font-semibold text-[#142132]">Published documents</h5>
                <span className="rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1 text-xs font-semibold text-[#64748b]">
                  {account.documents.length}
                </span>
              </div>
              {account.documents.length ? (
                account.documents.map((document) => (
                  <div key={document.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm font-semibold text-[#142132]">{document.title}</strong>
                          <span className={`rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold ${statusTone(document.documentStatus)}`}>
                            {title(document.documentType)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                          {document.externalReference || 'No reference'} · Published {formatDate(document.publishedAt)}
                        </p>
                        {document.amountDue || document.amountTotal ? (
                          <p className="mt-2 text-xs font-semibold text-[#142132]">
                            {document.amountDue ? `Amount due ${formatCurrency(document.amountDue)}` : `Total ${formatCurrency(document.amountTotal)}`}
                          </p>
                        ) : null}
                      </div>
                      {document.url ? (
                        <a
                          href={document.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-[36px] items-center gap-2 rounded-[10px] border border-[#d1deeb] bg-white px-3 py-1.5 text-xs font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                        >
                          <Download size={13} />
                          Download
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-[16px] border border-dashed border-[#d5e1ee] bg-[#fbfdff] px-4 py-5 text-sm text-[#6b7d93]">
                  No invoices, statements, or receipts have been published for this account yet.
                </p>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h5 className="text-sm font-semibold text-[#142132]">Account activity</h5>
                <span className="rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1 text-xs font-semibold text-[#64748b]">
                  {account.entries.length}
                </span>
              </div>
              {account.entries.length ? (
                account.entries.map((entry) => (
                  <div key={entry.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {entry.amount < 0 ? (
                            <ArrowDownCircle size={15} className="shrink-0 text-[#25764e]" />
                          ) : (
                            <ArrowUpCircle size={15} className="shrink-0 text-[#9a5b0f]" />
                          )}
                          <strong className="text-sm font-semibold text-[#142132]">{entry.description}</strong>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                          {title(entry.entryType)} · {formatDate(entry.occurredOn)}
                        </p>
                      </div>
                      <strong className={entry.amount < 0 ? 'shrink-0 text-sm font-semibold text-[#25764e]' : 'shrink-0 text-sm font-semibold text-[#142132]'}>
                        {formatCurrency(entry.amount)}
                      </strong>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-[16px] border border-dashed border-[#d5e1ee] bg-[#fbfdff] px-4 py-5 text-sm text-[#6b7d93]">
                  No payments or account movements have been published yet.
                </p>
              )}
            </section>

            <section className="space-y-3 xl:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <h5 className="text-sm font-semibold text-[#142132]">Updates from your legal team</h5>
                <span className="rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1 text-xs font-semibold text-[#64748b]">
                  {account.events?.length || 0}
                </span>
              </div>
              {account.events?.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {account.events.slice(0, 6).map((event) => (
                    <div key={event.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
                      <strong className="text-sm font-semibold text-[#142132]">{accountEventLabel(event)}</strong>
                      <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                        {accountEventDetail(event)} · {formatDate(event.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-[16px] border border-dashed border-[#d5e1ee] bg-[#fbfdff] px-4 py-5 text-sm text-[#6b7d93]">
                  No legal team updates have been published for this account yet.
                </p>
              )}
            </section>
          </div>
        </article>
      ))}
    </section>
  )
}
