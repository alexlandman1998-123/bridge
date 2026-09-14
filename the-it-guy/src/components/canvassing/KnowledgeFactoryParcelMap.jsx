import { AlertCircle, Loader2, MapPin, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const DEFAULT_CENTER = { lat: -26.2041, lng: 28.0473 }
const SCRIPT_ID = 'arch9-google-maps-js'

function apiKey() {
  return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim()
}

function loadGoogleMaps(key) {
  if (window.google?.maps) return Promise.resolve(window.google.maps)
  const existing = document.getElementById(SCRIPT_ID)
  if (existing) return new Promise((resolve, reject) => {
    existing.addEventListener('load', () => resolve(window.google?.maps), { once: true })
    existing.addEventListener('error', () => reject(new Error('Google Maps could not be loaded.')), { once: true })
  })
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.async = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async`
    script.onload = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error('Google Maps did not initialise.'))
    script.onerror = () => reject(new Error('Google Maps could not be loaded.'))
    document.head.appendChild(script)
  })
}

function toBounds(map) {
  const bounds = map?.getBounds?.()
  if (!bounds) return null
  const northEast = bounds.getNorthEast()
  const southWest = bounds.getSouthWest()
  return { west: southWest.lng(), east: northEast.lng(), south: southWest.lat(), north: northEast.lat() }
}

export default function KnowledgeFactoryParcelMap({ properties = [], loading = false, onSearchArea, onFocusProperty, focusedProperty }) {
  const containerRef = useRef(null)
  const autocompleteRef = useRef(null)
  const mapRef = useRef(null)
  const polygonsRef = useRef([])
  const [state, setState] = useState({ status: apiKey() ? 'loading' : 'missing-key', error: '', autocompleteAvailable: false })

  useEffect(() => {
    const key = apiKey()
    if (!key || !containerRef.current) return undefined
    let active = true
    loadGoogleMaps(key).then(async (maps) => {
      if (!active || !maps) return
      const Map = typeof maps.importLibrary === 'function'
        ? (await maps.importLibrary('maps')).Map
        : maps.Map
      if (!active) return
      if (typeof Map !== 'function') throw new Error('Google Maps did not provide the map renderer.')
      const map = new Map(containerRef.current, { center: DEFAULT_CENTER, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: false })
      mapRef.current = map
      let autocompleteAvailable = false
      if (typeof maps.importLibrary === 'function' && autocompleteRef.current) {
        try {
          const { PlaceAutocompleteElement } = await maps.importLibrary('places')
          if (!active || !PlaceAutocompleteElement) return
          const autocomplete = new PlaceAutocompleteElement()
          autocomplete.placeholder = 'Search a South African address or suburb'
          autocomplete.includedRegionCodes = ['za']
          autocompleteRef.current.replaceChildren(autocomplete)
          autocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
            const place = placePrediction?.toPlace?.()
            if (!place) return
            await place.fetchFields({ fields: ['location', 'viewport'] })
            if (place.viewport) map.fitBounds(place.viewport)
            else if (place.location) { map.setCenter(place.location); map.setZoom(17) }
          })
          autocompleteAvailable = true
        } catch (error) {
          console.warn('Google Places autocomplete is unavailable; pan and zoom the map to search an area.', error)
        }
      }
      setState({ status: 'ready', error: '', autocompleteAvailable })
    }).catch((error) => {
      if (active) setState({ status: 'error', error: error?.message || 'Google Maps is unavailable.' })
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const maps = window.google?.maps
    const map = mapRef.current
    if (!maps || !map) return
    polygonsRef.current.forEach((polygon) => polygon.setMap(null))
    polygonsRef.current = properties.map((property) => {
      const polygon = new maps.Polygon({
        paths: property.polygon.map((point) => ({ lat: point.latitude, lng: point.longitude })),
        strokeColor: '#1769dc', strokeOpacity: 0.9, strokeWeight: focusedProperty?.id === property.id ? 4 : 2,
        fillColor: focusedProperty?.id === property.id ? '#1769dc' : '#4cc9f0', fillOpacity: focusedProperty?.id === property.id ? 0.32 : 0.18,
        map,
      })
      polygon.addListener('click', () => onFocusProperty?.(property))
      return polygon
    })
  }, [properties, focusedProperty?.id, onFocusProperty])

  if (state.status === 'missing-key' || state.status === 'error') {
    return <div className="grid min-h-[520px] flex-1 place-items-center bg-slate-50 p-6 text-center"><div className="max-w-md"><AlertCircle className="mx-auto text-amber-500" size={28} /><h3 className="mt-3 font-semibold text-slate-900">Map configuration is needed</h3><p className="mt-2 text-sm leading-6 text-slate-600">{state.status === 'missing-key' ? 'Set the browser-restricted VITE_GOOGLE_MAPS_API_KEY to activate the canvassing map.' : state.error}</p></div></div>
  }

  return <div className="relative min-h-[520px] flex-1 overflow-hidden bg-slate-100" data-testid="knowledge-factory-parcel-map">
    <div ref={containerRef} className="absolute inset-0" aria-label="Knowledge Factory parcel map" />
    <div className="absolute left-4 right-4 top-4 z-10 flex max-w-xl gap-2">
      <div ref={autocompleteRef} className={`min-h-11 min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${state.autocompleteAvailable ? '' : 'flex items-center px-3 text-sm text-slate-600'}`} aria-label="Search a South African address or suburb">{state.status === 'ready' && !state.autocompleteAvailable ? 'Pan and zoom to the address or suburb, then search this area.' : null}</div>
      <button type="button" disabled={loading || state.status !== 'ready'} onClick={() => { const bounds = toBounds(mapRef.current); if (bounds) onSearchArea?.(bounds) }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1769dc] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#1359bc] disabled:cursor-not-allowed disabled:opacity-60">{loading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}Search this area</button>
    </div>
    <div className="absolute left-4 top-20 z-10 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">{properties.length} parcels in view</div>
    {focusedProperty ? <article className="absolute bottom-4 left-4 z-10 w-[min(310px,calc(100%-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"><div className="flex items-start gap-3"><span className="mt-0.5 text-[#1769dc]"><MapPin size={18} /></span><div><h3 className="font-semibold text-slate-900">Property {focusedProperty.propertyId}</h3><p className="mt-1 text-sm text-slate-500">Erf {focusedProperty.erf ?? '—'} · Portion {focusedProperty.portion ?? '—'}</p><p className="mt-2 text-xs leading-5 text-slate-500">Report options are open in the panel on the right. No supplier request has been made.</p></div></div></article> : null}
  </div>
}
