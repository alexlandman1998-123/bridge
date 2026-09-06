function text(value) {
  return String(value || '').trim()
}

// This is deliberately pure: it guards the transaction-creation command
// before it performs profile lookup, routing, or any database write.
export function assertTransactionCreationInput({
  setup = {},
  transactionType = 'developer_sale',
  propertyType = null,
  allowIncomplete = false,
} = {}) {
  if (transactionType === 'developer_sale' && (!setup?.developmentId || !setup?.unitId)) {
    throw new Error('Development and unit are required.')
  }

  if (transactionType === 'private_property' && !propertyType) {
    throw new Error('Property category is required for a private property transaction.')
  }

  if (transactionType === 'private_property' && !text(setup?.propertyAddressLine1)) {
    throw new Error('Property address is required for a private matter.')
  }

  if (transactionType === 'private_property' && !text(setup?.city)) {
    throw new Error('City is required for a private matter.')
  }

  if (!allowIncomplete && !text(setup?.buyerName)) {
    throw new Error('Buyer full name is required.')
  }
}
