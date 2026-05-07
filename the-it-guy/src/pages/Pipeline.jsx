import { ExternalLink, Funnel, KanbanSquare, Mail, MessageCircle, Plus, Table2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createTransactionFromWizard } from '../lib/api'
import { resolveTransactionOnboardingLink } from '../lib/onboardingLinks'
import LoadingSkeleton from '../components/LoadingSkeleton'
import Button from '../components/ui/Button'
import DataTable, { DataTableInner } from '../components/ui/DataTable'
import Field from '../components/ui/Field'
import { ViewToggle } from '../components/ui/FilterBar'
import { useWorkspace } from '../context/WorkspaceContext'
import AgencyPipelinePage from './agency/AgencyPipelinePage'
import { fetchDevelopmentOptions, fetchUnitsData } from '../lib/api'
import {
  buildSellerOnboardingLink,
  createListingDraftFromSellerLead,
  createAgentSellerLead,
  deleteSellerWorkflowRecord,
  generateId as generateSellerWorkflowId,
  LISTING_STATUS,
  readAgentListingDrafts,
  readAgentSellerLeads,
  SELLER_LEAD_STAGE,
  SELLER_ONBOARDING_STATUS,
  updateAgentSellerLead,
  updateListingDraft,
} from '../lib/agentListingStorage'
import { invokeEdgeFunction, isSupabaseConfigured } from '../lib/supabaseClient'
import {
  createViewingRequest,
  formatViewingStatusLabel,
  getViewingRequestsForLead,
} from '../lib/viewingWorkflow'
import { formatSouthAfricanWhatsAppNumber, sendWhatsAppNotification } from '../lib/whatsapp'

const STORAGE_KEY = 'itg:pipeline-leads:v1'
const PRIVATE_LISTINGS_STORAGE_KEY = 'itg:agent-private-listings:v1'

const SOURCE_OPTIONS = ['Property24', 'Website', 'Show Day', 'Referral', 'Walk-in', 'Facebook', 'Other']
const STATUS_OPTIONS = ['Active', 'Not Active', 'Closed', 'Lost', 'Follow Up', 'Negotiating']

const STATUS_COLUMNS = [
  { id: 'prospecting', label: 'Prospecting', statuses: ['Active', 'Follow Up'] },
  { id: 'negotiation', label: 'Negotiation', statuses: ['Negotiating'] },
  { id: 'closed', label: 'Closed Outcomes', statuses: ['Closed', 'Lost', 'Not Active'] },
]
const MANDATE_TYPE_OPTIONS = [
  { value: 'open', label: 'Open mandate' },
  { value: 'sole', label: 'Sole mandate' },
  { value: 'exclusive', label: 'Exclusive mandate' },
]
const VAT_HANDLING_OPTIONS = [
  { value: 'exclusive', label: 'VAT Exclusive' },
  { value: 'inclusive', label: 'VAT Inclusive' },
]
const SELLER_PIPELINE_STAGE = {
  ALL: 'all',
  SELLER_LEAD: 'seller_lead',
  ONBOARDING_PENDING: 'onboarding_pending',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  MANDATE_READY: 'mandate_ready',
  MANDATE_SENT: 'mandate_sent',
  MANDATE_SIGNED: 'mandate_signed',
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `lead_${Date.now()}`
}

function readLeads() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLeads(leads) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(leads))
}

function readLocalRows(storageKey, fallback = []) {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      return fallback
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function readPrivateListings() {
  return readLocalRows(PRIVATE_LISTINGS_STORAGE_KEY, [])
}

function splitLeadName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: 'Lead', surname: 'Pending' }
  if (parts.length === 1) return { firstName: parts[0], surname: '—' }
  return {
    firstName: parts.slice(0, -1).join(' '),
    surname: parts.slice(-1).join(' '),
  }
}

function formatDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('en-ZA')
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function normalizeWhatsappPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('27')) return digits
  if (digits.startsWith('0')) return `27${digits.slice(1)}`
  return digits
}

function addDaysToIsoDate(days = 0) {
  const today = new Date()
  if (Number.isFinite(days) && days) {
    today.setDate(today.getDate() + days)
  }
  return today.toISOString().slice(0, 10)
}

function formatMandateOwnershipType(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'Ownership not provided'
  if (normalized === 'married_cop') return 'Married (COP)'
  if (normalized === 'married_anc') return 'Married (ANC)'
  if (normalized === 'multiple_owners') return 'Multiple owners'
  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function buildSellerPortalLink(token) {
  const normalized = String(token || '').trim()
  if (!normalized) return ''
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://app.bridgenine.co.za'
  return `${origin}/client/${normalized}/selling`
}

function mapPrivatePropertyType(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized.includes('commercial')) return 'commercial'
  if (normalized.includes('agricultural') || normalized.includes('farm')) return 'farm'
  return 'residential'
}

function getStatusBadgeClass(status) {
  if (status === 'Closed') {
    return 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
  }

  if (status === 'Negotiating' || status === 'Follow Up') {
    return 'border-[#dbe6f2] bg-[#f5f9fd] text-[#35546c]'
  }

  if (status === 'Lost' || status === 'Not Active') {
    return 'border-[#e6eaf0] bg-[#f8fafc] text-[#66758b]'
  }

  return 'border-[#d9e3ef] bg-[#f7fbff] text-[#31506a]'
}

function formatWorkflowLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatSellerPipelineStageLabel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'Seller Lead'
  const labels = {
    [SELLER_PIPELINE_STAGE.SELLER_LEAD]: 'Seller Lead',
    [SELLER_PIPELINE_STAGE.ONBOARDING_PENDING]: 'Onboarding Pending',
    [SELLER_PIPELINE_STAGE.ONBOARDING_COMPLETED]: 'Onboarding Completed',
    [SELLER_PIPELINE_STAGE.MANDATE_READY]: 'Mandate Ready',
    [SELLER_PIPELINE_STAGE.MANDATE_SENT]: 'Mandate Sent',
    [SELLER_PIPELINE_STAGE.MANDATE_SIGNED]: 'Mandate Signed',
  }
  return labels[normalized] || formatWorkflowLabel(normalized)
}

function getSellerPipelineStageBadgeClass(stage) {
  const normalized = String(stage || '').trim().toLowerCase()
  if (normalized === SELLER_PIPELINE_STAGE.MANDATE_SIGNED) {
    return 'border-[#cae8d7] bg-[#f2fbf6] text-[#2f7f58]'
  }
  if ([SELLER_PIPELINE_STAGE.MANDATE_READY, SELLER_PIPELINE_STAGE.MANDATE_SENT].includes(normalized)) {
    return 'border-[#dbe6f2] bg-[#f5f9fd] text-[#35546c]'
  }
  if (normalized === SELLER_PIPELINE_STAGE.ONBOARDING_COMPLETED) {
    return 'border-[#d8ecdf] bg-[#eefbf3] text-[#1f7d44]'
  }
  if (normalized === SELLER_PIPELINE_STAGE.ONBOARDING_PENDING) {
    return 'border-[#ecdcc0] bg-[#fff8ef] text-[#8b6324]'
  }
  return 'border-[#dbe6f2] bg-[#f7fbff] text-[#35546c]'
}

function normalizeSellerPipelineStage({ lead, draft }) {
  const draftStage = String(draft?.stage || lead?.listingStatus || '').trim().toLowerCase()
  const leadStage = String(lead?.stage || '').trim().toLowerCase()
  const onboardingCompleted = isSellerOnboardingCompleted(lead)
  const hasMandateSent = draftStage === LISTING_STATUS.MANDATE_SENT
  const hasMandateSigned = draftStage === LISTING_STATUS.MANDATE_SIGNED || draftStage === LISTING_STATUS.LISTING_ACTIVE
  const hasMandateReady = draftStage === LISTING_STATUS.MANDATE_READY

  if (hasMandateSigned) return SELLER_PIPELINE_STAGE.MANDATE_SIGNED
  if (hasMandateSent) return SELLER_PIPELINE_STAGE.MANDATE_SENT
  if (hasMandateReady) return SELLER_PIPELINE_STAGE.MANDATE_READY
  if (onboardingCompleted || leadStage === SELLER_LEAD_STAGE.ONBOARDING_COMPLETED || draftStage === LISTING_STATUS.SELLER_ONBOARDING_COMPLETED) {
    return SELLER_PIPELINE_STAGE.ONBOARDING_COMPLETED
  }
  if ([SELLER_LEAD_STAGE.ONBOARDING_SENT, LISTING_STATUS.SELLER_ONBOARDING_PENDING, LISTING_STATUS.SELLER_ONBOARDING_SENT].includes(leadStage) || [LISTING_STATUS.SELLER_ONBOARDING_PENDING, LISTING_STATUS.SELLER_ONBOARDING_SENT].includes(draftStage)) {
    return SELLER_PIPELINE_STAGE.ONBOARDING_PENDING
  }
  return SELLER_PIPELINE_STAGE.SELLER_LEAD
}

function hasRequiredSellerDetails(lead) {
  const formData = lead?.sellerOnboarding?.formData || {}
  const ownershipType = String(formData?.ownershipType || '').trim().toLowerCase()
  const hasBase = Boolean(
    String(formData?.sellerFirstName || lead?.sellerName || '').trim() &&
      String(formData?.sellerSurname || lead?.sellerSurname || '').trim() &&
      String(formData?.email || lead?.sellerEmail || '').trim() &&
      String(formData?.phone || lead?.sellerPhone || '').trim(),
  )
  if (!hasBase) return false

  if (['individual', 'married_cop', 'married_anc'].includes(ownershipType)) {
    return Boolean(String(formData?.idNumber || '').trim())
  }
  if (ownershipType === 'company') {
    return Boolean(
      String(formData?.companyName || '').trim() &&
        String(formData?.companyRegistrationNumber || '').trim() &&
        String(formData?.companyDirectorName || '').trim(),
    )
  }
  if (ownershipType === 'trust') {
    return Boolean(
      String(formData?.trustName || '').trim() &&
        String(formData?.trustRegistrationNumber || '').trim() &&
        String(formData?.trusteeName || '').trim(),
    )
  }
  if (ownershipType === 'multiple_owners') {
    const owners = Array.isArray(formData?.multipleOwners) ? formData.multipleOwners : []
    return owners.length > 0 && owners.every((owner) => String(owner?.name || '').trim() && String(owner?.surname || '').trim() && String(owner?.idNumber || '').trim())
  }
  return false
}

function hasRequiredPropertyDetails(lead) {
  const formData = lead?.sellerOnboarding?.formData || {}
  return Boolean(
    String(formData?.propertyType || lead?.propertyType || '').trim() &&
      String(formData?.propertyAddress || lead?.propertyAddress || '').trim() &&
      String(formData?.suburb || lead?.suburb || '').trim() &&
      String(formData?.province || '').trim(),
  )
}

function isSellerOnboardingCompleted(lead) {
  const onboardingStatus = String(lead?.sellerOnboarding?.status || lead?.onboardingStatus || '').trim().toLowerCase()
  const stage = String(lead?.stage || '').trim().toLowerCase()
  return onboardingStatus === SELLER_ONBOARDING_STATUS.COMPLETED || stage === SELLER_LEAD_STAGE.ONBOARDING_COMPLETED
}

function Pipeline() {
  const { workspace, role } = useWorkspace()

  if (role === 'agent') {
    return <AgencyPipelinePage />
  }
  const [pipelineTab, setPipelineTab] = useState('buyers')
  const [sellerStageFilter, setSellerStageFilter] = useState(SELLER_PIPELINE_STAGE.ALL)
  const [viewMode, setViewMode] = useState('table')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workflowMessage, setWorkflowMessage] = useState('')
  const [developmentOptions, setDevelopmentOptions] = useState([])
  const [unitOptions, setUnitOptions] = useState([])
  const [privateListingOptions, setPrivateListingOptions] = useState([])
  const [leads, setLeads] = useState([])
  const [sellerLeads, setSellerLeads] = useState([])
  const [listingDrafts, setListingDrafts] = useState([])
  const [filters, setFilters] = useState({
    status: 'all',
    source: 'all',
    developmentId: workspace.id === 'all' ? 'all' : workspace.id,
  })
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    developmentId: workspace.id === 'all' ? '' : workspace.id,
    unitId: '',
    source: SOURCE_OPTIONS[0],
    status: STATUS_OPTIONS[0],
    notes: '',
  })
  const [sellerForm, setSellerForm] = useState({
    sellerName: '',
    sellerSurname: '',
    sellerEmail: '',
    sellerPhone: '',
    propertyAddress: '',
    propertyType: 'House',
    estimatedPrice: '',
    leadSource: 'Referral',
    notes: '',
  })
  const [selectedLead, setSelectedLead] = useState(null)
  const [showConvertForm, setShowConvertForm] = useState(false)
  const [convertForm, setConvertForm] = useState({
    targetType: 'development',
    developmentId: '',
    unitId: '',
    privateListingId: '',
    financeType: 'cash',
    purchaserType: 'individual',
  })
  const [convertUnitOptions, setConvertUnitOptions] = useState([])
  const [convertLoading, setConvertLoading] = useState(false)
  const [convertError, setConvertError] = useState('')
  const [convertResult, setConvertResult] = useState(null)
  const [leadViewings, setLeadViewings] = useState([])
  const [showViewingRequestForm, setShowViewingRequestForm] = useState(false)
  const [viewingRequestForm, setViewingRequestForm] = useState({
    proposedDate: '',
    proposedTime: '',
    alternativeTimeA: '',
    alternativeTimeB: '',
    notes: '',
  })
  const [showMandateModal, setShowMandateModal] = useState(false)
  const [selectedMandateLead, setSelectedMandateLead] = useState(null)
  const [mandateError, setMandateError] = useState('')
  const [sendingMandate, setSendingMandate] = useState(false)
  const [mandateDraft, setMandateDraft] = useState({
    mandateType: 'sole',
    commissionStructure: 'percentage',
    commissionPercent: '7.5',
    commissionAmount: '',
    vatHandling: 'exclusive',
    mandateStartDate: addDaysToIsoDate(0),
    mandateEndDate: addDaysToIsoDate(90),
    askingPrice: '',
    specialConditions: '',
  })

  const loadOptions = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setError('')
      setLoading(true)
      const options = await fetchDevelopmentOptions()
      setDevelopmentOptions(options)
      setPrivateListingOptions(readPrivateListings())
      setLeads(readLeads())
      setSellerLeads(readAgentSellerLeads())
      setListingDrafts(readAgentListingDrafts())
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOptions()
  }, [loadOptions])

  useEffect(() => {
    setFilters((previous) => ({
      ...previous,
      developmentId: workspace.id === 'all' ? previous.developmentId : workspace.id,
    }))

    setForm((previous) => ({
      ...previous,
      developmentId: workspace.id === 'all' ? previous.developmentId : workspace.id,
      unitId: '',
    }))
  }, [workspace.id])

  useEffect(() => {
    async function loadUnits() {
      if (!isSupabaseConfigured || !form.developmentId) {
        setUnitOptions([])
        return
      }

      try {
        const rows = await fetchUnitsData({
          developmentId: form.developmentId,
          stage: 'all',
          financeType: 'all',
        })
        setUnitOptions(rows.map((row) => ({ id: row.unit.id, label: row.unit.unit_number })))
      } catch {
        setUnitOptions([])
      }
    }

    void loadUnits()
  }, [form.developmentId])

  useEffect(() => {
    async function loadConvertUnits() {
      if (!isSupabaseConfigured || convertForm.targetType !== 'development' || !convertForm.developmentId) {
        setConvertUnitOptions([])
        return
      }

      try {
        const rows = await fetchUnitsData({
          developmentId: convertForm.developmentId,
          stage: 'all',
          financeType: 'all',
        })
        setConvertUnitOptions(
          rows
            .map((row) => ({
              id: row?.unit?.id || '',
              label: row?.unit?.unit_number || '-',
              price: Number(row?.unit?.price || row?.unit?.list_price || 0) || 0,
            }))
            .filter((item) => item.id),
        )
      } catch {
        setConvertUnitOptions([])
      }
    }

    void loadConvertUnits()
  }, [convertForm.developmentId, convertForm.targetType])

  function updateForm(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function updateSellerForm(key, value) {
    setSellerForm((previous) => ({ ...previous, [key]: value }))
  }

  function handleCreateLead(event) {
    event.preventDefault()

    if (!form.name.trim()) {
      setError('Lead name is required.')
      return
    }

    if (!form.developmentId) {
      setError('Select a development.')
      return
    }

    setError('')
    const development = developmentOptions.find((item) => item.id === form.developmentId)
    const unit = unitOptions.find((item) => item.id === form.unitId)

    const next = [
      {
        id: generateId(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        developmentId: form.developmentId,
        developmentName: development?.name || 'Unknown Development',
        unitId: form.unitId || null,
        unitNumber: unit?.label || '-',
        source: form.source,
        status: form.status,
        notes: form.notes.trim(),
        createdAt: new Date().toISOString(),
      },
      ...leads,
    ]

    setLeads(next)
    writeLeads(next)
    setForm((previous) => ({
      ...previous,
      name: '',
      phone: '',
      email: '',
      unitId: '',
      source: SOURCE_OPTIONS[0],
      status: STATUS_OPTIONS[0],
      notes: '',
    }))
    setShowForm(false)
  }

  function handleCreateSellerLead(event) {
    event.preventDefault()
    if (!sellerForm.sellerName.trim() || !sellerForm.sellerEmail.trim()) {
      setError('Seller name and email are required.')
      return
    }

    setError('')
    const token = `seller-${Date.now().toString(36)}`
    const onboardingLink = buildSellerOnboardingLink(token)
    const createdLead = createAgentSellerLead({
      id: generateSellerWorkflowId('seller_lead'),
      sellerName: sellerForm.sellerName.trim(),
      sellerSurname: sellerForm.sellerSurname.trim(),
      sellerEmail: sellerForm.sellerEmail.trim(),
      sellerPhone: sellerForm.sellerPhone.trim(),
      propertyAddress: sellerForm.propertyAddress.trim(),
      propertyType: sellerForm.propertyType,
      estimatedPrice: Number(sellerForm.estimatedPrice || 0) || 0,
      leadSource: sellerForm.leadSource,
      agentId: '',
      agencyId: '',
      stage: SELLER_LEAD_STAGE.ONBOARDING_SENT,
      onboardingStatus: SELLER_ONBOARDING_STATUS.NOT_STARTED,
      listingStatus: LISTING_STATUS.SELLER_ONBOARDING_SENT,
      notes: sellerForm.notes.trim(),
      propertyData: {
        listingTitle: sellerForm.propertyAddress.trim(),
      },
      sellerOnboarding: {
        token,
        link: onboardingLink,
        status: SELLER_ONBOARDING_STATUS.NOT_STARTED,
        currentStep: 0,
        formData: {},
      },
    })

    createListingDraftFromSellerLead(createdLead, { stage: LISTING_STATUS.SELLER_ONBOARDING_SENT })
    setSellerLeads(readAgentSellerLeads())
    setListingDrafts(readAgentListingDrafts())
    setSellerForm({
      sellerName: '',
      sellerSurname: '',
      sellerEmail: '',
      sellerPhone: '',
      propertyAddress: '',
      propertyType: 'House',
      estimatedPrice: '',
      leadSource: 'Referral',
      notes: '',
    })
    setShowForm(false)
    setWorkflowMessage(`Seller onboarding link created for ${createdLead.sellerName || 'seller'}.`)
  }

  function handleDeleteSellerPipelineRow(row) {
    const targetId = String(row?.sellerLeadId || row?.id || '').trim()
    if (!targetId) {
      setWorkflowMessage('Unable to delete this seller lead right now.')
      return
    }

    const sellerLabel = String(row?.sellerName || row?.lead?.sellerName || 'this seller lead').trim()
    const confirmed = typeof window !== 'undefined'
      ? window.confirm(`Delete ${sellerLabel}? This will remove the seller lead and linked pipeline draft records.`)
      : true
    if (!confirmed) return

    const deleted = deleteSellerWorkflowRecord(targetId, { removeLinkedListings: false })
    if (!deleted?.removed) {
      setWorkflowMessage('No matching seller lead record was found to delete.')
      return
    }

    setSellerLeads(readAgentSellerLeads())
    setListingDrafts(readAgentListingDrafts())
    setPrivateListingOptions(readPrivateListings())
    setWorkflowMessage(
      `Seller lead deleted. Removed ${deleted.removedLeads} lead record${deleted.removedLeads === 1 ? '' : 's'} and ${deleted.removedDrafts} linked draft${deleted.removedDrafts === 1 ? '' : 's'}.`,
    )
  }

  function openLeadDrawer(lead) {
    setSelectedLead(lead)
    setShowConvertForm(false)
    setConvertError('')
    setConvertResult(null)
    setConvertForm({
      targetType: lead?.developmentId ? 'development' : 'private_listing',
      developmentId: lead?.developmentId || '',
      unitId: lead?.unitId || '',
      privateListingId: lead?.developmentId ? '' : lead?.unitId || '',
      financeType: 'cash',
      purchaserType: 'individual',
    })
    setLeadViewings(getViewingRequestsForLead(lead?.id))
    setShowViewingRequestForm(false)
    setViewingRequestForm({
      proposedDate: '',
      proposedTime: '',
      alternativeTimeA: '',
      alternativeTimeB: '',
      notes: '',
    })
  }

  function closeLeadDrawer() {
    if (convertLoading) {
      return
    }
    setSelectedLead(null)
    setShowConvertForm(false)
    setConvertError('')
    setConvertResult(null)
    setConvertUnitOptions([])
    setLeadViewings([])
    setShowViewingRequestForm(false)
  }

  function openMandateComposer(lead) {
    const draftId = String(lead?.listingDraftId || '').trim()
    if (!draftId) {
      setWorkflowMessage('Seller onboarding is complete, but no listing draft was found yet. Refresh and try again.')
      return
    }

    const targetDraft = readAgentListingDrafts().find((row) => String(row?.id || row?.listingDraftId || '') === draftId)
    if (!targetDraft) {
      setWorkflowMessage('Unable to locate the listing draft for mandate generation.')
      return
    }

    updateListingDraft(draftId, (row) => ({
      ...row,
      stage: LISTING_STATUS.MANDATE_READY,
      mandateStatus: 'ready_to_generate',
    }))
    updateAgentSellerLead(lead?.sellerLeadId || lead?.id || '', (row) => ({
      ...row,
      listingStatus: LISTING_STATUS.MANDATE_READY,
      mandateStatus: 'ready_to_generate',
    }))
    setListingDrafts(readAgentListingDrafts())
    setSellerLeads(readAgentSellerLeads())

    const onboardingData = lead?.sellerOnboarding?.formData || {}
    const commission = targetDraft?.commission || {}
    const existingMandate = targetDraft?.mandate || {}
    setSelectedMandateLead(lead)
    setMandateError('')
    setMandateDraft({
      mandateType: String(existingMandate?.type || targetDraft?.mandateType || lead?.mandateType || 'sole').trim().toLowerCase() || 'sole',
      commissionStructure: String(commission?.commission_type || 'percentage').trim().toLowerCase() || 'percentage',
      commissionPercent: String(commission?.commission_percentage ?? existingMandate?.commissionPercent ?? '7.5'),
      commissionAmount: String(commission?.commission_amount ?? existingMandate?.commissionAmount ?? ''),
      vatHandling: String(commission?.vat_handling || existingMandate?.vatHandling || 'exclusive').trim().toLowerCase() || 'exclusive',
      mandateStartDate: String(existingMandate?.startDate || targetDraft?.mandateStartDate || addDaysToIsoDate(0)).slice(0, 10),
      mandateEndDate: String(existingMandate?.endDate || targetDraft?.mandateEndDate || addDaysToIsoDate(90)).slice(0, 10),
      askingPrice: String(onboardingData?.askingPrice || targetDraft?.askingPrice || lead?.estimatedPrice || ''),
      specialConditions: String(existingMandate?.specialConditions || '').trim(),
    })
    setShowMandateModal(true)
  }

  function closeMandateComposer() {
    if (sendingMandate) return
    setShowMandateModal(false)
    setSelectedMandateLead(null)
    setMandateError('')
  }

  async function handleSendMandateToSeller() {
    if (!selectedMandateLead) return
    const draftId = String(selectedMandateLead?.listingDraftId || '').trim()
    if (!draftId) {
      setMandateError('Unable to find listing draft for this seller lead.')
      return
    }

    setSendingMandate(true)
    setMandateError('')

    try {
      const sentAt = new Date().toISOString()
      const sellerName = [selectedMandateLead?.sellerName, selectedMandateLead?.sellerSurname].filter(Boolean).join(' ').trim() || 'Seller'
      const propertyTitle = String(
        selectedMandateLead?.propertyAddress ||
          selectedMandateLead?.listingTitle ||
          selectedMandateLead?.sellerOnboarding?.formData?.propertyAddress ||
          'your property',
      ).trim()
      const portalLink = buildSellerPortalLink(selectedMandateLead?.sellerOnboarding?.token)
      const mandateTypeLabel = MANDATE_TYPE_OPTIONS.find((option) => option.value === mandateDraft.mandateType)?.label || 'Sole mandate'

      const nextCommission = {
        commission_type: mandateDraft.commissionStructure,
        commission_percentage:
          mandateDraft.commissionStructure === 'percentage'
            ? Number(mandateDraft.commissionPercent || 0)
            : null,
        commission_amount:
          mandateDraft.commissionStructure === 'fixed'
            ? Number(mandateDraft.commissionAmount || 0)
            : null,
        vat_handling: mandateDraft.vatHandling,
      }

      const updatedDraft = updateListingDraft(draftId, (row) => ({
        ...row,
        stage: LISTING_STATUS.MANDATE_SENT,
        mandateStatus: 'sent',
        listingPrice: Number(mandateDraft.askingPrice || 0) || Number(row?.listingPrice || 0) || Number(row?.askingPrice || 0) || 0,
        askingPrice: Number(mandateDraft.askingPrice || 0) || Number(row?.askingPrice || 0) || 0,
        commission: {
          ...(row?.commission || {}),
          ...nextCommission,
        },
        mandateType: mandateDraft.mandateType,
        mandateStartDate: mandateDraft.mandateStartDate || row?.mandateStartDate || null,
        mandateEndDate: mandateDraft.mandateEndDate || row?.mandateEndDate || null,
        mandate: {
          ...(row?.mandate || {}),
          templateId: 'seller-mandate-v1',
          generatedAt: sentAt,
          sentAt,
          status: 'sent',
          sellerEditable: false,
          sellerCanRequestChanges: true,
          type: mandateDraft.mandateType,
          commissionStructure: mandateDraft.commissionStructure,
          commissionPercent:
            mandateDraft.commissionStructure === 'percentage'
              ? Number(mandateDraft.commissionPercent || 0)
              : null,
          commissionAmount:
            mandateDraft.commissionStructure === 'fixed'
              ? Number(mandateDraft.commissionAmount || 0)
              : null,
          vatHandling: mandateDraft.vatHandling,
          startDate: mandateDraft.mandateStartDate || null,
          endDate: mandateDraft.mandateEndDate || null,
          askingPrice: Number(mandateDraft.askingPrice || 0) || 0,
          specialConditions: mandateDraft.specialConditions || '',
          previewVersion: 1,
        },
      }))

      if (!updatedDraft) {
        setMandateError('Unable to generate the mandate right now. Please try again.')
        return
      }

      updateAgentSellerLead(selectedMandateLead?.sellerLeadId || selectedMandateLead?.id || '', (row) => ({
        ...row,
        listingStatus: LISTING_STATUS.MANDATE_SENT,
        mandateStatus: 'sent',
        mandate: {
          ...(row?.mandate || {}),
          type: mandateDraft.mandateType,
          sentAt,
          status: 'sent',
          startDate: mandateDraft.mandateStartDate || null,
          endDate: mandateDraft.mandateEndDate || null,
          specialConditions: mandateDraft.specialConditions || '',
        },
      }))

      const sellerEmail = String(selectedMandateLead?.sellerEmail || '').trim()
      if (sellerEmail) {
        try {
          const { error: emailError } = await invokeEdgeFunction('send-email', {
            body: {
              type: 'seller_mandate_sent',
              to: sellerEmail,
              sellerName,
              propertyTitle,
              mandateType: mandateTypeLabel,
              mandateStartDate: mandateDraft.mandateStartDate || '',
              mandateEndDate: mandateDraft.mandateEndDate || '',
              askingPrice: formatCurrency(Number(mandateDraft.askingPrice || 0) || 0),
              portalLink,
            },
          })
          if (emailError) {
            console.error('[Seller Mandate] email notification failed', {
              sellerEmail,
              error: emailError,
            })
          }
        } catch (emailInvokeError) {
          console.error('[Seller Mandate] email notification failed', emailInvokeError)
        }
      }

      const sellerPhone = formatSouthAfricanWhatsAppNumber(selectedMandateLead?.sellerPhone)
      if (sellerPhone) {
        const whatsappResult = await sendWhatsAppNotification({
          to: sellerPhone,
          role: 'seller_mandate',
          message: `Hi ${sellerName},\n\nYour ${mandateTypeLabel.toLowerCase()} for ${propertyTitle} is ready for review.\n\nYou can review the mandate in your seller portal here:\n${portalLink || 'Portal link unavailable'}\n\nIf you disagree with the terms, please request changes in the portal (commission terms are review-only).\n\n- Bridge`,
        })
        if (!whatsappResult?.ok) {
          console.error('[Seller Mandate] WhatsApp notification failed', {
            sellerPhone,
            result: whatsappResult,
          })
        }
      }

      setListingDrafts(readAgentListingDrafts())
      setSellerLeads(readAgentSellerLeads())
      setWorkflowMessage(`Mandate sent to seller for ${updatedDraft.listingTitle || propertyTitle}. Listing status moved to mandate_sent.`)
      setShowMandateModal(false)
      setSelectedMandateLead(null)
      setMandateError('')
    } catch (sendError) {
      setMandateError(sendError?.message || 'Unable to send mandate right now.')
    } finally {
      setSendingMandate(false)
    }
  }

  function submitViewingFromLead() {
    if (!selectedLead || !viewingRequestForm.proposedDate || !viewingRequestForm.proposedTime) return
    const isDevelopment = Boolean(selectedLead?.developmentId)
    const selectedListing = !isDevelopment
      ? privateListingOptions.find((item) => String(item?.id || '') === String(selectedLead?.unitId || ''))
      : null
    createViewingRequest({
      listingId: isDevelopment ? `development:${selectedLead.developmentId}:${selectedLead.unitId || ''}` : selectedListing?.id || '',
      listingType: isDevelopment ? 'development' : 'private_listing',
      listingTitle: isDevelopment
        ? [selectedLead?.developmentName, selectedLead?.unitNumber && selectedLead.unitNumber !== '-' ? `Unit ${selectedLead.unitNumber}` : ''].filter(Boolean).join(' • ')
        : selectedListing?.listingTitle || selectedLead?.unitNumber || 'Private Listing',
      buyerLeadId: selectedLead.id,
      buyerName: selectedLead.name,
      createdBy: 'agent',
      createdByRole: 'agent',
      proposedDate: viewingRequestForm.proposedDate,
      proposedTime: viewingRequestForm.proposedTime,
      alternativeTimes: [viewingRequestForm.alternativeTimeA, viewingRequestForm.alternativeTimeB].filter(Boolean),
      notes: viewingRequestForm.notes.trim(),
      location: isDevelopment
        ? selectedLead?.developmentName || 'Development'
        : [selectedListing?.listingTitle, selectedListing?.suburb, selectedListing?.city].filter(Boolean).join(', '),
      sellerName: selectedListing?.seller?.name || '',
      developerName: selectedLead?.developmentName || '',
      agentName: 'Agent',
    })
    setLeadViewings(getViewingRequestsForLead(selectedLead.id))
    setShowViewingRequestForm(false)
    setViewingRequestForm({
      proposedDate: '',
      proposedTime: '',
      alternativeTimeA: '',
      alternativeTimeB: '',
      notes: '',
    })
  }

  async function handleConvertLeadToDeal() {
    if (!selectedLead) {
      return
    }

    try {
      setConvertLoading(true)
      setConvertError('')
      setConvertResult(null)
      const isDevelopment = convertForm.targetType === 'development'
      const selectedUnit = isDevelopment ? convertUnitOptions.find((item) => item.id === convertForm.unitId) : null
      const development = isDevelopment ? developmentOptions.find((item) => item.id === convertForm.developmentId) : null
      const selectedListing =
        !isDevelopment ? privateListingOptions.find((item) => String(item?.id || '') === String(convertForm.privateListingId || '')) : null

      if (isDevelopment && !convertForm.developmentId) {
        setConvertError('Development is required to convert this lead to a deal.')
        return
      }

      if (isDevelopment && !convertForm.unitId) {
        setConvertError('Select a unit before converting this lead to a deal.')
        return
      }

      if (!isDevelopment && !convertForm.privateListingId) {
        setConvertError('Select a private listing before converting this lead to a deal.')
        return
      }

      const result = await createTransactionFromWizard({
        setup: {
          transactionType: isDevelopment ? 'developer_sale' : 'private_property',
          developmentId: isDevelopment ? convertForm.developmentId : null,
          unitId: isDevelopment ? convertForm.unitId : null,
          buyerName: String(selectedLead.name || '').trim(),
          buyerPhone: String(selectedLead.phone || '').trim(),
          buyerEmail: String(selectedLead.email || '').trim(),
          financeType: convertForm.financeType,
          purchaserType: convertForm.purchaserType,
          salesPrice: isDevelopment ? selectedUnit?.price || null : Number(selectedListing?.askingPrice || 0) || null,
          propertyType: isDevelopment ? null : mapPrivatePropertyType(selectedListing?.propertyType),
          propertyAddressLine1: isDevelopment ? null : String(selectedListing?.listingTitle || '').trim(),
          suburb: isDevelopment ? null : String(selectedListing?.suburb || '').trim(),
          city: isDevelopment ? null : String(selectedListing?.city || '').trim(),
          propertyDescription: isDevelopment
            ? null
            : [selectedListing?.propertyType, selectedListing?.listingTitle].filter(Boolean).join(' • '),
          sellerName: isDevelopment ? null : String(selectedListing?.seller?.name || '').trim(),
          sellerEmail: isDevelopment ? null : String(selectedListing?.seller?.email || '').trim(),
          sellerPhone: isDevelopment ? null : String(selectedListing?.seller?.phone || '').trim(),
        },
        finance: {
          reservationRequired: false,
        },
        status: {
          stage: 'Reserved',
          mainStage: 'DEP',
          nextAction: 'Send onboarding link to client.',
        },
        options: {
          allowIncomplete: true,
        },
      })

      const onboarding =
        result?.transactionId
          ? await resolveTransactionOnboardingLink({
              transactionId: result.transactionId,
              purchaserType: convertForm.purchaserType,
            }).catch(() => null)
          : null

      const normalizedLeadName = String(selectedLead.name || '').trim()
      const nextLeads = leads.map((lead) =>
        lead.id === selectedLead.id
          ? {
              ...lead,
              status: 'Closed',
              notes: `${lead.notes ? `${lead.notes}\n` : ''}Converted to deal ${result?.transactionId || 'created'}${
                onboarding?.url ? ' • onboarding link generated' : ''
              }.`,
            }
          : lead,
      )
      setLeads(nextLeads)
      writeLeads(nextLeads)

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('itg:transaction-created'))
        window.dispatchEvent(new Event('itg:transaction-updated'))
      }

      setConvertResult({
        transactionId: result?.transactionId || '',
        transactionType: result?.transactionType || '',
        developmentName: isDevelopment ? development?.name || selectedLead.developmentName || '' : selectedListing?.listingTitle || 'Private Listing',
        unitNumber: isDevelopment ? result?.unitNumber || selectedUnit?.label || selectedLead.unitNumber || '' : selectedListing?.listingTitle || '',
        buyerName: normalizedLeadName || 'Buyer',
        onboardingUrl: onboarding?.url || '',
      })

      if (onboarding?.url) {
        const opened = window.open(onboarding.url, '_blank', 'noopener,noreferrer')
        if (!opened) {
          window.location.href = onboarding.url
        }
      }
    } catch (conversionError) {
      setConvertError(conversionError?.message || 'Unable to convert lead to deal right now.')
    } finally {
      setConvertLoading(false)
    }
  }

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const scopeMatch = filters.developmentId === 'all' ? true : lead.developmentId === filters.developmentId
      const statusMatch = filters.status === 'all' ? true : lead.status === filters.status
      const sourceMatch = filters.source === 'all' ? true : lead.source === filters.source
      return scopeMatch && statusMatch && sourceMatch
    })
  }, [leads, filters.developmentId, filters.source, filters.status])

  const sellerLeadRows = useMemo(() => {
    return sellerLeads.filter((lead) =>
      [SELLER_LEAD_STAGE.NEW_LEAD, SELLER_LEAD_STAGE.CONTACTED, SELLER_LEAD_STAGE.ONBOARDING_SENT, SELLER_LEAD_STAGE.ONBOARDING_COMPLETED].includes(
        String(lead?.stage || '').trim().toLowerCase(),
      ),
    )
  }, [sellerLeads])

  const listingsInProgressRows = useMemo(() => {
    return listingDrafts.slice().sort((left, right) => new Date(right?.updatedAt || 0) - new Date(left?.updatedAt || 0))
  }, [listingDrafts])

  const sellerStockRows = useMemo(() => {
    const draftsByLeadId = new Map(
      listingsInProgressRows.map((draft) => [String(draft?.sellerLeadId || ''), draft]),
    )
    const consumedDraftIds = new Set()
    const rows = []

    sellerLeadRows.forEach((lead) => {
      const draft = draftsByLeadId.get(String(lead?.sellerLeadId || lead?.id || '')) || null
      if (draft?.id) consumedDraftIds.add(String(draft.id))
      const stage = normalizeSellerPipelineStage({ lead, draft })
      const sellerPortalLink = buildSellerPortalLink(lead?.sellerOnboarding?.token || draft?.sellerOnboarding?.token)
      const onboardingLink = lead?.sellerOnboarding?.link || draft?.sellerOnboarding?.link || ''
      const canGenerateMandate = [SELLER_PIPELINE_STAGE.ONBOARDING_COMPLETED, SELLER_PIPELINE_STAGE.MANDATE_READY].includes(stage) && hasRequiredSellerDetails(lead) && hasRequiredPropertyDetails(lead)

      rows.push({
        id: String(lead?.sellerLeadId || lead?.id || draft?.id || Math.random()),
        sellerLeadId: String(lead?.sellerLeadId || lead?.id || ''),
        lead,
        draft,
        stage,
        agentName: lead?.assignedAgentName || draft?.assignedAgentName || 'Unassigned',
        sellerName: [lead?.sellerName || draft?.seller?.name || '', lead?.sellerSurname || ''].filter(Boolean).join(' ').trim() || draft?.seller?.name || 'Seller',
        sellerContact: lead?.sellerPhone || lead?.sellerEmail || draft?.seller?.phone || draft?.seller?.email || 'No contact details yet',
        propertyAddress: lead?.propertyAddress || draft?.propertyAddress || draft?.listingTitle || 'Address pending',
        propertyType: lead?.propertyType || draft?.propertyType || 'Property type pending',
        nextAction: stage === SELLER_PIPELINE_STAGE.SELLER_LEAD
          ? 'Send Onboarding'
          : stage === SELLER_PIPELINE_STAGE.ONBOARDING_PENDING
            ? 'Awaiting Seller Completion'
            : stage === SELLER_PIPELINE_STAGE.ONBOARDING_COMPLETED
              ? 'Generate Mandate'
              : stage === SELLER_PIPELINE_STAGE.MANDATE_READY
                ? 'Send Mandate'
                : stage === SELLER_PIPELINE_STAGE.MANDATE_SENT
                  ? 'Awaiting Signature'
                  : 'Ready for Activation',
        sellerPortalLink,
        onboardingLink,
        canGenerateMandate,
      })
    })

    listingsInProgressRows.forEach((draft) => {
      if (consumedDraftIds.has(String(draft?.id || ''))) return
      const stage = normalizeSellerPipelineStage({ lead: null, draft })
      const sellerPortalLink = buildSellerPortalLink(draft?.sellerOnboarding?.token)
      rows.push({
        id: String(draft?.id || Math.random()),
        sellerLeadId: String(draft?.sellerLeadId || ''),
        lead: null,
        draft,
        stage,
        agentName: draft?.assignedAgentName || 'Unassigned',
        sellerName: draft?.seller?.name || 'Seller',
        sellerContact: draft?.seller?.phone || draft?.seller?.email || 'No contact details yet',
        propertyAddress: draft?.propertyAddress || draft?.listingTitle || 'Address pending',
        propertyType: draft?.propertyType || 'Property type pending',
        nextAction: stage === SELLER_PIPELINE_STAGE.MANDATE_SIGNED ? 'Ready for Activation' : 'Review Record',
        sellerPortalLink,
        onboardingLink: draft?.sellerOnboarding?.link || '',
        canGenerateMandate: false,
      })
    })

    return rows.sort((left, right) => {
      const leftDate = new Date(left?.draft?.updatedAt || left?.lead?.updatedAt || left?.lead?.createdAt || 0).getTime()
      const rightDate = new Date(right?.draft?.updatedAt || right?.lead?.updatedAt || right?.lead?.createdAt || 0).getTime()
      return rightDate - leftDate
    })
  }, [listingsInProgressRows, sellerLeadRows])

  const filteredSellerStockRows = useMemo(() => {
    if (sellerStageFilter === SELLER_PIPELINE_STAGE.ALL) return sellerStockRows
    return sellerStockRows.filter((row) => row.stage === sellerStageFilter)
  }, [sellerStageFilter, sellerStockRows])

  const grouped = useMemo(() => {
    return STATUS_COLUMNS.map((column) => ({
      ...column,
      leads: filteredLeads.filter((lead) => column.statuses.includes(lead.status)),
    }))
  }, [filteredLeads])

  const summaryCards = useMemo(() => {
    if (pipelineTab === 'sellers') {
      return [
        { key: SELLER_PIPELINE_STAGE.SELLER_LEAD, label: 'Seller Leads', value: sellerStockRows.filter((row) => row.stage === SELLER_PIPELINE_STAGE.SELLER_LEAD).length, tone: 'bg-[#f8fbff] text-[#31506a]' },
        { key: SELLER_PIPELINE_STAGE.ONBOARDING_PENDING, label: 'Onboarding Pending', value: sellerStockRows.filter((row) => row.stage === SELLER_PIPELINE_STAGE.ONBOARDING_PENDING).length, tone: 'bg-[#fff7ed] text-[#9a5b13]' },
        { key: SELLER_PIPELINE_STAGE.ONBOARDING_COMPLETED, label: 'Onboarding Completed', value: sellerStockRows.filter((row) => row.stage === SELLER_PIPELINE_STAGE.ONBOARDING_COMPLETED).length, tone: 'bg-[#e9f7ef] text-[#1f7d44]' },
        { key: SELLER_PIPELINE_STAGE.MANDATE_SENT, label: 'Mandate Sent', value: sellerStockRows.filter((row) => row.stage === SELLER_PIPELINE_STAGE.MANDATE_SENT).length, tone: 'bg-[#f7f9fc] text-[#5b7087]' },
        { key: SELLER_PIPELINE_STAGE.MANDATE_SIGNED, label: 'Mandate Signed', value: sellerStockRows.filter((row) => row.stage === SELLER_PIPELINE_STAGE.MANDATE_SIGNED).length, tone: 'bg-[#eef7f2] text-[#1c7d45]' },
      ]
    }

    const openPipeline = filteredLeads.filter((lead) => ['Active', 'Follow Up', 'Negotiating'].includes(lead.status)).length
    const followUps = filteredLeads.filter((lead) => lead.status === 'Follow Up').length
    const closed = filteredLeads.filter((lead) => ['Closed', 'Lost', 'Not Active'].includes(lead.status)).length

    return [
      { label: 'Total Leads', value: filteredLeads.length, tone: 'bg-[#f8fbff] text-[#31506a]' },
      { label: 'Open Pipeline', value: openPipeline, tone: 'bg-[#eef7f2] text-[#1c7d45]' },
      { label: 'Follow Ups', value: followUps, tone: 'bg-[#f7f9fc] text-[#5b7087]' },
      { label: 'Closed Outcomes', value: closed, tone: 'bg-[#fff7ed] text-[#9a5b13]' },
    ]
  }, [filteredLeads, pipelineTab, sellerStockRows])

  const selectedLeadProfile = useMemo(() => {
    if (!selectedLead) return null
    const { firstName, surname } = splitLeadName(selectedLead.name)
    const listingLink = selectedLead.developmentId
      ? `/developments/${selectedLead.developmentId}`
      : selectedLead.unitId
        ? `/agent/listings/${encodeURIComponent(selectedLead.unitId)}`
        : ''
    const listingLinkLabel = selectedLead.developmentId
      ? selectedLead.developmentName || 'Development workspace'
      : selectedLead.unitNumber || 'Private listing'
    return {
      firstName,
      surname,
      email: selectedLead.email || '—',
      phone: selectedLead.phone || '—',
      source: selectedLead.source || '—',
      listingLink,
      listingLinkLabel,
      enquiryDate: formatDateTime(selectedLead.createdAt),
      message: selectedLead.notes || 'No buyer message captured yet.',
      developmentName: selectedLead.developmentName || '—',
      unitNumber: selectedLead.unitNumber || '—',
    }
  }, [selectedLead])

  if (!isSupabaseConfigured) {
    return (
      <section className="space-y-5">
        <div className="rounded-[24px] border border-[#f6d4d4] bg-[#fff5f5] px-5 py-4 text-sm text-[#b42318]">
          Supabase is not configured for this workspace.
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="grid gap-2 md:grid-cols-2">
          {[
            { key: 'buyers', label: 'Buyers', copy: 'Lead capture and deal conversion' },
            { key: 'sellers', label: 'Sellers', copy: 'Seller → onboarding → mandate → activation' },
          ].map((tab) => {
            const active = pipelineTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setPipelineTab(tab.key)
                  setShowForm(false)
                  setWorkflowMessage('')
                  if (tab.key !== 'sellers') {
                    setSellerStageFilter(SELLER_PIPELINE_STAGE.ALL)
                  }
                }}
                className={`rounded-[18px] border px-4 py-3 text-left transition ${
                  active ? 'border-[#1f4f78] bg-[#1f4f78] text-white shadow-[0_10px_22px_rgba(31,79,120,0.18)]' : 'border-[#dbe6f2] bg-[#fbfcfe] text-[#35546c]'
                }`}
              >
                <span className="block text-sm font-semibold">{tab.label}</span>
                <span className={`mt-1 block text-xs ${active ? 'text-white/80' : 'text-[#7b8ca2]'}`}>{tab.copy}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className={`grid gap-3 sm:grid-cols-2 ${pipelineTab === 'sellers' ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
          {summaryCards.map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={() => {
                if (pipelineTab !== 'sellers') return
                setSellerStageFilter((previous) => (previous === card.key ? SELLER_PIPELINE_STAGE.ALL : card.key))
              }}
              className={`rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4 text-left transition ${
                pipelineTab === 'sellers' && sellerStageFilter === card.key ? 'ring-2 ring-[#1f4f78]/25 border-[#cfe0ef]' : ''
              } ${pipelineTab === 'sellers' ? 'hover:border-[#cadced] hover:shadow-[0_8px_20px_rgba(15,23,42,0.06)]' : ''}`}
            >
              <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{card.label}</span>
              <div className="mt-3 flex items-center justify-between gap-3">
                <strong className="text-[1.5rem] font-semibold tracking-[-0.03em] text-[#142132]">{card.value}</strong>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${card.tone}`}>
                  {pipelineTab === 'sellers' && sellerStageFilter === card.key ? 'Filtered' : 'Live'}
                </span>
              </div>
            </button>
          ))}
        </div>

        {pipelineTab === 'buyers' ? (
        <div className="mt-5 rounded-[22px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#35546c]">
            <Funnel size={15} />
            <span>Pipeline Filters</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Development</span>
              <Field
                as="select"
                value={filters.developmentId}
                onChange={(event) => setFilters((previous) => ({ ...previous, developmentId: event.target.value }))}
                disabled={workspace.id !== 'all'}
              >
                <option value="all">All Developments</option>
                {developmentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Status</span>
              <Field
                as="select"
                value={filters.status}
                onChange={(event) => setFilters((previous) => ({ ...previous, status: event.target.value }))}
              >
                <option value="all">All Statuses</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Source</span>
              <Field
                as="select"
                value={filters.source}
                onChange={(event) => setFilters((previous) => ({ ...previous, source: event.target.value }))}
              >
                <option value="all">All Sources</option>
                {SOURCE_OPTIONS.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </Field>
            </label>
          </div>
        </div>
        ) : (
          <div className="mt-5 rounded-[22px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-3 text-sm text-[#607387]">
            {pipelineTab === 'sellers'
              ? 'Track all properties from initial seller onboarding through mandate signing and activation.'
              : 'Buyer lead capture and conversion controls for the selected development scope.'}
          </div>
        )}
      </section>

      {error ? (
        <div className="rounded-[22px] border border-[#f6d4d4] bg-[#fff5f5] px-5 py-4 text-sm text-[#b42318]">
          {error}
        </div>
      ) : null}

      {workflowMessage ? (
        <div className="rounded-[22px] border border-[#d8ecdf] bg-[#eefbf3] px-5 py-4 text-sm text-[#1f7d44]">
          {workflowMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <LoadingSkeleton lines={10} />
        </div>
      ) : null}

      {!loading && showForm && pipelineTab === 'buyers' ? (
        <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-2">
            <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">Add Lead</h3>
            <p className="text-sm leading-7 text-[#6b7d93]">Capture a manual lead and drop it directly into the active pipeline.</p>
          </div>

          <form className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleCreateLead}>
            <label className="grid gap-2 xl:col-span-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Lead Name</span>
              <Field value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Client or entity name" />
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Phone</span>
              <Field value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} placeholder="+27 ..." />
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Email</span>
              <Field type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} placeholder="name@email.com" />
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Development</span>
              <Field
                as="select"
                value={form.developmentId}
                onChange={(event) => updateForm('developmentId', event.target.value)}
                disabled={workspace.id !== 'all'}
              >
                <option value="">Select development</option>
                {developmentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Unit Interested In</span>
              <Field as="select" value={form.unitId} onChange={(event) => updateForm('unitId', event.target.value)}>
                <option value="">Not selected</option>
                {unitOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    Unit {option.label}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Source</span>
              <Field as="select" value={form.source} onChange={(event) => updateForm('source', event.target.value)}>
                {SOURCE_OPTIONS.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Status</span>
              <Field as="select" value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-2 md:col-span-2 xl:col-span-4">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Notes</span>
              <Field as="textarea" rows={4} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} placeholder="Context, timing, objections, or next step." />
            </label>
            <div className="flex flex-wrap items-center gap-3 xl:col-span-4">
              <Button type="submit">
                <Plus size={16} />
                Save Lead
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {!loading && showForm && pipelineTab === 'sellers' ? (
        <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-2">
            <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-[#142132]">New Seller Lead</h3>
            <p className="text-sm leading-7 text-[#6b7d93]">Capture the seller once, then push onboarding and mandate collection to the seller portal.</p>
          </div>

          <form className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleCreateSellerLead}>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Seller Name</span>
              <Field value={sellerForm.sellerName} onChange={(event) => updateSellerForm('sellerName', event.target.value)} />
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Seller Surname</span>
              <Field value={sellerForm.sellerSurname} onChange={(event) => updateSellerForm('sellerSurname', event.target.value)} />
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Email</span>
              <Field type="email" value={sellerForm.sellerEmail} onChange={(event) => updateSellerForm('sellerEmail', event.target.value)} />
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Phone</span>
              <Field value={sellerForm.sellerPhone} onChange={(event) => updateSellerForm('sellerPhone', event.target.value)} />
            </label>
            <label className="grid gap-2 xl:col-span-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Property Address</span>
              <Field value={sellerForm.propertyAddress} onChange={(event) => updateSellerForm('propertyAddress', event.target.value)} />
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Property Type</span>
              <Field as="select" value={sellerForm.propertyType} onChange={(event) => updateSellerForm('propertyType', event.target.value)}>
                <option>House</option>
                <option>Apartment</option>
                <option>Townhouse</option>
                <option>Commercial</option>
                <option>Agricultural</option>
              </Field>
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Estimated Price</span>
              <Field type="number" min="0" step="1000" value={sellerForm.estimatedPrice} onChange={(event) => updateSellerForm('estimatedPrice', event.target.value)} />
            </label>
            <label className="grid gap-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Lead Source</span>
              <Field as="select" value={sellerForm.leadSource} onChange={(event) => updateSellerForm('leadSource', event.target.value)}>
                {SOURCE_OPTIONS.map((source) => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </Field>
            </label>
            <label className="grid gap-2 md:col-span-2 xl:col-span-4">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Notes</span>
              <Field as="textarea" rows={4} value={sellerForm.notes} onChange={(event) => updateSellerForm('notes', event.target.value)} />
            </label>
            <div className="flex flex-wrap items-center gap-3 xl:col-span-4">
              <Button type="submit">
                <Plus size={16} />
                Save Seller Lead
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      {!loading && pipelineTab === 'buyers' && viewMode === 'table' ? (
        <DataTable
          title="Lead Register"
          copy="Structured lead list across the selected development scope."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full border border-[#d9e3ef] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#5c738d]">
                {filteredLeads.length} leads
              </span>
              <ViewToggle
                items={[
                  { key: 'table', label: 'Table', icon: Table2 },
                  { key: 'board', label: 'Board', icon: KanbanSquare },
                ]}
                value={viewMode}
                onChange={setViewMode}
              />
              <Button onClick={() => setShowForm((previous) => !previous)}>
                <Plus size={16} />
                {showForm ? 'Close Lead Form' : 'New Lead'}
              </Button>
            </div>
          }
        >
          <DataTableInner>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Development</th>
                <th>Source</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="cursor-pointer transition hover:bg-[#f8fbff]"
                  onClick={() => openLeadDrawer(lead)}
                >
                  <td>
                    <div className="flex flex-col gap-1">
                      <strong className="text-sm font-semibold text-[#142132]">{lead.name}</strong>
                      <span className="text-sm text-[#6b7d93]">{lead.phone || lead.email || 'No contact details yet'}</span>
                      {lead.phone && lead.email ? <span className="text-sm text-[#6b7d93]">{lead.email}</span> : null}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <strong className="text-sm font-semibold text-[#142132]">{lead.developmentName || '-'}</strong>
                      <span className="text-sm text-[#6b7d93]">{lead.unitNumber && lead.unitNumber !== '-' ? `Unit ${lead.unitNumber}` : 'No unit linked'}</span>
                    </div>
                  </td>
                  <td>{lead.source}</td>
                  <td>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.78rem] font-semibold ${getStatusBadgeClass(lead.status)}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="max-w-[320px]">
                    <span className="line-clamp-2 text-sm text-[#51657b]">{lead.notes || 'No notes captured yet.'}</span>
                  </td>
                </tr>
              ))}
              {!filteredLeads.length ? (
                <tr>
                  <td colSpan={5}>
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                      <strong className="text-base font-semibold text-[#142132]">No leads for the selected filters.</strong>
                      <span className="text-sm text-[#6b7d93]">Adjust the development, source, or status filters, or add a new lead.</span>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </DataTableInner>
        </DataTable>
      ) : null}

      {!loading && pipelineTab === 'buyers' && viewMode === 'board' ? (
        <section className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-3 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full border border-[#d9e3ef] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#5c738d]">
                {filteredLeads.length} leads
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ViewToggle
                items={[
                  { key: 'table', label: 'Table', icon: Table2 },
                  { key: 'board', label: 'Board', icon: KanbanSquare },
                ]}
                value={viewMode}
                onChange={setViewMode}
              />
              <Button onClick={() => setShowForm((previous) => !previous)}>
                <Plus size={16} />
                {showForm ? 'Close Lead Form' : 'New Lead'}
              </Button>
            </div>
          </div>
          {grouped.map((column) => (
            <article
              className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]"
              key={column.id}
            >
              <header className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[1.05rem] font-semibold tracking-[-0.025em] text-[#142132]">{column.label}</h3>
                  <p className="mt-1 text-sm text-[#6b7d93]">Leads currently sitting in this lane.</p>
                </div>
                <span className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-full border border-[#d9e3ef] bg-[#f7f9fc] px-3 text-sm font-semibold text-[#5c738d]">
                  {column.leads.length}
                </span>
              </header>
              <div className="space-y-3">
                {column.leads.map((lead) => (
                  <article key={lead.id} className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <strong className="block text-base font-semibold text-[#142132]">{lead.name}</strong>
                        <p className="mt-1 text-sm text-[#6b7d93]">
                          {lead.developmentName} • {lead.unitNumber && lead.unitNumber !== '-' ? `Unit ${lead.unitNumber}` : 'No unit'}
                        </p>
                      </div>
                      <span className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-[0.78rem] font-semibold ${getStatusBadgeClass(lead.status)}`}>
                        {lead.status}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-[0.78rem] font-medium text-[#5b7087]">
                      <span className="rounded-full bg-white px-2.5 py-1">{lead.source}</span>
                      {lead.phone ? <span className="rounded-full bg-white px-2.5 py-1">{lead.phone}</span> : null}
                      {lead.email ? <span className="rounded-full bg-white px-2.5 py-1">{lead.email}</span> : null}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-[#51657b]">{lead.notes || 'No notes captured yet.'}</p>
                  </article>
                ))}
                {!column.leads.length ? (
                  <div className="rounded-[20px] border border-dashed border-[#d9e3ef] bg-[#fbfcfe] px-4 py-8 text-center text-sm text-[#6b7d93]">
                    No leads in this lane.
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {!loading && pipelineTab === 'sellers' ? (
        <DataTable
          title="Stock Pipeline"
          copy="Track all properties from initial seller onboarding through mandate signing and activation."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full border border-[#d9e3ef] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#5c738d]">
                {filteredSellerStockRows.length} records
              </span>
              {sellerStageFilter !== SELLER_PIPELINE_STAGE.ALL ? (
                <button
                  type="button"
                  onClick={() => setSellerStageFilter(SELLER_PIPELINE_STAGE.ALL)}
                  className="inline-flex items-center rounded-full border border-[#d9e3ef] bg-white px-3 py-1 text-[0.78rem] font-semibold text-[#35546c]"
                >
                  Clear filter
                </button>
              ) : null}
              <Button onClick={() => setShowForm((previous) => !previous)}>
                <Plus size={16} />
                {showForm ? 'Close Seller Form' : 'New Seller Lead'}
              </Button>
            </div>
          }
        >
          <DataTableInner>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Seller</th>
                <th>Address</th>
                <th>Stage</th>
                <th>Next Action</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSellerStockRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.agentName}</td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <strong className="text-sm font-semibold text-[#142132]">{row.sellerName}</strong>
                      <span className="text-sm text-[#6b7d93]">{row.sellerContact}</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <strong className="text-sm font-semibold text-[#142132]">{row.propertyAddress}</strong>
                      <span className="text-sm text-[#6b7d93]">{row.propertyType}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.78rem] font-semibold ${getSellerPipelineStageBadgeClass(row.stage)}`}>
                      {formatSellerPipelineStageLabel(row.stage)}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs text-[#35546c]">{row.nextAction}</span>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      {row.onboardingLink ? (
                        <a
                          href={row.onboardingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#1f4f78]"
                        >
                          View Seller
                          <ExternalLink size={12} />
                        </a>
                      ) : null}
                      {row.sellerPortalLink ? (
                        <a
                          href={row.sellerPortalLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#1f4f78]"
                        >
                          Open Client Portal
                          <ExternalLink size={12} />
                        </a>
                      ) : null}
                      {row.sellerPortalLink || row.onboardingLink ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const link = row.sellerPortalLink || row.onboardingLink
                            if (!link) return
                            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                              await navigator.clipboard.writeText(link)
                            }
                            setWorkflowMessage('Seller link copied.')
                          }}
                          className="inline-flex items-center rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]"
                        >
                          Copy Link
                        </button>
                      ) : null}
                      {row.lead && row.canGenerateMandate ? (
                        <Button size="sm" onClick={() => openMandateComposer(row.lead)}>
                          {row.stage === SELLER_PIPELINE_STAGE.MANDATE_READY ? 'Send Mandate' : 'Generate Mandate'}
                        </Button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleDeleteSellerPipelineRow(row)}
                        className="inline-flex items-center gap-1 rounded-full border border-[#f1c4c4] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#b42318] hover:bg-[#fff5f5]"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredSellerStockRows.length ? (
                <tr>
                  <td colSpan={6}>
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                      <strong className="text-base font-semibold text-[#142132]">No seller records yet.</strong>
                      <span className="text-sm text-[#6b7d93]">Create a seller lead to start onboarding and mandate progression.</span>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </DataTableInner>
        </DataTable>
      ) : null}

      {selectedLead ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-[#0f172a]/25"
            aria-label="Close lead profile panel"
            onClick={closeLeadDrawer}
          />
          <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-[460px] overflow-y-auto border-l border-[#dce6f2] bg-white px-5 py-6 shadow-[-16px_0_40px_rgba(15,23,42,0.16)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Lead Profile</h3>
                <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                  Review the enquiry, follow up, request a viewing, or convert this prospect into a live deal.
                </p>
              </div>
              <Button variant="ghost" onClick={closeLeadDrawer}>
                Close
              </Button>
            </div>

            <section className="mt-5 rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Lead Details</p>
              <h4 className="mt-2 text-[1.02rem] font-semibold text-[#142132]">{selectedLead.name}</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Name</p>
                  <p className="mt-1 text-sm text-[#22374d]">{selectedLeadProfile?.firstName}</p>
                </div>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Surname</p>
                  <p className="mt-1 text-sm text-[#22374d]">{selectedLeadProfile?.surname}</p>
                </div>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Email</p>
                  <p className="mt-1 break-all text-sm text-[#22374d]">{selectedLeadProfile?.email}</p>
                </div>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Phone</p>
                  <p className="mt-1 text-sm text-[#22374d]">{selectedLeadProfile?.phone}</p>
                </div>
              </div>
            </section>

            <section className="mt-4 rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Enquiry Details</p>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Listing Source</p>
                  <p className="mt-1 text-sm text-[#22374d]">{selectedLeadProfile?.source}</p>
                </div>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Listing Link</p>
                  {selectedLeadProfile?.listingLink ? (
                    <a
                      href={selectedLeadProfile.listingLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[#1f4f78]"
                    >
                      {selectedLeadProfile.listingLinkLabel}
                      <ExternalLink size={14} />
                    </a>
                  ) : (
                    <p className="mt-1 text-sm text-[#22374d]">No listing linked</p>
                  )}
                </div>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Date of Enquiry</p>
                  <p className="mt-1 text-sm text-[#22374d]">{selectedLeadProfile?.enquiryDate}</p>
                </div>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Message from Buyer</p>
                  <p className="mt-1 text-sm leading-6 text-[#51657b]">{selectedLeadProfile?.message}</p>
                </div>
              </div>
            </section>

            <section className="mt-4 rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Viewing History</p>
                <span className="rounded-full border border-[#dbe6f2] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                  {leadViewings.length} records
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {leadViewings.length ? leadViewings.map((viewing) => (
                  <article key={viewing.viewing_id} className="rounded-[14px] border border-[#dce6f2] bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#142132]">{viewing.listing_title || 'Listing'}</p>
                        <p className="mt-1 text-sm text-[#607387]">
                          {[viewing.proposed_date || 'Date pending', viewing.proposed_time || 'Time pending'].filter(Boolean).join(' • ')}
                        </p>
                        {viewing.notes ? <p className="mt-1 text-xs leading-5 text-[#6b7d93]">{viewing.notes}</p> : null}
                      </div>
                      <span className="rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                        {formatViewingStatusLabel(viewing.status)}
                      </span>
                    </div>
                  </article>
                )) : (
                  <div className="rounded-[14px] border border-dashed border-[#d9e3ef] bg-white px-4 py-5 text-sm text-[#607387]">
                    No viewing requests logged for this lead yet.
                  </div>
                )}
              </div>
            </section>

            <section className="mt-4 rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Lead Actions</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="min-h-[56px] h-auto whitespace-normal px-3 py-3 text-center text-[0.76rem] leading-4 text-[#22374d] sm:text-[0.8rem]"
                  onClick={() => {
                    const subject = encodeURIComponent(`Follow up on your property enquiry`)
                    const body = encodeURIComponent(`Hi ${selectedLeadProfile?.firstName || 'there'},\n\nFollowing up on your enquiry regarding ${selectedLeadProfile?.listingLinkLabel || 'the listing'}.\n\nRegards`)
                    window.open(`mailto:${selectedLead.email || ''}?subject=${subject}&body=${body}`, '_self')
                  }}
                >
                  <Mail size={14} />
                  Send Follow-Up Email
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="min-h-[56px] h-auto whitespace-normal px-3 py-3 text-center text-[0.76rem] leading-4 text-[#22374d] sm:text-[0.8rem]"
                  onClick={() => {
                    const phone = normalizeWhatsappPhone(selectedLead.phone)
                    const text = encodeURIComponent(`Hi ${selectedLeadProfile?.firstName || 'there'}, following up on your enquiry regarding ${selectedLeadProfile?.listingLinkLabel || 'the listing'}.`)
                    if (phone) {
                      window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener,noreferrer')
                    }
                  }}
                  disabled={!normalizeWhatsappPhone(selectedLead.phone)}
                >
                  <MessageCircle size={14} />
                  Send WhatsApp Follow-Up
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="min-h-[56px] h-auto whitespace-normal px-3 py-3 text-center text-[0.76rem] leading-4 text-[#22374d] sm:text-[0.8rem]"
                  onClick={() => setShowViewingRequestForm((current) => !current)}
                >
                  Request Viewing
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="min-h-[56px] h-auto whitespace-normal px-3 py-3 text-center text-[0.8rem] leading-4 sm:text-[0.84rem]"
                  onClick={() => setShowConvertForm(true)}
                >
                  Convert to Deal
                </Button>
              </div>

              {showViewingRequestForm ? (
                <div className="mt-4 grid gap-3 rounded-[14px] border border-[#dce6f2] bg-white p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid min-w-0 gap-2">
                      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Proposed Date</span>
                      <Field
                        type="date"
                        className="min-w-0"
                        value={viewingRequestForm.proposedDate}
                        onChange={(event) => setViewingRequestForm((prev) => ({ ...prev, proposedDate: event.target.value }))}
                      />
                    </label>
                    <label className="grid min-w-0 gap-2">
                      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Proposed Time</span>
                      <Field
                        type="time"
                        className="min-w-0"
                        value={viewingRequestForm.proposedTime}
                        onChange={(event) => setViewingRequestForm((prev) => ({ ...prev, proposedTime: event.target.value }))}
                      />
                    </label>
                    <label className="grid min-w-0 gap-2 sm:col-span-2">
                      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Alternative Time 1</span>
                      <Field
                        type="datetime-local"
                        className="min-w-0 text-[0.95rem]"
                        value={viewingRequestForm.alternativeTimeA}
                        onChange={(event) => setViewingRequestForm((prev) => ({ ...prev, alternativeTimeA: event.target.value }))}
                      />
                    </label>
                    <label className="grid min-w-0 gap-2 sm:col-span-2">
                      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Alternative Time 2</span>
                      <Field
                        type="datetime-local"
                        className="min-w-0 text-[0.95rem]"
                        value={viewingRequestForm.alternativeTimeB}
                        onChange={(event) => setViewingRequestForm((prev) => ({ ...prev, alternativeTimeB: event.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="grid gap-2">
                    <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Notes</span>
                    <Field as="textarea" rows={3} value={viewingRequestForm.notes} onChange={(event) => setViewingRequestForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Access instructions, parking, or availability notes." />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setShowViewingRequestForm(false)}>Cancel</Button>
                    <Button type="button" onClick={submitViewingFromLead}>Create Viewing Request</Button>
                  </div>
                </div>
              ) : null}

              {showConvertForm ? (
                <div className="mt-4 grid gap-3 rounded-[14px] border border-[#dce6f2] bg-white p-3">
                  <label className="grid gap-2">
                    <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Development / Private Listing</span>
                    <Field
                      as="select"
                      value={convertForm.targetType}
                      onChange={(event) =>
                        setConvertForm((previous) => ({
                          ...previous,
                          targetType: event.target.value,
                          developmentId: event.target.value === 'development' ? previous.developmentId : '',
                          unitId: event.target.value === 'development' ? previous.unitId : '',
                          privateListingId: event.target.value === 'private_listing' ? previous.privateListingId : '',
                        }))
                      }
                    >
                      <option value="development">Development</option>
                      <option value="private_listing">Private Listing</option>
                    </Field>
                  </label>

                  {convertForm.targetType === 'development' ? (
                    <>
                      <label className="grid gap-2">
                        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Development</span>
                        <Field
                          as="select"
                          value={convertForm.developmentId}
                          onChange={(event) =>
                            setConvertForm((previous) => ({
                              ...previous,
                              developmentId: event.target.value,
                              unitId: '',
                            }))
                          }
                        >
                          <option value="">Select development</option>
                          {developmentOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </Field>
                      </label>

                      <label className="grid gap-2">
                        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Unit / Property</span>
                        <Field
                          as="select"
                          value={convertForm.unitId}
                          onChange={(event) => setConvertForm((previous) => ({ ...previous, unitId: event.target.value }))}
                        >
                          <option value="">Select unit</option>
                          {convertUnitOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              Unit {option.label}
                            </option>
                          ))}
                        </Field>
                      </label>
                    </>
                  ) : (
                    <label className="grid gap-2">
                      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Unit / Property</span>
                      <Field
                        as="select"
                        value={convertForm.privateListingId}
                        onChange={(event) => setConvertForm((previous) => ({ ...previous, privateListingId: event.target.value }))}
                      >
                        <option value="">Select listing</option>
                        {privateListingOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.listingTitle}
                          </option>
                        ))}
                      </Field>
                    </label>
                  )}

                  <label className="grid gap-2">
                    <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Finance Type</span>
                    <Field
                      as="select"
                      value={convertForm.financeType}
                      onChange={(event) => setConvertForm((previous) => ({ ...previous, financeType: event.target.value }))}
                    >
                      <option value="cash">Cash</option>
                      <option value="bond">Bond</option>
                      <option value="combination">Hybrid</option>
                    </Field>
                  </label>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setShowConvertForm(false)} disabled={convertLoading}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleConvertLeadToDeal} disabled={convertLoading}>
                      {convertLoading ? 'Converting...' : 'Convert to Deal'}
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>

            {convertError ? (
              <div className="mt-4 rounded-[14px] border border-[#f5c2c0] bg-[#fff5f5] px-3.5 py-3 text-sm text-[#b42318]">
                {convertError}
              </div>
            ) : null}

            {convertResult ? (
              <div className="mt-4 rounded-[14px] border border-[#cde7d8] bg-[#eefbf3] px-3.5 py-3 text-sm text-[#1c7d45]">
                <p className="font-semibold">Deal created successfully.</p>
                <p className="mt-1">
                  {convertResult.developmentName} • Unit {convertResult.unitNumber || '-'} • {convertResult.buyerName}
                </p>
                {convertResult.onboardingUrl ? (
                  <p className="mt-1 break-all text-[#0f5132]">{convertResult.onboardingUrl}</p>
                ) : (
                  <p className="mt-1 text-[#0f5132]">Onboarding was triggered for this deal.</p>
                )}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button variant="ghost" onClick={closeLeadDrawer} disabled={convertLoading}>
                Cancel
              </Button>
            </div>
          </aside>
        </>
      ) : null}

      {showMandateModal && selectedMandateLead ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-[#0f172a]/35"
            aria-label="Close mandate modal"
            onClick={closeMandateComposer}
          />
          <section className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <article className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[24px] border border-[#dce6f2] bg-white shadow-[0_30px_70px_rgba(15,23,42,0.26)]">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e2ebf5] px-6 py-5">
                <div>
                  <h3 className="text-[1.18rem] font-semibold tracking-[-0.025em] text-[#142132]">Generate Mandate</h3>
                  <p className="mt-1 text-sm text-[#607387]">Review mandate terms, generate template output, and send to seller for review.</p>
                </div>
                <Button variant="ghost" onClick={closeMandateComposer} disabled={sendingMandate}>
                  Close
                </Button>
              </header>

              <div className="grid gap-5 px-6 py-5 lg:grid-cols-2">
                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Seller Details</h4>
                  <div className="mt-3 space-y-3 text-sm text-[#22374d]">
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Seller name(s)</p>
                      <p className="mt-1">{[selectedMandateLead?.sellerName, selectedMandateLead?.sellerSurname].filter(Boolean).join(' ') || 'Seller'}</p>
                    </div>
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Ownership type</p>
                      <p className="mt-1">
                        {formatMandateOwnershipType(selectedMandateLead?.sellerOnboarding?.formData?.ownershipType)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">ID / registration details</p>
                      <p className="mt-1 break-all">
                        {selectedMandateLead?.sellerOnboarding?.formData?.idNumber ||
                          selectedMandateLead?.sellerOnboarding?.formData?.companyRegistrationNumber ||
                          selectedMandateLead?.sellerOnboarding?.formData?.trustRegistrationNumber ||
                          'Not captured'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Contact details</p>
                      <p className="mt-1 break-all">{selectedMandateLead?.sellerEmail || 'No email'}</p>
                      <p className="mt-1">{selectedMandateLead?.sellerPhone || 'No phone'}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Property Details</h4>
                  <div className="mt-3 space-y-3 text-sm text-[#22374d]">
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Address</p>
                      <p className="mt-1">
                        {selectedMandateLead?.sellerOnboarding?.formData?.propertyAddress || selectedMandateLead?.propertyAddress || 'Not captured'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Property type</p>
                      <p className="mt-1">{selectedMandateLead?.sellerOnboarding?.formData?.propertyType || selectedMandateLead?.propertyType || 'Not captured'}</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-[12px] border border-[#dfe8f2] bg-white px-3 py-2">
                        <p className="text-[0.65rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Beds</p>
                        <p className="mt-1 font-semibold text-[#142132]">{selectedMandateLead?.sellerOnboarding?.formData?.bedrooms || '—'}</p>
                      </div>
                      <div className="rounded-[12px] border border-[#dfe8f2] bg-white px-3 py-2">
                        <p className="text-[0.65rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Baths</p>
                        <p className="mt-1 font-semibold text-[#142132]">{selectedMandateLead?.sellerOnboarding?.formData?.bathrooms || '—'}</p>
                      </div>
                      <div className="rounded-[12px] border border-[#dfe8f2] bg-white px-3 py-2">
                        <p className="text-[0.65rem] uppercase tracking-[0.08em] text-[#7b8ca2]">Floor size</p>
                        <p className="mt-1 font-semibold text-[#142132]">{selectedMandateLead?.sellerOnboarding?.formData?.floorSize || '—'}</p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4 lg:col-span-2">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Commercial Terms</h4>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <label className="grid gap-1.5">
                      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Mandate type</span>
                      <Field
                        as="select"
                        value={mandateDraft.mandateType}
                        onChange={(event) => setMandateDraft((previous) => ({ ...previous, mandateType: event.target.value }))}
                      >
                        {MANDATE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </Field>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Commission structure</span>
                      <Field
                        as="select"
                        value={mandateDraft.commissionStructure}
                        onChange={(event) =>
                          setMandateDraft((previous) => ({
                            ...previous,
                            commissionStructure: event.target.value,
                          }))
                        }
                      >
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed amount</option>
                      </Field>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Commission %</span>
                      <Field
                        type="number"
                        min="0"
                        step="0.01"
                        value={mandateDraft.commissionPercent}
                        onChange={(event) => setMandateDraft((previous) => ({ ...previous, commissionPercent: event.target.value }))}
                        disabled={mandateDraft.commissionStructure !== 'percentage'}
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Commission amount</span>
                      <Field
                        type="number"
                        min="0"
                        step="100"
                        value={mandateDraft.commissionAmount}
                        onChange={(event) => setMandateDraft((previous) => ({ ...previous, commissionAmount: event.target.value }))}
                        disabled={mandateDraft.commissionStructure !== 'fixed'}
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">VAT handling</span>
                      <Field
                        as="select"
                        value={mandateDraft.vatHandling}
                        onChange={(event) => setMandateDraft((previous) => ({ ...previous, vatHandling: event.target.value }))}
                      >
                        {VAT_HANDLING_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </Field>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Asking price</span>
                      <Field
                        type="number"
                        min="0"
                        step="1000"
                        value={mandateDraft.askingPrice}
                        onChange={(event) => setMandateDraft((previous) => ({ ...previous, askingPrice: event.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Mandate start date</span>
                      <Field
                        type="date"
                        value={mandateDraft.mandateStartDate}
                        onChange={(event) => setMandateDraft((previous) => ({ ...previous, mandateStartDate: event.target.value }))}
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Mandate expiry date</span>
                      <Field
                        type="date"
                        value={mandateDraft.mandateEndDate}
                        onChange={(event) => setMandateDraft((previous) => ({ ...previous, mandateEndDate: event.target.value }))}
                      />
                    </label>
                  </div>
                  <label className="mt-3 grid gap-1.5">
                    <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Special conditions</span>
                    <Field
                      as="textarea"
                      rows={3}
                      value={mandateDraft.specialConditions}
                      onChange={(event) => setMandateDraft((previous) => ({ ...previous, specialConditions: event.target.value }))}
                      placeholder="Capture additional terms for this mandate."
                    />
                  </label>
                  <div className="mt-3 rounded-[14px] border border-[#dbe6f2] bg-white px-3 py-2 text-sm text-[#51657b]">
                    Seller can review mandate terms and request changes/counter comments in portal, but cannot directly edit commission values.
                  </div>
                </section>
              </div>

              {mandateError ? (
                <div className="mx-6 mb-5 rounded-[14px] border border-[#f5c2c0] bg-[#fff5f5] px-3.5 py-3 text-sm text-[#b42318]">
                  {mandateError}
                </div>
              ) : null}

              <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-[#e2ebf5] px-6 py-4">
                <Button variant="ghost" onClick={closeMandateComposer} disabled={sendingMandate}>
                  Cancel
                </Button>
                <Button onClick={handleSendMandateToSeller} disabled={sendingMandate}>
                  {sendingMandate ? 'Sending...' : 'Send to Seller'}
                </Button>
              </footer>
            </article>
          </section>
        </>
      ) : null}
    </section>
  )
}

export default Pipeline
