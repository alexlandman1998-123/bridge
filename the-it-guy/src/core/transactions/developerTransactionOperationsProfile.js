function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function toTitleLabel(value) {
  return normalizeText(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function hasAnyToken(value, tokens = []) {
  const haystack = normalizeText(value).toLowerCase()
  return tokens.some((token) => haystack.includes(token))
}

function getDocumentSearchText(document = {}) {
  return [
    document.name,
    document.label,
    document.category,
    document.groupKey,
    document.group_key,
    document.documentType,
    document.document_type,
    document.portalDocumentType,
    document.portal_document_type,
    document.portalWorkspaceCategory,
    document.portal_workspace_category,
    document.stageKey,
    document.stage_key,
    document.key,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ')
}

export function isDeveloperHandoverDocument(document = {}) {
  return hasAnyToken(getDocumentSearchText(document), [
    'handover',
    'occupation',
    'occupancy',
    'warranty',
    'manual',
    'key',
    'inspection',
    'meter',
    'snag',
  ])
}

function resolveSnagStatus(issue = {}) {
  return normalizeKey(issue.status || issue.issueStatus || issue.issue_status || issue.state || '')
}

function isOpenSnag(issue = {}) {
  const status = resolveSnagStatus(issue)
  return !['closed', 'resolved', 'complete', 'completed', 'cancelled', 'signed_off'].includes(status)
}

function resolveHandoverStatus(handover = {}) {
  const status = normalizeKey(handover.status || '')
  if (status && status !== 'not_started') return status
  if (handover.inspectionCompleted || handover.keysHandedOver || handover.manualsHandedOver || handover.remoteHandedOver) {
    return 'in_progress'
  }
  return 'not_started'
}

function resolveReservationStatus({ reservationRequired = false, reservationStatus = '' } = {}) {
  const status = normalizeKey(reservationStatus)
  if (!reservationRequired || status === 'not_required') return 'not_required'
  if (status === 'verified') return 'verified'
  if (status === 'paid' || status === 'uploaded') return 'pending_review'
  if (status === 'rejected') return 'reupload_required'
  if (status === 'pending' || status === 'requested') return 'requested'
  return 'pending'
}

function resolveTone(status) {
  const normalized = normalizeKey(status)
  if (['verified', 'completed', 'complete', 'ready'].includes(normalized)) return 'success'
  if (['pending_review', 'in_progress', 'scheduled', 'requested'].includes(normalized)) return 'warning'
  if (['reupload_required', 'blocked', 'missing'].includes(normalized)) return 'danger'
  return 'neutral'
}

export function buildDeveloperTransactionOperationsSummary({
  transaction = {},
  handover = {},
  documents = [],
  clientIssues = [],
  developmentSettings = {},
  onboardingStatus = 'Not Started',
} = {}) {
  const isDeveloperSale = ['developer_sale', 'development', 'developer'].includes(
    normalizeKey(transaction.transaction_type || transaction.transactionType || transaction.type || 'developer_sale'),
  )

  if (!isDeveloperSale) {
    return null
  }

  const reservationRequired = Boolean(transaction.reservation_required || transaction.reservationRequired)
  const reservationStatus = resolveReservationStatus({
    reservationRequired,
    reservationStatus: transaction.reservation_status || transaction.reservationStatus,
  })
  const normalizedHandoverStatus = resolveHandoverStatus(handover)
  const allDocuments = toArray(documents)
  const handoverDocuments = allDocuments.filter(isDeveloperHandoverDocument)
  const allSnags = toArray(clientIssues)
  const openSnags = allSnags.filter(isOpenSnag)
  const snagEnabled = Boolean(
    developmentSettings.snag_reporting_enabled ??
      developmentSettings.snagTrackingEnabled ??
      developmentSettings.snag_tracking_enabled ??
      true,
  )
  const handoverEnabled = Boolean(
    developmentSettings.handover_enabled ??
      developmentSettings.handoverEnabled ??
      true,
  )
  const checklist = [
    {
      id: 'inspection',
      label: 'Inspection complete',
      complete: Boolean(handover.inspectionCompleted || handover.inspection_completed),
    },
    {
      id: 'keys',
      label: 'Keys handed over',
      complete: Boolean(handover.keysHandedOver || handover.keys_handed_over),
    },
    {
      id: 'manuals',
      label: 'Manuals shared',
      complete: Boolean(handover.manualsHandedOver || handover.manuals_handed_over),
    },
    {
      id: 'meters',
      label: 'Meter readings captured',
      complete: Boolean(
        normalizeText(handover.electricityMeterReading || handover.electricity_meter_reading) &&
          normalizeText(handover.waterMeterReading || handover.water_meter_reading),
      ),
    },
  ]
  const completedChecklistCount = checklist.filter((item) => item.complete).length
  const blockers = []

  if (reservationRequired && reservationStatus !== 'verified') {
    blockers.push('Reservation deposit is not verified.')
  }
  if (snagEnabled && openSnags.length > 0) {
    blockers.push(`${openSnags.length} open snag${openSnags.length === 1 ? ' still needs' : 's still need'} attention.`)
  }
  if (handoverEnabled && completedChecklistCount < checklist.length) {
    blockers.push('Handover checklist is not complete.')
  }

  return {
    isDeveloperSale: true,
    reservation: {
      required: reservationRequired,
      status: reservationStatus,
      statusLabel: reservationStatus === 'not_required' ? 'Not Required' : toTitleLabel(reservationStatus),
      amount: transaction.reservation_amount ?? transaction.reservationAmount ?? null,
      tone: resolveTone(reservationStatus),
    },
    onboarding: {
      status: onboardingStatus,
      statusLabel: normalizeText(onboardingStatus) || 'Not Started',
      tone: normalizeKey(onboardingStatus).includes('complete') ? 'success' : 'warning',
    },
    handover: {
      enabled: handoverEnabled,
      status: normalizedHandoverStatus,
      statusLabel: handoverEnabled ? toTitleLabel(normalizedHandoverStatus) : 'Module Off',
      date: handover.handoverDate || handover.handover_date || '',
      checklist,
      completedChecklistCount,
      checklistTotalCount: checklist.length,
      documents: handoverDocuments,
      documentCount: handoverDocuments.length,
      blockers,
      ready: handoverEnabled && blockers.length === 0,
      tone: handoverEnabled ? resolveTone(normalizedHandoverStatus) : 'neutral',
    },
    snags: {
      enabled: snagEnabled,
      totalCount: allSnags.length,
      openCount: openSnags.length,
      resolvedCount: Math.max(allSnags.length - openSnags.length, 0),
      tone: !snagEnabled || openSnags.length === 0 ? 'success' : 'warning',
    },
    cards: [
      {
        id: 'reservation',
        label: 'Reservation Deposit',
        value: reservationRequired ? toTitleLabel(reservationStatus) : 'Not Required',
        meta: reservationRequired ? 'Proof and verification' : 'No deposit gate',
        tone: resolveTone(reservationStatus),
      },
      {
        id: 'handover',
        label: 'Handover Inspection',
        value: handoverEnabled ? toTitleLabel(normalizedHandoverStatus) : 'Module Off',
        meta: handover.handoverDate || handover.handover_date ? 'Scheduled' : 'Date pending',
        tone: handoverEnabled ? resolveTone(normalizedHandoverStatus) : 'neutral',
      },
      {
        id: 'snags',
        label: 'Snags',
        value: snagEnabled ? `${openSnags.length} open` : 'Module Off',
        meta: snagEnabled ? `${allSnags.length} total` : 'Not enabled',
        tone: !snagEnabled || openSnags.length === 0 ? 'success' : 'warning',
      },
      {
        id: 'documents',
        label: 'Handover Documents',
        value: `${handoverDocuments.length}`,
        meta: handoverDocuments.length === 1 ? 'document ready' : 'documents ready',
        tone: handoverDocuments.length ? 'success' : 'neutral',
      },
    ],
  }
}
