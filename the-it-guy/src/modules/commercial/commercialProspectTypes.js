import { normalizeKey, normalizeText } from './commercialProspectFormatters'

export const COMMERCIAL_DEAL_TYPES = ['sale', 'lease']

export const COMMERCIAL_PROSPECT_ROLES = ['seller', 'buyer', 'landlord', 'tenant']

export const COMMERCIAL_PROPERTY_CATEGORIES = ['retail', 'industrial', 'office', 'commercial', 'agricultural', 'mixed_use', 'other']

export const COMMERCIAL_PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Urgent']

export const COMMERCIAL_CANVASSING_METHODS = [
  'Cold Call',
  'Referral',
  'Network',
  'Website',
  'Walk-in',
  'LinkedIn',
  'Email',
  'Existing Relationship',
  'Other',
]

export const COMMERCIAL_PROSPECT_STATUSES = [
  'New',
  'Contacted',
  'Qualified',
  'Follow Up',
  'Converted to Lead',
  'Converted to Listing',
  'Converted to Requirement',
  'Lost',
  'Archived',
]

export const COMMERCIAL_ROLE_OPTIONS = [
  { value: 'seller', label: 'Seller', dealType: 'sale', description: 'Property owners looking to sell or list their property.' },
  { value: 'buyer', label: 'Buyer', dealType: 'sale', description: 'Businesses or investors looking to buy commercial property.' },
  { value: 'landlord', label: 'Landlord', dealType: 'lease', description: 'Property owners looking to lease or list their space.' },
  { value: 'tenant', label: 'Tenant', dealType: 'lease', description: 'Businesses or individuals looking for space to lease.' },
]

export const COMMERCIAL_CATEGORY_OPTIONS = [
  { value: 'retail', label: 'Retail' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'office', label: 'Office' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'agricultural', label: 'Agricultural' },
  { value: 'mixed_use', label: 'Mixed-use' },
  { value: 'other', label: 'Other' },
]

export const COMMERCIAL_ROLE_BADGE_VARIANTS = {
  seller: 'blue',
  buyer: 'green',
  landlord: 'purple',
  tenant: 'amber',
}

export const COMMERCIAL_CATEGORY_BADGE_VARIANTS = {
  retail: 'pink',
  industrial: 'slate',
  office: 'blue',
  commercial: 'violet',
  agricultural: 'emerald',
  mixed_use: 'amber',
  other: 'slate',
}

export function getDealTypeFromRole(role = '') {
  const key = normalizeKey(role)
  if (key === 'landlord' || key === 'tenant') return 'lease'
  return 'sale'
}

export function getRoleLabel(role = '') {
  const key = normalizeKey(role)
  if (key === 'seller') return 'Seller'
  if (key === 'buyer') return 'Buyer'
  if (key === 'landlord') return 'Landlord'
  if (key === 'tenant') return 'Tenant'
  return 'Uncategorised'
}

export function getDealTypeLabel(dealType = '') {
  const key = normalizeKey(dealType)
  if (key === 'sale') return 'Sale'
  if (key === 'lease') return 'Lease'
  return 'Uncategorised'
}

export function getPropertyCategoryLabel(category = '') {
  const key = normalizeKey(category)
  if (key === 'mixed_use' || key === 'mixed-use') return 'Mixed-use'
  if (key === 'retail') return 'Retail'
  if (key === 'industrial') return 'Industrial'
  if (key === 'office') return 'Office'
  if (key === 'commercial') return 'Commercial'
  if (key === 'agricultural') return 'Agricultural'
  if (key === 'other') return 'Other'
  if (!normalizeText(category)) return 'Uncategorised'
  return normalizeText(category)
}

export function getProspectBadgeVariant(role = '') {
  const key = normalizeKey(role)
  return COMMERCIAL_ROLE_BADGE_VARIANTS[key] || 'slate'
}

export function getCategoryBadgeVariant(category = '') {
  const key = normalizeKey(category)
  return COMMERCIAL_CATEGORY_BADGE_VARIANTS[key] || 'slate'
}

