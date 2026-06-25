import { ExternalLink, Copy } from 'lucide-react'
import { cloneElement, isValidElement, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createTransactionFromWizard,
  fetchDevelopmentOptions,
  resolveTransactionWhatsAppContacts,
  fetchUnitsForTransactionSetup,
} from '../lib/api'
import { fetchPartnersSnapshot, getPartnerAssignmentOptions } from '../lib/partnersRepository'
import { listUserPreferredPartnerRoutingRules } from '../lib/settingsApi'
import { resolveTransactionOnboardingLink } from '../lib/onboardingLinks'
import { useOrganisation } from '../context/OrganisationContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { parseEdgeFunctionError } from '../lib/edgeFunctions'
import { formatSouthAfricanWhatsAppNumber, sendWhatsAppNotification } from '../lib/whatsapp'
import {
  createTransactionPartnerInvitation,
  applyPartnerProspectToTransaction,
  filterPartnerProspectsForSearch,
  listPartnerProspects,
  validateTransactionPartnerInvitationDraft,
} from '../services/transactionPartnerInvitationService'
import { listTransactionPartnerConnectionOptions } from '../services/partnerNetworkService'
import Button from './ui/Button'
import Modal from './ui/Modal'

const STEPS = ['Transaction Setup']
const STEP_DESCRIPTIONS = [
  'Capture the property and client basics. Purchaser structure, finance setup, and supporting details will be completed on the onboarding link.',
]

function isPrivateTransactionType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return normalized === 'private_property' || normalized === 'private'
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function createInitialForm(initialDevelopmentId = '') {
  return {
    setup: {
      transactionType: 'developer_sale',
      propertyType: '',
      developmentId: initialDevelopmentId || '',
      unitId: '',
      propertyAddressLine1: '',
      propertyAddressLine2: '',
      suburb: '',
      city: '',
      province: '',
      postalCode: '',
      propertyDescription: '',
      allowIncomplete: false,
      buyerFirstName: '',
      buyerLastName: '',
      buyerPhone: '',
      buyerEmail: '',
      sellerName: '',
      sellerPhone: '',
      sellerEmail: '',
      salesPrice: '',
      financeType: 'cash',
      financeManagedBy: 'bond_originator',
      purchaserType: 'individual',
      saleDate: todayIso(),
      agentInvolved: false,
      assignedAgent: '',
      assignedAgentEmail: '',
    },
    finance: {
      proofOfFundsReceived: false,
      depositRequired: true,
      depositPaid: false,
      cashAmount: '',
      bondAmount: '',
      depositAmount: '',
      reservationRequired: null,
      reservationAmount: '',
      reservationStatus: 'not_required',
      bondOriginator: '',
      bondOriginatorEmail: '',
      bank: '',
      bondSubmitted: false,
      bondApproved: false,
      grantSigned: false,
      proceedToAttorneys: false,
      attorney: '',
      attorneyEmail: '',
      expectedTransferDate: '',
      nextAction: '',
    },
    status: {
      stage: 'Reserved',
      stageDate: todayIso(),
      riskStatus: 'On Track',
      nextAction: '',
      notes: '',
    },
  }
}

function toMoney(value) {
  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    return '-'
  }

  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(parsed)
}

function isUnitAvailableForTransaction(unit) {
  const normalizedStatus = String(unit?.status || '')
    .trim()
    .toLowerCase()

  return normalizedStatus === 'available' && !unit?.activeTransaction
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeLabel(value, fallback) {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function pickFirstValue(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim()
    if (normalized) {
      return normalized
    }
  }

  return ''
}

function createInitialPartnerInvitationDrafts() {
  return {
    transfer_attorney: {
      companyName: '',
      contactName: '',
      email: '',
      phone: '',
    },
    bond_originator: {
      companyName: '',
      contactName: '',
      email: '',
      phone: '',
    },
  }
}

function createInitialPartnerInvitationModes() {
  return {
    transfer_attorney: 'existing',
    bond_originator: 'existing',
  }
}

function createInitialPartnerProspectState() {
  return {
    transfer_attorney: null,
    bond_originator: null,
  }
}

function createInitialPartnerProspectQueries() {
  return {
    transfer_attorney: '',
    bond_originator: '',
  }
}

function createInitialPartnerConnectionOptions() {
  return {
    transfer_attorney: [],
    bond_originator: [],
  }
}

function mergePartnerConnectionOptions(connectionOptions = [], legacyOptions = []) {
  const byKey = new Map()
  const options = [...connectionOptions, ...legacyOptions]
  options.forEach((option) => {
    const key = option.organisationId || option.partnerOrganisationId || option.partnerOrganizationId || option.companyName || option.id
    if (!key) return
    const existing = byKey.get(key)
    if (
      !existing ||
      (!existing.preferredRoutingRuleId && (option.preferredRoutingRuleId || option.preferred || option.userId)) ||
      (!existing.userId && option.userId)
    ) {
      byKey.set(key, option)
    }
  })
  return [...byKey.values()]
}

function getActivePartnerInvitationDrafts(modes, drafts) {
  return ['transfer_attorney', 'bond_originator']
    .filter((roleType) => modes?.[roleType] === 'invite')
    .map((roleType) => ({
      roleType,
      ...(drafts?.[roleType] || {}),
    }))
}

function prospectToInvitationDraft(roleType, prospect = {}) {
  return {
    roleType,
    partnerProspectId: prospect.id || null,
    companyName: prospect.companyName || '',
    contactName: prospect.contactName || prospect.companyName || '',
    email: prospect.email || '',
    phone: prospect.phone || '',
  }
}

function Field({ label, error, hint, fullWidth = false, children }) {
  const control = isValidElement(children)
    ? cloneElement(children, {
        className: [
          'w-full rounded-[14px] border border-[#dde4ee] bg-white px-4 py-3 text-sm text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] outline-none transition duration-150 ease-out placeholder:text-slate-400 focus:border-[rgba(29,78,216,0.35)] focus:ring-4 focus:ring-[rgba(29,78,216,0.1)]',
          children.props.className || '',
        ]
          .join(' ')
          .trim(),
      })
    : children

  return (
    <label className={`${fullWidth ? 'md:col-span-2' : ''} flex min-w-0 flex-col gap-2 text-sm font-medium text-[#233247]`}>
      <span>{label}</span>
      {hint ? <small className="text-xs leading-5 text-[#6b7d93]">{hint}</small> : null}
      {control}
      {error ? <small className="text-xs font-medium text-[#b42318]">{error}</small> : null}
    </label>
  )
}

function PartnerProspectPicker({
  label,
  query,
  onQueryChange,
  prospects,
  selectedProspect,
  onSelect,
  loading,
}) {
  return (
    <div className="space-y-2">
      <Field label={label} hint="Search firms already referenced on Arch9. Selecting a pending firm pre-fills and resends the transaction invitation.">
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search by firm, contact, or email"
        />
      </Field>
      <div className="space-y-2">
        {loading ? <p className="rounded-[12px] border border-[#e3ebf4] bg-[#fbfdff] px-3 py-2 text-xs font-semibold text-[#6b7d93]">Loading reusable firms...</p> : null}
        {!loading && prospects.length ? (
          prospects.map((prospect) => {
            const selected = selectedProspect?.id === prospect.id
            return (
              <button
                key={prospect.id}
                type="button"
                className={`w-full rounded-[14px] border px-3 py-2.5 text-left transition ${
                  selected
                    ? 'border-[#142132] bg-[#f4f7fb] shadow-[0_10px_22px_rgba(15,23,42,0.08)]'
                    : 'border-[#e3ebf4] bg-white hover:border-[#cbd8e6] hover:bg-[#fbfdff]'
                }`}
                onClick={() => onSelect(prospect)}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <strong className="block truncate text-sm font-semibold text-[#142132]">{prospect.companyName}</strong>
                    <span className="mt-0.5 block truncate text-xs text-[#60758d]">
                      {prospect.contactName || prospect.email || 'No contact captured yet'}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${
                      prospect.status === 'joined'
                        ? 'bg-[#e8f7ee] text-[#1f7a45]'
                        : prospect.status === 'declined'
                          ? 'bg-[#fff1f0] text-[#b42318]'
                          : 'bg-[#eef4fb] text-[#35546c]'
                    }`}
                  >
                    {prospect.statusLabel}
                  </span>
                </span>
                <span className="mt-2 block text-xs text-[#7b8ba5]">
                  Used on {prospect.transactionCount || 0} transaction{Number(prospect.transactionCount || 0) === 1 ? '' : 's'}
                  {prospect.duplicateReviewStatus === 'possible_duplicate' ? ' • Possible duplicate' : ''}
                </span>
              </button>
            )
          })
        ) : null}
        {!loading && query.trim() && !prospects.length ? (
          <p className="rounded-[12px] border border-dashed border-[#d7e2ee] bg-[#fbfdff] px-3 py-2 text-xs leading-5 text-[#6b7d93]">
            No reusable firm found. Use Invite New to create the prospect from this transaction.
          </p>
        ) : null}
      </div>
    </div>
  )
}

function BooleanField({ label, value, onChange, error }) {
  return (
    <Field label={label} error={error}>
      <select value={value ? 'yes' : 'no'} onChange={(event) => onChange(event.target.value === 'yes')}>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </Field>
  )
}

function NewTransactionWizard({ open, onClose, initialDevelopmentId = '', onSaved }) {
  const navigate = useNavigate()
  const { role, workspace, workspaceType, profile, currentMembership } = useWorkspace()
  const { organisation } = useOrganisation()
  const [form, setForm] = useState(createInitialForm(initialDevelopmentId))
  const [developments, setDevelopments] = useState([])
  const [units, setUnits] = useState([])
  const [partnerSnapshot, setPartnerSnapshot] = useState(null)
  const [preferredRoutingRules, setPreferredRoutingRules] = useState([])
  const [loadingPartners, setLoadingPartners] = useState(false)
  const [partnerConnectionOptions, setPartnerConnectionOptions] = useState(createInitialPartnerConnectionOptions)
  const [loadingPartnerConnections, setLoadingPartnerConnections] = useState(false)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [loadingUnits, setLoadingUnits] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState('')
  const [createdTransaction, setCreatedTransaction] = useState(null)
  const [reservationDecisionTouched, setReservationDecisionTouched] = useState(false)
  const [partnerInvitationModes, setPartnerInvitationModes] = useState(createInitialPartnerInvitationModes)
  const [partnerInvitationDrafts, setPartnerInvitationDrafts] = useState(createInitialPartnerInvitationDrafts)
  const [partnerProspects, setPartnerProspects] = useState([])
  const [loadingPartnerProspects, setLoadingPartnerProspects] = useState(false)
  const [partnerProspectQueries, setPartnerProspectQueries] = useState(createInitialPartnerProspectQueries)
  const [selectedPartnerProspects, setSelectedPartnerProspects] = useState(createInitialPartnerProspectState)

  useEffect(() => {
    if (!open) {
      return
    }

    setErrors({})
    setSaveError('')
    setForm(createInitialForm(initialDevelopmentId))
    setCreatedTransaction(null)
    setReservationDecisionTouched(false)
    setPartnerInvitationModes(createInitialPartnerInvitationModes())
    setPartnerInvitationDrafts(createInitialPartnerInvitationDrafts())
    setPartnerConnectionOptions(createInitialPartnerConnectionOptions())
    setPartnerProspects([])
    setPartnerProspectQueries(createInitialPartnerProspectQueries())
    setSelectedPartnerProspects(createInitialPartnerProspectState())

    if (!isSupabaseConfigured) {
      return
    }

    async function loadDevelopments() {
      try {
        setLoadingMeta(true)
        const rows = await fetchDevelopmentOptions()
        setDevelopments(rows)
      } catch (error) {
        setSaveError(error.message)
      } finally {
        setLoadingMeta(false)
      }
    }

    void loadDevelopments()
  }, [open, initialDevelopmentId])

  useEffect(() => {
    if (!open) return
    let active = true

    async function loadPartners() {
      try {
        setLoadingPartners(true)
        const [snapshot, routingRules] = await Promise.all([
          fetchPartnersSnapshot({
            organisationId: organisation?.id || workspace?.id || '',
            workspaceType: organisation?.type || workspaceType || role,
            accessContext: {
              organisationId: organisation?.id || workspace?.id || '',
              role,
              profile,
              currentMembership,
            },
          }),
          listUserPreferredPartnerRoutingRules().catch(() => []),
        ])
        if (!active) return
        setPartnerSnapshot(snapshot)
        setPreferredRoutingRules(Array.isArray(routingRules) ? routingRules : [])
      } catch (error) {
        if (active) {
          console.warn('[NewTransactionWizard] partner defaults unavailable', error)
        }
      } finally {
        if (active) setLoadingPartners(false)
      }
    }

    void loadPartners()

    return () => {
      active = false
    }
  }, [currentMembership, open, organisation?.id, organisation?.type, profile, role, workspace?.id, workspaceType])

  useEffect(() => {
    if (!open || !isSupabaseConfigured) return
    const organizationId = organisation?.id || workspace?.id || ''
    if (!organizationId) return
    let active = true

    async function loadPartnerConnections() {
      try {
        setLoadingPartnerConnections(true)
        const [attorneyOptions, originatorOptions] = await Promise.all([
          listTransactionPartnerConnectionOptions({ organizationId, roleType: 'transfer_attorney' }),
          listTransactionPartnerConnectionOptions({ organizationId, roleType: 'bond_originator' }),
        ])
        if (!active) return
        setPartnerConnectionOptions({
          transfer_attorney: attorneyOptions,
          bond_originator: originatorOptions,
        })
      } catch (error) {
        if (active) {
          console.warn('[NewTransactionWizard] partner connections unavailable', error)
        }
      } finally {
        if (active) setLoadingPartnerConnections(false)
      }
    }

    void loadPartnerConnections()

    return () => {
      active = false
    }
  }, [open, organisation?.id, workspace?.id])

  useEffect(() => {
    if (!open || !isSupabaseConfigured) return
    let active = true

    async function loadPartnerProspects() {
      try {
        setLoadingPartnerProspects(true)
        const rows = await listPartnerProspects({ limit: 120 })
        if (active) setPartnerProspects(rows)
      } catch (error) {
        if (active) {
          console.warn('[NewTransactionWizard] partner prospects unavailable', error)
        }
      } finally {
        if (active) setLoadingPartnerProspects(false)
      }
    }

    void loadPartnerProspects()

    return () => {
      active = false
    }
  }, [open])

  useEffect(() => {
    if (!open || !form.setup.developmentId || !isSupabaseConfigured) {
      setUnits([])
      return
    }

    async function loadUnits() {
      try {
        setLoadingUnits(true)
        const rows = await fetchUnitsForTransactionSetup(form.setup.developmentId)
        setUnits(rows)
      } catch (error) {
        setSaveError(error.message)
      } finally {
        setLoadingUnits(false)
      }
    }

    void loadUnits()

    function refreshUnits() {
      void loadUnits()
    }

    window.addEventListener('itg:transaction-created', refreshUnits)
    window.addEventListener('itg:transaction-updated', refreshUnits)

    return () => {
      window.removeEventListener('itg:transaction-created', refreshUnits)
      window.removeEventListener('itg:transaction-updated', refreshUnits)
    }
  }, [open, form.setup.developmentId])

  useEffect(() => {
    if (!open) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onEscape(event) {
      if (event.key === 'Escape' && !saving) {
        onClose()
      }
    }

    document.addEventListener('keydown', onEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onEscape)
    }
  }, [open, onClose, saving])

  const selectedUnit = useMemo(
    () => units.find((unit) => unit.id === form.setup.unitId) || null,
    [units, form.setup.unitId],
  )
  const availableUnits = useMemo(() => units.filter((unit) => isUnitAvailableForTransaction(unit)), [units])
  const canChooseTransactionType = ['attorney', 'agent', 'developer', 'internal_admin'].includes(role)
  const isPrivateMatter = isPrivateTransactionType(form.setup.transactionType)

  const selectedDevelopment = useMemo(
    () => developments.find((development) => development.id === form.setup.developmentId) || null,
    [developments, form.setup.developmentId],
  )
  const developmentDefaultReservationAmount = useMemo(
    () => normalizeOptionalNumber(selectedDevelopment?.reservation_deposit_amount),
    [selectedDevelopment?.reservation_deposit_amount],
  )
  const selectedReservationAmount = useMemo(
    () => normalizeOptionalNumber(form.finance.reservationAmount),
    [form.finance.reservationAmount],
  )
  const hasDevelopmentReservationDefault =
    developmentDefaultReservationAmount !== null && developmentDefaultReservationAmount > 0
  const reservationUsesDevelopmentDefault =
    hasDevelopmentReservationDefault &&
    selectedReservationAmount !== null &&
    Number(selectedReservationAmount) === Number(developmentDefaultReservationAmount)
  const legacyAttorneyPartnerOptions = useMemo(
    () =>
      getPartnerAssignmentOptions(partnerSnapshot || {}, 'transfer_attorney', {
        organisationId: organisation?.id || workspace?.id || '',
        role,
        profile,
        currentMembership,
        userId: profile?.id || '',
        preferredPartnerRoutingRules: preferredRoutingRules,
      }),
    [currentMembership, organisation?.id, partnerSnapshot, preferredRoutingRules, profile, role, workspace?.id],
  )
  const legacyBondOriginatorPartnerOptions = useMemo(
    () =>
      getPartnerAssignmentOptions(partnerSnapshot || {}, 'bond_originator', {
        organisationId: organisation?.id || workspace?.id || '',
        role,
        profile,
        currentMembership,
        userId: profile?.id || '',
        preferredPartnerRoutingRules: preferredRoutingRules,
      }),
    [currentMembership, organisation?.id, partnerSnapshot, preferredRoutingRules, profile, role, workspace?.id],
  )
  const attorneyPartnerOptions = useMemo(
    () => mergePartnerConnectionOptions(partnerConnectionOptions.transfer_attorney, legacyAttorneyPartnerOptions),
    [legacyAttorneyPartnerOptions, partnerConnectionOptions.transfer_attorney],
  )
  const bondOriginatorPartnerOptions = useMemo(
    () => mergePartnerConnectionOptions(partnerConnectionOptions.bond_originator, legacyBondOriginatorPartnerOptions),
    [legacyBondOriginatorPartnerOptions, partnerConnectionOptions.bond_originator],
  )
  const selectedAttorneyPartner = useMemo(
    () => attorneyPartnerOptions.find((partner) => partner.id === form.finance.attorneyPartnerRelationshipId) || null,
    [attorneyPartnerOptions, form.finance.attorneyPartnerRelationshipId],
  )
  const selectedBondOriginatorPartner = useMemo(
    () => bondOriginatorPartnerOptions.find((partner) => partner.id === form.finance.bondOriginatorPartnerRelationshipId) || null,
    [bondOriginatorPartnerOptions, form.finance.bondOriginatorPartnerRelationshipId],
  )
  const attorneyPartnerProspects = useMemo(
    () =>
      filterPartnerProspectsForSearch(partnerProspects, {
        roleType: 'transfer_attorney',
        query: partnerProspectQueries.transfer_attorney,
        limit: 5,
      }),
    [partnerProspectQueries.transfer_attorney, partnerProspects],
  )
  const bondOriginatorPartnerProspects = useMemo(
    () =>
      filterPartnerProspectsForSearch(partnerProspects, {
        roleType: 'bond_originator',
        query: partnerProspectQueries.bond_originator,
        limit: 5,
      }),
    [partnerProspectQueries.bond_originator, partnerProspects],
  )

  useEffect(() => {
    if (!open || !partnerSnapshot) return
    setForm((previous) => {
      const defaultAttorney = attorneyPartnerOptions[0] || null
      const defaultBondOriginator = bondOriginatorPartnerOptions[0] || null
      const nextFinance = { ...previous.finance }
      let changed = false

      if (
        partnerInvitationModes.transfer_attorney === 'existing' &&
        defaultAttorney &&
        !nextFinance.attorney &&
        !nextFinance.attorneyPartnerRelationshipId
      ) {
        nextFinance.attorney = defaultAttorney.companyName
        nextFinance.attorneyEmail = defaultAttorney.email || ''
        nextFinance.attorneyPartnerRelationshipId = defaultAttorney.id
        changed = true
      }

      if (
        partnerInvitationModes.bond_originator === 'existing' &&
        defaultBondOriginator &&
        !nextFinance.bondOriginator &&
        !nextFinance.bondOriginatorPartnerRelationshipId
      ) {
        nextFinance.bondOriginator = defaultBondOriginator.companyName
        nextFinance.bondOriginatorEmail = defaultBondOriginator.email || ''
        nextFinance.bondOriginatorPartnerRelationshipId = defaultBondOriginator.id
        changed = true
      }

      return changed ? { ...previous, finance: nextFinance } : previous
    })
  }, [attorneyPartnerOptions, bondOriginatorPartnerOptions, open, partnerInvitationModes.bond_originator, partnerInvitationModes.transfer_attorney, partnerSnapshot])

  useEffect(() => {
    if (!open || !form.setup.developmentId || isPrivateMatter || reservationDecisionTouched) {
      return
    }

    const defaultRequired = Boolean(selectedDevelopment?.reservation_deposit_enabled_by_default)
    const defaultAmount =
      selectedDevelopment?.reservation_deposit_amount === null ||
      selectedDevelopment?.reservation_deposit_amount === undefined ||
      selectedDevelopment?.reservation_deposit_amount === ''
        ? ''
        : String(selectedDevelopment.reservation_deposit_amount)

    setForm((previous) => {
      if (previous.setup.transactionType !== 'developer_sale') {
        return previous
      }
      const nextReservationStatus = defaultRequired ? 'pending' : 'not_required'
      const nextReservationAmount = defaultRequired ? previous.finance.reservationAmount || defaultAmount : ''
      const nextReservationRequired = defaultRequired

      if (
        Boolean(previous.finance.reservationRequired) === nextReservationRequired &&
        String(previous.finance.reservationAmount || '') === String(nextReservationAmount || '') &&
        previous.finance.reservationStatus === nextReservationStatus
      ) {
        return previous
      }

      return {
        ...previous,
        finance: {
          ...previous.finance,
          reservationRequired: nextReservationRequired,
          reservationAmount: nextReservationAmount,
          reservationStatus: nextReservationStatus,
        },
      }
    })
  }, [
    open,
    form.setup.developmentId,
    form.setup.transactionType,
    isPrivateMatter,
    reservationDecisionTouched,
    selectedDevelopment?.reservation_deposit_amount,
    selectedDevelopment?.reservation_deposit_enabled_by_default,
  ])

  const developmentStats = useMemo(() => {
    const configuredUnits = units.length
    const activeTransactions = units.filter((unit) => Boolean(unit.activeTransaction)).length
    const availableUnitCount = units.filter((unit) => isUnitAvailableForTransaction(unit)).length

    return {
      configuredUnits,
      activeTransactions,
      availableUnits: availableUnitCount,
    }
  }, [units])

  const developmentSnapshotRows = useMemo(
    () => [
      {
        label: 'Planned Units',
        value: selectedDevelopment?.planned_units ?? '-',
      },
      {
        label: 'Configured Units',
        value: developmentStats.configuredUnits,
      },
      {
        label: 'Active Transactions',
        value: developmentStats.activeTransactions,
      },
      {
        label: 'Available Units',
        value: developmentStats.availableUnits,
      },
    ],
    [developmentStats.activeTransactions, developmentStats.availableUnits, developmentStats.configuredUnits, selectedDevelopment?.planned_units],
  )

  const hasContextSidebar = Boolean(
    (selectedDevelopment && !isPrivateMatter) ||
      (selectedUnit && !isPrivateMatter),
  )

  function setSetupField(field, value) {
    if (field === 'developmentId') {
      setReservationDecisionTouched(false)
    }
    if (field === 'transactionType' && !isPrivateTransactionType(value)) {
      setReservationDecisionTouched(false)
    }

    setForm((previous) => {
      if (field === 'transactionType') {
        const privateMatter = isPrivateTransactionType(value)
        return {
          ...previous,
          setup: {
            ...previous.setup,
            transactionType: value,
            propertyType: privateMatter ? previous.setup.propertyType : '',
            developmentId: privateMatter ? '' : previous.setup.developmentId,
            unitId: '',
            sellerName: privateMatter ? previous.setup.sellerName : '',
            sellerPhone: privateMatter ? previous.setup.sellerPhone : '',
            sellerEmail: privateMatter ? previous.setup.sellerEmail : '',
          },
        }
      }

      if (field === 'developmentId') {
        return {
          ...previous,
          setup: {
            ...previous.setup,
            developmentId: value,
            unitId: '',
          },
        }
      }

      if (field === 'agentInvolved') {
        return {
          ...previous,
          setup: {
            ...previous.setup,
            agentInvolved: Boolean(value),
            assignedAgent: value ? previous.setup.assignedAgent : '',
            assignedAgentEmail: value ? previous.setup.assignedAgentEmail : '',
          },
        }
      }

      return {
        ...previous,
        setup: {
          ...previous.setup,
          [field]: value,
        },
      }
    })
  }

  function setFinanceField(field, value) {
    setForm((previous) => ({
      ...previous,
      finance: {
        ...previous.finance,
        [field]: value,
      },
    }))
  }

  function selectPartnerField(field, partnerId) {
    if (partnerId === '__add_partner__') {
      onClose?.()
      navigate('/partners')
      return
    }

    const partner =
      field === 'attorneyPartnerRelationshipId'
        ? attorneyPartnerOptions.find((item) => item.id === partnerId)
        : bondOriginatorPartnerOptions.find((item) => item.id === partnerId)
    const roleType = field === 'attorneyPartnerRelationshipId' ? 'transfer_attorney' : 'bond_originator'

    setSelectedPartnerProspects((previous) => ({
      ...previous,
      [roleType]: null,
    }))

    setForm((previous) => ({
      ...previous,
      finance: {
        ...previous.finance,
        [field]: partnerId,
        ...(field === 'attorneyPartnerRelationshipId'
          ? {
              attorney: partner?.companyName || '',
              attorneyEmail: partner?.email || '',
            }
          : {
              bondOriginator: partner?.companyName || '',
              bondOriginatorEmail: partner?.email || '',
            }),
      },
    }))
  }

  function setPartnerProspectQuery(roleType, value) {
    setPartnerProspectQueries((previous) => ({
      ...previous,
      [roleType]: value,
    }))
  }

  function selectPartnerProspect(roleType, prospect) {
    setSelectedPartnerProspects((previous) => ({
      ...previous,
      [roleType]: prospect,
    }))

    setForm((previous) => {
      const nextFinance = { ...previous.finance }
      if (roleType === 'transfer_attorney') {
        nextFinance.attorney = prospect?.companyName || ''
        nextFinance.attorneyEmail = prospect?.email || ''
        nextFinance.attorneyPartnerRelationshipId = ''
      }
      if (roleType === 'bond_originator') {
        nextFinance.bondOriginator = prospect?.companyName || ''
        nextFinance.bondOriginatorEmail = prospect?.email || ''
        nextFinance.bondOriginatorPartnerRelationshipId = ''
      }
      return { ...previous, finance: nextFinance }
    })
  }

  function setPartnerInvitationMode(roleType, mode) {
    const normalizedMode = mode === 'invite' ? 'invite' : 'existing'
    setPartnerInvitationModes((previous) => ({
      ...previous,
      [roleType]: normalizedMode,
    }))
    if (normalizedMode === 'invite') {
      setSelectedPartnerProspects((previous) => ({
        ...previous,
        [roleType]: null,
      }))
    }

    setForm((previous) => {
      const nextFinance = { ...previous.finance }
      if (roleType === 'transfer_attorney') {
        nextFinance.attorneyPartnerRelationshipId = ''
        if (normalizedMode === 'invite') {
          nextFinance.attorney = partnerInvitationDrafts.transfer_attorney.companyName
          nextFinance.attorneyEmail = partnerInvitationDrafts.transfer_attorney.email
        }
      }
      if (roleType === 'bond_originator') {
        nextFinance.bondOriginatorPartnerRelationshipId = ''
        if (normalizedMode === 'invite') {
          nextFinance.bondOriginator = partnerInvitationDrafts.bond_originator.companyName
          nextFinance.bondOriginatorEmail = partnerInvitationDrafts.bond_originator.email
        }
      }
      return { ...previous, finance: nextFinance }
    })
  }

  function setPartnerInvitationDraftField(roleType, field, value) {
    setPartnerInvitationDrafts((previous) => ({
      ...previous,
      [roleType]: {
        ...(previous[roleType] || {}),
        [field]: value,
      },
    }))

    if (field === 'companyName' || field === 'email') {
      setForm((previous) => {
        const nextFinance = { ...previous.finance }
        if (roleType === 'transfer_attorney' && partnerInvitationModes.transfer_attorney === 'invite') {
          if (field === 'companyName') nextFinance.attorney = value
          if (field === 'email') nextFinance.attorneyEmail = value
          nextFinance.attorneyPartnerRelationshipId = ''
        }
        if (roleType === 'bond_originator' && partnerInvitationModes.bond_originator === 'invite') {
          if (field === 'companyName') nextFinance.bondOriginator = value
          if (field === 'email') nextFinance.bondOriginatorEmail = value
          nextFinance.bondOriginatorPartnerRelationshipId = ''
        }
        return { ...previous, finance: nextFinance }
      })
    }
  }

  function setReservationRequired(required) {
    setReservationDecisionTouched(true)
    setForm((previous) => ({
      ...previous,
      finance: {
        ...previous.finance,
        reservationRequired: required,
        reservationAmount: required ? previous.finance.reservationAmount : '',
        reservationStatus: required
          ? previous.finance.reservationStatus === 'not_required'
            ? 'pending'
            : previous.finance.reservationStatus
          : 'not_required',
      },
    }))
  }

  function validateStep(targetStep) {
    const nextErrors = {}

    if (targetStep === 0) {
      if (isPrivateMatter) {
        if (!form.setup.propertyType) {
          nextErrors.propertyType = 'Select a property category.'
        }
        if (!form.setup.propertyAddressLine1.trim()) {
          nextErrors.propertyAddressLine1 = 'Property address is required.'
        }
        if (!form.setup.city.trim()) {
          nextErrors.city = 'City is required.'
        }
      } else {
        if (!form.setup.developmentId) {
          nextErrors.developmentId = 'Select a development.'
        }

        if (!form.setup.unitId) {
          nextErrors.unitId = 'Select a unit.'
        }
      }

      if (!form.setup.allowIncomplete) {
        if (!form.setup.buyerFirstName.trim()) {
          nextErrors.buyerFirstName = 'Client first name is required.'
        }

        if (!form.setup.buyerLastName.trim()) {
          nextErrors.buyerLastName = 'Client surname is required.'
        }

        const price = Number(form.setup.salesPrice)
        if (!form.setup.salesPrice || Number.isNaN(price) || price <= 0) {
          nextErrors.salesPrice = 'Enter a valid sales price.'
        }
      } else if (form.setup.salesPrice) {
        const draftPrice = Number(form.setup.salesPrice)
        if (Number.isNaN(draftPrice) || draftPrice <= 0) {
          nextErrors.salesPrice = 'Enter a valid sales price.'
        }
      }

      if (form.finance.reservationRequired) {
        const reservationAmount = Number(form.finance.reservationAmount)
        if (!form.finance.reservationAmount || Number.isNaN(reservationAmount) || reservationAmount <= 0) {
          nextErrors.reservationAmount = 'Enter a valid reservation deposit amount.'
        }
      }

      if (!form.setup.allowIncomplete && !form.setup.buyerEmail.trim()) {
        nextErrors.buyerEmail = 'Client email is required.'
      } else if (form.setup.buyerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.setup.buyerEmail)) {
        nextErrors.buyerEmail = 'Enter a valid email address.'
      }

      if (!form.setup.allowIncomplete && !form.setup.buyerPhone.trim()) {
        nextErrors.buyerPhone = 'Client phone is required.'
      }

      if (isPrivateMatter && form.setup.sellerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.setup.sellerEmail)) {
        nextErrors.sellerEmail = 'Enter a valid seller email address.'
      }

      if (form.setup.agentInvolved && form.setup.assignedAgentEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.setup.assignedAgentEmail)) {
        nextErrors.assignedAgentEmail = 'Enter a valid agent email address.'
      }

      for (const draft of getActivePartnerInvitationDrafts(partnerInvitationModes, partnerInvitationDrafts)) {
        const validation = validateTransactionPartnerInvitationDraft(draft)
        Object.entries(validation.errors).forEach(([field, message]) => {
          nextErrors[`${draft.roleType}.${field}`] = message
        })
      }
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const onboardingUrl = createdTransaction?.onboardingToken
    ? `${window.location.origin}/client/onboarding/${createdTransaction.onboardingToken}`
    : ''

  function handleCopyOnboardingLink() {
    if (!onboardingUrl) {
      setSaveError('Onboarding link is not available for this transaction yet.')
      return
    }

    navigator.clipboard.writeText(onboardingUrl).catch(() => {
      setSaveError('Unable to copy onboarding link. Please copy it directly from the popup.')
    })
  }

  async function handleSave() {
    if (!validateStep(0)) {
      return
    }

    try {
      setSaveError('')
      setSaving(true)
      const buyerName = `${form.setup.buyerFirstName} ${form.setup.buyerLastName}`.trim()
      const activePartnerInvitations = getActivePartnerInvitationDrafts(partnerInvitationModes, partnerInvitationDrafts)
      const activePartnerProspects = ['transfer_attorney', 'bond_originator']
        .map((roleType) => ({
          roleType,
          prospect: partnerInvitationModes[roleType] === 'existing' ? selectedPartnerProspects[roleType] : null,
        }))
        .filter((item) => Boolean(item.prospect?.id))
      const financeForSave = {
        ...form.finance,
      }
      const invitedTransferAttorney = activePartnerInvitations.find((item) => item.roleType === 'transfer_attorney')
      const invitedBondOriginator = activePartnerInvitations.find((item) => item.roleType === 'bond_originator')
      const prospectTransferAttorney = activePartnerProspects.find((item) => item.roleType === 'transfer_attorney')?.prospect
      const prospectBondOriginator = activePartnerProspects.find((item) => item.roleType === 'bond_originator')?.prospect
      if (invitedTransferAttorney) {
        financeForSave.attorney = invitedTransferAttorney.companyName
        financeForSave.attorneyEmail = invitedTransferAttorney.email
        financeForSave.attorneyPartnerRelationshipId = ''
      } else if (prospectTransferAttorney) {
        financeForSave.attorney = prospectTransferAttorney.companyName
        financeForSave.attorneyEmail = prospectTransferAttorney.email || ''
        financeForSave.attorneyPartnerRelationshipId = ''
      }
      if (invitedBondOriginator) {
        financeForSave.bondOriginator = invitedBondOriginator.companyName
        financeForSave.bondOriginatorEmail = invitedBondOriginator.email
        financeForSave.bondOriginatorPartnerRelationshipId = ''
      } else if (prospectBondOriginator) {
        financeForSave.bondOriginator = prospectBondOriginator.companyName
        financeForSave.bondOriginatorEmail = prospectBondOriginator.email || ''
        financeForSave.bondOriginatorPartnerRelationshipId = ''
      }
      const hierarchyScope = {
        regionId: currentMembership?.regionId || currentMembership?.region_id || '',
        branchId:
          currentMembership?.primaryBranchId ||
          currentMembership?.primary_branch_id ||
          currentMembership?.branchId ||
          currentMembership?.branch_id ||
          '',
      }
      const result = await createTransactionFromWizard({
        setup: {
          ...form.setup,
          buyerName,
        },
        finance: financeForSave,
        status: {
          ...form.status,
          nextAction: form.status.nextAction || (form.setup.allowIncomplete ? 'Complete stakeholder setup and assign legal roles.' : 'Send onboarding link to client.'),
        },
        options: {
          allowIncomplete: Boolean(form.setup.allowIncomplete),
          hierarchyScope,
          rolePlayers: [
            partnerInvitationModes.transfer_attorney === 'existing' && selectedAttorneyPartner
              ? {
                  roleType: 'transfer_attorney',
                  source: 'connected_partner',
                  selectionSource:
                    selectedAttorneyPartner.preferredRoutingRuleId || selectedAttorneyPartner.relationshipType === 'preferred'
                      ? 'preferred_partner'
                      : 'connected_partner',
                  preferredPartnerId: null,
                  partnerRelationshipId: selectedAttorneyPartner.relationshipId,
                  partnerConnectionId: selectedAttorneyPartner.connectionId || null,
                  partnerOrganisationId: selectedAttorneyPartner.organisationId,
                  userId: selectedAttorneyPartner.userId || null,
                  partner: {
                    companyName: selectedAttorneyPartner.companyName,
                    contactPerson: selectedAttorneyPartner.contactPerson || selectedAttorneyPartner.companyName,
                    email: selectedAttorneyPartner.email,
                    userId: selectedAttorneyPartner.userId || null,
                    partnerConnectionId: selectedAttorneyPartner.connectionId || null,
                  },
                }
              : null,
            partnerInvitationModes.bond_originator === 'existing' && selectedBondOriginatorPartner
              ? {
                  roleType: 'bond_originator',
                  source: 'connected_partner',
                  selectionSource:
                    selectedBondOriginatorPartner.preferredRoutingRuleId || selectedBondOriginatorPartner.relationshipType === 'preferred'
                      ? 'preferred_partner'
                      : 'connected_partner',
                  preferredPartnerId: null,
                  partnerRelationshipId: selectedBondOriginatorPartner.relationshipId,
                  partnerConnectionId: selectedBondOriginatorPartner.connectionId || null,
                  partnerOrganisationId: selectedBondOriginatorPartner.organisationId,
                  userId: selectedBondOriginatorPartner.userId || null,
                  partner: {
                    companyName: selectedBondOriginatorPartner.companyName,
                    contactPerson: selectedBondOriginatorPartner.contactPerson || selectedBondOriginatorPartner.companyName,
                    email: selectedBondOriginatorPartner.email,
                    userId: selectedBondOriginatorPartner.userId || null,
                    partnerConnectionId: selectedBondOriginatorPartner.connectionId || null,
                  },
                }
              : null,
          ].filter(Boolean),
        },
      })

      const partnerInvitationResults = []
      const partnerInvitationWarnings = []
      const partnerProspectResults = []
      for (const { roleType, prospect } of activePartnerProspects) {
        try {
          if (prospect.status === 'joined' && prospect.bridgeUserId) {
            const reuseResult = await applyPartnerProspectToTransaction({
              transactionId: result.transactionId,
              partnerProspectId: prospect.id,
              roleType,
            })
            partnerProspectResults.push({ roleType, prospect, result: reuseResult })
            continue
          }

          const invitationDraft = prospectToInvitationDraft(roleType, prospect)
          const invitationResult = await createTransactionPartnerInvitation({
            transactionId: result.transactionId,
            ...invitationDraft,
            metadata: {
              source: 'partner_prospect_reuse',
              buyerName,
              partnerProspectId: prospect.id,
            },
          })
          partnerInvitationResults.push(invitationResult)
          partnerProspectResults.push({ roleType, prospect, invitation: invitationResult.invitation })
          if (invitationResult.emailResult?.sent === false || invitationResult.emailResult?.error) {
            partnerInvitationWarnings.push(
              `${prospect.companyName}: prospect reused, but email delivery needs attention.`,
            )
          }
        } catch (prospectError) {
          partnerInvitationWarnings.push(
            `${prospect.companyName || prospect.email}: ${prospectError.message || 'partner prospect could not be reused.'}`,
          )
        }
      }
      for (const draft of activePartnerInvitations) {
        try {
          const invitationResult = await createTransactionPartnerInvitation({
            transactionId: result.transactionId,
            ...draft,
            metadata: {
              source: 'new_transaction_wizard',
              buyerName,
            },
          })
          partnerInvitationResults.push(invitationResult)
          if (invitationResult.emailResult?.sent === false || invitationResult.emailResult?.error) {
            partnerInvitationWarnings.push(
              `${draft.companyName}: invitation saved, but email delivery needs attention.`,
            )
          }
        } catch (invitationError) {
          partnerInvitationWarnings.push(
            `${draft.companyName || draft.email}: ${invitationError.message || 'invitation could not be created.'}`,
          )
        }
      }

      let onboarding = result?.onboardingToken
        ? {
            token: result.onboardingToken,
            url: `${window.location.origin}/client/onboarding/${result.onboardingToken}`,
          }
        : { token: '', url: '' }
      if (!onboarding.token) {
        try {
          // Existing createTransactionFromWizard flow already creates/ensures transaction_onboarding.
          onboarding = await resolveTransactionOnboardingLink({
            transactionId: result.transactionId,
            purchaserType: form.setup.purchaserType,
          })
        } catch (onboardingError) {
          if (!form.setup.allowIncomplete) {
            throw onboardingError
          }
        }
      }

      try {
        if (onboarding?.url) {
          await navigator.clipboard.writeText(onboarding.url)
        }
      } catch {
        // Keep the generated link visible in the success state if clipboard access is unavailable.
      }

      window.dispatchEvent(new CustomEvent('itg:transaction-created', { detail: result }))
      onSaved?.(result)

      setCreatedTransaction({
        ...result,
        onboardingToken: onboarding.token,
        buyerName,
        buyerEmail: form.setup.buyerEmail.trim(),
        allowIncomplete: Boolean(form.setup.allowIncomplete),
        onboardingEmailSent: null,
        partnerInvitations: partnerInvitationResults,
        partnerProspects: partnerProspectResults,
        partnerInvitationWarnings,
      })

      // Do not block transaction creation UX on post-create email automation.
      void (async () => {
        let onboardingEmailError = ''
        if (!form.setup.buyerEmail.trim()) {
          onboardingEmailError = 'Transaction created, but onboarding email was not sent because buyer email is blank.'
        } else if (!supabase) {
          onboardingEmailError = 'Transaction created, but onboarding email was not sent because Supabase is not configured in this environment.'
        } else {
          const { error: invokeError } = await invokeEdgeFunction('send-email', {
            body: {
              type: 'client_onboarding',
              transactionId: result.transactionId,
            },
          })

          if (invokeError) {
            onboardingEmailError = await parseEdgeFunctionError(
              invokeError,
              'Transaction created, but onboarding email failed to send.',
            )
          }
        }

        let reservationDepositEmailError = ''
        if (result?.reservationRequired) {
          if (!supabase) {
            reservationDepositEmailError = 'Transaction created, but reservation deposit email was not sent because Supabase is not configured in this environment.'
          } else {
            const { data: reservationEmailResult, error: reservationInvokeError } = await invokeEdgeFunction('send-email', {
              body: {
                type: 'reservation_deposit',
                transactionId: result.transactionId,
                resend: false,
                source: 'transaction_created',
              },
            })

            if (reservationInvokeError) {
              reservationDepositEmailError = await parseEdgeFunctionError(
                reservationInvokeError,
                'Transaction created, but reservation deposit email failed to send.',
              )
            } else if (reservationEmailResult?.sent === false) {
              const reason = String(reservationEmailResult?.reason || '').trim()
              reservationDepositEmailError =
                reservationEmailResult?.error ||
                (reason
                  ? `Transaction created, but reservation deposit email was skipped (${reason}).`
                  : 'Transaction created, but reservation deposit email was skipped.')
            }
          }
        }

        try {
          const whatsappContext = await resolveTransactionWhatsAppContacts(result.transactionId)
          const developmentName = normalizeLabel(selectedDevelopment?.name, 'the development')
          const unitReference = normalizeLabel(selectedUnit?.unit_number ? `Unit ${selectedUnit.unit_number}` : '', 'the property')
          const clientName = normalizeLabel(buyerName, 'Client')
          const onboardingLink = normalizeLabel(onboarding?.url, '')
          const clientPhoneFromForm = normalizeLabel(form.setup.buyerPhone, '')
          const clientPhoneFromResolvedContext = normalizeLabel(whatsappContext?.client?.phone, '')
          const resolvedClientPhoneRaw = pickFirstValue(
            clientPhoneFromForm,
            clientPhoneFromResolvedContext,
          )
          const clientPhone = formatSouthAfricanWhatsAppNumber(resolvedClientPhoneRaw)
          const developerPhone = normalizeLabel(whatsappContext?.developer?.phone, '')
          const attorneyPhone = normalizeLabel(whatsappContext?.attorney?.phone, '')
          const agentPhone = normalizeLabel(whatsappContext?.agent?.phone, '')
          const agentName = normalizeLabel(form.setup.assignedAgent || whatsappContext?.agent?.name, 'Unassigned')
          const shouldNotifyTransactionOwner = Boolean(
            form.setup.agentInvolved ||
            normalizeLabel(form.setup.assignedAgent, '') ||
            normalizeLabel(form.setup.assignedAgentEmail, '') ||
            agentName !== 'Unassigned' ||
            agentPhone,
          )

          console.log('[WhatsApp Debug] transaction-created role phones', {
            transactionId: result.transactionId,
            clientPhoneFromForm,
            clientPhoneFromResolvedContext,
            resolvedClientPhoneRaw,
            clientPhone,
            developerPhone,
            attorneyPhone,
            agentPhone,
            shouldNotifyTransactionOwner,
          })

          const clientMessage = [
            `Hi ${clientName},`,
            '',
            `Congratulations on taking the next step toward securing your property at ${developmentName} – ${unitReference}.`,
            '',
            'Arch9 is your central transaction platform. It brings together your agent, developer, and attorney into one place, so you always know what’s happening and what’s required next.',
            '',
            'To get started, please complete your onboarding here:',
            onboardingLink || '[Onboarding link unavailable]',
            '',
            'This onboarding will allow us to:',
            '• Capture your details accurately',
            '• Prepare your sale agreement (OTP)',
            '• Begin the next steps in your transaction',
            '',
            'If you have any questions along the way, you’ll be guided step-by-step.',
            '',
            '– Arch9',
          ].join('\n')

          console.log('[WhatsApp Debug] client onboarding payload', {
            transactionId: result.transactionId,
            clientName,
            clientPhone,
            onboardingLink,
            developmentName,
            unitReference,
          })

          console.log('WhatsApp trigger: onboarding link generated', {
            transactionId: result.transactionId,
            clientPhone,
          })

          if (!clientPhone) {
            console.warn('WhatsApp client onboarding skipped: missing phone', {
              transactionId: result.transactionId,
              clientPhoneFromForm,
              clientPhoneFromResolvedContext,
            })
          } else {
            console.log('WhatsApp client onboarding send attempt', {
              transactionId: result.transactionId,
              clientPhone,
            })
            const whatsappResult = await sendWhatsAppNotification({
              to: clientPhone,
              message: clientMessage,
              role: 'client',
            })
            if (whatsappResult?.ok) {
              console.log('WhatsApp client onboarding sent', {
                transactionId: result.transactionId,
                clientPhone,
                result: whatsappResult,
              })
            } else if (whatsappResult?.skipped) {
              console.warn('WhatsApp client onboarding skipped: missing phone', {
                transactionId: result.transactionId,
                clientPhone,
                reason: whatsappResult?.reason || 'unknown',
              })
            } else {
              console.error('WhatsApp client onboarding failed', {
                transactionId: result.transactionId,
                clientPhone,
                error: whatsappResult?.error || whatsappResult,
              })
            }
          }

          if (shouldNotifyTransactionOwner) {
            console.log('[WhatsApp Debug] send attempt', {
              transactionId: result.transactionId,
              role: 'transaction_owner',
              phone: developerPhone,
            })
            const transactionOwnerResult = await sendWhatsAppNotification({
              to: developerPhone,
              message: `New transaction created for ${unitReference} at ${developmentName}.\n\nClient: ${clientName}\nAgent: ${agentName}\n\nThe client onboarding link has been generated.`,
              role: 'transaction_owner',
            })
            if (transactionOwnerResult?.ok) {
              console.log('WhatsApp transaction owner notification sent', {
                transactionId: result.transactionId,
                phone: developerPhone,
              })
            } else if (transactionOwnerResult?.skipped) {
              console.warn('WhatsApp transaction owner notification skipped', {
                transactionId: result.transactionId,
                phone: developerPhone,
                reason: transactionOwnerResult?.reason || 'unknown',
              })
            } else {
              console.error('WhatsApp transaction owner notification failed', {
                transactionId: result.transactionId,
                phone: developerPhone,
                error: transactionOwnerResult?.error || transactionOwnerResult,
              })
            }
          } else {
            console.log('WhatsApp transaction owner notification skipped: no agent involved', {
              transactionId: result.transactionId,
            })
          }

          console.log('[WhatsApp Debug] send attempt', {
            transactionId: result.transactionId,
            role: 'attorney',
            phone: attorneyPhone,
          })
          await sendWhatsAppNotification({
            to: attorneyPhone,
            message: `New transaction created for ${unitReference} at ${developmentName}.\n\nClient: ${clientName}\n\nYou will be notified once onboarding has been submitted.`,
            role: 'attorney',
          })
        } catch (whatsappError) {
          console.error(
            '[NewTransactionWizard] transaction-created WhatsApp automation failed:',
            whatsappError?.message || String(whatsappError),
          )
        }

        setCreatedTransaction((current) => (
          current
            ? {
                ...current,
                onboardingEmailSent: !onboardingEmailError,
              }
            : current
        ))

        if (onboardingEmailError) {
          setSaveError(onboardingEmailError)
        } else if (reservationDepositEmailError) {
          setSaveError(reservationDepositEmailError)
        }
      })()
    } catch (error) {
      setSaveError(error.message || 'Failed to save transaction.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return null
  }

  const footer = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Button variant="ghost" onClick={onClose} disabled={saving}>
        {createdTransaction ? 'Done' : 'Cancel'}
      </Button>

      {createdTransaction ? (
        <Button
          onClick={() => {
            if (createdTransaction.unitId) {
              navigate(`/units/${createdTransaction.unitId}`, {
                state: { headerTitle: `Unit ${createdTransaction.unitNumber}` },
              })
              return
            }

            if (createdTransaction.transactionId) {
              if (role === 'agent') {
                const searchValue =
                  createdTransaction.transactionReference ||
                  createdTransaction.reference ||
                  createdTransaction.transactionId
                const query = searchValue ? `?search=${encodeURIComponent(searchValue)}` : ''
                navigate(`/units${query}`)
                return
              }

              navigate(`/transactions/${createdTransaction.transactionId}`)
            }
          }}
        >
          Open Transaction
        </Button>
      ) : (
        <Button onClick={handleSave} disabled={saving || loadingMeta}>
          {form.setup.allowIncomplete ? 'Create Draft Transaction' : 'Create Transaction & Generate Link'}
        </Button>
      )}
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="New Transaction"
      subtitle="Create the transaction shell, then hand the client the onboarding link."
      className="max-w-[960px]"
      footer={footer}
    >
      <div className="space-y-4">
        <section className="rounded-[20px] border border-[#e3ebf5] bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#c9d8ea] bg-[#edf4fb] text-sm font-semibold text-[#264563]">
              1
            </span>
            <div className="space-y-1">
              <small className="block text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[#7b8ba5]">Step 1</small>
              <h3 className="text-[1.08rem] font-semibold tracking-[-0.02em] text-[#142132]">Transaction Setup</h3>
              <p className="max-w-3xl text-sm leading-6 text-[#6b7d93]">
                Capture the property and client basics here. Purchaser structure, finance setup, and supporting details
                will be completed on the onboarding link.
              </p>
            </div>
          </div>
        </section>

        {!isSupabaseConfigured ? (
          <p className="rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">
            Supabase is not configured for this workspace.
          </p>
        ) : null}

        {loadingMeta ? (
          <p className="rounded-[18px] border border-[#dde4ee] bg-[#f8fafc] px-4 py-3 text-sm text-[#516277]">Loading form options...</p>
        ) : null}
        {saveError ? (
          <p className="rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">{saveError}</p>
        ) : null}

        {!createdTransaction ? (
          <div className={hasContextSidebar ? 'grid items-start gap-5 xl:grid-cols-[minmax(0,1.66fr)_minmax(300px,0.9fr)]' : 'space-y-5'}>
            <div className="space-y-5">
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="mb-4 space-y-1.5">
                  <h5 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Property Selection</h5>
                  <p className="text-sm leading-6 text-[#6b7d93]">
                    {isPrivateMatter
                      ? 'Capture the property details for this standalone conveyancing matter.'
                      : 'Choose the development and one of the units still marked as available for this deal.'}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {canChooseTransactionType ? (
                    <Field label="Transaction Type">
                      <select value={form.setup.transactionType} onChange={(event) => setSetupField('transactionType', event.target.value)}>
                        <option value="developer_sale">Developer Sale</option>
                        <option value="private_property">Private Property</option>
                      </select>
                    </Field>
                  ) : null}

                  {!isPrivateMatter ? (
                    <>
                      <Field label="Development" error={errors.developmentId}>
                        <select value={form.setup.developmentId} onChange={(event) => setSetupField('developmentId', event.target.value)}>
                          <option value="">Select development</option>
                          {developments.map((development) => (
                            <option key={development.id} value={development.id}>
                              {development.name}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field label="Unit" error={errors.unitId}>
                        <select
                          value={form.setup.unitId}
                          onChange={(event) => setSetupField('unitId', event.target.value)}
                          disabled={!form.setup.developmentId || loadingUnits}
                        >
                          <option value="">
                            {loadingUnits
                              ? 'Loading units...'
                              : availableUnits.length
                                ? 'Select available unit'
                                : 'No available units'}
                          </option>
                          {availableUnits.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              Unit {unit.unit_number}
                              {unit.phase ? ` • ${unit.phase}` : ''}
                              {` (${toMoney(unit.price)})`}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label="Property Category" error={errors.propertyType}>
                        <select value={form.setup.propertyType} onChange={(event) => setSetupField('propertyType', event.target.value)}>
                          <option value="">Select property category</option>
                          <option value="residential">Residential</option>
                          <option value="commercial">Commercial</option>
                          <option value="farm">Farm</option>
                        </select>
                      </Field>

                      <Field label="Property Address" error={errors.propertyAddressLine1} fullWidth>
                        <input
                          type="text"
                          value={form.setup.propertyAddressLine1}
                          onChange={(event) => setSetupField('propertyAddressLine1', event.target.value)}
                        />
                      </Field>

                      <Field label="Address Line 2">
                        <input
                          type="text"
                          value={form.setup.propertyAddressLine2}
                          onChange={(event) => setSetupField('propertyAddressLine2', event.target.value)}
                        />
                      </Field>

                      <Field label="Suburb">
                        <input type="text" value={form.setup.suburb} onChange={(event) => setSetupField('suburb', event.target.value)} />
                      </Field>

                      <Field label="City" error={errors.city}>
                        <input type="text" value={form.setup.city} onChange={(event) => setSetupField('city', event.target.value)} />
                      </Field>

                      <Field label="Province">
                        <input type="text" value={form.setup.province} onChange={(event) => setSetupField('province', event.target.value)} />
                      </Field>

                      <Field label="Postal Code">
                        <input type="text" value={form.setup.postalCode} onChange={(event) => setSetupField('postalCode', event.target.value)} />
                      </Field>

                      <Field label="Property Description" fullWidth>
                        <input
                          type="text"
                          value={form.setup.propertyDescription}
                          onChange={(event) => setSetupField('propertyDescription', event.target.value)}
                          placeholder="Optional erf, sectional title, or internal property description"
                        />
                      </Field>
                    </>
                  )}
                </div>
              </section>

              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="mb-4 space-y-1.5">
                  <h5 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Client Details</h5>
                  <p className="text-sm leading-6 text-[#6b7d93]">
                    {form.setup.allowIncomplete
                      ? 'Client fields are optional in draft mode. Add or invite stakeholders later.'
                      : 'Capture only the client basics here. The onboarding form will collect the rest.'}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={form.setup.allowIncomplete ? 'Client Name (optional)' : 'Client Name'} error={errors.buyerFirstName}>
                    <input
                      type="text"
                      value={form.setup.buyerFirstName}
                      onChange={(event) => setSetupField('buyerFirstName', event.target.value)}
                    />
                  </Field>

                  <Field label={form.setup.allowIncomplete ? 'Client Surname (optional)' : 'Client Surname'} error={errors.buyerLastName}>
                    <input
                      type="text"
                      value={form.setup.buyerLastName}
                      onChange={(event) => setSetupField('buyerLastName', event.target.value)}
                    />
                  </Field>

                  <Field label={form.setup.allowIncomplete ? 'Client Email (optional)' : 'Client Email'} error={errors.buyerEmail}>
                    <input
                      type="email"
                      value={form.setup.buyerEmail}
                      onChange={(event) => setSetupField('buyerEmail', event.target.value)}
                    />
                  </Field>

                  <Field label={form.setup.allowIncomplete ? 'Client Phone (optional)' : 'Client Phone'} error={errors.buyerPhone}>
                    <input
                      type="text"
                      value={form.setup.buyerPhone}
                      onChange={(event) => setSetupField('buyerPhone', event.target.value)}
                    />
                  </Field>

                  {isPrivateMatter ? (
                    <>
                      <Field label="Seller Name (optional)">
                        <input
                          type="text"
                          value={form.setup.sellerName}
                          onChange={(event) => setSetupField('sellerName', event.target.value)}
                        />
                      </Field>

                      <Field label="Seller Phone (optional)">
                        <input
                          type="text"
                          value={form.setup.sellerPhone}
                          onChange={(event) => setSetupField('sellerPhone', event.target.value)}
                        />
                      </Field>

                      <Field label="Seller Email (optional)" error={errors.sellerEmail}>
                        <input
                          type="email"
                          value={form.setup.sellerEmail}
                          onChange={(event) => setSetupField('sellerEmail', event.target.value)}
                        />
                      </Field>
                    </>
                  ) : null}
                </div>
              </section>

              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="mb-4 space-y-1.5">
                  <h5 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Deal Terms</h5>
                  <p className="text-sm leading-6 text-[#6b7d93]">Keep the transaction seed light. Purchaser and finance structure will come from onboarding.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label={form.setup.allowIncomplete ? 'Sales Price (optional)' : 'Sales Price'}
                    error={errors.salesPrice}
                    hint={form.setup.allowIncomplete ? 'You can create a draft without sales pricing.' : undefined}
                  >
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={form.setup.salesPrice}
                      onChange={(event) => setSetupField('salesPrice', event.target.value)}
                    />
                  </Field>

                  <div className="md:col-span-2">
                    <label className="flex items-center gap-2 rounded-[14px] border border-[#dde4ee] bg-[#f7f9fc] px-3 py-2.5 text-sm font-medium text-[#233247]">
                      <input
                        type="checkbox"
                        checked={Boolean(form.setup.allowIncomplete)}
                        onChange={(event) => setSetupField('allowIncomplete', event.target.checked)}
                      />
                      Create as incomplete draft (stakeholders and missing details can be added later)
                    </label>
                  </div>

                  <div className="md:col-span-2 grid gap-2 text-sm font-medium text-[#233247]">
                    <span>Reservation Deposit</span>
                    <div className="inline-flex w-full rounded-[14px] border border-[#dde4ee] bg-[#f7f9fc] p-1 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                      {[
                        { value: true, label: 'Yes' },
                        { value: false, label: 'No' },
                      ].map((option) => {
                        const selected = Boolean(form.finance.reservationRequired) === option.value
                        return (
                          <button
                            key={option.label}
                            type="button"
                            className={`flex-1 rounded-[10px] px-3 py-2 text-sm font-semibold transition ${
                              selected
                                ? 'bg-white text-[#142132] shadow-[0_6px_14px_rgba(15,23,42,0.08)]'
                                : 'text-[#6b7d93] hover:text-[#35546c]'
                            }`}
                            onClick={() => setReservationRequired(option.value)}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                    {!isPrivateMatter && selectedDevelopment?.reservation_deposit_enabled_by_default ? (
                      <small className="text-xs text-[#6b7d93]">
                        Reservation deposit is enabled by default from this development's Reservation Deposit Settings.
                      </small>
                    ) : null}
                  </div>

                  {form.finance.reservationRequired ? (
                    <Field label="Reservation Amount" error={errors.reservationAmount}>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={form.finance.reservationAmount}
                        onChange={(event) => setFinanceField('reservationAmount', event.target.value)}
                        placeholder="Enter reservation amount"
                      />
                    </Field>
                  ) : null}

                  {form.finance.reservationRequired && !isPrivateMatter && selectedDevelopment ? (
                    <div className="md:col-span-2 rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] px-4 py-3.5">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ba5]">
                        Reservation Defaults
                      </p>
                      <p className="mt-1.5 text-sm leading-6 text-[#516277]">
                        Reservation deposit details are auto-filled from this development&apos;s Reservation Deposit Settings.
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#516277]">
                        You can adjust the amount here for this transaction if needed. Payment details and reference format are inherited from the development settings.
                      </p>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-[12px] border border-[#e3ebf4] bg-white px-3 py-2.5">
                          <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ba5]">
                            Default Deposit Amount
                          </span>
                          <strong className="mt-1 block text-sm font-semibold text-[#142132]">
                            {hasDevelopmentReservationDefault ? toMoney(developmentDefaultReservationAmount) : 'Not set in development settings'}
                          </strong>
                        </div>
                        <div className="rounded-[12px] border border-[#e3ebf4] bg-white px-3 py-2.5">
                          <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ba5]">
                            This Transaction Amount
                          </span>
                          <strong className="mt-1 block text-sm font-semibold text-[#142132]">
                            {selectedReservationAmount !== null ? toMoney(selectedReservationAmount) : 'Not entered'}
                          </strong>
                          {selectedReservationAmount !== null ? (
                            <small className="mt-1 block text-xs text-[#6b7d93]">
                              {reservationUsesDevelopmentDefault
                                ? 'Using development default.'
                                : 'Override applied for this transaction.'}
                            </small>
                          ) : null}
                        </div>
                      </div>

                      <p className="mt-2.5 text-xs leading-5 text-[#6b7d93]">
                        To update defaults for future transactions, edit the development&apos;s Reservation Deposit Settings on the Transactions page.
                      </p>
                    </div>
                  ) : null}

                  <BooleanField
                    label="Agent Involved?"
                    value={Boolean(form.setup.agentInvolved)}
                    onChange={(value) => setSetupField('agentInvolved', value)}
                  />

                  {form.setup.agentInvolved ? (
                    <>
                      <Field label="Agent Name">
                        <input
                          type="text"
                          value={form.setup.assignedAgent}
                          onChange={(event) => setSetupField('assignedAgent', event.target.value)}
                          placeholder="Optional"
                        />
                      </Field>
                      <Field label="Agent Email" error={errors.assignedAgentEmail}>
                        <input
                          type="email"
                          value={form.setup.assignedAgentEmail}
                          onChange={(event) => setSetupField('assignedAgentEmail', event.target.value)}
                          placeholder="Optional"
                        />
                      </Field>
                    </>
                  ) : null}

                  <div className="md:col-span-2 rounded-[18px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[#142132]">Connected Transaction Partners</p>
                        <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                          Preferred and approved organisations are reusable defaults for transaction setup.
                        </p>
                      </div>
                      {loadingPartners || loadingPartnerConnections ? <span className="text-xs font-semibold text-[#6b7d93]">Loading partners...</span> : null}
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="space-y-3 rounded-[16px] border border-[#dbe4ef] bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-[#142132]">Transfer Attorney</p>
                          <div className="inline-flex rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] p-1">
                            {[
                              { key: 'existing', label: 'Existing' },
                              { key: 'invite', label: 'Invite New' },
                            ].map((option) => (
                              <button
                                key={option.key}
                                type="button"
                                className={`rounded-[9px] px-3 py-1.5 text-xs font-semibold transition ${
                                  partnerInvitationModes.transfer_attorney === option.key
                                    ? 'bg-[#142132] text-white shadow-[0_6px_16px_rgba(15,23,42,0.16)]'
                                    : 'text-[#60758d]'
                                }`}
                                onClick={() => setPartnerInvitationMode('transfer_attorney', option.key)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {partnerInvitationModes.transfer_attorney === 'existing' ? (
                          <div className="space-y-3">
                            <Field label="Connected Attorney">
                              <select
                                value={form.finance.attorneyPartnerRelationshipId || ''}
                                onChange={(event) => selectPartnerField('attorneyPartnerRelationshipId', event.target.value)}
                              >
                                <option value="">Select connected attorney</option>
                                {attorneyPartnerOptions.map((partner) => (
                                  <option key={partner.id} value={partner.id}>
                                    {partner.companyName}
                                    {partner.relationshipType === 'preferred' ? ' • Preferred' : ''}
                                    {partner.source === 'partner_connection' && partner.relationshipType !== 'preferred' ? ' • Connected' : ''}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <PartnerProspectPicker
                              label="Reusable Attorney Prospect"
                              query={partnerProspectQueries.transfer_attorney}
                              onQueryChange={(value) => setPartnerProspectQuery('transfer_attorney', value)}
                              prospects={attorneyPartnerProspects}
                              selectedProspect={selectedPartnerProspects.transfer_attorney}
                              onSelect={(prospect) => selectPartnerProspect('transfer_attorney', prospect)}
                              loading={loadingPartnerProspects}
                            />
                          </div>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Company" error={errors['transfer_attorney.companyName']}>
                              <input
                                type="text"
                                value={partnerInvitationDrafts.transfer_attorney.companyName}
                                onChange={(event) => setPartnerInvitationDraftField('transfer_attorney', 'companyName', event.target.value)}
                                placeholder="Tucker Attorneys"
                              />
                            </Field>
                            <Field label="Contact" error={errors['transfer_attorney.contactName']}>
                              <input
                                type="text"
                                value={partnerInvitationDrafts.transfer_attorney.contactName}
                                onChange={(event) => setPartnerInvitationDraftField('transfer_attorney', 'contactName', event.target.value)}
                                placeholder="Sarah Jones"
                              />
                            </Field>
                            <Field label="Email" error={errors['transfer_attorney.email']}>
                              <input
                                type="email"
                                value={partnerInvitationDrafts.transfer_attorney.email}
                                onChange={(event) => setPartnerInvitationDraftField('transfer_attorney', 'email', event.target.value)}
                                placeholder="sarah@tucker.co.za"
                              />
                            </Field>
                            <Field label="Phone">
                              <input
                                type="tel"
                                value={partnerInvitationDrafts.transfer_attorney.phone}
                                onChange={(event) => setPartnerInvitationDraftField('transfer_attorney', 'phone', event.target.value)}
                                placeholder="082 xxx xxxx"
                              />
                            </Field>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3 rounded-[16px] border border-[#dbe4ef] bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-[#142132]">Bond Originator</p>
                          <div className="inline-flex rounded-[12px] border border-[#dbe4ef] bg-[#f8fbff] p-1">
                            {[
                              { key: 'existing', label: 'Existing' },
                              { key: 'invite', label: 'Invite New' },
                            ].map((option) => (
                              <button
                                key={option.key}
                                type="button"
                                className={`rounded-[9px] px-3 py-1.5 text-xs font-semibold transition ${
                                  partnerInvitationModes.bond_originator === option.key
                                    ? 'bg-[#142132] text-white shadow-[0_6px_16px_rgba(15,23,42,0.16)]'
                                    : 'text-[#60758d]'
                                }`}
                                onClick={() => setPartnerInvitationMode('bond_originator', option.key)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {partnerInvitationModes.bond_originator === 'existing' ? (
                          <div className="space-y-3">
                            <Field label="Connected Bond Originator">
                              <select
                                value={form.finance.bondOriginatorPartnerRelationshipId || ''}
                                onChange={(event) => selectPartnerField('bondOriginatorPartnerRelationshipId', event.target.value)}
                              >
                                <option value="">Select connected bond originator</option>
                                {bondOriginatorPartnerOptions.map((partner) => (
                                  <option key={partner.id} value={partner.id}>
                                    {partner.companyName}
                                    {partner.relationshipType === 'preferred' ? ' • Preferred' : ''}
                                    {partner.source === 'partner_connection' && partner.relationshipType !== 'preferred' ? ' • Connected' : ''}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <PartnerProspectPicker
                              label="Reusable Originator Prospect"
                              query={partnerProspectQueries.bond_originator}
                              onQueryChange={(value) => setPartnerProspectQuery('bond_originator', value)}
                              prospects={bondOriginatorPartnerProspects}
                              selectedProspect={selectedPartnerProspects.bond_originator}
                              onSelect={(prospect) => selectPartnerProspect('bond_originator', prospect)}
                              loading={loadingPartnerProspects}
                            />
                          </div>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Company" error={errors['bond_originator.companyName']}>
                              <input
                                type="text"
                                value={partnerInvitationDrafts.bond_originator.companyName}
                                onChange={(event) => setPartnerInvitationDraftField('bond_originator', 'companyName', event.target.value)}
                                placeholder="BetterBond Sandton"
                              />
                            </Field>
                            <Field label="Contact" error={errors['bond_originator.contactName']}>
                              <input
                                type="text"
                                value={partnerInvitationDrafts.bond_originator.contactName}
                                onChange={(event) => setPartnerInvitationDraftField('bond_originator', 'contactName', event.target.value)}
                                placeholder="Michael Naidoo"
                              />
                            </Field>
                            <Field label="Email" error={errors['bond_originator.email']}>
                              <input
                                type="email"
                                value={partnerInvitationDrafts.bond_originator.email}
                                onChange={(event) => setPartnerInvitationDraftField('bond_originator', 'email', event.target.value)}
                                placeholder="michael@betterbond.co.za"
                              />
                            </Field>
                            <Field label="Phone">
                              <input
                                type="tel"
                                value={partnerInvitationDrafts.bond_originator.phone}
                                onChange={(event) => setPartnerInvitationDraftField('bond_originator', 'phone', event.target.value)}
                                placeholder="082 xxx xxxx"
                              />
                            </Field>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {!isPrivateMatter && form.setup.developmentId && !loadingUnits && !availableUnits.length ? (
                <section className="rounded-[20px] border border-[#f5d7a8] bg-[#fff8eb] p-4 text-sm leading-6 text-[#8a5a12]">
                  This development has no units currently marked as available, so a new transaction cannot be created here until stock is freed up or added.
                </section>
              ) : null}
            </div>

            {hasContextSidebar ? <div className="self-start space-y-5 xl:sticky xl:top-4">
              {selectedDevelopment && !isPrivateMatter ? (
                <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                  <div className="space-y-1.5">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Development Snapshot</p>
                    <h4 className="text-[1.08rem] font-semibold tracking-[-0.02em] text-[#142132]">{selectedDevelopment.name}</h4>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff]">
                    {developmentSnapshotRows.map((item, index) => (
                      <div
                        key={item.label}
                        className={`flex items-center justify-between gap-4 px-4 py-3.5 ${
                          index === developmentSnapshotRows.length - 1 ? '' : 'border-b border-[#e8eef5]'
                        }`}
                      >
                        <span className="text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ba5]">{item.label}</span>
                        <strong className="text-base font-semibold text-[#142132]">{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {selectedUnit && !isPrivateMatter ? (
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                  <h4 className="text-base font-semibold text-[#142132]">Unit Context</h4>
                  <p className="mt-2 text-sm leading-6 text-[#516277]">
                    Unit {selectedUnit.unit_number} currently at <strong>{selectedUnit.status}</strong> with list price{' '}
                    <strong>{toMoney(selectedUnit.price)}</strong>.
                  </p>
                </section>
              ) : null}
            </div> : null}
          </div>
        ) : null}

        {createdTransaction ? (
          <div
            className="space-y-4 rounded-[24px] border border-[#d8e7dc] bg-[#f3fbf5] p-4 shadow-[0_16px_40px_rgba(15,23,42,0.04)]"
            role="status"
            aria-live="polite"
          >
            <header className="space-y-2">
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Transaction Created</h3>
              <p className="text-sm leading-6 text-[#5f756a]">
                {createdTransaction.allowIncomplete
                  ? 'Draft workspace created. You can now add stakeholders and complete missing setup details.'
                  : createdTransaction.onboardingEmailSent === null
                    ? 'Transaction created successfully. Finalizing client email automation in the background.'
                  : createdTransaction.onboardingEmailSent
                    ? 'The onboarding email was sent to the client automatically. You can still copy or open the link below.'
                    : 'Transaction was created, but onboarding email did not send automatically. Use the link below to continue.'}
              </p>
            </header>

            <section className="rounded-[20px] border border-[#d8e7dc] bg-white p-4">
              <h4 className="text-base font-semibold text-[#142132]">{createdTransaction.buyerName || 'Buyer not captured yet'}</h4>
              <p className="mt-2 text-sm leading-6 text-[#516277]">
                {isPrivateTransactionType(createdTransaction.transactionType)
                  ? `${createdTransaction.propertyLabel || 'Private property matter'} has been created.`
                  : `Unit ${createdTransaction.unitNumber} has been created.`}{' '}
                {createdTransaction.buyerEmail
                  ? (
                    <>The onboarding handoff is ready for <strong>{createdTransaction.buyerEmail}</strong>.</>
                  )
                  : (
                    <>No buyer email captured yet.</>
                  )}
              </p>
            </section>

            {onboardingUrl ? (
              <section className="rounded-[20px] border border-[#cdddf0] bg-white px-4 py-3">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Client Onboarding Link</span>
                <strong className="mt-2 block break-all text-sm text-[#142132]">{onboardingUrl}</strong>
              </section>
            ) : (
              <p className="rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">
                The transaction was created, but the onboarding link is not available yet.
              </p>
            )}

            {createdTransaction.partnerInvitations?.length ? (
              <section className="rounded-[20px] border border-[#cdddf0] bg-white px-4 py-3">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Partner Invitations</span>
                <div className="mt-3 space-y-2">
                  {createdTransaction.partnerInvitations.map((item) => (
                    <div key={item.invitation?.id || item.invitationUrl} className="rounded-[14px] border border-[#e5edf6] bg-[#fbfdff] px-3 py-2">
                      <strong className="block text-sm font-semibold text-[#142132]">
                        {item.invitation?.company_name || item.invitation?.companyName || 'Invited partner'}
                      </strong>
                      <span className="mt-1 block text-xs text-[#60758d]">
                        Pending Acceptance
                        {item.invitationUrl ? ` • ${item.invitationUrl}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {createdTransaction.partnerProspects?.some((item) => item.result?.accessGranted) ? (
              <section className="rounded-[20px] border border-[#d8e7dc] bg-white px-4 py-3">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Reusable Partners</span>
                <div className="mt-3 space-y-2">
                  {createdTransaction.partnerProspects
                    .filter((item) => item.result?.accessGranted)
                    .map((item) => (
                      <div key={item.prospect?.id || item.roleType} className="rounded-[14px] border border-[#e5edf6] bg-[#fbfdff] px-3 py-2">
                        <strong className="block text-sm font-semibold text-[#142132]">{item.prospect?.companyName || 'Reusable partner'}</strong>
                        <span className="mt-1 block text-xs text-[#60758d]">Active on this transaction</span>
                      </div>
                    ))}
                </div>
              </section>
            ) : null}

            {createdTransaction.partnerInvitationWarnings?.length ? (
              <section className="rounded-[18px] border border-[#f5d7a8] bg-[#fff8eb] px-4 py-3 text-sm leading-6 text-[#8a5a12]">
                {createdTransaction.partnerInvitationWarnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </section>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={handleCopyOnboardingLink} disabled={!onboardingUrl}>
                <Copy size={14} />
                Copy Link
              </Button>
              <Button
                variant="secondary"
                onClick={() => window.open(onboardingUrl, '_blank', 'noopener,noreferrer')}
                disabled={!onboardingUrl}
              >
                <ExternalLink size={14} />
                Open Onboarding
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

export default NewTransactionWizard
