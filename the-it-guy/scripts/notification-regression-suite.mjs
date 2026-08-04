import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(appRoot, '..')

const commands = [
  {
    name: 'Deno typecheck for send-email functions',
    cwd: workspaceRoot,
    command: 'deno',
    args: [
      'check',
      '--config',
      'supabase/functions/send-email/deno.json',
      'supabase/functions/send-email/index.ts',
      'supabase/functions/send-email/handlers/*.ts',
      'supabase/functions/send-email/content/*.ts',
      'supabase/functions/send-email/services/*.ts',
      'supabase/functions/seller-portal-password-recovery/index.ts',
    ],
  },
  {
    name: 'Branded email render tests',
    cwd: workspaceRoot,
    command: 'deno',
    args: [
      'test',
      '--no-check',
      '--allow-read',
      'supabase/functions/send-email/content/bridgeEmailLayout.test.ts',
      'supabase/functions/send-email/content/brandedTemplates.test.ts',
      'supabase/functions/send-email/handlers/emailBrandingHandlers.test.ts',
    ],
  },
  {
    name: 'Reminder dispatch branded-shell test',
    cwd: workspaceRoot,
    command: 'deno',
    args: [
      'test',
      '--config',
      'supabase/functions/send-email/deno.json',
      '--allow-env',
      '--allow-net',
      'supabase/functions/send-email/handlers/notificationReminderDispatch.test.ts',
    ],
  },
  {
    name: 'Notification phase contract scripts',
    cwd: appRoot,
    command: 'node',
    args: [
      'scripts/notification-regression-suite-phase-contracts.mjs',
    ],
  },
  {
    name: 'Git whitespace check',
    cwd: workspaceRoot,
    command: 'git',
    args: ['diff', '--check'],
  },
]

for (const step of commands) {
  console.log(`\n[notification-regression-suite] ${step.name}`)
  const result = spawnSync(step.command, step.args, {
    cwd: step.cwd,
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    console.error(`[notification-regression-suite] failed to start ${step.command}:`, result.error)
    process.exit(1)
  }

  if (result.status !== 0) {
    console.error(`[notification-regression-suite] failed: ${step.name}`)
    process.exit(result.status || 1)
  }
}

console.log('\nnotification regression suite passed')
