// Extracted from the legacy API; query, mapping and error behaviour are preserved.
import { normalizeStageLabel, CANONICAL_TRANSACTION_STAGES, MAIN_PROCESS_STAGES, getMainStageFromDetailedStage } from './stageConfig'

export const HANDOVER_STATUSES = ['not_started', 'in_progress', 'completed']

export const TRANSACTION_HANDOVER_SELECT = `
  id,
  transaction_id,
  development_id,
  unit_id,
  buyer_id,
  status,
  handover_date,
  electricity_meter_reading,
  water_meter_reading,
  gas_meter_reading,
  keys_handed_over,
  remote_handed_over,
  manuals_handed_over,
  inspection_completed,
  notes,
  signature_name,
  signature_signed_at,
  created_at,
  updated_at
`

export function getDefaultHandoverRecord({ developmentId = null, unitId = null, transaction = null, buyer = null } = {}) {
  return {
    id: null,
    transactionId: transaction?.id || null,
    developmentId: developmentId || transaction?.development_id || null,
    unitId: unitId || transaction?.unit_id || null,
    buyerId: transaction?.buyer_id || buyer?.id || null,
    status: 'not_started',
    handoverDate: '',
    electricityMeterReading: '',
    waterMeterReading: '',
    gasMeterReading: '',
    keysHandedOver: false,
    remoteHandedOver: false,
    manualsHandedOver: false,
    inspectionCompleted: false,
    notes: '',
    signatureName: buyer?.name || '',
    signatureSignedAt: null,
    createdAt: null,
    updatedAt: null,
  }
}

export function normalizeHandoverRow(row, defaults) {
  const status = String(row?.status || defaults.status || 'not_started')
    .trim()
    .toLowerCase()

  return {
    ...defaults,
    id: row?.id || defaults.id || null,
    transactionId: row?.transaction_id || defaults.transactionId || null,
    developmentId: row?.development_id || defaults.developmentId || null,
    unitId: row?.unit_id || defaults.unitId || null,
    buyerId: row?.buyer_id || defaults.buyerId || null,
    status: HANDOVER_STATUSES.includes(status) ? status : 'not_started',
    handoverDate: row?.handover_date || '',
    electricityMeterReading: row?.electricity_meter_reading || '',
    waterMeterReading: row?.water_meter_reading || '',
    gasMeterReading: row?.gas_meter_reading || '',
    keysHandedOver: Boolean(row?.keys_handed_over),
    remoteHandedOver: Boolean(row?.remote_handed_over),
    manualsHandedOver: Boolean(row?.manuals_handed_over),
    inspectionCompleted: Boolean(row?.inspection_completed),
    notes: row?.notes || '',
    signatureName: row?.signature_name || defaults.signatureName || '',
    signatureSignedAt: row?.signature_signed_at || null,
    createdAt: row?.created_at || defaults.createdAt || null,
    updatedAt: row?.updated_at || defaults.updatedAt || null,
  }
}

export function normalizeStage(rawStage, rawStatus) {
  const normalizedStage = normalizeStageLabel(rawStage)
  if (CANONICAL_TRANSACTION_STAGES.includes(normalizedStage)) {
    return normalizedStage
  }

  const normalizedStatus = normalizeStageLabel(rawStatus)
  if (CANONICAL_TRANSACTION_STAGES.includes(normalizedStatus)) {
    return normalizedStatus
  }

  return 'Available'
}

export function normalizeMainStage(rawMainStage, fallbackDetailedStage = 'Available') {
  const normalized = String(rawMainStage || '').toUpperCase()
  if (MAIN_PROCESS_STAGES.includes(normalized)) {
    return normalized
  }

  return getMainStageFromDetailedStage(fallbackDetailedStage)
}

export function byUnitNumber(a, b) {
  return String(a.unit.unit_number).localeCompare(String(b.unit.unit_number), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

export function byDevelopmentThenUnit(a, b) {
  const byName = String(a.development?.name || '').localeCompare(String(b.development?.name || ''), undefined, {
    sensitivity: 'base',
  })

  if (byName !== 0) {
    return byName
  }

  return byUnitNumber(a, b)
}

export function latestTimestamp(row) {
  return row.transaction?.updated_at || row.transaction?.created_at || null
}

export function getTransactionRowIdentity(row) {
  const transactionId = row?.transaction?.id
  if (transactionId) {
    return `transaction:${transactionId}`
  }

  const unitId = row?.unit?.id
  if (unitId) {
    return `unit:${unitId}`
  }

  return null
}

export function selectPreferredTransactionRow(currentRow, candidateRow) {
  if (!currentRow) {
    return candidateRow
  }

  const transactionUnitId = candidateRow?.transaction?.unit_id || currentRow?.transaction?.unit_id || null
  if (transactionUnitId) {
    const currentMatchesUnit = String(currentRow?.unit?.id || '') === String(transactionUnitId)
    const candidateMatchesUnit = String(candidateRow?.unit?.id || '') === String(transactionUnitId)

    if (candidateMatchesUnit && !currentMatchesUnit) {
      return candidateRow
    }

    if (currentMatchesUnit && !candidateMatchesUnit) {
      return currentRow
    }
  }

  const currentUpdatedAt = new Date(latestTimestamp(currentRow) || 0).getTime()
  const candidateUpdatedAt = new Date(latestTimestamp(candidateRow) || 0).getTime()
  return candidateUpdatedAt >= currentUpdatedAt ? candidateRow : currentRow
}

export function dedupeTransactionRows(rows = []) {
  const deduped = new Map()
  const fallbackRows = []

  for (const row of rows || []) {
    const identity = getTransactionRowIdentity(row)
    if (!identity) {
      fallbackRows.push(row)
      continue
    }

    const current = deduped.get(identity)
    deduped.set(identity, selectPreferredTransactionRow(current, row))
  }

  return [...deduped.values(), ...fallbackRows]
}
