// Poll the small, authorised journey frequently; reload documents, branding and
// all other portal panels only for a changed revision or periodic reconciliation.
export function shouldRefreshPortalDetails({ previousRevision, revision, lastFullReadAt, now = Date.now() }) {
  return (Number.isSafeInteger(revision) && revision !== previousRevision)
    || now - lastFullReadAt >= 60_000
}
