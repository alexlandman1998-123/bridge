import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const EVIDENCE_VERSION = 'roleplayer_document_context_phase6_evidence_v1'

function arg(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function hasArg(name) {
  return process.argv.includes(name)
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
    throw new Error('Could not parse roleplayer document context operational-readiness JSON output.')
  }
  return JSON.parse(output.slice(start, end + 1))
}

async function runOperationalReadiness({ skipBuild = false } = {}) {
  const args = ['scripts/roleplayer-document-context-operational-readiness.mjs']
  if (skipBuild) args.push('--skip-build')

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

function resolveOutputDir() {
  const privateEvidenceRoot = path.resolve('private-evidence')
  const outputDir = path.resolve(arg('output-dir') || path.join('private-evidence', 'roleplayer-document-context-phase6'))
  if (outputDir !== privateEvidenceRoot && !outputDir.startsWith(`${privateEvidenceRoot}${path.sep}`)) {
    throw new Error('Evidence output must stay under ignored private-evidence/.')
  }
  return outputDir
}

function buildMarkdown(report = {}) {
  const readiness = report.operationalReadiness || {}
  const releaseGate = readiness.gates?.releaseGate || {}
  return [
    '# Roleplayer Document Context Phase 6 Evidence',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Evidence contract: ${report.version}`,
    `- Readiness status: ${readiness.status || 'UNKNOWN'}`,
    `- Operational: ${readiness.ok ? 'yes' : 'no'}`,
    `- Mutated application data: ${report.mutatedData ? 'yes' : 'no'}`,
    `- Release gate status: ${releaseGate.status || 'UNKNOWN'}`,
    `- Release gate passed steps: ${releaseGate.summary?.passedStepCount ?? 0}`,
    `- Release gate failed steps: ${releaseGate.summary?.failedStepCount ?? 0}`,
    `- Build skipped: ${releaseGate.skippedBuild ? 'yes' : 'no'}`,
    '',
    '## Included Evidence',
    '',
    '- Phase 0 Annexure A demo freeze',
    '- Phase 1 shared Annexure A context adapter',
    '- Phase 2 shared mandate packet context adapter',
    '- Phase 3 roleplayer context parity',
    '- Phase 4 release gate summary',
    '- Phase 5 operational readiness summary',
    '',
  ].join('\n')
}

async function main() {
  const outputDir = resolveOutputDir()
  const skipBuild = hasArg('--skip-build')
  const generatedAt = new Date().toISOString()
  const run = await runOperationalReadiness({ skipBuild })
  const operationalReadiness = extractJsonObject(run.stdout)
  const report = {
    version: EVIDENCE_VERSION,
    phase: '6',
    generatedAt,
    mode: skipBuild ? 'preflight_evidence' : 'release_evidence',
    status: run.exitCode === 0 && operationalReadiness.ok ? 'exported' : 'blocked',
    readyForRelease: run.exitCode === 0 && operationalReadiness.status === 'OPERATIONAL',
    readyForBuildVerification: run.exitCode === 0 && operationalReadiness.status === 'READY_FOR_BUILD_VERIFICATION',
    mutatedData: false,
    operationalReadiness,
    privacy: {
      sellerNames: 'omitted',
      sellerIdNumbers: 'omitted',
      signatures: 'omitted',
      documentHtml: 'omitted',
      generatedPdfFiles: 'omitted',
    },
  }

  fs.mkdirSync(outputDir, { recursive: true })
  const jsonPath = path.join(outputDir, 'roleplayer-document-context-phase6-evidence.json')
  const markdownPath = path.join(outputDir, 'roleplayer-document-context-phase6-summary.md')
  const manifestPath = path.join(outputDir, 'roleplayer-document-context-phase6-manifest.json')
  const jsonContent = `${safeJson(report)}\n`
  const markdown = buildMarkdown(report)
  const jsonDigest = writeText(jsonPath, jsonContent)
  const markdownDigest = writeText(markdownPath, markdown)
  const manifest = {
    version: 1,
    evidenceVersion: EVIDENCE_VERSION,
    generatedAt,
    outputDir,
    mutatedData: false,
    files: [
      { name: path.basename(jsonPath), sha256: jsonDigest },
      { name: path.basename(markdownPath), sha256: markdownDigest },
    ],
  }
  const manifestDigest = writeText(manifestPath, `${safeJson(manifest)}\n`)

  const result = {
    phase: '6',
    status: report.status,
    readyForRelease: report.readyForRelease,
    readyForBuildVerification: report.readyForBuildVerification,
    artifacts: {
      jsonPath,
      markdownPath,
      manifestPath,
      manifestSha256: manifestDigest,
    },
    mutatedData: false,
  }

  console.log(safeJson(result))
  if (report.status !== 'exported') process.exitCode = 1
}

main().catch((error) => {
  console.error(`Roleplayer document context evidence export failed: ${error?.message || error}`)
  process.exitCode = 1
})
