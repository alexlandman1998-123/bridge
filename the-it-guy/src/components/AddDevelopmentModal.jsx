import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createDevelopmentWorkspace } from '../lib/api'
import Button from './ui/Button'
import Modal from './ui/Modal'

const STEPS = [
  { id: 'basic', label: 'Basic Info', description: 'Development identity and setup context' },
  { id: 'financials', label: 'Financials', description: 'Commercial and projected cost inputs' },
  { id: 'legal', label: 'Legal Setup', description: 'Attorney defaults and close-out behavior' },
  { id: 'units', label: 'Units', description: 'Stock master and list pricing' },
  { id: 'documents', label: 'Documents', description: 'Floorplans and shared assets' },
  { id: 'review', label: 'Review', description: 'Check the development before creation' },
]

const DEFAULT_DETAILS = {
  name: '',
  code: '',
  location: '',
  suburb: '',
  city: '',
  province: '',
  country: 'South Africa',
  address: '',
  status: 'active',
  developerCompany: '',
  totalUnitsExpected: '',
  launchDate: '',
  expectedCompletionDate: '',
  description: '',
  handoverEnabled: true,
  snagTrackingEnabled: true,
  alterationsEnabled: false,
  onboardingEnabled: true,
}

const DEFAULT_FINANCIALS = {
  landCost: '',
  buildCost: '',
  professionalFees: '',
  marketingCost: '',
  infrastructureCost: '',
  otherCosts: '',
  projectedGrossSalesValue: '',
  notes: '',
}

const DEFAULT_LEGAL = {
  enabledModules: {
    agent: true,
    conveyancing: true,
    bond_originator: true,
  },
  agents: [{ name: '', email: '', company: '' }],
  conveyancers: [{ firmName: '', contactName: '', email: '', phone: '', defaultFeeAmount: '' }],
  bondOriginators: [{ name: '', contactName: '', email: '', phone: '', commissionModelEnabled: false, commissionModelType: 'fixed_fee', commissionBase: 'purchase_price' }],
  attorneyFirmName: '',
  primaryContactName: '',
  primaryContactEmail: '',
  primaryContactPhone: '',
  defaultFeeAmount: '',
  vatIncluded: true,
  disbursementsIncluded: false,
  overrideAllowed: true,
  bondOriginatorName: '',
  bondPrimaryContactName: '',
  bondPrimaryContactEmail: '',
  bondPrimaryContactPhone: '',
  bondCommissionModelType: 'fixed_fee',
  bondVatIncluded: true,
  bondOverrideAllowed: true,
  requiredDocuments: [
    { key: 'attorney_invoice', label: 'Attorney Invoice', isRequired: true },
    { key: 'attorney_statement', label: 'Attorney Statement', isRequired: true },
    { key: 'registration_confirmation', label: 'Registration Confirmation', isRequired: true },
  ],
}

function buildEmptyAgent() {
  return {
    name: '',
    email: '',
    company: '',
  }
}

function buildEmptyConveyancer() {
  return {
    firmName: '',
    contactName: '',
    email: '',
    phone: '',
    defaultFeeAmount: '',
  }
}

function buildEmptyBondOriginator() {
  return {
    name: '',
    contactName: '',
    email: '',
    phone: '',
    commissionModelEnabled: false,
    commissionModelType: 'fixed_fee',
    commissionBase: 'purchase_price',
  }
}

function buildEmptyUnit() {
  return {
    unitNumber: '',
    unitLabel: '',
    unitType: '',
    phase: '',
    block: '',
    sizeSqm: '',
    listPrice: '',
    status: 'Available',
    floorplanId: '',
  }
}

function buildEmptyStockTemplate() {
  return {
    unitType: '',
    floorplanName: '',
    floorplanRef: '',
    sizeSqm: '',
    listPrice: '',
    quantity: '',
    status: 'Available',
  }
}

function buildEmptyDocument() {
  return {
    documentType: 'floorplan',
    title: '',
    description: '',
    fileUrl: '',
    linkedUnitType: '',
  }
}

function normalizeOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getResolvedDevelopmentLocation(details) {
  const explicitLocation = String(details.location || '').trim()
  if (explicitLocation) return explicitLocation

  const areaLabel = [details.suburb, details.city]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ')

  if (areaLabel) return areaLabel

  return String(details.address || '').trim()
}

function parseGroupingLabels(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeCodeFragment(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()

  return cleaned || fallback
}

function buildStockGroups(plan) {
  const phases = parseGroupingLabels(plan.phaseLabels)
  const blocks = parseGroupingLabels(plan.blockLabels)

  if (plan.groupingMode === 'phases') {
    return (phases.length ? phases : ['Phase 1']).map((phase) => ({ phase, block: '' }))
  }

  if (plan.groupingMode === 'blocks') {
    return (blocks.length ? blocks : ['Block A']).map((block) => ({ phase: '', block }))
  }

  if (plan.groupingMode === 'phase_and_block') {
    const phaseList = phases.length ? phases : ['Phase 1']
    const blockList = blocks.length ? blocks : ['Block A']

    return phaseList.flatMap((phase) => blockList.map((block) => ({ phase, block })))
  }

  return [{ phase: '', block: '' }]
}

function buildGeneratedUnitsFromStockPlan(plan) {
  const groups = buildStockGroups(plan)
  const templates = (plan.templates || []).filter((template) => Number(template.quantity || 0) > 0)

  return templates.flatMap((template, templateIndex) => {
    const quantity = Number(template.quantity || 0)
    const unitTypeCode = normalizeCodeFragment(template.unitType, `T${templateIndex + 1}`)

    return groups.flatMap((group, groupIndex) =>
      Array.from({ length: quantity }, (_, itemIndex) => {
        const prefix = [group.phase && normalizeCodeFragment(group.phase, `P${groupIndex + 1}`), group.block && normalizeCodeFragment(group.block, `B${groupIndex + 1}`), unitTypeCode]
          .filter(Boolean)
          .join('-')

        const sequence = String(itemIndex + 1).padStart(2, '0')

        return {
          ...buildEmptyUnit(),
          unitNumber: prefix ? `${prefix}-${sequence}` : `${templateIndex + 1}${sequence}`,
          unitLabel: template.floorplanName
            ? `${template.unitType || 'Unit'} • ${template.floorplanName} ${itemIndex + 1}`
            : `${template.unitType || 'Unit'} ${itemIndex + 1}`,
          unitType: template.unitType,
          phase: group.phase,
          block: group.block,
          sizeSqm: template.sizeSqm,
          listPrice: template.listPrice,
          status: template.status || 'Available',
          floorplanId: template.floorplanName || template.floorplanRef,
        }
      }),
    )
  })
}

function buildFloorplanDocumentsFromTemplates(templates) {
  const seen = new Set()

  return templates.flatMap((template) => {
    const floorplanName = String(template.floorplanName || '').trim()
    if (!floorplanName) return []

    const dedupeKey = `${floorplanName}::${template.unitType || ''}`
    if (seen.has(dedupeKey)) return []
    seen.add(dedupeKey)

    const descriptionBits = [
      template.unitType ? `${template.unitType} layout` : '',
      template.sizeSqm ? `${template.sizeSqm} sqm` : '',
      template.listPrice ? `from ${Number(template.listPrice).toLocaleString('en-ZA')}` : '',
    ].filter(Boolean)

    return [
      {
        ...buildEmptyDocument(),
        documentType: 'floorplan',
        title: floorplanName,
        description: descriptionBits.join(' • '),
        fileUrl: template.floorplanRef || '',
        linkedUnitType: template.unitType || '',
      },
    ]
  })
}

function AddDevelopmentModal({ open, onClose, onCreated }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [details, setDetails] = useState(DEFAULT_DETAILS)
  const [financials, setFinancials] = useState(DEFAULT_FINANCIALS)
  const [legal, setLegal] = useState(DEFAULT_LEGAL)
  const [units, setUnits] = useState([])
  const [documents, setDocuments] = useState([buildEmptyDocument()])
  const [stockPlan, setStockPlan] = useState({
    groupingMode: 'none',
    phaseLabels: '',
    blockLabels: '',
    templates: [buildEmptyStockTemplate()],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return

    setStepIndex(0)
    setDetails(DEFAULT_DETAILS)
    setFinancials(DEFAULT_FINANCIALS)
    setLegal(DEFAULT_LEGAL)
    setUnits([])
    setDocuments([buildEmptyDocument()])
    setStockPlan({
      groupingMode: 'none',
      phaseLabels: '',
      blockLabels: '',
      templates: [buildEmptyStockTemplate()],
    })
    setSaving(false)
    setError('')
  }, [open])

  const derivedTotals = useMemo(() => {
    const totalProjectedCost = ['landCost', 'buildCost', 'professionalFees', 'marketingCost', 'infrastructureCost', 'otherCosts'].reduce(
      (sum, key) => sum + Number(financials[key] || 0),
      0,
    )
    const projectedGrossSalesValue = Number(financials.projectedGrossSalesValue || 0)
    const projectedProfit = projectedGrossSalesValue - totalProjectedCost

    return {
      totalProjectedCost,
      projectedProfit,
      targetMargin: projectedGrossSalesValue ? (projectedProfit / projectedGrossSalesValue) * 100 : 0,
      unitCount: units.filter((unit) => String(unit.unitNumber || '').trim()).length,
      documentCount: documents.filter((document) => String(document.title || '').trim()).length,
    }
  }, [documents, financials, units])

  function updateUnit(index, key, value) {
    setUnits((previous) => previous.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)))
  }

  function updateDocument(index, key, value) {
    setDocuments((previous) => previous.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)))
  }

  function updateStockTemplate(index, key, value) {
    setStockPlan((previous) => ({
      ...previous,
      templates: previous.templates.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    }))
  }

  function updateLegalList(key, index, field, value) {
    setLegal((previous) => ({
      ...previous,
      [key]: previous[key].map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    }))
  }

  function validateCurrentStep() {
    if (stepIndex === 0) {
      if (!details.name.trim()) {
        throw new Error('Development name is required.')
      }
      if (!details.address.trim() && !details.suburb.trim() && !details.city.trim()) {
        throw new Error('Add at least a street address, suburb, or city for the development.')
      }
    }

    if (stepIndex === 3) {
      const hasUnits = units.some((unit) => String(unit.unitNumber || '').trim())
      if (!hasUnits) {
        throw new Error('Add at least one unit before creating the development.')
      }
    }
  }

  function handleNext() {
    try {
      setError('')
      validateCurrentStep()
      setStepIndex((previous) => Math.min(previous + 1, STEPS.length - 1))
    } catch (stepError) {
      setError(stepError.message)
    }
  }

  function handleSkipFinancials() {
    setError('')
    setStepIndex((previous) => Math.min(previous + 1, STEPS.length - 1))
  }

  function handleSkipLegal() {
    setError('')
    setStepIndex((previous) => Math.min(previous + 1, STEPS.length - 1))
  }

  function handleGenerateUnits() {
    const generatedUnits = buildGeneratedUnitsFromStockPlan(stockPlan)
    if (!generatedUnits.length) {
      setError('Add at least one unit type with a quantity before generating stock.')
      return
    }

    const generatedFloorplans = buildFloorplanDocumentsFromTemplates(stockPlan.templates)

    setError('')
    setUnits(generatedUnits)
    setDetails((previous) => ({
      ...previous,
      totalUnitsExpected: String(generatedUnits.length),
    }))
    setDocuments((previous) => {
      const existingKeys = new Set(previous.map((item) => `${item.documentType}::${item.title}::${item.linkedUnitType}`))
      const merged = [...previous]
      generatedFloorplans.forEach((item) => {
        const key = `${item.documentType}::${item.title}::${item.linkedUnitType}`
        if (!existingKeys.has(key)) {
          merged.push(item)
        }
      })
      return merged
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()

    try {
      setError('')
      validateCurrentStep()
      setSaving(true)

      const primaryConveyancer = legal.conveyancers.find((item) => String(item.firmName || item.contactName || item.email || '').trim())
      const primaryBondOriginator = legal.bondOriginators.find((item) => String(item.name || item.contactName || item.email || '').trim())

      const created = await createDevelopmentWorkspace({
        details: {
          ...details,
          location: getResolvedDevelopmentLocation(details),
          totalUnitsExpected: normalizeOptionalNumber(details.totalUnitsExpected) ?? derivedTotals.unitCount,
        },
        financials: {
          ...financials,
          landCost: normalizeOptionalNumber(financials.landCost) ?? 0,
          buildCost: normalizeOptionalNumber(financials.buildCost) ?? 0,
          professionalFees: normalizeOptionalNumber(financials.professionalFees) ?? 0,
          marketingCost: normalizeOptionalNumber(financials.marketingCost) ?? 0,
          infrastructureCost: normalizeOptionalNumber(financials.infrastructureCost) ?? 0,
          otherCosts: normalizeOptionalNumber(financials.otherCosts) ?? 0,
          totalProjectedCost: derivedTotals.totalProjectedCost,
          projectedGrossSalesValue: normalizeOptionalNumber(financials.projectedGrossSalesValue) ?? 0,
          projectedProfit: derivedTotals.projectedProfit,
          targetMargin: Number(derivedTotals.targetMargin.toFixed(2)),
        },
        legal: {
          ...legal,
          attorneyFirmName: primaryConveyancer?.firmName || '',
          primaryContactName: primaryConveyancer?.contactName || '',
          primaryContactEmail: primaryConveyancer?.email || '',
          primaryContactPhone: primaryConveyancer?.phone || '',
          defaultFeeAmount: primaryConveyancer?.defaultFeeAmount || '',
          bondOriginatorName: primaryBondOriginator?.name || '',
          bondPrimaryContactName: primaryBondOriginator?.contactName || '',
          bondPrimaryContactEmail: primaryBondOriginator?.email || '',
          bondPrimaryContactPhone: primaryBondOriginator?.phone || '',
          bondCommissionModelType: primaryBondOriginator?.commissionModelEnabled ? primaryBondOriginator?.commissionModelType || 'fixed_fee' : 'fixed_fee',
          defaultCommissionAmount: null,
        },
        developmentSettings: {
          enabledModules: legal.enabledModules,
          stakeholderTeams: {
            agents: legal.agents.filter((item) => String(item.name || item.email || item.company || '').trim()),
            conveyancers: legal.conveyancers.filter((item) => String(item.firmName || item.contactName || item.email || '').trim()),
            bondOriginators: legal.bondOriginators.filter((item) => String(item.name || item.contactName || item.email || '').trim()),
          },
        },
        units: units
          .filter((unit) => String(unit.unitNumber || '').trim())
          .map((unit) => ({
            ...unit,
            sizeSqm: normalizeOptionalNumber(unit.sizeSqm),
            listPrice: normalizeOptionalNumber(unit.listPrice) ?? 0,
          })),
        documents: documents
          .filter((document) => String(document.title || '').trim())
          .map((document) => ({
            ...document,
            fileUrl: document.fileUrl,
          })),
      })

      onCreated?.(created)
      onClose()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return null
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="New Development"
      subtitle="Create the development record, unit stock, legal defaults, and shared assets in one setup flow."
      className="max-w-[1180px]"
    >
      <div className="space-y-6">
        <ol className="grid gap-3 rounded-[24px] border border-[#e3ebf5] bg-[#f8fbff] p-4 md:grid-cols-2 xl:grid-cols-3">
          {STEPS.map((step, index) => {
            const status = index === stepIndex ? 'active' : index < stepIndex ? 'complete' : ''
            return (
              <li
                key={step.id}
                className={`flex items-center gap-3 rounded-[18px] border px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)] ${
                  status === 'active'
                    ? 'border-[#b9cee6] bg-[#35546c] text-white'
                    : status === 'complete'
                      ? 'border-[#d8e7dc] bg-[#f3fbf5] text-[#1f6d3c]'
                      : 'border-[#d9e4f1] bg-white text-[#162334]'
                }`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${
                    status === 'active'
                      ? 'bg-white/20 text-white'
                      : status === 'complete'
                        ? 'bg-[#d8e7dc] text-[#1f6d3c]'
                        : 'bg-[#eff4f8] text-[#35546c]'
                  }`}
                >
                  {index + 1}
                </span>
                <div className="space-y-1">
                  <small className={`block text-[0.72rem] font-semibold uppercase tracking-[0.18em] ${status === 'active' ? 'text-white/75' : 'text-[#8ba0b8]'}`}>
                    {step.label}
                  </small>
                  <strong className="text-sm font-semibold">{step.description}</strong>
                </div>
              </li>
            )
          })}
        </ol>

        {error ? (
          <p className="rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">{error}</p>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="space-y-6 [&_.full-width]:md:col-span-2 [&_.full-width]:xl:col-span-3 [&_input:not([type='checkbox'])]:w-full [&_input:not([type='checkbox'])]:rounded-[14px] [&_input:not([type='checkbox'])]:border [&_input:not([type='checkbox'])]:border-[#dde4ee] [&_input:not([type='checkbox'])]:bg-white [&_input:not([type='checkbox'])]:px-4 [&_input:not([type='checkbox'])]:py-3 [&_input:not([type='checkbox'])]:text-sm [&_input:not([type='checkbox'])]:text-[#162334] [&_input:not([type='checkbox'])]:shadow-[0_10px_24px_rgba(15,23,42,0.06)] [&_input:not([type='checkbox'])]:outline-none [&_input:not([type='checkbox'])]:transition [&_input:not([type='checkbox'])]:duration-150 [&_input:not([type='checkbox'])]:ease-out [&_input:not([type='checkbox'])]:placeholder:text-slate-400 [&_input:not([type='checkbox'])]:focus:border-[rgba(29,78,216,0.35)] [&_input:not([type='checkbox'])]:focus:ring-4 [&_input:not([type='checkbox'])]:focus:ring-[rgba(29,78,216,0.1)] [&_input[type='checkbox']]:h-5 [&_input[type='checkbox']]:w-5 [&_input[type='checkbox']]:rounded-md [&_input[type='checkbox']]:border [&_input[type='checkbox']]:border-[#c9d5e3] [&_input[type='checkbox']]:text-[#35546c] [&_input[type='checkbox']]:shadow-none [&_input[type='checkbox']]:accent-[#35546c] [&_select]:w-full [&_select]:rounded-[14px] [&_select]:border [&_select]:border-[#dde4ee] [&_select]:bg-white [&_select]:px-4 [&_select]:py-3 [&_select]:text-sm [&_select]:text-[#162334] [&_select]:shadow-[0_10px_24px_rgba(15,23,42,0.06)] [&_select]:outline-none [&_select]:transition [&_select]:duration-150 [&_select]:ease-out [&_select]:focus:border-[rgba(29,78,216,0.35)] [&_select]:focus:ring-4 [&_select]:focus:ring-[rgba(29,78,216,0.1)] [&_textarea]:w-full [&_textarea]:rounded-[14px] [&_textarea]:border [&_textarea]:border-[#dde4ee] [&_textarea]:bg-white [&_textarea]:px-4 [&_textarea]:py-3 [&_textarea]:text-sm [&_textarea]:text-[#162334] [&_textarea]:shadow-[0_10px_24px_rgba(15,23,42,0.06)] [&_textarea]:outline-none [&_textarea]:transition [&_textarea]:duration-150 [&_textarea]:ease-out [&_textarea]:placeholder:text-slate-400 [&_textarea]:focus:border-[rgba(29,78,216,0.35)] [&_textarea]:focus:ring-4 [&_textarea]:focus:ring-[rgba(29,78,216,0.1)] [&_label]:flex [&_label]:min-w-0 [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label]:font-medium [&_label]:text-[#233247]"
        >
          {stepIndex === 0 ? (
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <div className="mb-5 space-y-2">
                <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Development Identity</h4>
                <p className="text-sm leading-6 text-[#6b7d93]">Capture the location, developer record, and launch context for the workspace.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label>
                Development Name
                <input value={details.name} onChange={(event) => setDetails((previous) => ({ ...previous, name: event.target.value }))} />
              </label>
              <label>
                Development Code
                <input value={details.code} onChange={(event) => setDetails((previous) => ({ ...previous, code: event.target.value }))} />
              </label>
              <label className="full-width">
                Street Address
                <input value={details.address} onChange={(event) => setDetails((previous) => ({ ...previous, address: event.target.value }))} />
              </label>
              <label>
                Suburb
                <input value={details.suburb} onChange={(event) => setDetails((previous) => ({ ...previous, suburb: event.target.value }))} />
              </label>
              <label>
                City
                <input value={details.city} onChange={(event) => setDetails((previous) => ({ ...previous, city: event.target.value }))} />
              </label>
              <label>
                Province
                <input value={details.province} onChange={(event) => setDetails((previous) => ({ ...previous, province: event.target.value }))} />
              </label>
              <label>
                Status
                <select value={details.status} onChange={(event) => setDetails((previous) => ({ ...previous, status: event.target.value }))}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label>
                Expected Units
                <input type="number" min="0" value={details.totalUnitsExpected} onChange={(event) => setDetails((previous) => ({ ...previous, totalUnitsExpected: event.target.value }))} />
              </label>
              <label>
                Developer Company
                <input value={details.developerCompany} onChange={(event) => setDetails((previous) => ({ ...previous, developerCompany: event.target.value }))} />
              </label>
              <label>
                Launch Date
                <input type="date" value={details.launchDate} onChange={(event) => setDetails((previous) => ({ ...previous, launchDate: event.target.value }))} />
              </label>
              <label>
                Expected Completion
                <input type="date" value={details.expectedCompletionDate} onChange={(event) => setDetails((previous) => ({ ...previous, expectedCompletionDate: event.target.value }))} />
              </label>
              <label>
                Country
                <input value={details.country} onChange={(event) => setDetails((previous) => ({ ...previous, country: event.target.value }))} />
              </label>
              <label className="full-width">
                Description
                <textarea rows={4} value={details.description} onChange={(event) => setDetails((previous) => ({ ...previous, description: event.target.value }))} />
              </label>
              </div>
            </section>
          ) : null}

          {stepIndex === 1 ? (
            <>
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                <div className="mb-5 space-y-2">
                  <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Commercial Inputs</h4>
                  <p className="text-sm leading-6 text-[#6b7d93]">Set the base commercial assumptions that seed the development workspace.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label>
                  Land Cost
                  <input type="number" min="0" value={financials.landCost} onChange={(event) => setFinancials((previous) => ({ ...previous, landCost: event.target.value }))} />
                </label>
                <label>
                  Build Cost
                  <input type="number" min="0" value={financials.buildCost} onChange={(event) => setFinancials((previous) => ({ ...previous, buildCost: event.target.value }))} />
                </label>
                <label>
                  Professional Fees
                  <input type="number" min="0" value={financials.professionalFees} onChange={(event) => setFinancials((previous) => ({ ...previous, professionalFees: event.target.value }))} />
                </label>
                <label>
                  Marketing Cost
                  <input type="number" min="0" value={financials.marketingCost} onChange={(event) => setFinancials((previous) => ({ ...previous, marketingCost: event.target.value }))} />
                </label>
                <label>
                  Infrastructure Cost
                  <input type="number" min="0" value={financials.infrastructureCost} onChange={(event) => setFinancials((previous) => ({ ...previous, infrastructureCost: event.target.value }))} />
                </label>
                <label>
                  Other Costs
                  <input type="number" min="0" value={financials.otherCosts} onChange={(event) => setFinancials((previous) => ({ ...previous, otherCosts: event.target.value }))} />
                </label>
                <label>
                  Projected Gross Sales Value
                  <input type="number" min="0" value={financials.projectedGrossSalesValue} onChange={(event) => setFinancials((previous) => ({ ...previous, projectedGrossSalesValue: event.target.value }))} />
                </label>
                <label className="full-width">
                  Financial Notes
                  <textarea rows={4} value={financials.notes} onChange={(event) => setFinancials((previous) => ({ ...previous, notes: event.target.value }))} />
                </label>
                </div>
              </section>

              <div className="grid gap-4 md:grid-cols-3">
                <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                  <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Derived Projected Cost</span>
                  <strong className="mt-3 block text-2xl font-semibold tracking-[-0.03em] text-[#142132]">{derivedTotals.totalProjectedCost.toLocaleString('en-ZA')}</strong>
                </article>
                <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                  <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Derived Projected Profit</span>
                  <strong className="mt-3 block text-2xl font-semibold tracking-[-0.03em] text-[#142132]">{derivedTotals.projectedProfit.toLocaleString('en-ZA')}</strong>
                </article>
                <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                  <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Derived Margin</span>
                  <strong className="mt-3 block text-2xl font-semibold tracking-[-0.03em] text-[#142132]">{derivedTotals.targetMargin.toFixed(1)}%</strong>
                </article>
              </div>
            </>
          ) : null}

          {stepIndex === 2 ? (
            <>
              <section className="space-y-5 rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                <div className="space-y-2">
                  <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Modules & Delivery Partners</h4>
                  <p className="text-sm leading-6 text-[#6b7d93]">Select which modules apply to this development and add the teams that can later be allocated per transaction.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                <label className="!flex-row !items-start !justify-between !gap-4 rounded-[22px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">Agent</strong>
                    <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Allow agent assignment from this development team list.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={legal.enabledModules.agent}
                    onChange={(event) =>
                      setLegal((previous) => ({
                        ...previous,
                        enabledModules: { ...previous.enabledModules, agent: event.target.checked },
                      }))
                    }
                  />
                </label>
                <label className="!flex-row !items-start !justify-between !gap-4 rounded-[22px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">Conveyancing</strong>
                    <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Configure one or more conveyancers for transaction allocation.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={legal.enabledModules.conveyancing}
                    onChange={(event) =>
                      setLegal((previous) => ({
                        ...previous,
                        enabledModules: { ...previous.enabledModules, conveyancing: event.target.checked },
                      }))
                    }
                  />
                </label>
                <label className="!flex-row !items-start !justify-between !gap-4 rounded-[22px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">Bond Originator</strong>
                    <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Configure one or more bond originators for transaction allocation.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={legal.enabledModules.bond_originator}
                    onChange={(event) =>
                      setLegal((previous) => ({
                        ...previous,
                        enabledModules: { ...previous.enabledModules, bond_originator: event.target.checked },
                      }))
                    }
                  />
                </label>
                </div>
              </section>

              {legal.enabledModules.agent ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Agent Team</h4>
                    <p className="text-sm leading-6 text-[#6b7d93]">Add the agents that can be selected later on the transaction overview.</p>
                  </div>
                  {legal.agents.map((agent, index) => (
                    <div key={`agent-${index}`} className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <label>
                          Agent Name
                          <input value={agent.name} onChange={(event) => updateLegalList('agents', index, 'name', event.target.value)} />
                        </label>
                        <label>
                          Agent Email
                          <input type="email" value={agent.email} onChange={(event) => updateLegalList('agents', index, 'email', event.target.value)} />
                        </label>
                        <label>
                          Company
                          <input value={agent.company} onChange={(event) => updateLegalList('agents', index, 'company', event.target.value)} />
                        </label>
                      </div>
                      {legal.agents.length > 1 ? (
                        <Button type="button" variant="ghost" className="mt-4 text-[#b42318] hover:bg-[#fff5f4]" onClick={() => setLegal((previous) => ({ ...previous, agents: previous.agents.filter((_, itemIndex) => itemIndex !== index) }))}>
                          <Trash2 size={14} />
                          Remove Agent
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={() => setLegal((previous) => ({ ...previous, agents: [...previous.agents, buildEmptyAgent()] }))}>
                    <Plus size={14} />
                    Add Another Agent
                  </Button>
                </div>
              ) : null}

              {legal.enabledModules.conveyancing ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Conveyancing Team</h4>
                    <p className="text-sm leading-6 text-[#6b7d93]">The first conveyancer entered here becomes the default mandated firm for this development.</p>
                  </div>
                  {legal.conveyancers.map((conveyancer, index) => (
                    <div key={`conveyancer-${index}`} className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <label>
                          Firm Name
                          <input value={conveyancer.firmName} onChange={(event) => updateLegalList('conveyancers', index, 'firmName', event.target.value)} />
                        </label>
                        <label>
                          Contact Name
                          <input value={conveyancer.contactName} onChange={(event) => updateLegalList('conveyancers', index, 'contactName', event.target.value)} />
                        </label>
                        <label>
                          Contact Email
                          <input type="email" value={conveyancer.email} onChange={(event) => updateLegalList('conveyancers', index, 'email', event.target.value)} />
                        </label>
                        <label>
                          Contact Phone
                          <input value={conveyancer.phone} onChange={(event) => updateLegalList('conveyancers', index, 'phone', event.target.value)} />
                        </label>
                        <label>
                          Budgeted Transfer Fee Per Unit
                          <input type="number" min="0" value={conveyancer.defaultFeeAmount} onChange={(event) => updateLegalList('conveyancers', index, 'defaultFeeAmount', event.target.value)} />
                        </label>
                      </div>
                      {legal.conveyancers.length > 1 ? (
                        <Button type="button" variant="ghost" className="mt-4 text-[#b42318] hover:bg-[#fff5f4]" onClick={() => setLegal((previous) => ({ ...previous, conveyancers: previous.conveyancers.filter((_, itemIndex) => itemIndex !== index) }))}>
                          <Trash2 size={14} />
                          Remove Conveyancer
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={() => setLegal((previous) => ({ ...previous, conveyancers: [...previous.conveyancers, buildEmptyConveyancer()] }))}>
                    <Plus size={14} />
                    Add Another Conveyancer
                  </Button>
                </div>
              ) : null}

              {legal.enabledModules.bond_originator ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Bond Originators</h4>
                    <p className="text-sm leading-6 text-[#6b7d93]">The first originator entered here becomes the default commercial setup for this development.</p>
                  </div>
                  {legal.bondOriginators.map((originator, index) => (
                    <div key={`bond-originator-${index}`} className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <label>
                          Originator Name
                          <input value={originator.name} onChange={(event) => updateLegalList('bondOriginators', index, 'name', event.target.value)} />
                        </label>
                        <label>
                          Contact Name
                          <input value={originator.contactName} onChange={(event) => updateLegalList('bondOriginators', index, 'contactName', event.target.value)} />
                        </label>
                        <label>
                          Contact Email
                          <input type="email" value={originator.email} onChange={(event) => updateLegalList('bondOriginators', index, 'email', event.target.value)} />
                        </label>
                        <label>
                          Contact Phone
                          <input value={originator.phone} onChange={(event) => updateLegalList('bondOriginators', index, 'phone', event.target.value)} />
                        </label>
                        <label>
                          Commission Model Enabled
                          <select
                            value={originator.commissionModelEnabled ? 'enabled' : 'disabled'}
                            onChange={(event) => updateLegalList('bondOriginators', index, 'commissionModelEnabled', event.target.value === 'enabled')}
                          >
                            <option value="disabled">Disabled</option>
                            <option value="enabled">Enabled</option>
                          </select>
                        </label>
                        {originator.commissionModelEnabled ? (
                          <>
                            <label>
                              Commission Model
                              <select value={originator.commissionModelType} onChange={(event) => updateLegalList('bondOriginators', index, 'commissionModelType', event.target.value)}>
                                <option value="fixed_fee">Fixed Amount</option>
                                <option value="percentage">Percentage</option>
                              </select>
                            </label>
                            {originator.commissionModelType === 'percentage' ? (
                              <label>
                                Percentage Base
                                <select value={originator.commissionBase || 'purchase_price'} onChange={(event) => updateLegalList('bondOriginators', index, 'commissionBase', event.target.value)}>
                                  <option value="purchase_price">Full Purchase Price</option>
                                  <option value="bond_amount">Bond Amount Only</option>
                                </select>
                              </label>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                      {legal.bondOriginators.length > 1 ? (
                        <Button type="button" variant="ghost" className="mt-4 text-[#b42318] hover:bg-[#fff5f4]" onClick={() => setLegal((previous) => ({ ...previous, bondOriginators: previous.bondOriginators.filter((_, itemIndex) => itemIndex !== index) }))}>
                          <Trash2 size={14} />
                          Remove Bond Originator
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={() => setLegal((previous) => ({ ...previous, bondOriginators: [...previous.bondOriginators, buildEmptyBondOriginator()] }))}>
                    <Plus size={14} />
                    Add Another Bond Originator
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-3">
                <label className="!flex-row !items-start !justify-between !gap-4 rounded-[22px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">VAT Included</strong>
                    <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Use VAT-inclusive legal fees by default.</span>
                  </div>
                  <input type="checkbox" checked={legal.vatIncluded} onChange={(event) => setLegal((previous) => ({ ...previous, vatIncluded: event.target.checked }))} />
                </label>
                <label className="!flex-row !items-start !justify-between !gap-4 rounded-[22px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">Disbursements Included</strong>
                    <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Include disbursements in the fee default.</span>
                  </div>
                  <input type="checkbox" checked={legal.disbursementsIncluded} onChange={(event) => setLegal((previous) => ({ ...previous, disbursementsIncluded: event.target.checked }))} />
                </label>
                <label className="!flex-row !items-start !justify-between !gap-4 rounded-[22px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                  <div>
                    <strong className="block text-sm font-semibold text-[#142132]">Manual Override Allowed</strong>
                    <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Allow transaction-level override of legal fee defaults.</span>
                  </div>
                  <input type="checkbox" checked={legal.overrideAllowed} onChange={(event) => setLegal((previous) => ({ ...previous, overrideAllowed: event.target.checked }))} />
                </label>
              </div>

              <div className="space-y-4 rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Required Close-Out Documents</h4>
                <div className="grid gap-4 md:grid-cols-3">
                  {legal.requiredDocuments.map((item) => (
                    <label key={item.key} className="!flex-row !items-start !justify-between !gap-4 rounded-[22px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                      <div>
                        <strong className="block text-sm font-semibold text-[#142132]">{item.label}</strong>
                        <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Required before the attorney close-out can be completed.</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={item.isRequired}
                        onChange={(event) =>
                          setLegal((previous) => ({
                            ...previous,
                            requiredDocuments: previous.requiredDocuments.map((requiredDocument) =>
                              requiredDocument.key === item.key ? { ...requiredDocument, isRequired: event.target.checked } : requiredDocument,
                            ),
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {stepIndex === 3 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Stock Master</h4>
                <p className="text-sm leading-6 text-[#6b7d93]">Define your unit types, floorplans, sizes, pricing, and phase/block structure once. Bridge will generate the unit rows for you.</p>
              </div>
              <section className="space-y-5 rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label>
                    Stock Structure
                    <select
                      value={stockPlan.groupingMode}
                      onChange={(event) =>
                        setStockPlan((previous) => ({
                          ...previous,
                          groupingMode: event.target.value,
                        }))
                      }
                    >
                      <option value="none">Single release</option>
                      <option value="phases">By phase</option>
                      <option value="blocks">By block</option>
                      <option value="phase_and_block">By phase and block</option>
                    </select>
                  </label>
                  {stockPlan.groupingMode === 'phases' || stockPlan.groupingMode === 'phase_and_block' ? (
                    <label className="full-width xl:!col-span-1">
                      Phase Names
                      <input
                        value={stockPlan.phaseLabels}
                        onChange={(event) => setStockPlan((previous) => ({ ...previous, phaseLabels: event.target.value }))}
                        placeholder="Phase 1, Phase 2"
                      />
                    </label>
                  ) : null}
                  {stockPlan.groupingMode === 'blocks' || stockPlan.groupingMode === 'phase_and_block' ? (
                    <label className="full-width xl:!col-span-1">
                      Block Names
                      <input
                        value={stockPlan.blockLabels}
                        onChange={(event) => setStockPlan((previous) => ({ ...previous, blockLabels: event.target.value }))}
                        placeholder="Block A, Block B"
                      />
                    </label>
                  ) : null}
                </div>

                <div className="rounded-[22px] border border-[#e3ebf5] bg-[#f8fbff] p-4">
                  <div className="mb-4 space-y-1">
                    <h5 className="text-base font-semibold text-[#142132]">Unit Types & Floorplans</h5>
                    <p className="text-sm leading-6 text-[#6b7d93]">Add each unit type once with its floorplan, size, price, and quantity. Matching floorplan drafts will be carried into the documents step.</p>
                  </div>

                  <div className="space-y-4">
                    {stockPlan.templates.map((template, index) => (
                      <div key={`stock-template-${index}`} className="rounded-[20px] border border-[#dde4ee] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          <label>
                            Unit Type
                            <input value={template.unitType} onChange={(event) => updateStockTemplate(index, 'unitType', event.target.value)} placeholder="2 Bed Apartment" />
                          </label>
                          <label>
                            Floorplan Name
                            <input value={template.floorplanName} onChange={(event) => updateStockTemplate(index, 'floorplanName', event.target.value)} placeholder="FP-A1" />
                          </label>
                          <label>
                            Floorplan File / Reference
                            <input value={template.floorplanRef} onChange={(event) => updateStockTemplate(index, 'floorplanRef', event.target.value)} placeholder="Upload later or paste a link/ref" />
                          </label>
                          <label>
                            Size (sqm)
                            <input type="number" min="0" value={template.sizeSqm} onChange={(event) => updateStockTemplate(index, 'sizeSqm', event.target.value)} />
                          </label>
                          <label>
                            List Price
                            <input type="number" min="0" value={template.listPrice} onChange={(event) => updateStockTemplate(index, 'listPrice', event.target.value)} />
                          </label>
                          <label>
                            Quantity {stockPlan.groupingMode === 'none' ? '' : 'per group'}
                            <input type="number" min="0" value={template.quantity} onChange={(event) => updateStockTemplate(index, 'quantity', event.target.value)} />
                          </label>
                          <label>
                            Default Status
                            <select value={template.status} onChange={(event) => updateStockTemplate(index, 'status', event.target.value)}>
                              <option value="Available">Available</option>
                              <option value="Reserved">Reserved</option>
                              <option value="Sold">Sold</option>
                              <option value="Registered">Registered</option>
                              <option value="Blocked">Blocked</option>
                            </select>
                          </label>
                        </div>
                        {stockPlan.templates.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="mt-4 text-[#b42318] hover:bg-[#fff5f4]"
                            onClick={() =>
                              setStockPlan((previous) => ({
                                ...previous,
                                templates: previous.templates.filter((_, itemIndex) => itemIndex !== index),
                              }))
                            }
                          >
                            <Trash2 size={14} />
                            Remove Unit Type
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setStockPlan((previous) => ({
                          ...previous,
                          templates: [...previous.templates, buildEmptyStockTemplate()],
                        }))
                      }
                    >
                      <Plus size={14} />
                      Add Another Unit Type
                    </Button>
                    <Button type="button" onClick={handleGenerateUnits}>
                      Generate Units
                    </Button>
                  </div>
                </div>
              </section>

              {units.length ? (
                <div className="space-y-2">
                  <h5 className="text-base font-semibold text-[#142132]">Generated Unit Preview</h5>
                  <p className="text-sm leading-6 text-[#6b7d93]">Bridge generated {units.length} units from your stock plan. You can still fine-tune any row below.</p>
                </div>
              ) : null}
              {units.map((unit, index) => (
                <div key={`unit-${index}`} className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label>
                      Unit Number
                      <input value={unit.unitNumber} onChange={(event) => updateUnit(index, 'unitNumber', event.target.value)} />
                    </label>
                    <label>
                      Unit Label
                      <input value={unit.unitLabel} onChange={(event) => updateUnit(index, 'unitLabel', event.target.value)} />
                    </label>
                    <label>
                      Unit Type
                      <input value={unit.unitType} onChange={(event) => updateUnit(index, 'unitType', event.target.value)} />
                    </label>
                    <label>
                      Phase
                      <input value={unit.phase} onChange={(event) => updateUnit(index, 'phase', event.target.value)} />
                    </label>
                    <label>
                      Block
                      <input value={unit.block} onChange={(event) => updateUnit(index, 'block', event.target.value)} />
                    </label>
                    <label>
                      Size (sqm)
                      <input type="number" min="0" value={unit.sizeSqm} onChange={(event) => updateUnit(index, 'sizeSqm', event.target.value)} />
                    </label>
                    <label>
                      List Price
                      <input type="number" min="0" value={unit.listPrice} onChange={(event) => updateUnit(index, 'listPrice', event.target.value)} />
                    </label>
                    <label>
                      Floorplan Link / ID
                      <input value={unit.floorplanId} onChange={(event) => updateUnit(index, 'floorplanId', event.target.value)} />
                    </label>
                    <label>
                      Status
                      <select value={unit.status} onChange={(event) => updateUnit(index, 'status', event.target.value)}>
                        <option value="Available">Available</option>
                        <option value="Reserved">Reserved</option>
                        <option value="Sold">Sold</option>
                        <option value="Registered">Registered</option>
                        <option value="Blocked">Blocked</option>
                      </select>
                    </label>
                  </div>
                  {units.length > 1 ? (
                    <Button type="button" variant="ghost" className="mt-4 text-[#b42318] hover:bg-[#fff5f4]" onClick={() => setUnits((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}>
                      <Trash2 size={14} />
                      Remove Unit
                    </Button>
                  ) : null}
                </div>
              ))}
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Button type="button" variant="secondary" onClick={() => setUnits((previous) => [...previous, buildEmptyUnit()])}>
                  <Plus size={14} />
                  Add Manual Unit
                </Button>
              </div>
            </div>
          ) : null}

          {stepIndex === 4 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Development Documents / Assets</h4>
                <p className="text-sm leading-6 text-[#6b7d93]">Add floorplans, pricing sheets, brochures, site plans, and shared specification material.</p>
              </div>
              {documents.map((document, index) => (
                <div key={`document-${index}`} className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label>
                      Document Type
                      <select value={document.documentType} onChange={(event) => updateDocument(index, 'documentType', event.target.value)}>
                        <option value="floorplan">Floorplan</option>
                        <option value="pricing">Pricing / Sales</option>
                        <option value="marketing">Marketing Asset</option>
                        <option value="site_plan">Site Plan</option>
                        <option value="legal">Development Legal / Compliance</option>
                        <option value="specification">Specification / Finishes</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>
                      Title
                      <input value={document.title} onChange={(event) => updateDocument(index, 'title', event.target.value)} />
                    </label>
                    <label>
                      Linked Unit Type
                      <input value={document.linkedUnitType} onChange={(event) => updateDocument(index, 'linkedUnitType', event.target.value)} />
                    </label>
                    <label className="full-width">
                      File URL / Reference
                      <input value={document.fileUrl} onChange={(event) => updateDocument(index, 'fileUrl', event.target.value)} />
                    </label>
                    <label className="full-width">
                      Description
                      <textarea rows={3} value={document.description} onChange={(event) => updateDocument(index, 'description', event.target.value)} />
                    </label>
                  </div>
                  {documents.length > 1 ? (
                    <Button type="button" variant="ghost" className="mt-4 text-[#b42318] hover:bg-[#fff5f4]" onClick={() => setDocuments((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}>
                      <Trash2 size={14} />
                      Remove Document
                    </Button>
                  ) : null}
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={() => setDocuments((previous) => [...previous, buildEmptyDocument()])}>
                <Plus size={14} />
                Add Another Asset
              </Button>
            </div>
          ) : null}

          {stepIndex === 5 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Development</span>
                <strong className="mt-3 block text-lg font-semibold tracking-[-0.02em] text-[#142132]">{details.name || 'Not set'}</strong>
                <em className="mt-2 block text-sm not-italic text-[#6b7d93]">{getResolvedDevelopmentLocation(details) || 'Location pending'}</em>
              </article>
              <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Status</span>
                <strong className="mt-3 block text-lg font-semibold tracking-[-0.02em] text-[#142132]">{details.status || 'active'}</strong>
                <em className="mt-2 block text-sm not-italic text-[#6b7d93]">{details.totalUnitsExpected || derivedTotals.unitCount} expected units</em>
              </article>
              <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Projected Cost</span>
                <strong className="mt-3 block text-lg font-semibold tracking-[-0.02em] text-[#142132]">{derivedTotals.totalProjectedCost.toLocaleString('en-ZA')}</strong>
                <em className="mt-2 block text-sm not-italic text-[#6b7d93]">Projected profit {derivedTotals.projectedProfit.toLocaleString('en-ZA')}</em>
              </article>
              <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Modules Enabled</span>
                <strong className="mt-3 block text-lg font-semibold tracking-[-0.02em] text-[#142132]">
                  {Object.entries(legal.enabledModules)
                    .filter(([, enabled]) => enabled)
                    .map(([key]) => key.replaceAll('_', ' '))
                    .join(', ') || 'None selected'}
                </strong>
                <em className="mt-2 block text-sm not-italic text-[#6b7d93]">
                  {legal.agents.filter((item) => item.name).length} agents • {legal.conveyancers.filter((item) => item.firmName).length} conveyancers •{' '}
                  {legal.bondOriginators.filter((item) => item.name).length} bond originators
                </em>
              </article>
              <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Units Added</span>
                <strong className="mt-3 block text-lg font-semibold tracking-[-0.02em] text-[#142132]">{derivedTotals.unitCount}</strong>
                <em className="mt-2 block text-sm not-italic text-[#6b7d93]">Transactions will pull from this stock list</em>
              </article>
              <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Assets Added</span>
                <strong className="mt-3 block text-lg font-semibold tracking-[-0.02em] text-[#142132]">{derivedTotals.documentCount}</strong>
                <em className="mt-2 block text-sm not-italic text-[#6b7d93]">Floorplans and shared development documents</em>
              </article>
            </div>
          ) : null}

          <footer className="flex flex-col gap-3 border-t border-[#edf2f7] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="ghost" onClick={stepIndex === 0 ? onClose : () => setStepIndex((previous) => Math.max(previous - 1, 0))} disabled={saving}>
              {stepIndex === 0 ? 'Cancel' : 'Back'}
            </Button>
            {stepIndex < STEPS.length - 1 ? (
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                {stepIndex === 1 ? (
                  <Button type="button" variant="secondary" onClick={handleSkipFinancials} disabled={saving}>
                    Skip for Now
                  </Button>
                ) : null}
                {stepIndex === 2 ? (
                  <Button type="button" variant="secondary" onClick={handleSkipLegal} disabled={saving}>
                    Skip for Now
                  </Button>
                ) : null}
                <Button type="button" onClick={handleNext} disabled={saving}>
                  Next
                </Button>
              </div>
            ) : (
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create Development'}
              </Button>
            )}
          </footer>
        </form>
      </div>
    </Modal>
  )
}

export default AddDevelopmentModal
