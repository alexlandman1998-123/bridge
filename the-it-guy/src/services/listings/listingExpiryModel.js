export const listingExpiryToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export function listingExpiryError(value, { required = true, today = listingExpiryToday() } = {}) {
  if (!value) return required ? 'Choose a listing expiry date before publishing.' : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) return 'Choose a valid listing expiry date.'
  return value <= today ? 'Listing expiry must be a future date.' : ''
}
