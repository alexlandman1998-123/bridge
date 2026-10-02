// Preserve an explicit answer (including false and unknown) before considering
// compatibility aliases. Unknown must never become a declaration of no bond.
export function resolveSellerBondStatus(...values) {
  const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== '')
  const key = String(value ?? '').trim().toLowerCase()
  if (['true', 'yes', '1', 'active', 'bonded'].includes(key)) return 'bonded'
  if (['false', 'no', '0', 'none', 'no_bond'].includes(key)) return 'no_bond'
  return 'unknown'
}

export function sellerBondDeclaration(status) {
  const normalized = resolveSellerBondStatus(status)
  return normalized === 'unknown' ? null : normalized === 'bonded'
}
