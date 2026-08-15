export const SELLER_BASE_PACK_KEYS = Object.freeze({
  SIGNED_MANDATE: 'signed_mandate',
  SIGNED_DISCLOSURE_FORM: 'signed_disclosure_form',
  SIGNED_FICA_DECLARATION: 'signed_fica_declaration',
})

export const SELLER_BASE_PACK_REQUIRED_KEYS = Object.freeze([
  SELLER_BASE_PACK_KEYS.SIGNED_MANDATE,
  SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM,
  SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION,
])

export const SELLER_BASE_PACK_COMPLETION_ROUTES = Object.freeze({
  PHYSICAL_UPLOAD: 'physical_upload',
  DISCLOSURE_LINK: 'disclosure_link_completed',
  SELLER_ONBOARDING_LINK: 'seller_onboarding_link_completed',
  PHYSICAL_UPLOAD_WITH_CONTEXT: 'physical_upload_with_context',
})

export const SELLER_BASE_PACK_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: SELLER_BASE_PACK_KEYS.SIGNED_MANDATE,
    label: 'Signed Mandate',
    description: 'The signed seller mandate.',
    allowedCompletionRoutes: Object.freeze([
      SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD,
    ]),
  }),
  Object.freeze({
    key: SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM,
    label: 'Signed Mandatory Disclosure / Defects Form',
    description: 'The completed and signed mandatory property disclosure form.',
    allowedCompletionRoutes: Object.freeze([
      SELLER_BASE_PACK_COMPLETION_ROUTES.DISCLOSURE_LINK,
      SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD,
    ]),
  }),
  Object.freeze({
    key: SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION,
    label: 'Signed FICA Declaration',
    description: 'The signed FICA declaration pack, separate from supporting FICA evidence documents.',
    allowedCompletionRoutes: Object.freeze([
      SELLER_BASE_PACK_COMPLETION_ROUTES.SELLER_ONBOARDING_LINK,
      SELLER_BASE_PACK_COMPLETION_ROUTES.PHYSICAL_UPLOAD_WITH_CONTEXT,
    ]),
  }),
])

function normalizeKey(value = '') {
  return String(value ?? '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizedKeyContainsAlias(value = '', alias = '') {
  const normalizedValue = normalizeKey(value)
  const normalizedAlias = normalizeKey(alias)
  if (!normalizedValue || !normalizedAlias) return false
  if (normalizedValue === normalizedAlias) return true
  return normalizedValue.startsWith(`${normalizedAlias}_`) ||
    normalizedValue.endsWith(`_${normalizedAlias}`) ||
    normalizedValue.includes(`_${normalizedAlias}_`)
}

export const SELLER_BASE_PACK_ALIASES = Object.freeze({
  [SELLER_BASE_PACK_KEYS.SIGNED_MANDATE]: Object.freeze([
    'signed_mandate',
    'mandate_signature',
    'seller_mandate',
    'manual_mandate_evidence',
    'physical_signed_mandate',
    'mandate',
  ]),
  [SELLER_BASE_PACK_KEYS.SIGNED_DISCLOSURE_FORM]: Object.freeze([
    'signed_disclosure_form',
    'signed_mandatory_disclosure',
    'signed_mandatory_disclosure_form',
    'mandatory_disclosure',
    'mandatory_disclosure_form',
    'property_condition_disclosure',
    'property_disclosure',
    'condition_disclosure',
    'signed_defect_form',
    'signed_defects_form',
    'defects_disclosure',
    'defects_disclosure_form',
    'defect_form',
    'defects_form',
    'property_defects_disclosure',
    'disclosure',
    'defects',
  ]),
  [SELLER_BASE_PACK_KEYS.SIGNED_FICA_DECLARATION]: Object.freeze([
    'signed_fica_declaration',
    'signed_fica_declaration_pack',
    'fica_declaration',
    'fica_declaration_pack',
    'signed_fica_form',
    'seller_fica_form',
    'seller_fica_declaration',
    'seller_fica_declaration_pack',
    'seller_fica_pack',
    'fica_form',
    'fica_pack',
    'fica',
  ]),
})

const SELLER_BASE_PACK_CANONICAL_BY_ALIAS = Object.freeze(
  Object.entries(SELLER_BASE_PACK_ALIASES).reduce((accumulator, [canonicalKey, aliases]) => {
    accumulator[normalizeKey(canonicalKey)] = canonicalKey
    aliases.forEach((alias) => {
      accumulator[normalizeKey(alias)] = canonicalKey
    })
    return accumulator
  }, {}),
)

export function normalizeSellerBasePackKey(value = '') {
  const normalized = normalizeKey(value)
  return SELLER_BASE_PACK_CANONICAL_BY_ALIAS[normalized] || ''
}

export function isSellerBasePackKey(value = '') {
  return Boolean(normalizeSellerBasePackKey(value))
}

export function getSellerBasePackAliases(value = '') {
  const canonicalKey = normalizeSellerBasePackKey(value) || normalizeKey(value)
  const aliases = SELLER_BASE_PACK_ALIASES[canonicalKey]
  return aliases ? Object.freeze([canonicalKey, ...aliases].map(normalizeKey)) : Object.freeze([])
}

export function sellerBasePackKeysOverlap(left = '', right = '') {
  const leftCanonical = normalizeSellerBasePackKey(left)
  const rightCanonical = normalizeSellerBasePackKey(right)
  if (leftCanonical && rightCanonical) return leftCanonical === rightCanonical
  if (!leftCanonical && !rightCanonical) return false
  const canonicalAliases = getSellerBasePackAliases(leftCanonical || rightCanonical)
  const other = normalizeKey(leftCanonical ? right : left)
  return Boolean(other && canonicalAliases.some((alias) =>
    normalizedKeyContainsAlias(other, alias) || normalizedKeyContainsAlias(alias, other),
  ))
}

export function getSellerBasePackDefinition(value = '') {
  const canonicalKey = normalizeSellerBasePackKey(value)
  return SELLER_BASE_PACK_DEFINITIONS.find((definition) => definition.key === canonicalKey) || null
}
