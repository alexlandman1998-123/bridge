import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import {
  extractProperty24AgentId,
  findMatchingProperty24Agent,
  normalizeProperty24AgentPhotoBuffer,
  prepareProperty24AgentPhotoFile,
  unwrapProperty24AgentCollection,
} from '../server/property24/agentPhotoService.js'

const execFileAsync = promisify(execFile)
const appRoot = fileURLToPath(new URL('..', import.meta.url))
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'property24-agent-photo-test-'))
const photoPath = path.join(tempDir, 'agent-photo.png')

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

async function readJsonBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')
}

async function runCreateAgent({ agents = [], createdAgentId = 88001, photoStatus = 200 } = {}) {
  const calls = []
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    calls.push({ method: request.method, path: url.pathname })

    if (request.method === 'GET' && url.pathname === '/listing/v53/agencies/31382/agents') {
      sendJson(response, 200, agents)
      return
    }
    if (request.method === 'POST' && url.pathname === '/listing/v53/agents') {
      calls.at(-1).body = await readJsonBody(request)
      sendJson(response, 201, createdAgentId)
      return
    }
    if (request.method === 'PUT' && url.pathname === `/listing/v53/agents/${createdAgentId}/profile-picture`) {
      calls.at(-1).body = await readJsonBody(request)
      sendJson(response, photoStatus, photoStatus < 400 ? { ok: true } : { errorMessage: 'photo rejected' })
      return
    }
    sendJson(response, 404, { errorMessage: 'unexpected test route' })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const args = [
    path.join(appRoot, 'scripts/property24-create-agent.mjs'),
    '--firstname=Jon',
    '--lastname=Snow',
    '--email=jon.snow.p24@arch9.co.za',
    '--mobile=0600000001',
    '--source-reference=ARCH9-VET-JON-SNOW',
    '--agency-id=31382',
    '--country-id=1',
    `--photo=${photoPath}`,
    '--apply',
  ]

  try {
    const result = await execFileAsync(process.execPath, args, {
      cwd: appRoot,
      env: {
        ...process.env,
        PROPERTY24_BASE_URL: `http://127.0.0.1:${address.port}`,
        PROPERTY24_BASIC_AUTH_USERNAME: 'contract-test',
        PROPERTY24_BASIC_AUTH_PASSWORD: 'contract-test',
        PROPERTY24_DEFAULT_AGENCY_ID: '31382',
        PROPERTY24_DEFAULT_COUNTRY_ID: '1',
      },
      maxBuffer: 2 * 1024 * 1024,
    })
    return { ...result, exitCode: 0, calls }
  } catch (error) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.code,
      calls,
    }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

try {
  const sourcePhoto = await sharp({
    create: {
      width: 1200,
      height: 900,
      channels: 4,
      background: { r: 40, g: 80, b: 120, alpha: 0.75 },
    },
  }).png().toBuffer()
  await fs.writeFile(photoPath, sourcePhoto)

  const prepared = await prepareProperty24AgentPhotoFile(photoPath)
  assert.deepEqual(Object.keys(prepared.payload), ['bytes'])
  assert.equal(prepared.summary.sourceFormat, 'png')
  assert.equal(prepared.summary.outputMimeType, 'image/jpeg')
  assert.equal(prepared.summary.outputWidth, 800)
  assert.equal(prepared.summary.outputHeight, 800)
  assert.ok(prepared.summary.outputBytes > 0)
  assert.ok(prepared.summary.outputBytes < 2 * 1024 * 1024)
  assert.match(prepared.summary.sha256, /^[a-f0-9]{64}$/)

  const normalizedMetadata = await sharp(Buffer.from(prepared.payload.bytes, 'base64')).metadata()
  assert.equal(normalizedMetadata.format, 'jpeg')
  assert.equal(normalizedMetadata.width, 800)
  assert.equal(normalizedMetadata.height, 800)

  const uploadDryRun = await execFileAsync(process.execPath, [
    path.join(appRoot, 'scripts/property24-upload-agent-photo.mjs'),
    '--agent-id=77959',
    `--photo=${photoPath}`,
  ], { cwd: appRoot })
  const uploadDryRunOutput = JSON.parse(uploadDryRun.stdout)
  assert.equal(uploadDryRunOutput.status, 'DRY_RUN')
  assert.equal(uploadDryRunOutput.agentId, 77959)
  assert.equal(uploadDryRunOutput.photo.outputMimeType, 'image/jpeg')

  const smallPhoto = await sharp({
    create: { width: 299, height: 400, channels: 3, background: '#ffffff' },
  }).jpeg().toBuffer()
  await assert.rejects(
    normalizeProperty24AgentPhotoBuffer(smallPhoto),
    /must be at least 300x300 pixels/,
  )
  await assert.rejects(
    normalizeProperty24AgentPhotoBuffer(Buffer.from('not an image')),
    /could not be decoded/,
  )
  await assert.rejects(
    normalizeProperty24AgentPhotoBuffer(sourcePhoto, { maxInputBytes: 1 }),
    /local input limit/,
  )

  assert.equal(extractProperty24AgentId(77959), 77959)
  assert.equal(extractProperty24AgentId('77959'), 77959)
  assert.equal(extractProperty24AgentId({ agentId: '77959' }), 77959)
  assert.equal(extractProperty24AgentId({ data: { Id: 77959 } }), 77959)
  assert.equal(extractProperty24AgentId({ ok: true }), null)

  const existingAgent = {
    id: 77959,
    emailAddress: 'Jon.Snow.P24@arch9.co.za',
    sourceReference: 'ARCH9-VET-JON-SNOW',
  }
  assert.deepEqual(unwrapProperty24AgentCollection({ agents: [existingAgent] }), [existingAgent])
  assert.equal(findMatchingProperty24Agent([existingAgent], {
    emailAddress: 'jon.snow.p24@arch9.co.za',
    sourceReference: 'different',
  }), existingAgent)

  const success = await runCreateAgent()
  assert.equal(success.exitCode, 0, success.stderr)
  const successOutput = JSON.parse(success.stdout)
  assert.equal(successOutput.status, 'CREATED_WITH_PHOTO')
  assert.equal(successOutput.agentId, 88001)
  assert.deepEqual(success.calls.map(({ method }) => method), ['GET', 'POST', 'PUT'])
  assert.equal(success.calls[1].body.sourceReference, 'ARCH9-VET-JON-SNOW')
  assert.deepEqual(Object.keys(success.calls[2].body), ['bytes'])
  const uploadedMetadata = await sharp(Buffer.from(success.calls[2].body.bytes, 'base64')).metadata()
  assert.equal(uploadedMetadata.format, 'jpeg')
  assert.equal(uploadedMetadata.width, 800)
  assert.equal(uploadedMetadata.height, 800)
  assert.doesNotMatch(success.stdout, new RegExp(prepared.payload.bytes.slice(0, 60)))

  const duplicate = await runCreateAgent({ agents: [existingAgent] })
  assert.equal(duplicate.exitCode, 2)
  const duplicateOutput = JSON.parse(duplicate.stdout)
  assert.equal(duplicateOutput.status, 'ALREADY_EXISTS')
  assert.equal(duplicateOutput.agentId, 77959)
  assert.deepEqual(duplicate.calls.map(({ method }) => method), ['GET'])

  const partialFailure = await runCreateAgent({ createdAgentId: 88002, photoStatus: 415 })
  assert.equal(partialFailure.exitCode, 1)
  const partialFailureOutput = JSON.parse(partialFailure.stderr)
  assert.equal(partialFailureOutput.status, 'CREATED_PHOTO_FAILED')
  assert.equal(partialFailureOutput.agentId, 88002)
  assert.match(partialFailureOutput.message, /Do not create the agent again/)
  assert.deepEqual(partialFailureOutput.retry.arguments, [
    '--agent-id=88002',
    `--photo=${photoPath}`,
    '--apply',
  ])

  console.log('Property24 agent photo contract passed')
} finally {
  await fs.rm(tempDir, { recursive: true, force: true })
}
