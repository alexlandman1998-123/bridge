// Operational tooling only. The server rechecks scope, authority and the saved
// fingerprint under locks; a report is never authority to overwrite task history.
export const RECONCILIATION_CONFIRMATION = 'REBUILD_DERIVED_JOURNEY_ONLY'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function ids(values, limit) {
  if (!Array.isArray(values) || !values.length || values.length > limit || values.some(id => !UUID.test(id)) || new Set(values).size !== values.length) {
    throw new Error(`Supply unique explicit matter IDs (maximum ${limit}).`)
  }
}
export async function auditSharedMatters(client, transactionIds) {
  ids(transactionIds, 100)
  const reports = []
  for (const id of transactionIds) {
    const { data, error } = await client.rpc('bridge_audit_shared_matter_journey', { p_transaction_id: id })
    if (error) throw new Error(`Audit failed for ${id}; no repairs performed.`)
    if (data?.transactionId !== id || data?.schemaVersion !== 1) throw new Error('Unexpected reconciliation response.')
    reports.push(data)
  }
  return reports
}
export async function repairSharedMatter(client, report, commandId, confirmation) {
  ids([report?.transactionId, commandId], 2)
  if (report?.schemaVersion !== 1 || report.decision !== 'repairable' || !/^[0-9a-f]{32}$/.test(report.fingerprint || '') || confirmation !== RECONCILIATION_CONFIRMATION) {
    throw new Error('Select a repairable audit and explicitly confirm projection-only repair.')
  }
  const { data, error } = await client.rpc('bridge_reconcile_shared_matter_journey', {
    p_transaction_id: report.transactionId, p_expected_fingerprint: report.fingerprint,
    p_command_id: commandId, p_confirmation: confirmation,
  })
  if (error) throw new Error(`Repair not confirmed for ${report.transactionId}. Reuse the same command ID after an uncertain response; otherwise audit again.`, { cause: error })
  if (data?.commandId !== commandId || data?.after?.decision !== 'clean') throw new Error('Unexpected repair receipt; retain command ID and verify before retrying.')
  return data
}
