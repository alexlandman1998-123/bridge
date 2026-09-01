import { access, readFile } from 'node:fs/promises'

const ROUTE = 'api/cron/document-request-canonical-automation.js'
const REQUIRED_FILES = Object.freeze([
  'scripts/document-request-canonical-phase14-portal-verification.mjs',
  'scripts/document-request-canonical-phase15-operational-rollout.mjs',
  'scripts/document-request-canonical-phase16-automation.mjs',
])
const VERCEL_PROJECT_ROOT = 'the-it-guy'

const [routeSource, vercelSource] = await Promise.all([
  readFile(ROUTE, 'utf8'),
  readFile('vercel.json', 'utf8'),
])
const vercelConfig = JSON.parse(vercelSource)
const functionConfig = vercelConfig.functions?.[ROUTE]

if (!functionConfig) throw new Error(`${ROUTE} has no explicit Vercel function configuration.`)
if (!String(functionConfig.includeFiles || '').includes('src/**')) {
  throw new Error(`${ROUTE} must include its runtime-built source dependency graph.`)
}

for (const filePath of REQUIRED_FILES) {
  await access(filePath)
  const packagedPath = `${VERCEL_PROJECT_ROOT}/${filePath}`
  if (!String(functionConfig.includeFiles || '').includes(packagedPath)) {
    throw new Error(`${filePath} is not included in the deployed cron function.`)
  }
}

if (!String(functionConfig.includeFiles || '').includes(`${VERCEL_PROJECT_ROOT}/src/**`)) {
  throw new Error(`${ROUTE} must package source dependencies from the configured Vercel project root.`)
}

const configuredEntrypoint = routeSource.match(/const SCRIPT = ['"]([^'"]+)['"]/)?.[1]
if (!configuredEntrypoint || !REQUIRED_FILES.includes(configuredEntrypoint)) {
  throw new Error(`Cron entrypoint ${configuredEntrypoint || 'was not found'} is not in the deployment manifest.`)
}

console.log(JSON.stringify({
  status: 'passed',
  route: ROUTE,
  entrypoint: configuredEntrypoint,
  vercelProjectRoot: VERCEL_PROJECT_ROOT,
  includedOperationalScripts: REQUIRED_FILES,
}, null, 2))
