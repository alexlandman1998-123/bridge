const CANVASSING_FIELD = /^(?:Canvassing Method|Source|Area Of Interest|Budget|Bedrooms|Finance Status|Urgency|Needs To Sell|Selling Intent|Last Contact Outcome|Property Occupancy|Canvassing Prospect ID):\s*/i

/** Keep genuine seller notes, but never present conversion tracking fields as disclosures. */
export function getSellerProfileNarrativeNotes(...sources) {
  for (const source of sources) {
    const value = String(source ?? '').trim()
    if (!value) continue
    const narrative = value
      .split(/\s*\|\s*/)
      .map((part) => part.trim())
      .filter((part) => part && !CANVASSING_FIELD.test(part))
      .join(' | ')
    if (narrative) return narrative
  }
  return ''
}
