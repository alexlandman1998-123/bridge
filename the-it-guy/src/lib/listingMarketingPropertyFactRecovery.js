function normalizeText(value) {
  return String(value ?? '').trim()
}

function parsePositiveNumber(value) {
  const parsed = Number(String(value ?? '').replace(/[\s,]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function firstMatchNumber(text, patterns = []) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = parsePositiveNumber(match?.[1])
    if (value !== null) return value
  }
  return null
}

/**
 * Recover only facts that are stated explicitly in durable listing copy.
 * This supports older listings whose marketing content was saved before the
 * structured publication fields were introduced. It deliberately does not
 * infer address, price, ownership scheme, or other ambiguous facts.
 */
export function recoverStructuredPropertyFactsFromMarketingCopy(...sources) {
  const text = sources.map(normalizeText).filter(Boolean).join(' ')
  if (!text) return {}

  return {
    bedrooms: firstMatchNumber(text, [
      /\b(\d+(?:[.,]\d+)?)\s*[- ]?bedrooms?\b/i,
      /\b(\d+(?:[.,]\d+)?)\s*[- ]?beds?\b/i,
    ]),
    bathrooms: firstMatchNumber(text, [
      /\b(\d+(?:[.,]\d+)?)\s*[- ]?bathrooms?\b/i,
      /\b(\d+(?:[.,]\d+)?)\s*[- ]?baths?\b/i,
    ]),
    garages: firstMatchNumber(text, [
      /\b(\d+(?:[.,]\d+)?)\s*[- ]?garages?\b/i,
    ]),
    parkingCount: firstMatchNumber(text, [
      /\bparking\s+(?:for\s+)?(?:approximately\s+|about\s+|up\s+to\s+)?(\d+(?:[.,]\d+)?)\s+vehicles?\b/i,
      /\b(\d+(?:[.,]\d+)?)\s+(?:parking\s+)?(?:bays?|spaces?)\b/i,
    ]),
    erfSize: firstMatchNumber(text, [
      /\b(?:situated|positioned|set)\s+on\s+(?:a\s+)?([\d,\s]+(?:\.\d+)?)\s*(?:m²|m2|square\s+met(?:re|er)s?)\s+erf\b/i,
      /\b([\d,\s]+(?:\.\d+)?)\s*(?:m²|m2|square\s+met(?:re|er)s?)\s+erf\b/i,
      /\berf\s+(?:of\s+|size\s+of\s+)?([\d,\s]+(?:\.\d+)?)\s*(?:m²|m2|square\s+met(?:re|er)s?)\b/i,
    ]),
    floorSize: firstMatchNumber(text, [
      /\b(?:floor|building|under\s+roof)\s+(?:area|size)?\s*(?:of\s+)?([\d,\s]+(?:\.\d+)?)\s*(?:m²|m2|square\s+met(?:re|er)s?)\b/i,
      /\b([\d,\s]+(?:\.\d+)?)\s*(?:m²|m2|square\s+met(?:re|er)s?)\s+(?:under\s+roof|floor\s+area)\b/i,
    ]),
  }
}

export function preferSavedPropertyFact(savedValue, recoveredValue) {
  const saved = parsePositiveNumber(savedValue)
  if (saved !== null) return String(savedValue).trim()
  return recoveredValue === null || recoveredValue === undefined ? '' : String(recoveredValue)
}
