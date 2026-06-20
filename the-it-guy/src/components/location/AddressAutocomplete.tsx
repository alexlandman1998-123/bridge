import { Loader2, MapPin, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadGoogleMaps, hasGoogleMapsApiKey } from '../../lib/googleMaps'
import { cn } from '../../lib/utils'
import { Input } from '../ui/input'

export type AddressAutocompleteValue = {
  formattedAddress: string
  streetAddress?: string
  suburb?: string
  city?: string
  province?: string
  country?: string
  postalCode?: string
  latitude?: number
  longitude?: number
  placeId?: string
}

export type AddressAutocompleteProps = {
  value?: AddressAutocompleteValue | null
  onChange: (value: AddressAutocompleteValue | null) => void
  placeholder?: string
  label?: string
  description?: string
  required?: boolean
  disabled?: boolean
  error?: string
}

type Prediction = {
  description: string
  place_id: string
  structured_formatting?: {
    main_text?: string
    secondary_text?: string
  }
}

const DETAIL_FIELDS = ['address_components', 'formatted_address', 'geometry', 'place_id']

function getComponent(components: any[] = [], types: string[]) {
  const match = components.find((component) => types.some((type) => component.types?.includes(type)))
  return String(match?.long_name || '').trim()
}

function mapPlaceToAddress(place: any): AddressAutocompleteValue {
  const components = Array.isArray(place?.address_components) ? place.address_components : []
  const streetNumber = getComponent(components, ['street_number'])
  const route = getComponent(components, ['route'])
  const streetAddress = [streetNumber, route].filter(Boolean).join(' ').trim()
  const sublocality = getComponent(components, ['sublocality', 'sublocality_level_1', 'sublocality_level_2'])
  const neighborhood = getComponent(components, ['neighborhood'])
  const city = getComponent(components, ['locality']) || getComponent(components, ['administrative_area_level_2'])
  const formattedAddress = String(place?.formatted_address || '').trim()
  const location = place?.geometry?.location

  return {
    formattedAddress,
    streetAddress: streetAddress || formattedAddress,
    suburb: sublocality || neighborhood,
    city,
    province: getComponent(components, ['administrative_area_level_1']),
    country: getComponent(components, ['country']) || 'South Africa',
    postalCode: getComponent(components, ['postal_code']),
    latitude: typeof location?.lat === 'function' ? location.lat() : undefined,
    longitude: typeof location?.lng === 'function' ? location.lng() : undefined,
    placeId: String(place?.place_id || '').trim(),
  }
}

export default function AddressAutocomplete({
  value = null,
  onChange,
  placeholder = 'Start typing an address...',
  label,
  description,
  required = false,
  disabled = false,
  error = '',
}: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value?.formattedAddress || '')
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [isLoadingMaps, setIsLoadingMaps] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [googleApi, setGoogleApi] = useState<any>(null)
  const autocompleteServiceRef = useRef<any>(null)
  const placesServiceRef = useRef<any>(null)
  const requestIdRef = useRef(0)

  const isApiKeyAvailable = hasGoogleMapsApiKey()
  const isDisabled = disabled || !isApiKeyAvailable || Boolean(loadError)

  useEffect(() => {
    setInputValue(value?.formattedAddress || '')
  }, [value?.formattedAddress])

  useEffect(() => {
    if (disabled || !isApiKeyAvailable) {
      if (!isApiKeyAvailable) {
        console.warn('[Google Maps] Missing VITE_GOOGLE_MAPS_API_KEY. Address autocomplete is disabled.')
      }
      return
    }

    let cancelled = false
    setIsLoadingMaps(true)
    loadGoogleMaps()
      .then((google) => {
        if (cancelled) return
        setGoogleApi(google)
        autocompleteServiceRef.current = new google.maps.places.AutocompleteService()
        placesServiceRef.current = new google.maps.places.PlacesService(document.createElement('div'))
        setLoadError('')
      })
      .catch((loadProblem) => {
        if (cancelled) return
        setLoadError(loadProblem?.message || 'Address autocomplete could not load.')
        console.warn('[Google Maps] Address autocomplete unavailable.', loadProblem)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMaps(false)
      })

    return () => {
      cancelled = true
    }
  }, [disabled, isApiKeyAvailable])

  useEffect(() => {
    if (!googleApi || isDisabled || inputValue.trim().length < 3) {
      setPredictions([])
      setIsFetching(false)
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsFetching(true)

    const timer = window.setTimeout(() => {
      autocompleteServiceRef.current?.getPlacePredictions(
        {
          input: inputValue.trim(),
          componentRestrictions: { country: 'za' },
          types: ['address'],
        },
        (results: Prediction[] | null, status: string) => {
          if (requestIdRef.current !== requestId) return
          setIsFetching(false)
          const placesStatus = googleApi.maps.places.PlacesServiceStatus
          if (status === placesStatus.OK && Array.isArray(results)) {
            setPredictions(results)
            setIsOpen(true)
            setActiveIndex(-1)
            return
          }
          if (status === placesStatus.ZERO_RESULTS) {
            setPredictions([])
            setIsOpen(true)
            return
          }
          setPredictions([])
          setLoadError('Address suggestions are temporarily unavailable.')
        },
      )
    }, 300)

    return () => window.clearTimeout(timer)
  }, [googleApi, inputValue, isDisabled])

  const helperText = useMemo(() => {
    if (error) return error
    if (!isApiKeyAvailable) return 'Google Places is not configured for this environment.'
    if (loadError) return loadError
    return description
  }, [description, error, isApiKeyAvailable, loadError])

  function handleClear() {
    setInputValue('')
    setPredictions([])
    setIsOpen(false)
    onChange(null)
  }

  function handleSelect(prediction: Prediction) {
    if (!prediction?.place_id || !placesServiceRef.current) return
    setIsFetching(true)
    placesServiceRef.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: DETAIL_FIELDS,
      },
      (place: any, status: string) => {
        setIsFetching(false)
        const placesStatus = googleApi?.maps?.places?.PlacesServiceStatus
        if (status !== placesStatus?.OK || !place) {
          setLoadError('Selected address details could not be loaded.')
          return
        }
        const mapped = mapPlaceToAddress(place)
        setInputValue(mapped.formattedAddress)
        setPredictions([])
        setIsOpen(false)
        setActiveIndex(-1)
        onChange(mapped)
      },
    )
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, predictions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter' && activeIndex >= 0 && predictions[activeIndex]) {
      event.preventDefault()
      handleSelect(predictions[activeIndex])
    } else if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div className="relative grid gap-2">
      {label ? (
        <label className="text-sm font-semibold text-[#2d445e]">
          {label}
          {required ? <span className="ml-1 text-[#b42318]">*</span> : null}
        </label>
      ) : null}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8aa0b6]" />
        <Input
          value={inputValue}
          onChange={(event) => {
            const nextValue = event.target.value
            setInputValue(nextValue)
            setLoadError('')
            if (!nextValue.trim()) onChange(null)
          }}
          onFocus={() => {
            if (predictions.length || inputValue.trim().length >= 3) setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          required={required}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-invalid={Boolean(error)}
          className={cn(
            'h-12 rounded-[16px] border-[#dbe6f2] pl-10 pr-20 shadow-[0_10px_24px_rgba(15,23,42,0.06)]',
            error ? 'border-[#f1c8c8] focus:border-[#d92d20] focus:ring-[#fef3f2]' : '',
          )}
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {isLoadingMaps || isFetching ? <Loader2 className="h-4 w-4 animate-spin text-[#607387]" /> : null}
          {inputValue && !disabled ? (
            <button
              type="button"
              onClick={handleClear}
              className="grid h-8 w-8 place-items-center rounded-full text-[#8aa0b6] transition hover:bg-[#eef4fa] hover:text-[#142132]"
              aria-label="Clear address"
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
      </div>
      {helperText ? (
        <p className={cn('text-xs leading-5 text-[#607387]', error || loadError || !isApiKeyAvailable ? 'text-[#b42318]' : '')}>
          {helperText}
        </p>
      ) : null}
      {isOpen && !isDisabled ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-auto rounded-[18px] border border-[#dbe6f2] bg-white p-1 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
          {isFetching ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-[#607387]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching South African addresses...
            </div>
          ) : predictions.length ? (
            <ul role="listbox" className="grid gap-1">
              {predictions.map((prediction, index) => (
                <li key={prediction.place_id}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(prediction)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-[14px] px-3 py-3 text-left transition',
                      activeIndex === index ? 'bg-[#eef5fb]' : 'hover:bg-[#f6f9fc]',
                    )}
                    role="option"
                    aria-selected={activeIndex === index}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#2f6fed]" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[#142132]">
                        {prediction.structured_formatting?.main_text || prediction.description}
                      </span>
                      {prediction.structured_formatting?.secondary_text ? (
                        <span className="mt-0.5 block truncate text-xs text-[#607387]">
                          {prediction.structured_formatting.secondary_text}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-4 text-sm text-[#607387]">No South African addresses found.</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
