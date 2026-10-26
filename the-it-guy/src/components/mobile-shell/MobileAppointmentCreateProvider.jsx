import { lazy, Suspense, useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { resolveMobileRoleCategory } from '../../config/mobileShell'
import { sastDateKey } from '../../core/appointments/attorneyCalendarModel.js'
import '../../pages/mobile/mobile-calendar.css'
import { MobileAppointmentCreateContext } from './mobileAppointmentCreateContext.js'
const MobileAppointmentWorkspace = lazy(() => import('../appointments/MobileAppointmentWorkspace.jsx'))

export default function MobileAppointmentCreateProvider({ children }) {
  const workspace = useWorkspace()
  const context = useOptionalOrganisation()
  const organisationId = context?.organisation?.id || context?.organisation?.organisationId || context?.organisation?.organisation_id || workspace.currentWorkspace?.organisationId || workspace.currentWorkspace?.organisation_id || workspace.currentWorkspace?.id || workspace.workspace?.id
  const profile = workspace.profile || {}
  const actor = { ...profile, id: profile.id || profile.userId, name: profile.fullName || profile.full_name || profile.email, canManageCalendar: resolveMobileRoleCategory(workspace) === 'principal' }
  const scope = `${organisationId || ''}:${actor.id || ''}`
  const [openScope, setOpenScope] = useState(null)
  const enabled = organisationId && actor.id && !context?.loading
  return <MobileAppointmentCreateContext.Provider value={{ openAppointmentCreate: enabled ? () => setOpenScope(scope) : null }}>
    {children}
    {enabled && openScope === scope && <Suspense fallback={null}><MobileAppointmentWorkspace key={scope} organisationId={organisationId} actor={actor} selectedDate={sastDateKey(new Date())} onClose={() => setOpenScope(null)} onSaved={() => setOpenScope(null)} /></Suspense>}
  </MobileAppointmentCreateContext.Provider>
}
