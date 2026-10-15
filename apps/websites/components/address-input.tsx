'use client'

import { InputHTMLAttributes, useEffect, useId, useRef, useState } from 'react'
import styles from './address-input.module.css'

type AddressDetails = { formattedAddress: string; streetAddress: string; suburb: string; city: string; province: string; postalCode: string; country: string }
type Place = { formattedAddress?: string; addressComponents?: { longText: string; types: string[] }[]; fetchFields(options: { fields: string[] }): Promise<unknown> }
type Prediction = { placeId: string; text: { toString(): string }; toPlace(): Place }
type Places = {
  AutocompleteSessionToken: new () => object
  AutocompleteSuggestion: { fetchAutocompleteSuggestions(request: object): Promise<{ suggestions: { placePrediction?: Prediction }[] }> }
}
type MapsWindow = Window & { google?: { maps?: { importLibrary(name: string): Promise<Places> } }; __arch9WebsitePlacesReady?: () => void }
let loading: Promise<Places> | null = null

function loadPlaces(): Promise<Places> {
  const maps = (window as MapsWindow).google?.maps
  if (maps?.importLibrary) return maps.importLibrary('places')
  if (loading) return loading
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key) return Promise.reject(new Error('Address search is unavailable. You can enter the address manually.'))
  loading = new Promise<Places>((resolve, reject) => {
    const script = document.createElement('script')
    const timeout = window.setTimeout(() => reject(new Error('Address search is taking longer than expected. You can enter the address manually.')), 30000)
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&v=weekly&loading=async&callback=__arch9WebsitePlacesReady`
    script.async = true
    ;(window as MapsWindow).__arch9WebsitePlacesReady = () => {
      const ready = (window as MapsWindow).google?.maps
      if (!ready?.importLibrary) { window.clearTimeout(timeout); reject(new Error('Address search is unavailable. You can enter the address manually.')); return }
      ready.importLibrary('places').then(resolve, reject).finally(() => window.clearTimeout(timeout))
    }
    script.onerror = () => { window.clearTimeout(timeout); reject(new Error('Address search is unavailable. You can enter the address manually.')) }
    document.head.appendChild(script)
  }).catch(error => { loading = null; throw error })
  return loading
}

function bounded<T>(request: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Address search timed out. You can enter the address manually.')), 7000)
    request.then(resolve, reject).finally(() => window.clearTimeout(timer))
  })
}

type Props = InputHTMLAttributes<HTMLInputElement> & { onAddressSelect?: (address: AddressDetails) => void }
export function AddressInput({ value: controlledValue, defaultValue = '', onChange, onAddressSelect, ...props }: Props) {
  const listId = useId()
  const [manualValue, setValue] = useState(String(defaultValue))
  const value = String(controlledValue ?? manualValue)
  const [places, setPlaces] = useState<Places | null>(null)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [active, setActive] = useState(-1)
  const [focused, setFocused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const token = useRef<object | null>(null)
  const selected = useRef(false)
  const requestId = useRef(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const form = input.current?.form
    if (!form || controlledValue !== undefined) return
    const reset = () => { requestId.current += 1; selected.current = false; token.current = null; setValue(String(defaultValue)); setPredictions([]); setActive(-1); setBusy(false); setNotice('') }
    form.addEventListener('reset', reset)
    return () => form.removeEventListener('reset', reset)
  }, [defaultValue, controlledValue])

  useEffect(() => {
    const id = ++requestId.current
    if (!places || !focused || selected.current || value.trim().length < 3) return
    const timer = window.setTimeout(() => {
      token.current ||= new places.AutocompleteSessionToken()
      setBusy(true)
      bounded(places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: value.trim(), includedRegionCodes: ['za'], sessionToken: token.current }))
        .then(result => {
          if (id !== requestId.current) return
          setPredictions(result.suggestions.flatMap(row => row.placePrediction ? [row.placePrediction] : []))
          setActive(-1)
        })
        .catch(() => { if (id === requestId.current) setNotice('Address search is unavailable. You can enter the address manually.') })
        .finally(() => { if (id === requestId.current) setBusy(false) })
    }, 300)
    return () => { window.clearTimeout(timer); requestId.current += 1 }
  }, [places, value, focused])

  async function choose(prediction: Prediction) {
    const id = ++requestId.current
    setPredictions([]); setBusy(true)
    try {
      const place = prediction.toPlace()
      await bounded(place.fetchFields({ fields: ['formattedAddress', 'addressComponents'] }))
      if (id !== requestId.current || !place.formattedAddress) return
      selected.current = true
      setValue(place.formattedAddress)
      const part = (...types: string[]) => place.addressComponents?.find(component => component.types.some(type => types.includes(type)))?.longText || ''
      onAddressSelect?.({ formattedAddress: place.formattedAddress, streetAddress: [part('street_number'), part('route')].filter(Boolean).join(' '), suburb: part('sublocality_level_1', 'sublocality', 'neighborhood'), city: part('locality', 'administrative_area_level_2'), province: part('administrative_area_level_1'), postalCode: part('postal_code'), country: part('country') })
      token.current = null
      setNotice('')
    } catch { if (id === requestId.current) setNotice('This address could not be loaded. You can enter it manually.') }
    finally { if (id === requestId.current) setBusy(false) }
  }

  return <div className={styles.field}>
    <input {...props} ref={input} value={value} autoComplete="off" role="combobox" aria-autocomplete="list"
      aria-controls={listId} aria-expanded={focused && predictions.length > 0}
      aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      onFocus={event => {
        setFocused(true)
        if (!places && !props.disabled && !props.readOnly) void loadPlaces().then(setPlaces).catch(error => setNotice(error.message))
        props.onFocus?.(event)
      }}
      onBlur={event => { setFocused(false); props.onBlur?.(event) }}
      onChange={event => {
        selected.current = false; requestId.current += 1; setPredictions([]); setNotice(''); setValue(event.target.value); onChange?.(event)
      }}
      onKeyDown={event => {
        if (predictions.length && event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, predictions.length - 1)) }
        else if (predictions.length && event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)) }
        else if (event.key === 'Enter' && active >= 0 && predictions[active]) { event.preventDefault(); void choose(predictions[active]) }
        else if (event.key === 'Escape') { setPredictions([]); requestId.current += 1 }
        props.onKeyDown?.(event)
      }} />
    {focused && predictions.length ? <div className={styles.suggestions}><ul id={listId} role="listbox" aria-label="Google address suggestions">{predictions.map((prediction, index) => <li key={prediction.placeId} id={`${listId}-${index}`} role="option" aria-selected={index === active}><button className={styles.option} type="button" onMouseDown={event => event.preventDefault()} onClick={() => void choose(prediction)}>{prediction.text.toString()}</button></li>)}</ul><small>Powered by Google</small></div> : null}
    {busy ? <small role="status">Finding the address…</small> : notice ? <small role="status">{notice}</small> : null}
  </div>
}
