import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createDevelopmentWorkspace, fetchDeveloperAccessOptions } from '../lib/api'
import { invokeEdgeFunction, isSupabaseConfigured } from '../lib/supabaseClient'
import { formatSouthAfricanWhatsAppNumber, sendWhatsAppNotification } from '../lib/whatsapp'
import Button from './ui/Button'
import Modal from './ui/Modal'

const STEPS = [
  { id: 'basic', label: 'Basic Information', description: 'Step 1' },
  { id: 'financials', label: 'Basic Costings', description: 'Step 2' },
  { id: 'legal', label: 'Deal Setup', description: 'Step 3' },
  { id: 'units', label: 'Units & Pricing', description: 'Step 4' },
  { id: 'documents', label: 'Assets', description: 'Step 5' },
  { id: 'review', label: 'Review', description: 'Step 6' },
]

const STOCK_STEPS = [
  { id: 'structure', label: 'Structure', description: 'Set up phases, blocks, and release groupings.' },
  { id: 'unit-types', label: 'Unit Types', description: 'Define floorplans, pricing, quantities, and distribution.' },
  { id: 'review-generate', label: 'Review & Generate', description: 'Confirm totals and generate the full unit inventory.' },
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
  bondOriginators: [{ name: '', contactName: '', email: '', phone: '', commission_type: 'purchase_price', commission_percentage: '' }],
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
  commission_type: 'purchase_price',
  commission_percentage: '',
  bondCommissionModelType: 'fixed_fee',
  bondVatIncluded: true,
  bondOverrideAllowed: true,
  requiredDocuments: [
    { key: 'attorney_invoice', label: 'Attorney Invoice', isRequired: true },
    { key: 'attorney_statement', label: 'Attorney Statement', isRequired: true },
    { key: 'registration_confirmation', label: 'Registration Confirmation', isRequired: true },
  ],
}

const DEFAULT_DEVELOPER_ACCESS = {
  mode: 'existing',
  selectedDeveloperId: '',
  selectedDeveloperEmail: '',
  selectedDeveloperName: '',
  selectedDeveloperCompany: '',
  inviteCompanyName: '',
  inviteContactName: '',
  inviteEmail: '',
  invitePhone: '',
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
    commission_type: 'purchase_price',
    commission_percentage: '',
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

function createDraftId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function buildEmptyFloorplanDraft(distributionMode = 'all') {
  return {
    id: createDraftId('floorplan'),
    name: '',
    sizeSqm: '',
    listPrice: '',
    quantity: '',
    fileUrl: '',
    fileName: '',
    distributionMode,
    selectedTargetIds: [],
    customDistribution: [],
  }
}

function buildEmptyUnitTypeDraft(distributionMode = 'all') {
  return {
    id: createDraftId('unit-type'),
    name: '',
    description: '',
    defaultStatus: 'Available',
    floorplans: [buildEmptyFloorplanDraft(distributionMode)],
  }
}

function buildPhaseDraft(name = 'Phase 1', order = 1) {
  return {
    id: createDraftId('phase'),
    name,
    order,
    plannedUnits: '',
    blocks: [],
  }
}

function buildBlockDraft(name = 'Block A', order = 1) {
  return {
    id: createDraftId('block'),
    name,
    order,
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

function createInviteToken(prefix = 'dev') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

function buildDeveloperAccessLink(token) {
  if (!token) return ''
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://app.bridgenine.co.za'
  return `${origin}/auth?developer_invite=${encodeURIComponent(token)}`
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

function normalizeCodeFragment(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()

  return cleaned || fallback
}

function buildStructureTargets(stockPlan) {
  if (stockPlan.structureType === 'phases') {
    return stockPlan.phases.map((phase) => ({
      id: phase.id,
      label: phase.name,
      targetType: 'phase',
      phaseName: phase.name,
      blockName: '',
    }))
  }

  if (stockPlan.structureType === 'blocks') {
    return stockPlan.blocks.map((block) => ({
      id: block.id,
      label: block.name,
      targetType: 'block',
      phaseName: '',
      blockName: block.name,
    }))
  }

  if (stockPlan.structureType === 'phase_and_block') {
    return stockPlan.phases.flatMap((phase) =>
      (phase.blocks || []).map((block) => ({
        id: `${phase.id}:${block.id}`,
        label: `${phase.name} / ${block.name}`,
        targetType: 'phase_block',
        phaseId: phase.id,
        phaseName: phase.name,
        blockId: block.id,
        blockName: block.name,
      })),
    )
  }

  return [
    {
      id: 'single-release',
      label: 'Single Release',
      targetType: 'release',
      phaseName: '',
      blockName: '',
    },
  ]
}

function distributeEvenly(quantity, targets) {
  if (!targets.length) return []
  const base = Math.floor(quantity / targets.length)
  const remainder = quantity % targets.length

  return targets.map((target, index) => ({
    target,
    quantity: base + (index < remainder ? 1 : 0),
  }))
}

function resolveFloorplanDistribution(floorplan, targets) {
  const quantity = Number(floorplan.quantity || 0)
  if (quantity <= 0) return []

  if (floorplan.distributionMode === 'custom') {
    return (floorplan.customDistribution || [])
      .map((entry) => {
        const target = targets.find((item) => item.id === entry.targetId)
        return target && Number(entry.quantity || 0) > 0 ? { target, quantity: Number(entry.quantity || 0) } : null
      })
      .filter(Boolean)
  }

  if (floorplan.distributionMode === 'selected') {
    const selectedTargets = targets.filter((target) => (floorplan.selectedTargetIds || []).includes(target.id))
    if (selectedTargets.length === 1) {
      return [{ target: selectedTargets[0], quantity }]
    }
    return []
  }

  if (targets.length === 1) {
    return [{ target: targets[0], quantity }]
  }

  return []
}

function formatUnitNumber(strategy, padding, sequence, target) {
  const suffix = String(sequence).padStart(padding, '0')

  if (strategy === 'phase' && target?.phaseName) {
    return `${normalizeCodeFragment(target.phaseName, 'PH')}-${suffix}`
  }

  if (strategy === 'block' && target?.blockName) {
    return `${normalizeCodeFragment(target.blockName, 'BL')}-${suffix}`
  }

  if (strategy === 'phase_block' && (target?.phaseName || target?.blockName)) {
    const prefix = [target?.phaseName && normalizeCodeFragment(target.phaseName, 'PH'), target?.blockName && normalizeCodeFragment(target.blockName, 'BL')]
      .filter(Boolean)
      .join('-')
    return `${prefix}-${suffix}`
  }

  return suffix
}

function generateUnitsFromStockPlan(stockPlan) {
  const targets = buildStructureTargets(stockPlan)
  const perTargetCounters = new Map()
  let globalCounter = 1

  return stockPlan.unitTypes.flatMap((unitType) =>
    unitType.floorplans.flatMap((floorplan) => {
      const allocations = resolveFloorplanDistribution(floorplan, targets)

      return allocations.flatMap(({ target, quantity }) =>
        Array.from({ length: quantity }, () => {
          const currentCounter = (perTargetCounters.get(target.id) || 0) + 1
          perTargetCounters.set(target.id, currentCounter)
          const sequence = stockPlan.numberingStrategy === 'sequential' ? globalCounter++ : currentCounter

          return {
            ...buildEmptyUnit(),
            unitNumber: formatUnitNumber(stockPlan.numberingStrategy, stockPlan.numberingPadding || 3, sequence, target),
            unitLabel: `${unitType.name || 'Unit'}${floorplan.name ? ` • ${floorplan.name}` : ''}`,
            unitType: unitType.name,
            phase: target.phaseName || '',
            block: target.blockName || '',
            sizeSqm: floorplan.sizeSqm,
            listPrice: floorplan.listPrice,
            status: unitType.defaultStatus || 'Available',
            floorplanId: '',
          }
        }),
      )
    }),
  )
}

function buildFloorplanDocumentsFromUnitTypes(unitTypes) {
  const seen = new Set()

  return unitTypes.flatMap((unitType) =>
    unitType.floorplans.flatMap((floorplan) => {
      const floorplanName = String(floorplan.name || '').trim()
      if (!floorplanName) return []

      const dedupeKey = `${floorplanName}::${unitType.name || ''}`
      if (seen.has(dedupeKey)) return []
      seen.add(dedupeKey)

      const descriptionBits = [
        unitType.name ? `${unitType.name} layout` : '',
        floorplan.sizeSqm ? `${floorplan.sizeSqm} sqm` : '',
        floorplan.listPrice ? `from ${Number(floorplan.listPrice).toLocaleString('en-ZA')}` : '',
        floorplan.fileName ? `file: ${floorplan.fileName}` : '',
      ].filter(Boolean)

      return [
        {
          ...buildEmptyDocument(),
          documentType: 'floorplan',
          title: floorplanName,
          description: descriptionBits.join(' • '),
          fileUrl: floorplan.fileUrl || '',
          linkedUnitType: unitType.name || '',
        },
      ]
    }),
  )
}

function buildStockSummary(stockPlan) {
  const generatedUnits = generateUnitsFromStockPlan(stockPlan)
  const typeCounts = {}
  const floorplanCounts = {}
  const structureCounts = {}
  const plannedPhaseCounts = {}

  generatedUnits.forEach((unit) => {
    typeCounts[unit.unitType] = (typeCounts[unit.unitType] || 0) + 1
    floorplanCounts[unit.floorplanId] = (floorplanCounts[unit.floorplanId] || 0) + 1

    const structureKey = [unit.phase, unit.block].filter(Boolean).join(' / ') || 'Single Release'
    structureCounts[structureKey] = (structureCounts[structureKey] || 0) + 1
  })

  stockPlan.phases.forEach((phase) => {
    if (Number(phase.plannedUnits || 0) > 0) {
      plannedPhaseCounts[phase.name || `Phase ${phase.order}`] = Number(phase.plannedUnits || 0)
    }
  })

  const warnings = []
  stockPlan.unitTypes.forEach((unitType) => {
    if (!String(unitType.name || '').trim()) warnings.push('A unit type is missing its name.')
    if (!(unitType.floorplans || []).length) warnings.push(`${unitType.name || 'A unit type'} has no floorplans.`)

    unitType.floorplans.forEach((floorplan) => {
      if (!String(floorplan.name || '').trim()) warnings.push(`${unitType.name || 'A unit type'} has a floorplan without a name.`)
      if (!Number(floorplan.quantity || 0)) warnings.push(`${floorplan.name || 'A floorplan'} has no quantity.`)
      if (!Number(floorplan.sizeSqm || 0)) warnings.push(`${floorplan.name || 'A floorplan'} is missing its size.`)
      if (!Number(floorplan.listPrice || 0)) warnings.push(`${floorplan.name || 'A floorplan'} is missing its price.`)
      if (buildStructureTargets(stockPlan).length > 1 && floorplan.distributionMode !== 'custom') {
        warnings.push(`${floorplan.name || 'A floorplan'} still needs explicit phase or block allocation.`)
      }
    })
  })

  Object.entries(plannedPhaseCounts).forEach(([phaseName, plannedCount]) => {
    const generatedCount = structureCounts[phaseName] || 0
    if (generatedCount !== plannedCount) {
      warnings.push(`${phaseName} is planned for ${plannedCount} units but the current stock setup generates ${generatedCount}.`)
    }
  })

  return {
    totalUnits: generatedUnits.length,
    generatedUnits,
    typeCounts,
    floorplanCounts,
    structureCounts,
    plannedPhaseCounts,
    warnings: Array.from(new Set(warnings)),
  }
}

function getStructureTypeLabel(structureType) {
  if (structureType === 'phases') return 'By phase'
  if (structureType === 'blocks') return 'By block'
  if (structureType === 'phase_and_block') return 'By phase and block'
  return 'Single release'
}

function validateStockStep(stockPlan, stockStepIndex) {
  if (stockStepIndex === 0) {
    if (stockPlan.structureType === 'phases' && !stockPlan.phases.length) {
      throw new Error('Add at least one phase.')
    }
    if (stockPlan.structureType === 'phases' && stockPlan.phases.some((phase) => !Number(phase.plannedUnits || 0))) {
      throw new Error('Enter the planned unit count for each phase.')
    }
    if (stockPlan.structureType === 'blocks' && !stockPlan.blocks.length) {
      throw new Error('Add at least one block.')
    }
    if (stockPlan.structureType === 'phase_and_block') {
      if (!stockPlan.phases.length) {
        throw new Error('Add at least one phase.')
      }
      if (stockPlan.phases.some((phase) => !Number(phase.plannedUnits || 0))) {
        throw new Error('Enter the planned unit count for each phase.')
      }
      if (stockPlan.phases.some((phase) => !(phase.blocks || []).length)) {
        throw new Error('Each phase needs at least one block.')
      }
    }
  }

  if (stockStepIndex === 1) {
    const availableTargets = buildStructureTargets(stockPlan)

    if (!stockPlan.unitTypes.length) {
      throw new Error('Add at least one unit type.')
    }

    stockPlan.unitTypes.forEach((unitType) => {
      if (!String(unitType.name || '').trim()) {
        throw new Error('Each unit type needs a name.')
      }
      if (!(unitType.floorplans || []).length) {
        throw new Error(`${unitType.name} needs at least one floorplan.`)
      }

      unitType.floorplans.forEach((floorplan) => {
        if (!String(floorplan.name || '').trim()) {
          throw new Error(`A floorplan in ${unitType.name} is missing a name.`)
        }
        if (!Number(floorplan.quantity || 0)) {
          throw new Error(`${floorplan.name} needs a quantity greater than zero.`)
        }
        if (!Number(floorplan.sizeSqm || 0)) {
          throw new Error(`${floorplan.name} needs a size in sqm.`)
        }
        if (!Number(floorplan.listPrice || 0)) {
          throw new Error(`${floorplan.name} needs a list price.`)
        }
        if (availableTargets.length > 1 && floorplan.distributionMode !== 'custom') {
          throw new Error(`${floorplan.name} needs custom phase or block allocation. Bridge will not auto-split grouped stock.`)
        }
        if (floorplan.distributionMode === 'selected' && availableTargets.length > 1 && !(floorplan.selectedTargetIds || []).length) {
          throw new Error(`${floorplan.name} needs at least one selected target.`)
        }
        if (floorplan.distributionMode === 'custom') {
          const totalCustom = (floorplan.customDistribution || []).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0)
          if (totalCustom !== Number(floorplan.quantity || 0)) {
            throw new Error(`${floorplan.name} custom distribution must equal the floorplan quantity.`)
          }
        }
      })
    })
  }

  if (stockStepIndex === 2) {
    const summary = buildStockSummary(stockPlan)
    if (!summary.totalUnits) {
      throw new Error('The stock plan must generate at least one unit.')
    }
  }
}

function AddDevelopmentModal({ open, onClose, onCreated, contextRole = 'developer' }) {
  const isAgentContext = String(contextRole || '').trim().toLowerCase() === 'agent'
  const [stepIndex, setStepIndex] = useState(0)
  const [stockStepIndex, setStockStepIndex] = useState(0)
  const [details, setDetails] = useState(DEFAULT_DETAILS)
  const [financials, setFinancials] = useState(DEFAULT_FINANCIALS)
  const [legal, setLegal] = useState(DEFAULT_LEGAL)
  const [developerAccess, setDeveloperAccess] = useState(DEFAULT_DEVELOPER_ACCESS)
  const [developerOptions, setDeveloperOptions] = useState([])
  const [developerOptionsLoading, setDeveloperOptionsLoading] = useState(false)
  const [developerOptionsError, setDeveloperOptionsError] = useState('')
  const [units, setUnits] = useState([])
  const [documents, setDocuments] = useState([buildEmptyDocument()])
  const [stockPlan, setStockPlan] = useState({
    structureType: 'none',
    phases: [],
    blocks: [],
    unitTypes: [buildEmptyUnitTypeDraft()],
    numberingStrategy: 'sequential',
    numberingPadding: 3,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return

    setStepIndex(0)
    setStockStepIndex(0)
    setDetails(DEFAULT_DETAILS)
    setFinancials(DEFAULT_FINANCIALS)
    setLegal(DEFAULT_LEGAL)
    setDeveloperAccess(DEFAULT_DEVELOPER_ACCESS)
    setDeveloperOptions([])
    setDeveloperOptionsLoading(false)
    setDeveloperOptionsError('')
    setUnits([])
    setDocuments([buildEmptyDocument()])
    setStockPlan({
      structureType: 'none',
      phases: [],
      blocks: [],
      unitTypes: [buildEmptyUnitTypeDraft()],
      numberingStrategy: 'sequential',
      numberingPadding: 3,
    })
    setSaving(false)
    setError('')
  }, [open])

  useEffect(() => {
    if (!open || !isAgentContext) {
      return
    }

    let cancelled = false

    async function loadDeveloperOptions() {
      try {
        setDeveloperOptionsLoading(true)
        setDeveloperOptionsError('')
        const options = await fetchDeveloperAccessOptions()
        if (cancelled) return
        setDeveloperOptions(options)
      } catch (loadError) {
        if (cancelled) return
        setDeveloperOptions([])
        setDeveloperOptionsError(loadError?.message || 'Unable to load developer options.')
      } finally {
        if (!cancelled) {
          setDeveloperOptionsLoading(false)
        }
      }
    }

    void loadDeveloperOptions()

    return () => {
      cancelled = true
    }
  }, [isAgentContext, open])

  const stockSummary = useMemo(() => buildStockSummary(stockPlan), [stockPlan])
  const stockTargets = useMemo(() => buildStructureTargets(stockPlan), [stockPlan])

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

  function updatePhase(index, value) {
    updatePhaseField(index, 'name', value)
  }

  function updatePhaseField(index, key, value) {
    setStockPlan((previous) => ({
      ...previous,
      phases: previous.phases.map((phase, phaseIndex) => (phaseIndex === index ? { ...phase, [key]: value } : phase)),
    }))
  }

  function updateBlock(index, value) {
    setStockPlan((previous) => ({
      ...previous,
      blocks: previous.blocks.map((block, blockIndex) => (blockIndex === index ? { ...block, name: value } : block)),
    }))
  }

  function updatePhaseBlock(phaseIndex, blockIndex, value) {
    setStockPlan((previous) => ({
      ...previous,
      phases: previous.phases.map((phase, currentPhaseIndex) =>
        currentPhaseIndex === phaseIndex
          ? {
              ...phase,
              blocks: (phase.blocks || []).map((block, currentBlockIndex) =>
                currentBlockIndex === blockIndex ? { ...block, name: value } : block,
              ),
            }
          : phase,
      ),
    }))
  }

  function updateUnitType(index, key, value) {
    setStockPlan((previous) => ({
      ...previous,
      unitTypes: previous.unitTypes.map((unitType, unitTypeIndex) => (unitTypeIndex === index ? { ...unitType, [key]: value } : unitType)),
    }))
  }

  function updateFloorplan(unitTypeIndex, floorplanIndex, key, value) {
    setStockPlan((previous) => ({
      ...previous,
      unitTypes: previous.unitTypes.map((unitType, currentUnitTypeIndex) =>
        currentUnitTypeIndex === unitTypeIndex
          ? {
              ...unitType,
              floorplans: unitType.floorplans.map((floorplan, currentFloorplanIndex) =>
                currentFloorplanIndex === floorplanIndex ? { ...floorplan, [key]: value } : floorplan,
              ),
            }
          : unitType,
      ),
    }))
  }

  function updateFloorplanFile(unitTypeIndex, floorplanIndex, file) {
    updateFloorplan(unitTypeIndex, floorplanIndex, 'fileName', file?.name || '')
  }

  function setStructureType(value) {
    setStockPlan((previous) => ({
      ...previous,
      structureType: value,
      phases: value === 'phases' || value === 'phase_and_block' ? previous.phases : [],
      blocks: value === 'blocks' ? previous.blocks : [],
      unitTypes: previous.unitTypes.map((unitType) => ({
        ...unitType,
        floorplans: unitType.floorplans.map((floorplan) => ({
          ...floorplan,
          distributionMode: value === 'none' ? 'all' : 'custom',
          selectedTargetIds: [],
          customDistribution: value === 'none' ? [] : floorplan.customDistribution,
        })),
      })),
    }))
  }

  function setPhaseCount(value) {
    const count = Math.max(Number(value || 0), 0)
    setStockPlan((previous) => ({
      ...previous,
      phases: Array.from({ length: count }, (_, index) => {
        const existing = previous.phases[index]
        return existing || buildPhaseDraft(`Phase ${index + 1}`, index + 1)
      }),
    }))
  }

  function setBlockCount(value) {
    const count = Math.max(Number(value || 0), 0)
    setStockPlan((previous) => ({
      ...previous,
      blocks: Array.from({ length: count }, (_, index) => {
        const existing = previous.blocks[index]
        return existing || buildBlockDraft(`Block ${String.fromCharCode(65 + index)}`, index + 1)
      }),
    }))
  }

  function setPhaseAndBlockCounts(phaseCountValue, blockCountValue) {
    const phaseCount = Math.max(Number(phaseCountValue || 0), 0)
    const blockCount = Math.max(Number(blockCountValue || 0), 0)
    setStockPlan((previous) => ({
      ...previous,
      phases: Array.from({ length: phaseCount }, (_, phaseIndex) => {
        const existingPhase = previous.phases[phaseIndex] || buildPhaseDraft(`Phase ${phaseIndex + 1}`, phaseIndex + 1)
        return {
          ...existingPhase,
          blocks: Array.from({ length: blockCount }, (_, blockIndex) => {
            const existingBlock = (existingPhase.blocks || [])[blockIndex]
            return existingBlock || buildBlockDraft(`Block ${String.fromCharCode(65 + blockIndex)}`, blockIndex + 1)
          }),
        }
      }),
    }))
  }

  function addUnitType() {
    setStockPlan((previous) => ({
      ...previous,
      unitTypes: [...previous.unitTypes, buildEmptyUnitTypeDraft(previous.structureType === 'none' ? 'all' : 'custom')],
    }))
  }

  function addFloorplan(unitTypeIndex) {
    setStockPlan((previous) => ({
      ...previous,
      unitTypes: previous.unitTypes.map((unitType, index) =>
        index === unitTypeIndex
          ? {
              ...unitType,
              floorplans: [...unitType.floorplans, buildEmptyFloorplanDraft(previous.structureType === 'none' ? 'all' : 'custom')],
            }
          : unitType,
      ),
    }))
  }

  function removeUnitType(unitTypeIndex) {
    setStockPlan((previous) => ({
      ...previous,
      unitTypes: previous.unitTypes.filter((_, index) => index !== unitTypeIndex),
    }))
  }

  function removeFloorplan(unitTypeIndex, floorplanIndex) {
    setStockPlan((previous) => ({
      ...previous,
      unitTypes: previous.unitTypes.map((unitType, index) =>
        index === unitTypeIndex
          ? { ...unitType, floorplans: unitType.floorplans.filter((_, currentFloorplanIndex) => currentFloorplanIndex !== floorplanIndex) }
          : unitType,
      ),
    }))
  }

  function toggleSelectedTarget(unitTypeIndex, floorplanIndex, targetId) {
    const currentFloorplan = stockPlan.unitTypes[unitTypeIndex]?.floorplans?.[floorplanIndex]
    const currentSelected = currentFloorplan?.selectedTargetIds || []
    const nextSelected = currentSelected.includes(targetId)
      ? currentSelected.filter((item) => item !== targetId)
      : [...currentSelected, targetId]
    updateFloorplan(unitTypeIndex, floorplanIndex, 'selectedTargetIds', nextSelected)
  }

  function setCustomDistributionValue(unitTypeIndex, floorplanIndex, target, quantityValue) {
    const currentFloorplan = stockPlan.unitTypes[unitTypeIndex]?.floorplans?.[floorplanIndex]
    const nextDistribution = [...(currentFloorplan?.customDistribution || [])]
    const existingIndex = nextDistribution.findIndex((entry) => entry.targetId === target.id)
    const normalizedQuantity = Number(quantityValue || 0)

    if (existingIndex >= 0) {
      nextDistribution[existingIndex] = { ...nextDistribution[existingIndex], quantity: normalizedQuantity, targetType: target.targetType }
    } else {
      nextDistribution.push({ targetId: target.id, targetType: target.targetType, quantity: normalizedQuantity })
    }

    updateFloorplan(unitTypeIndex, floorplanIndex, 'customDistribution', nextDistribution)
  }

  function updateLegalList(key, index, field, value) {
    setLegal((previous) => ({
      ...previous,
      [key]: previous[key].map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    }))
  }

  function updateDeveloperAccess(key, value) {
    setDeveloperAccess((previous) => ({ ...previous, [key]: value }))
  }

  function handleSelectDeveloper(value) {
    const selectedId = String(value || '').trim()
    const selected = developerOptions.find((item) => String(item?.id || '').trim() === selectedId) || null
    updateDeveloperAccess('selectedDeveloperId', selectedId)
    updateDeveloperAccess('selectedDeveloperEmail', selected?.email || '')
    updateDeveloperAccess('selectedDeveloperName', selected?.name || '')
    updateDeveloperAccess('selectedDeveloperCompany', selected?.company || '')

    if (selected?.company && !String(details.developerCompany || '').trim()) {
      setDetails((previous) => ({ ...previous, developerCompany: selected.company }))
    }
  }

  function buildDeveloperTeamFromAccess() {
    if (!isAgentContext) return []

    if (developerAccess.mode === 'invite') {
      const inviteToken = createInviteToken('dev')
      const onboardingLink = buildDeveloperAccessLink(inviteToken)
      return [
        {
          name: String(developerAccess.inviteContactName || '').trim(),
          contactName: String(developerAccess.inviteContactName || '').trim(),
          email: String(developerAccess.inviteEmail || '').trim().toLowerCase(),
          company: String(developerAccess.inviteCompanyName || '').trim(),
          phone: String(developerAccess.invitePhone || '').trim(),
          status: 'invited',
          inviteToken,
          onboardingLink,
        },
      ]
    }

    return [
      {
        id: String(developerAccess.selectedDeveloperId || '').trim() || null,
        name: String(developerAccess.selectedDeveloperName || '').trim(),
        contactName: String(developerAccess.selectedDeveloperName || '').trim(),
        email: String(developerAccess.selectedDeveloperEmail || '').trim().toLowerCase(),
        company: String(developerAccess.selectedDeveloperCompany || '').trim(),
        status: 'active',
      },
    ].filter((item) => item.name || item.email)
  }

  async function sendDeveloperInviteNotifications({
    companyName = '',
    contactName = '',
    recipientEmail = '',
    recipientPhone = '',
    onboardingLink = '',
  } = {}) {
    const normalizedEmail = String(recipientEmail || '').trim().toLowerCase()
    const normalizedPhone = formatSouthAfricanWhatsAppNumber(recipientPhone)
    const safeContactName = String(contactName || '').trim() || 'Developer'
    const safeCompanyName = String(companyName || '').trim() || details.name || 'the development'

    if (normalizedEmail && isSupabaseConfigured) {
      try {
        await invokeEdgeFunction('send-email', {
          body: {
            type: 'developer_access_invite',
            to: normalizedEmail,
            developerName: safeContactName,
            developmentName: details.name,
            companyName: safeCompanyName,
            onboardingLink,
          },
        })
      } catch (emailError) {
        console.error('[Development Invite] developer email notification failed', emailError)
      }
    }

    if (normalizedPhone) {
      try {
        await sendWhatsAppNotification({
          to: normalizedPhone,
          role: 'developer_invite',
          message: `Hi ${safeContactName},\n\nYou have been invited to access ${details.name} on Bridge.\n\nOpen your developer access link:\n${onboardingLink}\n\nCompany: ${safeCompanyName}`,
        })
      } catch (whatsappError) {
        console.error('[Development Invite] developer WhatsApp notification failed', whatsappError)
      }
    }
  }

  function validateCurrentStep() {
    if (stepIndex === 0) {
      if (!details.name.trim()) {
        throw new Error('Development name is required.')
      }
      if (!details.address.trim() && !details.suburb.trim() && !details.city.trim()) {
        throw new Error('Add at least a street address, suburb, or city for the development.')
      }
      if (isAgentContext) {
        if (developerAccess.mode === 'invite') {
          if (
            !String(developerAccess.inviteCompanyName || '').trim() ||
            !String(developerAccess.inviteContactName || '').trim() ||
            !String(developerAccess.inviteEmail || '').trim()
          ) {
            throw new Error('Developer company name, contact name, and email are required for new developer invites.')
          }
        } else if (!String(developerAccess.selectedDeveloperId || '').trim()) {
          throw new Error('Select an existing developer profile before continuing.')
        }
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

  function handleSkipDocuments() {
    setError('')
    setStepIndex((previous) => Math.min(previous + 1, STEPS.length - 1))
  }

  function handleStockStepNext() {
    try {
      setError('')
      validateStockStep(stockPlan, stockStepIndex)
      setStockStepIndex((previous) => Math.min(previous + 1, 2))
    } catch (stockError) {
      setError(stockError.message)
    }
  }

  function handleStockStepBack() {
    setError('')
    setStockStepIndex((previous) => Math.max(previous - 1, 0))
  }

  function handleFinalizeStock() {
    try {
      setError('')
      validateStockStep(stockPlan, 2)
      const generatedUnits = stockSummary.generatedUnits
      const generatedFloorplans = buildFloorplanDocumentsFromUnitTypes(stockPlan.unitTypes)

      setUnits(generatedUnits)
      setDetails((previous) => ({
        ...previous,
        totalUnitsExpected: String(generatedUnits.length),
      }))
      setDocuments((previous) => {
        const existingKeys = new Set(previous.map((item) => `${item.documentType}::${item.title}::${item.linkedUnitType}`))
        const merged = [...previous.filter((item) => item.title || item.fileUrl || item.description)]
        generatedFloorplans.forEach((item) => {
          const key = `${item.documentType}::${item.title}::${item.linkedUnitType}`
          if (!existingKeys.has(key)) {
            merged.push(item)
          }
        })
        return merged.length ? merged : [buildEmptyDocument()]
      })
      setStepIndex(4)
    } catch (stockError) {
      setError(stockError.message)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    try {
      setError('')
      validateCurrentStep()
      setSaving(true)

      const primaryConveyancer = legal.conveyancers.find((item) => String(item.firmName || item.contactName || item.email || '').trim())
      const primaryBondOriginator = legal.bondOriginators.find((item) => String(item.name || item.contactName || item.email || '').trim())
      const commissionType = primaryBondOriginator?.commission_type || legal.commission_type || 'purchase_price'
      const commissionPercentage = normalizeOptionalNumber(primaryBondOriginator?.commission_percentage ?? legal.commission_percentage)
      const developerTeam = buildDeveloperTeamFromAccess()
      const resolvedDeveloperCompany = isAgentContext
        ? (developerAccess.mode === 'invite'
            ? String(developerAccess.inviteCompanyName || '').trim()
            : String(developerAccess.selectedDeveloperCompany || '').trim()) || details.developerCompany
        : details.developerCompany

      const created = await createDevelopmentWorkspace({
        details: {
          ...details,
          developerCompany: resolvedDeveloperCompany,
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
          commission_type: commissionType,
          commission_percentage: commissionPercentage,
          bondCommissionModelType: 'percentage',
          defaultCommissionAmount: commissionPercentage,
        },
        developmentSettings: {
          enabledModules: legal.enabledModules,
          stakeholderTeams: {
            agents: legal.agents.filter((item) => String(item.name || item.email || item.company || '').trim()),
            conveyancers: legal.conveyancers.filter((item) => String(item.firmName || item.contactName || item.email || '').trim()),
            bondOriginators: legal.bondOriginators.filter((item) => String(item.name || item.contactName || item.email || '').trim()),
            developers: developerTeam,
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

      if (isAgentContext && developerAccess.mode === 'invite') {
        const inviteEntry = developerTeam[0] || null
        if (inviteEntry?.onboardingLink) {
          await sendDeveloperInviteNotifications({
            companyName: inviteEntry.company,
            contactName: inviteEntry.contactName || inviteEntry.name,
            recipientEmail: inviteEntry.email,
            recipientPhone: inviteEntry.phone,
            onboardingLink: inviteEntry.onboardingLink,
          })
        }
      }

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
      <div className="space-y-5">
        <div className="overflow-x-auto rounded-[24px] border border-[#e3ebf5] bg-[#f8fbff] p-3">
          <ol className="flex min-w-max flex-nowrap gap-2">
          {STEPS.map((step, index) => {
            const status = index === stepIndex ? 'active' : index < stepIndex ? 'complete' : ''
            return (
              <li
                key={step.id}
                className={`flex min-w-[170px] items-center gap-2 rounded-[16px] border px-3 py-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.04)] ${
                  status === 'active'
                    ? 'border-[#b9cee6] bg-[#35546c] text-white'
                    : status === 'complete'
                      ? 'border-[#d8e7dc] bg-[#f3fbf5] text-[#1f6d3c]'
                      : 'border-[#d9e4f1] bg-white text-[#162334]'
                }`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                    status === 'active'
                      ? 'bg-white/20 text-white'
                      : status === 'complete'
                        ? 'bg-[#d8e7dc] text-[#1f6d3c]'
                        : 'bg-[#eff4f8] text-[#35546c]'
                  }`}
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <small
                    className={`block truncate text-[0.72rem] font-semibold uppercase tracking-[0.16em] ${
                      status === 'active' ? 'text-white/75' : 'text-[#8ba0b8]'
                    }`}
                  >
                    {step.description}
                  </small>
                  <strong className="block truncate text-sm font-semibold">{step.label}</strong>
                </div>
              </li>
            )
          })}
          </ol>
        </div>

        {error ? (
          <p className="rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#b42318]">{error}</p>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="space-y-6 [&_.full-width]:md:col-span-2 [&_.full-width]:xl:col-span-3 [&_input:not([type='checkbox'])]:w-full [&_input:not([type='checkbox'])]:rounded-[14px] [&_input:not([type='checkbox'])]:border [&_input:not([type='checkbox'])]:border-[#dde4ee] [&_input:not([type='checkbox'])]:bg-white [&_input:not([type='checkbox'])]:px-4 [&_input:not([type='checkbox'])]:py-3 [&_input:not([type='checkbox'])]:text-sm [&_input:not([type='checkbox'])]:text-[#162334] [&_input:not([type='checkbox'])]:shadow-[0_10px_24px_rgba(15,23,42,0.06)] [&_input:not([type='checkbox'])]:outline-none [&_input:not([type='checkbox'])]:transition [&_input:not([type='checkbox'])]:duration-150 [&_input:not([type='checkbox'])]:ease-out [&_input:not([type='checkbox'])]:placeholder:text-slate-400 [&_input:not([type='checkbox'])]:focus:border-[rgba(29,78,216,0.35)] [&_input:not([type='checkbox'])]:focus:ring-4 [&_input:not([type='checkbox'])]:focus:ring-[rgba(29,78,216,0.1)] [&_input[type='checkbox']]:h-5 [&_input[type='checkbox']]:w-5 [&_input[type='checkbox']]:rounded-md [&_input[type='checkbox']]:border [&_input[type='checkbox']]:border-[#c9d5e3] [&_input[type='checkbox']]:text-[#35546c] [&_input[type='checkbox']]:shadow-none [&_input[type='checkbox']]:accent-[#35546c] [&_select]:w-full [&_select]:rounded-[14px] [&_select]:border [&_select]:border-[#dde4ee] [&_select]:bg-white [&_select]:px-4 [&_select]:py-3 [&_select]:text-sm [&_select]:text-[#162334] [&_select]:shadow-[0_10px_24px_rgba(15,23,42,0.06)] [&_select]:outline-none [&_select]:transition [&_select]:duration-150 [&_select]:ease-out [&_select]:focus:border-[rgba(29,78,216,0.35)] [&_select]:focus:ring-4 [&_select]:focus:ring-[rgba(29,78,216,0.1)] [&_textarea]:w-full [&_textarea]:rounded-[14px] [&_textarea]:border [&_textarea]:border-[#dde4ee] [&_textarea]:bg-white [&_textarea]:px-4 [&_textarea]:py-3 [&_textarea]:text-sm [&_textarea]:text-[#162334] [&_textarea]:shadow-[0_10px_24px_rgba(15,23,42,0.06)] [&_textarea]:outline-none [&_textarea]:transition [&_textarea]:duration-150 [&_textarea]:ease-out [&_textarea]:placeholder:text-slate-400 [&_textarea]:focus:border-[rgba(29,78,216,0.35)] [&_textarea]:focus:ring-4 [&_textarea]:focus:ring-[rgba(29,78,216,0.1)] [&_label]:flex [&_label]:min-w-0 [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label]:font-medium [&_label]:text-[#233247]"
        >
          {stepIndex === 0 ? (
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
              <div className="mb-4 space-y-1.5">
                <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Development Identity</h4>
                <p className="text-sm leading-6 text-[#6b7d93]">Capture the location, developer record, and launch context for the workspace.</p>
              </div>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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
              </div>

              {isAgentContext ? (
                <div className="mt-5 space-y-4 rounded-[20px] border border-[#dbe6f2] bg-[#f8fbff] p-4">
                  <div>
                    <h5 className="text-sm font-semibold text-[#142132]">Developer Access (Required)</h5>
                    <p className="mt-1 text-sm text-[#6b7d93]">Link an existing developer profile or invite a new developer to access this development workspace.</p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => updateDeveloperAccess('mode', 'existing')}
                      className={`rounded-[14px] border px-4 py-3 text-left text-sm transition ${
                        developerAccess.mode === 'existing'
                          ? 'border-[#1f4f78] bg-[#1f4f78] text-white'
                          : 'border-[#d8e3ef] bg-white text-[#35546c] hover:border-[#b7c8db]'
                      }`}
                    >
                      Select Existing Developer
                    </button>
                    <button
                      type="button"
                      onClick={() => updateDeveloperAccess('mode', 'invite')}
                      className={`rounded-[14px] border px-4 py-3 text-left text-sm transition ${
                        developerAccess.mode === 'invite'
                          ? 'border-[#1f4f78] bg-[#1f4f78] text-white'
                          : 'border-[#d8e3ef] bg-white text-[#35546c] hover:border-[#b7c8db]'
                      }`}
                    >
                      Invite New Developer
                    </button>
                  </div>

                  {developerAccess.mode === 'existing' ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <label className="full-width">
                        Developer profile
                        <select value={developerAccess.selectedDeveloperId} onChange={(event) => handleSelectDeveloper(event.target.value)}>
                          <option value="">Select developer profile</option>
                          {developerOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                              {option.company ? ` · ${option.company}` : ''}
                              {option.email ? ` · ${option.email}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Developer contact
                        <input value={developerAccess.selectedDeveloperName} readOnly />
                      </label>
                      <label>
                        Developer email
                        <input value={developerAccess.selectedDeveloperEmail} readOnly />
                      </label>
                      <label>
                        Developer company
                        <input value={developerAccess.selectedDeveloperCompany} readOnly />
                      </label>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <label>
                        Developer company name
                        <input
                          value={developerAccess.inviteCompanyName}
                          onChange={(event) => updateDeveloperAccess('inviteCompanyName', event.target.value)}
                          placeholder="Axis Property Group"
                        />
                      </label>
                      <label>
                        Developer contact name
                        <input
                          value={developerAccess.inviteContactName}
                          onChange={(event) => updateDeveloperAccess('inviteContactName', event.target.value)}
                          placeholder="Jane Smith"
                        />
                      </label>
                      <label>
                        Developer email
                        <input
                          type="email"
                          value={developerAccess.inviteEmail}
                          onChange={(event) => updateDeveloperAccess('inviteEmail', event.target.value)}
                          placeholder="developer@company.com"
                        />
                      </label>
                      <label>
                        Developer phone
                        <input
                          value={developerAccess.invitePhone}
                          onChange={(event) => updateDeveloperAccess('invitePhone', event.target.value)}
                          placeholder="+27 82 000 0000"
                        />
                      </label>
                    </div>
                  )}

                  {developerOptionsLoading ? <p className="text-sm text-[#6b7d93]">Loading developer profiles…</p> : null}
                  {developerOptionsError ? <p className="text-sm text-[#b42318]">{developerOptionsError}</p> : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {stepIndex === 1 ? (
            <>
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                <div className="mb-4 space-y-1.5">
                  <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Commercial Inputs</h4>
                  <p className="text-sm leading-6 text-[#6b7d93]">Set the base commercial assumptions that seed the development workspace.</p>
                </div>
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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
              <section className="space-y-5 rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                <div className="space-y-1.5">
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
                    <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">Configure one or more conveyancers for transaction allocation and inherited development-level transaction access.</span>
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
                    <p className="text-sm leading-6 text-[#6b7d93]">The first conveyancer entered here becomes the default mandated firm for this development, with automatic access to all development transactions.</p>
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
                          Bond Originator Commission (%)
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="e.g. 1.25"
                            value={originator.commission_percentage || ''}
                            onChange={(event) => updateLegalList('bondOriginators', index, 'commission_percentage', event.target.value)}
                          />
                        </label>
                        <label>
                          Commission Calculation
                          <select
                            value={originator.commission_type || 'purchase_price'}
                            onChange={(event) => updateLegalList('bondOriginators', index, 'commission_type', event.target.value)}
                          >
                            <option value="purchase_price">% of Full Purchase Price</option>
                            <option value="bond_amount">% of Bond Granted</option>
                          </select>
                        </label>
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
            <div className="space-y-5">
              <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                <div className="space-y-2">
                  <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#142132]">Stock Master</h4>
                  <p className="text-sm leading-6 text-[#6b7d93]">
                    Tell Bridge how the development is structured, define your stock templates once, and generate the full unit inventory only
                    when you are ready.
                  </p>
                </div>
                <ol className="mt-5 grid gap-3 md:grid-cols-3">
                  {STOCK_STEPS.map((step, index) => {
                    const isActive = stockStepIndex === index
                    const isComplete = stockStepIndex > index
                    return (
                      <li
                        key={step.id}
                        className={`rounded-[20px] border px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] ${
                          isActive
                            ? 'border-[#b9cee6] bg-[#35546c] text-white'
                            : isComplete
                              ? 'border-[#d8e7dc] bg-[#f3fbf5] text-[#1f6d3c]'
                              : 'border-[#dde4ee] bg-[#f8fbff] text-[#35546c]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                              isActive
                                ? 'bg-white/20 text-white'
                                : isComplete
                                  ? 'bg-[#d8e7dc] text-[#1f6d3c]'
                                  : 'bg-white text-[#35546c]'
                            }`}
                          >
                            {index + 1}
                          </span>
                          <div className="space-y-1">
                            <strong className="block text-sm font-semibold">{step.label}</strong>
                            <p className={`text-xs leading-5 ${isActive ? 'text-white/75' : isComplete ? 'text-[#4b8a60]' : 'text-[#6b7d93]'}`}>
                              {step.description}
                            </p>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </section>

              {stockStepIndex === 0 ? (
                <section className="space-y-5 rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                  <div className="space-y-2">
                    <h5 className="text-base font-semibold tracking-[-0.02em] text-[#142132]">Set up your development structure</h5>
                    <p className="text-sm leading-6 text-[#6b7d93]">
                      Start at the portfolio level. Decide whether stock should stay as a single release or be organised by phase, block, or
                      both.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      { value: 'none', label: 'Single release', detail: 'Keep stock in one release without sub-groups.' },
                      { value: 'phases', label: 'By phase', detail: 'Use phases for launch batches and delivery timing.' },
                      { value: 'blocks', label: 'By block', detail: 'Organise units by building block or cluster.' },
                      { value: 'phase_and_block', label: 'By phase and block', detail: 'Use both phases and blocks for precise distribution.' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setStructureType(option.value)}
                        className={`rounded-[20px] border px-4 py-4 text-left transition ${
                          stockPlan.structureType === option.value
                            ? 'border-[#b9cee6] bg-[#f8fbff] shadow-[0_10px_24px_rgba(53,84,108,0.08)]'
                            : 'border-[#dde4ee] bg-white hover:border-[#c9d6e3]'
                        }`}
                      >
                        <strong className="block text-sm font-semibold text-[#142132]">{option.label}</strong>
                        <span className="mt-2 block text-sm leading-6 text-[#6b7d93]">{option.detail}</span>
                      </button>
                    ))}
                  </div>

                  {stockPlan.structureType === 'phases' ? (
                    <div className="space-y-4 rounded-[22px] border border-[#e3ebf5] bg-[#f8fbff] p-5">
                      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                        <label>
                          Number of phases
                          <input type="number" min="1" value={stockPlan.phases.length || ''} onChange={(event) => setPhaseCount(event.target.value)} />
                        </label>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {stockPlan.phases.map((phase, index) => (
                            <article key={phase.id} className="rounded-[18px] border border-[#dde4ee] bg-white p-4">
                              <div className="grid gap-4">
                                <label>
                                  Phase {index + 1} Name
                                  <input value={phase.name} onChange={(event) => updatePhase(index, event.target.value)} />
                                </label>
                                <label>
                                  Units in {phase.name || `Phase ${index + 1}`}
                                  <input type="number" min="1" value={phase.plannedUnits || ''} onChange={(event) => updatePhaseField(index, 'plannedUnits', event.target.value)} />
                                </label>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {stockPlan.structureType === 'blocks' ? (
                    <div className="space-y-4 rounded-[22px] border border-[#e3ebf5] bg-[#f8fbff] p-5">
                      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                        <label>
                          Number of blocks
                          <input type="number" min="1" value={stockPlan.blocks.length || ''} onChange={(event) => setBlockCount(event.target.value)} />
                        </label>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {stockPlan.blocks.map((block, index) => (
                            <label key={block.id}>
                              Block {index + 1} Name
                              <input value={block.name} onChange={(event) => updateBlock(index, event.target.value)} />
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {stockPlan.structureType === 'phase_and_block' ? (
                    <div className="space-y-4 rounded-[22px] border border-[#e3ebf5] bg-[#f8fbff] p-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label>
                          Number of phases
                          <input
                            type="number"
                            min="1"
                            value={stockPlan.phases.length || ''}
                            onChange={(event) => setPhaseAndBlockCounts(event.target.value, stockPlan.phases[0]?.blocks?.length || 0)}
                          />
                        </label>
                        <label>
                          Blocks per phase
                          <input
                            type="number"
                            min="1"
                            value={stockPlan.phases[0]?.blocks?.length || ''}
                            onChange={(event) => setPhaseAndBlockCounts(stockPlan.phases.length || 0, event.target.value)}
                          />
                        </label>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
                        {stockPlan.phases.map((phase, phaseIndex) => (
                          <article key={phase.id} className="rounded-[20px] border border-[#dde4ee] bg-white p-4">
                            <div className="grid gap-4">
                              <label>
                                Phase Name
                                <input value={phase.name} onChange={(event) => updatePhase(phaseIndex, event.target.value)} />
                              </label>
                              <label>
                                Units in {phase.name || `Phase ${phaseIndex + 1}`}
                                <input type="number" min="1" value={phase.plannedUnits || ''} onChange={(event) => updatePhaseField(phaseIndex, 'plannedUnits', event.target.value)} />
                              </label>
                            </div>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              {(phase.blocks || []).map((block, blockIndex) => (
                                <label key={block.id}>
                                  Block {blockIndex + 1}
                                  <input value={block.name} onChange={(event) => updatePhaseBlock(phaseIndex, blockIndex, event.target.value)} />
                                </label>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-3">
                    <article className="rounded-[20px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Structure type</span>
                      <strong className="mt-3 block text-base font-semibold text-[#142132]">{getStructureTypeLabel(stockPlan.structureType)}</strong>
                    </article>
                    <article className="rounded-[20px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Phases</span>
                      <strong className="mt-3 block text-base font-semibold text-[#142132]">{stockPlan.phases.length || 0}</strong>
                      {stockPlan.phases.length ? (
                        <span className="mt-2 block text-sm text-[#6b7d93]">
                          {stockPlan.phases.reduce((sum, phase) => sum + Number(phase.plannedUnits || 0), 0)} units planned
                        </span>
                      ) : null}
                    </article>
                    <article className="rounded-[20px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Blocks</span>
                      <strong className="mt-3 block text-base font-semibold text-[#142132]">
                        {stockPlan.structureType === 'phase_and_block'
                          ? stockPlan.phases.reduce((sum, phase) => sum + (phase.blocks?.length || 0), 0)
                          : stockPlan.blocks.length || 0}
                      </strong>
                    </article>
                  </div>
                </section>
              ) : null}

              {stockStepIndex === 1 ? (
                <section className="space-y-5 rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                  <div className="space-y-2">
                    <h5 className="text-base font-semibold tracking-[-0.02em] text-[#142132]">Define unit types and floorplans</h5>
                    <p className="text-sm leading-6 text-[#6b7d93]">
                      Create stock templates instead of units. Add each unit type once, then define floorplans, pricing, quantities, and how
                      they should be distributed.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {stockPlan.unitTypes.map((unitType, unitTypeIndex) => (
                      <article key={unitType.id} className="rounded-[22px] border border-[#dde4ee] bg-[#f8fbff] p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="grid flex-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <label>
                              Unit Type Name
                              <input value={unitType.name} onChange={(event) => updateUnitType(unitTypeIndex, 'name', event.target.value)} placeholder="2 Bed Apartment" />
                            </label>
                            <label>
                              Default Status
                              <select value={unitType.defaultStatus} onChange={(event) => updateUnitType(unitTypeIndex, 'defaultStatus', event.target.value)}>
                                <option value="Available">Available</option>
                                <option value="Reserved">Reserved</option>
                                <option value="Sold">Sold</option>
                                <option value="Pending">Pending</option>
                              </select>
                            </label>
                            <label className="md:col-span-2 xl:col-span-3">
                              Description
                              <textarea rows={3} value={unitType.description} onChange={(event) => updateUnitType(unitTypeIndex, 'description', event.target.value)} />
                            </label>
                          </div>
                          {stockPlan.unitTypes.length > 1 ? (
                            <Button type="button" variant="ghost" className="text-[#b42318] hover:bg-[#fff5f4]" onClick={() => removeUnitType(unitTypeIndex)}>
                              <Trash2 size={14} />
                              Remove Unit Type
                            </Button>
                          ) : null}
                        </div>

                        <div className="mt-5 space-y-4">
                          {unitType.floorplans.map((floorplan, floorplanIndex) => {
                            const customTotal = (floorplan.customDistribution || []).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0)
                            return (
                              <div key={floorplan.id} className="rounded-[20px] border border-[#dde4ee] bg-white p-4">
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <strong className="block text-sm font-semibold text-[#142132]">Floorplan {floorplanIndex + 1}</strong>
                                    <span className="mt-1 block text-sm leading-6 text-[#6b7d93]">
                                      Define the commercial template once, then let Bridge generate the actual units later.
                                    </span>
                                  </div>
                                  {unitType.floorplans.length > 1 ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="text-[#b42318] hover:bg-[#fff5f4]"
                                      onClick={() => removeFloorplan(unitTypeIndex, floorplanIndex)}
                                    >
                                      <Trash2 size={14} />
                                      Remove
                                    </Button>
                                  ) : null}
                                </div>

                                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                  <label>
                                    Floorplan Name
                                    <input value={floorplan.name} onChange={(event) => updateFloorplan(unitTypeIndex, floorplanIndex, 'name', event.target.value)} placeholder="A1" />
                                  </label>
                                  <label>
                                    Size (sqm)
                                    <input type="number" min="0" value={floorplan.sizeSqm} onChange={(event) => updateFloorplan(unitTypeIndex, floorplanIndex, 'sizeSqm', event.target.value)} />
                                  </label>
                                  <label>
                                    List Price
                                    <input type="number" min="0" value={floorplan.listPrice} onChange={(event) => updateFloorplan(unitTypeIndex, floorplanIndex, 'listPrice', event.target.value)} />
                                  </label>
                                  <label>
                                    Quantity
                                    <input type="number" min="1" value={floorplan.quantity} onChange={(event) => updateFloorplan(unitTypeIndex, floorplanIndex, 'quantity', event.target.value)} />
                                  </label>
                                  <label>
                                    Floorplan File / Link
                                    <input value={floorplan.fileUrl} onChange={(event) => updateFloorplan(unitTypeIndex, floorplanIndex, 'fileUrl', event.target.value)} placeholder="Paste a file URL or reference" />
                                  </label>
                                  <label>
                                    Upload Floorplan
                                    <input type="file" onChange={(event) => updateFloorplanFile(unitTypeIndex, floorplanIndex, event.target.files?.[0] || null)} />
                                  </label>
                                  <label>
                                    Distribution Mode
                                    <select value={floorplan.distributionMode} onChange={(event) => updateFloorplan(unitTypeIndex, floorplanIndex, 'distributionMode', event.target.value)}>
                                      {stockTargets.length <= 1 ? <option value="all">Apply across full development</option> : null}
                                      {stockTargets.length > 1 ? <option value="custom">Assign quantities by phase / block</option> : null}
                                    </select>
                                  </label>
                                  <div className="rounded-[16px] border border-[#e3ebf5] bg-[#f8fbff] px-4 py-3">
                                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Upload status</span>
                                    <strong className="mt-2 block text-sm font-semibold text-[#142132]">
                                      {floorplan.fileName || floorplan.fileUrl || 'Upload later'}
                                    </strong>
                                  </div>
                                </div>

                                {floorplan.distributionMode === 'custom' && stockTargets.length > 0 ? (
                                  <div className="mt-4 space-y-3 rounded-[18px] border border-[#e3ebf5] bg-[#f8fbff] p-4">
                                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                      <div>
                                        <strong className="block text-sm font-semibold text-[#142132]">Custom distribution</strong>
                                        <p className="text-sm leading-6 text-[#6b7d93]">Set the exact quantity for each phase or block. Bridge will not auto-split grouped stock for you.</p>
                                      </div>
                                      <span className={`text-sm font-medium ${customTotal === Number(floorplan.quantity || 0) ? 'text-[#1f6d3c]' : 'text-[#b42318]'}`}>
                                        {customTotal} / {Number(floorplan.quantity || 0) || 0} assigned
                                      </span>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                      {stockTargets.map((target) => (
                                        <label key={target.id}>
                                          {target.label}
                                          <input
                                            type="number"
                                            min="0"
                                            value={(floorplan.customDistribution || []).find((entry) => entry.targetId === target.id)?.quantity ?? ''}
                                            onChange={(event) => setCustomDistributionValue(unitTypeIndex, floorplanIndex, target, event.target.value)}
                                          />
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <Button type="button" variant="secondary" onClick={() => addFloorplan(unitTypeIndex)}>
                            <Plus size={14} />
                            Add Floorplan
                          </Button>
                          <div className="rounded-full border border-[#d8e3ef] bg-white px-4 py-2 text-sm text-[#35546c]">
                            {(unitType.floorplans || []).reduce((sum, floorplan) => sum + Number(floorplan.quantity || 0), 0)} units planned in this type
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>

                  <Button type="button" variant="secondary" onClick={addUnitType}>
                    <Plus size={14} />
                    Add Another Unit Type
                  </Button>
                </section>
              ) : null}

              {stockStepIndex === 2 ? (
                <section className="space-y-5 rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
                  <div className="space-y-2">
                    <h5 className="text-base font-semibold tracking-[-0.02em] text-[#142132]">Review and generate your unit stock</h5>
                    <p className="text-sm leading-6 text-[#6b7d93]">
                      Check the totals, confirm the numbering strategy, and let Bridge generate the full unit inventory for this development.
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <article className="rounded-[20px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Structure</span>
                      <strong className="mt-3 block text-base font-semibold text-[#142132]">{getStructureTypeLabel(stockPlan.structureType)}</strong>
                    </article>
                    <article className="rounded-[20px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Unit types</span>
                      <strong className="mt-3 block text-base font-semibold text-[#142132]">{stockPlan.unitTypes.length}</strong>
                    </article>
                    <article className="rounded-[20px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Floorplans</span>
                      <strong className="mt-3 block text-base font-semibold text-[#142132]">
                        {stockPlan.unitTypes.reduce((sum, unitType) => sum + (unitType.floorplans?.length || 0), 0)}
                      </strong>
                    </article>
                    <article className="rounded-[20px] border border-[#dde4ee] bg-[#f8fbff] p-4">
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Total units</span>
                      <strong className="mt-3 block text-base font-semibold text-[#142132]">{stockSummary.totalUnits}</strong>
                    </article>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-3">
                    <article className="rounded-[20px] border border-[#dde4ee] bg-white p-4">
                      <strong className="block text-sm font-semibold text-[#142132]">By unit type</strong>
                      <div className="mt-3 space-y-2">
                        {Object.entries(stockSummary.typeCounts).length ? (
                          Object.entries(stockSummary.typeCounts).map(([label, count]) => (
                            <div key={label} className="flex items-center justify-between rounded-[14px] border border-[#edf2f7] bg-[#f8fbff] px-3 py-2 text-sm">
                              <span className="text-[#35546c]">{label}</span>
                              <strong className="text-[#142132]">{count}</strong>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-[#6b7d93]">No unit types defined yet.</p>
                        )}
                      </div>
                    </article>
                    <article className="rounded-[20px] border border-[#dde4ee] bg-white p-4">
                      <strong className="block text-sm font-semibold text-[#142132]">By floorplan</strong>
                      <div className="mt-3 space-y-2">
                        {Object.entries(stockSummary.floorplanCounts).length ? (
                          Object.entries(stockSummary.floorplanCounts).map(([label, count]) => (
                            <div key={label} className="flex items-center justify-between rounded-[14px] border border-[#edf2f7] bg-[#f8fbff] px-3 py-2 text-sm">
                              <span className="text-[#35546c]">{label}</span>
                              <strong className="text-[#142132]">{count}</strong>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-[#6b7d93]">No floorplans defined yet.</p>
                        )}
                      </div>
                    </article>
                    <article className="rounded-[20px] border border-[#dde4ee] bg-white p-4">
                      <strong className="block text-sm font-semibold text-[#142132]">By release target</strong>
                      <div className="mt-3 space-y-2">
                        {Object.entries(stockSummary.structureCounts).length ? (
                          Object.entries(stockSummary.structureCounts).map(([label, count]) => (
                            <div key={label} className="flex items-center justify-between rounded-[14px] border border-[#edf2f7] bg-[#f8fbff] px-3 py-2 text-sm">
                              <span className="text-[#35546c]">{label}</span>
                              <strong className="text-[#142132]">{count}</strong>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-[#6b7d93]">No structured distribution captured yet.</p>
                        )}
                      </div>
                    </article>
                  </div>

                  {Object.keys(stockSummary.plannedPhaseCounts || {}).length ? (
                    <article className="rounded-[20px] border border-[#dde4ee] bg-white p-4">
                      <strong className="block text-sm font-semibold text-[#142132]">Phase plan vs generated units</strong>
                      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {Object.entries(stockSummary.plannedPhaseCounts).map(([label, plannedCount]) => (
                          <div key={label} className="rounded-[14px] border border-[#edf2f7] bg-[#f8fbff] px-3 py-3 text-sm">
                            <span className="block text-[#35546c]">{label}</span>
                            <strong className="mt-1 block text-[#142132]">
                              {stockSummary.structureCounts[label] || 0} generated / {plannedCount} planned
                            </strong>
                          </div>
                        ))}
                      </div>
                    </article>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <label>
                      Unit numbering strategy
                      <select value={stockPlan.numberingStrategy} onChange={(event) => setStockPlan((previous) => ({ ...previous, numberingStrategy: event.target.value }))}>
                        <option value="sequential">Sequential numeric (001, 002)</option>
                        <option value="phase">Phase-based (PHASE-001)</option>
                        <option value="block">Block-based (BLOCK-001)</option>
                        <option value="phase_block">Phase + block based (PHASE-BLOCK-001)</option>
                      </select>
                    </label>
                    <label>
                      Number padding
                      <input
                        type="number"
                        min="2"
                        max="5"
                        value={stockPlan.numberingPadding}
                        onChange={(event) => setStockPlan((previous) => ({ ...previous, numberingPadding: Number(event.target.value || 3) }))}
                      />
                    </label>
                  </div>

                  {stockSummary.warnings.length ? (
                    <div className="space-y-3 rounded-[20px] border border-[#f8d8cc] bg-[#fff7f4] p-4">
                      <strong className="block text-sm font-semibold text-[#b42318]">Warnings to resolve before generation</strong>
                      <ul className="space-y-2 text-sm leading-6 text-[#7a271a]">
                        {stockSummary.warnings.map((warning) => (
                          <li key={warning}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="rounded-[20px] border border-[#d8e7dc] bg-[#f3fbf5] p-4 text-sm leading-6 text-[#1f6d3c]">
                      Stock plan looks good. Bridge will create the generated units and carry floorplan references into the documents step.
                    </div>
                  )}
                </section>
              ) : null}
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
            <Button
              type="button"
              variant="ghost"
              onClick={
                stepIndex === 0
                  ? onClose
                  : stepIndex === 3
                    ? stockStepIndex === 0
                      ? () => setStepIndex((previous) => Math.max(previous - 1, 0))
                      : handleStockStepBack
                    : () => setStepIndex((previous) => Math.max(previous - 1, 0))
              }
              disabled={saving}
            >
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
                {stepIndex === 4 ? (
                  <Button type="button" variant="secondary" onClick={handleSkipDocuments} disabled={saving}>
                    Skip for Now
                  </Button>
                ) : null}
                {stepIndex === 3 ? (
                  <Button type="button" onClick={stockStepIndex === 2 ? handleFinalizeStock : handleStockStepNext} disabled={saving}>
                    {stockStepIndex === 2 ? 'Generate Units and Continue' : 'Next'}
                  </Button>
                ) : (
                  <Button type="button" onClick={handleNext} disabled={saving}>
                    Next
                  </Button>
                )}
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
