import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const SOURCE_DRIFT_GUARD_CONTRACT = 'roleplayer_document_context_source_drift_guard_v1'
const RECEIPT_VERIFIER_CONTRACT = 'roleplayer_document_context_release_receipt_verifier_v1'

const SOURCE_MARKERS = [
  {
    path: 'src/lib/roleplayerDocumentContext.js',
    purpose: 'shared roleplayer document context adapter',
    markers: [
      'export function resolveDocumentBrandingContext',
      'export function resolveSellerDisclosureDocumentContext',
      'export function buildRoleplayerDocumentContextParitySnapshot',
      'export function compareRoleplayerDocumentContextParity',
      'ROLEPLAYER_DOCUMENT_CONTEXT_PARITY_VERSION',
      'logoHighContrastUrl',
    ],
  },
  {
    path: 'src/lib/propertyDisclosure.js',
    purpose: 'seller Annexure A branded renderer',
    markers: [
      "import { resolveDocumentBrandingContext } from './roleplayerDocumentContext.js'",
      'doc-header',
      'document-contact-row',
      'doc-footer',
      'property-disclosure-page--page-break',
      'break-after: page',
      'page-break-after: always',
    ],
  },
  {
    path: 'src/services/sellerDocumentRequirementsService.js',
    purpose: 'seller source-of-truth Annexure A generation',
    markers: [
      "import { resolveSellerDisclosureDocumentContext } from '../lib/roleplayerDocumentContext.js'",
      'resolveSellerDisclosureDocumentContext',
      'buildSellerPropertyDisclosureDocumentFromFormData',
    ],
  },
  {
    path: 'src/services/clientPortalWorkspaceService.js',
    purpose: 'seller portal Annexure A generation',
    markers: [
      "import { resolveSellerDisclosureDocumentContext } from '../lib/roleplayerDocumentContext.js'",
      'resolveSellerDisclosureDocumentContext',
      'buildPropertyDisclosureDocumentFromFormData',
    ],
  },
  {
    path: 'src/core/documents/mandateDataMapper.js',
    purpose: 'seller mandate placeholder and branding mapping',
    markers: [
      "import { resolveDocumentBrandingContext } from '../../lib/roleplayerDocumentContext.js'",
      'resolveDocumentBrandingContext',
      'agency_website',
      'organisation_website',
      'organisation.physical_address',
      'branding: agencyProfile.branding',
    ],
  },
  {
    path: 'src/core/documents/packetService.js',
    purpose: 'mandate packet system placeholder branding',
    markers: [
      "import { resolveDocumentBrandingContext } from '../../lib/roleplayerDocumentContext'",
      'resolveDocumentBrandingContext',
      'documentBranding',
      'withSystemPlaceholders',
    ],
  },
  {
    path: 'src/core/documents/packetWorkflow.js',
    purpose: 'mandate packet preview branding',
    markers: [
      "import { resolveDocumentBrandingContext } from '../../lib/roleplayerDocumentContext'",
      'resolveDocumentBrandingContext',
      'document-contact-row',
      'documentBranding',
      'renderPacketPreviewHtml',
    ],
  },
  {
    path: 'scripts/verify-roleplayer-document-context.mjs',
    purpose: 'release gate entrypoint',
    markers: [
      'roleplayer_document_context_release_gate_v1',
      'test:seller-annexure-a-demo-freeze',
      'test:roleplayer-document-context-phase3',
      "args: ['run', 'build']",
      'mutatedData: false',
    ],
  },
]

const PACKAGE_SCRIPTS = [
  'test:seller-annexure-a-demo-freeze',
  'test:roleplayer-document-context-phase1',
  'test:roleplayer-document-context-phase2',
  'test:roleplayer-document-context-phase3',
  'test:roleplayer-document-context-phase4',
  'test:roleplayer-document-context-phase5',
  'test:roleplayer-document-context-phase6',
  'test:roleplayer-document-context-phase7',
  'test:roleplayer-document-context-phase8',
  'test:roleplayer-document-context-phase9',
  'test:roleplayer-document-context-phase10',
  'test:roleplayer-document-context-phase11',
  'test:roleplayer-document-context-phase12',
  'verify:roleplayer-document-context',
  'verify:roleplayer-document-context:operational',
  'export:roleplayer-document-context:evidence',
  'verify:roleplayer-document-context:release-authority',
  'handoff:roleplayer-document-context',
  'verify:roleplayer-document-context:launch-lock',
  'receipt:roleplayer-document-context',
  'verify:roleplayer-document-context:receipt',
  'verify:roleplayer-document-context:source-drift',
]

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function sha256(value = '') {
  return createHash('sha256').update(value).digest('hex')
}

function extractJsonObject(output = '') {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not parse roleplayer document context receipt-verifier JSON output.')
  }
  return JSON.parse(output.slice(start, end + 1))
}

async function runReceiptVerifier() {
  const args = ['scripts/roleplayer-document-context-phase11-receipt-verifier.mjs']
  const receiptDir = arg('receipt-dir')
  const maxAgeMinutes = arg('max-age-minutes')
  if (receiptDir) args.push(`--receipt-dir=${receiptDir}`)
  if (maxAgeMinutes) args.push(`--max-age-minutes=${maxAgeMinutes}`)

  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      process.stderr.write(text)
    })
    child.on('error', (error) => {
      stderr += `${error?.message || error}\n`
    })
    child.on('close', (exitCode) => {
      resolve({
        exitCode: Number(exitCode || 0),
        stdout,
        stderr,
      })
    })
  })
}

function validateSourceMarkers() {
  const blockers = []
  const files = SOURCE_MARKERS.map((definition) => {
    const absolutePath = path.resolve(definition.path)
    if (!fs.existsSync(absolutePath)) {
      blockers.push({ code: 'phase12_source_file_missing', detail: `Missing critical source file: ${definition.path}` })
      return {
        path: definition.path,
        purpose: definition.purpose,
        exists: false,
        sha256: null,
        missingMarkers: definition.markers,
      }
    }

    const source = fs.readFileSync(absolutePath, 'utf8')
    const missingMarkers = definition.markers.filter((marker) => !source.includes(marker))
    for (const marker of missingMarkers) {
      blockers.push({ code: 'phase12_source_marker_missing', detail: `${definition.path} is missing required marker: ${marker}` })
    }

    return {
      path: definition.path,
      purpose: definition.purpose,
      exists: true,
      sha256: sha256(source),
      markerCount: definition.markers.length,
      missingMarkers,
    }
  })

  return { blockers, files }
}

function validatePackageScripts() {
  const blockers = []
  const packageJsonPath = path.resolve('package.json')
  if (!fs.existsSync(packageJsonPath)) {
    return {
      blockers: [{ code: 'phase12_package_json_missing', detail: 'Missing package.json.' }],
      scripts: [],
      packageJsonSha256: null,
    }
  }

  const packageJsonText = fs.readFileSync(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(packageJsonText)
  const scripts = PACKAGE_SCRIPTS.map((scriptName) => {
    const command = packageJson.scripts?.[scriptName] || ''
    if (!command) {
      blockers.push({ code: 'phase12_package_script_missing', detail: `Missing package script: ${scriptName}` })
    }
    return { name: scriptName, command }
  })

  return {
    blockers,
    scripts,
    packageJsonSha256: sha256(packageJsonText),
  }
}

function sourceDigest(sourceValidation, packageValidation) {
  return sha256(JSON.stringify({
    files: sourceValidation.files.map((file) => ({
      path: file.path,
      sha256: file.sha256,
      markerCount: file.markerCount,
    })),
    packageJsonSha256: packageValidation.packageJsonSha256,
    scripts: packageValidation.scripts,
  }))
}

async function main() {
  const checkedAt = new Date().toISOString()
  const receiptRun = await runReceiptVerifier()
  const receiptVerifier = extractJsonObject(receiptRun.stdout)
  const sourceValidation = validateSourceMarkers()
  const packageValidation = validatePackageScripts()
  const blockers = [...sourceValidation.blockers, ...packageValidation.blockers]

  if (
    receiptRun.exitCode !== 0 ||
    receiptVerifier.contract !== RECEIPT_VERIFIER_CONTRACT ||
    receiptVerifier.verified !== true ||
    receiptVerifier.status !== 'RELEASE_RECEIPT_VERIFIED'
  ) {
    blockers.push({
      code: 'phase11_receipt_verifier_not_verified',
      detail: `Receipt verifier status is ${receiptVerifier.status || 'missing'}, verified=${Boolean(receiptVerifier.verified)}.`,
    })
  }

  const guarded = blockers.length === 0
  const guard = guarded
    ? {
      contract: SOURCE_DRIFT_GUARD_CONTRACT,
      status: 'guarded',
      guardedAt: checkedAt,
      sourceDigest: sourceDigest(sourceValidation, packageValidation),
      sourceFileCount: sourceValidation.files.length,
      packageScriptCount: packageValidation.scripts.length,
      sourceReceiptDigest: receiptVerifier.verifier?.sourceReceiptDigest || null,
      sourceLaunchLockDigest: receiptVerifier.verifier?.sourceLaunchLockDigest || null,
      mutatedData: false,
    }
    : null
  if (guard) guard.guardDigest = sha256(JSON.stringify(guard))

  console.log(JSON.stringify({
    phase: '12',
    contract: SOURCE_DRIFT_GUARD_CONTRACT,
    status: guarded ? 'SOURCE_DRIFT_GUARDED' : 'SOURCE_DRIFT_HOLD',
    guarded,
    blockerCount: blockers.length,
    blockers,
    guard,
    receiptVerifier: {
      status: receiptVerifier.status || null,
      verified: Boolean(receiptVerifier.verified),
      sourceReceiptDigest: receiptVerifier.verifier?.sourceReceiptDigest || null,
      sourceLaunchLockDigest: receiptVerifier.verifier?.sourceLaunchLockDigest || null,
    },
    source: {
      files: sourceValidation.files,
      packageJsonSha256: packageValidation.packageJsonSha256,
      packageScripts: packageValidation.scripts,
    },
    checkedAt,
    mutatedData: false,
  }, null, 2))

  if (!guarded) process.exitCode = 1
}

main().catch((error) => {
  console.error(`Roleplayer document context source drift guard failed: ${error?.message || error}`)
  process.exitCode = 1
})
