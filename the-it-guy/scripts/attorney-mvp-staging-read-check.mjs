// Read-only check using the actual attorney login and application service.
// Never logs credentials, tokens, or unrestricted matter contents.
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const env = Object.fromEntries(readFileSync('.env.staging.local', 'utf8').split(/\r?\n/)
  .filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')]
  }))
if (env.VITE_SUPABASE_URL !== 'https://vaszuxjeoajeuhlcnzzf.supabase.co') throw Error('Staging target required')
for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_KEY']) process.env[key] = env[key]
const server = await createServer({ configFile: false, envFile: false, logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { supabase } = await server.ssrLoadModule('/src/lib/supabaseClient.js')
  const { error } = await supabase.auth.signInWithPassword({ email: 'attorney.demo@arch9.co.za', password: env.ATTORNEY_DEMO_PASSWORD })
  if (error) throw Error(error.message)
  const { getAttorneyWorkflowOperationsForTransaction } = await server.ssrLoadModule('/src/services/attorneyWorkflow/attorneyWorkflowLaneService.js')
  const result = await getAttorneyWorkflowOperationsForTransaction('b27fc192-b5ff-471b-9da5-902409f78116', { initialize: false })
  console.log(JSON.stringify({ status: 'PASS', lanes: result.lanes.map(lane => ({ laneKey: lane.laneKey, steps: lane.steps.length, completed: lane.steps.filter(step => step.status === 'completed').length, progress: lane.summary.completionPercent, instruction: lane.steps.find(step => step.stepKey === 'instruction_received')?.status })) }))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await server.close()
  process.exit(process.exitCode || 0)
}
