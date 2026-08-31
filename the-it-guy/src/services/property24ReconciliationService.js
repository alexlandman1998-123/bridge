import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function createIssue({ type, listingNumber, listingId = null, title = '', detail, action }) {
  return {
    key: `${type}:${listingId || listingNumber || title}`,
    type,
    listingNumber: listingNumber || null,
    listingId: listingId || null,
    title: normalizeText(title) || (listingNumber ? `Property24 #${listingNumber}` : 'Property24 listing'),
    detail,
    action,
  }
}

export function buildProperty24ReconciliationOperatorView(report = {}) {
  const reconciliation = report.reconciliation || {}
  const reconciliationSummary = reconciliation.summary || {}
  const updateSummary = report.updates?.summary || {}
  const visibilitySummary = report.portalVisibility?.summary || {}
  const issues = []

  asArray(reconciliation.statusDrift).forEach((item) => {
    issues.push(createIssue({
      type: 'status_drift',
      listingNumber: item.listingNumber,
      listingId: item.listingId,
      title: item.listingTitle,
      detail: `Arch9 says ${item.localStatus || 'unknown'}; Property24 says ${item.remoteStatus || 'unknown'}.`,
      action: 'Open the Arch9 listing and confirm the intended lifecycle status before applying any change.',
    }))
  })
  asArray(reconciliation.missingOnProperty24).forEach((item) => {
    issues.push(createIssue({
      type: 'missing_on_property24',
      listingNumber: item.listingNumber,
      listingId: item.listingId,
      title: item.listing?.title,
      detail: 'Arch9 has a Property24 sync record, but Property24 did not return this listing.',
      action: 'Check whether the listing was removed or closed on Property24, then review its Arch9 sync history.',
    }))
  })
  asArray(reconciliation.unexpectedOnProperty24).forEach((item) => {
    issues.push(createIssue({
      type: 'unexpected_on_property24',
      listingNumber: item.listingNumber,
      title: `Property24 #${item.listingNumber}`,
      detail: `Property24 returned an unlinked listing with status ${item.status || 'unknown'}.`,
      action: 'Confirm whether it belongs to this agency migration before mapping or importing it into Arch9.',
    }))
  })
  asArray(report.portalVisibility?.checks).filter((item) => item.drift || item.error).forEach((item) => {
    issues.push(createIssue({
      type: item.error ? 'portal_check_failed' : 'portal_visibility_drift',
      listingNumber: item.listingNumber,
      listingId: item.listingId,
      detail: item.error
        ? `Portal visibility check failed: ${item.error.message || 'unknown error'}.`
        : `Arch9 portal visibility is ${item.localIsOnPortal ? 'on' : 'off'}, while Property24 is ${item.remoteIsOnPortal ? 'on' : 'off'}.`,
      action: 'Refresh the listing status and verify the public Property24 page before changing Arch9.',
    }))
  })
  asArray(report.updates?.updates).filter((item) => !item.knownToArch9).forEach((item) => {
    issues.push(createIssue({
      type: 'unmatched_update',
      listingNumber: item.listingNumber,
      title: `Property24 #${item.listingNumber}`,
      detail: `Property24 reported a recent ${item.status || 'status'} update for a listing that is not linked to Arch9.`,
      action: 'Confirm whether this listing belongs to the agency before creating or repairing a mapping.',
    }))
  })

  const uniqueIssues = [...new Map(issues.map((issue) => [issue.key, issue])).values()]
  return {
    status: normalizeText(report.status).toUpperCase() || 'NOT_RUN',
    generatedAt: report.generatedAt || null,
    mode: report.mode || 'REPORT_ONLY',
    safety: report.safety || {},
    summary: {
      trackedListings: Number(reconciliationSummary.localCount || 0),
      property24Listings: Number(reconciliationSummary.remoteCount || 0),
      matchedListings: Number(reconciliationSummary.matchedCount || 0),
      statusDrift: Number(reconciliationSummary.statusDriftCount || 0),
      missingOnProperty24: Number(reconciliationSummary.missingOnProperty24Count || 0),
      unexpectedOnProperty24: Number(reconciliationSummary.unexpectedOnProperty24Count || 0),
      unmatchedUpdates: Number(updateSummary.unmatchedCount || 0),
      portalVisibilityDrift: Number(visibilitySummary.driftCount || 0),
      portalCheckFailures: Number(visibilitySummary.failedCount || 0),
      issueCount: uniqueIssues.length,
    },
    issues: uniqueIssues,
  }
}

export async function runProperty24OrganisationReconciliation({ organisationId, includePortalChecks = true, limit = 25 } = {}) {
  const normalizedOrganisationId = normalizeText(organisationId)
  if (!normalizedOrganisationId) throw new Error('Organisation ID is required before reconciling Property24.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Sign in before reconciling Property24.')
  const sessionResult = await supabase.auth.getSession()
  const accessToken = sessionResult.data?.session?.access_token
  if (!accessToken) throw new Error('Sign in again before reconciling Property24.')

  const response = await fetch('/api/property24/settings/reconciliation', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      organisationId: normalizedOrganisationId,
      includePortalChecks: includePortalChecks !== false,
      limit: Math.min(Math.max(Number(limit || 25), 1), 100),
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.message || 'Property24 reconciliation failed.')
    error.code = payload.error || 'property24_reconciliation_failed'
    error.details = payload
    throw error
  }
  return {
    report: payload.report,
    view: buildProperty24ReconciliationOperatorView(payload.report),
  }
}
