import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const pagePath = path.join(root, 'src', 'pages', 'LegalDocumentWorkspacePage.jsx')
const workspacePath = path.join(root, 'src', 'components', 'documents', 'LegalDocumentWorkspace.jsx')

const page = fs.readFileSync(pagePath, 'utf8')
const workspace = fs.readFileSync(workspacePath, 'utf8')

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} is missing: ${needle}`)
  }
}

function assertMatches(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`${label} did not match ${pattern}`)
  }
}

assertIncludes(page, "import { recordPerformanceMetric } from '../services/observability/performanceMetrics'", 'Phase 5 page performance import')
assertIncludes(page, 'function getPerformanceNow()', 'Phase 5 page timing helper')
assertIncludes(page, 'const generationStartedAt = getPerformanceNow()', 'Phase 5 generation total timer')
assertIncludes(page, 'const recordGenerationMetric = (metricName, startedAt, metadata = {}) => {', 'Phase 5 generation metric recorder')
assertIncludes(page, 'void recordPerformanceMetric({', 'Phase 5 non-blocking generation metrics')
assertIncludes(page, "recordGenerationMetric('legal_document.generation.status_lookup'", 'Phase 5 status lookup metric')
assertIncludes(page, "recordGenerationMetric('legal_document.generation.seller_onboarding'", 'Phase 5 mandate onboarding metric')
assertIncludes(page, "recordGenerationMetric('legal_document.generation.template_lookup'", 'Phase 5 template lookup metric')
assertIncludes(page, "recordGenerationMetric('legal_document.generation.packet_prepare'", 'Phase 5 packet preparation metric')
assertIncludes(page, "recordGenerationMetric('legal_document.generation.render_save'", 'Phase 5 render/save metric')
assertIncludes(page, "recordGenerationMetric('legal_document.generation.total'", 'Phase 5 total generation metric')
assertMatches(page, /metadata: \{[\s\S]*packetType,[\s\S]*documentLabel,[\s\S]*persistForSend: persistForSend === true,[\s\S]*resetExisting: resetExisting === true/, 'Phase 5 generation metric context')

assertIncludes(workspace, "import { recordPerformanceMetric } from '../../services/observability/performanceMetrics'", 'Phase 5 workspace performance import')
assertIncludes(workspace, 'const recordWorkspacePerformance = useCallback((metricName, startedAt, metadata = {}) => {', 'Phase 5 workspace metric recorder')
assertIncludes(workspace, 'void recordPerformanceMetric({', 'Phase 5 non-blocking workspace metrics')
assertIncludes(workspace, "recordWorkspacePerformance('legal_document.signing.signer_readiness'", 'Phase 5 signer readiness metric')
assertIncludes(workspace, "recordWorkspacePerformance('legal_document.signing.email_delivery'", 'Phase 5 email delivery metric')
assertIncludes(workspace, "recordWorkspacePerformance('legal_document.signing.total'", 'Phase 5 total signing metric')
assertMatches(workspace, /metadata: \{[\s\S]*packetType,[\s\S]*state:[\s\S]*packetId:[\s\S]*\.\.\.metadata/, 'Phase 5 signing metric context')
assertMatches(workspace, /catch \(sendError\) \{[\s\S]*recordWorkspacePerformance\('legal_document.signing.email_delivery'[\s\S]*failed: true/, 'Phase 5 failed email delivery metric')

console.log('document workspace performance phase 5 checks passed')
