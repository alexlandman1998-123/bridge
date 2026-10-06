// External links have their own database status vocabulary, separate from portals.
export function normalizeListingExternalLinkStatus(value = '') {
  const status = String(value ?? '').trim().toLowerCase()
  const statuses = {
    '': 'Draft',
    draft: 'Draft',
    submitted: 'Draft',
    failed: 'Draft',
    live: 'Live',
    active: 'Live',
    published: 'Published',
    on_portal: 'Published',
    removed: 'Removed',
    paused: 'Removed',
    inactive: 'Removed',
    withdrawn: 'Removed',
    expired: 'Expired',
  }
  if (!Object.hasOwn(statuses, status)) {
    throw new Error('External listing link status is invalid. Choose Draft, Live, Published, Removed or Expired before saving.')
  }
  return statuses[status]
}
