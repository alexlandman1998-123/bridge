import { ExternalLink, Mail, Copy } from 'lucide-react'
import { cloneElement, isValidElement, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createTransactionFromWizard,
  fetchDevelopmentOptions,
  fetchUnitsForTransactionSetup,
} from '../lib/api'
import { resolveTransactionOnboardingLink } from '../lib/onboardingLinks'
import { useWorkspace } from '../context/WorkspaceContext'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import Button from './ui/Button'
import Modal from './ui/Modal'

const STEPS = ['Transaction Setup']
const STEP_DESCRIPTIONS = [
  'Capture the property and client basics. Purchaser structure, finance setup, and supporting details will be completed on the onboarding link.',
]

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function createInitialForm(initialDevelopmentId = '') {
  return {
    setup: {
      transactionType: 'development',
      developmentId: initialDevelopmentId || '',
      unitId: '',
      propertyAddressLine1: '',
      propertyAddressLine2: '',
      suburb: '',
      city: '',
      province: '',
      postalCode: '',
      propertyDescription: '',
      buyerFirstName: '',
      buyerLastName: '',
      buyerPhone: '',
      buyerEmail: '',
      salesPrice: '',
      financeType: 'cash',
      financeManagedBy: 'bond_originator',
      purchaserType: 'individual',
      saleDate: todayIso(),
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
      reservationRequired: false,
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
  const { role } = useWorkspace()
  const [form, setForm] = useState(createInitialForm(initialDevelopmentId))
  const [developments, setDevelopments] = useState([])
  const [units, setUnits] = useState([])
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [loadingUnits, setLoadingUnits] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState('')
  const [createdTransaction, setCreatedTransaction] = useState(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setErrors({})
    setSaveError('')
    setForm(createInitialForm(initialDevelopmentId))
    setCreatedTransaction(null)

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
  const isAttorneyRole = role === 'attorney'
  const canChooseTransactionType = isAttorneyRole
  const isPrivateMatter = form.setup.transactionType === 'private'

  const selectedDevelopment = useMemo(
    () => developments.find((development) => development.id === form.setup.developmentId) || null,
    [developments, form.setup.developmentId],
  )

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

  const hasContextSidebar = Boolean(
    (selectedDevelopment && !isPrivateMatter) ||
      (selectedUnit && !isPrivateMatter),
  )

  function setSetupField(field, value) {
    setForm((previous) => {
      if (field === 'transactionType') {
        return {
          ...previous,
          setup: {
            ...previous.setup,
            transactionType: value,
            developmentId: value === 'development' ? previous.setup.developmentId : '',
            unitId: '',
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

  function setReservationRequired(required) {
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

  function setStatusField(field, value) {
    setForm((previous) => ({
      ...previous,
      status: {
        ...previous.status,
        [field]: value,
      },
    }))
  }

  function validateStep(targetStep) {
    const nextErrors = {}

    if (targetStep === 0) {
      if (isPrivateMatter) {
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

      if (form.finance.reservationRequired) {
        const reservationAmount = Number(form.finance.reservationAmount)
        if (!form.finance.reservationAmount || Number.isNaN(reservationAmount) || reservationAmount <= 0) {
          nextErrors.reservationAmount = 'Enter a valid reservation deposit amount.'
        }
      }

      if (!form.setup.buyerEmail.trim()) {
        nextErrors.buyerEmail = 'Client email is required.'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.setup.buyerEmail)) {
        nextErrors.buyerEmail = 'Enter a valid email address.'
      }

      if (!form.setup.buyerPhone.trim()) {
        nextErrors.buyerPhone = 'Client phone is required.'
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

  function handleDraftOnboardingEmail() {
    if (!createdTransaction?.buyerEmail || !onboardingUrl) {
      return
    }

    const subject = encodeURIComponent('Complete your Bridge property onboarding')
    const body = encodeURIComponent(
      `Hi ${createdTransaction.buyerName},\n\nPlease complete your property purchase onboarding here:\n${onboardingUrl}\n\nThis will capture your purchaser, finance, and compliance details for the transaction.\n\nRegards`,
    )
    window.location.href = `mailto:${createdTransaction.buyerEmail}?subject=${subject}&body=${body}`
  }

  async function handleSave() {
    if (!validateStep(0)) {
      return
    }

    try {
      setSaveError('')
      setSaving(true)
      const buyerName = `${form.setup.buyerFirstName} ${form.setup.buyerLastName}`.trim()
      const result = await createTransactionFromWizard({
        setup: {
          ...form.setup,
          buyerName,
        },
        finance: form.finance,
        status: {
          ...form.status,
          nextAction: form.status.nextAction || 'Send onboarding link to client.',
        },
      })

      const onboarding = await resolveTransactionOnboardingLink({
        transactionId: result.transactionId,
        purchaserType: form.setup.purchaserType,
      })

      try {
        await navigator.clipboard.writeText(onboarding.url)
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
      })
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
              navigate(`/transactions/${createdTransaction.transactionId}`)
            }
          }}
        >
          Open Transaction
        </Button>
      ) : (
        <Button onClick={handleSave} disabled={saving || loadingMeta}>
          Create Transaction & Generate Link
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
      <div className="space-y-3">
        <section className="rounded-[22px] border border-[#e3ebf5] bg-[linear-gradient(180deg,#f8fbff_0%,#f3f8fd_100%)] px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-3 rounded-[18px] border border-[#d9e4f1] bg-white px-4 py-3 text-[#162334] shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#35546c] text-sm font-semibold text-white">1</span>
              <div className="space-y-1">
                <small className="block text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[#7b8ba5]">Step 1</small>
                <strong className="text-sm font-semibold">Transaction Setup</strong>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-[#6b7d93]">
              Capture the property and client basics here. Purchaser structure, finance setup, and supporting details
              will be completed on the onboarding link.
            </p>
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
          <div className={hasContextSidebar ? 'grid items-start gap-4 xl:grid-cols-[minmax(0,1.62fr)_minmax(280px,0.88fr)]' : 'space-y-4'}>
            <div className="space-y-4">
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
                        <option value="development">Development Transaction</option>
                        <option value="private">Private Property Transaction</option>
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
                  <p className="text-sm leading-6 text-[#6b7d93]">Capture only the client basics here. The onboarding form will collect the rest.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Client Name" error={errors.buyerFirstName}>
                    <input
                      type="text"
                      value={form.setup.buyerFirstName}
                      onChange={(event) => setSetupField('buyerFirstName', event.target.value)}
                    />
                  </Field>

                  <Field label="Client Surname" error={errors.buyerLastName}>
                    <input
                      type="text"
                      value={form.setup.buyerLastName}
                      onChange={(event) => setSetupField('buyerLastName', event.target.value)}
                    />
                  </Field>

                  <Field label="Client Email" error={errors.buyerEmail}>
                    <input
                      type="email"
                      value={form.setup.buyerEmail}
                      onChange={(event) => setSetupField('buyerEmail', event.target.value)}
                    />
                  </Field>

                  <Field label="Client Phone" error={errors.buyerPhone}>
                    <input
                      type="text"
                      value={form.setup.buyerPhone}
                      onChange={(event) => setSetupField('buyerPhone', event.target.value)}
                    />
                  </Field>
                </div>
              </section>

              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                <div className="mb-4 space-y-1.5">
                  <h5 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Deal Terms</h5>
                  <p className="text-sm leading-6 text-[#6b7d93]">Keep the transaction seed light. Purchaser and finance structure will come from onboarding.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Sales Price" error={errors.salesPrice}>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={form.setup.salesPrice}
                      onChange={(event) => setSetupField('salesPrice', event.target.value)}
                    />
                  </Field>

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
                </div>
              </section>

              {!isPrivateMatter && form.setup.developmentId && !loadingUnits && !availableUnits.length ? (
                <section className="rounded-[20px] border border-[#f5d7a8] bg-[#fff8eb] p-4 text-sm leading-6 text-[#8a5a12]">
                  This development has no units currently marked as available, so a new transaction cannot be created here until stock is freed up or added.
                </section>
              ) : null}
            </div>

            {hasContextSidebar ? <div className="space-y-4 xl:sticky xl:top-4 self-start">
              {selectedDevelopment && !isPrivateMatter ? (
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
                  <h4 className="text-base font-semibold tracking-[-0.02em] text-[#142132]">{selectedDevelopment.name}</h4>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Planned Units</span>
                      <strong className="mt-1 block text-xl font-semibold text-[#142132]">{selectedDevelopment.planned_units ?? '-'}</strong>
                    </div>
                    <div>
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Configured Units</span>
                      <strong className="mt-1 block text-xl font-semibold text-[#142132]">{developmentStats.configuredUnits}</strong>
                    </div>
                    <div>
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Active Transactions</span>
                      <strong className="mt-1 block text-xl font-semibold text-[#142132]">{developmentStats.activeTransactions}</strong>
                    </div>
                    <div>
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Available Units</span>
                      <strong className="mt-1 block text-xl font-semibold text-[#142132]">{developmentStats.availableUnits}</strong>
                    </div>
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
                The onboarding link has been generated automatically for the client. Copy it, email it, or open it below.
              </p>
            </header>

            <section className="rounded-[20px] border border-[#d8e7dc] bg-white p-4">
              <h4 className="text-base font-semibold text-[#142132]">{createdTransaction.buyerName}</h4>
              <p className="mt-2 text-sm leading-6 text-[#516277]">
                {createdTransaction.transactionType === 'private'
                  ? `${createdTransaction.propertyLabel || 'Private property matter'} has been created.`
                  : `Unit ${createdTransaction.unitNumber} has been created.`}{' '}
                The onboarding handoff is ready for <strong>{createdTransaction.buyerEmail}</strong>.
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

            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={handleCopyOnboardingLink} disabled={!onboardingUrl}>
                <Copy size={14} />
                Copy Link
              </Button>
              <Button variant="secondary" onClick={handleDraftOnboardingEmail} disabled={!onboardingUrl}>
                <Mail size={14} />
                Draft Client Email
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
