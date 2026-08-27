const DEFAULT_META_APP_ID = '1010066162083846'
const DEFAULT_META_WHATSAPP_CONFIG_ID = '1078235214654031'
const DEFAULT_META_GRAPH_API_VERSION = 'v26.0'
const META_FACEBOOK_ORIGIN = 'https://www.facebook.com'
const FACEBOOK_SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js'

let facebookSdkPromise = null
let facebookSdkInitialized = false

function normalizeText(value) {
  return String(value || '').trim()
}

function safeObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value
  }
  return {}
}

export function getMetaWhatsAppConfig() {
  return {
    appId: normalizeText(import.meta.env.VITE_META_APP_ID) || DEFAULT_META_APP_ID,
    configId: normalizeText(import.meta.env.VITE_META_WHATSAPP_CONFIG_ID) || DEFAULT_META_WHATSAPP_CONFIG_ID,
    graphApiVersion: normalizeText(import.meta.env.VITE_META_GRAPH_API_VERSION) || DEFAULT_META_GRAPH_API_VERSION,
    embeddedSignupVersion: 'v4',
    sessionInfoVersion: '3',
    expectedOrigin: META_FACEBOOK_ORIGIN,
  }
}

export function loadFacebookSdkOnce() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Facebook SDK can only be loaded in the browser.'))
  }

  if (window.FB && typeof window.FB.login === 'function') {
    if (!facebookSdkInitialized && typeof window.FB.init === 'function') {
      const config = getMetaWhatsAppConfig()
      window.FB.init({
        appId: config.appId,
        cookie: true,
        xfbml: false,
        version: config.graphApiVersion,
      })
      facebookSdkInitialized = true
    }
    return Promise.resolve(window.FB)
  }

  if (facebookSdkPromise) return facebookSdkPromise

  facebookSdkPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('facebook-jssdk')
    if (existing) {
      const timeoutId = window.setTimeout(() => {
        window.clearInterval(waitForExisting)
        reject(new Error('Timed out waiting for the Facebook SDK.'))
      }, 15000)
      const waitForExisting = window.setInterval(() => {
        if (window.FB && typeof window.FB.login === 'function') {
          window.clearInterval(waitForExisting)
          window.clearTimeout(timeoutId)
          if (!facebookSdkInitialized && typeof window.FB.init === 'function') {
            const config = getMetaWhatsAppConfig()
            window.FB.init({
              appId: config.appId,
              cookie: true,
              xfbml: false,
              version: config.graphApiVersion,
            })
            facebookSdkInitialized = true
          }
          resolve(window.FB)
        }
      }, 50)
      return
    }

    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.src = FACEBOOK_SDK_SRC
    script.onload = () => {
      if (window.FB && typeof window.FB.login === 'function') {
        if (!facebookSdkInitialized && typeof window.FB.init === 'function') {
          const config = getMetaWhatsAppConfig()
          window.FB.init({
            appId: config.appId,
            cookie: true,
            xfbml: false,
            version: config.graphApiVersion,
          })
          facebookSdkInitialized = true
        }
        resolve(window.FB)
      } else {
        reject(new Error('Facebook SDK loaded without the expected login API.'))
      }
    }
    script.onerror = () => reject(new Error('Unable to load the Facebook SDK.'))
    document.head.appendChild(script)
  }).finally(() => {
    if (!window.FB || typeof window.FB.login !== 'function') {
      facebookSdkPromise = null
    }
  })

  return facebookSdkPromise
}

export function buildEmbeddedSignupLoginOptions(overrides = {}) {
  const config = getMetaWhatsAppConfig()
  return {
    ...safeObject(overrides),
    config_id: config.configId,
    response_type: 'code',
    override_default_response_type: true,
    extras: {
      setup: {},
      version: config.embeddedSignupVersion,
      sessionInfoVersion: config.sessionInfoVersion,
      ...safeObject(overrides.extras),
    },
  }
}

function extractCandidateCode(payload) {
  return normalizeText(
    payload.code ||
      payload.authResponse?.code ||
      payload.auth_response?.code ||
      payload.sessionInfo?.code ||
      payload.session_info?.code ||
      payload.oauth_code ||
      payload.sessionCode ||
      payload.session_code,
  )
}

export function parseEmbeddedSignupMessage(event) {
  if (!event || normalizeText(event.origin) !== META_FACEBOOK_ORIGIN) return null
  const payload = safeObject(event.data)
  const nestedPayload = safeObject(payload.data || payload.payload || payload.sessionInfo || payload.session_info)
  const eventType = normalizeText(
    payload.type ||
      payload.event_type ||
      nestedPayload.type ||
      nestedPayload.event_type,
  )

  if (eventType !== 'WA_EMBEDDED_SIGNUP') return null

  const phoneNumberId = normalizeText(
    nestedPayload.phone_number_id ||
      nestedPayload.phoneNumberId ||
      payload.phone_number_id ||
      payload.phoneNumberId ||
      payload.business_phone_number_id ||
      payload.businessPhoneNumberId,
  )
  const wabaId = normalizeText(
    nestedPayload.waba_id ||
      nestedPayload.wabaId ||
      payload.waba_id ||
      payload.wabaId ||
      payload.whatsapp_business_account_id ||
      payload.whatsappBusinessAccountId,
  )
  const code = extractCandidateCode({ ...payload, ...nestedPayload })
  const displayPhoneNumber = normalizeText(
    nestedPayload.display_phone_number ||
      nestedPayload.displayPhoneNumber ||
      payload.display_phone_number ||
      payload.displayPhoneNumber,
  )
  const businessDisplayName = normalizeText(
    nestedPayload.business_display_name ||
      nestedPayload.businessDisplayName ||
      payload.business_display_name ||
      payload.businessDisplayName,
  )
  const metaBusinessId = normalizeText(
    nestedPayload.business_id ||
      nestedPayload.businessId ||
      payload.business_id ||
      payload.businessId,
  )

  if (!code || !phoneNumberId || !wabaId) return null

  return {
    code,
    phoneNumberId,
    wabaId,
    displayPhoneNumber,
    businessDisplayName,
    metaBusinessId,
    raw: payload,
  }
}
