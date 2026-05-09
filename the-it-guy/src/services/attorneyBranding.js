import { normalizeText } from './attorneyFirmServiceShared'
import { getAttorneyFirmById, updateAttorneyFirm } from './attorneyFirms'
import { getTransactionAttorneyAssignments } from './transactionAttorneyAssignments'

function compact(value) {
  return String(value || '').trim()
}

function buildAddress(firm = {}) {
  const lines = [
    compact(firm.addressLine1),
    compact(firm.addressLine2),
    [compact(firm.city), compact(firm.province)].filter(Boolean).join(', '),
    [compact(firm.postalCode), compact(firm.country)].filter(Boolean).join(' ').trim(),
  ].filter(Boolean)

  return lines.join('\n')
}

function toAssignmentIdentity(assignment = null) {
  if (!assignment) {
    return null
  }

  const firm = assignment.firm || null
  const primaryAttorney = assignment.primaryAttorney || null
  const secretary = assignment.secretary || null
  return {
    assignmentId: assignment.id,
    assignmentType: assignment.assignmentType || '',
    assignmentTypeLabel: assignment.assignmentTypeLabel || '',
    status: assignment.status || 'active',
    statusLabel: assignment.statusLabel || 'Active',
    firm: firm
      ? {
          id: firm.id,
          name: firm.name || 'Attorney Firm',
          logoUrl: firm.logoUrl || '',
          primaryColour: firm.primaryColour || '',
          secondaryColour: firm.secondaryColour || '',
          email: firm.email || '',
          phone: firm.phone || '',
          website: firm.website || '',
          address: buildAddress(firm),
        }
      : null,
    primaryAttorney: primaryAttorney
      ? {
          id: primaryAttorney.id,
          name: primaryAttorney.name || primaryAttorney.email || 'Assigned Attorney',
          email: primaryAttorney.email || '',
        }
      : null,
    secretary: secretary
      ? {
          id: secretary.id,
          name: secretary.name || secretary.email || 'Assigned Secretary',
          email: secretary.email || '',
        }
      : null,
  }
}

export async function getAttorneyFirmBranding(firmId) {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    return null
  }

  const firm = await getAttorneyFirmById(normalizedFirmId)
  if (!firm?.id) {
    return null
  }

  return {
    firmId: firm.id,
    firmName: firm.name || 'Attorney Firm',
    logoUrl: firm.logoUrl || '',
    primaryColour: firm.primaryColour || '',
    secondaryColour: firm.secondaryColour || '',
    contactEmail: firm.email || '',
    contactPhone: firm.phone || '',
    website: firm.website || '',
    address: buildAddress(firm),
    addressParts: {
      line1: firm.addressLine1 || '',
      line2: firm.addressLine2 || '',
      city: firm.city || '',
      province: firm.province || '',
      postalCode: firm.postalCode || '',
      country: firm.country || 'South Africa',
    },
  }
}

export async function updateAttorneyFirmBranding(firmId, payload = {}) {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) {
    throw new Error('Firm id is required.')
  }

  return updateAttorneyFirm(normalizedFirmId, {
    logoUrl: payload.logoUrl,
    primaryColour: payload.primaryColour,
    secondaryColour: payload.secondaryColour,
    email: payload.contactEmail ?? payload.email,
    phone: payload.contactPhone ?? payload.phone,
    website: payload.website,
    addressLine1: payload.addressLine1,
    addressLine2: payload.addressLine2,
    city: payload.city,
    province: payload.province,
    postalCode: payload.postalCode,
    country: payload.country,
  })
}

export async function getAttorneyFirmNotificationIdentity(firmId) {
  const branding = await getAttorneyFirmBranding(firmId)
  if (!branding) return null

  return {
    senderName: branding.firmName,
    firmName: branding.firmName,
    logoUrl: branding.logoUrl,
    replyToEmail: branding.contactEmail,
    phone: branding.contactPhone,
    brandColours: {
      primary: branding.primaryColour,
      secondary: branding.secondaryColour,
    },
  }
}

export async function getAttorneyFirmRolePlayerIdentity(transactionId) {
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedTransactionId) {
    return {
      transferAttorney: null,
      bondAttorney: null,
    }
  }

  const assignments = await getTransactionAttorneyAssignments(normalizedTransactionId)
  if (!assignments.length) {
    return {
      transferAttorney: null,
      bondAttorney: null,
    }
  }

  const transferAssignment =
    assignments.find((item) => item.assignmentType === 'transfer') ||
    assignments.find((item) => item.assignmentType === 'transfer_and_bond') ||
    null
  const bondAssignment =
    assignments.find((item) => item.assignmentType === 'bond') ||
    assignments.find((item) => item.assignmentType === 'transfer_and_bond') ||
    null

  return {
    transferAttorney: toAssignmentIdentity(transferAssignment),
    bondAttorney: toAssignmentIdentity(bondAssignment),
  }
}
