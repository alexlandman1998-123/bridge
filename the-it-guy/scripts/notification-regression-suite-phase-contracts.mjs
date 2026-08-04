import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')

export const notificationPhaseContractScripts = [
  'notification-automation-phase3.test.mjs',
  'transaction-roleplayer-notifications-phase4.test.mjs',
  'client-seller-offer-portal-notifications-phase5.test.mjs',
  'bond-attorney-legal-notifications-phase6.test.mjs',
  'weekly-digest-notifications-phase7.test.mjs',
  'commercial-enterprise-notifications-phase8.test.mjs',
  'notification-controls-observability-phase9.test.mjs',
  'notification-regression-release-hardening-phase10.test.mjs',
]

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const script of notificationPhaseContractScripts) {
    console.log(`\n[notification-phase-contracts] ${script}`)
    const result = spawnSync('node', [`scripts/${script}`], {
      cwd: appRoot,
      stdio: 'inherit',
      shell: false,
    })

    if (result.error) {
      console.error(`[notification-phase-contracts] failed to start ${script}:`, result.error)
      process.exit(1)
    }

    if (result.status !== 0) {
      console.error(`[notification-phase-contracts] failed: ${script}`)
      process.exit(result.status || 1)
    }
  }

  console.log('\nnotification phase contract checks passed')
}
