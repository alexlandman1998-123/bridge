import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import AgentListings from '../AgentListings.jsx'
import { MobileLoadingState } from '../../components/mobile-shell/MobileShellStates.jsx'
export default function MobileListingEditorPage() {
  const workspace = useWorkspace()
  const organisation = useOptionalOrganisation()
  if (organisation?.loading) return <MobileLoadingState label="Loading listing form" />
  const key = `${workspace.profile?.id}:${organisation?.organisation?.id || workspace.workspace?.id}:${workspace.role}`
  return <AgentListings key={key} mobileEditor />
}
