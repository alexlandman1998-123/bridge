const REPORT_PROSPECT_MARKER = 'Arch9 property intelligence ID:'

function normalizeText(value) {
  return String(value || '').trim()
}

function splitOwnerName(value) {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: 'Property', lastName: 'Owner' }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

function estimatedValueBand(value) {
  const amount = Number(value || 0)
  if (!amount) return ''
  if (amount < 1_000_000) return 'Under R1m'
  if (amount < 2_000_000) return 'R1m - R2m'
  if (amount < 3_000_000) return 'R2m - R3m'
  if (amount < 5_000_000) return 'R3m - R5m'
  if (amount < 10_000_000) return 'R5m - R10m'
  return 'R10m+'
}

function includesReportType(report, reportTypeId) {
  return (Array.isArray(report?.reportTypes) ? report.reportTypes : []).some((reportType) => normalizeText(reportType?.id || reportType) === reportTypeId)
}

export function getPropertyReportProspectMarker(propertyId) {
  return `${REPORT_PROSPECT_MARKER} ${normalizeText(propertyId)}`
}

export function isPropertyReportAlreadyCanvassed(prospects = [], propertyId = '') {
  const marker = getPropertyReportProspectMarker(propertyId).toLowerCase()
  if (!normalizeText(propertyId)) return false
  return (Array.isArray(prospects) ? prospects : []).some((prospect) => normalizeText(prospect?.notes).toLowerCase().includes(marker))
}

export function buildPropertyReportProspectDraft(report = {}) {
  const owner = includesReportType(report, 'deeds_summary')
    ? splitOwnerName(report?.deedsSummary?.registeredOwner)
    : { firstName: 'Property', lastName: 'Owner' }
  return {
    ...owner,
    phone: '',
    email: '',
    nextFollowUpDate: '',
    followUpPriority: 'Medium',
    followUpNote: `Review the ${report?.isDemoData === true ? 'fictional ' : ''}property report and plan first contact.`,
  }
}

export function buildPropertyReportProspectPayload(report = {}, draft = {}, context = {}) {
  const property = report?.property || {}
  const hasDeedsSummary = includesReportType(report, 'deeds_summary')
  const hasValuation = includesReportType(report, 'property_valuation')
  const owner = hasDeedsSummary ? splitOwnerName(report?.deedsSummary?.registeredOwner) : { firstName: 'Property', lastName: 'Owner' }
  const indicativeValue = hasValuation ? Number(report?.valuation?.indicativeValue || 0) || 0 : 0
  const ownerLabel = hasDeedsSummary ? normalizeText(report?.deedsSummary?.registeredOwner) : ''
  const isDemoData = report?.isDemoData === true
  const notes = [
    `Created from an Arch9 ${isDemoData ? 'demonstration ' : ''}property report.`,
    ownerLabel ? `${isDemoData ? 'Fictional registered owner' : 'Registered owner'}: ${ownerLabel}` : '',
    hasDeedsSummary && report?.deedsSummary?.titleDeedNumber ? `${isDemoData ? 'Demo title deed' : 'Title deed'}: ${report.deedsSummary.titleDeedNumber}` : '',
    report?.orderId ? `${isDemoData ? 'Demo report order' : 'Report order'}: ${report.orderId}` : '',
    getPropertyReportProspectMarker(property.id),
    isDemoData ? 'All ownership and property intelligence shown here is fictional demonstration data.' : '',
  ].filter(Boolean).join('\n')

  return {
    organisationId: normalizeText(context.organisationId),
    assignedAgentId: normalizeText(context.assignedAgentId) || null,
    assignedUserId: normalizeText(context.assignedUserId || context.assignedAgentId) || null,
    assignedAgentName: normalizeText(context.assignedAgentName) || null,
    assignedAgentEmail: normalizeText(context.assignedAgentEmail).toLowerCase() || null,
    branchId: normalizeText(context.branchId) || null,
    firstName: normalizeText(draft.firstName) || owner.firstName,
    lastName: normalizeText(draft.lastName) || owner.lastName,
    phone: normalizeText(draft.phone),
    email: normalizeText(draft.email).toLowerCase(),
    prospectType: 'Seller Prospect',
    area: normalizeText(property.suburb),
    areaSuburb: normalizeText(property.suburb),
    streetAddress: normalizeText(property.address),
    formattedAddress: normalizeText(property.formattedAddress || property.address),
    city: normalizeText(property.city),
    province: normalizeText(property.province),
    country: 'South Africa',
    postalCode: normalizeText(property.postalCode),
    latitude: Number.isFinite(Number(property.latitude)) ? Number(property.latitude) : null,
    longitude: Number.isFinite(Number(property.longitude)) ? Number(property.longitude) : null,
    propertyType: normalizeText(property.propertyType),
    source: 'Property Intelligence',
    canvassingMethod: 'Area Farming',
    status: 'New',
    nextFollowUpDate: normalizeText(draft.nextFollowUpDate),
    followUpPriority: normalizeText(draft.followUpPriority) || 'Medium',
    followUpNote: normalizeText(draft.followUpNote),
    estimatedValue: indicativeValue,
    estimatedPropertyValue: estimatedValueBand(indicativeValue),
    sellingIntent: 'Just Gathering Information',
    propertyOccupancy: 'Unknown',
    notes,
    convertedLeadId: null,
    createdBy: normalizeText(context.createdBy || context.assignedUserId || context.assignedAgentId) || null,
  }
}

export function buildPropertyReportProspectActivity(report = {}, prospect = {}, context = {}) {
  const property = report?.property || {}
  return {
    organisationId: normalizeText(context.organisationId),
    prospectId: normalizeText(prospect.id),
    agentId: normalizeText(context.assignedUserId || context.assignedAgentId) || null,
    agentName: normalizeText(context.assignedAgentName) || null,
    activityType: 'Prospect Created',
    activityNote: `Seller prospect created from ${report?.isDemoData === true ? 'fictional ' : ''}property report for ${normalizeText(property.address) || 'selected property'}.`,
    outcome: 'Added to Canvassing',
    metadata: {
      source: 'Property Intelligence',
      propertyId: normalizeText(property.id),
      reportId: normalizeText(report.id),
      reportOrderId: normalizeText(report.orderId),
      isDemoData: report?.isDemoData === true,
    },
    activityDate: new Date().toISOString(),
    createdBy: normalizeText(context.createdBy || context.assignedUserId || context.assignedAgentId) || null,
  }
}
