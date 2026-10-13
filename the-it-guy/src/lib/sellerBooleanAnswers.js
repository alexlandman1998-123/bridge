// A present answer, including false, blank or unknown, supersedes older aliases.
// Callers supply current form values first and historical fallbacks last.
export function readSellerBooleanAnswer(...values) {
  const value = values.find((entry) => entry !== undefined && entry !== null)
  if (typeof value === 'boolean') return value
  return ['true', 'yes', 'y', '1', 'on', 'accepted', 'enabled'].includes(String(value ?? '').trim().toLowerCase())
}
