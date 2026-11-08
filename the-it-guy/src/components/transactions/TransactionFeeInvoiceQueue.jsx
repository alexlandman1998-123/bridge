import { useState } from 'react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import SectionHeader from '../ui/SectionHeader'
import { downloadTransactionFeeInvoiceDraft } from '../../services/transactionFeeInvoicePdf.js'
import { buildTransactionFeeInvoiceEmailDraft } from '../../services/transactionFeeInvoiceDelivery.js'

export default function TransactionFeeInvoiceQueue({ items = [], busyTransactionId = '', invoiceReferences = {}, deliveryEmails = {}, error = '', organisationName = '', onPrepare, onReferenceChange, onDeliveryEmailChange, onComplete }) {
  const [deliveryError, setDeliveryError] = useState('')
  const [deliveryMessage, setDeliveryMessage] = useState('')
  async function deliver(operation, message) {
    setDeliveryError('')
    setDeliveryMessage('')
    try { await operation(); setDeliveryMessage(message) }
    catch (failure) { setDeliveryError(failure.message || 'The invoice copy could not be prepared. Please try again.') }
  }
  if (!items.length && !error) return null
  return (
    <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
      <SectionHeader title="R1,500 Transaction Fee — Finance Queue" copy="Only verified OTPs with attorney receipt confirmation appear here. This queue records finance handling; it does not generate or email a tax invoice." />
      {error ? <p className="mt-3 text-sm text-danger" role="alert">{error}</p> : null}
      {deliveryError ? <p className="mt-3 text-sm text-danger" role="alert">{deliveryError}</p> : null}
      {deliveryMessage ? <p className="mt-3 text-sm" role="status">{deliveryMessage}</p> : null}
      {items.length ? (
        <div className="mt-5 space-y-3">
          {items.map((item) => {
            const readyToPrepare = item.status === 'ready_to_prepare'
            const completed = item.status === 'completed'
            const needsVerification = item.status === 'verification_required'
            const isBusy = busyTransactionId === item.transactionId
            return (
              <article key={item.feeControlId || item.id || item.transactionId} className="rounded-[16px] border border-[#e4ebf4] bg-[#fbfcfe] px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <strong className="text-sm font-semibold text-[#142132]">Transaction fee · {item.billingPartyType === 'attorney' ? 'Attorney billed' : 'Agent billed'}</strong>
                    <p className="mt-1 text-sm text-[#66758b]">R1,500 excl. VAT · R1,725 incl. VAT</p>
                  </div>
                  <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${completed ? 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]' : 'border-[#f4dfba] bg-[#fff7e9] text-[#b67218]'}`}>
                    {completed ? `Completed · ${item.invoiceReference}` : needsVerification ? 'Attorney review needed' : readyToPrepare ? 'Ready to prepare' : 'Ready for finance'}
                  </span>
                </div>
                {needsVerification ? <p className="mt-3 text-sm text-amber-800">The signed pack or billing party changed. The assigned attorney must confirm the current pack before finance can continue.</p> : readyToPrepare ? (
                  <div className="mt-3">
                    <Button size="sm" disabled={isBusy} onClick={() => onPrepare(item.transactionId)}>{isBusy ? 'Preparing…' : 'Prepare for finance'}</Button>
                  </div>
                ) : !completed ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="grid flex-1 gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Accounting-system invoice reference</span>
                      <Field value={invoiceReferences[item.transactionId] || ''} onChange={(event) => onReferenceChange(item.transactionId, event.target.value)} placeholder="e.g. INV-100" />
                    </label>
                    <Button size="sm" disabled={isBusy} onClick={() => onComplete(item.transactionId)}>{isBusy ? 'Saving…' : 'Mark invoice completed'}</Button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="grid flex-1 gap-1.5"><span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Agreed billing email</span><Field type="email" value={deliveryEmails[item.transactionId] || ''} onChange={(event) => onDeliveryEmailChange(item.transactionId, event.target.value)} placeholder="billing@example.com" /></label><Button size="sm" variant="secondary" onClick={() => void deliver(() => downloadTransactionFeeInvoiceDraft({ invoiceReference: item.invoiceReference, transactionId: item.transactionId, billingPartyType: item.billingPartyType, organisationName }), 'Invoice copy prepared for download.')}>Download invoice copy</Button><Button size="sm" variant="ghost" disabled={!deliveryEmails[item.transactionId]} onClick={() => void deliver(async () => { if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable. Try again from a supported browser.'); const draft = buildTransactionFeeInvoiceEmailDraft({ recipientEmail: deliveryEmails[item.transactionId], billingPartyType: item.billingPartyType, invoiceReference: item.invoiceReference, transactionId: item.transactionId }); await navigator.clipboard.writeText(`To: ${draft.recipientEmail}\nSubject: ${draft.subject}\n\n${draft.body}`) }, 'Email draft copied. Attach the invoice copy and send it from the agreed billing inbox.')}>Copy email</Button></div>
                )}
              </article>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
