const WORKFLOW_DETAIL_BY_LANE = {
  transfer: 'transfer',
  bond: 'bond-registration',
  cancellation: 'bond-cancellation',
}

const WORKFLOW_LABEL_BY_LANE = {
  transfer: 'Transfer',
  bond: 'Bond Registration',
  cancellation: 'Bond Cancellation',
}

export function getAttorneyWorkflowDetailKeyForLane(laneKey = '') {
  return WORKFLOW_DETAIL_BY_LANE[String(laneKey || '').trim().toLowerCase()] || ''
}

export function buildAttorneyWorkflowPath(basePath = '', detailKey = '') {
  const normalizedBasePath = String(basePath || '').replace(/\/$/, '')
  const normalizedDetailKey = String(detailKey || '').trim().toLowerCase()
  return normalizedBasePath && normalizedDetailKey ? `${normalizedBasePath}/work/${normalizedDetailKey}` : normalizedBasePath
}

export function getAttorneyWorkflowNavigation(profile = null, { fallbackToTransfer = false } = {}) {
  if (profile?.isMultiRole || profile?.matterRole === 'multi_role') {
    return { mode: 'hub', label: 'My Workflows', defaultLaneKey: profile.defaultLaneKey || null, detailKey: '' }
  }

  if (profile?.matterRole === 'manager' && !profile?.assignedLaneKeys?.length) {
    return { mode: 'hub', label: 'All Workflows', defaultLaneKey: profile.defaultLaneKey || null, detailKey: '' }
  }

  const defaultLaneKey = profile?.defaultLaneKey || (fallbackToTransfer ? 'transfer' : '')
  const detailKey = getAttorneyWorkflowDetailKeyForLane(defaultLaneKey)
  if (detailKey) {
    return {
      mode: 'direct',
      label: WORKFLOW_LABEL_BY_LANE[defaultLaneKey] || 'Workflow',
      defaultLaneKey,
      detailKey,
    }
  }

  return { mode: 'hub', label: 'Workflows', defaultLaneKey: null, detailKey: '' }
}

export function getAttorneyMatterListWorkflowDetailKey(viewKey = '') {
  const normalized = String(viewKey || '').trim().toLowerCase()
  if (normalized === 'transfer') return 'transfer'
  if (normalized === 'bond') return 'bond-registration'
  if (normalized === 'cancellation') return 'bond-cancellation'
  return ''
}
