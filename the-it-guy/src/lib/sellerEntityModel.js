export const SELLER_ENTITY_MODEL_VERSION = 'seller_entity_model_phase1_v2'

export const SELLER_ENTITY_TYPES = Object.freeze([
  { value: 'unknown', label: 'Not identified yet', description: 'Capture the selling entity before preparing seller documents.' },
  { value: 'individual', label: 'Individual', description: 'One individual owner.' },
  { value: 'multiple_owners', label: 'Multiple owners', description: 'Two or more individual owners.' },
  { value: 'company', label: 'Company', description: 'Pty Ltd / Ltd company.' },
  { value: 'close_corporation', label: 'Close corporation', description: 'Registered CC.' },
  { value: 'trust', label: 'Trust', description: 'Registered trust.' },
  { value: 'deceased_estate', label: 'Deceased estate', description: 'Estate represented by an executor.' },
  { value: 'other', label: 'Other entity', description: 'Another legal entity or developer.' },
  { value: 'foreign_individual', label: 'Foreign owner', description: 'Non-resident individual owner.' },
  { value: 'foreign_company', label: 'Foreign company', description: 'Company registered outside South Africa.' },
  { value: 'foreign_trust', label: 'Foreign trust', description: 'Trust registered outside South Africa.' },
])

const aliases = Object.freeze({
  '': 'unknown', unknown: 'unknown', not_captured: 'unknown', not_identified: 'unknown',
  individual: 'individual', natural: 'individual', natural_person: 'individual',
  multiple: 'multiple_owners', multiple_individuals: 'multiple_owners', joint: 'multiple_owners', co_owners: 'multiple_owners',
  company: 'company', corporate: 'company', pty: 'company', pty_ltd: 'company',
  close_corporation: 'close_corporation', cc: 'close_corporation',
  trust: 'trust', deceased_estate: 'deceased_estate', estate: 'deceased_estate',
  other: 'other', developer: 'other', foreign: 'foreign_individual', foreign_individual: 'foreign_individual',
  foreign_company: 'foreign_company', foreign_trust: 'foreign_trust',
})

function key(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function normalizeSellerEntityType(value, fallback = 'unknown') {
  return aliases[key(value)] || fallback
}

export function isSellerEntityIdentified(value) {
  return normalizeSellerEntityType(value) !== 'unknown'
}

export function getSellerEntityTypeLabel(value) {
  const normalized = normalizeSellerEntityType(value)
  return SELLER_ENTITY_TYPES.find((item) => item.value === normalized)?.label || 'Not identified yet'
}
