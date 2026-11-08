import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { readTransactionFinanceCloseout, reviewTransactionCommission } from '../../services/transactionFinanceCloseoutService.js'
import { completeTransactionFeeInvoice, prepareTransactionFeeInvoice, recordTransactionFeeControl } from '../../services/transactionFeeControlService.js'
import TransactionFeeInvoiceQueue from './TransactionFeeInvoiceQueue.jsx'
import Button from '../ui/Button'
import Field from '../ui/Field'

const money = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(value || 0))

function SavedOtpFeeConfirmation({ documents = [], busy, onConfirm }) {
  const [selectedId, setSelectedId] = useState('')
  const [billingParty, setBillingParty] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const documentId = selectedId || (documents.length === 1 ? documents[0].id : '')
  const currentDocument = documents.find((document) => document.id === documentId)
  if (!documents.length) return <p className="text-sm">Add the signed OTP in Documents before confirming the fee terms.</p>
  return <div className="space-y-3 rounded-xl border border-slate-200 p-4">
    <h4 className="font-semibold">Confirm fee terms for the saved OTP</h4>
    <p className="text-sm">Use the existing signed OTP. No new upload is needed. The transaction fee is R1,500 plus VAT (R1,725).</p>
    <label className="grid gap-1 text-sm">Saved signed OTP<select className="rounded-lg border border-slate-300 p-2" value={documentId} disabled={busy} onChange={(event) => { setSelectedId(event.target.value); setConfirmed(false) }}>
      <option value="">Choose the saved OTP</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.fileName || 'Signed OTP'}</option>)}
    </select></label>
    <label className="grid gap-1 text-sm">Transaction fee billed to<select className="rounded-lg border border-slate-300 p-2" value={billingParty} disabled={busy} onChange={(event) => { setBillingParty(event.target.value); setConfirmed(false) }}>
      <option value="">Choose billing party</option><option value="agent">Agent</option><option value="attorney">Attorney</option>
    </select></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />I confirm that the agreed transaction-fee terms and consent form are included with this signed OTP.</label>
    <Button size="sm" disabled={busy || !currentDocument || !billingParty || !confirmed} onClick={() => onConfirm({ otpDocumentId: documentId, billingPartyType: billingParty, consentAndFeeTermsConfirmed: confirmed })}>Save fee confirmation</Button>
  </div>
}

function CommissionEntry({ entry, busy, onReview }) {
  const [amount, setAmount] = useState(String(entry.approvedAmount ?? entry.calculatedAmount ?? ''))
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState('')
  const settled = ['paid', 'waived'].includes(entry.status)
  const nextAction = entry.status === 'due' ? 'mark_paid' : entry.status === 'approved' ? 'mark_due' : 'approve'
  const actionLabel = { approve: 'Approve amount', mark_due: 'Mark due', mark_paid: 'Record payment received' }[nextAction]
  const reasonNeeded = Number(amount) !== Number(entry.calculatedAmount)
  return <article className="rounded-xl border border-slate-200 p-4">
    <div className="flex flex-wrap justify-between gap-2"><strong>{entry.participantName || entry.participantRole?.replaceAll('_', ' ') || 'Commission'}</strong><span>{entry.status.replaceAll('_', ' ')} · {money(entry.approvedAmount ?? entry.calculatedAmount)}</span></div>
    {!settled ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {nextAction === 'approve' ? <label className="grid gap-1 text-sm">Amount to approve<Field type="number" min="0" step="0.01" value={amount} disabled={busy} onChange={(event) => setAmount(event.target.value)} /></label> : null}
      {nextAction === 'mark_paid' ? <div><label className="grid gap-1 text-sm">Payment reference<Field aria-describedby={`payment-help-${entry.id}`} value={reference} disabled={busy} onChange={(event) => setReference(event.target.value)} /></label><small id={`payment-help-${entry.id}`}>Record a payment already received outside Arch9.</small></div> : null}
      <label className="grid gap-1 text-sm">Reason or finance note<Field value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} placeholder="Required for a waiver or changed amount" /></label>
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
        <Button size="sm" disabled={busy || amount === '' || (nextAction === 'approve' && reasonNeeded && !reason.trim()) || (nextAction === 'mark_paid' && !reference.trim())} onClick={() => onReview({ allocationId: entry.id, action: nextAction, amount: nextAction === 'approve' ? amount : null, reason, paymentReference: reference })}>{actionLabel}</Button>
        <Button size="sm" variant="ghost" disabled={busy || !reason.trim()} onClick={() => onReview({ allocationId: entry.id, action: 'waive', reason })}>Waive with reason</Button>
      </div>
    </div> : entry.paymentReference ? <p className="mt-2 text-sm">Payment reference: {entry.paymentReference}</p> : null}
  </article>
}

export default function TransactionFinanceCloseoutPanel({ transactionId, organisationName = '', client = supabase, onChanged }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [references, setReferences] = useState({})
  const [emails, setEmails] = useState({})
  const [refresh, setRefresh] = useState(0)
  const current = result?.transactionId === transactionId && result?.refresh === refresh ? result : null
  const snapshot = current?.data
  const visibleError = error || current?.error || ''
  useEffect(() => {
    let active = true
    readTransactionFinanceCloseout(client, transactionId).then((data) => { if (active) setResult({ transactionId, refresh, data }) }, (failure) => { if (active) setResult({ transactionId, refresh, error: failure.message || 'Finance controls could not be loaded.' }) })
    return () => { active = false }
  }, [client, transactionId, refresh])
  const act = useCallback(async (operation) => {
    setBusy(true)
    setError('')
    try {
      await operation()
      setRefresh((value) => value + 1)
      onChanged?.()
    } catch (failure) { setError(failure.message || 'The finance decision could not be saved.') }
    finally { setBusy(false) }
  }, [onChanged])
  if (snapshot?.canManage === false) return null
  return <section aria-label="Transaction billing and closeout" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Transaction billing and closeout</h3><Button size="sm" variant="ghost" disabled={busy} onClick={() => setRefresh((value) => value + 1)}>Refresh finance</Button></div>
    {visibleError ? <p role="alert" className="text-sm text-red-700">{visibleError}</p> : null}
    {!snapshot && !visibleError ? <p role="status">Loading finance controls…</p> : null}
    {snapshot?.canManage ? <>
      {!snapshot.feeControl ? <SavedOtpFeeConfirmation key={`fee:${transactionId}:${(snapshot.signedOtpDocuments || []).map((document) => document.id).join(',')}`} documents={snapshot.signedOtpDocuments} busy={busy} onConfirm={(values) => act(() => recordTransactionFeeControl(client, { transactionId, ...values }))} /> : !snapshot.feeControl.attorneyReceiptConfirmed ? <p className="text-sm">Waiting for the assigned attorney to confirm receipt of the signed OTP and consent pack.</p> : null}
      <TransactionFeeInvoiceQueue key={transactionId} items={snapshot.invoice ? [snapshot.invoice] : []} busyTransactionId={busy ? transactionId : ''} invoiceReferences={references} deliveryEmails={emails} organisationName={organisationName}
        onPrepare={(id) => act(() => prepareTransactionFeeInvoice(client, { transactionId: id }))}
        onReferenceChange={(id, value) => setReferences((current) => ({ ...current, [id]: value }))}
        onDeliveryEmailChange={(id, value) => setEmails((current) => ({ ...current, [id]: value }))}
        onComplete={(id) => act(() => completeTransactionFeeInvoice(client, { transactionId: id, invoiceReference: references[id] }))} />
      {snapshot.canReviewCommission ? <div className="space-y-3">
        <h4 className="font-semibold">Commission closeout</h4>
        {Number(snapshot.grossCommissionPercentage) >= 100 ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The saved fee is {snapshot.grossCommissionPercentage}% of the selling price. Confirm the agreed selling-price fee separately from the agency’s share before approving these amounts.</p> : null}
        {(snapshot.allocations || []).map((entry) => <CommissionEntry key={`${transactionId}:${entry.id}:${entry.status}:${entry.calculatedAmount}:${entry.approvedAmount}`} entry={entry} busy={busy} onReview={(values) => act(() => reviewTransactionCommission(client, values))} />)}
        {!snapshot.allocations?.length ? <p className="text-sm">Commission allocations have not been prepared. Confirm the deal’s commission setup before closeout.</p> : <p role="status" className="text-sm">{snapshot.readiness?.success ? 'Commission entries are settled. Complete registration and the required post-registration documents before closing the file.' : `${snapshot.readiness?.unresolved_allocation_count ?? snapshot.allocations.length} commission entries still need a finance decision before closeout.`}</p>}
      </div> : null}
    </> : null}
  </section>
}
