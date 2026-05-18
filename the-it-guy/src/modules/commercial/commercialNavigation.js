import {
  BarChart3,
  Building2,
  ClipboardList,
  FileCheck2,
  Handshake,
  LayoutDashboard,
  Users,
  WalletCards,
} from 'lucide-react'

export const COMMERCIAL_NAV_ITEMS = [
  { label: 'Dashboard', to: '/commercial/dashboard', icon: LayoutDashboard },
  { label: 'Tenants', to: '/commercial/tenants', icon: Users },
  { label: 'Landlords', to: '/commercial/landlords', icon: WalletCards },
  { label: 'Properties', to: '/commercial/properties', icon: Building2 },
  { label: 'Requirements', to: '/commercial/requirements', icon: ClipboardList },
  { label: 'Deals', to: '/commercial/deals', icon: Handshake },
  { label: 'Leases', to: '/commercial/leases', icon: FileCheck2 },
  { label: 'Reports', to: '/commercial/reports', icon: BarChart3 },
]
