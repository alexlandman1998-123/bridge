let googleMapsPromise: Promise<any> | null = null

const GOOGLE_MAPS_SCRIPT_ID = 'arch9-google-maps-js'
const GOOGLE_MAPS_SRC = 'https://maps.googleapis.com/maps/api/js'

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

    const resolveWhenReady = () => {
      const loadedGoogle = getExistingGoogle()
      if (loadedGoogle) {
        resolve(loadedGoogle)
        return
      }
      reject(new Error('Google Maps loaded, but the Places library is unavailable.'))
    }

    if (existingScript) {
      existingScript.addEventListener('load', resolveWhenReady, { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Google Maps failed to load.')), { once: true })
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
    script.addEventListener('error', () => reject(new Error('Google Maps failed to load.')))

    document.head.appendChild(script)
  }).catch((error) => {
    googleMapsPromise = null
    throw error
  })

  return googleMapsPromise
}
