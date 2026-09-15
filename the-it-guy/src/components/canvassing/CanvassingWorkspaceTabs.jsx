import { Activity, CreditCard, FileBarChart2, LocateFixed, ShieldCheck, UsersRound } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { isOrganisationAdminMembershipRole } from '../../lib/organisationAccess'
import ModuleSegmentedNav from '../ui/ModuleSegmentedNav'

const CANVASSING_WORKSPACE_TABS = [
  { id: 'prospects', label: 'Prospects', icon: UsersRound, to: '/pipeline/canvassing', end: true },
  { id: 'property-search', label: 'Property Search', icon: LocateFixed, to: '/pipeline/canvassing/property-search' },
  { id: 'property-reports', label: 'Reports', icon: FileBarChart2, to: '/pipeline/canvassing/property-reports' },
  { id: 'fica-kyc', label: 'FICA / KYC', icon: ShieldCheck, to: '/pipeline/canvassing/fica-kyc' },
  { id: 'sensitive-lookups', label: 'Lookup approvals', icon: CreditCard, to: '/pipeline/canvassing/lookup-approvals' },
  { id: 'operations', label: 'Operations', icon: Activity, to: '/pipeline/canvassing/operations' },
]

export default function CanvassingWorkspaceTabs() {
  const { currentMembership } = useWorkspace()
  const membershipRole = currentMembership?.workspaceRole || currentMembership?.workspace_role || currentMembership?.organisationRole || currentMembership?.organisation_role || currentMembership?.role || ''
  const items = isOrganisationAdminMembershipRole(membershipRole)
    ? CANVASSING_WORKSPACE_TABS
    : CANVASSING_WORKSPACE_TABS.filter((item) => item.id !== 'operations')
  return <ModuleSegmentedNav items={items} ariaLabel="Canvassing tools" singleRow />
}
