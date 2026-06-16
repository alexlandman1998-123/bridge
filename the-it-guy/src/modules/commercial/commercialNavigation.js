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
  Settings2,
  TrendingUp,
  UserRoundCheck,
  Workflow,
  KeyRound,
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
    icon: Workflow,
    items: [
      { label: 'Leads', to: '/commercial/leads', icon: ClipboardList, activePaths: ['/commercial/leads', '/commercial/requirements'] },
      { label: 'Canvassing', to: '/commercial/canvassing', icon: Radar },
      { label: 'Calendar', to: '/commercial/calendar', icon: CalendarDays },
    ],
  },
  {
    id: 'leasing',
    label: 'Leasing',
    icon: KeyRound,
    items: [
      { label: 'Vacancies', to: '/commercial/vacancies', icon: Building2 },
      { label: 'Leasing Deals', to: '/commercial/leasing', icon: FileText, activePaths: ['/commercial/leasing', '/commercial/deals/leasing', '/commercial/heads-of-terms', '/commercial/hot', '/commercial/leases'] },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    icon: TrendingUp,
    items: [
      { label: 'Listings', to: '/commercial/listings', icon: BadgeDollarSign, activePaths: ['/commercial/listings', '/commercial/sales-listings'] },
      { label: 'Sales Deals', to: '/commercial/sales', icon: FileText, activePaths: ['/commercial/sales', '/commercial/deals/sales', '/commercial/transactions'] },
    ],
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    icon: BriefcaseBusiness,
    items: [
      { label: 'Properties', to: '/commercial/properties', icon: Building2 },
      { label: 'Landlords', to: '/commercial/landlords', icon: BriefcaseBusiness },
    ],
  },
  {
    id: 'performance',
    label: 'Performance',
    icon: BarChart3,
    items: [
      { label: 'Brokers', to: '/commercial/brokers', icon: UserRoundCheck, activePaths: ['/commercial/brokers', '/commercial/brokers/overview', '/commercial/brokers/assignments', '/commercial/brokers/teams', '/commercial/brokers/branches', '/commercial/brokers/performance', '/commercial/performance'] },
      { label: 'Reports', to: '/commercial/reports', icon: BarChart3, activePaths: ['/commercial/reports', '/commercial/docs', '/commercial/documents', '/commercial/activity', '/commercial/market-intelligence', '/commercial/broker-performance'] },
    ],
  },
]

export const COMMERCIAL_BOTTOM_NAV_ITEMS = [
  { label: 'Settings', to: '/commercial/settings', icon: Settings2 },
]

export const COMMERCIAL_NAV_ITEMS = [
  COMMERCIAL_DASHBOARD_NAV_ITEM,
  ...COMMERCIAL_NAV_SECTIONS.flatMap((section) => section.items),
  ...COMMERCIAL_BOTTOM_NAV_ITEMS,
]

export const COMMERCIAL_MOBILE_PRIMARY_NAV_ITEMS = [
  COMMERCIAL_DASHBOARD_NAV_ITEM,
  COMMERCIAL_NAV_SECTIONS[0].items[0],
  COMMERCIAL_NAV_SECTIONS[0].items[1],
  COMMERCIAL_NAV_SECTIONS[1].items[0],
]

export const COMMERCIAL_MOBILE_MORE_NAV_ITEMS = [
  COMMERCIAL_NAV_SECTIONS[0].items[2],
  ...COMMERCIAL_NAV_SECTIONS.slice(1).flatMap((section) => section.items.slice()),
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
