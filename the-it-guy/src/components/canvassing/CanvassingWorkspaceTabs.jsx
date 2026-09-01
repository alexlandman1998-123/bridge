import { FileBarChart2, LocateFixed, UsersRound } from 'lucide-react'
import ModuleSegmentedNav from '../ui/ModuleSegmentedNav'

const CANVASSING_WORKSPACE_TABS = [
  { id: 'prospects', label: 'Prospects', icon: UsersRound, to: '/pipeline/canvassing', end: true },
  { id: 'property-search', label: 'Property Search', icon: LocateFixed, to: '/pipeline/canvassing/property-search' },
  { id: 'property-reports', label: 'Reports', icon: FileBarChart2, to: '/pipeline/canvassing/property-reports' },
]

export default function CanvassingWorkspaceTabs() {
  return <ModuleSegmentedNav items={CANVASSING_WORKSPACE_TABS} ariaLabel="Canvassing tools" />
}
