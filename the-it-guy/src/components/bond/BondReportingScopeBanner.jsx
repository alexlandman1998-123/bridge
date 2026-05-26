function normalizeText(value) {
  return String(value || '').trim()
}

function labelFromScope(reportingScope = {}) {
  const workspaceKind = normalizeText(reportingScope.workspaceKind)
  const scopeLevel = normalizeText(reportingScope.scopeLevel)
  const regionId = normalizeText(reportingScope.regionId)
  const unitId = normalizeText(reportingScope.workspaceUnitId)

  if (workspaceKind === 'personal_originator') {
    return 'Viewing: Independent workspace'
  }
  if (scopeLevel === 'workspace_hq') {
    return 'Viewing: All company applications'
  }
  if (scopeLevel === 'region') {
    return `Viewing: ${regionId || 'Assigned'} region`
  }
  if (scopeLevel === 'branch') {
    return `Viewing: ${unitId || 'Assigned'} branch`
  }
  if (scopeLevel === 'team') {
    return `Viewing: ${unitId || 'Assigned'} team`
  }
  return 'Viewing: My assigned applications'
}

function subtitleFromScope(reportingScope = {}) {
  const role = normalizeText(reportingScope.workspaceRole || '').replaceAll('_', ' ')
  const normalizedRole = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Bond user'
  return `${normalizedRole} scope`
}

export default function BondReportingScopeBanner({ reportingScope = null }) {
  const safeScope = reportingScope || {}
  return (
    <section className="rounded-[16px] border border-[#dce6f2] bg-[#f8fbff] px-4 py-3">
      <p className="text-sm font-semibold text-[#21384d]">{labelFromScope(safeScope)}</p>
      <p className="mt-1 text-xs text-[#60758b]">{subtitleFromScope(safeScope)}</p>
    </section>
  )
}
