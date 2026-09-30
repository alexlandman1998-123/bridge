export function savedAttorneyMatterNumber(transaction = {}) {
  return String(transaction?.matter_number || '').trim()
}

export async function saveAttorneyMatterNumber(client, transactionId, matterNumber) {
  const normalized = String(matterNumber || '').trim()
  if (!transactionId || !normalized) throw new Error('Enter a matter number before saving.')
  if (normalized.length > 120) throw new Error('Matter numbers must be 120 characters or fewer.')

  const { data, error } = await client
    .from('transactions')
    .update({ matter_number: normalized })
    .eq('id', transactionId)
    .select('matter_number')
    .single()

  if (error?.code === '23505') throw new Error('That matter number is already used by another matter.')
  if (error) throw error
  if (!data?.matter_number) throw new Error('The matter number could not be confirmed. Please try again.')
  return data.matter_number
}
