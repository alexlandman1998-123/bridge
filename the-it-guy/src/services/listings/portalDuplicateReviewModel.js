function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function addressKey(listing = {}) {
  return key([
    listing.addressLine1 || listing.address_line_1 || listing.streetAddress || listing.street_address || listing.formattedAddress || listing.formatted_address || listing.propertyAddress,
    listing.unitNumber || listing.unit_number,
    listing.suburb,
    listing.city,
  ].filter(Boolean).join(' '))
}

function placementKind(listing = {}) {
  const property24 = key(listing.property24Status || listing.property24_status)
  const privateProperty = key(listing.privatePropertyStatus || listing.private_property_status)
  if (['active', 'live', 'published'].includes(property24)) return 'property24'
  if (['active', 'live', 'published'].includes(privateProperty)) return 'private_property'
  return ''
}

export function scorePortalDuplicate(left = {}, right = {}) {
  if (!left?.id || !right?.id || String(left.id) === String(right.id)) return { score: 0, candidate: false, reasons: [] }
  const leftPlacement = placementKind(left)
  const rightPlacement = placementKind(right)
  if (!leftPlacement || !rightPlacement || leftPlacement === rightPlacement) return { score: 0, candidate: false, reasons: [] }
  const reasons = []
  let score = 0
  if (addressKey(left) && addressKey(left) === addressKey(right)) { score += 60; reasons.push('same_address') }
  const leftPrice = Number(left.askingPrice || left.asking_price || 0)
  const rightPrice = Number(right.askingPrice || right.asking_price || 0)
  if (leftPrice > 0 && rightPrice > 0 && Math.abs(leftPrice - rightPrice) / Math.max(leftPrice, rightPrice) <= 0.01) { score += 25; reasons.push('same_price') }
  if (key(left.propertyType || left.property_type) && key(left.propertyType || left.property_type) === key(right.propertyType || right.property_type)) { score += 15; reasons.push('same_property_type') }
  return { score, candidate: score >= 85, reasons, leftPlacement, rightPlacement }
}

export function findPortalDuplicateCandidates(listings = []) {
  const rows = Array.isArray(listings) ? listings : []
  const candidates = []
  for (let index = 0; index < rows.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < rows.length; otherIndex += 1) {
      const match = scorePortalDuplicate(rows[index], rows[otherIndex])
      if (match.candidate) candidates.push({ id: [rows[index].id, rows[otherIndex].id].map(String).sort().join(':'), left: rows[index], right: rows[otherIndex], ...match })
    }
  }
  return candidates
}
