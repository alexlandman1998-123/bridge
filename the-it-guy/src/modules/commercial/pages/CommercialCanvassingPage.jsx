import {
  Archive,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Save,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { formatCurrency, formatDate, titleize } from '../commercialFormatters'
import { toLookupOptions } from '../commercialPipelineHelpers'
import Button from '../../../components/ui/Button'
import Field from '../../../components/ui/Field'
import Modal from '../../../components/ui/Modal'
import {
  createCommercialCompany,
  createCommercialContact,
  createCommercialDeal,
  createCommercialRequirement,
  getCommercialLookupData,
} from '../services/commercialApi'
import { getCommercialCanvassingContext, listCommercialCanvassingWorkspace, createCommercialCanvassingActivity, createCommercialCanvassingProspect, deleteCommercialCanvassingProspect, updateCommercialCanvassingProspect } from '../services/commercialCanvassingApi'
import { getCommercialPipelineData } from '../services/commercialPipelineApi'

const CARD_CLASS = 'rounded-[24px] border border-[#e6edf4] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)]'

const PROSPECT_TYPES = [
  'Landlord Prospect',
  'Tenant Prospect',
  'Investor Prospect',
  'Buyer Prospect',
  'Occupier Prospect',
  'Developer Prospect',
  'Other',
]

const CANVASSING_METHODS = [
  'Cold Call',
  'Door Knock',
  'Area Farming',
  'Expired Listing',
  'Lease Expiry Watch',
  'Database Reactivation',
  'WhatsApp Outreach',
  'Email Outreach',
  'Referral Follow-Up',
  'Valuation Campaign',
  'Other',
]

const PROSPECT_STATUSES = [
  'New',
  'Contacted',
  'Interested',
  'Follow-Up Later',
  'Qualified',
  'Converted to Requirement',
  'Converted to Deal',
  'Converted to Contact',
  'Lost',
  'Archived',
]

const FOLLOW_UP_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

const PROSPECT_PROPERTY_TYPES = [
  'Office',
  'Industrial',
  'Retail',
  'Mixed Use',
  'Development Land',
  'Agricultural',
  'Warehouse',
  'Commercial',
  'Other',
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function splitContactName(value = '') {
  const trimmed = normalizeText(value)
  if (!trimmed) return { firstName: '', lastName: '' }
  const [first, ...rest] = trimmed.split(/\s+/)
  return { firstName: first || '', lastName: rest.join(' ') || '' }
}

function formatRelativeDate(value) {
  if (!value) return 'No follow-up set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'No follow-up set'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(parsed)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays > 0 && diffDays < 7) return `In ${diffDays} days`
  if (diffDays < 0 && diffDays > -7) return `${Math.abs(diffDays)} days ago`
  return formatDate(value)
}

function toneForStatus(status = '') {
  const normalized = normalizeKey(status)
  if (normalized.includes('converted')) return 'emerald'
  if (normalized.includes('qualified') || normalized.includes('interested')) return 'violet'
  if (normalized.includes('follow')) return 'amber'
  if (normalized.includes('lost')) return 'rose'
  if (normalized.includes('archived')) return 'slate'
  if (normalized.includes('contacted')) return 'blue'
  return 'blue'
}

function toneClass(tone = 'slate') {
  switch (tone) {
    case 'emerald':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'violet':
      return 'border-violet-200 bg-violet-50 text-violet-700'
    case 'amber':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'rose':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    case 'blue':
      return 'border-sky-200 bg-sky-50 text-sky-700'
    case 'slate':
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600'
  }
}

function ProspectTonePill({ value }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass(toneForStatus(value))}`}>
      {titleize(value)}
    </span>
  )
}

function pickLookupLabel(options = [], id = '', fallback = '-') {
  const match = options.find((option) => normalizeText(option.value) === normalizeText(id))
  return match?.label || fallback
}

function getProspectDisplayName(prospect = {}) {
  return normalizeText(prospect.companyName)
    || normalizeText(prospect.contactName)
    || [normalizeText(prospect.firstName), normalizeText(prospect.lastName)].filter(Boolean).join(' ')
    || normalizeText(prospect.area)
    || 'Commercial prospect'
}

function getProspectSource(prospect = {}) {
  return normalizeText(prospect.canvassingMethod) || 'Other'
}

function getProspectStatus(prospect = {}) {
  return normalizeText(prospect.status) || 'New'
}

function buildInitialDraft(defaultBrokerId = '', defaults = {}) {
  return {
    companyName: '',
    contactName: '',
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    prospectType: 'Landlord Prospect',
    canvassingMethod: 'Cold Call',
    propertyType: '',
    area: '',
    status: 'New',
    nextFollowUpDate: '',
    followUpPriority: 'Medium',
    followUpNote: '',
    estimatedValue: '',
    notes: '',
    assignedBrokerId: defaultBrokerId,
    companyId: '',
    contactId: '',
    propertyId: '',
    vacancyId: '',
    listingId: '',
    linkedEntityType: '',
    linkedEntityId: '',
    ...defaults,
  }
}

function buildDraftFromSearchParams(searchParams, defaultBrokerId = '') {
  const getParam = (key) => normalizeText(searchParams?.get(key))
  return buildInitialDraft(defaultBrokerId, {
    companyName: getParam('companyName'),
    contactName: getParam('contactName'),
    propertyType: getParam('propertyType'),
    area: getParam('area'),
    status: getParam('status') || 'New',
    nextFollowUpDate: getParam('nextFollowUpDate'),
    followUpPriority: getParam('followUpPriority') || 'Medium',
    followUpNote: getParam('followUpNote'),
    estimatedValue: getParam('estimatedValue'),
    notes: getParam('notes'),
    prospectType: getParam('prospectType') || 'Landlord Prospect',
    canvassingMethod: getParam('canvassingMethod') || 'Cold Call',
    companyId: getParam('companyId'),
    contactId: getParam('contactId'),
    propertyId: getParam('propertyId'),
    vacancyId: getParam('vacancyId'),
    listingId: getParam('listingId'),
    linkedEntityType: getParam('linkedEntityType'),
    linkedEntityId: getParam('linkedEntityId'),
  })
}

function hasCreatePrefill(searchParams) {
  return ['companyName', 'contactName', 'area', 'propertyId', 'vacancyId', 'listingId', 'linkedEntityType', 'linkedEntityId'].some((key) => Boolean(normalizeText(searchParams?.get(key))))
}

function getWorkspaceLink(entityType = '', entityId = '') {
  const id = normalizeText(entityId)
  const normalizedType = normalizeText(entityType)
  if (!id) return ''
  switch (normalizedType) {
    case 'commercial_company':
      return `/commercial/companies/${id}`
    case 'commercial_contact':
      return `/commercial/contacts/${id}`
    case 'commercial_property':
      return `/commercial/properties/${id}`
    case 'commercial_vacancy':
      return `/commercial/vacancies/${id}`
    case 'commercial_listing':
      return `/commercial/listings/${id}`
    case 'commercial_requirement':
      return '/commercial/requirements/pipeline'
    case 'commercial_deal':
      return '/commercial/deals/pipeline'
    default:
      return ''
  }
}

function buildInitialActivityDraft() {
  return { activityType: 'Call', activityNote: '', outcome: '' }
}

function isConvertedStatus(status = '') {
  return normalizeKey(status).startsWith('converted to ')
}

function isArchivedStatus(status = '') {
  return normalizeKey(status) === 'archived'
}

function isOpenProspect(prospect = {}) {
  const status = getProspectStatus(prospect)
  return !['lost', 'archived'].includes(normalizeKey(status)) && !isConvertedStatus(status)
}

function inferRequirementType(prospect = {}) {
  const type = normalizeKey(prospect.prospectType)
  if (type.includes('investor') || type.includes('buyer')) return 'purchase'
  if (type.includes('owner occupier') || type.includes('occupier')) return 'lease'
  if (type.includes('developer')) return 'investment'
  return 'lease'
}

function inferClientType(prospect = {}) {
  const type = normalizeKey(prospect.prospectType)
  if (type.includes('tenant') || type.includes('occupier')) return 'tenant'
  if (type.includes('investor')) return 'investor'
  if (type.includes('buyer')) return 'owner_occupier'
  if (type.includes('landlord')) return 'landlord'
  return 'tenant'
}

function inferDealType(prospect = {}) {
  const type = inferRequirementType(prospect)
  return type === 'purchase' || type === 'investment' ? 'sale' : 'lease'
}

function ProspectStat({ label, value, detail, icon: Icon }) {
  return (
    <article className={`${CARD_CLASS} flex min-h-[154px] flex-col justify-between p-6`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[14px] font-medium text-[#60758d]">{label}</p>
          <p className="mt-5 text-[38px] font-semibold leading-none tracking-[-0.04em] text-[#0f2748]">{value}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#eef5fb] text-[#2d6ecf]">
          <Icon size={20} />
        </span>
      </div>
      <p className="text-[13px] font-normal text-[#7b899a]">{detail}</p>
    </article>
  )
}

function SearchField({ value, onChange, placeholder = 'Search canvassing prospects...' }) {
  return (
    <label className="relative block">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7d8ea3]" />
      <Field
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-[14px] pl-9"
      />
    </label>
  )
}

function EmptyDetailState() {
  return (
    <CommercialEmptyState
      title="No prospect selected"
      description="Choose a canvassing record to review the follow-up trail, conversion actions, and linked commercial records."
    />
  )
}

function CommercialCanvassingPage() {
  const [searchParams] = useSearchParams()
  const [organisationId, setOrganisationId] = useState('')
  const [organisationName, setOrganisationName] = useState('')
  const [prospects, setProspects] = useState([])
  const [activities, setActivities] = useState([])
  const [lookups, setLookups] = useState({})
  const [pipeline, setPipeline] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [canvassingEnabled, setCanvassingEnabled] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [methodFilter, setMethodFilter] = useState('all')
  const [brokerFilter, setBrokerFilter] = useState('all')
  const [selectedProspectId, setSelectedProspectId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState(buildInitialDraft())
  const [activityDraft, setActivityDraft] = useState(buildInitialActivityDraft())
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const createPrefillAppliedRef = useRef('')
  const createPrefillKey = searchParams.toString()
  const hasCreatePrefillParams = hasCreatePrefill(searchParams)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const context = await getCommercialCanvassingContext()
      const nextOrganisationId = context.organisationId || ''
      const nextCanvassingEnabled = context.commercialCanvassingEnabled !== false
      setCanvassingEnabled(nextCanvassingEnabled)
      if (!nextCanvassingEnabled) {
        setOrganisationId(nextOrganisationId)
        setOrganisationName(context.organisation?.name || 'Commercial workspace')
        setProspects([])
        setActivities([])
        setLookups({})
        setPipeline(null)
        return
      }
      const [workspace, nextLookups, nextPipeline] = await Promise.all([
        nextOrganisationId ? listCommercialCanvassingWorkspace(nextOrganisationId) : Promise.resolve({ prospects: [], activities: [] }),
        nextOrganisationId ? getCommercialLookupData(nextOrganisationId) : Promise.resolve({}),
        nextOrganisationId ? getCommercialPipelineData(nextOrganisationId) : Promise.resolve(null),
      ])
      setOrganisationId(nextOrganisationId)
      setOrganisationName(context.organisation?.name || 'Commercial workspace')
      setProspects(Array.isArray(workspace?.prospects) ? workspace.prospects : [])
      setActivities(Array.isArray(workspace?.activities) ? workspace.activities : [])
      setLookups(nextLookups || {})
      setPipeline(nextPipeline || null)
    } catch (loadError) {
      setError(loadError?.message || 'Commercial canvassing could not be loaded.')
      setProspects([])
      setActivities([])
      setLookups({})
      setPipeline(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const lookupOptions = useMemo(() => toLookupOptions(lookups), [lookups])
  const brokerOptions = lookupOptions.brokers || []

  useEffect(() => {
    setCreateDraft((previous) => {
      if (previous.assignedBrokerId) return previous
      return { ...previous, assignedBrokerId: brokerOptions[0]?.value || '' }
    })
  }, [brokerOptions])

  useEffect(() => {
    if (!hasCreatePrefillParams || createPrefillAppliedRef.current === createPrefillKey) return
    const nextDraft = buildDraftFromSearchParams(searchParams, brokerOptions[0]?.value || '')
    setCreateDraft(nextDraft)
    setCreateOpen(true)
    createPrefillAppliedRef.current = createPrefillKey
  }, [brokerOptions, createPrefillKey, hasCreatePrefillParams, searchParams])

  useEffect(() => {
    if (selectedProspectId || !prospects.length) return
    setSelectedProspectId(prospects[0].id)
  }, [prospects, selectedProspectId])

  const selectedProspect = useMemo(
    () => prospects.find((prospect) => normalizeText(prospect.id) === normalizeText(selectedProspectId)) || null,
    [prospects, selectedProspectId],
  )

  const selectedActivities = useMemo(
    () => activities
      .filter((activityRow) => normalizeText(activityRow.prospectId) === normalizeText(selectedProspect?.id))
      .sort((left, right) => new Date(right.activityDate || right.createdAt || 0) - new Date(left.activityDate || left.createdAt || 0)),
    [activities, selectedProspect],
  )

  const filteredProspects = useMemo(() => {
    const searchValue = normalizeKey(search)
    return prospects.filter((prospect) => {
      const assignedBrokerId = normalizeText(prospect.assignedBrokerId)
      const assignedBrokerName = normalizeText(prospect.assignedBrokerName)
      const assignedBrokerEmail = normalizeText(prospect.assignedBrokerEmail)
      const matchesSearch = !searchValue || [
        prospect.companyName,
        prospect.contactName,
        prospect.firstName,
        prospect.lastName,
        prospect.phone,
        prospect.email,
        prospect.area,
        prospect.propertyType,
        prospect.canvassingMethod,
        prospect.status,
        prospect.notes,
      ].join(' ').toLowerCase().includes(searchValue)
      const matchesStatus = statusFilter === 'all' || normalizeKey(prospect.status) === normalizeKey(statusFilter)
      const matchesType = typeFilter === 'all' || normalizeKey(prospect.prospectType) === normalizeKey(typeFilter)
      const matchesMethod = methodFilter === 'all' || normalizeKey(prospect.canvassingMethod) === normalizeKey(methodFilter)
      const matchesBroker = brokerFilter === 'all'
        || normalizeText(brokerFilter) === assignedBrokerId
        || normalizeKey(brokerFilter) === normalizeKey(assignedBrokerEmail)
        || normalizeKey(brokerFilter) === normalizeKey(assignedBrokerName)
      return matchesSearch && matchesStatus && matchesType && matchesMethod && matchesBroker
    })
  }, [brokerFilter, methodFilter, prospects, search, statusFilter, typeFilter])

  const metrics = useMemo(() => {
    const openProspects = prospects.filter(isOpenProspect).length
    const followUpsDue = prospects.filter((prospect) => {
      const due = new Date(prospect.nextFollowUpDate || '')
      if (Number.isNaN(due.getTime())) return false
      due.setHours(0, 0, 0, 0)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return due.getTime() <= today.getTime() && isOpenProspect(prospect)
    }).length
    const converted = prospects.filter((prospect) => isConvertedStatus(prospect.status)).length
    const pipelineValue = Number(pipeline?.summary?.pipelineValue || 0) || prospects.reduce((sum, prospect) => sum + Number(prospect.estimatedValue || 0), 0)
    const activitiesCount = activities.length
    return {
      openProspects,
      followUpsDue,
      converted,
      pipelineValue,
      activitiesCount,
    }
  }, [activities.length, pipeline?.summary?.pipelineValue, prospects])

  function resetCreateDraft() {
    setCreateDraft(buildInitialDraft(brokerOptions[0]?.value || ''))
  }

  function openCreateModal() {
    resetCreateDraft()
    setCreateOpen(true)
  }

  function updateSelectedProspectField(field, value) {
    setProspects((current) => current.map((row) => (
      normalizeText(row.id) === normalizeText(selectedProspectId)
        ? { ...row, [field]: value }
        : row
    )))
  }

  function updateCreateDraftField(field, value) {
    setCreateDraft((current) => ({ ...current, [field]: value }))
  }

  async function handleCreateProspect(event) {
    event.preventDefault()
    if (!organisationId) return
    if (!normalizeText(createDraft.companyName) && !normalizeText(createDraft.contactName) && !normalizeText(createDraft.area)) {
      setError('Add a company, contact, or area before saving a canvassing prospect.')
      return
    }

    setBusyAction('create')
    setError('')
    try {
      const created = await createCommercialCanvassingProspect(organisationId, {
        ...createDraft,
        companyName: normalizeText(createDraft.companyName),
        contactName: normalizeText(createDraft.contactName),
        phone: normalizeText(createDraft.phone),
        email: normalizeText(createDraft.email),
        prospectType: normalizeText(createDraft.prospectType) || 'Other',
        canvassingMethod: normalizeText(createDraft.canvassingMethod) || 'Cold Call',
        propertyType: normalizeText(createDraft.propertyType),
        area: normalizeText(createDraft.area),
        status: normalizeText(createDraft.status) || 'New',
        nextFollowUpDate: normalizeText(createDraft.nextFollowUpDate),
        followUpPriority: normalizeText(createDraft.followUpPriority) || 'Medium',
        followUpNote: normalizeText(createDraft.followUpNote),
        estimatedValue: Number(createDraft.estimatedValue || 0) || 0,
        notes: normalizeText(createDraft.notes),
        assignedBrokerId: normalizeText(createDraft.assignedBrokerId),
        companyId: normalizeText(createDraft.companyId),
        contactId: normalizeText(createDraft.contactId),
        propertyId: normalizeText(createDraft.propertyId),
        vacancyId: normalizeText(createDraft.vacancyId),
        listingId: normalizeText(createDraft.listingId),
        linkedEntityType: normalizeText(createDraft.linkedEntityType),
        linkedEntityId: normalizeText(createDraft.linkedEntityId),
      })
      setProspects((current) => [created, ...current.filter((row) => normalizeText(row.id) !== normalizeText(created.id))])
      setSelectedProspectId(created.id)
      setCreateOpen(false)
      setMessage('Canvassing prospect created.')
      await loadData()
    } catch (createError) {
      setError(createError?.message || 'Commercial canvassing prospect could not be created.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleSaveProspect() {
    if (!organisationId || !selectedProspect) return
    setBusyAction('save')
    setError('')
    try {
      const updated = await updateCommercialCanvassingProspect(organisationId, selectedProspect.id, {
        ...selectedProspect,
        companyName: normalizeText(selectedProspect.companyName),
        contactName: normalizeText(selectedProspect.contactName),
        firstName: normalizeText(selectedProspect.firstName),
        lastName: normalizeText(selectedProspect.lastName),
        phone: normalizeText(selectedProspect.phone),
        email: normalizeText(selectedProspect.email),
        prospectType: normalizeText(selectedProspect.prospectType) || 'Other',
        canvassingMethod: normalizeText(selectedProspect.canvassingMethod) || 'Cold Call',
        propertyType: normalizeText(selectedProspect.propertyType),
        area: normalizeText(selectedProspect.area),
        status: normalizeText(selectedProspect.status) || 'New',
        nextFollowUpDate: normalizeText(selectedProspect.nextFollowUpDate),
        followUpPriority: normalizeText(selectedProspect.followUpPriority) || 'Medium',
        followUpNote: normalizeText(selectedProspect.followUpNote),
        estimatedValue: Number(selectedProspect.estimatedValue || 0) || 0,
        notes: normalizeText(selectedProspect.notes),
        assignedBrokerId: normalizeText(selectedProspect.assignedBrokerId),
        assignedBrokerName: normalizeText(selectedProspect.assignedBrokerName),
        assignedBrokerEmail: normalizeText(selectedProspect.assignedBrokerEmail),
        companyId: normalizeText(selectedProspect.companyId),
        contactId: normalizeText(selectedProspect.contactId),
        propertyId: normalizeText(selectedProspect.propertyId),
        vacancyId: normalizeText(selectedProspect.vacancyId),
        listingId: normalizeText(selectedProspect.listingId),
        linkedEntityType: normalizeText(selectedProspect.linkedEntityType),
        linkedEntityId: normalizeText(selectedProspect.linkedEntityId),
      })
      setProspects((current) => current.map((row) => normalizeText(row.id) === normalizeText(selectedProspect.id) ? (updated || selectedProspect) : row))
      setMessage('Prospect saved.')
      await loadData()
    } catch (saveError) {
      setError(saveError?.message || 'Commercial canvassing prospect could not be saved.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleLogActivity(type = 'Note') {
    if (!organisationId || !selectedProspect) return
    if (!normalizeText(activityDraft.activityNote) && type === 'Note') {
      setError('Add a note before logging this activity.')
      return
    }
    setBusyAction(`activity-${type}`)
    setError('')
    try {
      const created = await createCommercialCanvassingActivity(organisationId, {
        prospectId: selectedProspect.id,
        brokerId: selectedProspect.assignedBrokerId || createDraft.assignedBrokerId || brokerOptions[0]?.value || '',
        brokerName: selectedProspect.assignedBrokerName || pickLookupLabel(brokerOptions, selectedProspect.assignedBrokerId, '') || '',
        activityType: type,
        activityNote: normalizeText(activityDraft.activityNote) || `${type} logged from canvassing workspace`,
        outcome: normalizeText(activityDraft.outcome),
        activityDate: new Date().toISOString(),
      })
      setActivities((current) => [created, ...current])
      setActivityDraft(buildInitialActivityDraft())
      setMessage(`${type} logged.`)
      await loadData()
    } catch (activityError) {
      setError(activityError?.message || 'Activity could not be logged.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleConvert(type) {
    if (!organisationId || !selectedProspect) return
    setBusyAction(`convert-${type}`)
    setError('')
    try {
      const brokerId = normalizeText(selectedProspect.assignedBrokerId || createDraft.assignedBrokerId || brokerOptions[0]?.value || '')
      const companyId = normalizeText(selectedProspect.companyId)
      const contactId = normalizeText(selectedProspect.contactId)
      let resolvedCompanyId = companyId
      let resolvedContactId = contactId

      if (type === 'contact') {
        if (!resolvedCompanyId) {
          const company = await createCommercialCompany({
            organisation_id: organisationId,
            company_name: normalizeText(selectedProspect.companyName) || normalizeText(selectedProspect.contactName) || 'Canvassed company',
            broker_id: brokerId || selectedProspect.assignedBrokerId || brokerOptions[0]?.value || '',
            status: 'prospect',
            notes: normalizeText(selectedProspect.notes) || 'Created from canvassing prospect',
          })
          resolvedCompanyId = company.id
        }
        if (!resolvedCompanyId) {
          throw new Error('A company is required before creating a contact from this canvassing prospect.')
        }
        const contactName = splitContactName(selectedProspect.contactName || selectedProspect.companyName || 'Prospect Contact')
        const contact = await createCommercialContact({
          organisation_id: organisationId,
          company_id: resolvedCompanyId,
          broker_id: brokerId,
          first_name: contactName.firstName || normalizeText(selectedProspect.firstName) || 'Commercial',
          last_name: contactName.lastName || normalizeText(selectedProspect.lastName) || 'Prospect',
          email: normalizeText(selectedProspect.email) || null,
          phone: normalizeText(selectedProspect.phone) || null,
          status: 'active',
          notes: normalizeText(selectedProspect.notes) || 'Created from commercial canvassing',
        })
        resolvedContactId = contact.id
      }

      if (type === 'requirement') {
        const createdRequirement = await createCommercialRequirement({
          organisation_id: organisationId,
          company_id: resolvedCompanyId || null,
          contact_id: resolvedContactId || null,
          requirement_name: `${getProspectDisplayName(selectedProspect)} Requirement`,
          requirement_type: inferRequirementType(selectedProspect),
          client_type: inferClientType(selectedProspect),
          property_type: normalizeText(selectedProspect.propertyType) || null,
          preferred_locations: normalizeText(selectedProspect.area) ? [normalizeText(selectedProspect.area)] : [],
          budget_min: 0,
          budget_max: Number(selectedProspect.estimatedValue || 0) || null,
          target_occupation_date: normalizeText(selectedProspect.nextFollowUpDate) || null,
          assigned_broker: brokerId,
          broker_id: brokerId,
          stage: 'new_requirement',
          status: 'active',
          notes: normalizeText(selectedProspect.notes) || null,
          special_requirements: normalizeText(selectedProspect.followUpNote) || null,
        })
        const updated = await updateCommercialCanvassingProspect(organisationId, selectedProspect.id, {
          ...selectedProspect,
          status: 'Converted to Requirement',
          linkedEntityType: 'commercial_requirement',
          linkedEntityId: createdRequirement.id,
          companyId: resolvedCompanyId || selectedProspect.companyId,
          contactId: resolvedContactId || selectedProspect.contactId,
          convertedRequirementId: createdRequirement.id,
        })
        setProspects((current) => current.map((row) => normalizeText(row.id) === normalizeText(selectedProspect.id) ? (updated || selectedProspect) : row))
        setMessage('Prospect converted to a requirement.')
      } else if (type === 'deal') {
        const createdDeal = await createCommercialDeal({
          organisation_id: organisationId,
          company_id: resolvedCompanyId || null,
          contact_id: resolvedContactId || null,
          deal_name: `${getProspectDisplayName(selectedProspect)} Deal`,
          deal_type: inferDealType(selectedProspect),
          requirement_id: normalizeText(selectedProspect.requirementId) || null,
          property_id: normalizeText(selectedProspect.propertyId) || null,
          vacancy_id: normalizeText(selectedProspect.vacancyId) || null,
          listing_id: normalizeText(selectedProspect.listingId) || null,
          assigned_broker: brokerId,
          broker_id: brokerId,
          stage: 'new',
          status: 'active',
          deal_value: Number(selectedProspect.estimatedValue || 0) || null,
          expected_close_date: normalizeText(selectedProspect.nextFollowUpDate) || null,
          notes: normalizeText(selectedProspect.notes) || null,
        })
        const updated = await updateCommercialCanvassingProspect(organisationId, selectedProspect.id, {
          ...selectedProspect,
          status: 'Converted to Deal',
          linkedEntityType: 'commercial_deal',
          linkedEntityId: createdDeal.id,
          companyId: resolvedCompanyId || selectedProspect.companyId,
          contactId: resolvedContactId || selectedProspect.contactId,
          convertedDealId: createdDeal.id,
        })
        setProspects((current) => current.map((row) => normalizeText(row.id) === normalizeText(selectedProspect.id) ? (updated || selectedProspect) : row))
        setMessage('Prospect converted to a deal.')
      } else if (type === 'contact') {
        const updated = await updateCommercialCanvassingProspect(organisationId, selectedProspect.id, {
          ...selectedProspect,
          status: 'Converted to Contact',
          linkedEntityType: 'commercial_contact',
          linkedEntityId: resolvedContactId,
          companyId: resolvedCompanyId || selectedProspect.companyId,
          contactId: resolvedContactId,
          convertedContactId: resolvedContactId,
          convertedCompanyId: resolvedCompanyId,
        })
        setProspects((current) => current.map((row) => normalizeText(row.id) === normalizeText(selectedProspect.id) ? (updated || selectedProspect) : row))
        setMessage('Contact created from canvassing prospect.')
      }

      await createCommercialCanvassingActivity(organisationId, {
        prospectId: selectedProspect.id,
        brokerId,
        brokerName: selectedProspect.assignedBrokerName || pickLookupLabel(brokerOptions, brokerId, ''),
        activityType: 'Note',
        activityNote: `Converted to ${type}`,
        outcome: type,
        activityDate: new Date().toISOString(),
      })
      await loadData()
    } catch (convertError) {
      setError(convertError?.message || 'This canvassing prospect could not be converted.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleArchiveProspect() {
    if (!organisationId || !selectedProspect) return
    setBusyAction('archive')
    setError('')
    try {
      const updated = await updateCommercialCanvassingProspect(organisationId, selectedProspect.id, {
        ...selectedProspect,
        status: 'Archived',
        archivedAt: new Date().toISOString(),
      })
      setProspects((current) => current.map((row) => normalizeText(row.id) === normalizeText(selectedProspect.id) ? (updated || { ...selectedProspect, status: 'Archived' }) : row))
      setArchiveOpen(false)
      setMessage('Prospect archived.')
      await createCommercialCanvassingActivity(organisationId, {
        prospectId: selectedProspect.id,
        brokerId: selectedProspect.assignedBrokerId || '',
        brokerName: selectedProspect.assignedBrokerName || '',
        activityType: 'Follow-Up',
        activityNote: 'Prospect archived from commercial canvassing workspace',
        outcome: 'Archived',
        activityDate: new Date().toISOString(),
      })
      await loadData()
    } catch (archiveError) {
      setError(archiveError?.message || 'Prospect could not be archived.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleDeleteProspect() {
    if (!organisationId || !selectedProspect) return
    setBusyAction('delete')
    setError('')
    try {
      await deleteCommercialCanvassingProspect(organisationId, selectedProspect.id)
      setProspects((current) => current.filter((row) => normalizeText(row.id) !== normalizeText(selectedProspect.id)))
      setActivities((current) => current.filter((row) => normalizeText(row.prospectId) !== normalizeText(selectedProspect.id)))
      setSelectedProspectId('')
      setDeleteOpen(false)
      setMessage('Prospect deleted.')
      await loadData()
    } catch (deleteError) {
      setError(deleteError?.message || 'Prospect could not be deleted.')
    } finally {
      setBusyAction('')
    }
  }

  const createModal = (
    <Modal
      open={createOpen}
      onClose={() => setCreateOpen(false)}
      title="New canvassing prospect"
      subtitle="Capture the company, contact, or asset you want to work through the commercial pipeline."
      className="max-w-4xl"
      footer={(
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button type="submit" form="commercial-canvassing-create-form" disabled={busyAction === 'create'}>
            {busyAction === 'create' ? 'Saving...' : 'Save Prospect'}
          </Button>
        </div>
      )}
    >
      <form id="commercial-canvassing-create-form" onSubmit={handleCreateProspect} className="grid gap-5">
        <section className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Company</span>
            <Field value={createDraft.companyName} onChange={(event) => updateCreateDraftField('companyName', event.target.value)} placeholder="Company or landlord name" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Contact</span>
            <Field value={createDraft.contactName} onChange={(event) => updateCreateDraftField('contactName', event.target.value)} placeholder="Decision maker or contact" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Phone</span>
            <Field value={createDraft.phone} onChange={(event) => updateCreateDraftField('phone', event.target.value)} placeholder="Phone number" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Email</span>
            <Field value={createDraft.email} onChange={(event) => updateCreateDraftField('email', event.target.value)} placeholder="Email address" />
          </label>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Prospect type</span>
            <Field as="select" value={createDraft.prospectType} onChange={(event) => updateCreateDraftField('prospectType', event.target.value)}>
              {PROSPECT_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
            </Field>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Canvassing method</span>
            <Field as="select" value={createDraft.canvassingMethod} onChange={(event) => updateCreateDraftField('canvassingMethod', event.target.value)}>
              {CANVASSING_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
            </Field>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Property type</span>
            <Field as="select" value={createDraft.propertyType} onChange={(event) => updateCreateDraftField('propertyType', event.target.value)}>
              <option value="">Select type</option>
              {PROSPECT_PROPERTY_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
            </Field>
          </label>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1.5 md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Area / location</span>
            <Field value={createDraft.area} onChange={(event) => updateCreateDraftField('area', event.target.value)} placeholder="Suburb, precinct, or node" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Broker owner</span>
            <Field as="select" value={createDraft.assignedBrokerId} onChange={(event) => updateCreateDraftField('assignedBrokerId', event.target.value)}>
              <option value="">Unassigned</option>
              {brokerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Field>
          </label>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Status</span>
            <Field as="select" value={createDraft.status} onChange={(event) => updateCreateDraftField('status', event.target.value)}>
              {PROSPECT_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
            </Field>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Follow-up date</span>
            <Field as="input" type="date" value={createDraft.nextFollowUpDate} onChange={(event) => updateCreateDraftField('nextFollowUpDate', event.target.value)} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Follow-up priority</span>
            <Field as="select" value={createDraft.followUpPriority} onChange={(event) => updateCreateDraftField('followUpPriority', event.target.value)}>
              {FOLLOW_UP_PRIORITIES.map((option) => <option key={option} value={option}>{option}</option>)}
            </Field>
          </label>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Estimated value</span>
            <Field as="input" type="number" value={createDraft.estimatedValue} onChange={(event) => updateCreateDraftField('estimatedValue', event.target.value)} placeholder="0" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Notes</span>
            <Field as="input" value={createDraft.followUpNote} onChange={(event) => updateCreateDraftField('followUpNote', event.target.value)} placeholder="Next action or objection" />
          </label>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Company link</span>
            <Field as="select" value={createDraft.companyId} onChange={(event) => updateCreateDraftField('companyId', event.target.value)}>
              <option value="">No company link</option>
              {(lookupOptions.companies || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Field>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Contact link</span>
            <Field as="select" value={createDraft.contactId} onChange={(event) => updateCreateDraftField('contactId', event.target.value)}>
              <option value="">No contact link</option>
              {(lookupOptions.contacts || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Field>
          </label>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Property link</span>
            <Field as="select" value={createDraft.propertyId} onChange={(event) => updateCreateDraftField('propertyId', event.target.value)}>
              <option value="">No property link</option>
              {(lookupOptions.properties || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Field>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Vacancy link</span>
            <Field as="select" value={createDraft.vacancyId} onChange={(event) => updateCreateDraftField('vacancyId', event.target.value)}>
              <option value="">No vacancy link</option>
              {(lookupOptions.vacancies || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Field>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Listing link</span>
            <Field as="select" value={createDraft.listingId} onChange={(event) => updateCreateDraftField('listingId', event.target.value)}>
              <option value="">No listing link</option>
              {(lookupOptions.listings || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Field>
          </label>
        </section>

        <section className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Linked record type</span>
            <Field as="select" value={createDraft.linkedEntityType} onChange={(event) => updateCreateDraftField('linkedEntityType', event.target.value)}>
              <option value="">Not linked</option>
              <option value="commercial_company">Company</option>
              <option value="commercial_contact">Contact</option>
              <option value="commercial_property">Property</option>
              <option value="commercial_vacancy">Vacancy</option>
              <option value="commercial_listing">Listing</option>
              <option value="commercial_requirement">Requirement</option>
              <option value="commercial_deal">Deal</option>
            </Field>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Linked record id</span>
            <Field value={createDraft.linkedEntityId} onChange={(event) => updateCreateDraftField('linkedEntityId', event.target.value)} placeholder="Linked record id" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Notes</span>
            <Field as="textarea" value={createDraft.notes} onChange={(event) => updateCreateDraftField('notes', event.target.value)} placeholder="Context, objections, next step..." />
          </label>
        </section>
      </form>
    </Modal>
  )

  const selectedBrokerLabel = pickLookupLabel(brokerOptions, selectedProspect?.assignedBrokerId, selectedProspect?.assignedBrokerName || 'Unassigned')

  return (
    <div className="space-y-8 pb-10">
      <section className={`${CARD_CLASS} p-6`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Commercial canvassing</p>
            <p className="mt-2 text-sm font-semibold text-[#60758d]">{organisationName}</p>
            <h1 className="mt-3 text-[46px] font-semibold leading-none tracking-[-0.04em] text-[#0f2748]">Prospecting</h1>
            <p className="mt-3 max-w-3xl text-[20px] font-medium text-[#526276]">
              Track outbound prospecting, follow-up work, and the records that should move into the commercial pipeline next.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/commercial/pipeline" className="inline-flex h-11 items-center gap-2 rounded-[12px] border border-[#dce6f0] bg-white px-[18px] text-sm font-medium text-[#0f2748] shadow-sm transition hover:border-[#bfd2e6] hover:text-[#0e335f]">
              Pipeline
              <ArrowRight size={15} />
            </Link>
            <Button type="button" onClick={openCreateModal}>
              <Plus size={16} />
              Prospect
            </Button>
          </div>
        </div>
      </section>

      {!loading && !canvassingEnabled ? (
        <CommercialEmptyState
          title="Commercial canvassing is not enabled yet"
          description="This workspace is live, but canvassing is still being rolled out. Enable the feature in Commercial workspace setup to expose prospecting, follow-up, and conversion actions."
        />
      ) : null}

      {!canvassingEnabled ? null : (
        <>
      {error ? <div className="rounded-[18px] border border-[#f6d4d4] bg-[#fff4f4] px-4 py-3 text-sm text-[#9f1d1d]">{error}</div> : null}
      {message ? <div className="rounded-[18px] border border-[#d4e8dc] bg-[#eef9f1] px-4 py-3 text-sm text-[#1a6e3a]">{message}</div> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ProspectStat label="Open Prospects" value={loading ? '...' : metrics.openProspects} detail="Active canvassing records" icon={ClipboardList} />
        <ProspectStat label="Follow-Ups Due" value={loading ? '...' : metrics.followUpsDue} detail="Needs a next touchpoint" icon={CalendarDays} />
        <ProspectStat label="Converted" value={loading ? '...' : metrics.converted} detail="Moved into commercial work" icon={CheckCircle2} />
        <ProspectStat label="Pipeline Value" value={loading ? '...' : formatCurrency(metrics.pipelineValue)} detail="Opportunity value in motion" icon={DollarSign} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <article className={`${CARD_CLASS} overflow-hidden`}>
          <div className="border-b border-[#e6edf4] p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0f2748]">Prospects</h2>
                <p className="mt-1 text-sm leading-6 text-[#60758d]">Commercial canvassing records and their current follow-up state.</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,260px)_repeat(3,minmax(0,180px))]">
                <SearchField value={search} onChange={setSearch} />
                <Field as="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded-[14px]">
                  <option value="all">All statuses</option>
                  {PROSPECT_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
                </Field>
                <Field as="select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-11 rounded-[14px]">
                  <option value="all">All types</option>
                  {PROSPECT_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
                </Field>
                <Field as="select" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} className="h-11 rounded-[14px]">
                  <option value="all">All methods</option>
                  {CANVASSING_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
                </Field>
                <Field as="select" value={brokerFilter} onChange={(event) => setBrokerFilter(event.target.value)} className="h-11 rounded-[14px]">
                  <option value="all">All brokers</option>
                  {brokerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Field>
              </div>
            </div>
          </div>

          <div className="overflow-hidden">
            {loading ? (
              <div className="p-6 text-sm text-[#60758d]">Loading commercial canvassing workspace...</div>
            ) : filteredProspects.length ? (
              <div className="max-h-[760px] overflow-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="text-left text-[12px] uppercase tracking-[0.14em] text-[#7b899a]">
                      <th className="border-b border-[#eef3f7] px-6 py-4 font-semibold">Prospect</th>
                      <th className="border-b border-[#eef3f7] px-4 py-4 font-semibold">Company</th>
                      <th className="border-b border-[#eef3f7] px-4 py-4 font-semibold">Broker</th>
                      <th className="border-b border-[#eef3f7] px-4 py-4 font-semibold">Method</th>
                      <th className="border-b border-[#eef3f7] px-4 py-4 font-semibold">Status</th>
                      <th className="border-b border-[#eef3f7] px-4 py-4 font-semibold">Follow-up</th>
                      <th className="border-b border-[#eef3f7] px-4 py-4 font-semibold">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProspects.map((prospect) => {
                      const selected = normalizeText(prospect.id) === normalizeText(selectedProspectId)
                      const brokerLabel = pickLookupLabel(brokerOptions, prospect.assignedBrokerId, prospect.assignedBrokerName || 'Unassigned')
                      return (
                        <tr
                          key={prospect.id}
                          className={`cursor-pointer border-b border-[#eef3f7] transition ${selected ? 'bg-[#f4f8fc]' : 'hover:bg-[#fbfdff]'}`}
                          onClick={() => setSelectedProspectId(prospect.id)}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-start gap-3">
                              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef5fb] text-sm font-semibold text-[#2d6ecf]">
                                <Building2 size={16} />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[#102236]">{getProspectDisplayName(prospect)}</p>
                                <p className="mt-1 truncate text-xs text-[#6d839b]">
                                  {normalizeText(prospect.area) || 'Area pending'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-[#102236]">{normalizeText(prospect.companyName) || 'No company set'}</td>
                          <td className="px-4 py-4 text-sm text-[#102236]">{brokerLabel}</td>
                          <td className="px-4 py-4 text-sm text-[#102236]">{titleize(prospect.canvassingMethod)}</td>
                          <td className="px-4 py-4"><ProspectTonePill value={prospect.status} /></td>
                          <td className="px-4 py-4 text-sm text-[#102236]">{formatRelativeDate(prospect.nextFollowUpDate)}</td>
                          <td className="px-4 py-4 text-sm font-semibold text-[#102236]">{formatCurrency(prospect.estimatedValue)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6">
                <CommercialEmptyState
                  title="No canvassing prospects"
                  description="Create the first commercial canvassing record to start tracking follow-ups and conversion opportunities."
                  primaryActionLabel="Create Prospect"
                  onPrimaryAction={openCreateModal}
                />
              </div>
            )}
          </div>
        </article>

        <aside className="space-y-6">
          {selectedProspect ? (
            <>
              <article className={`${CARD_CLASS} p-6`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Selected prospect</p>
                    <h2 className="mt-2 text-[28px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#0f2748]">{getProspectDisplayName(selectedProspect)}</h2>
                    <p className="mt-2 text-sm leading-6 text-[#60758d]">{normalizeText(selectedProspect.area) || 'No area captured yet'}</p>
                  </div>
                  <ProspectTonePill value={selectedProspect.status} />
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b899a]">Estimated value</p>
                    <p className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[#0f2748]">{formatCurrency(selectedProspect.estimatedValue)}</p>
                  </div>
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b899a]">Follow-up</p>
                    <p className="mt-2 text-sm font-semibold text-[#0f2748]">{formatRelativeDate(selectedProspect.nextFollowUpDate)}</p>
                  </div>
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b899a]">Broker</p>
                    <p className="mt-2 text-sm font-semibold text-[#0f2748]">{selectedBrokerLabel}</p>
                  </div>
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b899a]">Source</p>
                    <p className="mt-2 text-sm font-semibold text-[#0f2748]">{titleize(getProspectSource(selectedProspect))}</p>
                  </div>
                </div>
              </article>

              <article className={`${CARD_CLASS} p-6`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0f2748]">Edit prospect</h3>
                    <p className="mt-1 text-sm leading-6 text-[#60758d]">Keep the commercial canvass record current as the conversation moves.</p>
                  </div>
                  <Button type="button" onClick={handleSaveProspect} disabled={busyAction === 'save'}>
                    <Save size={16} />
                    {busyAction === 'save' ? 'Saving...' : 'Save'}
                  </Button>
                </div>

                <div className="mt-5 grid gap-4">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Company</span>
                    <Field value={selectedProspect.companyName || ''} onChange={(event) => updateSelectedProspectField('companyName', event.target.value)} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Contact</span>
                    <Field value={selectedProspect.contactName || ''} onChange={(event) => updateSelectedProspectField('contactName', event.target.value)} />
                  </label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Phone</span>
                      <Field value={selectedProspect.phone || ''} onChange={(event) => updateSelectedProspectField('phone', event.target.value)} />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Email</span>
                      <Field value={selectedProspect.email || ''} onChange={(event) => updateSelectedProspectField('email', event.target.value)} />
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Prospect type</span>
                      <Field as="select" value={selectedProspect.prospectType || 'Landlord Prospect'} onChange={(event) => updateSelectedProspectField('prospectType', event.target.value)}>
                        {PROSPECT_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
                      </Field>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Canvassing method</span>
                      <Field as="select" value={selectedProspect.canvassingMethod || 'Cold Call'} onChange={(event) => updateSelectedProspectField('canvassingMethod', event.target.value)}>
                        {CANVASSING_METHODS.map((option) => <option key={option} value={option}>{option}</option>)}
                      </Field>
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Property type</span>
                      <Field as="select" value={selectedProspect.propertyType || ''} onChange={(event) => updateSelectedProspectField('propertyType', event.target.value)}>
                        <option value="">Select type</option>
                        {PROSPECT_PROPERTY_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
                      </Field>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Area</span>
                      <Field value={selectedProspect.area || ''} onChange={(event) => updateSelectedProspectField('area', event.target.value)} />
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Broker owner</span>
                      <Field as="select" value={selectedProspect.assignedBrokerId || ''} onChange={(event) => updateSelectedProspectField('assignedBrokerId', event.target.value)}>
                        <option value="">Unassigned</option>
                        {brokerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </Field>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Status</span>
                      <Field as="select" value={selectedProspect.status || 'New'} onChange={(event) => updateSelectedProspectField('status', event.target.value)}>
                        {PROSPECT_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
                      </Field>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Priority</span>
                      <Field as="select" value={selectedProspect.followUpPriority || 'Medium'} onChange={(event) => updateSelectedProspectField('followUpPriority', event.target.value)}>
                        {FOLLOW_UP_PRIORITIES.map((option) => <option key={option} value={option}>{option}</option>)}
                      </Field>
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Follow-up date</span>
                      <Field as="input" type="date" value={selectedProspect.nextFollowUpDate || ''} onChange={(event) => updateSelectedProspectField('nextFollowUpDate', event.target.value)} />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Estimated value</span>
                      <Field as="input" type="number" value={selectedProspect.estimatedValue || ''} onChange={(event) => updateSelectedProspectField('estimatedValue', event.target.value)} />
                    </label>
                  </div>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Follow-up note</span>
                    <Field value={selectedProspect.followUpNote || ''} onChange={(event) => updateSelectedProspectField('followUpNote', event.target.value)} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Notes</span>
                    <Field as="textarea" value={selectedProspect.notes || ''} onChange={(event) => updateSelectedProspectField('notes', event.target.value)} />
                  </label>
                </div>
              </article>

              <article className={`${CARD_CLASS} p-6`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0f2748]">Conversion</h3>
                    <p className="mt-1 text-sm leading-6 text-[#60758d]">Move the prospect into the next commercial record when the outcome is clear.</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Button type="button" variant="secondary" onClick={() => void handleConvert('requirement')} disabled={busyAction.startsWith('convert-')}>
                    <ClipboardList size={16} />
                    {busyAction === 'convert-requirement' ? 'Creating...' : 'Requirement'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => void handleConvert('deal')} disabled={busyAction.startsWith('convert-')}>
                    <DollarSign size={16} />
                    {busyAction === 'convert-deal' ? 'Creating...' : 'Deal'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => void handleConvert('contact')} disabled={busyAction.startsWith('convert-')}>
                    <UserPlus size={16} />
                    {busyAction === 'convert-contact' ? 'Creating...' : 'Contact'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setArchiveOpen(true)} disabled={busyAction.startsWith('convert-')}>
                    <Archive size={16} />
                    Archive
                  </Button>
                </div>
              </article>

              <article className={`${CARD_CLASS} p-6`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0f2748]">Activity</h3>
                    <p className="mt-1 text-sm leading-6 text-[#60758d]">{selectedActivities.length} logged touchpoints</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Button type="button" variant="secondary" onClick={() => handleLogActivity('Call')} disabled={busyAction.startsWith('activity-')}>
                      <Phone size={16} />
                      Call
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => handleLogActivity('WhatsApp')} disabled={busyAction.startsWith('activity-')}>
                      <MessageCircle size={16} />
                      WhatsApp
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => handleLogActivity('Email')} disabled={busyAction.startsWith('activity-')}>
                      <Mail size={16} />
                      Email
                    </Button>
                  </div>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Note</span>
                    <Field as="textarea" value={activityDraft.activityNote} onChange={(event) => setActivityDraft((current) => ({ ...current, activityNote: event.target.value }))} placeholder="What happened on the call or visit?" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Outcome</span>
                    <Field value={activityDraft.outcome} onChange={(event) => setActivityDraft((current) => ({ ...current, outcome: event.target.value }))} placeholder="Next step or outcome" />
                  </label>
                  <Button type="button" onClick={() => handleLogActivity('Note')} disabled={busyAction.startsWith('activity-')}>
                    <Save size={16} />
                    Log activity
                  </Button>
                </div>
                <div className="mt-6 space-y-3">
                  {selectedActivities.length ? selectedActivities.map((activityRow) => (
                    <div key={activityRow.id} className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-[#102236]">{titleize(activityRow.activityType)}</p>
                          <p className="mt-1 text-sm leading-6 text-[#60758d]">{activityRow.activityNote || 'No note recorded'}</p>
                        </div>
                        <span className="text-xs font-semibold text-[#7b899a]">{formatDate(activityRow.activityDate || activityRow.createdAt)}</span>
                      </div>
                      {activityRow.outcome ? <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#1a6e3a]">{activityRow.outcome}</p> : null}
                    </div>
                  )) : (
                    <CommercialEmptyState
                      title="No activities yet"
                      description="Log calls, emails, WhatsApp notes, and follow-up steps against this prospect."
                    />
                  )}
                </div>
              </article>

              <article className={`${CARD_CLASS} p-6`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-[28px] font-semibold tracking-[-0.03em] text-[#0f2748]">Linked records</h3>
                    <p className="mt-1 text-sm leading-6 text-[#60758d]">Commercial records already connected to this prospect.</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3">
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b899a]">Company</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#102236]">{pickLookupLabel(lookupOptions.companies, selectedProspect.companyId, selectedProspect.companyName || 'Not linked')}</p>
                      {getWorkspaceLink('commercial_company', selectedProspect.companyId) ? (
                        <Link to={getWorkspaceLink('commercial_company', selectedProspect.companyId)} className="text-xs font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]">
                          Open
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b899a]">Contact</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#102236]">{pickLookupLabel(lookupOptions.contacts, selectedProspect.contactId, selectedProspect.contactName || 'Not linked')}</p>
                      {getWorkspaceLink('commercial_contact', selectedProspect.contactId) ? (
                        <Link to={getWorkspaceLink('commercial_contact', selectedProspect.contactId)} className="text-xs font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]">
                          Open
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b899a]">Property / vacancy / listing</p>
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#102236]">
                          {[pickLookupLabel(lookupOptions.properties, selectedProspect.propertyId, ''), pickLookupLabel(lookupOptions.vacancies, selectedProspect.vacancyId, ''), pickLookupLabel(lookupOptions.listings, selectedProspect.listingId, '')]
                            .filter((value) => normalizeText(value))
                            .join(' · ') || 'Not linked'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {getWorkspaceLink('commercial_property', selectedProspect.propertyId) ? (
                            <Link to={getWorkspaceLink('commercial_property', selectedProspect.propertyId)} className="inline-flex items-center gap-1 rounded-full border border-[#dce6f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0f2748] transition hover:border-[#bfd2e6] hover:text-[#0e335f]">
                              Open property
                            </Link>
                          ) : null}
                          {getWorkspaceLink('commercial_vacancy', selectedProspect.vacancyId) ? (
                            <Link to={getWorkspaceLink('commercial_vacancy', selectedProspect.vacancyId)} className="inline-flex items-center gap-1 rounded-full border border-[#dce6f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0f2748] transition hover:border-[#bfd2e6] hover:text-[#0e335f]">
                              Open vacancy
                            </Link>
                          ) : null}
                          {getWorkspaceLink('commercial_listing', selectedProspect.listingId) ? (
                            <Link to={getWorkspaceLink('commercial_listing', selectedProspect.listingId)} className="inline-flex items-center gap-1 rounded-full border border-[#dce6f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0f2748] transition hover:border-[#bfd2e6] hover:text-[#0e335f]">
                              Open listing
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-[#eef3f7] bg-[#fbfdff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7b899a]">Workflow link</p>
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-[#102236]">
                        {selectedProspect.linkedEntityType ? `${titleize(selectedProspect.linkedEntityType)} ${selectedProspect.linkedEntityId || ''}`.trim() : 'Not linked'}
                      </p>
                      {getWorkspaceLink(selectedProspect.linkedEntityType, selectedProspect.linkedEntityId) ? (
                        <Link to={getWorkspaceLink(selectedProspect.linkedEntityType, selectedProspect.linkedEntityId)} className="text-xs font-semibold text-[#1f6dd5] transition hover:text-[#0f5bbf]">
                          Open
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button type="button" variant="secondary" onClick={() => setArchiveOpen(true)}>
                    <Archive size={16} />
                    Archive
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setDeleteOpen(true)}>
                    <Trash2 size={16} />
                    Delete
                  </Button>
                </div>
              </article>
            </>
          ) : (
            <EmptyDetailState />
          )}
        </aside>
      </section>

      {createModal}

      <Modal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title="Archive prospect"
        subtitle="This keeps the record and activity history intact."
        footer={(
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setArchiveOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleArchiveProspect} disabled={busyAction === 'archive'}>
              <Archive size={16} />
              {busyAction === 'archive' ? 'Archiving...' : 'Archive'}
            </Button>
          </div>
        )}
      >
        <p className="text-sm leading-6 text-[#60758d]">
          The prospect will move out of the active queue, but the timeline stays available for future reference.
        </p>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete prospect"
        subtitle="This removes the prospect and its local activity history."
        footer={(
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleDeleteProspect} disabled={busyAction === 'delete'}>
              <Trash2 size={16} />
              {busyAction === 'delete' ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        )}
      >
        <p className="text-sm leading-6 text-[#60758d]">
          If you delete this prospect, its activity trail is removed from the canvassing workspace as well.
        </p>
      </Modal>
        </>
      )}
    </div>
  )
}

export default CommercialCanvassingPage
