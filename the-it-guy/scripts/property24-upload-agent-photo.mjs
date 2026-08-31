import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  extractProperty24AgentId,
  prepareProperty24AgentPhotoFile,
} from '../server/property24/agentPhotoService.js'
import {
  PROPERTY24_EXDEV_BASE_URL,
  createProperty24Client,
  normalizeProperty24Text,
  summarizeProperty24Payload,
} from '../server/services/property24Client.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = { apply: false, agentId: '', photo: '' }
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true
    else if (arg.startsWith('--agent-id=')) options.agentId = normalizeProperty24Text(arg.slice('--agent-id='.length))
    else if (arg.startsWith('--photo=')) options.photo = normalizeProperty24Text(arg.slice('--photo='.length))
    else throw new Error(`Unknown option: ${arg}`)
  }
  return options
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8').split(/\n/).map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function loadConfig() {
  const files = ['.env', '.env.local', '.env.staging.local', '.env.property24.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const processOverrides = Object.fromEntries(Object.entries(process.env).filter(([, value]) => normalizeProperty24Text(value)))
  const env = { ...fromFiles, ...processOverrides }
  return {
    baseUrl: normalizeProperty24Text(env.PROPERTY24_BASE_URL) || PROPERTY24_EXDEV_BASE_URL,
    username: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_USERNAME || env.PROPERTY24_USERNAME),
    password: normalizeProperty24Text(env.PROPERTY24_BASIC_AUTH_PASSWORD || env.PROPERTY24_PASSWORD),
    userGroupId: normalizeProperty24Text(env.PROPERTY24_USER_GROUP_ID),
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const agentId = extractProperty24AgentId(options.agentId)
  const missingArguments = []
  if (!agentId) missingArguments.push('--agent-id')
  if (!options.photo) missingArguments.push('--photo')
  if (missingArguments.length) {
    console.log(JSON.stringify({ status: 'BLOCKED', missingArguments }, null, 2))
    process.exitCode = 1
    return
  }

  // Decode and normalize before constructing the client or making any network request.
  const photo = await prepareProperty24AgentPhotoFile(options.photo)
  const config = loadConfig()
  if (!options.apply) {
    console.log(JSON.stringify({
      status: 'DRY_RUN',
      message: 'The photo passed local validation. No Property24 write was made.',
      agentId,
      endpoint: `/listing/v53/agents/${agentId}/profile-picture`,
      photo: photo.summary,
    }, null, 2))
    return
  }

  const missingConfiguration = []
  if (!config.username) missingConfiguration.push('PROPERTY24_BASIC_AUTH_USERNAME')
  if (!config.password) missingConfiguration.push('PROPERTY24_BASIC_AUTH_PASSWORD')
  if (missingConfiguration.length) {
    console.log(JSON.stringify({ status: 'BLOCKED', missingConfiguration }, null, 2))
    process.exitCode = 1
    return
  }

  const client = createProperty24Client(config)
  const result = await client.updateAgentProfilePicture(agentId, photo.payload)
  console.log(JSON.stringify({
    status: 'PHOTO_UPDATED',
    agentId,
    httpStatus: result.status,
    response: summarizeProperty24Payload(result.data),
    photo: photo.summary,
  }, null, 2))
}

run().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    name: error.name,
    message: error.message,
    httpStatus: error.status || null,
    response: error.responseBody ? summarizeProperty24Payload(error.responseBody) : null,
  }, null, 2))
  process.exitCode = 1
})
