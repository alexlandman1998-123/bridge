import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const RECEIPT_CONTRACT = 'roleplayer_document_context_release_receipt_v1'
const LAUNCH_LOCK_CONTRACT = 'roleplayer_document_context_launch_lock_v1'

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function sha256(value = '') {
  return createHash('sha256').update(value).digest('hex')
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
}

function writeText(file, value) {
  fs.writeFileSync(file, value)
  return sha256(value)
}

function extractJsonObject(output = '') {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not parse roleplayer document context launch-lock JSON output.')
  }
  return JSON.parse(output.slice(start, end + 1))
}

function resolveOutputDir() {
  const privateEvidenceRoot = path.resolve('private-evidence')
  const outputDir = path.resolve(arg('output-dir') || path.join('private-evidence', 'roleplayer-document-context-phase10'))
  if (outputDir !== privateEvidenceRoot && !outputDir.startsWith(`${privateEvidenceRoot}${path.sep}`)) {
    throw new Error('Release receipt output must stay under ignored private-evidence/.')
  }
  return outputDir
}

async function runLaunchLock() {
  const args = ['scripts/roleplayer-document-context-phase9-launch-lock.mjs']
  const handoffDir = arg('handoff-dir')
  const maxAgeMinutes = arg('max-age-minutes')
  if (handoffDir) args.push(`--handoff-dir=${handoffDir}`)
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

function buildReceipt({ issuedAt, launchLockReport }) {
  const launchLock = launchLockReport.launchLock || {}
  const payload = {
    contract: RECEIPT_CONTRACT,
    status: 'issued',
    issuedAt,
    sourceLaunchLockContract: launchLockReport.contract || null,
    sourceLaunchLockDigest: launchLock.lockDigest || null,
    sourceHandoffDigest: launchLock.sourceHandoffDigest || null,
    sourceAuthorityDigest: launchLock.sourceAuthorityDigest || null,
    sourceEvidenceSha256: launchLock.sourceEvidenceSha256 || null,
    sourceManifestSha256: launchLock.sourceManifestSha256 || null,
    releaseScope: launchLock.releaseScope || null,
    demoReadiness: launchLock.demoReadiness || null,
    operatorCommands: {
      refreshEvidence: launchLock.operatorCommands?.refreshEvidence || 'npm run export:roleplayer-document-context:evidence',
      refreshHandoff: 'npm run handoff:roleplayer-document-context',
      verifyLaunchLock: 'npm run verify:roleplayer-document-context:launch-lock',
      rerunOperationalGate: launchLock.operatorCommands?.rerunOperationalGate || 'npm run verify:roleplayer-document-context:operational',
      fastPreflight: launchLock.operatorCommands?.fastPreflight || 'npm run verify:roleplayer-document-context:operational -- --skip-build',
    },
    rollbackPosture: launchLock.rollbackPosture || {
      mutatedApplicationData: false,
      databaseRollbackRequired: false,
      templateRollbackRequired: false,
    },
    receiptUse: {
      purpose: 'demo_release_clearance',
      validFor: ['seller_annexure_a', 'seller_mandate'],
      invalidIf: ['Phase 9 launch lock fails', 'Phase 6 evidence is refreshed without a new receipt', 'document rendering files change after receipt'],
    },
    mutatedData: false,
  }

  return {
    ...payload,
    receiptDigest: sha256(JSON.stringify(payload)),
  }
}

function buildMarkdown(receipt = {}, launchLockReport = {}) {
  return [
    '# Roleplayer Document Context Phase 10 Release Receipt',
    '',
    `- Issued: ${receipt.issuedAt}`,
    `- Contract: ${receipt.contract}`,
    `- Status: ${receipt.status}`,
    `- Launch lock status: ${launchLockReport.status || 'UNKNOWN'}`,
    `- Launch lock digest: ${receipt.sourceLaunchLockDigest || 'missing'}`,
    `- Receipt digest: ${receipt.receiptDigest || 'missing'}`,
    `- Mutated application data: ${receipt.mutatedData ? 'yes' : 'no'}`,
    '',
    '## Receipt Scope',
    '',
    '- Seller Annexure A',
    '- Seller mandate',
    '- Branded header/contact context',
    '- Seller source-of-truth, portal, and mandate packet parity',
    '',
    '## Recheck Commands',
    '',
    `- Launch lock: \`${receipt.operatorCommands.verifyLaunchLock}\``,
    `- Operational gate: \`${receipt.operatorCommands.rerunOperationalGate}\``,
    `- Fast preflight: \`${receipt.operatorCommands.fastPreflight}\``,
    '',
  ].join('\n')
}

async function main() {
  const outputDir = resolveOutputDir()
  const issuedAt = new Date().toISOString()
  const launchLockRun = await runLaunchLock()
  const launchLockReport = extractJsonObject(launchLockRun.stdout)

  if (launchLockRun.exitCode !== 0 || launchLockReport.locked !== true || launchLockReport.contract !== LAUNCH_LOCK_CONTRACT) {
    console.log(safeJson({
      phase: '10',
      contract: RECEIPT_CONTRACT,
      status: 'RECEIPT_BLOCKED',
      blockerCount: launchLockReport.blockerCount || 1,
      blockers: launchLockReport.blockers || [{ code: 'phase9_launch_lock_not_locked', detail: 'Launch lock did not authorize receipt issuance.' }],
      launchLockReport,
      issuedAt,
      mutatedData: false,
    }))
    process.exitCode = 1
    return
  }

  const receipt = buildReceipt({ issuedAt, launchLockReport })
  fs.mkdirSync(outputDir, { recursive: true })

  const jsonPath = path.join(outputDir, 'roleplayer-document-context-phase10-release-receipt.json')
  const markdownPath = path.join(outputDir, 'roleplayer-document-context-phase10-summary.md')
  const manifestPath = path.join(outputDir, 'roleplayer-document-context-phase10-manifest.json')
  const jsonDigest = writeText(jsonPath, `${safeJson({ receipt, launchLockReport })}\n`)
  const markdownDigest = writeText(markdownPath, buildMarkdown(receipt, launchLockReport))
  const manifest = {
    version: 1,
    receiptContract: RECEIPT_CONTRACT,
    generatedAt: issuedAt,
    sourceLaunchLockDigest: receipt.sourceLaunchLockDigest,
    receiptDigest: receipt.receiptDigest,
    mutatedData: false,
    files: [
      { name: path.basename(jsonPath), sha256: jsonDigest },
      { name: path.basename(markdownPath), sha256: markdownDigest },
    ],
  }
  const manifestDigest = writeText(manifestPath, `${safeJson(manifest)}\n`)

  console.log(safeJson({
    phase: '10',
    contract: RECEIPT_CONTRACT,
    status: 'DEMO_RELEASE_RECEIPTED',
    receiptDigest: receipt.receiptDigest,
    sourceLaunchLockDigest: receipt.sourceLaunchLockDigest,
    artifacts: {
      jsonPath,
      markdownPath,
      manifestPath,
      manifestSha256: manifestDigest,
    },
    mutatedData: false,
  }))
}

main().catch((error) => {
  console.error(`Roleplayer document context release receipt failed: ${error?.message || error}`)
  process.exitCode = 1
})
