import fs from 'node:fs'

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
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

function envValue(name, fallback = '') {
  return String(process.env[name] || fallback).replace(/^['"]|['"]$/g, '')
}

const env = {
  ...parseEnvFile('.env'),
  ...parseEnvFile('.env.staging.local'),
  ...process.env,
}

const supabaseUrl = envValue('SUPABASE_URL', env.SUPABASE_URL || env.VITE_SUPABASE_URL || '')
const serviceRoleKey = envValue('SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY || '')

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const response = await fetch(`${supabaseUrl}/rest/v1/`, {
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: 'application/openapi+json',
  },
})

if (!response.ok) {
  throw new Error(`OpenAPI fetch failed: ${response.status} ${await response.text()}`)
}

const spec = await response.json()
const paths = Object.keys(spec.paths || {})
const rpcPaths = paths.filter((path) => path.startsWith('/rpc/')).sort()

console.log(
  JSON.stringify(
    {
      rpcCount: rpcPaths.length,
      rpcPaths: rpcPaths.slice(0, 400),
      matchingPromotionPaths: rpcPaths.filter((path) => /seller|listing|promotion|promote|readiness|document/i.test(path)),
      matchingExecPaths: rpcPaths.filter((path) => /sql|exec|query|statement/i.test(path)),
      documentsColumns: Object.keys(spec?.components?.schemas?.documents?.properties || {}),
      privateListingDocumentsColumns: Object.keys(spec?.components?.schemas?.private_listing_documents?.properties || {}),
    },
    null,
    2,
  ),
)
