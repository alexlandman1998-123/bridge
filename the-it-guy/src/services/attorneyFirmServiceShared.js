import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

export const DEFAULT_ATTORNEY_DEPARTMENTS = [
  { name: 'Transfer Department', department_type: 'transfer' },
  { name: 'Bond Department', department_type: 'bond' },
  { name: 'Admin Department', department_type: 'admin' },
  { name: 'Management', department_type: 'management' },
]

export function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  }
  return supabase
}

export function normalizeText(value) {
  return String(value || '').trim()
}

export function normalizeNullableText(value) {
  const normalized = normalizeText(value)
  return normalized || null
}

export function normalizeEmail(value) {
  return normalizeText(value).toLowerCase()
}

function stripWebsiteProtocol(value) {
  return String(value || '').trim().replace(/^https?:\/\//i, '')
}

export function normalizeWebsite(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const parsed = new URL(withProtocol)
    const host = String(parsed.hostname || '').trim().toLowerCase()
    if (!host || !host.includes('.') || /\s/.test(host)) {
      return ''
    }
    const pathname = String(parsed.pathname || '')
    const search = String(parsed.search || '')
    const hash = String(parsed.hash || '')
    return `${parsed.protocol}//${host}${pathname}${search}${hash}`
  } catch {
    return ''
  }
}

export function isValidEmail(value) {
  const email = normalizeEmail(value)
  if (!email) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidWebsite(value) {
  const website = normalizeText(value)
  if (!website) return true
  return Boolean(normalizeWebsite(stripWebsiteProtocol(website)))
}

export function isMissingTableError(error, tableName = '') {
  if (!error) return false
  const message = String(error.message || '').toLowerCase()
  return (
    String(error.code || '').toLowerCase() === '42p01' ||
    String(error.code || '').toLowerCase() === 'pgrst205' ||
    (message.includes('table') && message.includes(String(tableName || '').toLowerCase()))
  )
}

export function isMissingColumnError(error, columnName = '') {
  if (!error) return false
  const message = String(error.message || '').toLowerCase()
  return (
    String(error.code || '').toLowerCase() === '42703' ||
    String(error.code || '').toLowerCase() === 'pgrst204' ||
    (message.includes('column') && message.includes(String(columnName || '').toLowerCase()))
  )
}

export function isPermissionDeniedError(error) {
  if (!error) return false
  const code = String(error.code || '').trim().toLowerCase()
  const status = Number(error?.status || error?.statusCode || 0)
  const message = String(error.message || '').toLowerCase()
  const details = String(error.details || '').toLowerCase()
  return (
    status === 403 ||
    code === '403' ||
    code === '42501' ||
    code === 'permission_denied' ||
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    details.includes('permission denied') ||
    details.includes('row-level security')
  )
}

export async function getAuthenticatedUser(client) {
  const { data, error } = await client.auth.getUser()
  if (error) {
    throw error
  }

  if (!data?.user?.id) {
    throw new Error('Authentication is required.')
  }

  return data.user
}

export function createInviteToken(prefix = 'attorney-firm') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

export function resolveInviteExpiryIso(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

export function mapFirmRow(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name || '',
    registrationNumber: row.registration_number || '',
    vatNumber: row.vat_number || '',
    website: row.website || '',
    email: row.email || '',
    phone: row.phone || '',
    addressLine1: row.address_line_1 || '',
    addressLine2: row.address_line_2 || '',
    city: row.city || '',
    province: row.province || '',
    postalCode: row.postal_code || '',
    country: row.country || 'South Africa',
    logoUrl: row.logo_url || '',
    primaryColour: row.primary_colour || '',
    secondaryColour: row.secondary_colour || '',
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    isActive: row.is_active !== false,
  }
}

export function mapDepartmentRow(row) {
  if (!row) return null
  return {
    id: row.id,
    firmId: row.firm_id,
    name: row.name || '',
    departmentType: row.department_type || '',
    isActive: row.is_active !== false,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

export function mapMemberRow(row) {
  if (!row) return null
  return {
    id: row.id,
    firmId: row.firm_id,
    userId: row.user_id,
    departmentId: row.department_id || null,
    role: row.role || '',
    status: row.status || 'active',
    invitedBy: row.invited_by || null,
    joinedAt: row.joined_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

export function mapInvitationRow(row) {
  if (!row) return null
  return {
    id: row.id,
    firmId: row.firm_id,
    email: row.email || '',
    role: row.role || '',
    departmentId: row.department_id || null,
    invitedBy: row.invited_by || null,
    token: row.token || '',
    status: row.status || 'pending',
    expiresAt: row.expires_at || null,
    acceptedAt: row.accepted_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}
