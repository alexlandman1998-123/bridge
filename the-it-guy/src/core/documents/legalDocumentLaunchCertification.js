const DOMAIN_REQUIREMENTS = Object.freeze({
  activation: 'HEALTHY',
  approval: 'READY_FOR_RELEASE_GATES',
  rendering: 'READY_FOR_B1_REFREEZE',
  capacity: 'READY_FOR_J1',
  lifecycle: 'READY_FOR_L1',
})

export function assessLegalDocumentLaunchCertification({ domains = {}, coverage = {} } = {}) {
  const blockers = []
  const domainResults = Object.entries(DOMAIN_REQUIREMENTS).map(([domain, requiredStatus]) => {
    const report = domains?.[domain] || {}
    const status = report?.status || 'UNAVAILABLE'
    const ready = status === requiredStatus
    if (!ready) {
      const upstream = Array.isArray(report?.blockers) && report.blockers.length
        ? report.blockers
        : [{ code: `L1_${domain.toUpperCase()}_NOT_READY`, solution: `Restore ${domain} evidence to ${requiredStatus} and rerun L1.` }]
      for (const blocker of upstream) {
        blockers.push({ domain, code: blocker?.code || `L1_${domain.toUpperCase()}_NOT_READY`, detail: blocker?.detail || null, solution: blocker?.solution || `Resolve the ${domain} blocker and rerun its terminal verifier.` })
      }
    }
    return { domain, status, requiredStatus, ready, blockerCount: Array.isArray(report?.blockers) ? report.blockers.length : ready ? 0 : 1 }
  })
  if (!coverage?.otp) blockers.push({ domain: 'coverage', code: 'L1_OTP_JOURNEY_UNPROVEN', detail: null, solution: 'Complete one controlled OTP generation-to-final-delivery journey and rerun the terminal gates.' })
  if (!coverage?.mandate) blockers.push({ domain: 'coverage', code: 'L1_MANDATE_JOURNEY_UNPROVEN', detail: null, solution: 'Complete one controlled mandate generation-to-final-delivery journey and rerun the terminal gates.' })
  const uniqueBlockers = [...new Map(blockers.map((row) => [`${row.domain}:${row.code}:${row.detail || ''}`, row])).values()]
  return { ready: uniqueBlockers.length === 0, blockers: uniqueBlockers, domainResults }
}

export { DOMAIN_REQUIREMENTS as LEGAL_DOCUMENT_L1_DOMAIN_REQUIREMENTS }
