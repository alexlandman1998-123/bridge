import { lazy, Suspense } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import Modal from '../ui/Modal.jsx'
import './mobile-lead-create.css'

const AddClientModal = lazy(() => import('../../pages/Clients.jsx').then(module => ({ default: module.AddClientModal })))

export default function MobileContactCreateSheet({ onClose }) {
  const workspace = useWorkspace()
  const context = useOptionalOrganisation()
  const organisationId = context?.organisation?.id || context?.organisation?.organisationId || context?.organisation?.organisation_id || workspace.currentWorkspace?.organisationId || workspace.currentWorkspace?.organisation_id || workspace.currentWorkspace?.id || workspace.workspace?.id
  const identity = workspace.profile?.id || workspace.profile?.userId || workspace.user?.id
  const pending = <Modal open title="New contact" className="mobile-lead-create-dialog" onClose={onClose}><p role="status">{context?.loading || (organisationId && identity) ? 'Loading contact form…' : 'Select a workspace to add a contact.'}</p></Modal>
  if (context?.loading || !organisationId || !identity) return pending
  return <Suspense fallback={pending}><AddClientModal key={`${organisationId}:${identity}`} open title="New contact" subtitle="" className="mobile-lead-create-dialog" mode="agent" organisationId={organisationId} onClose={onClose} /></Suspense>
}
