const STORAGE_PREFIX = 'bridge:seller-portal-access:'
const text = (value) => String(value || '').trim()
const storageKey = (token) => text(token) ? `${STORAGE_PREFIX}${text(token)}` : ''

export function getStoredSellerPortalAccessToken(token = '') {
  if (typeof window === 'undefined' || !window.localStorage) return ''
  const key = storageKey(token)
  if (!key) return ''
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || '{}')
    const accessToken = text(value?.accessToken)
    const expiresAt = text(value?.expiresAt)
    if (!accessToken) return ''
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      window.localStorage.removeItem(key)
      return ''
    }
    return accessToken
  } catch {
    window.localStorage.removeItem(key)
    return ''
  }
}

export function clearSellerPortalAccessToken(token = '') {
  if (typeof window === 'undefined' || !window.localStorage) return
  const key = storageKey(token)
  if (key) window.localStorage.removeItem(key)
}

export function isSellerPortalAuthRequiredError(error = null) {
  return Boolean(error?.code === 'seller_portal_auth_required' || error?.portalAuth?.authRequired)
}

export function isSellerPortalSessionExpiredError(error = null) {
  const message = text(error?.message || error).toLowerCase()
  return Boolean(error?.code === 'seller_portal_session_expired' || message.includes('seller portal session has expired') || message.includes('seller portal password is required'))
}

let servicePromise = null
function loadService() {
  servicePromise ||= import('../services/privateListingService')
  return servicePromise
}
const call = async (method, ...args) => (await loadService())[method](...args)
const METHODS = [
  'completeSellerPortalPasswordRecovery', 'createSellerClientPortalDocumentSignedUrl',
  'fetchSellerPortalActivationTermsConfig', 'getPrivateListingActivity', 'getSellerOnboardingByToken',
  'requestSellerPortalPasswordRecovery', 'recordSellerPortalActivationTerms',
  'resolveSellerClientPortalFinalSignedDocumentAccess', 'setSellerPortalPassword',
  'uploadSellerClientPortalDocument', 'verifySellerPortalPassword',
]
const operations = Object.fromEntries(METHODS.map((method) => [method, (...args) => call(method, ...args)]))
export const {
  completeSellerPortalPasswordRecovery, createSellerClientPortalDocumentSignedUrl,
  fetchSellerPortalActivationTermsConfig, getPrivateListingActivity, getSellerOnboardingByToken,
  requestSellerPortalPasswordRecovery, recordSellerPortalActivationTerms,
  resolveSellerClientPortalFinalSignedDocumentAccess, setSellerPortalPassword,
  uploadSellerClientPortalDocument, verifySellerPortalPassword,
} = operations
