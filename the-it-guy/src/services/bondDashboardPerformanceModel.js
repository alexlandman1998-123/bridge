// Dashboard measures use recorded events, never general transaction update dates.
const DAY = 86400000
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const date = (value) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null
export const bondMoney = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(numeric(value))
const unique = (rows) => [...new Map(rows.map((row) => [row.id, row])).values()]
const approved = (record) => ['approved', 'buyer_approved'].includes(record.status)

export function buildBondDashboardPerformance({ rows = [], submissions = [], commissions = [], reportingScope = {}, now = new Date(), bankAvailable = true, commissionAvailable = true } = {}) {
  const end = new Date(now).getTime()
  // South Africa has a fixed UTC+02 offset and no daylight saving time.
  const local = new Date(end + 7200000)
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 7200000
  const inMonth = (value) => date(value) !== null && date(value) >= start && date(value) <= end
  const observed = (value) => date(value) !== null && date(value) <= end
  const transactions = unique(rows.map((row) => row.transaction || row).filter((tx) => tx.id))
  const ids = new Set(transactions.map((tx) => tx.id))
  const bankRecords = unique(submissions.filter((record) => ids.has(record.transaction_id) && observed(record.submitted_at)))
  const byTransaction = new Map(transactions.map((tx) => [tx.id, bankRecords.filter((record) => record.transaction_id === tx.id)]))
  const registrationAt = (tx) => tx.registered_at || tx.registration_date
  const registered = transactions.filter((tx) => inMonth(registrationAt(tx)))
  const cohort = transactions.filter((tx) => {
    const first = byTransaction.get(tx.id).map((record) => date(record.submitted_at)).sort((a, b) => a - b)[0]
    return first !== undefined && first >= start && first <= end
  })
  const registeredAfterSubmission = (tx) => observed(registrationAt(tx)) && date(registrationAt(tx)) >= Math.min(...byTransaction.get(tx.id).map((record) => date(record.submitted_at)))
  const cohortApproved = cohort.filter((tx) => registeredAfterSubmission(tx) || byTransaction.get(tx.id).some(approved))
  const cohortRegistered = cohort.filter(registeredAfterSubmission)
  const rate = (numerator, denominator) => denominator ? Math.round(numerator / denominator * 100) : null
  const banks = [...new Set(bankRecords.map((record) => record.bank_name || 'Unnamed bank'))].map((name) => {
    const records = bankRecords.filter((record) => (record.bank_name || 'Unnamed bank') === name && inMonth(record.submitted_at))
    const decided = records.filter((record) => approved(record) || record.status === 'declined')
    const times = decided.map((record) => date(record.feedback_received_at) !== null && observed(record.feedback_received_at) && date(record.feedback_received_at) >= date(record.submitted_at) ? (date(record.feedback_received_at) - date(record.submitted_at)) / DAY : null).filter((value) => value !== null)
    return { name, submitted: records.length, approved: records.filter(approved).length, decided: decided.length, measured: times.length, days: times.length ? Math.round(times.reduce((sum, value) => sum + value, 0) / times.length * 10) / 10 : null, approvalRate: rate(records.filter(approved).length, decided.length) }
  }).filter((bank) => bank.submitted).sort((a, b) => b.submitted - a.submitted || a.name.localeCompare(b.name))
  const ledger = unique(commissions.filter((record) => ids.has(record.transaction_id || record.application_id)))
  const buckets = [['estimated', 'Estimated', 'Pending'], ['confirmed', 'Confirmed', 'Approved'], ['awaiting', 'Awaiting payment', 'Processing'], ['paid', 'Paid this month', 'Paid']].map(([key, label, status]) => {
    const records = ledger.filter((record) => record.status === status && (status !== 'Paid' || inMonth(record.paid_at)))
    return { key, label, amount: records.reduce((sum, record) => sum + numeric(record.amount), 0), count: records.length }
  })
  const targets = reportingScope.organisationTargets || {}
  const canCompareTargets = reportingScope.isWorkspaceHq || reportingScope.scopeLevel === 'workspace_hq' || ['owner_director', 'hq_manager'].includes(reportingScope.dashboardMode)
  const loan = (tx) => numeric(tx.registered_loan_amount || tx.registered_bond_amount || tx.accepted_loan_amount || tx.bond_amount)
  const targetRows = [
    { key: 'registrations', label: 'Registrations', actual: registered.length, target: canCompareTargets ? numeric(targets.monthlyRegistrations) : 0, money: false },
    { key: 'value', label: 'Registered loan value', actual: registered.reduce((sum, tx) => sum + loan(tx), 0), target: canCompareTargets ? numeric(targets.monthlyRegisteredLoanValue) : 0, money: true },
  ].map((item) => ({ ...item, progress: item.target > 0 ? Math.round(item.actual / item.target * 100) : null }))
  return {
    period: new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date(end)),
    bankAvailable, commissionAvailable, canCompareTargets, targets: targetRows,
    conversion: { submitted: cohort.length, approved: cohortApproved.length, registered: cohortRegistered.length, approvalRate: rate(cohortApproved.length, cohort.length), registrationRate: rate(cohortRegistered.length, cohortApproved.length) },
    banks, commissions: buckets, commissionPipeline: buckets.filter((item) => item.key !== 'paid').reduce((sum, item) => sum + item.amount, 0),
    bankRecords,
  }
}
