import { buildBranchWorkspaceOverview } from './branchWorkspaceOverviewService'

function text(value) { return String(value || '').trim() }
function lower(value) { return text(value).toLowerCase() }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
function date(value) { const parsed = new Date(value || ''); return Number.isNaN(parsed.getTime()) ? null : parsed }
function recordDate(row = {}) { return date(row.updated_at || row.created_at) }
function inRange(row, range) { const value = recordDate(row); return Boolean(value && value >= range.start && value <= range.end) }

function signedMandate(value) { return ['signed', 'signed_uploaded', 'uploaded_signed', 'signed_external_pending_upload', 'fully_signed', 'completed'].includes(lower(value)) }
function completedCompliance(value) { return ['complete', 'completed', 'verified', 'cleared', 'approved'].includes(lower(value)) }

export function buildBranchWorkspacePerformance(branch = {}, options = {}) {
  const overview = buildBranchWorkspaceOverview(branch, options)
  const range = overview.range
  const listings = (branch.listings || []).filter((row) => inRange(row, range))
  const transactions = (branch.transactions || []).filter((row) => inRange(row, range))
  const performanceByAgent = overview.agents.map((agent) => ({ ...agent, transactions: agent.deals }))
  const mandateRows = listings.filter((row) => Object.prototype.hasOwnProperty.call(row, 'mandate_status'))
  const complianceRows = transactions.filter((row) => Object.prototype.hasOwnProperty.call(row, 'compliance_status'))
  const documentRows = transactions.filter((row) => Object.prototype.hasOwnProperty.call(row, 'documents_missing') || Object.prototype.hasOwnProperty.call(row, 'required_documents_missing'))
  const exceptions = [
    ...mandateRows.filter((row) => !signedMandate(row.mandate_status)).map((row) => ({ id: `mandate-${row.id}`, kind: 'listing', title: 'Missing or unsigned mandate', detail: text(row.title) || 'Listing requires a mandate status.', recordId: row.id })),
    ...complianceRows.filter((row) => !completedCompliance(row.compliance_status)).map((row) => ({ id: `compliance-${row.id}`, kind: 'transaction', title: 'Compliance review outstanding', detail: text(row.stage || row.lifecycle_state) || 'Transaction compliance needs review.', recordId: row.id })),
    ...documentRows.filter((row) => Boolean(row.documents_missing || row.required_documents_missing || number(row.missing_documents_count))).map((row) => ({ id: `documents-${row.id}`, kind: 'transaction', title: 'Required documents outstanding', detail: `${number(row.missing_documents_count)} document${number(row.missing_documents_count) === 1 ? '' : 's'} missing.`, recordId: row.id })),
  ]
  return {
    overview,
    trends: overview.series,
    funnel: overview.stages,
    agentPerformance: performanceByAgent,
    financials: { projectedCommission: overview.kpis.find((item) => item.key === 'commission')?.value ?? null, registeredCommission: overview.periodFinancials.gross },
    compliance: {
      mandate: { available: mandateRows.length > 0, total: mandateRows.length, complete: mandateRows.filter((row) => signedMandate(row.mandate_status)).length },
      transaction: { available: complianceRows.length > 0, total: complianceRows.length, complete: complianceRows.filter((row) => completedCompliance(row.compliance_status)).length },
      documents: { available: documentRows.length > 0, outstanding: documentRows.filter((row) => Boolean(row.documents_missing || row.required_documents_missing || number(row.missing_documents_count))).length },
      exceptions: [...new Map(exceptions.map((item) => [item.id, item])).values()],
    },
  }
}
