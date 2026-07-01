import { Loader2, MapPin, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadGoogleMaps, hasGoogleMapsApiKey } from '../../lib/googleMaps'
import { cn } from '../../lib/utils'
import { Input } from '../ui/input'

export type AddressAutocompleteValue = {
  formattedAddress: string
  streetNumber?: string
  route?: string
  streetName?: string
  streetAddress?: string
  suburb?: string
  city?: string
  province?: string
  country?: string
  postalCode?: string
  latitude?: number
  longitude?: number
  placeId?: string
  googlePlaceId?: string
  addressComponents?: any[]
  rawGoogleResponse?: any
}

export type AddressAutocompleteProps = {
  value?: AddressAutocompleteValue | null
  onChange: (value: AddressAutocompleteValue | null) => void
  onInputValueChange?: (value: string) => void
  predictionTypes?: string[]
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
  source?: 'modern' | 'legacy'
  placePrediction?: any
}

const DETAIL_FIELDS = ['address_components', 'formatted_address', 'geometry', 'place_id']
const MODERN_DETAIL_FIELDS = ['addressComponents', 'formattedAddress', 'location', 'id']
const PLACES_REQUEST_TIMEOUT_MS = 7000

function getComponent(components: any[] = [], types: string[]) {
  const match = components.find((component) => types.some((type) => component.types?.includes(type)))
  return String(match?.long_name || match?.longText || '').trim()
}

function mapPlaceToAddress(place: any): AddressAutocompleteValue {
  const components = Array.isArray(place?.address_components)
    ? place.address_components
    : Array.isArray(place?.addressComponents)
      ? place.addressComponents
      : []
  const streetNumber = getComponent(components, ['street_number'])
  const route = getComponent(components, ['route'])
  const streetAddress = [streetNumber, route].filter(Boolean).join(' ').trim()
  const sublocality = getComponent(components, ['sublocality', 'sublocality_level_1', 'sublocality_level_2'])
  const neighborhood = getComponent(components, ['neighborhood'])
  const city = getComponent(components, ['locality']) || getComponent(components, ['administrative_area_level_2'])
  const formattedAddress = String(place?.formatted_address || place?.formattedAddress || '').trim()
  const location = place?.geometry?.location
  const modernLocation = place?.location

  return {
    formattedAddress,
    streetNumber,
    route,
    streetName: route,
    streetAddress: streetAddress || formattedAddress,
    suburb: sublocality || neighborhood,
    city,
    province: getComponent(components, ['administrative_area_level_1']),
    country: getComponent(components, ['country']) || 'South Africa',
    postalCode: getComponent(components, ['postal_code']),
    latitude:
      typeof location?.lat === 'function'
        ? location.lat()
        : typeof modernLocation?.lat === 'function'
          ? modernLocation.lat()
          : typeof modernLocation?.lat === 'number'
            ? modernLocation.lat
            : undefined,
    longitude:
      typeof location?.lng === 'function'
        ? location.lng()
        : typeof modernLocation?.lng === 'function'
          ? modernLocation.lng()
          : typeof modernLocation?.lng === 'number'
            ? modernLocation.lng
            : undefined,
    placeId: String(place?.place_id || place?.id || '').trim(),
    googlePlaceId: String(place?.place_id || place?.id || '').trim(),
    addressComponents: components,
    rawGoogleResponse: place,
  }
}

function textValue(value: any) {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value?.toString === 'function') {
    const nextValue = value.toString()
    if (nextValue && nextValue !== '[object Object]') return String(nextValue).trim()
  }
  return String(value?.text || value?.value || '').trim()
}

function mapModernSuggestion(suggestion: any): Prediction | null {
  const placePrediction = suggestion?.placePrediction
  if (!placePrediction) return null
  const mainText = textValue(placePrediction.mainText || placePrediction.structuredFormat?.mainText)
  const secondaryText = textValue(placePrediction.secondaryText || placePrediction.structuredFormat?.secondaryText)
  const description =
    textValue(placePrediction.text) ||
    [mainText, secondaryText].filter(Boolean).join(', ') ||
    textValue(placePrediction.place)
  if (!description) return null

  return {
    description,
    place_id: String(placePrediction.placeId || placePrediction.place || description),
    structured_formatting: {
      main_text: mainText || description,
      secondary_text: secondaryText,
    },
    source: 'modern',
    placePrediction,
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMessage: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(timeoutMessage)), PLACES_REQUEST_TIMEOUT_MS)
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeout))
  })
}

export default function AddressAutocomplete({
  value = null,
  onChange,
  onInputValueChange,
  predictionTypes,
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
  const [noticeText, setNoticeText] = useState('')
  const [isAutocompleteUnavailable, setIsAutocompleteUnavailable] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [googleApi, setGoogleApi] = useState<any>(null)
  const autocompleteServiceRef = useRef<any>(null)
  const placesServiceRef = useRef<any>(null)
  const placesLibraryRef = useRef<any>(null)
  const sessionTokenRef = useRef<any>(null)
  const modernAutocompleteUnavailableRef = useRef(false)
  const requestIdRef = useRef(0)
  const lastTypedValueRef = useRef('')
  const suppressNextSearchRef = useRef(Boolean(value?.formattedAddress))

  const isApiKeyAvailable = hasGoogleMapsApiKey()
  const canSearchGoogle = !disabled && isApiKeyAvailable && !loadError && !isAutocompleteUnavailable
  const isDisabled = disabled

  useEffect(() => {
    const nextValue = value?.formattedAddress || ''
    setInputValue(nextValue)
    if (nextValue !== lastTypedValueRef.current) {
      requestIdRef.current += 1
      suppressNextSearchRef.current = true
      setPredictions([])
      setIsOpen(false)
      setIsFetching(false)
      setActiveIndex(-1)
    }
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
    setIsAutocompleteUnavailable(false)
    setNoticeText('')
    loadGoogleMaps()
      .then(async (google) => {
        if (cancelled) return
        const placesLibrary =
          typeof google?.maps?.importLibrary === 'function'
            ? await google.maps.importLibrary('places').catch((libraryError: unknown) => {
                console.warn('[Google Maps] Modern Places library unavailable; trying legacy Places services.', libraryError)
                return null
              })
            : null
        if (cancelled) return
        setGoogleApi(google)
        placesLibraryRef.current = placesLibrary
        if (!placesLibrary?.AutocompleteSuggestion && google.maps.places?.AutocompleteService) {
          autocompleteServiceRef.current = new google.maps.places.AutocompleteService()
        }
        if (google.maps.places?.PlacesService) {
          placesServiceRef.current = new google.maps.places.PlacesService(document.createElement('div'))
        }
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
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false
      setPredictions([])
      setIsFetching(false)
      setIsOpen(false)
      setActiveIndex(-1)
      return
    }

    if (!googleApi || !canSearchGoogle || inputValue.trim().length < 3) {
      setPredictions([])
      setIsFetching(false)
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsFetching(true)

    const timer = window.setTimeout(() => {
      const placesLibrary = placesLibraryRef.current
      const modernAutocomplete = placesLibrary?.AutocompleteSuggestion

      const disableAddressSuggestions = (reason: any = null) => {
        setIsFetching(false)
        setPredictions([])
        setIsOpen(false)
        setActiveIndex(-1)
        setLoadError('')
        setNoticeText('Address suggestions are unavailable. You can keep typing manually.')
        setIsAutocompleteUnavailable(true)
        if (reason) {
          console.warn('[Google Maps] Address autocomplete unavailable; manual entry remains enabled.', reason)
        }
      }

      const fetchLegacyPredictions = (fallbackReason: any = null) => {
        if (!autocompleteServiceRef.current) {
          disableAddressSuggestions(fallbackReason)
          return
        }

        let completed = false
        const timeout = window.setTimeout(() => {
          if (completed || requestIdRef.current !== requestId) return
          completed = true
          setIsFetching(false)
          setPredictions([])
          setIsOpen(false)
          setLoadError('')
          setNoticeText('Address suggestions timed out. You can keep typing manually.')
        }, PLACES_REQUEST_TIMEOUT_MS)

        autocompleteServiceRef.current.getPlacePredictions(
          {
            input: inputValue.trim(),
            componentRestrictions: { country: 'za' },
            types: predictionTypes && predictionTypes.length ? predictionTypes : ['address'],
          },
          (results: Prediction[] | null, status: string) => {
            if (completed) return
            completed = true
            window.clearTimeout(timeout)
            if (requestIdRef.current !== requestId) return
            setIsFetching(false)
            const placesStatus = googleApi.maps.places.PlacesServiceStatus
            if (status === placesStatus.OK && Array.isArray(results)) {
              setLoadError('')
              setPredictions(results.map((result) => ({ ...result, source: 'legacy' })))
              setIsOpen(true)
              setActiveIndex(-1)
              return
            }
            if (status === placesStatus.ZERO_RESULTS) {
              setLoadError('')
              setPredictions([])
              setIsOpen(true)
              return
            }
            setPredictions([])
            setIsOpen(false)
            setLoadError('')
            setNoticeText('Address suggestions are unavailable. You can keep typing manually.')
          },
        )
      }

      if (modernAutocomplete?.fetchAutocompleteSuggestions && !modernAutocompleteUnavailableRef.current) {
        if (!sessionTokenRef.current && placesLibrary?.AutocompleteSessionToken) {
          sessionTokenRef.current = new placesLibrary.AutocompleteSessionToken()
        }

        withTimeout(
          modernAutocomplete.fetchAutocompleteSuggestions({
            input: inputValue.trim(),
            includedRegionCodes: ['za'],
            sessionToken: sessionTokenRef.current,
          }),
          'Address suggestions timed out. You can keep typing manually, or check the Google Maps JavaScript API and Places API settings.',
        )
          .then((response: any) => {
            if (requestIdRef.current !== requestId) return
            const nextPredictions = Array.isArray(response?.suggestions)
              ? response.suggestions.map(mapModernSuggestion).filter(Boolean)
              : []
            setIsFetching(false)
            setPredictions(nextPredictions)
            setIsOpen(true)
            setActiveIndex(-1)
          })
          .catch((suggestionError: any) => {
            if (requestIdRef.current !== requestId) return
            modernAutocompleteUnavailableRef.current = true
            console.warn('[Google Maps] Modern Places autocomplete failed; retrying with legacy Places service.', suggestionError)
            fetchLegacyPredictions(suggestionError)
          })
        return
      }

      fetchLegacyPredictions()
    }, 300)

    return () => window.clearTimeout(timer)
  }, [googleApi, inputValue, canSearchGoogle, predictionTypes])

  const helperText = useMemo(() => {
    if (error) return error
    if (!isApiKeyAvailable) return 'Google Places is not configured for this environment.'
    if (loadError) return loadError
    if (noticeText) return noticeText
    return description
  }, [description, error, isApiKeyAvailable, loadError, noticeText])

  function handleClear() {
    requestIdRef.current += 1
    lastTypedValueRef.current = ''
    suppressNextSearchRef.current = true
    setInputValue('')
    setPredictions([])
    setIsOpen(false)
    setIsFetching(false)
    sessionTokenRef.current = null
    onChange(null)
  }

  function fetchLegacyPlaceDetails(prediction: Prediction, onComplete?: () => void) {
    if (!placesServiceRef.current) {
      setIsFetching(false)
      setLoadError('Selected address details could not be loaded because Google Places details are unavailable for this key.')
      onComplete?.()
      return
    }

    let completed = false
    const timeout = window.setTimeout(() => {
      if (completed) return
      completed = true
      setIsFetching(false)
      setLoadError('Selected address details timed out. You can keep the typed address manually.')
      onComplete?.()
    }, PLACES_REQUEST_TIMEOUT_MS)

    placesServiceRef.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: DETAIL_FIELDS,
      },
      (place: any, status: string) => {
        if (completed) return
        completed = true
        window.clearTimeout(timeout)
        setIsFetching(false)
        const placesStatus = googleApi?.maps?.places?.PlacesServiceStatus
        if (status !== placesStatus?.OK || !place) {
          setLoadError(`Selected address details could not be loaded (${status || 'unknown status'}).`)
          onComplete?.()
          return
        }
        const mapped = mapPlaceToAddress(place)
        requestIdRef.current += 1
        lastTypedValueRef.current = ''
        suppressNextSearchRef.current = true
        setInputValue(mapped.formattedAddress)
        setPredictions([])
        setIsOpen(false)
        setActiveIndex(-1)
        sessionTokenRef.current = null
        setLoadError('')
        onChange(mapped)
        onComplete?.()
      },
    )
  }

  function handleSelect(prediction: Prediction) {
    if (!prediction?.place_id) return
    requestIdRef.current += 1
    setPredictions([])
    setIsOpen(false)
    setActiveIndex(-1)
    setIsFetching(true)

    if (prediction.source === 'modern' && prediction.placePrediction?.toPlace) {
      const place = prediction.placePrediction.toPlace()
      withTimeout(
        place.fetchFields({ fields: MODERN_DETAIL_FIELDS }),
        'Selected address details timed out. You can keep the typed address manually.',
      )
        .then((response: any) => {
          const mapped = mapPlaceToAddress(response?.place || place)
          if (!mapped.formattedAddress) {
            setLoadError('Selected address details could not be loaded.')
            return
          }
          requestIdRef.current += 1
          lastTypedValueRef.current = ''
          suppressNextSearchRef.current = true
          setInputValue(mapped.formattedAddress)
          setPredictions([])
          setIsOpen(false)
          setActiveIndex(-1)
          sessionTokenRef.current = null
          onChange(mapped)
        })
        .catch((detailError: any) => {
          console.warn('[Google Maps] Modern place details failed; retrying with legacy Places details.', detailError)
          fetchLegacyPlaceDetails(prediction)
        })
      return
    }
    fetchLegacyPlaceDetails(prediction)
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
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8aa0b6]" />
        <Input
          value={inputValue}
          onChange={(event) => {
            const nextValue = event.target.value
            lastTypedValueRef.current = nextValue
            suppressNextSearchRef.current = false
            setInputValue(nextValue)
            setLoadError('')
            if (!isAutocompleteUnavailable) setNoticeText('')
            onInputValueChange?.(nextValue)
            if (!nextValue.trim()) {
              requestIdRef.current += 1
              setPredictions([])
              setIsOpen(false)
              setIsFetching(false)
              onChange(null)
            }
          }}
          onFocus={() => {
            if (predictions.length || inputValue.trim().length >= 3) setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          required={required}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-invalid={Boolean(error)}
          className={cn(
            'h-12 rounded-[16px] border-[#dbe6f2] !pl-12 !pr-20 shadow-[0_10px_24px_rgba(15,23,42,0.06)]',
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
        <p className={cn('text-xs leading-5 text-[#607387]', error || loadError ? 'text-[#b42318]' : '')}>
          {helperText}
        </p>
      ) : null}
      {isOpen && canSearchGoogle ? (
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
