import { buildBranchWorkspaceOverview } from './branchWorkspaceOverviewService'

function text(value) { return String(value || '').trim() }
function lower(value) { return text(value).toLowerCase() }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
function date(value) { const parsed = new Date(value || ''); return Number.isNaN(parsed.getTime()) ? null : parsed }
function recordDate(row = {}) { return date(row.updated_at || row.created_at) }
function inRange(row, range) { const value = recordDate(row); return Boolean(value && value >= range.start && value <= range.end) }

function commission(row = {}) {
  const amount = number(row.gross_commission_amount || row.projected_commission_amount || row.commission_amount)
  if (amount) return amount
  const rate = number(row.gross_commission_percentage || row.commission_percentage || row.commission_rate)
  const value = number(row.sales_price || row.purchase_price || row.sale_price)
  return rate && value ? value * rate / 100 : 0
}

function resolveRange(period = 'this_month', from, to, now = new Date()) {
  const customFrom = date(from)
  const customTo = date(to)
  if (customFrom && customTo && customFrom <= customTo) {
    customFrom.setHours(0, 0, 0, 0)
    customTo.setHours(23, 59, 59, 999)
    return { start: customFrom, end: customTo }
  }
  const end = new Date(now)
  const start = period === 'last_month'
    ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
    : period === '90_days'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89)
      : new Date(now.getFullYear(), now.getMonth(), 1)
  return { start, end }
}

function conversion(numerator, denominator) { return denominator ? Math.round(numerator / denominator * 100) : null }
function activeTransaction(row = {}) { return !['registered', 'cancelled', 'canceled', 'archived', 'completed'].includes(lower(row.lifecycle_state || row.stage)) && !row.registered_at }
function signedMandate(value) { return ['signed', 'signed_uploaded', 'uploaded_signed', 'signed_external_pending_upload', 'fully_signed', 'completed'].includes(lower(value)) }
function completedCompliance(value) { return ['complete', 'completed', 'verified', 'cleared', 'approved'].includes(lower(value)) }

export function buildBranchWorkspacePerformance(branch = {}, options = {}) {
  const overview = buildBranchWorkspaceOverview(branch, options)
  const range = resolveRange(options.period, options.from, options.to, options.now)
  const leads = (branch.leads || []).filter((row) => inRange(row, range))
  const listings = (branch.listings || []).filter((row) => inRange(row, range))
  const transactions = (branch.transactions || []).filter((row) => inRange(row, range))
  const qualified = leads.filter((row) => lower(row.stage || row.status).includes('qualif')).length
  const viewings = leads.filter((row) => lower(row.stage || row.status).includes('view')).length
  const offers = transactions.filter((row) => lower(row.stage || row.lifecycle_state).includes('offer')).length
  const registered = transactions.filter((row) => Boolean(row.registered_at) || lower(row.lifecycle_state) === 'registered').length
  const activeTransactions = transactions.filter(activeTransaction)
  const registeredCommission = transactions.filter((row) => Boolean(row.registered_at) || lower(row.lifecycle_state) === 'registered').reduce((sum, row) => sum + commission(row), 0)
  const performanceByAgent = overview.staff.map((agent) => ({ ...agent, conversion: conversion(agent.transactions, agent.listings) }))
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
    funnel: [
      { key: 'leads', label: 'Leads received', count: leads.length, rate: null },
      { key: 'qualified', label: 'Qualified', count: qualified, rate: conversion(qualified, leads.length) },
      { key: 'viewings', label: 'Viewings', count: viewings, rate: conversion(viewings, qualified) },
      { key: 'offers', label: 'Offers', count: offers, rate: conversion(offers, viewings) },
      { key: 'transactions', label: 'Active transactions', count: activeTransactions.length, rate: conversion(activeTransactions.length, offers) },
      { key: 'registered', label: 'Registered', count: registered, rate: conversion(registered, activeTransactions.length) },
    ],
    agentPerformance: performanceByAgent,
    financials: { projectedCommission: overview.kpis.find((item) => item.key === 'commission')?.value || 0, registeredCommission },
    compliance: {
      mandate: { available: mandateRows.length > 0, total: mandateRows.length, complete: mandateRows.filter((row) => signedMandate(row.mandate_status)).length },
      transaction: { available: complianceRows.length > 0, total: complianceRows.length, complete: complianceRows.filter((row) => completedCompliance(row.compliance_status)).length },
      documents: { available: documentRows.length > 0, outstanding: documentRows.filter((row) => Boolean(row.documents_missing || row.required_documents_missing || number(row.missing_documents_count))).length },
      exceptions: [...new Map(exceptions.map((item) => [item.id, item])).values()],
    },
  }
}
