// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
vi.mock('../../../lib/supabaseClient', () => ({ supabase: null }))
vi.mock('../../../services/transactionFeeInvoicePdf.js', () => ({ downloadTransactionFeeInvoiceDraft: vi.fn() }))
import TransactionFinanceCloseoutPanel from '../TransactionFinanceCloseoutPanel.jsx'

afterEach(() => { cleanup(); vi.clearAllMocks() })
const base = () => ({ canManage: true, canReviewCommission: true, feeControl: { attorneyReceiptConfirmed: true }, invoice: null,
  allocations: [], readiness: { success: true }, grossCommissionPercentage: 10 })
function clientFor(initial) {
  let snapshot = initial
  const rpc = vi.fn(async (name, args) => {
    if (name === 'bridge_read_transaction_finance_closeout') return { data: snapshot, error: null }
    if (name === 'bridge_record_transaction_fee_control') {
      snapshot = { ...snapshot, feeControl: { otpDocumentId: args.p_otp_document_id, attorneyReceiptConfirmed: false } }
      return { data: { id: 'fee' }, error: null }
    }
    if (name === 'bridge_prepare_transaction_fee_invoice') {
      snapshot = { ...snapshot, invoice: { transactionId: 'tx', feeControlId: 'fee', status: 'ready_for_finance', billingPartyType: 'agent' } }
      return { data: { id: 'invoice' }, error: null }
    }
    if (name === 'bridge_complete_transaction_fee_invoice') {
      snapshot = { ...snapshot, invoice: { ...snapshot.invoice, status: 'completed', invoiceReference: args.p_invoice_reference } }
      return { data: snapshot.invoice, error: null }
    }
    if (name === 'bridge_review_commission_allocation') {
      snapshot = { ...snapshot, allocations: snapshot.allocations.map((item) => item.id === args.p_allocation_id ? { ...item, status: args.p_action === 'approve' ? 'approved' : 'paid', approvedAmount: args.p_approved_amount ?? item.approvedAmount } : item) }
      return { data: { success: true }, error: null }
    }
    throw new Error(`Unexpected RPC ${name}`)
  })
  return { rpc }
}
describe('transaction finance journey', () => {
  it('hides confidential finance controls when the server denies access', async () => {
    const client = clientFor({ canManage: false })
    render(<TransactionFinanceCloseoutPanel client={client} transactionId="tx" />)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Transaction billing and closeout' })).toBeNull())
    expect(screen.queryByText('Commission closeout')).toBeNull()
  })
  it('confirms fee terms against the saved OTP without asking for another upload', async () => {
    const client = clientFor({ ...base(), feeControl: null, signedOtpDocuments: [{ id: 'saved-otp', fileName: 'SAVED-OTP.pdf' }] })
    render(<TransactionFinanceCloseoutPanel client={client} transactionId="tx" />)
    const save = await screen.findByRole('button', { name: 'Save fee confirmation' })
    expect(screen.getByText(/No new upload is needed/)).toBeTruthy()
    expect(save.disabled).toBe(true)
    fireEvent.change(screen.getByRole('combobox', { name: 'Transaction fee billed to' }), { target: { value: 'agent' } })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await screen.findByText(/Waiting for the assigned attorney/)
    expect(client.rpc.mock.calls.find(([name]) => name === 'bridge_record_transaction_fee_control')[1]).toMatchObject({ p_transaction_id: 'tx', p_otp_document_id: 'saved-otp', p_billing_party_type: 'agent', p_consent_and_fee_terms_confirmed: true })
    expect(client.rpc.mock.calls.every(([name]) => !name.includes('upload'))).toBe(true)
  })
  it('requires an explicit file choice when several saved OTPs are available', async () => {
    render(<TransactionFinanceCloseoutPanel client={clientFor({ ...base(), feeControl: null, signedOtpDocuments: [{ id: 'a' }, { id: 'b' }] })} transactionId="tx" />)
    const save = await screen.findByRole('button', { name: 'Save fee confirmation' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Transaction fee billed to' }), { target: { value: 'attorney' } })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(save.disabled).toBe(true)
    fireEvent.change(screen.getByRole('combobox', { name: 'Saved signed OTP' }), { target: { value: 'b' } })
    expect(screen.getByRole('checkbox').checked).toBe(false)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(save.disabled).toBe(false)
  })
  it('keeps fee confirmation available after a server save failure', async () => {
    const client = clientFor({ ...base(), feeControl: null, signedOtpDocuments: [{ id: 'saved-otp' }] })
    client.rpc.mockImplementation(async (name) => name === 'bridge_read_transaction_finance_closeout' ? { data: { ...base(), feeControl: null, signedOtpDocuments: [{ id: 'saved-otp' }] } } : { error: { message: 'Fee confirmation could not be saved.' } })
    render(<TransactionFinanceCloseoutPanel client={client} transactionId="tx" />)
    await screen.findByRole('button', { name: 'Save fee confirmation' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Transaction fee billed to' }), { target: { value: 'agent' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Save fee confirmation' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save fee confirmation' })).toBeTruthy()
  })
  it('takes a verified fee from preparation through the accounting reference without duplicates', async () => {
    const snapshot = base()
    snapshot.invoice = { transactionId: 'tx', feeControlId: 'fee', status: 'ready_to_prepare', billingPartyType: 'agent' }
    const client = clientFor(snapshot)
    render(<TransactionFinanceCloseoutPanel client={client} transactionId="tx" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare for finance' }))
    const reference = await screen.findByRole('textbox', { name: 'Accounting-system invoice reference' })
    fireEvent.change(reference, { target: { value: 'TEST-NOT-PAYABLE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark invoice completed' }))
    expect(await screen.findByText('Completed · TEST-NOT-PAYABLE')).toBeTruthy()
    expect(client.rpc.mock.calls.filter(([name]) => name === 'bridge_prepare_transaction_fee_invoice')).toHaveLength(1)
    expect(client.rpc.mock.calls.find(([name]) => name === 'bridge_complete_transaction_fee_invoice')[1].p_invoice_reference).toBe('TEST-NOT-PAYABLE')
  })
  it('removes completion actions when changed evidence needs attorney verification', async () => {
    const snapshot = base()
    snapshot.invoice = { transactionId: 'tx', status: 'verification_required' }
    render(<TransactionFinanceCloseoutPanel client={clientFor(snapshot)} transactionId="tx" />)
    await screen.findByText('Attorney review needed')
    expect(screen.queryByRole('button', { name: 'Mark invoice completed' })).toBeNull()
    expect(screen.getByText(/assigned attorney must confirm the current pack/)).toBeTruthy()
  })
  it('saves the reviewed amount and refreshes the next finance action', async () => {
    const snapshot = base()
    snapshot.allocations = [{ id: 'allocation', participantName: 'Agency', status: 'projected', calculatedAmount: 100000 }]
    const client = clientFor(snapshot)
    render(<TransactionFinanceCloseoutPanel client={client} transactionId="tx" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Approve amount' }))
    expect(await screen.findByRole('button', { name: 'Mark due' })).toBeTruthy()
    expect(client.rpc.mock.calls.find(([name]) => name === 'bridge_review_commission_allocation')[1]).toMatchObject({ p_action: 'approve', p_approved_amount: 100000 })
  })
  it('requires a reason for changed amounts and waivers', async () => {
    const snapshot = base()
    snapshot.allocations = [{ id: 'allocation', status: 'projected', calculatedAmount: 100000 }]
    render(<TransactionFinanceCloseoutPanel client={clientFor(snapshot)} transactionId="tx" />)
    const approve = await screen.findByRole('button', { name: 'Approve amount' })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount to approve' }), { target: { value: '50000' } })
    expect(approve.disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Waive with reason' }).disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason or finance note' }), { target: { value: 'Agreed correction' } })
    expect(approve.disabled).toBe(false)
  })
  it('records an external payment only after its reference is supplied', async () => {
    const snapshot = base()
    snapshot.allocations = [{ id: 'allocation', status: 'due', approvedAmount: 100000, calculatedAmount: 100000 }]
    const client = clientFor(snapshot)
    render(<TransactionFinanceCloseoutPanel client={client} transactionId="tx" />)
    const button = await screen.findByRole('button', { name: 'Record payment received' })
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Payment reference' }), { target: { value: 'TEST-NO-MONEY-MOVED' } })
    fireEvent.click(button)
    await screen.findByText(/paid ·/)
    expect(client.rpc.mock.calls.find(([name]) => name === 'bridge_review_commission_allocation')[1]).toMatchObject({ p_action: 'mark_paid', p_payment_reference: 'TEST-NO-MONEY-MOVED' })
  })
  it('reports a failed decision without showing it as saved', async () => {
    const snapshot = base()
    snapshot.allocations = [{ id: 'allocation', status: 'projected', calculatedAmount: 100000 }]
    const client = clientFor(snapshot)
    client.rpc.mockImplementation(async (name) => name === 'bridge_read_transaction_finance_closeout' ? { data: snapshot } : { error: { message: 'Connection interrupted. Retry.' } })
    render(<TransactionFinanceCloseoutPanel client={client} transactionId="tx" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Approve amount' }))
    await screen.findByRole('alert')
    expect(screen.getByText('Connection interrupted. Retry.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark due' })).toBeNull()
  })
})
