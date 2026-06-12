import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  FileCheck2,
  FileSignature,
  Gauge,
  Handshake,
  LayoutDashboard,
  MapPin,
  Network,
  Settings,
  Store,
  TrendingUp,
  Users,
  UserRoundCheck,
  WalletCards,
} from 'lucide-react'

export const COMMERCIAL_DASHBOARD_NAV_ITEM = {
  label: 'Dashboard',
  to: '/commercial/dashboard',
  exact: true,
  icon: LayoutDashboard,
}

export const COMMERCIAL_NAV_GROUPS = [
  {
    id: 'crm',
    label: 'CRM',
    icon: BriefcaseBusiness,
    items: [
      { label: 'Companies', to: '/commercial/companies', icon: Building2 },
      { label: 'Contacts', to: '/commercial/contacts', icon: Users },
    ],
  },
  {
    id: 'demand',
    label: 'Demand',
    icon: Users,
    items: [
      { label: 'Clients', to: '/commercial/clients', icon: Users },
      { label: 'Tenants', to: '/commercial/tenants', icon: UserRoundCheck },
      { label: 'Requirements', to: '/commercial/requirements', icon: ClipboardList },
      { label: 'Pipeline', to: '/commercial/pipeline', icon: Gauge, activePaths: ['/commercial/pipeline', '/commercial/requirements/pipeline'] },
    ],
  },
  {
    id: 'supply',
    label: 'Supply',
    icon: Building2,
    items: [
      { label: 'Landlords', to: '/commercial/landlords', icon: WalletCards },
      { label: 'Properties', to: '/commercial/properties', icon: Building2 },
      { label: 'Vacancies', to: '/commercial/vacancies', icon: Store },
      { label: 'Listings', to: '/commercial/listings', icon: ClipboardList },
    ],
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: Handshake,
    items: [
      { label: 'Deals', to: '/commercial/deals', icon: Handshake },
      { label: 'Transactions', to: '/commercial/dashboard#transactions', icon: BriefcaseBusiness, exact: true },
      { label: 'HOT', to: '/commercial/hot', icon: FileSignature, activePaths: ['/commercial/hot', '/commercial/heads-of-terms'] },
      { label: 'Leases', to: '/commercial/leases', icon: FileCheck2 },
    ],
  },
  {
    id: 'brokers',
    label: 'Brokers',
    icon: UserRoundCheck,
    items: [
      { label: 'Principal View', to: '/commercial/principal', icon: TrendingUp },
      { label: 'Overview', to: '/commercial/brokers/overview', icon: Gauge },
      { label: 'Brokers', to: '/commercial/brokers', icon: Users },
      { label: 'Teams', to: '/commercial/brokers/teams', icon: Network },
      { label: 'Branches', to: '/commercial/brokers/branches', icon: MapPin },
      { label: 'Performance', to: '/commercial/brokers/performance', icon: BarChart3 },
      { label: 'Assignments', to: '/commercial/brokers/assignments', icon: UserRoundCheck },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    items: [
      { label: 'Documents', to: '/commercial/docs', icon: FileCheck2, activePaths: ['/commercial/docs', '/commercial/documents'] },
      { label: 'Market Intelligence', to: '/commercial/market-intelligence', icon: TrendingUp },
      { label: 'Reports', to: '/commercial/reports', icon: BarChart3 },
      { label: 'Activity', to: '/commercial/activity', icon: Activity },
    ],
  },
]

export const COMMERCIAL_BOTTOM_NAV_ITEMS = [
  { label: 'Settings', to: '/commercial/settings', icon: Settings },
]

export const COMMERCIAL_NAV_ITEMS = [
  COMMERCIAL_DASHBOARD_NAV_ITEM,
  ...COMMERCIAL_NAV_GROUPS.flatMap((group) => group.items),
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
    if (item.exact || targetPath === '/commercial/dashboard') {
      if (currentFullPath.includes('#')) return currentFullPath === targetPath
      return currentPath === targetPath
    }
    return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`)
  })
}
