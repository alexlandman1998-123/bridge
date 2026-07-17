import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

function argumentValue(name) {
  const prefix = `${name}=`
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length).trim() || ''
}

export async function runAttorneyMatterNumberingReadiness({ client, firmId, strict = false } = {}) {
  if (!client) throw new Error('A Supabase client is required for the matter-number readiness assessment.')
  if (!firmId) throw new Error('An attorney firm is required. Pass --firm-id=<uuid> or set ATTORNEY_FIRM_ID.')

  let result
  try {
    result = await client.rpc('get_attorney_matter_numbering_readiness', {
      p_attorney_firm_id: firmId,
    })
  } catch (error) {
    throw new Error(`Matter-number readiness could not reach the environment: ${error?.cause?.code || error?.message || 'network_error'}`)
  }

  if (result.error) {
    const missingRpc = ['42883', 'PGRST202'].includes(String(result.error.code || '').toUpperCase())
    if (missingRpc) throw new Error('Phase 7 matter-number readiness is not deployed in this environment yet.')
    throw result.error
  }

  const report = Array.isArray(result.data) ? result.data[0] : result.data
  if (!report) throw new Error('The matter-number readiness assessment returned no result.')
  if (strict && report.strictReleaseReady !== true) process.exitCode = 1
  return report
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  const firmId = argumentValue('--firm-id') || process.env.ATTORNEY_FIRM_ID || ''
  if (!url || !serviceKey) {
    throw new Error('VITE_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for this read-only assessment.')
  }

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const assessment = await runAttorneyMatterNumberingReadiness({
    client,
    firmId,
    strict: process.argv.includes('--strict'),
  })
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), mutatedData: false, ...assessment }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.message || error)
    process.exitCode = 1
  })
}
