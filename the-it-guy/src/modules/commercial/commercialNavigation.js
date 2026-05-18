import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ClipboardList,
  Eye,
  FileArchive,
  FileCheck2,
  FileSignature,
  Gauge,
  Handshake,
  LayoutDashboard,
  LineChart,
  Settings,
  Store,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react'

export const COMMERCIAL_DASHBOARD_NAV_ITEM = {
  label: 'Dashboard',
  to: '/commercial/dashboard',
  icon: LayoutDashboard,
}

export const COMMERCIAL_NAV_GROUPS = [
  {
    id: 'demand',
    label: 'Demand',
    icon: Users,
    items: [
      { label: 'Requirements', to: '/commercial/requirements', icon: ClipboardList },
      { label: 'Clients', to: '/commercial/clients', icon: Users },
      { label: 'Expiring Occupiers', to: '/commercial/expiring-occupiers', icon: CalendarClock },
    ],
  },
  {
    id: 'supply',
    label: 'Supply',
    icon: Building2,
    items: [
      { label: 'Vacancies', to: '/commercial/vacancies', icon: Store },
      { label: 'Properties', to: '/commercial/properties', icon: Building2 },
      { label: 'Landlords', to: '/commercial/landlords', icon: WalletCards },
    ],
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: Handshake,
    items: [
      { label: 'Leasing Deals', to: '/commercial/deals/leasing', icon: Handshake },
      { label: 'Sales Deals', to: '/commercial/deals/sales', icon: TrendingUp },
      { label: 'Leases', to: '/commercial/leases', icon: FileCheck2 },
      { label: 'Viewings', to: '/commercial/viewings', icon: Eye },
      { label: 'Heads of Terms', to: '/commercial/heads-of-terms', icon: FileSignature },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    icon: BarChart3,
    items: [
      { label: 'Reports', to: '/commercial/reports', icon: BarChart3 },
      { label: 'Lease Expiry Watch', to: '/commercial/lease-expiry-watch', icon: Gauge },
      { label: 'Market Intelligence', to: '/commercial/market-intelligence', icon: LineChart },
      { label: 'Broker Performance', to: '/commercial/broker-performance', icon: BriefcaseBusiness },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: Settings,
    items: [
      { label: 'Documents', to: '/commercial/documents', icon: FileArchive },
      { label: 'Activity', to: '/commercial/activity', icon: Activity },
      { label: 'Settings', to: '/commercial/settings', icon: Settings },
    ],
  },
]

export const COMMERCIAL_NAV_ITEMS = [
  COMMERCIAL_DASHBOARD_NAV_ITEM,
  ...COMMERCIAL_NAV_GROUPS.flatMap((group) => group.items),
]
