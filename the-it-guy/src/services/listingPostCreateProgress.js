const STORAGE_PREFIX = 'itg:listing-post-create-progress:v1:'
export const LISTING_POST_CREATE_PROGRESS_EVENT = 'itg:listing-post-create-progress'

function storageKey(listingId = '') {
  const id = String(listingId || '').trim()
  return id ? `${STORAGE_PREFIX}${id}` : ''
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

export function readListingPostCreateProgress(listingId = '') {
  const key = storageKey(listingId)
  if (!key || !canUseStorage()) return null
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || 'null')
    return value && typeof value === 'object' ? value : null
  } catch {
    window.localStorage.removeItem(key)
    return null
  }
}

export function writeListingPostCreateProgress(listingId = '', patch = {}) {
  const key = storageKey(listingId)
  if (!key || !canUseStorage()) return null
  const current = readListingPostCreateProgress(listingId) || { listingId: String(listingId).trim(), tasks: {} }
  const next = {
    ...current,
    ...patch,
    listingId: String(listingId).trim(),
    tasks: { ...(current.tasks || {}), ...(patch.tasks || {}) },
    updatedAt: new Date().toISOString(),
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(LISTING_POST_CREATE_PROGRESS_EVENT, { detail: next }))
    void syncListingPostCreateTask({
      listingId,
      organisationId: next.organisationId,
      progress: next,
    }).catch((error) => console.warn('[Listings] post-create task persistence skipped', error))
  } catch (error) {
    console.warn('[Listings] post-create progress could not be saved', error)
  }
  return next
}

export function startListingPostCreateProgress(listingId = '', { imageCount = 0, portalInviteRequested = false, organisationId = '' } = {}) {
  return writeListingPostCreateProgress(listingId, {
    organisationId: String(organisationId || '').trim(),
    createdAt: new Date().toISOString(),
    completedAt: null,
    tasks: {
      listing: { status: 'complete', label: 'Listing created' },
      media: imageCount ? { status: 'in_progress', label: `Uploading ${imageCount} photo${imageCount === 1 ? '' : 's'}` } : { status: 'complete', label: 'Photos ready' },
      marketing: { status: 'pending', label: 'Preparing marketing data' },
      requirements: { status: 'pending', label: 'Preparing listing requirements' },
      sellerPortal: portalInviteRequested ? { status: 'pending', label: 'Preparing seller portal invitation' } : { status: 'skipped', label: 'Seller portal invitation not requested' },
    },
  })
}

export function completeListingPostCreateProgress(listingId = '') {
  return writeListingPostCreateProgress(listingId, { completedAt: new Date().toISOString() })
}
import { syncListingPostCreateTask } from './listingPostCreateTaskService'
