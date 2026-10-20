import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import Modal from '../ui/Modal.jsx'
import LeadCreateDialog from '../leads/LeadCreateDialog.jsx'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { canAccessPrincipalExperience } from '../../lib/organisationAccess'
import { BUSINESS_WORKSPACES } from '../../lib/businessWorkspaceAccess'
import { resolveRentalWorkspaceScope } from '../../services/rentals/rentalWorkspaceScope.js'
import { listOrganisationUsersForWorkspace } from '../../lib/settingsApi'
import { createAgencyCrmLeadActivity, createAgencyCrmLeadRecord } from '../../lib/agencyCrmRepository'
import { createRentalLead } from '../../services/rentals/rentalLeadService.js'
import RentalLeadDialog, { INITIAL_RENTAL_LEAD_FORM } from '../../pages/rentals/RentalLeadDialog.jsx'
import './mobile-lead-create.css'
const SellerLeadCreateDialog = lazy(() => import('../leads/SellerLeadCreateDialog.jsx'))
const TYPES = [ ['buyer', 'Buyer', 'Looking to buy a property'], ['seller', 'Seller', 'Wants to sell a property'], ['tenant', 'Tenant', 'Looking for a property to rent'], ['landlord', 'Landlord', 'Wants to let a property'] ]
const text = value => String(value || '').trim()

export default function MobileLeadCreateFlow(props) {
  const workspace = useWorkspace()
  const context = useOptionalOrganisation()
  const organisationId = text(context?.organisation?.id || workspace.currentWorkspace?.organisationId || workspace.currentWorkspace?.organisation_id || workspace.currentWorkspace?.id || workspace.workspace?.id)
  const identity = text(workspace.profile?.id || workspace.profile?.userId || workspace.user?.id)
  return <LeadCapture key={`${organisationId}:${identity}`} {...props} workspace={workspace} organisationId={organisationId} identity={identity} />
}

function LeadCapture({ workspace, organisationId, identity, initialType = '', onClose }) {
  const [type, setType] = useState(TYPES.some(item => item[0] === initialType) ? initialType : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [source, setSource] = useState('Other')
  const [form, setForm] = useState({ ...INITIAL_RENTAL_LEAD_FORM, role: initialType })
  const [listings, setListings] = useState({ rows: [], loading: initialType === 'buyer', error: '' })
  const [agents, setAgents] = useState([])
  const guard = useRef(false)
  const profile = workspace.profile || {}
  const scope = resolveRentalWorkspaceScope(workspace)
  const currentAgent = { ...profile, id: identity, userId: identity, fullName: profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(' '), name: profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(' '), branchId: scope.branchId }
  const principal = canAccessPrincipalExperience({ appRole: workspace.role, membershipRole: workspace.organisationMembershipRole || workspace.workspaceRole || workspace.currentMembership?.role })
  const lines = workspace.availableBusinessWorkspaceIds || []
  const rentalAccess = workspace.role === 'agent' && workspace.businessWorkspaceSplitEnabled && lines.includes(BUSINESS_WORKSPACES.rentals)
  const salesAccess = workspace.role === 'agent' && (!workspace.businessWorkspaceSplitEnabled || lines.includes(BUSINESS_WORKSPACES.sales))
  const permitted = candidate => ['tenant', 'landlord'].includes(candidate) ? rentalAccess : salesAccess
  const close = () => { if (!guard.current) onClose() }

  useEffect(() => {
    if (!type || !organisationId || !principal) return undefined
    let active = true
    listOrganisationUsersForWorkspace(organisationId).then(rows => {
      if (active) setAgents(rows.map(row => ({ ...row, id: row.userId || row.user_id || row.id, userId: row.userId || row.user_id || row.id, name: row.fullName || row.name || row.email })))
    }).catch(() => { if (active) setAgents([]) })
    return () => { active = false }
  }, [type, organisationId, principal])

  useEffect(() => {
    if (type !== 'buyer' || !organisationId || !salesAccess) return undefined
    let active = true
    import('../../services/privateListingService.js').then(({ getOrganisationPrivateListings }) => getOrganisationPrivateListings(organisationId, { includeRequirementsAndDocuments: false })).then(rows => {
      if (active) setListings({ rows: rows.filter(row => row.id && !/archived|withdrawn|lost|sold|registered|closed/i.test(row.listingStatus || row.lifecycleStatus || row.status || '')).map(row => ({ id: row.id, label: [row.listingTitle || row.title || row.propertyAddress || 'Untitled listing', row.suburb || row.city, row.listingReference].filter(Boolean).join(' · ') })), loading: false, error: '' })
    }).catch(() => { if (active) setListings({ rows: [], loading: false, error: 'Listings could not be loaded. Close and reopen to retry.' }) })
    return () => { active = false }
  }, [type, organisationId, salesAccess])

  async function saveBuyer(values) {
    if (guard.current) return
    if (!organisationId || !identity || !permitted('buyer')) { setError('Lead capture is unavailable in this workspace.'); return }
    const listing = listings.rows.find(row => row.id === values.listingId)
    if (values.listingId && !listing) { setError('Select a current listing from the list.'); return }
    const agent = principal ? agents.find(row => row.id === values.agentId) || currentAgent : currentAgent
    guard.current = true; setSaving(true); setError('')
    try {
      const created = await createAgencyCrmLeadRecord(organisationId, {
        contact: { firstName: values.firstName, lastName: values.lastName, phone: values.phone, email: values.email, notes: values.notes, contactType: 'buyer' },
        assignedAgent: agent, assignedUserId: agent.userId || agent.id, createdBy: identity, branchId: agent.branchId || scope.branchId,
        leadCategory: 'buyer', leadDirection: 'Inbound', leadSource: values.source, stage: 'New Lead', priority: 'Medium', propertyInterest: values.property || listing?.label || '', listingId: listing?.id || '', notes: values.notes,
      }, { actor: currentAgent })
      void createAgencyCrmLeadActivity(organisationId, created.leadId, { agent: currentAgent, activityType: 'Lead Created', activityNote: 'Manual lead captured', outcome: 'Created' }, { actor: currentAgent }).catch(() => null)
      onClose()
    } catch (cause) { setError(cause?.message || 'The lead could not be saved. Please try again.') }
    finally { guard.current = false; setSaving(false) }
  }
  async function saveRental(event) {
    event.preventDefault()
    if (guard.current) return
    if (!organisationId || !identity || !permitted(type)) { setError('Rental capture is unavailable in this workspace.'); return }
    guard.current = true; setSaving(true); setError('')
    try {
      await createRentalLead({ ...form, role: type }, { organisationId, branchId: scope.branchId, actor: currentAgent, assignedAgent: currentAgent })
      onClose()
    } catch (cause) { setError(cause?.message || 'The rental lead could not be saved. Please try again.') }
    finally { guard.current = false; setSaving(false) }
  }

  if (!type) return <Modal open onClose={close} title="Add lead" className="mobile-lead-create-dialog"><p className="mobile-lead-type-intro">What kind of lead are you adding?</p><div className="mobile-lead-type-options">{TYPES.map(([key, label, description]) => <button type="button" key={key} disabled={!permitted(key)} onClick={() => { setType(key); if (key === 'buyer') setListings({ rows: [], loading: true, error: '' }); setForm({ ...INITIAL_RENTAL_LEAD_FORM, role: key }) }}><span><strong>{label}</strong><small>{permitted(key) ? description : 'Not enabled in this workspace'}</small></span><ChevronRight size={17} aria-hidden="true" /></button>)}</div></Modal>
  if (!permitted(type) || !organisationId || !identity) return <Modal open onClose={close} title="Add lead" className="mobile-lead-create-dialog"><p role="alert">This lead type is not available in your current workspace.</p></Modal>
  if (type === 'buyer') return <LeadCreateDialog open category="buyer" title="New buyer lead" subtitle="" className="mobile-lead-create-dialog" agents={agents.length ? [currentAgent, ...agents.filter(agent => agent.id !== identity)] : [currentAgent]} currentAgent={currentAgent} showAgentAssignment={principal} listingOptions={listings.rows} listingOptionsLoading={listings.loading} listingOptionsError={listings.error} saving={saving} error={error} onClose={close} onSave={values => void saveBuyer(values)} />
  if (type === 'seller') return <Suspense fallback={<Modal open onClose={close} title="New seller lead" className="mobile-lead-create-dialog"><p role="status">Loading seller form…</p></Modal>}><SellerLeadCreateDialog className="mobile-lead-create-dialog" organisationId={organisationId} actor={currentAgent} assignedAgent={currentAgent} agents={agents.length ? agents : [currentAgent]} lockPrimaryAgent={!principal} source={source} onSourceChange={setSource} priority="Medium" onClose={close} onCreated={onClose} /></Suspense>
  return <RentalLeadDialog form={form} roleLocked title={`New ${type} lead`} className="mobile-lead-create-dialog" onChange={(key, value) => { setForm(previous => ({ ...previous, [key]: value })); setError('') }} onClose={close} onSubmit={event => void saveRental(event)} saving={saving} error={error} />
}
