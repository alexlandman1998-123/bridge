let googleMapsPromise: Promise<any> | null = null

const GOOGLE_MAPS_SCRIPT_ID = 'arch9-google-maps-js'
const GOOGLE_MAPS_SRC = 'https://maps.googleapis.com/maps/api/js'
const GOOGLE_MAPS_LOAD_TIMEOUT_MS = 10000

function getGoogleMapsApiKey() {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : {}
  return String(env?.VITE_GOOGLE_MAPS_API_KEY || '').trim()
}

function getExistingGoogle() {
  if (typeof window === 'undefined') return null
  const maybeGoogle = (window as any).google
  return maybeGoogle?.maps?.places ? maybeGoogle : null
}

export function hasGoogleMapsApiKey() {
  return Boolean(getGoogleMapsApiKey())
}

export function loadGoogleMaps() {
  const existingGoogle = getExistingGoogle()
  if (existingGoogle) return Promise.resolve(existingGoogle)

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Maps can only be loaded in the browser.'))
  }

  const apiKey = getGoogleMapsApiKey()
  if (!apiKey) {
    console.warn('[Google Maps] Missing VITE_GOOGLE_MAPS_API_KEY. Address autocomplete is disabled.')
    return Promise.reject(new Error('Missing VITE_GOOGLE_MAPS_API_KEY.'))
  }

  if (googleMapsPromise) return googleMapsPromise

  googleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null
    let settled = false

    const settleResolve = (google: any) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      resolve(google)
    }

    const settleReject = (error: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      reject(error)
    }

    const timeout = window.setTimeout(() => {
      settleReject(new Error('Google Maps took too long to load. Check that Maps JavaScript API and the Places library are enabled for this key.'))
    }, GOOGLE_MAPS_LOAD_TIMEOUT_MS)

    const resolveWhenReady = () => {
      const loadedGoogle = getExistingGoogle()
      if (loadedGoogle) {
        settleResolve(loadedGoogle)
        return
      }
      settleReject(new Error('Google Maps loaded, but the Places library is unavailable. Enable Maps JavaScript API and Places API for this key.'))
    }

    if (existingScript) {
      existingScript.addEventListener('load', resolveWhenReady, { once: true })
      existingScript.addEventListener('error', () => settleReject(new Error('Google Maps failed to load.')), { once: true })
      if ((existingScript as any).dataset.loaded === 'true') resolveWhenReady()
      return
    }

    const script = document.createElement('script')
    script.id = GOOGLE_MAPS_SCRIPT_ID
    script.src = `${GOOGLE_MAPS_SRC}?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`
    script.async = true
    script.defer = true
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      resolveWhenReady()
    })
    script.addEventListener('error', () => settleReject(new Error('Google Maps failed to load.')))

    document.head.appendChild(script)
  }).catch((error) => {
    googleMapsPromise = null
    throw error
  })

  return googleMapsPromise
}
