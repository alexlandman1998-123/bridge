import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

const PHASE = 'document_request_phase0_freeze_and_map'
const DEFAULT_OUTPUT_PATH = 'output/document-request-phase0-freeze-and-map.json'
const CANONICAL_POLICY_PATH = 'config/document-request-phase1-legal-checklist.json'

const RUNTIME_SURFACES = Object.freeze([
  {
    id: 'canonical_policy',
    label: 'Canonical document policy',
    owner: 'product_legal',
    path: CANONICAL_POLICY_PATH,
    markers: ['document_request_phase1_legal_checklist_v1', '"requirements"', '"signoffDecisions"'],
    phaseRisk: 'Policy has pending legal decisions; Phase 1 must convert this into the only request policy.',
  },
  {
    id: 'canonical_planner',
    label: 'Canonical request planner',
    owner: 'engineering',
    path: 'src/core/documents/documentRequestCanonicalPlanner.js',
    markers: ['buildCanonicalDocumentRequestPlan', 'pending_policy', 'bond_originator'],
    phaseRisk: 'Planner visibility/requestability must remain aligned with the policy matrix.',
  },
  {
    id: 'canonical_adapter',
    label: 'Legacy-to-canonical adapter',
    owner: 'engineering',
    path: 'src/core/documents/documentRequestCanonicalAdapter.js',
    markers: ['resolveCanonicalDocumentRequestKey', 'income_affordability_documents', 'signed_otp'],
    phaseRisk: 'Legacy keys must keep mapping until migration and backfill are complete.',
  },
  {
    id: 'canonical_transaction_sync',
    label: 'Canonical transaction sync',
    owner: 'engineering',
    path: 'src/services/documents/documentRequestCanonicalTransactionSyncService.js',
    markers: ['syncCanonicalRequiredDocumentsForTransactionContext', 'buildCanonicalDocumentRequestScenarioFromTransactionContext'],
    phaseRisk: 'This is the bridge between calculated policy and transaction rows.',
  },
  {
    id: 'canonical_required_document_sync',
    label: 'Canonical required-document row sync',
    owner: 'engineering',
    path: 'src/services/documents/documentRequestCanonicalRequiredDocumentSyncService.js',
    markers: ['transaction_required_documents', 'canonical_requirement_instance_id'],
    phaseRisk: 'Readiness and upload state must attach to stable canonical requirement rows.',
  },
  {
    id: 'buyer_legacy_engine',
    label: 'Buyer legacy requirement engine',
    owner: 'buyer_onboarding',
    path: 'src/lib/buyerRequirementEngine.js',
    markers: ['getBuyerRequirementProfile', 'deriveOnboardingConfiguration', 'legacy'],
    phaseRisk: 'Buyer generation still has compatibility fallback behavior; Phase 3 should remove surprises.',
  },
  {
    id: 'buyer_personas',
    label: 'Buyer persona and employment rules',
    owner: 'buyer_onboarding',
    path: 'src/lib/purchaserPersonas.js',
    markers: ['deriveOnboardingConfiguration', 'employment_type', 'purchase_finance_type'],
    phaseRisk: 'Buyer entity and employment rules must be reconciled with canonical and bond requirements.',
  },
  {
    id: 'bond_document_rules',
    label: 'Bond document rule set',
    owner: 'bond_ops',
    path: 'src/modules/bond/application/documents/bondApplicationDocumentRules.js',
    markers: ['BOND_APPLICATION_DOCUMENT_RULE_SET_VERSION', 'employment', 'self_employed'],
    phaseRisk: 'Bond child requirements are more granular than the transaction-level canonical row.',
  },
  {
    id: 'seller_requirement_service',
    label: 'Seller requirement service',
    owner: 'seller_onboarding',
    path: 'src/services/sellerDocumentRequirementsService.js',
    markers: ['getSellerRequiredDocuments', 'property_acquisition_record', 'capital_improvement_records'],
    phaseRisk: 'Stale/deferred seller generated keys exist and must stay non-client-facing unless policy approves them.',
  },
  {
    id: 'seller_portal_projection',
    label: 'Seller portal and document-centre projection',
    owner: 'client_portal',
    path: 'src/services/clientPortalWorkspaceService.js',
    markers: ['buildDocumentCenter', 'getSellerRequiredDocuments', 'additionalDocumentRequests'],
    phaseRisk: 'Portal projection must show the same requirement containers as internal workspaces.',
  },
  {
    id: 'client_portal_document_centre',
    label: 'Client portal document centre UI',
    owner: 'client_portal',
    path: 'src/components/client-portal/documents/ClientDocumentCentre.jsx',
    markers: ['normalizeAdditionalRequest', 'additionalRequests', 'upload'],
    phaseRisk: 'Ad hoc request containers must remain uploadable from the portal.',
  },
  {
    id: 'client_portal_page',
    label: 'Client portal workspace page',
    owner: 'client_portal',
    path: 'src/pages/ClientPortal.jsx',
    markers: ['additionalDocumentRequestsForWorkspace', 'additionalRequestDocuments', 'documentCenter'],
    phaseRisk: 'Buyer and seller portal filters must not hide valid request containers.',
  },
  {
    id: 'shared_request_api',
    label: 'Shared transaction document request API',
    owner: 'platform',
    path: 'src/lib/api.js',
    markers: ['createTransactionDocumentRequests', 'document_request_groups', 'document_requests', 'transaction_required_documents'],
    phaseRisk: 'Attorney, bond-originator, and agent requests should create shared containers rather than disconnected rows.',
  },
  {
    id: 'attorney_bond_workspace',
    label: 'Attorney, agent, and bond-originator transaction workspace',
    owner: 'workspace',
    path: 'src/pages/AttorneyTransactionDetail.jsx',
    markers: ['handleQuickRequestDocuments', 'createTransactionDocumentRequests', 'requestAttorneyWorkflowLaneDocument'],
    phaseRisk: 'Quick request actions and lane-specific requests are not yet guaranteed to share one canonical container model.',
  },
  {
    id: 'attorney_lane_requests',
    label: 'Attorney workflow lane document requests',
    owner: 'attorney_ops',
    path: 'src/services/attorneyWorkflow/attorneyWorkflowLaneService.js',
    markers: ['requestAttorneyWorkflowLaneDocument', 'document_requests'],
    phaseRisk: 'Lane-specific requests currently write document_requests directly and need a Phase 2 alignment decision.',
  },
  {
    id: 'attorney_lane_panel',
    label: 'Attorney lane request UI',
    owner: 'attorney_ops',
    path: 'src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx',
    markers: ['requestAttorneyWorkflowLaneDocument', 'Request Document'],
    phaseRisk: 'Lane request UI must display linked request containers and lifecycle status.',
  },
  {
    id: 'bond_applications_table',
    label: 'Bond applications table request action',
    owner: 'bond_ops',
    path: 'src/components/BondApplicationsTable.jsx',
    markers: ['Request Documents', 'disabled'],
    phaseRisk: 'Visible disabled request actions should be wired to the shared container path in Phase 2/4.',
  },
  {
    id: 'agent_listing_detail',
    label: 'Agent listing seller document workspace',
    owner: 'agent_workspace',
    path: 'src/pages/AgentListingDetail.jsx',
    markers: ['uploadPrivateListingDocument', 'sellerDocumentUpload', 'requiredDocuments'],
    phaseRisk: 'Agent upload-on-behalf must cover the same seller requirements exposed in the seller portal.',
  },
  {
    id: 'unit_detail_requests',
    label: 'Unit/detail buyer document requests',
    owner: 'developer_sales',
    path: 'src/pages/UnitDetail.jsx',
    markers: ['createTransactionDocumentRequests', 'getRequiredBuyerDocuments'],
    phaseRisk: 'Development buyer document requests must be folded into the same canonical/container model.',
  },
  {
    id: 'schema_document_tables',
    label: 'Document request database tables',
    owner: 'data_platform',
    path: 'sql/schema.sql',
    markers: ['create table if not exists document_request_groups', 'create table if not exists document_requests', 'create table if not exists transaction_required_documents'],
    phaseRisk: 'Canonical requirements and ad hoc requests currently live in separate table families.',
  },
])

const DEFERRED_OR_SUSPICIOUS_KEYS = Object.freeze([
  {
    key: 'property_acquisition_record',
    expectedPhase0Disposition: 'freeze_as_not_client_requested',
    reason: 'No confirmed reason to ask sellers for acquisition records during early onboarding.',
  },
  {
    key: 'capital_improvement_records',
    expectedPhase0Disposition: 'freeze_as_not_client_requested',
    reason: 'Potential CGT/supporting-evidence use should not become a default upload request without legal approval.',
  },
])

const PHASE0_FREEZE_RULES = Object.freeze([
  'Do not add new client-visible required document keys until Phase 1 legal/product approval.',
  'Do not make deferred acquisition/improvement records client-visible unless a legal trigger is approved.',
  'Do not create another request table or portal-only request model; new work must use the shared container design.',
  'Do not retire legacy buyer/seller keys until the adapter and backfill map prove parity.',
  'Do not treat generated documents as upload requests when they should satisfy canonical requirements.',
  'Do not ship request-container propagation without buyer, seller, agent, attorney, and bond-originator smoke coverage.',
])

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    output: DEFAULT_OUTPUT_PATH,
    pretty: true,
  }

  for (const arg of argv) {
    if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
    else if (arg === '--compact') options.pretty = false
  }

  return options
}

function sha256(value = '') {
  return createHash('sha256').update(value).digest('hex')
}

function lineNumberFor(source = '', needle = '') {
  const index = source.indexOf(needle)
  if (index < 0) return null
  return source.slice(0, index).split(/\r?\n/).length
}

function readSource(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath)
  if (!fs.existsSync(absolutePath)) {
    return {
      exists: false,
      source: '',
      hash: null,
      lineCount: 0,
    }
  }
  const source = fs.readFileSync(absolutePath, 'utf8')
  return {
    exists: true,
    source,
    hash: `sha256:${sha256(source)}`,
    lineCount: source.split(/\r?\n/).length,
  }
}

function summarizeSurface(surface) {
  const inspected = readSource(surface.path)
  const markerResults = surface.markers.map((marker) => ({
    marker,
    present: inspected.source.includes(marker),
    line: lineNumberFor(inspected.source, marker),
  }))

  return {
    ...surface,
    exists: inspected.exists,
    lineCount: inspected.lineCount,
    contentHash: inspected.hash,
    markers: markerResults,
    missingMarkers: markerResults.filter((marker) => !marker.present).map((marker) => marker.marker),
    readOnlyPhase0Action: 'map_and_freeze',
  }
}

function summarizeCanonicalPolicy() {
  const inspected = readSource(CANONICAL_POLICY_PATH)
  if (!inspected.exists) {
    return {
      exists: false,
      error: 'canonical_policy_missing',
    }
  }

  const policy = JSON.parse(inspected.source)
  const requirements = Array.isArray(policy.requirements) ? policy.requirements : []
  const signoffDecisions = Array.isArray(policy.signoffDecisions) ? policy.signoffDecisions : []
  const byOwnerRole = {}
  const byLevel = {}
  const byVisibility = {}
  const pendingPolicyKeys = []

  for (const requirement of requirements) {
    const ownerRole = requirement.ownerRole || 'unknown'
    const level = requirement.level || 'unknown'
    const visibility = requirement.visibility || 'unknown'
    byOwnerRole[ownerRole] = (byOwnerRole[ownerRole] || 0) + 1
    byLevel[level] = (byLevel[level] || 0) + 1
    byVisibility[visibility] = (byVisibility[visibility] || 0) + 1
    if (String(level).includes('pending_policy')) pendingPolicyKeys.push(requirement.key)
  }

  return {
    exists: true,
    version: policy.version || null,
    status: policy.status || null,
    jurisdiction: policy.jurisdiction || null,
    requirementCount: requirements.length,
    signoffDecisionCount: signoffDecisions.length,
    pendingSignoffKeys: signoffDecisions.filter((item) => item.status === 'pending').map((item) => item.key),
    pendingPolicyKeys,
    byOwnerRole,
    byLevel,
    byVisibility,
  }
}

function buildReport() {
  const surfaces = RUNTIME_SURFACES.map(summarizeSurface)
  const missingFiles = surfaces.filter((surface) => !surface.exists).map((surface) => surface.id)
  const missingMarkers = surfaces
    .filter((surface) => surface.missingMarkers.length)
    .map((surface) => ({
      id: surface.id,
      path: surface.path,
      missingMarkers: surface.missingMarkers,
    }))

  const deferredKeyFindings = DEFERRED_OR_SUSPICIOUS_KEYS.map((item) => {
    const appearances = surfaces
      .filter((surface) => surface.exists)
      .flatMap((surface) => {
        const inspected = readSource(surface.path)
        const line = lineNumberFor(inspected.source, item.key)
        return line ? [{ surfaceId: surface.id, path: surface.path, line }] : []
      })

    return {
      ...item,
      appearances,
      currentlyPresentInSource: appearances.length > 0,
    }
  })

  return {
    phase: PHASE,
    generatedAt: new Date().toISOString(),
    commit: false,
    mutatedData: false,
    scope: {
      buyer: true,
      seller: true,
      agent: true,
      attorney: true,
      bondOriginator: true,
      generatedDocuments: true,
      requestContainers: true,
      canonicalPolicy: true,
    },
    freezeRules: PHASE0_FREEZE_RULES,
    canonicalPolicy: summarizeCanonicalPolicy(),
    surfaces,
    deferredOrSuspiciousKeys: deferredKeyFindings,
    phase0Findings: [
      {
        id: 'canonical_policy_exists_but_pending',
        severity: 'medium',
        finding: 'The canonical legal checklist exists, but several policy decisions are still pending signoff.',
        nextPhase: 'Phase 1',
      },
      {
        id: 'request_containers_are_shared_but_not_full_readiness_source',
        severity: 'high',
        finding: 'The shared createTransactionDocumentRequests path creates request containers, but Phase 2 must prove they count consistently in canonical readiness and every workspace projection.',
        nextPhase: 'Phase 2',
      },
      {
        id: 'buyer_legacy_fallback_still_present',
        severity: 'medium',
        finding: 'Buyer-side generation still has legacy compatibility paths that need explicit canonical migration coverage.',
        nextPhase: 'Phase 3',
      },
      {
        id: 'bond_child_requirements_need_parent_mapping',
        severity: 'medium',
        finding: 'Bond application document rules are more granular than the transaction-level income affordability canonical requirement.',
        nextPhase: 'Phase 4',
      },
      {
        id: 'seller_deferred_keys_present_in_source',
        severity: 'medium',
        finding: 'Seller acquisition/improvement keys are present in source and should remain frozen from default client requests until legally approved.',
        nextPhase: 'Phase 5',
      },
      {
        id: 'upload_on_behalf_needs_cross_role_parity',
        severity: 'high',
        finding: 'Phase 7 must prove agent-assisted buyer and seller uploads satisfy the same containers the client portal shows.',
        nextPhase: 'Phase 7',
      },
    ],
    gate: {
      status: missingFiles.length || missingMarkers.length ? 'mapped_with_attention_required' : 'mapped',
      missingFiles,
      missingMarkers,
      mayProceedToPhase1: missingFiles.length === 0,
      requiresRuntimeChange: false,
    },
  }
}

async function main() {
  const options = parseArgs()
  const report = buildReport()
  const outputPath = path.resolve(process.cwd(), options.output)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`)
  console.log(JSON.stringify({
    phase: report.phase,
    status: report.gate.status,
    output: options.output,
    mutatedData: report.mutatedData,
    surfaceCount: report.surfaces.length,
    requirementCount: report.canonicalPolicy.requirementCount || 0,
    deferredKeyCount: report.deferredOrSuspiciousKeys.filter((item) => item.currentlyPresentInSource).length,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
