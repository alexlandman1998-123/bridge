import { Check, MapPin, Plus, X } from 'lucide-react'

const MAP_WIDTH = 1000
const MAP_HEIGHT = 650
const MAP_PADDING = 34
const EMPTY_LIST = Object.freeze([])

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!amount) return 'Not available'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function formatDate(value) {
  if (!value) return 'Not available'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-ZA', { month: 'short', year: 'numeric' }).format(date)
}

function createProjector(bounds = {}, properties = EMPTY_LIST) {
  let north = Number(bounds?.north)
  let south = Number(bounds?.south)
  let east = Number(bounds?.east)
  let west = Number(bounds?.west)
  if (![north, south, east, west].every(Number.isFinite)) {
    const points = properties.flatMap((property) => [property, ...(Array.isArray(property?.parcelBoundary) ? property.parcelBoundary : [])])
    const latitudes = points.map((point) => Number(point?.latitude)).filter(Number.isFinite)
    const longitudes = points.map((point) => Number(point?.longitude)).filter(Number.isFinite)
    north = latitudes.length ? Math.max(...latitudes) + 0.0002 : 1
    south = latitudes.length ? Math.min(...latitudes) - 0.0002 : 0
    east = longitudes.length ? Math.max(...longitudes) + 0.0002 : 1
    west = longitudes.length ? Math.min(...longitudes) - 0.0002 : 0
  }
  const latitudeSpan = Math.max(north - south, 0.000001)
  const longitudeSpan = Math.max(east - west, 0.000001)
  return ({ latitude, longitude }) => ({
    x: MAP_PADDING + (((Number(longitude) - west) / longitudeSpan) * (MAP_WIDTH - (MAP_PADDING * 2))),
    y: MAP_PADDING + (((north - Number(latitude)) / latitudeSpan) * (MAP_HEIGHT - (MAP_PADDING * 2))),
  })
}

function parcelPoints(property, project) {
  return (Array.isArray(property?.parcelBoundary) ? property.parcelBoundary : []).map((point) => {
    const projected = project(point)
    return `${projected.x},${projected.y}`
  }).join(' ')
}

export default function MockParcelMap({ properties = EMPTY_LIST, bounds, focusedProperty, selectedPropertyIds = EMPTY_LIST, isDemoData = true, loading = false, onFocusProperty, onToggleProperty }) {
  const project = createProjector(bounds, properties)
  const selectedIds = new Set(selectedPropertyIds)

  return (
    <div className="relative min-h-[520px] flex-1 overflow-hidden bg-[#eef3e8]" data-testid="mock-parcel-map">
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={isDemoData ? 'Interactive fictional property parcel map' : 'Interactive property parcel map'}>
        <defs>
          <pattern id="parcel-map-grain" width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="4" r="1.1" fill="#d6e1ce" />
            <circle cx="14" cy="13" r="0.9" fill="#d6e1ce" />
          </pattern>
          <filter id="parcel-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.18" />
          </filter>
        </defs>
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="#edf3e8" />
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#parcel-map-grain)" />

        <g aria-hidden="true">
          {[120, 255, 390, 525].map((y, index) => (
            <g key={`road-horizontal-${y}`}>
              <path d={`M -30 ${y} C 240 ${y - 28}, 590 ${y + 34}, 1030 ${y - 10}`} fill="none" stroke="#c8cfd0" strokeWidth={index === 2 ? 42 : 30} />
              <path d={`M -30 ${y} C 240 ${y - 28}, 590 ${y + 34}, 1030 ${y - 10}`} fill="none" stroke="#f8fafc" strokeWidth={index === 2 ? 32 : 21} />
              <path d={`M -30 ${y} C 240 ${y - 28}, 590 ${y + 34}, 1030 ${y - 10}`} fill="none" stroke="#d7dde0" strokeWidth="2" strokeDasharray="12 12" />
            </g>
          ))}
          {[160, 350, 540, 730, 900].map((x) => (
            <g key={`road-vertical-${x}`}>
              <path d={`M ${x} -30 C ${x - 34} 180, ${x + 38} 430, ${x - 12} 680`} fill="none" stroke="#c8cfd0" strokeWidth="24" />
              <path d={`M ${x} -30 C ${x - 34} 180, ${x + 38} 430, ${x - 12} 680`} fill="none" stroke="#f8fafc" strokeWidth="16" />
            </g>
          ))}
          <path d="M 0 610 C 220 535, 380 635, 570 570 C 740 510, 865 540, 1000 480 L 1000 650 L 0 650 Z" fill="#dcebd3" />
          <ellipse cx="80" cy="585" rx="58" ry="30" fill="#b9dce0" stroke="#91c4ca" strokeWidth="4" />
        </g>

        <g>
          {properties.map((property) => {
            const isSelected = selectedIds.has(property.id)
            const isFocused = focusedProperty?.id === property.id
            const centre = project(property)
            return (
              <g key={property.id} role="button" tabIndex="0" aria-label={`${property.formattedAddress}${isSelected ? ', selected' : ''}`} className="cursor-pointer outline-none" onClick={() => onFocusProperty?.(property)} onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onFocusProperty?.(property)
                }
              }}>
                <polygon points={parcelPoints(property, project)} fill={isSelected ? '#bfdbfe' : isFocused ? '#dbeafe' : '#ffffff'} fillOpacity={isSelected || isFocused ? 0.92 : 0.74} stroke={isSelected ? '#1769dc' : isFocused ? '#2563eb' : '#bac6bd'} strokeWidth={isSelected || isFocused ? 4 : 2} filter={isSelected ? 'url(#parcel-shadow)' : undefined} className="transition-all" />
                <circle cx={centre.x} cy={centre.y} r={isSelected ? 9 : 7} fill={isSelected ? '#1769dc' : '#119b91'} stroke="white" strokeWidth="3" />
                {isSelected ? <Check x={centre.x - 5} y={centre.y - 5} width="10" height="10" color="white" strokeWidth="3" aria-hidden="true" /> : null}
              </g>
            )
          })}
        </g>

        <g aria-hidden="true" fill="#64748b" fontFamily="Inter, ui-sans-serif, system-ui" fontSize="14" fontWeight="600">
          <text x="36" y="105" transform="rotate(-5 36 105)">Jacaranda Avenue</text>
          <text x="650" y="238" transform="rotate(3 650 238)">Silver Tree Crescent</text>
          <text x="370" y="520" transform="rotate(2 370 520)">Fynbos Street</text>
          <text x="825" y="410" transform="rotate(78 825 410)">Protea Close</text>
        </g>
      </svg>

      <div className="absolute left-4 top-4 flex flex-wrap gap-2">
        <span className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur">{properties.length.toLocaleString('en-ZA')} properties in view</span>
        <span className={`rounded-xl border bg-white/95 px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur ${isDemoData ? 'border-emerald-200 text-emerald-700' : 'border-blue-200 text-blue-700'}`}>{isDemoData ? 'Demo data' : 'Connected provider'}</span>
      </div>

      {focusedProperty ? (
        <article className="absolute z-10 w-[min(310px,calc(100%-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.18)]" style={{ left: `${clamp((project(focusedProperty).x / MAP_WIDTH) * 100, 22, 66)}%`, top: `${clamp((project(focusedProperty).y / MAP_HEIGHT) * 100, 22, 58)}%`, transform: 'translate(-50%, -50%)' }}>
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="font-semibold text-slate-900">{focusedProperty.address}</h3><p className="mt-0.5 text-xs text-slate-500">{focusedProperty.suburb}</p></div>
            <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => onFocusProperty?.(null)} aria-label="Close property preview"><X size={16} /></button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div><dt className="text-slate-500">Erf</dt><dd className="mt-0.5 font-semibold text-slate-800">{focusedProperty.erfNumber}</dd></div>
            <div><dt className="text-slate-500">Type</dt><dd className="mt-0.5 font-semibold text-slate-800">{focusedProperty.propertyType}</dd></div>
            <div><dt className="text-slate-500">Erf size</dt><dd className="mt-0.5 font-semibold text-slate-800">{focusedProperty.erfSizeSquareMetres.toLocaleString('en-ZA')} m²</dd></div>
            <div><dt className="text-slate-500">Last transfer</dt><dd className="mt-0.5 font-semibold text-slate-800">{formatDate(focusedProperty.lastTransferDate)}</dd></div>
            <div className="col-span-2"><dt className="text-slate-500">Indicative value</dt><dd className="mt-0.5 font-semibold text-slate-900">{formatCurrency(focusedProperty.indicativeValue)}</dd></div>
          </dl>
          <button type="button" className={`mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${selectedIds.has(focusedProperty.id) ? 'border border-blue-200 bg-blue-50 text-[#1769dc] hover:bg-blue-100' : 'bg-[#1769dc] text-white hover:bg-[#1359bc]'}`} onClick={() => onToggleProperty?.(focusedProperty)}>
            {selectedIds.has(focusedProperty.id) ? <Check size={16} /> : <Plus size={16} />}
            {selectedIds.has(focusedProperty.id) ? 'Selected for reports' : 'Add to selection'}
          </button>
        </article>
      ) : null}

      {loading ? <div className="absolute inset-0 z-20 grid place-items-center bg-white/55 backdrop-blur-[1px]"><span className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">Updating map…</span></div> : null}
      {!loading && !properties.length ? <div className="absolute inset-0 grid place-items-center p-6"><div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm"><MapPin className="mx-auto text-slate-400" size={24} /><h3 className="mt-3 font-semibold text-slate-900">No properties match these filters</h3><p className="mt-1 text-sm text-slate-500">Try a broader address, property type or value range.</p></div></div> : null}

      <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">
        <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-full bg-[#119b91]" />Available</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-full bg-[#1769dc]" />Selected</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-full bg-[#0f2f57]" />Report pulled</span>
      </div>
    </div>
  )
}
