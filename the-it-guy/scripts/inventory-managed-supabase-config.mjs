#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = join(import.meta.dirname, '..', '..')
const productionRef = 'isdowlnollckzvltkasn'
const rehearsalRef = 'rlavzicedrilmpaamviu'

function run(args) {
  const result = spawnSync('supabase', args, { cwd: repoRoot, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr.trim() || `supabase ${args.join(' ')} failed`)
  return JSON.parse(result.stdout.slice(result.stdout.indexOf('{')))
}

const functionsDirectory = join(repoRoot, 'supabase', 'functions')
const sourceFunctions = readdirSync(functionsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name).sort()
const secretNames = [...new Set(
  readFileSync(join(repoRoot, 'supabase', 'config.toml'), 'utf8')
    .match(/(?:SUPABASE|RESEND|TWILIO|WHATSAPP|META|STRIPE|OPENAI)_[A-Z0-9_]+/g) || [],
)].sort()

const report = {
  version: 1,
  productionRef,
  rehearsalRef,
  sourceFunctions,
  productionFunctions: run(['functions', 'list', '--project-ref', productionRef, '--output', 'json']),
  productionSecretNames: run(['secrets', 'list', '--project-ref', productionRef, '--output', 'json']),
  requiredManualReviews: ['Auth providers and redirect URLs', 'Auth email/SMS templates', 'Storage buckets and policies', 'Cron jobs', 'Realtime publication/settings', 'application environment variables'],
  sourceSecretReferences: secretNames,
}
console.log(JSON.stringify(report, null, 2))
