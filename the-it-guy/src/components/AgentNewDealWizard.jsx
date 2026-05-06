import { CheckCircle2, CircleAlert, ExternalLink } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTransactionFromWizard, fetchDevelopmentOptions, fetchUnitsForTransactionSetup } from '../lib/api'
import { isAgentListingReadyForDeal, readAgentPrivateListings, writeAgentPrivateListings } from '../lib/agentListingStorage'
import { useWorkspace } from '../context/WorkspaceContext'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import Button from './ui/Button'
import Modal from './ui/Modal'

const PIPELINE_STORAGE_KEY = 'itg:pipeline-leads:v1'

const STEP_ORDER = ['property', 'client', 'terms', 'attorney', 'review']

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function readPipelineRows() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PIPELINE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return '—'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function fieldClass() {
  return 'w-full rounded-[14px] border border-[#dde4ee] bg-white px-4 py-3 text-sm text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] outline-none transition duration-150 ease-out placeholder:text-slate-400 focus:border-[rgba(29,78,216,0.35)] focus:ring-4 focus:ring-[rgba(29,78,216,0.1)]'
}

function Field({ label, hint, error, children, fullWidth = false }) {
  return (
    <label className={`${fullWidth ? 'md:col-span-2' : ''} flex min-w-0 flex-col gap-2 text-sm font-medium text-[#233247]`}>
      <span>{label}</span>
      {hint ? <small className="text-xs leading-5 text-[#6b7d93]">{hint}</small> : null}
      {children}
      {error ? <small className="text-xs font-medium text-[#b42318]">{error}</small> : null}
    </label>
  )
}

function StepChip({ index, title, active }) {
  return (
    <div className={`flex min-h-[74px] items-center gap-3 rounded-[18px] border px-4 py-3 ${active ? 'border-[#1f4f78] bg-[#2b5577] text-white shadow-[0_18px_32px_rgba(31,79,120,0.18)]' : 'border-[#dbe6f2] bg-white text-[#47627c]'}`}>
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-[0.8rem] font-semibold ${active ? 'border-white/30 bg-white/10 text-white' : 'border-[#d3dfec] bg-[#f7fbff] text-[#35546c]'}`}>
        {index + 1}
      </span>
      <span className="text-sm font-semibold">{title}</span>
    </div>
  )
}

function normalizePhoneInput(value) {
  return String(value || '').replace(/[^\d+\-()\s]/g, '')
}

function getDevelopmentTeamMembers(rawTeams, teamKey) {
  const teams = rawTeams && typeof rawTeams === 'object' ? rawTeams : {}
  const members = Array.isArray(teams?.[teamKey]) ? teams[teamKey] : []
  return members
    .map((member) => ({
      name: String(member?.participantName || member?.name || member?.label || '').trim(),
      email: String(member?.participantEmail || member?.email || '').trim(),
      phone: String(member?.participantPhone || member?.phone || '').trim(),
    }))
    .filter((member) => member.name || member.email)
}

function normalizeListingAttorneyOptions(listing) {
  const rolePlayersAttorney = String(listing?.rolePlayers?.attorney || '').trim()
  const mandateAttorney = String(listing?.mandateAttorney || '').trim()
  return [rolePlayersAttorney, mandateAttorney]
    .filter(Boolean)
    .map((name) => ({ name, email: '', phone: '' }))
}

function AgentNewDealWizard({ open, onClose, initialDevelopmentId = '', onSaved }) {
  const navigate = useNavigate()
  const { profile } = useWorkspace()
  const [activeStep, setActiveStep] = useState('property')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [errors, setErrors] = useState({})
  const [createdDeal, setCreatedDeal] = useState(null)
  const [privateListings, setPrivateListings] = useState([])
  const [pipelineRows, setPipelineRows] = useState([])
  const [developments, setDevelopments] = useState([])
  const [developmentUnits, setDevelopmentUnits] = useState([])
  const [form, setForm] = useState({
    propertyMode: 'private',
    privateListingId: '',
    developmentId: initialDevelopmentId || '',
    unitId: '',
    pipelineLeadId: '',
    clientName: '',
    clientSurname: '',
    clientEmail: '',
    clientPhone: '',
    saleDate: todayIso(),
    salesPrice: '',
    reservationRequired: false,
    reservationAmount: '',
    attorneySelectionMode: 'default',
    attorneyName: '',
    attorneyEmail: '',
    attorneyPhone: '',
    buyerRequestedDifferentAttorney: false,
    buyerAttorneyName: '',
    buyerAttorneyFirm: '',
    buyerAttorneyEmail: '',
    buyerAttorneyPhone: '',
    buyerAttorneyNotes: '',
  })

  useEffect(() => {
    if (!open) return
    setActiveStep('property')
    setSaving(false)
    setSaveError('')
    setErrors({})
    setCreatedDeal(null)
    setLoading(true)
    setPrivateListings(readAgentPrivateListings().filter((listing) => isAgentListingReadyForDeal(listing)))
    setPipelineRows(readPipelineRows())

    if (!isSupabaseConfigured) {
      setDevelopments([])
      setDevelopmentUnits([])
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        const rows = await fetchDevelopmentOptions()
        const email = String(profile?.email || '').trim().toLowerCase()
        const filtered = rows.filter((row) => {
          const assignedAgents = getDevelopmentTeamMembers(row?.stakeholder_teams, 'agents')
          return email ? assignedAgents.some((item) => String(item.email || '').trim().toLowerCase() === email) : true
        })
        setDevelopments(filtered)
      } catch (error) {
        setSaveError(error?.message || 'Unable to load developments.')
      } finally {
        setLoading(false)
      }
    })()
  }, [open, profile?.email, initialDevelopmentId])

  useEffect(() => {
    if (!open || form.propertyMode !== 'development' || !form.developmentId || !isSupabaseConfigured) {
      setDevelopmentUnits([])
      return
    }

    ;(async () => {
      try {
        const rows = await fetchUnitsForTransactionSetup(form.developmentId)
        const available = rows.filter((unit) => String(unit?.status || '').trim().toLowerCase() === 'available' && !unit?.activeTransaction)
        setDevelopmentUnits(available)
      } catch (error) {
        setSaveError(error?.message || 'Unable to load development units.')
      }
    })()
  }, [open, form.propertyMode, form.developmentId])

  const selectedPrivateListing = useMemo(
    () => privateListings.find((listing) => String(listing.id) === String(form.privateListingId)) || null,
    [privateListings, form.privateListingId],
  )

  const selectedDevelopment = useMemo(
    () => developments.find((item) => String(item.id) === String(form.developmentId)) || null,
    [developments, form.developmentId],
  )

  const selectedUnit = useMemo(
    () => developmentUnits.find((item) => String(item.id) === String(form.unitId)) || null,
    [developmentUnits, form.unitId],
  )

  const selectedLead = useMemo(
    () => pipelineRows.find((row) => String(row.id) === String(form.pipelineLeadId)) || null,
    [pipelineRows, form.pipelineLeadId],
  )

  const defaultAttorney = useMemo(() => {
    const privateAttorneyOptions = normalizeListingAttorneyOptions(selectedPrivateListing)
    const developmentAttorneyOptions = getDevelopmentTeamMembers(selectedDevelopment?.stakeholder_teams, 'conveyancers')
    return form.propertyMode === 'private'
      ? privateAttorneyOptions[0] || null
      : developmentAttorneyOptions[0] || null
  }, [form.propertyMode, selectedDevelopment?.stakeholder_teams, selectedPrivateListing])

  useEffect(() => {
    if (selectedLead) {
      const rawName = String(selectedLead.name || '').trim()
      const [first = '', ...rest] = rawName.split(/\s+/)
      setForm((previous) => ({
        ...previous,
        clientName: first || previous.clientName,
        clientSurname: rest.join(' ') || previous.clientSurname,
        clientEmail: String(selectedLead.email || '').trim() || previous.clientEmail,
        clientPhone: String(selectedLead.phone || '').trim() || previous.clientPhone,
      }))
    }
  }, [selectedLead])

  useEffect(() => {
    if (form.propertyMode === 'private' && selectedPrivateListing) {
      const price = String(selectedPrivateListing?.askingPrice || '').trim()
      setForm((previous) => ({
        ...previous,
        salesPrice: price || previous.salesPrice,
        reservationRequired: false,
        reservationAmount: '',
        attorneyName: previous.attorneyName || defaultAttorney?.name || '',
        attorneyEmail: previous.attorneyEmail || defaultAttorney?.email || '',
        attorneyPhone: previous.attorneyPhone || defaultAttorney?.phone || '',
      }))
    }
  }, [selectedPrivateListing, defaultAttorney?.email, defaultAttorney?.name, defaultAttorney?.phone, form.propertyMode])

  useEffect(() => {
    if (form.propertyMode === 'development' && selectedUnit) {
      const reservationEnabled = Boolean(selectedDevelopment?.reservation_deposit_enabled_by_default)
      const reservationAmount = reservationEnabled ? String(selectedDevelopment?.reservation_deposit_amount || '') : ''
      setForm((previous) => ({
        ...previous,
        salesPrice: String(selectedUnit?.price || '') || previous.salesPrice,
        reservationRequired: reservationEnabled,
        reservationAmount,
        attorneyName: defaultAttorney?.name || previous.attorneyName,
        attorneyEmail: defaultAttorney?.email || previous.attorneyEmail,
        attorneyPhone: defaultAttorney?.phone || previous.attorneyPhone,
      }))
    }
  }, [selectedUnit, selectedDevelopment?.reservation_deposit_amount, selectedDevelopment?.reservation_deposit_enabled_by_default, defaultAttorney?.email, defaultAttorney?.name, defaultAttorney?.phone, form.propertyMode])

  function updateField(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  function validate(stepKey) {
    const nextErrors = {}

    if (stepKey === 'property') {
      if (form.propertyMode === 'private') {
        if (!form.privateListingId) nextErrors.privateListingId = 'Select an active listing.'
      } else {
        if (!form.developmentId) nextErrors.developmentId = 'Select a development.'
        if (!form.unitId) nextErrors.unitId = 'Select an available unit.'
      }
    }

    if (stepKey === 'client') {
      if (!String(form.clientName || '').trim()) nextErrors.clientName = 'Client name is required.'
      if (!String(form.clientSurname || '').trim()) nextErrors.clientSurname = 'Client surname is required.'
      if (!String(form.clientEmail || '').trim()) nextErrors.clientEmail = 'Client email is required.'
      if (!String(form.clientPhone || '').trim()) nextErrors.clientPhone = 'Client phone is required.'
    }

    if (stepKey === 'terms') {
      if (!String(form.salesPrice || '').trim() || Number(form.salesPrice) <= 0) nextErrors.salesPrice = 'Enter a valid deal value.'
      if (form.reservationRequired && (!String(form.reservationAmount || '').trim() || Number(form.reservationAmount) <= 0)) {
        nextErrors.reservationAmount = 'Enter a valid reservation deposit amount.'
      }
    }

    if (stepKey === 'attorney') {
      if (!String(form.attorneyName || '').trim()) nextErrors.attorneyName = 'Transfer attorney name is required.'
      if (!String(form.attorneyEmail || '').trim()) nextErrors.attorneyEmail = 'Transfer attorney email is required.'
      if (!String(form.attorneyPhone || '').trim()) nextErrors.attorneyPhone = 'Transfer attorney phone is required.'
      if (form.buyerRequestedDifferentAttorney) {
        if (!String(form.buyerAttorneyName || '').trim()) nextErrors.buyerAttorneyName = 'Attorney name is required.'
        if (!String(form.buyerAttorneyFirm || '').trim()) nextErrors.buyerAttorneyFirm = 'Firm is required.'
      }
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function goNext() {
    if (!validate(activeStep)) return
    const currentIndex = STEP_ORDER.indexOf(activeStep)
    if (currentIndex >= 0 && currentIndex < STEP_ORDER.length - 1) {
      setActiveStep(STEP_ORDER[currentIndex + 1])
    }
  }

  function goBack() {
    const currentIndex = STEP_ORDER.indexOf(activeStep)
    if (currentIndex > 0) {
      setActiveStep(STEP_ORDER[currentIndex - 1])
    }
  }

  async function handleCreateDeal() {
    const validProperty = validate('property')
    const validClient = validate('client')
    const validTerms = validate('terms')
    const validAttorney = validate('attorney')
    if (!validProperty || !validClient || !validTerms || !validAttorney) {
      return
    }

    const privateListing = selectedPrivateListing
    const buyerName = `${form.clientName} ${form.clientSurname}`.trim()
    const defaultAttorneyName = String(form.attorneyName || defaultAttorney?.name || '').trim()
    const defaultAttorneyEmail = String(form.attorneyEmail || defaultAttorney?.email || '').trim()
    const nextAction = form.buyerRequestedDifferentAttorney
      ? 'Attorney change requested. Awaiting seller/developer approval while onboarding proceeds.'
      : 'Finance details and bond requirements will be captured during client onboarding.'

    try {
      setSaving(true)
      setSaveError('')
      const result = await createTransactionFromWizard({
        setup: {
          transactionType: form.propertyMode === 'private' ? 'private_property' : 'developer_sale',
          propertyType:
            form.propertyMode === 'private'
              ? String(privateListing?.propertyDetails?.propertyType || privateListing?.propertyType || '').trim().toLowerCase() || 'residential'
              : '',
          developmentId: form.propertyMode === 'development' ? form.developmentId : '',
          unitId: form.propertyMode === 'development' ? form.unitId : '',
          propertyAddressLine1: form.propertyMode === 'private' ? privateListing?.propertyDetails?.addressLine1 || privateListing?.addressLine1 || privateListing?.listingTitle || '' : '',
          propertyAddressLine2: '',
          suburb: form.propertyMode === 'private' ? privateListing?.propertyDetails?.suburb || privateListing?.suburb || '' : '',
          city: form.propertyMode === 'private' ? privateListing?.propertyDetails?.city || privateListing?.city || '' : '',
          province: form.propertyMode === 'private' ? privateListing?.propertyDetails?.province || privateListing?.province || '' : '',
          postalCode: '',
          propertyDescription: form.propertyMode === 'private' ? privateListing?.propertyDetails?.description || privateListing?.marketing?.description || '' : '',
          buyerFirstName: form.clientName,
          buyerLastName: form.clientSurname,
          buyerPhone: form.clientPhone,
          buyerEmail: form.clientEmail,
          sellerName: form.propertyMode === 'private' ? privateListing?.seller?.name || '' : '',
          sellerPhone: form.propertyMode === 'private' ? privateListing?.seller?.phone || '' : '',
          sellerEmail: form.propertyMode === 'private' ? privateListing?.seller?.email || '' : '',
          salesPrice: form.salesPrice,
          purchaserType: 'individual',
          saleDate: form.saleDate || todayIso(),
          assignedAgent: String(profile?.fullName || profile?.name || profile?.email || 'Agent').trim(),
          assignedAgentEmail: String(profile?.email || '').trim(),
          financeManagedBy: 'bond_originator',
        },
        finance: {
          reservationRequired: Boolean(form.reservationRequired),
          reservationAmount: form.reservationRequired ? form.reservationAmount : '',
          reservationStatus: form.reservationRequired ? 'pending' : 'not_required',
          attorney: defaultAttorneyName,
          attorneyEmail: defaultAttorneyEmail,
        },
        status: {
          stage: form.propertyMode === 'development' && form.reservationRequired ? 'Reserved' : 'Offer Accepted',
          nextAction,
          notes: form.buyerRequestedDifferentAttorney
            ? `Buyer requested different attorney: ${form.buyerAttorneyName} / ${form.buyerAttorneyFirm}. ${form.buyerAttorneyNotes}`.trim()
            : '',
        },
        options: {
          deferFinanceType: true,
        },
      })

      if (form.propertyMode === 'private' && privateListing) {
        const rows = readAgentPrivateListings().map((listing) =>
          String(listing.id) === String(privateListing.id)
            ? {
                ...listing,
                status: 'in_progress',
                activeDeal: {
                  transactionId: result?.transactionId || null,
                  buyerName,
                  createdAt: new Date().toISOString(),
                },
                attorneyChangeRequest: form.buyerRequestedDifferentAttorney
                  ? {
                      status: 'requested',
                      requestedAt: new Date().toISOString(),
                      requestedAttorney: {
                        name: form.buyerAttorneyName,
                        firm: form.buyerAttorneyFirm,
                        email: form.buyerAttorneyEmail,
                        phone: form.buyerAttorneyPhone,
                        notes: form.buyerAttorneyNotes,
                      },
                      defaultAttorney: {
                        name: defaultAttorneyName,
                        email: defaultAttorneyEmail,
                      },
                    }
                  : null,
              }
            : listing,
        )
        writeAgentPrivateListings(rows)
      }

      setCreatedDeal({
        ...result,
        onboardingUrl: result?.onboardingToken ? `${window.location.origin}/client/onboarding/${result.onboardingToken}` : '',
        attorneyChangeRequested: form.buyerRequestedDifferentAttorney,
      })
      window.dispatchEvent(new Event('itg:listings-updated'))
      window.dispatchEvent(new Event('itg:transaction-created'))
      onSaved?.(result)
    } catch (error) {
      setSaveError(error?.message || 'Unable to create deal.')
    } finally {
      setSaving(false)
    }
  }

  const footer = createdDeal ? (
    <div className="flex items-center justify-between">
      <Button variant="ghost" onClick={onClose}>Done</Button>
      <Button
        onClick={() => {
          const searchValue = createdDeal.transactionReference || createdDeal.reference || createdDeal.transactionId
          const query = searchValue ? `?search=${encodeURIComponent(searchValue)}` : ''
          navigate(`/deals${query}`)
        }}
      >
        Open Deal
      </Button>
    </div>
  ) : (
    <div className="flex items-center justify-between">
      <Button variant="ghost" onClick={activeStep === 'property' ? onClose : goBack} disabled={saving}>
        {activeStep === 'property' ? 'Cancel' : 'Back'}
      </Button>
      {activeStep === 'review' ? (
        <Button onClick={handleCreateDeal} disabled={saving || loading}>
          Create Deal & Trigger Onboarding
        </Button>
      ) : (
        <Button onClick={goNext} disabled={saving || loading}>
          Continue
        </Button>
      )}
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="New Deal"
      subtitle="Create a clean transaction shell from a valid active listing or available development unit."
      className="max-w-[1040px]"
      footer={footer}
    >
      <div className="space-y-5">
        {saveError ? (
          <div className="rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">{saveError}</div>
        ) : null}

        <section className="grid gap-3 lg:grid-cols-5">
          {STEP_ORDER.map((stepKey, index) => (
            <StepChip
              key={stepKey}
              index={index}
              title={
                stepKey === 'property'
                  ? 'Select Property'
                  : stepKey === 'client'
                    ? 'Client Details'
                    : stepKey === 'terms'
                      ? 'Deal Terms'
                      : stepKey === 'attorney'
                        ? 'Transfer Attorney'
                        : 'Review & Create Deal'
              }
              active={stepKey === activeStep}
            />
          ))}
        </section>

        {!createdDeal ? (
          <>
            {activeStep === 'property' ? (
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="mb-5 flex flex-wrap gap-3">
                  {[
                    { key: 'private', label: 'Private Listing' },
                    { key: 'development', label: 'Development Listing' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setForm((previous) => ({ ...previous, propertyMode: item.key, privateListingId: '', developmentId: '', unitId: '' }))}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold ${form.propertyMode === item.key ? 'border-[#1f4f78] bg-[#2b5577] text-white' : 'border-[#dbe6f2] bg-white text-[#47627c]'}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {form.propertyMode === 'private' ? (
                    <Field label="Active Private Listing" error={errors.privateListingId} fullWidth>
                      <select className={fieldClass()} value={form.privateListingId} onChange={(event) => updateField('privateListingId', event.target.value)}>
                        <option value="">Select active listing</option>
                        {privateListings.map((listing) => (
                          <option key={listing.id} value={listing.id}>
                            {listing.listingTitle} • {listing.suburb || 'Location pending'} • {formatCurrency(listing.askingPrice)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : (
                    <>
                      <Field label="Assigned Development" error={errors.developmentId}>
                        <select className={fieldClass()} value={form.developmentId} onChange={(event) => updateField('developmentId', event.target.value)}>
                          <option value="">Select development</option>
                          {developments.map((development) => (
                            <option key={development.id} value={development.id}>{development.name}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Available Unit" error={errors.unitId}>
                        <select className={fieldClass()} value={form.unitId} onChange={(event) => updateField('unitId', event.target.value)} disabled={!form.developmentId}>
                          <option value="">{form.developmentId ? 'Select unit' : 'Select development first'}</option>
                          {developmentUnits.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              Unit {unit.unit_number}{unit.phase ? ` • ${unit.phase}` : ''} • {formatCurrency(unit.price)}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </>
                  )}
                </div>
              </section>
            ) : null}

            {activeStep === 'client' ? (
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Select From Pipeline" hint="Optional: pull through an existing lead and then edit as needed." fullWidth>
                    <select className={fieldClass()} value={form.pipelineLeadId} onChange={(event) => updateField('pipelineLeadId', event.target.value)}>
                      <option value="">Select existing lead</option>
                      {pipelineRows.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.name || 'Unnamed lead'} • {lead.source || 'No source'} • {lead.email || lead.phone || 'No contact'}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Name" error={errors.clientName}>
                    <input className={fieldClass()} value={form.clientName} onChange={(event) => updateField('clientName', event.target.value)} />
                  </Field>
                  <Field label="Surname" error={errors.clientSurname}>
                    <input className={fieldClass()} value={form.clientSurname} onChange={(event) => updateField('clientSurname', event.target.value)} />
                  </Field>
                  <Field label="Email" error={errors.clientEmail}>
                    <input className={fieldClass()} type="email" value={form.clientEmail} onChange={(event) => updateField('clientEmail', event.target.value)} />
                  </Field>
                  <Field label="Phone" error={errors.clientPhone}>
                    <input className={fieldClass()} value={form.clientPhone} onChange={(event) => updateField('clientPhone', event.target.value)} />
                  </Field>
                </div>
              </section>
            ) : null}

            {activeStep === 'terms' ? (
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Deal Value" error={errors.salesPrice}>
                    <input className={fieldClass()} type="number" min="0" step="1000" value={form.salesPrice} onChange={(event) => updateField('salesPrice', event.target.value)} />
                  </Field>
                  <Field label="Sale Date">
                    <input className={fieldClass()} type="date" value={form.saleDate} onChange={(event) => updateField('saleDate', event.target.value)} />
                  </Field>
                  {form.propertyMode === 'development' && form.reservationRequired ? (
                    <Field label="Reservation Deposit" error={errors.reservationAmount} hint="Shown only when the development requires a reservation deposit.">
                      <input className={fieldClass()} type="number" min="0" step="1000" value={form.reservationAmount} onChange={(event) => updateField('reservationAmount', event.target.value)} />
                    </Field>
                  ) : null}
                </div>
                <div className="mt-5 rounded-[16px] border border-[#dbe6f2] bg-[#f7fbff] px-4 py-3 text-sm text-[#48627f]">
                  Finance details and bond requirements will be captured during client onboarding.
                </div>
              </section>
            ) : null}

            {activeStep === 'attorney' ? (
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] px-4 py-4">
                  <p className="text-[0.82rem] font-semibold uppercase tracking-[0.08em] text-[#6f8298]">Transfer Attorney</p>
                  <p className="mt-1 text-sm text-[#5f748c]">Capture transfer attorney details manually for now.</p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label="Transfer Attorney Name" error={errors.attorneyName}>
                    <input
                      className={fieldClass()}
                      value={form.attorneyName}
                      onChange={(event) => updateField('attorneyName', event.target.value)}
                      placeholder="Attorney / firm name"
                    />
                  </Field>
                  <Field label="Transfer Attorney Email" error={errors.attorneyEmail}>
                    <input
                      className={fieldClass()}
                      type="email"
                      value={form.attorneyEmail}
                      onChange={(event) => updateField('attorneyEmail', event.target.value)}
                      placeholder="name@firm.co.za"
                    />
                  </Field>
                  <Field label="Transfer Attorney Number" error={errors.attorneyPhone}>
                    <input
                      className={fieldClass()}
                      value={form.attorneyPhone}
                      onChange={(event) => updateField('attorneyPhone', normalizePhoneInput(event.target.value))}
                      placeholder="082 000 0000"
                    />
                  </Field>
                </div>

                <div className="mt-4 rounded-[18px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                  <label className="flex items-center gap-3 text-sm font-semibold text-[#22374d]">
                    <input
                      type="checkbox"
                      checked={form.buyerRequestedDifferentAttorney}
                      onChange={(event) => updateField('buyerRequestedDifferentAttorney', event.target.checked)}
                    />
                    Buyer requested different attorney
                  </label>
                  {form.buyerRequestedDifferentAttorney ? (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <Field label="Attorney Name" error={errors.buyerAttorneyName}>
                        <input className={fieldClass()} value={form.buyerAttorneyName} onChange={(event) => updateField('buyerAttorneyName', event.target.value)} />
                      </Field>
                      <Field label="Firm" error={errors.buyerAttorneyFirm}>
                        <input className={fieldClass()} value={form.buyerAttorneyFirm} onChange={(event) => updateField('buyerAttorneyFirm', event.target.value)} />
                      </Field>
                      <Field label="Email">
                        <input className={fieldClass()} type="email" value={form.buyerAttorneyEmail} onChange={(event) => updateField('buyerAttorneyEmail', event.target.value)} />
                      </Field>
                      <Field label="Phone">
                        <input className={fieldClass()} value={form.buyerAttorneyPhone} onChange={(event) => updateField('buyerAttorneyPhone', event.target.value)} />
                      </Field>
                      <Field label="Notes" fullWidth>
                        <textarea className={fieldClass()} rows={3} value={form.buyerAttorneyNotes} onChange={(event) => updateField('buyerAttorneyNotes', event.target.value)} />
                      </Field>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {activeStep === 'review' ? (
              <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                  <h4 className="text-[1.04rem] font-semibold text-[#142132]">Review Deal Setup</h4>
                  <div className="mt-5 space-y-4 text-sm text-[#48627f]">
                    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Property</p>
                      <p className="mt-2 font-semibold text-[#22374d]">
                        {form.propertyMode === 'private'
                          ? selectedPrivateListing?.listingTitle || 'Listing pending'
                          : selectedDevelopment && selectedUnit
                            ? `${selectedDevelopment.name} • Unit ${selectedUnit.unit_number}`
                            : 'Development selection pending'}
                      </p>
                      <p className="mt-1">{formatCurrency(form.salesPrice)}</p>
                    </div>
                    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Client</p>
                      <p className="mt-2 font-semibold text-[#22374d]">{`${form.clientName} ${form.clientSurname}`.trim()}</p>
                      <p className="mt-1">{form.clientEmail} • {form.clientPhone}</p>
                    </div>
                    <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-4">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Transfer Attorney</p>
                      <p className="mt-2 font-semibold text-[#22374d]">{form.attorneyName || 'Pending'}</p>
                      {form.buyerRequestedDifferentAttorney ? (
                        <p className="mt-1 text-[#9a5b13]">Attorney change requested. Default attorney remains active until approval.</p>
                      ) : null}
                    </div>
                  </div>
                </section>

                <aside className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                  <h4 className="text-[1.04rem] font-semibold text-[#142132]">What happens next</h4>
                  <div className="mt-4 space-y-3">
                    {[
                      'Transaction will be created and linked to the selected property.',
                      'Client onboarding will be triggered immediately.',
                      'Transfer attorney will be notified.',
                      form.propertyMode === 'private'
                        ? 'Listing will move into an in-progress state.'
                        : 'Unit will move out of available status once the transaction is active.',
                    ].map((item) => (
                      <div key={item} className="flex gap-3 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-2.5">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#1f7d44]" />
                        <p className="text-sm text-[#48627f]">{item}</p>
                      </div>
                    ))}
                  </div>
                </aside>
              </section>
            ) : null}
          </>
        ) : (
          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={22} className="mt-0.5 text-[#1f7d44]" />
              <div className="space-y-2">
                <h4 className="text-[1.08rem] font-semibold text-[#142132]">Deal created successfully</h4>
                <p className="text-sm text-[#607387]">The transaction shell is live, the client onboarding flow has been triggered, and the transfer lane can now progress cleanly.</p>
                {createdDeal.onboardingUrl ? (
                  <a href={createdDeal.onboardingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1f4f78]">
                    <ExternalLink size={14} />
                    Open onboarding link
                  </a>
                ) : null}
                {createdDeal.attorneyChangeRequested ? (
                  <p className="text-sm text-[#9a5b13]">Attorney change request recorded. Default attorney remains active until approval is captured.</p>
                ) : null}
              </div>
            </div>
          </section>
        )}
      </div>
    </Modal>
  )
}

export default AgentNewDealWizard
