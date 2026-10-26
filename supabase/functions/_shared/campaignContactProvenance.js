export const PROPERTY_CONTACT_FIELDS = ['agentName', 'agentEmail', 'agentPhone', 'destination']
export const GENERAL_CONTACT_FIELDS = ['agentName', 'destination']
const text = (value) => String(value ?? '').trim()
const own = (value, key) => Object.hasOwn(value || {}, key)
const record = (value) => value && typeof value === 'object' && !Array.isArray(value)
const message = 'Refresh the current public contacts and confirm them before preparing this campaign. Older drafts do not record whether a contact was public or entered only for the campaign.'

export function createContactProvenance(source, fields = PROPERTY_CONTACT_FIELDS) {
  return { version: 1, source: Object.fromEntries(fields.map((key) => [key, text(source?.[key])])), overrides: {}, confirmed: false }
}

// Missing provenance deliberately stays missing. Reading a legacy draft must
// never turn its ambiguous saved values into a new public-source snapshot.
export function cleanContactProvenance(value, source, fields = PROPERTY_CONTACT_FIELDS) {
  if (value === undefined) return undefined
  if (!record(value) || value.version !== 1 || typeof value.confirmed !== 'boolean' || !record(value.source) || !record(value.overrides) || Object.keys(value).length !== 4 || !['version', 'source', 'overrides', 'confirmed'].every((key) => own(value, key))) throw new Error('Refresh and review the campaign contact details.')
  if (Object.keys(value.source).length !== fields.length || fields.some((key) => !own(value.source, key)) || Object.keys(value.source).some((key) => !fields.includes(key)) || Object.keys(value.overrides).some((key) => !fields.includes(key))) throw new Error('Use only the supported public campaign contact fields.')
  for (const key of fields) {
    for (const entries of [value.source, value.overrides]) if (own(entries, key) && (typeof entries[key] !== 'string' || ((entries === value.source || value.confirmed) && entries[key] !== entries[key].trim()) || entries[key].length > 6000)) throw new Error('Use bounded public campaign contact text.')
    const effective = own(value.overrides, key) ? text(value.overrides[key]) : value.source[key]
    if (text(source?.[key]) !== effective) throw new Error('The campaign contact wording does not match its reviewed source or explicit override.')
  }
  return { version: 1, source: { ...value.source }, overrides: Object.fromEntries(Object.entries(value.overrides).map(([key, entry]) => [key, text(entry)])), confirmed: value.confirmed }
}

export function withContactOverride(builder, key, value, fields = PROPERTY_CONTACT_FIELDS, enabled = true) {
  const provenance = cleanContactProvenance(builder.contactProvenance, builder.source, fields)
  if (!provenance || !fields.includes(key)) throw new Error(message)
  const overrides = { ...provenance.overrides }
  // Preserve typing spaces in the unconfirmed input. Confirmation/cleaning
  // normalises the saved value; trimming each keystroke prevents full names.
  if (enabled) overrides[key] = String(value ?? '')
  else delete overrides[key]
  const source = { ...builder.source, [key]: own(overrides, key) ? overrides[key] : provenance.source[key] }
  return { ...builder, source, contactProvenance: { ...provenance, overrides, confirmed: false } }
}

export function contactProvenanceReview(builder, currentSource, fields = PROPERTY_CONTACT_FIELDS, { requireConfirmed = true } = {}) {
  let provenance
  try { provenance = cleanContactProvenance(builder?.contactProvenance, builder?.source, fields) } catch (error) { return { ready: false, reason: 'invalid', message: error.message, changed: [] } }
  if (!provenance) return { ready: false, reason: 'legacy', message, changed: [] }
  const changed = currentSource ? fields.filter((key) => provenance.source[key] !== text(currentSource[key])) : []
  if (changed.length) return { ready: false, reason: 'changed', message: 'Public campaign contact details changed or were removed. Refresh them and review the wording before preparing this campaign.', changed }
  if (requireConfirmed && !provenance.confirmed) return { ready: false, reason: 'unconfirmed', message: 'Confirm the current public contacts and any campaign-only overrides before preparing this campaign.', changed: [] }
  return { ready: true, reason: 'current', message: '', changed: [] }
}

export function assertCampaignContacts(builder, currentSource, fields = PROPERTY_CONTACT_FIELDS) {
  const review = contactProvenanceReview(builder, currentSource, fields)
  if (!review.ready) throw new Error(review.message)
}

export function confirmCampaignContacts(builder, fields = PROPERTY_CONTACT_FIELDS, confirmed = true) {
  const provenance = cleanContactProvenance(builder.contactProvenance, builder.source, fields)
  if (!provenance) throw new Error(message)
  const source = { ...builder.source, ...Object.fromEntries(fields.map((key) => [key, own(provenance.overrides, key) ? provenance.overrides[key] : provenance.source[key]])) }
  return { ...builder, source, contactProvenance: { ...provenance, confirmed } }
}
