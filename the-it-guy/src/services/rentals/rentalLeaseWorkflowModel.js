export const RENTAL_LEASE_CAPTURE_VERSION = 'arch9_rental_lease_capture_v1'

export const RENTAL_LEASE_INITIAL_FORM = Object.freeze({
  listingId: '',
  applicationReference: '',
  tenantName: '',
  tenantEmail: '',
  tenantPhone: '',
  leaseStartDate: '',
  leaseEndDate: '',
  occupationDate: '',
  monthlyRent: '',
  depositAmount: '',
  leasePeriodMonths: '12',
  leaseStatus: 'draft',
  signatureStatus: 'not_started',
  depositStatus: 'not_requested',
  handoverStatus: 'not_started',
  checkInStatus: 'not_started',
  keysStatus: 'not_started',
  conditionReportStatus: 'not_started',
  notes: '',
})

export const RENTAL_LEASE_SELECT_OPTIONS = Object.freeze({
  leaseStatus: [
    { value: 'draft', label: 'Draft' },
    { value: 'generated', label: 'Generated' },
    { value: 'sent_for_signature', label: 'Sent for signature' },
    { value: 'partially_signed', label: 'Partially signed' },
    { value: 'fully_signed', label: 'Fully signed' },
    { value: 'active', label: 'Active' },
    { value: 'cancelled', label: 'Cancelled' },
  ],
  signatureStatus: [
    { value: 'not_started', label: 'Not started' },
    { value: 'prepared', label: 'Prepared' },
    { value: 'sent', label: 'Sent' },
    { value: 'tenant_signed', label: 'Tenant signed' },
    { value: 'landlord_signed', label: 'Landlord signed' },
    { value: 'fully_signed', label: 'Fully signed' },
  ],
  depositStatus: [
    { value: 'not_requested', label: 'Not requested' },
    { value: 'requested', label: 'Requested' },
    { value: 'received_unverified', label: 'Received unverified' },
    { value: 'verified', label: 'Verified' },
    { value: 'waived', label: 'Waived' },
  ],
  handoverStatus: [
    { value: 'not_started', label: 'Not started' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'completed', label: 'Completed' },
  ],
  checklistStatus: [
    { value: 'not_started', label: 'Not started' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'completed', label: 'Completed' },
    { value: 'issue_found', label: 'Issue found' },
  ],
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizePositiveNumber(value) {
  const parsed = normalizeNumber(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

function addMonthsIso(dateValue, monthsValue) {
  const normalizedDate = normalizeText(dateValue)
  const months = normalizeNumber(monthsValue)
  if (!normalizedDate || !months) return ''
  const date = new Date(`${normalizedDate}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return ''
  date.setUTCMonth(date.getUTCMonth() + months)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function optionLabel(group, value) {
  const normalized = normalizeText(value)
  const options = group === 'checklistStatus'
    ? RENTAL_LEASE_SELECT_OPTIONS.checklistStatus
    : RENTAL_LEASE_SELECT_OPTIONS[group]
  return options?.find((item) => item.value === normalized)?.label || normalized
}

function compactReferencePart(value) {
  return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8)
}

export function buildRentalLeaseInitialFormFromApplication(application = {}, listing = {}) {
  const monthlyRent = listing.askingPrice ||
    listing.asking_price ||
    listing.listingPublicationData?.askingPrice ||
    listing.listingPublicationData?.asking_price ||
    ''
  const occupationDate = normalizeText(application.intendedOccupationDate)
  const leasePeriodMonths = '12'
  return {
    ...RENTAL_LEASE_INITIAL_FORM,
    listingId: normalizeText(application.listingId || listing.id),
    applicationReference: normalizeText(application.reference),
    tenantName: normalizeText(application.tenantName),
    tenantEmail: normalizeText(application.tenantEmail),
    tenantPhone: normalizeText(application.tenantPhone),
    leaseStartDate: occupationDate,
    leaseEndDate: addMonthsIso(occupationDate, leasePeriodMonths),
    occupationDate,
    monthlyRent: monthlyRent ? String(monthlyRent) : '',
    depositAmount: monthlyRent ? String(Number(monthlyRent) * 2) : '',
    leasePeriodMonths,
  }
}

export function validateRentalLeaseWorkflowForm(form = {}) {
  const errors = []
  if (!normalizeText(form.listingId)) errors.push('Rental listing is required.')
  if (!normalizeText(form.tenantName)) errors.push('Tenant name is required.')
  if (!normalizeText(form.leaseStartDate)) errors.push('Lease start date is required.')
  if (!normalizeText(form.occupationDate)) errors.push('Occupation date is required.')
  if (!normalizePositiveNumber(form.monthlyRent)) errors.push('Monthly rent is required.')
  if (!normalizePositiveNumber(form.depositAmount) && normalizeText(form.depositStatus) !== 'waived') {
    errors.push('Deposit amount is required unless the deposit is waived.')
  }
  return errors
}

export function buildRentalLeaseReference(form = {}, options = {}) {
  const tenantPart = compactReferencePart(form.tenantName) || 'TENANT'
  const suffix = compactReferencePart(options.nowIso || new Date().toISOString()) || 'LEASE'
  return `RTL-${tenantPart}-${suffix}`
}

export function buildRentalLeaseWorkflowMetadata(form = {}, listing = {}, application = {}, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString()
  const leasePeriodMonths = normalizeNumber(form.leasePeriodMonths)
  const leaseStartDate = normalizeText(form.leaseStartDate)
  const leaseEndDate = normalizeText(form.leaseEndDate) || addMonthsIso(leaseStartDate, leasePeriodMonths)
  return {
    captureVersion: RENTAL_LEASE_CAPTURE_VERSION,
    leaseReference: buildRentalLeaseReference(form, { nowIso }),
    listingId: normalizeText(form.listingId),
    listingTitle: normalizeText(listing.listingTitle || listing.title || listing.listingPublicationData?.title),
    applicationReference: normalizeText(form.applicationReference || application.reference),
    tenant: {
      name: normalizeText(form.tenantName || application.tenantName),
      email: normalizeText(form.tenantEmail || application.tenantEmail),
      phone: normalizeText(form.tenantPhone || application.tenantPhone),
    },
    lease: {
      leaseStartDate,
      leaseEndDate,
      occupationDate: normalizeText(form.occupationDate),
      monthlyRent: normalizeNumber(form.monthlyRent),
      depositAmount: normalizeNumber(form.depositAmount),
      leasePeriodMonths,
      leaseStatus: normalizeText(form.leaseStatus) || 'draft',
      signatureStatus: normalizeText(form.signatureStatus) || 'not_started',
    },
    deposit: {
      status: normalizeText(form.depositStatus) || 'not_requested',
      amount: normalizeNumber(form.depositAmount),
      accountingEnabled: false,
    },
    handover: {
      status: normalizeText(form.handoverStatus) || 'not_started',
      occupationDate: normalizeText(form.occupationDate),
      checkInStatus: normalizeText(form.checkInStatus) || 'not_started',
      keysStatus: normalizeText(form.keysStatus) || 'not_started',
      conditionReportStatus: normalizeText(form.conditionReportStatus) || 'not_started',
    },
    notes: normalizeText(form.notes),
    capturedAt: nowIso,
  }
}

export function buildRentalLeaseWorkflowActivityPayload(form = {}, listing = {}, application = {}, context = {}) {
  const metadata = buildRentalLeaseWorkflowMetadata(form, listing, application, context)
  const tenantName = metadata.tenant.name || 'Tenant'
  const listingTitle = metadata.listingTitle || 'rental listing'
  return {
    privateListingId: metadata.listingId,
    activityType: 'rental_lease_workflow_created',
    activityTitle: `${tenantName} lease workflow created`,
    activityDescription: `Lease workflow created for ${listingTitle}. Lease status: ${metadata.lease.leaseStatus}.`,
    performedBy: context.performedBy || context.assignedAgentId || null,
    visibility: 'internal',
    metadata,
  }
}

export function mapRentalLeaseWorkflowActivity(activity = {}, listing = {}) {
  const metadata = activity.metadata || activity.metadata_json || {}
  const tenant = metadata.tenant || {}
  const lease = metadata.lease || {}
  const deposit = metadata.deposit || {}
  const handover = metadata.handover || {}
  return {
    id: normalizeText(activity.id || metadata.leaseReference),
    listingId: normalizeText(activity.private_listing_id || metadata.listingId),
    listingTitle: normalizeText(metadata.listingTitle || listing.listingTitle || listing.title),
    reference: normalizeText(metadata.leaseReference),
    applicationReference: normalizeText(metadata.applicationReference),
    tenantName: normalizeText(tenant.name),
    tenantEmail: normalizeText(tenant.email),
    tenantPhone: normalizeText(tenant.phone),
    leaseStartDate: normalizeText(lease.leaseStartDate),
    leaseEndDate: normalizeText(lease.leaseEndDate),
    occupationDate: normalizeText(lease.occupationDate || handover.occupationDate),
    monthlyRent: lease.monthlyRent ?? null,
    depositAmount: deposit.amount ?? lease.depositAmount ?? null,
    leaseStatus: normalizeText(lease.leaseStatus) || 'draft',
    signatureStatus: normalizeText(lease.signatureStatus) || 'not_started',
    depositStatus: normalizeText(deposit.status) || 'not_requested',
    handoverStatus: normalizeText(handover.status) || 'not_started',
    checkInStatus: normalizeText(handover.checkInStatus) || 'not_started',
    keysStatus: normalizeText(handover.keysStatus) || 'not_started',
    conditionReportStatus: normalizeText(handover.conditionReportStatus) || 'not_started',
    notes: normalizeText(metadata.notes),
    capturedAt: normalizeText(metadata.capturedAt || activity.created_at),
  }
}

export function getRentalLeaseStatusLabel(group, value) {
  return optionLabel(group, value)
}
