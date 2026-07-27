import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const HANDOFF_CONTRACT = 'roleplayer_document_context_launch_handoff_v1'

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
    throw new Error('Could not parse roleplayer document context release-authority JSON output.')
  }
  return JSON.parse(output.slice(start, end + 1))
}

function canonicalDigest(value) {
  return sha256(JSON.stringify(value))
}

function resolveOutputDir() {
  const privateEvidenceRoot = path.resolve('private-evidence')
  const outputDir = path.resolve(arg('output-dir') || path.join('private-evidence', 'roleplayer-document-context-phase8'))
  if (outputDir !== privateEvidenceRoot && !outputDir.startsWith(`${privateEvidenceRoot}${path.sep}`)) {
    throw new Error('Launch handoff output must stay under ignored private-evidence/.')
  }
  return outputDir
}

async function runReleaseAuthority() {
  const args = ['scripts/roleplayer-document-context-phase7-release-authority.mjs']
  const evidenceDir = arg('evidence-dir')
  const maxAgeMinutes = arg('max-age-minutes')
  if (evidenceDir) args.push(`--evidence-dir=${evidenceDir}`)
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

function buildHandoff({ checkedAt, releaseAuthority }) {
  const authority = releaseAuthority.authority || null
  const payload = {
    contract: HANDOFF_CONTRACT,
    status: 'handed_off',
    handedOffAt: checkedAt,
    sourceAuthorityDigest: authority?.authorityDigest || null,
    sourceEvidenceSha256: authority?.sourceEvidenceSha256 || null,
    sourceManifestSha256: authority?.sourceManifestSha256 || null,
    releaseScope: authority?.releaseScope || {
      documents: ['seller_annexure_a', 'seller_mandate'],
      surfaces: ['seller_source_of_truth', 'seller_portal', 'mandate_packet'],
    },
    demoReadiness: {
      saleDeclarationAnnexureA: true,
      sellerMandate: true,
      brandedHeaderAndContactBlock: true,
      sourcePortalMandateParity: true,
      productionBuildVerified: true,
    },
    operatorCommands: {
      refreshEvidence: 'npm run export:roleplayer-document-context:evidence',
      verifyAuthority: 'npm run verify:roleplayer-document-context:release-authority',
      rerunOperationalGate: 'npm run verify:roleplayer-document-context:operational',
      fastPreflight: 'npm run verify:roleplayer-document-context:operational -- --skip-build',
    },
    rollbackPosture: {
      mutatedApplicationData: false,
      databaseRollbackRequired: false,
      templateRollbackRequired: false,
      revertStrategy: 'revert the roleplayer document context adapter changes only if a later guard fails',
    },
    requiredNextPhases: [],
    mutatedData: false,
  }

  return {
    ...payload,
    handoffDigest: canonicalDigest(payload),
  }
}

function buildMarkdown(handoff = {}, releaseAuthority = {}) {
  return [
    '# Roleplayer Document Context Phase 8 Handoff',
    '',
    `- Generated: ${handoff.handedOffAt}`,
    `- Contract: ${handoff.contract}`,
    `- Status: ${handoff.status}`,
    `- Authority status: ${releaseAuthority.status || 'UNKNOWN'}`,
    `- Authority digest: ${handoff.sourceAuthorityDigest || 'missing'}`,
    `- Mutated application data: ${handoff.mutatedData ? 'yes' : 'no'}`,
    '',
    '## Demo Scope',
    '',
    '- Seller Annexure A',
    '- Seller mandate',
    '- Seller source-of-truth',
    '- Seller portal',
    '- Mandate packet',
    '',
    '## Commands',
    '',
    `- Refresh evidence: \`${handoff.operatorCommands.refreshEvidence}\``,
    `- Verify authority: \`${handoff.operatorCommands.verifyAuthority}\``,
    `- Full operational gate: \`${handoff.operatorCommands.rerunOperationalGate}\``,
    `- Fast preflight: \`${handoff.operatorCommands.fastPreflight}\``,
    '',
  ].join('\n')
}

async function main() {
  const outputDir = resolveOutputDir()
  const checkedAt = new Date().toISOString()
  const authorityRun = await runReleaseAuthority()
  const releaseAuthority = extractJsonObject(authorityRun.stdout)

  if (authorityRun.exitCode !== 0 || releaseAuthority.authorized !== true) {
    console.log(safeJson({
      phase: '8',
      contract: HANDOFF_CONTRACT,
      status: 'HANDOFF_BLOCKED',
      blockerCount: releaseAuthority.blockerCount || 1,
      blockers: releaseAuthority.blockers || [{ code: 'phase7_release_authority_not_authorized', detail: 'Release authority did not authorize handoff.' }],
      releaseAuthority,
      checkedAt,
      mutatedData: false,
    }))
    process.exitCode = 1
    return
  }

  const handoff = buildHandoff({ checkedAt, releaseAuthority })
  fs.mkdirSync(outputDir, { recursive: true })

  const jsonPath = path.join(outputDir, 'roleplayer-document-context-phase8-handoff.json')
  const markdownPath = path.join(outputDir, 'roleplayer-document-context-phase8-summary.md')
  const manifestPath = path.join(outputDir, 'roleplayer-document-context-phase8-manifest.json')
  const jsonDigest = writeText(jsonPath, `${safeJson({ handoff, releaseAuthority })}\n`)
  const markdownDigest = writeText(markdownPath, buildMarkdown(handoff, releaseAuthority))
  const manifest = {
    version: 1,
    handoffContract: HANDOFF_CONTRACT,
    generatedAt: checkedAt,
    sourceAuthorityDigest: handoff.sourceAuthorityDigest,
    handoffDigest: handoff.handoffDigest,
    mutatedData: false,
    files: [
      { name: path.basename(jsonPath), sha256: jsonDigest },
      { name: path.basename(markdownPath), sha256: markdownDigest },
    ],
  }
  const manifestDigest = writeText(manifestPath, `${safeJson(manifest)}\n`)

  console.log(safeJson({
    phase: '8',
    contract: HANDOFF_CONTRACT,
    status: 'READY_FOR_DEMO_HANDOFF',
    handoffDigest: handoff.handoffDigest,
    sourceAuthorityDigest: handoff.sourceAuthorityDigest,
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
  console.error(`Roleplayer document context launch handoff failed: ${error?.message || error}`)
  process.exitCode = 1
})
