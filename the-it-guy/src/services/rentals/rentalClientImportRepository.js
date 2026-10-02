import { supabase } from '../../lib/supabaseClient.js'
import { mapCsvRowsToImportRows, parseCsvText, pickImportValue } from '../../lib/csvImport.js'

const text = (value) => String(value ?? '').trim()
const phoneKey = (value) => {
  const digits = text(value).replace(/\D/g, '')
  return digits.length === 10 && digits.startsWith('0') ? `27${digits.slice(1)}` : digits
}
const keys = (row) => [row.email && `email:${text(row.email).toLowerCase()}`, row.phone && `phone:${phoneKey(row.phone)}`].filter(Boolean)
const types = ['tenant', 'landlord', 'buyer', 'seller', 'investor', 'prospect', 'lead']
export function previewRentalClientImport(csv, existing = []) {
  const parsed = mapCsvRowsToImportRows(parseCsvText(csv))
  if (!parsed.length) throw new Error('The CSV contains no contacts.')
  if (parsed.length > 500) throw new Error('Import up to 500 contacts per file.')
  const seen = new Set(existing.flatMap(keys))
  return parsed.map((row) => {
    const name = pickImportValue(row, ['Name', 'Full Name']) || [pickImportValue(row, ['First Name']), pickImportValue(row, ['Last Name'])].filter(Boolean).join(' ')
    const email = pickImportValue(row, ['Email', 'Email Address']).toLowerCase()
    const phone = pickImportValue(row, ['Phone', 'Mobile', 'Telephone'])
    const contactType = pickImportValue(row, ['Contact Type', 'Type', 'Role']).toLowerCase() || 'tenant'
    const notes = pickImportValue(row, ['Notes'])
    const errors = []
    if (!name) errors.push('Name required')
    if (!email && !phone) errors.push('Email or phone required')
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid email')
    if (phone && phoneKey(phone).length < 7) errors.push('Invalid phone')
    if (!types.includes(contactType)) errors.push('Unknown contact type')
    const contact = { name, email, phone, contactType, notes }
    const duplicate = !errors.length && keys(contact).some((key) => seen.has(key))
    if (!errors.length && !duplicate) keys(contact).forEach((key) => seen.add(key))
    return { ...contact, rowNumber: row.__rowNumber, contactId: crypto.randomUUID(), state: errors.length ? 'invalid' : duplicate ? 'duplicate' : 'ready', message: errors.join('; ') || (duplicate ? 'Existing or repeated contact' : 'Ready to import') }
  })
}
export async function listRentalImportContacts(organisationId, { client = supabase } = {}) {
  if (!client || !organisationId) throw new Error('Select an organisation before importing contacts.')
  const contacts = []
  for (let offset = 0; ; offset += 1000) {
    const result = await client.from('contacts').select('contact_id, email, phone').eq('organisation_id', organisationId).order('contact_id').range(offset, offset + 999)
    if (result.error) throw result.error
    contacts.push(...(result.data || []))
    if ((result.data || []).length < 1000) return contacts
  }
}
export async function saveRentalImportedContact(organisationId, row, { client = supabase, actorId = null } = {}) {
  if (!client || !organisationId || row.state !== 'ready') throw new Error('This contact is not ready to import.')
  const [firstName, ...lastName] = row.name.split(/\s+/)
  const payload = { contact_id: row.contactId, organisation_id: organisationId, assigned_agent_id: actorId, first_name: firstName, last_name: lastName.join(' '), email: row.email || null, phone: row.phone || null, contact_type: row.contactType, notes: row.notes || null, updated_at: new Date().toISOString() }
  const result = await client.from('contacts').upsert(payload, { onConflict: 'contact_id' }).select('contact_id, organisation_id, assigned_agent_id, first_name, last_name, email, phone, contact_type, notes').single()
  if (result.error) throw result.error
  for (const key of ['contact_id', 'organisation_id', 'assigned_agent_id', 'first_name', 'last_name', 'email', 'phone', 'contact_type', 'notes']) {
    if (text(result.data?.[key]) !== text(payload[key])) throw new Error('The saved contact could not be verified. Retry to confirm it.')
  }
  return result.data
}
