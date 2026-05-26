const SUMMARY_CARD_ORDER = Object.freeze([
  ['totalApplications', 'Total Applications'],
  ['myApplications', 'My Applications'],
  ['processingQueue', 'Processing Queue'],
  ['missingDocuments', 'Missing Documents'],
  ['bankFeedbackPending', 'Bank Feedback'],
  ['submissionReady', 'Submission Ready'],
  ['overdueApplications', 'Overdue Applications'],
  ['complianceReview', 'Compliance Review'],
  ['managerEscalations', 'Manager Escalations'],
  ['approvedApplications', 'Approved Applications'],
  ['declinedOrBlockedApplications', 'Blocked / Declined'],
])

function toCount(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function BondDashboardSummary({ summary = null, loading = false }) {
  if (loading) {
    return (
      <section className="rounded-[18px] border border-[#dde6f1] bg-white p-4">
        <p className="text-sm text-[#5f7287]">Loading dashboard summary…</p>
      </section>
    )
  }

  const safeSummary = summary || {}

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {SUMMARY_CARD_ORDER.map(([key, label]) => (
        <article key={key} className="rounded-[16px] border border-[#dde6f1] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f8399]">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[#132130]">{toCount(safeSummary[key])}</p>
        </article>
      ))}
    </section>
  )
}
