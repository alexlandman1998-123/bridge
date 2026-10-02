// Missing supplier values must never become a zero or a negative assertion.
export function suppliedNumber(value) {
  return (typeof value === 'number' || typeof value === 'string' && value.trim() !== '')
    && Number.isFinite(Number(value));
}

export function reportMoney(value) {
  return suppliedNumber(value)
    ? `R${Number(value).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}`
    : 'Not supplied';
}

export function ownerDetails(owner = {}) {
  return [owner.name || 'Name not supplied', owner.type || 'Type not supplied',
    owner.share !== null && owner.share !== undefined && owner.share !== ''
      ? `Share: ${owner.share}` : 'Share not supplied'];
}

export function financeIndicator(value) {
  return value === true ? 'Recorded' : value === false ? 'Supplier indicates no bond' : 'Not supplied';
}

export function transferScope(data = {}) {
  return data.transferHistory?.hasMore === true
    ? 'Up to five most recent registration records are shown; earlier transfers exist.'
    : data.transferHistory?.hasMore === false
      ? 'All transfer records returned for this property are shown, newest registration first.'
      : 'Selected supplier transfer records only; completeness and selection order are not confirmed for this older snapshot.';
}
