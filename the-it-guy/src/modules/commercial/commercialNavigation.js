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
  UsersRound,
  Workflow,
  KeyRound,
} from 'lucide-react'
import { canManageCommercialBrokerage } from './utils/resolveCommercialRole.js'

export const COMMERCIAL_DASHBOARD_NAV_ITEM = {
  label: 'Overview',
  to: '/commercial',
  exact: true,
  icon: LayoutDashboard,
  activePaths: ['/commercial', '/commercial/dashboard'],
}

export const COMMERCIAL_COMMAND_CENTRE_NAV_ITEM = {
  label: 'Command Centre',
  to: '/commercial/command-centre',
  exact: true,
  icon: BarChart3,
  activePaths: ['/commercial/command-centre'],
}

export const COMMERCIAL_NAV_SECTIONS = [
  // Transactions visibility is covered by leasing and sales Deals routes plus transaction workspace deep links.
  {
    id: 'pipeline',
    label: 'Pipeline',
    icon: Workflow,
    items: [
      { label: 'Overview', to: '/commercial/pipeline', icon: LayoutDashboard, activePaths: ['/commercial/pipeline', '/commercial/leads', '/commercial/canvassing', '/commercial/requirements'] },
      { label: 'Calendar', to: '/commercial/calendar', icon: CalendarDays, activePaths: ['/commercial/calendar'] },
    ],
  },
  {
    id: 'leasing',
    label: 'Leasing',
    icon: KeyRound,
    items: [
      { label: 'Prospects', to: '/commercial/leasing/canvassing', icon: Radar, activePaths: ['/commercial/leasing/canvassing', '/commercial/canvassing'] },
      { label: 'Leads', to: '/commercial/leasing/leads', icon: ClipboardList, activePaths: ['/commercial/leasing/leads', '/commercial/leads', '/commercial/requirements'] },
      { label: 'Vacancies', to: '/commercial/leasing/vacancies', icon: Building2, activePaths: ['/commercial/leasing/vacancies', '/commercial/vacancies'] },
      { label: 'Deals', to: '/commercial/leasing/deals', icon: FileText, activePaths: ['/commercial/leasing/deals', '/commercial/deals/leasing', '/commercial/heads-of-terms', '/commercial/hot', '/commercial/leases'] },
      { label: 'Tenants', to: '/commercial/leasing/tenants', icon: UsersRound, activePaths: ['/commercial/leasing/tenants', '/commercial/tenants'] },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    icon: TrendingUp,
    items: [
      { label: 'Canvassing', to: '/commercial/sales/canvassing', icon: Radar, activePaths: ['/commercial/sales/canvassing', '/commercial/canvassing'] },
      { label: 'Leads', to: '/commercial/sales/leads', icon: ClipboardList, activePaths: ['/commercial/sales/leads', '/commercial/leads', '/commercial/requirements'] },
      { label: 'Listings', to: '/commercial/sales/listings', icon: BadgeDollarSign, activePaths: ['/commercial/sales/listings', '/commercial/listings', '/commercial/sales-listings'] },
      { label: 'Deals', to: '/commercial/sales/deals', icon: FileText, activePaths: ['/commercial/sales/deals', '/commercial/deals/sales', '/commercial/transactions'] },
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
    id: 'agency',
    label: 'Agency',
    icon: Building2,
    items: [
      { label: 'Branches', to: '/commercial/agency/branches', icon: Building2, activePaths: ['/commercial/agency', '/commercial/agency/branches', '/commercial/brokers/branches', '/commercial/performance/branches'] },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: BarChart3,
    items: [
      { label: 'Reports', to: '/commercial/reports', icon: BarChart3, activePaths: ['/commercial/reports', '/commercial/docs', '/commercial/documents', '/commercial/activity', '/commercial/market-intelligence', '/commercial/broker-performance'] },
    ],
  },
]

export const COMMERCIAL_BOTTOM_NAV_ITEMS = [
  { label: 'Brokers', to: '/commercial/brokers', icon: UserRoundCheck, activePaths: ['/commercial/brokers', '/commercial/brokers/overview', '/commercial/brokers/assignments', '/commercial/brokers/teams', '/commercial/performance/brokers', '/commercial/agency/brokers'] },
  { label: 'Tools', to: '/commercial/settings', icon: Settings2 },
]

export const COMMERCIAL_NAV_ITEMS = [
  COMMERCIAL_DASHBOARD_NAV_ITEM,
  COMMERCIAL_COMMAND_CENTRE_NAV_ITEM,
  ...COMMERCIAL_NAV_SECTIONS.flatMap((section) => section.items),
  ...COMMERCIAL_BOTTOM_NAV_ITEMS,
]

export const COMMERCIAL_MOBILE_PRIMARY_NAV_ITEMS = [
  COMMERCIAL_DASHBOARD_NAV_ITEM,
  COMMERCIAL_NAV_SECTIONS[0].items[0],
  COMMERCIAL_NAV_SECTIONS[1].items[1],
  COMMERCIAL_NAV_SECTIONS[2].items[1],
]

export const COMMERCIAL_MOBILE_MORE_NAV_ITEMS = [
  COMMERCIAL_COMMAND_CENTRE_NAV_ITEM,
  COMMERCIAL_NAV_SECTIONS[1].items[0],
  COMMERCIAL_NAV_SECTIONS[1].items[2],
  COMMERCIAL_NAV_SECTIONS[1].items[3],
  COMMERCIAL_NAV_SECTIONS[1].items[4],
  COMMERCIAL_NAV_SECTIONS[2].items[0],
  COMMERCIAL_NAV_SECTIONS[2].items[2],
  COMMERCIAL_NAV_SECTIONS[2].items[3],
  ...COMMERCIAL_NAV_SECTIONS.slice(3).flatMap((section) => section.items.slice()),
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
  if ((item.to === '/commercial/canvassing' || item.to === '/commercial/leasing/canvassing' || item.to === '/commercial/sales/canvassing') && scope?.commercialCanvassingEnabled === false) {
    return false
  }
  const path = String(item.to || '')
  const canManageBrokerage = typeof scope?.canManageBrokerage === 'boolean'
    ? scope.canManageBrokerage
    : scope
      ? canManageCommercialBrokerage(scope)
      : true
  if ((path.startsWith('/commercial/agency') || path.startsWith('/commercial/brokers') || path === '/commercial/reports') && canManageBrokerage === false) {
    return false
  }
  return true
}
