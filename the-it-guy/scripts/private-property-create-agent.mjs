import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  PRIVATE_PROPERTY_SANDBOX_BASE_URL,
  createPrivatePropertyClient,
  normalizePrivatePropertyText,
  summarizePrivatePropertySoapResponse,
} from '../server/services/privatePropertyClient.js'

const appRoot = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
  const options = {
    apply: false,
    output: null,
    sandboxUser: '',
    agentId: '',
    firstName: '',
    lastName: '',
    email: '',
    mobile: '',
    workPhone: '',
    homePhone: '',
    active: true,
    privysealAlias: '',
    privatePropertyAgentId: '',
    imageUrl: '',
  }

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true
    } else if (arg === '--inactive') {
      options.active = false
    } else if (arg.startsWith('--output=')) {
      options.output = normalizePrivatePropertyText(arg.slice('--output='.length))
    } else if (arg.startsWith('--sandbox-user=')) {
      options.sandboxUser = normalizePrivatePropertyText(arg.slice('--sandbox-user='.length))
    } else if (arg.startsWith('--agent-id=')) {
      options.agentId = normalizePrivatePropertyText(arg.slice('--agent-id='.length))
    } else if (arg.startsWith('--first-name=')) {
      options.firstName = normalizePrivatePropertyText(arg.slice('--first-name='.length))
    } else if (arg.startsWith('--last-name=')) {
      options.lastName = normalizePrivatePropertyText(arg.slice('--last-name='.length))
    } else if (arg.startsWith('--email=')) {
      options.email = normalizePrivatePropertyText(arg.slice('--email='.length))
    } else if (arg.startsWith('--mobile=')) {
      options.mobile = normalizePrivatePropertyText(arg.slice('--mobile='.length))
    } else if (arg.startsWith('--work-phone=')) {
      options.workPhone = normalizePrivatePropertyText(arg.slice('--work-phone='.length))
    } else if (arg.startsWith('--home-phone=')) {
      options.homePhone = normalizePrivatePropertyText(arg.slice('--home-phone='.length))
    } else if (arg.startsWith('--privyseal-alias=')) {
      options.privysealAlias = normalizePrivatePropertyText(arg.slice('--privyseal-alias='.length))
    } else if (arg.startsWith('--private-property-agent-id=')) {
      options.privatePropertyAgentId = normalizePrivatePropertyText(arg.slice('--private-property-agent-id='.length))
    } else if (arg.startsWith('--image-url=')) {
      options.imageUrl = normalizePrivatePropertyText(arg.slice('--image-url='.length))
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        if (separator === -1) return [line, '']
        return [line.slice(0, separator), line.slice(separator + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

function loadEnv() {
  const files = ['.env', '.env.local', '.env.private-property.local']
  const fromFiles = files.reduce((merged, file) => ({ ...merged, ...parseEnvFile(path.join(appRoot, file)) }), {})
  const processOverrides = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => normalizePrivatePropertyText(value)),
  )
  return { ...fromFiles, ...processOverrides }
}

function buildConfig() {
  const env = loadEnv()
  const baseUrl = normalizePrivatePropertyText(env.PRIVATE_PROPERTY_BASE_URL) || PRIVATE_PROPERTY_SANDBOX_BASE_URL
  const username = normalizePrivatePropertyText(env.PRIVATE_PROPERTY_USERNAME || env.PRIVATE_PROPERTY_USER_NAME)
  const password = normalizePrivatePropertyText(env.PRIVATE_PROPERTY_PASSWORD)
  const branchGuid = normalizePrivatePropertyText(env.PRIVATE_PROPERTY_BRANCH_GUID || env.PRIVATE_PROPERTY_GUID)
  const vendor = normalizePrivatePropertyText(env.PRIVATE_PROPERTY_VENDOR)
  const environment = normalizePrivatePropertyText(env.PRIVATE_PROPERTY_ENVIRONMENT || env.PRIVATE_PROPERTY_ENV || 'sandbox')
  const defaultImageUrl = normalizePrivatePropertyText(env.PRIVATE_PROPERTY_DEFAULT_AGENT_IMAGE_URL)

  const missing = []
  if (!username) missing.push('PRIVATE_PROPERTY_USERNAME')
  if (!password) missing.push('PRIVATE_PROPERTY_PASSWORD')
  if (!branchGuid) missing.push('PRIVATE_PROPERTY_BRANCH_GUID')

  return {
    baseUrl,
    username,
    password,
    branchGuid,
    vendor,
    environment,
    defaultImageUrl,
    missing,
  }
}

function applySandboxUserDefaults(options = {}) {
  const sandboxUser = normalizePrivatePropertyText(options.sandboxUser)
  if (!sandboxUser) return options
  const userNumber = sandboxUser === '2' ? '2' : '1'
  return {
    ...options,
    agentId: options.agentId || `ARCH9-SANDBOX-USER-${userNumber}`,
    firstName: options.firstName || 'User',
    lastName: options.lastName || (userNumber === '2' ? 'Two' : 'One'),
  }
}

function buildAgentPayload(options, config) {
  const withDefaults = applySandboxUserDefaults(options)
  const agent = {
    branchId: config.branchGuid,
    agentId: withDefaults.agentId,
    firstName: withDefaults.firstName,
    lastName: withDefaults.lastName,
    email: withDefaults.email,
    telCell: withDefaults.mobile,
    telWork: withDefaults.workPhone || withDefaults.mobile,
    telHome: withDefaults.homePhone,
    active: withDefaults.active,
    privysealAlias: withDefaults.privysealAlias,
    privatePropertyAgentId: withDefaults.privatePropertyAgentId,
  }
  const imageUrl = withDefaults.imageUrl || config.defaultImageUrl

  const missing = []
  if (!agent.agentId) missing.push('--agent-id')
  if (!agent.firstName) missing.push('--first-name')
  if (!agent.lastName) missing.push('--last-name')
  if (!agent.email) missing.push('--email')
  if (!agent.telCell) missing.push('--mobile')
  if (!agent.telWork) missing.push('--work-phone or --mobile')
  if (!agent.branchId) missing.push('PRIVATE_PROPERTY_BRANCH_GUID')

  return { agent, imageUrl, missing }
}

function createReport(config, agent, imageUrl, options) {
  return {
    phase: 'private-property-phase2-agent-setup',
    generatedAt: new Date().toISOString(),
    environment: config.environment,
    baseUrl: config.baseUrl,
    vendor: config.vendor || null,
    username: config.username || null,
    branchGuid: config.branchGuid || null,
    apply: Boolean(options.apply),
    credentialsConfigured: config.missing.length === 0,
    agent: {
      agentId: agent.agentId,
      firstName: agent.firstName,
      lastName: agent.lastName,
      email: agent.email,
      telCell: agent.telCell,
      telWork: agent.telWork,
      telHome: agent.telHome || null,
      active: agent.active,
      privysealAlias: agent.privysealAlias || null,
      privatePropertyAgentId: agent.privatePropertyAgentId || null,
      imageUrlConfigured: Boolean(imageUrl),
    },
    summary: {
      status: 'BLOCKED',
      passCount: 0,
      blockedCount: 0,
      skippedCount: 0,
    },
    checks: [],
    nextPhase: 'Phase 3: build the Private Property listing mapper preview once sandbox agents exist.',
  }
}

function writeReport(report, outputArg) {
  const output = outputArg || path.join(appRoot, 'outputs', 'private-property-create-agent.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  return output
}

async function runCheck(report, name, fn) {
  const startedAt = Date.now()
  try {
    const result = await fn()
    const check = {
      name,
      status: 'PASS',
      httpStatus: result.status,
      durationMs: result.durationMs ?? Date.now() - startedAt,
      summary: result.summary || summarizePrivatePropertySoapResponse(result.method || name, result.data || ''),
    }
    report.checks.push(check)
    report.summary.passCount += 1
    return check
  } catch (error) {
    const check = {
      name,
      status: 'BLOCKED',
      httpStatus: error.status || null,
      durationMs: Date.now() - startedAt,
      error: {
        name: error.name || 'Error',
        message: error.message,
        statusText: error.statusText || '',
        faultCode: error.faultCode || '',
        faultString: error.faultString || '',
        responseSummary: error.responseBody ? summarizePrivatePropertySoapResponse(name, error.responseBody) : null,
      },
    }
    report.checks.push(check)
    report.summary.blockedCount += 1
    return check
  }
}

function addSkippedCheck(report, name, reason) {
  report.checks.push({ name, status: 'SKIPPED', reason })
  report.summary.skippedCount += 1
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  const config = buildConfig()
  const { agent, imageUrl, missing } = buildAgentPayload(options, config)
  const report = createReport(config, agent, imageUrl, options)

  if (config.missing.length || missing.length) {
    report.missingConfiguration = config.missing
    report.missingArguments = missing
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({
      status: report.summary.status,
      output,
      missingConfiguration: config.missing,
      missingArguments: missing,
    }, null, 2))
    process.exitCode = 1
    return
  }

  if (!options.apply) {
    report.summary.status = 'DRY_RUN'
    addSkippedCheck(report, 'UpdateAgent SOAP write', 'Dry run only. Re-run with --apply to call Private Property.')
    if (imageUrl) addSkippedCheck(report, 'UpdateAgentImage SOAP write', 'Dry run only. Re-run with --apply to call Private Property.')
    const output = writeReport(report, options.output)
    console.log(JSON.stringify({
      status: report.summary.status,
      output,
      message: 'No Private Property write was made. Re-run with --apply to create/update the agent.',
      agent: report.agent,
    }, null, 2))
    return
  }

  const client = createPrivatePropertyClient({
    baseUrl: config.baseUrl,
    username: config.username,
    password: config.password,
  })

  await runCheck(report, 'UpdateAgent SOAP write', () => client.updateAgent(agent))

  if (imageUrl) {
    await runCheck(report, 'UpdateAgentImage SOAP write', () => client.updateAgentImage({ agent, imageUrl }))
  } else {
    addSkippedCheck(report, 'UpdateAgentImage SOAP write', 'No --image-url or PRIVATE_PROPERTY_DEFAULT_AGENT_IMAGE_URL supplied.')
  }

  report.summary.status = report.summary.blockedCount > 0 ? 'BLOCKED' : 'PASS'
  const output = writeReport(report, options.output)
  console.log(JSON.stringify({
    status: report.summary.status,
    output,
    agentId: agent.agentId,
    passCount: report.summary.passCount,
    blockedCount: report.summary.blockedCount,
    skippedCount: report.summary.skippedCount,
  }, null, 2))
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
