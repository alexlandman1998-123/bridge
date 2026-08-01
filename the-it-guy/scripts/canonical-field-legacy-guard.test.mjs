import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const PROJECT_ROOT = path.resolve(new URL('..', import.meta.url).pathname)

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:canonical-field-legacy-guard'],
  'node scripts/canonical-field-legacy-guard.test.mjs',
  'package.json should expose the canonical legacy-field guard.',
)
assert.match(
  packageJson.scripts?.['verify:canonical-fields'] || '',
  /test:canonical-field-legacy-guard/,
  'verify:canonical-fields should include the legacy-field guard.',
)

const PROTECTED_ROOTS = [
  'src/core/documents',
  'src/modules/bond/integrations',
  'src/pages',
  'src/services',
]

const SOURCE_OF_TRUTH_FILES = new Set([
  'src/core/documents/canonicalFieldResolver.js',
  'src/core/documents/mandateDataMapper.js',
  'src/core/documents/mandateTemplateDataSourceMap.js',
  'src/core/documents/mergeFieldRegistry.js',
  'src/services/portalCanonicalFieldFallbacks.js',
])

const LEGACY_FIELD_PATTERN = /(?:\?\.|\.)(buyer_name|buyerName|client_name|clientName|seller_name|sellerName|property_address_line_1|propertyAddressLine1|property_address|propertyAddress|property_description|propertyDescription)\b/g

const LEGACY_READ_BASELINE = Object.freeze({
  'src/core/documents/legalDocumentScenarioRequirements.js': 1,
  'src/core/documents/legalDocumentSignerProfile.js': 1,
  'src/core/documents/mandateReadiness.js': 16,
  'src/core/documents/mandateValidation.js': 1,
  'src/core/documents/otpReadiness.js': 9,
  'src/core/documents/packetService.js': 6,
  'src/core/documents/packetWorkflow.js': 7,
  'src/modules/bond/integrations/canonical/canonicalBondApplicationExport.js': 1,
  'src/pages/Agents.jsx': 2,
  'src/pages/AttorneyMattersPage.jsx': 1,
  'src/pages/AttorneyTransactionDetail.jsx': 36,
  'src/pages/ClientPortal.jsx': 8,
  'src/pages/Dashboard.jsx': 7,
  'src/pages/LegalDocumentWorkspacePage.jsx': 27,
  'src/pages/bond/BondConsultantPerformancePage.jsx': 2,
  'src/services/agentLeadWorkspaceService.js': 28,
  'src/services/appointmentDashboardService.js': 4,
  'src/services/attorneyIncomingMatterQueue.js': 2,
  'src/services/attorneyLeadsService.js': 3,
  'src/services/attorneyOperations.js': 5,
  'src/services/bondApplicationAssignmentService.js': 4,
  'src/services/bondCommandCenterService.js': 15,
  'src/services/bondConsultantPerformanceService.js': 5,
  'src/services/bondIntakeNotificationService.js': 12,
  'src/services/bondOperationalQueueService.js': 8,
  'src/services/bondRevenueManagementService.js': 7,
  'src/services/clientPortalWorkspaceService.js': 7,
  'src/services/financeIntelligenceService.js': 1,
  'src/services/mobileDashboardService.js': 9,
  'src/services/mobileWorkspaceService.js': 2,
  'src/services/principalDashboardService.js': 5,
  'src/services/principalPipelineOverviewService.js': 4,
  'src/services/residentialDashboardService.js': 3,
  'src/services/sellerPortalActivationService.js': 7,
  'src/services/sellerPortalOffersService.js': 3,
  'src/services/transactionPartnerInvitationService.js': 2,
})

const FILE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx'])

function toRepoPath(filePath) {
  return path.relative(PROJECT_ROOT, filePath).split(path.sep).join('/')
}

async function walkFiles(relativeDir, files = []) {
  const absoluteDir = path.join(PROJECT_ROOT, relativeDir)
  for (const entry of await readdir(absoluteDir)) {
    const absolutePath = path.join(absoluteDir, entry)
    const details = await stat(absolutePath)
    if (details.isDirectory()) {
      await walkFiles(toRepoPath(absolutePath), files)
    } else if (FILE_EXTENSIONS.has(path.extname(entry))) {
      files.push(toRepoPath(absolutePath))
    }
  }
  return files
}

function isProtectedFile(filePath) {
  if (SOURCE_OF_TRUTH_FILES.has(filePath)) return false
  if (filePath.includes('/__tests__/') || filePath.includes('/__fixtures__/')) return false
  if (filePath.startsWith('src/core/documents/')) return true
  if (filePath.startsWith('src/modules/bond/integrations/')) return true
  if (filePath.startsWith('src/pages/bond/')) return true
  if (filePath.startsWith('src/pages/')) {
    return /^(Dashboard|Agents|AttorneyMattersPage|AttorneyTransactionDetail|LegalDocumentWorkspacePage|ClientPortal|ClientProfile|TransactionPartnerInvitePage)\./.test(path.basename(filePath))
  }
  if (filePath.startsWith('src/services/')) {
    return /(Dashboard|Portal|Workspace|Queue|Command|Notification|Invitation|Export|Partner|Operational|Performance|Intelligence|attorney|bond|principal|residential)/i.test(path.basename(filePath))
  }
  return false
}

function scanLegacyReads(source, filePath) {
  const findings = []
  const lines = source.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    LEGACY_FIELD_PATTERN.lastIndex = 0
    let match = LEGACY_FIELD_PATTERN.exec(lines[index])
    while (match) {
      findings.push({
        filePath,
        lineNumber: index + 1,
        field: match[1],
        line: lines[index].trim().replace(/\s+/g, ' '),
      })
      match = LEGACY_FIELD_PATTERN.exec(lines[index])
    }
  }
  return findings
}

const protectedFiles = (await Promise.all(PROTECTED_ROOTS.map((root) => walkFiles(root))))
  .flat()
  .filter(isProtectedFile)
  .sort()

const findingsByFile = new Map()
for (const filePath of protectedFiles) {
  const source = await readFile(path.join(PROJECT_ROOT, filePath), 'utf8')
  const findings = scanLegacyReads(source, filePath)
  if (findings.length) findingsByFile.set(filePath, findings)
}

const violations = []
for (const [filePath, findings] of findingsByFile) {
  const allowedCount = LEGACY_READ_BASELINE[filePath] || 0
  if (findings.length > allowedCount) {
    violations.push({
      filePath,
      allowedCount,
      actualCount: findings.length,
      addedCount: findings.length - allowedCount,
      findings: findings.slice(allowedCount),
    })
  }
}

const currentTotal = [...findingsByFile.values()].reduce((total, findings) => total + findings.length, 0)
const baselineTotal = Object.values(LEGACY_READ_BASELINE).reduce((total, count) => total + count, 0)
if (currentTotal > baselineTotal && !violations.length) {
  violations.push({
    filePath: '<aggregate>',
    allowedCount: baselineTotal,
    actualCount: currentTotal,
    addedCount: currentTotal - baselineTotal,
    findings: [],
  })
}

if (violations.length) {
  const details = violations.flatMap((violation) => {
    const header = `${violation.filePath}: ${violation.actualCount} direct legacy reads, allowed ${violation.allowedCount}.`
    const samples = violation.findings.slice(0, 8).map((finding) =>
      `  ${finding.lineNumber}: ${finding.field} in ${finding.line}`,
    )
    return [header, ...samples]
  })
  assert.fail([
    'New direct legacy field reads were found in protected document, portal, dashboard, notification, or export surfaces.',
    'Use the canonical resolver/source-of-truth layer instead, or update LEGACY_READ_BASELINE only with an explicit compatibility reason.',
    ...details,
  ].join('\n'))
}

console.log(`Canonical field legacy guard passed (${currentTotal}/${baselineTotal} approved direct legacy reads across ${protectedFiles.length} protected files).`)
