import {
  Building2,
  ClipboardList,
  FileBarChart2,
  FileSignature,
  LayoutDashboard,
  Settings,
  Store,
  TrendingUp,
} from 'lucide-react'

export const COMMERCIAL_DASHBOARD_NAV_ITEM = {
  label: 'Overview',
  to: '/commercial/dashboard',
  exact: true,
  icon: LayoutDashboard,
  activePaths: ['/commercial', '/commercial/dashboard'],
}

export const COMMERCIAL_NAV_SECTIONS = [
  {
    id: 'primary',
    items: [
      { label: 'Leads', to: '/commercial/leads', icon: ClipboardList, activePaths: ['/commercial/leads', '/commercial/requirements', '/commercial/pipeline', '/commercial/requirements/pipeline'] },
      { label: 'Deals', to: '/commercial/deals', icon: TrendingUp, activePaths: ['/commercial/deals', '/commercial/deals/pipeline', '/commercial/deals/overview', '/commercial/transactions'] },
      { label: 'Properties', to: '/commercial/properties', icon: Building2 },
      { label: 'Vacancies', to: '/commercial/vacancies', icon: Store },
      { label: 'Leasing', to: '/commercial/leasing', icon: FileSignature, activePaths: ['/commercial/leasing', '/commercial/deals/leasing', '/commercial/heads-of-terms', '/commercial/hot', '/commercial/leases'] },
      { label: 'Sales', to: '/commercial/sales', icon: TrendingUp, activePaths: ['/commercial/sales', '/commercial/deals/sales', '/commercial/transactions'] },
      { label: 'Reports', to: '/commercial/reports', icon: FileBarChart2, activePaths: ['/commercial/reports', '/commercial/docs', '/commercial/documents', '/commercial/activity', '/commercial/market-intelligence', '/commercial/broker-performance'] },
    ],
  },
]

export const COMMERCIAL_BOTTOM_NAV_ITEMS = [
  { label: 'Settings', to: '/commercial/settings', icon: Settings },
]

export const COMMERCIAL_NAV_ITEMS = [
  COMMERCIAL_DASHBOARD_NAV_ITEM,
  ...COMMERCIAL_NAV_SECTIONS.flatMap((section) => section.items),
  ...COMMERCIAL_BOTTOM_NAV_ITEMS,
]

export const COMMERCIAL_MOBILE_PRIMARY_NAV_ITEMS = [
  COMMERCIAL_DASHBOARD_NAV_ITEM,
  ...COMMERCIAL_NAV_SECTIONS[0].items,
]

export const COMMERCIAL_MOBILE_MORE_NAV_ITEMS = [
  ...COMMERCIAL_NAV_SECTIONS.slice(1).flatMap((section) => section.items),
  ...COMMERCIAL_BOTTOM_NAV_ITEMS,
]

function pathWithoutHash(path = '') {
  return String(path).split('#')[0]
}

export function isCommercialNavItemActive(pathname, item = {}) {
  const currentFullPath = String(pathname || '')
  const currentPath = pathWithoutHash(currentFullPath)
  const activePaths = item.activePaths?.length ? item.activePaths : [item.to]
  return activePaths.some((path) => {
    if (String(path).includes('#')) return currentFullPath === path
    const targetPath = pathWithoutHash(path)
    if (!targetPath) return false
    if (item.exact || targetPath === '/commercial/dashboard' || targetPath === '/commercial') {
      if (currentFullPath.includes('#')) return currentFullPath === targetPath
      return currentPath === targetPath
    }
    return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`)
  })
}
