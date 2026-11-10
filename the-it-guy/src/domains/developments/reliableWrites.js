import { requireClient } from '../../lib/api/shared/readHelpers.js'
import { normalizeDevelopmentUnitRow } from './unitReadApi.js'

import { invokeDevelopmentWrite } from './writeRecovery.js'
export { invokeDevelopmentWrite } from './writeRecovery.js'

export async function saveDevelopmentUnitStatus({ developmentId, unitId, transactionId = null, expectedStatus, status, unitPatch = {}, reservationLeadId = null }) {
  if (!developmentId || !unitId || typeof expectedStatus !== 'string') throw new Error('Refresh this unit before changing its status.')
  const receipt = await invokeDevelopmentWrite(requireClient(), 'bridge_save_development_unit_status', developmentId, {
    p_unit_id: unitId, p_transaction_id: transactionId, p_expected_status: expectedStatus,
    p_status: status, p_unit_patch: unitPatch, p_reservation_lead_id: reservationLeadId,
  }, data => data.unit?.id === unitId && data.unit?.development_id === developmentId &&
    data.unit?.status === status && data.transactionId === transactionId &&
    (!reservationLeadId || (data.reservation?.developerLeadId === reservationLeadId && data.reservation?.unitId === unitId && data.reservation?.reservationState === 'none')))
  return { ...normalizeDevelopmentUnitRow(receipt.unit), reservationReceipt: receipt.reservation || null }
}

export async function saveDevelopmentUnitsBatch(developmentId, rows) {
  if (!developmentId || !Array.isArray(rows) || !rows.length) throw new Error('Generate at least one unit before saving.')
  const receipt = await invokeDevelopmentWrite(requireClient(), 'bridge_create_development_units_batch', developmentId,
    { p_units: rows }, data => Array.isArray(data.units) && data.units.length === rows.length &&
      new Set(data.units.map(unit => unit.id)).size === rows.length &&
      data.units.every((unit, index) => unit.id && unit.development_id === developmentId && unit.unit_number === String(rows[index].unitNumber).trim()))
  return receipt.units.map(normalizeDevelopmentUnitRow)
}
