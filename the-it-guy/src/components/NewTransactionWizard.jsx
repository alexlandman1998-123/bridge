import { ExternalLink, Copy } from 'lucide-react'
import { cloneElement, isValidElement, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createTransactionFromWizard,
  fetchDevelopmentOptions,
  resolveTransactionWhatsAppContacts,
  fetchUnitsForTransactionSetup,
} from '../lib/api'
import { resolveTransactionOnboardingLink } from '../lib/onboardingLinks'
import { useWorkspace } from '../context/WorkspaceContext'
import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { parseEdgeFunctionError } from '../lib/edgeFunctions'
import { sendWhatsAppNotification } from '../lib/whatsapp'
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
  const [reservationDecisionTouched, setReservationDecisionTouched] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    setErrors({})
    setSaveError('')
    setForm(createInitialForm(initialDevelopmentId))
    setCreatedTransaction(null)
    setReservationDecisionTouched(false)

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
      const result = await createTransactionFromWizard({
        setup: {
          ...form.setup,
          buyerName,
        },
        finance: form.finance,
        status: {
          ...form.status,
          nextAction: form.status.nextAction || (form.setup.allowIncomplete ? 'Complete stakeholder setup and assign legal roles.' : 'Send onboarding link to client.'),
        },
        options: {
          allowIncomplete: Boolean(form.setup.allowIncomplete),
        },
      })

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
          const clientPhone = normalizeLabel(whatsappContext?.client?.phone || form.setup.buyerPhone, '')
          const developerPhone = normalizeLabel(whatsappContext?.developer?.phone, '')
          const attorneyPhone = normalizeLabel(whatsappContext?.attorney?.phone, '')
          const agentName = normalizeLabel(form.setup.assignedAgent || whatsappContext?.agent?.name, 'Unassigned')

          console.log('[WhatsApp Debug] transaction-created role phones', {
            transactionId: result.transactionId,
            clientPhone,
            developerPhone,
            attorneyPhone,
            agentPhone: normalizeLabel(whatsappContext?.agent?.phone, ''),
          })

          const clientMessage = onboardingLink
            ? `Hi ${clientName}, welcome to Bridge. Your onboarding link for ${unitReference} at ${developmentName} is ready.\n\nPlease complete your onboarding here:\n${onboardingLink}`
            : `Hi ${clientName}, welcome to Bridge. Your onboarding link for ${unitReference} at ${developmentName} is ready.`

          console.log('WhatsApp trigger: onboarding link generated', {
            transactionId: result.transactionId,
            clientPhone,
          })

          if (!clientPhone) {
            console.warn('WhatsApp skipped: missing client phone', {
              transactionId: result.transactionId,
            })
          } else {
            const whatsappResult = await sendWhatsAppNotification({
              to: clientPhone,
              message: clientMessage,
            })
            console.log('WhatsApp notification sent', whatsappResult)
          }

          if (form.setup.agentInvolved) {
            console.log('[WhatsApp Debug] send attempt', {
              transactionId: result.transactionId,
              role: 'developer',
              phone: developerPhone,
            })
            await sendWhatsAppNotification({
              to: developerPhone,
              message: `New transaction created for ${unitReference} at ${developmentName}.\n\nClient: ${clientName}\nAgent: ${agentName}\n\nThe client onboarding link has been generated.`,
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
