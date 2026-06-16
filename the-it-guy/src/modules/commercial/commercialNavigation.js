import {
  BadgeDollarSign,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Radar,
  Settings,
  TrendingUp,
  UserRoundCheck,
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
    id: 'pipeline',
    label: 'Pipeline',
    items: [
      { label: 'Leads', to: '/commercial/leads', icon: ClipboardList, activePaths: ['/commercial/leads', '/commercial/requirements'] },
      { label: 'Canvassing', to: '/commercial/canvassing', icon: Radar },
      { label: 'Calendar', to: '/commercial/calendar', icon: CalendarDays },
    ],
  },
  {
    id: 'listings',
    label: 'Listings',
    items: [
      { label: 'Vacancies', to: '/commercial/vacancies', icon: Building2 },
      { label: 'Sales Listings', to: '/commercial/sales-listings', icon: BadgeDollarSign },
    ],
  },
  {
    id: 'deals',
    label: 'Deals',
    items: [
      { label: 'Leasing Deals', to: '/commercial/leasing', icon: FileText, activePaths: ['/commercial/leasing', '/commercial/deals/leasing', '/commercial/heads-of-terms', '/commercial/hot', '/commercial/leases'] },
      { label: 'Sales Deals', to: '/commercial/sales', icon: TrendingUp, activePaths: ['/commercial/sales', '/commercial/deals/sales', '/commercial/transactions'] },
    ],
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    items: [
      { label: 'Properties', to: '/commercial/properties', icon: Building2 },
      { label: 'Landlords', to: '/commercial/landlords', icon: BriefcaseBusiness },
    ],
  },
  {
    id: 'performance',
    label: 'Performance',
    items: [
      { label: 'Brokers', to: '/commercial/brokers', icon: UserRoundCheck, activePaths: ['/commercial/brokers', '/commercial/brokers/overview', '/commercial/brokers/assignments', '/commercial/brokers/teams', '/commercial/brokers/branches', '/commercial/brokers/performance', '/commercial/performance'] },
      { label: 'Reports', to: '/commercial/reports', icon: BarChart3, activePaths: ['/commercial/reports', '/commercial/docs', '/commercial/documents', '/commercial/activity', '/commercial/market-intelligence', '/commercial/broker-performance'] },
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
  ...COMMERCIAL_NAV_SECTIONS.flatMap((section) => section.items).slice(0, 4),
]

export const COMMERCIAL_MOBILE_MORE_NAV_ITEMS = [
  ...COMMERCIAL_NAV_SECTIONS.flatMap((section) => section.items).slice(4),
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

export function isCommercialNavItemAvailable(item = {}, scope = null) {
  if (item.to === '/commercial/canvassing' && scope?.commercialCanvassingEnabled === false) {
    return false
  }
  return true
}
