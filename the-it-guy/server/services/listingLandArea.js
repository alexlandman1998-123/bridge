// Capture fields labelled m² retain that default. Explicit units are converted
// before either portal mapper uses the measurement; never infer from the title.
export function resolveListingLandArea({ listing = {}, publication = {}, specialistFacts = {} } = {}) {
  const details = listing.propertyDetails || listing.property_details || {}
  const sources = [publication, listing, details, specialistFacts]
  const candidates = sources.flatMap((source) => [
    { value: source.erf_size_sqm, unit: 'sqm' },
    { value: source.land_size_sqm, unit: 'sqm' },
  ])
  const rawCandidates = sources.flatMap((source) => [
    { value: source.erf_size ?? source.erfSize, unit: source.erf_size_unit ?? source.erfSizeUnit },
    { value: source.land_size ?? source.landSize, unit: source.land_size_unit ?? source.landSizeUnit },
  ])
  candidates.push(...rawCandidates.filter(({ unit }) => unit), ...rawCandidates.filter(({ unit }) => !unit))
  const candidate = candidates.find(({ value }) => value !== null && value !== undefined && String(value).trim() !== '')
  if (!candidate) return { squareMetres: null, error: 'land_area_required' }
  const size = Number(candidate.value)
  if (!Number.isFinite(size) || size <= 0) return { squareMetres: null, error: 'land_area_positive_number_required' }
  const unit = String(candidate.unit || 'sqm').toLowerCase().replace(/²/g, '2').replace(/[\s_-]+/g, '').trim()
  const factor = {
    sqm: 1, m2: 1, squaremetres: 1, squaremeters: 1,
    ha: 10000, hectare: 10000, hectares: 10000,
    acre: 4046.8564224, acres: 4046.8564224,
  }[unit]
  if (!factor) return { squareMetres: null, error: 'land_area_unit_unsupported' }
  return { squareMetres: Number((size * factor).toFixed(6)), error: null }
}
