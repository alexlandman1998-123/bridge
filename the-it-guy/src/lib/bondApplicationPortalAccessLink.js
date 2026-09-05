const BOND_APPLICATION_PORTAL_PREFIX = '/bond-application'

function text(value = '') {
  return String(value || '').trim()
}

export function buildBondApplicationPortalAccessPath(accessToken = '') {
  const token = text(accessToken)
  return token ? `${BOND_APPLICATION_PORTAL_PREFIX}/${encodeURIComponent(token)}` : ''
}
