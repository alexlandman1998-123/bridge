const text = (value) => String(value ?? '').trim()

export async function readTransactionFinanceCloseout(client, transactionId) {
  if (!client?.rpc || !text(transactionId)) throw new Error('A connected transaction is required.')
  const { data, error } = await client.rpc('bridge_read_transaction_finance_closeout', { p_transaction_id: transactionId })
  if (error) throw error
  return data || { canManage: false }
}

export async function reviewTransactionCommission(client, { allocationId, action, amount = null, reason = '', paymentReference = '' }) {
  if (!text(allocationId)) throw new Error('Select the commission entry to review.')
  if (!['approve', 'mark_due', 'mark_paid', 'waive'].includes(action)) throw new Error('Choose a supported commission action.')
  if (action === 'waive' && !text(reason)) throw new Error('Add the reason for waiving this commission.')
  if (action === 'mark_paid' && !text(paymentReference)) throw new Error('Enter the reference for the payment already received.')
  if (amount !== null && (amount === '' || !Number.isFinite(Number(amount)) || Number(amount) < 0)) throw new Error('Enter a valid commission amount.')
  const { data, error } = await client.rpc('bridge_review_commission_allocation', {
    p_allocation_id: allocationId, p_action: action,
    p_approved_amount: amount === null ? null : Number(amount), p_reason: text(reason) || null,
    p_payment_reference: text(paymentReference) || null, p_metadata: { source: 'transaction_finance_workspace' },
  })
  if (error) throw error
  if (!data?.success) throw new Error(data?.code === 'admin_required' ? 'A finance administrator must review this commission.' : data?.code === 'allocation_locked' ? 'This commission is already settled. Refresh the transaction.' : 'The commission decision could not be saved. Refresh and try again.')
  return data
}
