export const COMMERCIAL_LAUNCH_MINIMUMS = {
  landlords: 50,
  tenants: 100,
  properties: 50,
  vacancies: 150,
  requirements: 100,
  deals: 75,
  headsOfTerms: 50,
  leases: 100,
}

export const COMMERCIAL_LAUNCH_ROLE_MATRIX = [
  {
    role: 'Broker',
    visibility: ['Assigned records', 'Created records', 'Allowed branch records'],
    blocked: ['Outside-scope branch records', 'Internal management reporting'],
  },
  {
    role: 'Team Leader',
    visibility: ['Team records', 'Team activity', 'Team pipeline', 'Team Heads of Terms and leases'],
    blocked: ['Unrelated teams outside permission scope'],
  },
  {
    role: 'Branch Manager',
    visibility: ['Entire branch', 'All branch brokers', 'All branch teams', 'Branch properties, deals, Heads of Terms, and leases'],
    blocked: ['Other branches unless organisation policy allows'],
  },
  {
    role: 'Organisation Admin',
    visibility: ['All commercial records inside the organisation', 'Cross-branch reporting', 'Assignment oversight'],
    blocked: ['Other organisations'],
  },
  {
    role: 'HQ Admin',
    visibility: ['All authorised commercial records', 'Executive reporting', 'Support diagnostics'],
    blocked: ['Portal token impersonation without explicit token context'],
  },
  {
    role: 'Landlord Portal',
    visibility: ['Curated property, vacancy, Heads of Terms, lease, document request, and timeline information'],
    blocked: ['Commissions', 'Internal notes', 'Broker management tools', 'Other clients'],
  },
  {
    role: 'Tenant Portal',
    visibility: ['Curated requirement, deal, Heads of Terms, lease, document request, and timeline information'],
    blocked: ['Commissions', 'Internal notes', 'Landlord-only records', 'Other tenants'],
  },
]

const ENTITY_MAP = {
  commercial_landlord: 'landlords',
  commercial_tenant: 'tenants',
  commercial_property: 'properties',
  commercial_vacancy: 'vacancies',
  commercial_requirement: 'requirements',
  commercial_deal: 'deals',
  commercial_heads_of_terms: 'headsOfTerms',
  commercial_hot: 'headsOfTerms',
  commercial_lease: 'leases',
}

function rows(value) {
  return Array.isArray(value) ? value : []
}

function text(value) {
  return String(value || '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function byId(items) {
  return new Map(rows(items).filter((item) => item?.id).map((item) => [item.id, item]))
}

function duplicateIds(items) {
  const seen = new Set()
  const duplicates = new Set()
  rows(items).forEach((item) => {
    if (!item?.id) return
    if (seen.has(item.id)) duplicates.add(item.id)
    seen.add(item.id)
  })
  return Array.from(duplicates)
}

function makeIssue(entity, id, severity, message) {
  return { entity, id: id || '', severity, message }
}

function pushMissingReference(issues, { entity, id, field, value, targetMap, targetLabel, required = false }) {
  if (!value) {
    if (required) issues.push(makeIssue(entity, id, 'blocking', `${field} is required but missing`))
    return
  }
  if (!targetMap.has(value)) issues.push(makeIssue(entity, id, 'blocking', `${field} points to missing ${targetLabel}`))
}

export function buildCommercialSeedSaturationStatus(counts = {}) {
  return Object.entries(COMMERCIAL_LAUNCH_MINIMUMS).map(([key, minimum]) => {
    const count = Number(counts[key] || 0)
    return {
      key,
      count,
      minimum,
      status: count >= minimum ? 'pass' : 'fail',
    }
  })
}

export function buildCommercialDataIntegrityAudit(data = {}) {
  const landlords = rows(data.landlords)
  const tenants = rows(data.tenants)
  const properties = rows(data.properties)
  const vacancies = rows(data.vacancies)
  const requirements = rows(data.requirements)
  const deals = rows(data.deals)
  const headsOfTerms = rows(data.headsOfTerms || data.hots)
  const leases = rows(data.leases)
  const documents = rows(data.documents)
  const documentRequests = rows(data.documentRequests)
  const activity = rows(data.activity)

  const indexes = {
    landlords: byId(landlords),
    tenants: byId(tenants),
    properties: byId(properties),
    vacancies: byId(vacancies),
    requirements: byId(requirements),
    deals: byId(deals),
    headsOfTerms: byId(headsOfTerms),
    leases: byId(leases),
  }
  const issues = []

  Object.entries({ landlords, tenants, properties, vacancies, requirements, deals, headsOfTerms, leases, documents, documentRequests, activity })
    .forEach(([entity, collection]) => {
      duplicateIds(collection).forEach((id) => issues.push(makeIssue(entity, id, 'blocking', 'Duplicate record id')))
    })

  properties.forEach((property) => {
    pushMissingReference(issues, {
      entity: 'properties',
      id: property.id,
      field: 'landlord_id',
      value: property.landlord_id,
      targetMap: indexes.landlords,
      targetLabel: 'landlord',
    })
  })

  vacancies.forEach((vacancy) => {
    pushMissingReference(issues, {
      entity: 'vacancies',
      id: vacancy.id,
      field: 'property_id',
      value: vacancy.property_id,
      targetMap: indexes.properties,
      targetLabel: 'property',
      required: true,
    })
    pushMissingReference(issues, {
      entity: 'vacancies',
      id: vacancy.id,
      field: 'landlord_id',
      value: vacancy.landlord_id,
      targetMap: indexes.landlords,
      targetLabel: 'landlord',
    })
  })

  requirements.forEach((requirement) => {
    pushMissingReference(issues, {
      entity: 'requirements',
      id: requirement.id,
      field: 'tenant_id',
      value: requirement.tenant_id,
      targetMap: indexes.tenants,
      targetLabel: 'tenant',
    })
  })

  deals.forEach((deal) => {
    pushMissingReference(issues, { entity: 'deals', id: deal.id, field: 'requirement_id', value: deal.requirement_id, targetMap: indexes.requirements, targetLabel: 'requirement' })
    pushMissingReference(issues, { entity: 'deals', id: deal.id, field: 'tenant_id', value: deal.tenant_id, targetMap: indexes.tenants, targetLabel: 'tenant' })
    pushMissingReference(issues, { entity: 'deals', id: deal.id, field: 'property_id', value: deal.property_id, targetMap: indexes.properties, targetLabel: 'property' })
    pushMissingReference(issues, { entity: 'deals', id: deal.id, field: 'vacancy_id', value: deal.vacancy_id, targetMap: indexes.vacancies, targetLabel: 'vacancy' })
  })

  headsOfTerms.forEach((hot) => {
    pushMissingReference(issues, { entity: 'headsOfTerms', id: hot.id, field: 'deal_id', value: hot.deal_id, targetMap: indexes.deals, targetLabel: 'deal', required: true })
    pushMissingReference(issues, { entity: 'headsOfTerms', id: hot.id, field: 'tenant_id', value: hot.tenant_id, targetMap: indexes.tenants, targetLabel: 'tenant' })
    pushMissingReference(issues, { entity: 'headsOfTerms', id: hot.id, field: 'property_id', value: hot.property_id, targetMap: indexes.properties, targetLabel: 'property' })
    pushMissingReference(issues, { entity: 'headsOfTerms', id: hot.id, field: 'vacancy_id', value: hot.vacancy_id, targetMap: indexes.vacancies, targetLabel: 'vacancy' })
  })

  leases.forEach((lease) => {
    pushMissingReference(issues, { entity: 'leases', id: lease.id, field: 'deal_id', value: lease.deal_id, targetMap: indexes.deals, targetLabel: 'deal' })
    pushMissingReference(issues, { entity: 'leases', id: lease.id, field: 'heads_of_terms_id', value: lease.heads_of_terms_id, targetMap: indexes.headsOfTerms, targetLabel: 'Heads of Terms' })
    pushMissingReference(issues, { entity: 'leases', id: lease.id, field: 'tenant_id', value: lease.tenant_id, targetMap: indexes.tenants, targetLabel: 'tenant' })
    pushMissingReference(issues, { entity: 'leases', id: lease.id, field: 'property_id', value: lease.property_id, targetMap: indexes.properties, targetLabel: 'property' })
    pushMissingReference(issues, { entity: 'leases', id: lease.id, field: 'vacancy_id', value: lease.vacancy_id, targetMap: indexes.vacancies, targetLabel: 'vacancy' })
  })

  ;[...documents, ...documentRequests, ...activity].forEach((record) => {
    const collectionKey = ENTITY_MAP[lower(record.entity_type)]
    if (!collectionKey) {
      issues.push(makeIssue('linkedRecords', record.id, 'warning', `Unknown entity_type ${record.entity_type || 'blank'}`))
      return
    }
    pushMissingReference(issues, {
      entity: 'linkedRecords',
      id: record.id,
      field: `${record.entity_type}.entity_id`,
      value: record.entity_id,
      targetMap: indexes[collectionKey],
      targetLabel: collectionKey,
      required: true,
    })
  })

  const blocking = issues.filter((issue) => issue.severity === 'blocking')
  return {
    status: blocking.length ? 'fail' : 'pass',
    counts: {
      landlords: landlords.length,
      tenants: tenants.length,
      properties: properties.length,
      vacancies: vacancies.length,
      requirements: requirements.length,
      deals: deals.length,
      headsOfTerms: headsOfTerms.length,
      leases: leases.length,
      documents: documents.length,
      documentRequests: documentRequests.length,
      activity: activity.length,
    },
    issues,
  }
}

export function buildCommercialDashboardIntegrity(data = {}) {
  const properties = rows(data.properties)
  const vacancies = rows(data.vacancies)
  const deals = rows(data.deals)
  const headsOfTerms = rows(data.headsOfTerms || data.hots)
  const leases = rows(data.leases)
  const documentRequests = rows(data.documentRequests)

  const totalGLA = properties.reduce((sum, property) => sum + number(property.gla_m2), 0)
  const vacantGLA = vacancies.length
    ? vacancies.reduce((sum, vacancy) => sum + number(vacancy.available_area_m2), 0)
    : properties.reduce((sum, property) => sum + number(property.available_space_m2), 0)
  const occupiedGLA = Math.max(0, totalGLA - vacantGLA)
  const vacancyRate = totalGLA ? Math.round((vacantGLA / totalGLA) * 1000) / 10 : 0
  const pipelineValue = deals.reduce((sum, deal) => sum + number(deal.deal_value), 0)
  const leaseValue = leases.reduce((sum, lease) => sum + (number(lease.monthly_rental) * Math.max(1, number(lease.lease_term_months || lease.term_months || 12))), 0)
  const outstandingDocuments = documentRequests.filter((request) => !['approved', 'completed', 'uploaded'].includes(lower(request.status))).length
  const metrics = { totalGLA, vacantGLA, occupiedGLA, vacancyRate, pipelineValue, leaseValue, hotCount: headsOfTerms.length, outstandingDocuments }
  const invalidMetrics = Object.entries(metrics).filter(([, value]) => !Number.isFinite(value)).map(([key]) => key)

  return {
    status: invalidMetrics.length ? 'fail' : 'pass',
    metrics,
    invalidMetrics,
  }
}

export function buildCommercialWorkflowReadiness(data = {}) {
  const properties = rows(data.properties)
  const vacancies = rows(data.vacancies)
  const deals = rows(data.deals)
  const headsOfTerms = rows(data.headsOfTerms || data.hots)
  const leases = rows(data.leases)
  const documents = rows(data.documents)
  const documentRequests = rows(data.documentRequests)
  const portalAccess = rows(data.portalAccess)
  const portalMessages = rows(data.portalMessages)

  const hotByDealId = new Map(headsOfTerms.filter((hot) => hot?.deal_id).map((hot) => [hot.deal_id, hot]))
  const leaseByHotId = new Map(leases.filter((lease) => lease?.heads_of_terms_id).map((lease) => [lease.heads_of_terms_id, lease]))
  const vacanciesByProperty = vacancies.reduce((groups, vacancy) => {
    if (!vacancy?.property_id) return groups
    const group = groups.get(vacancy.property_id) || []
    group.push(vacancy)
    groups.set(vacancy.property_id, group)
    return groups
  }, new Map())
  const dealByVacancy = new Map(deals.filter((deal) => deal?.vacancy_id).map((deal) => [deal.vacancy_id, deal]))

  const hasFullLeaseJourney = deals.some((deal) => {
    const hot = hotByDealId.get(deal.id)
    const lease = hot?.id ? leaseByHotId.get(hot.id) : null
    return Boolean(deal.requirement_id && deal.vacancy_id && hot?.id && lease?.id)
  })
  const hasPropertyJourney = properties.some((property) => {
    const propertyVacancies = vacanciesByProperty.get(property.id) || []
    return propertyVacancies.some((vacancy) => Boolean(vacancy?.id && dealByVacancy.get(vacancy.id)?.requirement_id))
  })
  const hasLandlordJourney = leases.some((lease) => Boolean(lease.landlord_id && lease.property_id && lease.vacancy_id && lease.tenant_id))
  const hasPortalDocumentJourney = Boolean(portalAccess.length && documents.length && documentRequests.length && portalMessages.length)
  const hasHotToLeaseJourney = headsOfTerms.some((hot) => ['signed', 'converted'].includes(lower(hot.status)) && leaseByHotId.get(hot.id))
  const hasRenewalJourney = leases.some((lease) => ['renewal_pending', 'expiring_soon', 'active'].includes(lower(lease.status)) && lease.lease_end_date)

  const journeys = [
    { name: 'Requirement -> Vacancy -> Deal -> Heads of Terms -> Lease', status: hasFullLeaseJourney ? 'pass' : 'fail' },
    { name: 'Property -> Vacancy -> Requirement Match -> Deal', status: hasPropertyJourney ? 'pass' : 'fail' },
    { name: 'Landlord -> Property -> Vacancy -> Tenant -> Lease', status: hasLandlordJourney ? 'pass' : 'fail' },
    { name: 'Portal User -> Document Upload -> Broker Review', status: hasPortalDocumentJourney ? 'pass' : 'warning' },
    { name: 'Heads of Terms Creation -> Heads of Terms Approval -> Lease Creation', status: hasHotToLeaseJourney ? 'pass' : 'fail' },
    { name: 'Lease Expiry -> Renewal Visibility', status: hasRenewalJourney ? 'pass' : 'fail' },
  ]

  return {
    status: journeys.some((journey) => journey.status === 'fail') ? 'fail' : 'pass',
    journeys,
  }
}

export function buildCommercialPermissionReadinessMatrix() {
  return COMMERCIAL_LAUNCH_ROLE_MATRIX.map((row) => ({
    ...row,
    status: row.visibility.length && row.blocked.length ? 'ready' : 'incomplete',
  }))
}

export function buildCommercialLaunchReadinessReport(data = {}) {
  const integrity = buildCommercialDataIntegrityAudit(data)
  const dashboard = buildCommercialDashboardIntegrity(data)
  const workflows = buildCommercialWorkflowReadiness(data)
  const seedSaturation = buildCommercialSeedSaturationStatus(integrity.counts)
  const permissions = buildCommercialPermissionReadinessMatrix()
  const failingSeedGroups = seedSaturation.filter((item) => item.status !== 'pass')

  return {
    status: [integrity.status, dashboard.status, workflows.status].includes('fail') || failingSeedGroups.length ? 'needs_attention' : 'ready',
    generatedAt: new Date().toISOString(),
    integrity,
    dashboard,
    workflows,
    permissions,
    seedSaturation,
    knownIssues: [
      'Portal tables must be migrated before token routes can serve real external workspaces.',
      'Production sign-off still requires authenticated browser testing against the deployed Supabase project.',
    ],
    deferredFeatures: [
      'Attorney workflows',
      'Residential transaction engine conversion',
      'E-signature integrations',
      'Payroll-grade commission accounting',
    ],
    futureEnhancements: [
      'Automated performance baselines against production-scale datasets',
      'Portal client analytics',
      'Advanced renewal workflows',
    ],
  }
}
