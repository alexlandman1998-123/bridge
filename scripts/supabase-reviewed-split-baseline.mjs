// Minute-level migrations in this baseline are already recorded remotely and
// were verified by the Phase 6 investigation. Newer Supabase CLI versions can
// expose their remote versions as 14 digits by appending seconds (`00`) while
// keeping the local migration version at 12 digits.
export const REVIEWED_SPLIT_BASELINE = new Set([
  '202606010001',
  '202606030007',
  '202606030008',
  '202606030009',
  '202606030010',
  '202606030011',
  '202606040001',
  '202606040002',
  '202606040004',
  '202606040005',
  '202606050001',
  '202606080002',
  '202606090010',
  '202606110004',
  '202606110005',
  '202606110006',
  '202606110007',
])

export function pairSplitLedgerVersions(localOnlyVersions, remoteOnlyVersions) {
  const localVersions = new Set(localOnlyVersions)
  const remoteVersions = new Set(remoteOnlyVersions)
  const splitVersions = new Set()
  const splitRemoteVersions = new Set()

  for (const localVersion of localVersions) {
    if (remoteVersions.has(localVersion)) {
      splitVersions.add(localVersion)
      splitRemoteVersions.add(localVersion)
      continue
    }

    const secondPrecisionVersion = `${localVersion}00`
    if (REVIEWED_SPLIT_BASELINE.has(localVersion) && remoteVersions.has(secondPrecisionVersion)) {
      splitVersions.add(localVersion)
      splitRemoteVersions.add(secondPrecisionVersion)
    }
  }

  return {
    splitVersions: [...splitVersions].sort(),
    splitRemoteVersions,
  }
}
