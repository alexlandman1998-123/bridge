import { spawnSync } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'

const checks = [
  {
    key: 'ui_contract',
    label: 'Residential canvassing UI contract',
    command: npmCommand,
    args: ['run', 'test:residential-canvassing'],
  },
  {
    key: 'lifecycle',
    label: 'Residential canvassing lifecycle',
    command: npmCommand,
    args: ['run', 'test:residential-canvassing-lifecycle'],
  },
  {
    key: 'conversion',
    label: 'Conversion to lead',
    command: npmCommand,
    args: ['run', 'test:residential-canvassing-conversion'],
  },
  {
    key: 'performance_pull_through',
    label: 'Performance pull-through',
    command: npmCommand,
    args: ['run', 'test:residential-canvassing-performance'],
  },
  {
    key: 'durable_persistence',
    label: 'Canvassing durable persistence',
    command: process.execPath,
    args: ['scripts/canvassing-durable-persistence.test.mjs'],
  },
  {
    key: 'lead_requirements',
    label: 'Buyer qualification requirements',
    command: npmCommand,
    args: ['run', 'test:lead-requirements'],
  },
  {
    key: 'dashboard_telemetry',
    label: 'Dashboard performance telemetry',
    command: npmCommand,
    args: ['run', 'test:dashboard-performance-telemetry'],
  },
  {
    key: 'targeted_lint',
    label: 'Touched-file eslint',
    command: npxCommand,
    args: [
      'eslint',
      'src/pages/Agents.jsx',
      'src/modules/agency/agents/agentPerformanceUtils.js',
      'src/modules/agency/agents/principalAgentCommandCentreService.js',
      'scripts/principal-agent-command-centre.test.mjs',
      'scripts/residential-canvassing-conversion-to-lead.test.mjs',
      'scripts/residential-canvassing-lifecycle.test.mjs',
      'scripts/residential-canvassing.test.mjs',
      'scripts/residential-canvassing-launch-readiness.mjs',
    ],
  },
  {
    key: 'production_build',
    label: 'Production build',
    command: npmCommand,
    args: ['run', 'build'],
  },
  {
    key: 'performance_budget',
    label: 'Performance budget after build',
    command: npmCommand,
    args: ['run', 'test:performance-budget'],
  },
]

function summarizeOutput(value = '') {
  const text = String(value || '').trim()
  if (!text) return ''
  const lines = text.split('\n').map((line) => line.trimEnd()).filter(Boolean)
  return lines.slice(-20).join('\n')
}

const startedAt = new Date()
const results = []

for (const check of checks) {
  const checkStartedAt = Date.now()
  const result = spawnSync(check.command, check.args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  })
  const durationMs = Date.now() - checkStartedAt
  const output = `${result.stdout || ''}${result.stderr || ''}`
  results.push({
    key: check.key,
    label: check.label,
    status: result.status === 0 ? 'pass' : 'blocked',
    exitCode: result.status ?? 1,
    durationMs,
    output: result.status === 0 ? undefined : summarizeOutput(output),
  })
  if (result.status !== 0) break
}

const blockers = results.filter((item) => item.status !== 'pass')
const report = {
  phase: 5,
  scope: 'residential_canvassing_launch_readiness',
  status: blockers.length ? 'NO_GO' : 'GO',
  startedAt: startedAt.toISOString(),
  checkedAt: new Date().toISOString(),
  durationMs: Date.now() - startedAt.getTime(),
  mutatedData: false,
  blockerCount: blockers.length,
  checks: results.map(({ key, label, status, exitCode, durationMs }) => ({
    key,
    label,
    status,
    exitCode,
    durationMs,
  })),
  blockers: blockers.map(({ key, label, exitCode, output }) => ({
    key,
    label,
    exitCode,
    output,
  })),
}

console.log(JSON.stringify(report, null, 2))
if (blockers.length) process.exitCode = 1
